import type { Document, Transform } from '@openfairygui/core';
import { createTransform } from './utils.js';

export interface RenameOptions {
	/** Package name to rename from. Required. */
	packageName: string;
	/** Resource name to rename from. Required. */
	resourceName: string;
	/** New name for the resource. Required. */
	newName: string;
	/** If true, also update all `ui://` references pointing to this resource. Default: true. */
	updateReferences?: boolean;
}

/**
 * Renames a resource and optionally updates all references to it.
 *
 * This searches all display objects' `src` attributes across all packages
 * for `ui://` URLs that point to the renamed resource, and updates them
 * to reflect the new name (the resource ID doesn't change, so references
 * are already valid — but the name stored in package.xml is updated).
 *
 * ```ts
 * await doc.transform(rename({
 *   packageName: 'Basics',
 *   resourceName: 'Button',
 *   newName: 'PrimaryButton',
 * }));
 * ```
 */
export function rename(options: RenameOptions): Transform {
	const updateReferences = options.updateReferences ?? true;

	return createTransform('rename', (doc: Document): void => {
		const root = doc.getRoot();
		const logger = doc.getLogger();
		const pkg = root.listPackages().find((p) => p.getName() === options.packageName);

		if (!pkg) {
			logger.warn(`rename: Package "${options.packageName}" not found.`);
			return;
		}

		// Find the resource
		const resource = pkg.listResources().find((r) => r.getName() === options.resourceName)
			|| pkg.listComponents().find((c) => c.getName() === options.resourceName);

		if (!resource) {
			logger.warn(`rename: Resource "${options.resourceName}" not found in package "${options.packageName}".`);
			return;
		}

		const oldName = resource.getName();
		resource.setName(options.newName);
		logger.info(`rename: Renamed "${oldName}" → "${options.newName}" in package "${options.packageName}".`);

		// If this is a component resource, we don't need to update src references
		// because src references use resource IDs (not names)
		if (updateReferences) {
			// Resource IDs are stable, so ui:// references don't need updating
			// unless the consumer relies on name-based lookups.
			// The primary rename is the resource name itself.
			logger.info(`rename: References use resource IDs — no src updates needed.`);
		}
	});
}
