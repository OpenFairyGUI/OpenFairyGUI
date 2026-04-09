import type { Document, Transform } from '@openfairygui/core';
import { createTransform } from './utils.js';
import type { HasOptionalSrc } from './shared-types.js';

/**
 * Severity of a validation issue.
 */
export enum ValidationSeverity {
	ERROR = 'error',
	WARNING = 'warning',
	INFO = 'info',
}

/**
 * A single validation issue found in the project.
 */
export interface ValidationIssue {
	severity: ValidationSeverity;
	message: string;
	/** Package name where the issue was found. */
	packageName?: string;
	/** Component name where the issue was found. */
	componentName?: string;
	/** Resource/object name related to the issue. */
	resourceName?: string;
}

/**
 * Result returned by `validate()`.
 */
export interface ValidationResult {
	ok: boolean;
	errors: ValidationIssue[];
	warnings: ValidationIssue[];
	infos: ValidationIssue[];
}

export interface ValidateOptions {
	/** If true, the transform throws on errors. Default: false. */
	throwOnError?: boolean;
}

const VALIDATE_DEFAULTS: Required<ValidateOptions> = {
	throwOnError: false,
};

/**
 * Validates a FairyGUI project for common issues:
 * - Missing resource IDs
 * - Broken `ui://` references (src pointing to non-existent resources)
 * - Empty components (no children)
 * - Controllers with no pages
 * - Duplicate resource IDs within a package
 *
 * The validation result is stored in `doc.getRoot().getExtras()._validation`.
 *
 * ```ts
 * await doc.transform(validate({ throwOnError: true }));
 * ```
 */
export function validate(_options: ValidateOptions = {}): Transform {
	const options = { ...VALIDATE_DEFAULTS, ..._options };

	return createTransform('validate', (doc: Document): void => {
		const issues: ValidationIssue[] = [];
		const root = doc.getRoot();

		if (!root.getProjectId()) {
			issues.push({
				severity: ValidationSeverity.WARNING,
				message: 'Project has no ID.',
			});
		}

		// Build global resource ID map for cross-reference validation
		const globalResources = new Map<string, string>(); // id → "pkg/name"

		for (const pkg of root.listPackages()) {
			if (!pkg.getId()) {
				issues.push({
					severity: ValidationSeverity.ERROR,
					message: `Package "${pkg.getName()}" has no ID.`,
					packageName: pkg.getName(),
				});
			}

			// Check for duplicate resource IDs within the package
			const idSet = new Set<string>();
			for (const res of pkg.listResources()) {
				const resId = res.getId();
				if (!resId) {
					issues.push({
						severity: ValidationSeverity.WARNING,
						message: `Resource "${res.getName()}" has no ID.`,
						packageName: pkg.getName(),
						resourceName: res.getName(),
					});
					continue;
				}
				if (idSet.has(resId)) {
					issues.push({
						severity: ValidationSeverity.ERROR,
						message: `Duplicate resource ID "${resId}" in package "${pkg.getName()}".`,
						packageName: pkg.getName(),
						resourceName: res.getName(),
					});
				}
				idSet.add(resId);
				globalResources.set(`${pkg.getId()}${resId}`, `${pkg.getName()}/${res.getName()}`);
			}

			// Validate components
			for (const comp of pkg.listComponents()) {
				const children = comp.listChildren();
				if (children.length === 0) {
					issues.push({
						severity: ValidationSeverity.INFO,
						message: `Component "${comp.getName()}" has no children.`,
						packageName: pkg.getName(),
						componentName: comp.getName(),
					});
				}

				for (const ctrl of comp.listControllers()) {
					if (ctrl.listPages().length === 0) {
						issues.push({
							severity: ValidationSeverity.WARNING,
							message: `Controller "${ctrl.getName()}" in "${comp.getName()}" has no pages.`,
							packageName: pkg.getName(),
							componentName: comp.getName(),
						});
					}
				}

				// Validate src references in display objects
				for (const child of children) {
					const src = (child as HasOptionalSrc).getSrc?.();
					if (!src) continue;

					// ui://[8-char-packageId][resourceId] format
					if (src.startsWith('ui://')) {
						const idPart = src.slice(5);
						if (idPart.length > 8) {
							const pkgId = idPart.slice(0, 8);
							const resId = idPart.slice(8);
							const key = `${pkgId}${resId}`;
							if (!globalResources.has(key)) {
								issues.push({
									severity: ValidationSeverity.ERROR,
									message: `Broken reference "${src}" in "${child.getName()}" (component "${comp.getName()}").`,
									packageName: pkg.getName(),
									componentName: comp.getName(),
									resourceName: child.getName(),
								});
							}
						}
					}
				}
			}
		}

		// Store result
		const errors = issues.filter((i) => i.severity === ValidationSeverity.ERROR);
		const warnings = issues.filter((i) => i.severity === ValidationSeverity.WARNING);
		const infos = issues.filter((i) => i.severity === ValidationSeverity.INFO);

		const result: ValidationResult = {
			ok: errors.length === 0,
			errors,
			warnings,
			infos,
		};

		root.setExtras({ ...root.getExtras(), _validation: result });

		// Log summary
		const logger = doc.getLogger();
		if (errors.length) logger.warn(`validate: ${errors.length} error(s) found.`);
		if (warnings.length) logger.warn(`validate: ${warnings.length} warning(s) found.`);
		logger.info(`validate: ${issues.length} issue(s) total.`);

		if (options.throwOnError && errors.length > 0) {
			throw new Error(`Validation failed with ${errors.length} error(s):\n${errors.map((e) => `  - ${e.message}`).join('\n')}`);
		}
	});
}
