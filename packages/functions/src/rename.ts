import { GearType, type Document, type Transform } from '@openfairygui/core';
import { assertSafeOutputFileName } from './path-utils.js';
import { createTransform } from './utils.js';

export interface RenameOptions {
	/** Package name to rename from. Required. */
	packageName: string;
	/** Resource name to rename from. Required. */
	resourceName: string;
	/** New name for the resource. Required. */
	newName: string;
	/** If true, also update `fileName` and name-based `ui://PackageName/ResourceName` references. Default: true. */
	updateReferences?: boolean;
}

interface RenameableResource {
	propertyType: string;
	getId(): string;
	getName(): string;
	setName(v: string): unknown;
	getPath?(): string;
	getBranch?(): string;
	getFileName?(): string;
	setFileName?(v: string): unknown;
	getFile?(): string;
	setFile?(v: string): unknown;
}

function preserveExtension(newName: string, existingFile: string | undefined): string {
	if (!existingFile) return newName;
	const newDot = newName.lastIndexOf('.');
	if (newDot > 0) return newName;
	const oldDot = existingFile.lastIndexOf('.');
	if (oldDot <= 0) return newName;
	return `${newName}${existingFile.slice(oldDot)}`;
}

function replaceNamedUrl(value: string, oldNamedUrl: string, newNamedUrl: string): string {
	return value.includes(oldNamedUrl) ? value.replaceAll(oldNamedUrl, newNamedUrl) : value;
}

/**
 * Renames a resource (including persisted fileName/file fields) and optionally
 * updates `fileName` attributes and name-based `ui://PackageName/ResourceName` references.
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

		const safeNewName = assertSafeOutputFileName(options.newName, 'resource name');
		const resources = pkg.listResources() as unknown as RenameableResource[];
		const resource = resources.find((r) => r.getName() === options.resourceName);

		if (!resource) {
			logger.warn(`rename: Resource "${options.resourceName}" not found in package "${options.packageName}".`);
			return;
		}

		const targetPath = resource.getPath?.() ?? '/';
		const targetBranch = resource.getBranch?.() ?? '';
		const collision = resources.find(
			(candidate) =>
				candidate !== resource &&
				candidate.getName() === safeNewName &&
				(candidate.getPath?.() ?? '/') === targetPath &&
				(candidate.getBranch?.() ?? '') === targetBranch,
		);
		if (collision) {
			throw new Error(
				`rename: Resource "${safeNewName}" already exists in package "${options.packageName}" at path "${targetPath}".`,
			);
		}

		const oldName = resource.getName();
		const resourceId = resource.getId();
		const ownerPackageId = pkg.getId();
		const normalizedDir = targetPath.replace(/^\/+/, '');
		let newFileNameForDisplay =
			resource.propertyType === 'Component'
				? `${normalizedDir}${safeNewName.endsWith('.xml') ? safeNewName : `${safeNewName}.xml`}`
				: `${normalizedDir}${safeNewName}`;

		resource.setName(safeNewName);
		switch (resource.propertyType) {
			case 'ImageResource':
			case 'FontResource':
			case 'MovieClipResource': {
				const updatedFile = preserveExtension(safeNewName, resource.getFileName?.());
				resource.setFileName?.(updatedFile);
				newFileNameForDisplay = `${normalizedDir}${updatedFile}`;
				break;
			}
			case 'SoundResource':
			case 'MiscResource':
			case 'SwfResource':
			case 'SpineResource':
			case 'DragonBonesResource': {
				const updatedFile = preserveExtension(safeNewName, resource.getFile?.());
				resource.setFile?.(updatedFile);
				newFileNameForDisplay = `${normalizedDir}${updatedFile}`;
				break;
			}
			default:
				break;
		}
		logger.info(`rename: Renamed "${oldName}" → "${safeNewName}" in package "${options.packageName}".`);

		if (updateReferences && oldName !== safeNewName) {
			const oldNamedUrl = `ui://${pkg.getName()}/${oldName}`;
			const newNamedUrl = `ui://${pkg.getName()}/${safeNewName}`;
			let updatedCount = 0;

			for (const candidatePkg of root.listPackages()) {
				const candidatePkgId = candidatePkg.getId();
				for (const comp of candidatePkg.listComponents()) {
					for (const child of comp.listChildren()) {
						const anyChild = child as unknown as {
							getSrc?(): string;
							getPackageId?(): string;
							getFileName?(): string;
							setFileName?(v: string): unknown;
							getUrl?(): string;
							setUrl?(v: string): unknown;
							getDefaultItem?(): string;
							setDefaultItem?(v: string): unknown;
							getIcon?(): string;
							setIcon?(v: string): unknown;
							getSelectedIcon?(): string;
							setSelectedIcon?(v: string): unknown;
							getDropdown?(): string;
							setDropdown?(v: string): unknown;
							getSound?(): string;
							setSound?(v: string): unknown;
							getInstanceSound?(): string;
							setInstanceSound?(v: string): unknown;
							getInstanceIcon?(): string;
							setInstanceIcon?(v: string): unknown;
							getInstanceSelectedIcon?(): string;
							setInstanceSelectedIcon?(v: string): unknown;
							getText?(): string;
							setText?(v: string): unknown;
							getFont?(): string;
							setFont?(v: string): unknown;
						};

						const src = anyChild.getSrc?.();
						const childPkgId = anyChild.getPackageId?.()?.trim() || candidatePkgId;
						if (src === resourceId && childPkgId === ownerPackageId && anyChild.getFileName?.()) {
							anyChild.setFileName?.(newFileNameForDisplay);
							updatedCount++;
						}

						const stringPairs: Array<[(() => string) | undefined, ((v: string) => unknown) | undefined]> = [
							[anyChild.getUrl, anyChild.setUrl],
							[anyChild.getDefaultItem, anyChild.setDefaultItem],
							[anyChild.getIcon, anyChild.setIcon],
							[anyChild.getSelectedIcon, anyChild.setSelectedIcon],
							[anyChild.getDropdown, anyChild.setDropdown],
							[anyChild.getSound, anyChild.setSound],
							[anyChild.getInstanceSound, anyChild.setInstanceSound],
							[anyChild.getInstanceIcon, anyChild.setInstanceIcon],
							[anyChild.getInstanceSelectedIcon, anyChild.setInstanceSelectedIcon],
							[anyChild.getText, anyChild.setText],
							[anyChild.getFont, anyChild.setFont],
						];
						for (const [getter, setter] of stringPairs) {
							if (!getter || !setter) continue;
							const current = getter.call(anyChild);
							if (typeof current === 'string' && current.includes(oldNamedUrl)) {
								setter.call(anyChild, replaceNamedUrl(current, oldNamedUrl, newNamedUrl));
								updatedCount++;
							}
						}

						for (const gear of child.listGears()) {
							const def = gear.getDefaultValue();
							if (typeof def === 'string' && def.includes(oldNamedUrl)) {
								gear.setDefaultValue(replaceNamedUrl(def, oldNamedUrl, newNamedUrl));
								updatedCount++;
							}
							if (gear.getGearType() === GearType.Text || gear.getGearType() === GearType.Icon) {
								const pageValues = gear.getPageValues();
								let pageChanged = false;
								const nextValues: Record<string, string | null> = {};
								for (const [page, val] of Object.entries(pageValues)) {
									if (typeof val === 'string' && val.includes(oldNamedUrl)) {
										nextValues[page] = replaceNamedUrl(val, oldNamedUrl, newNamedUrl);
										pageChanged = true;
										updatedCount++;
									} else {
										nextValues[page] = val;
									}
								}
								if (pageChanged) gear.setPageValues(nextValues);
							} else {
								const values = gear.getValues();
								if (typeof values === 'string' && values.includes(oldNamedUrl)) {
									gear.setValues(replaceNamedUrl(values, oldNamedUrl, newNamedUrl));
									updatedCount++;
								}
							}
						}
					}
				}
			}
			logger.info(`rename: Updated ${updatedCount} reference(s).`);
		}
	});
}
