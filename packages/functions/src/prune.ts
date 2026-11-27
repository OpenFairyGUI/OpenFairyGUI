import { type Component, type Document, type Package, type Transform, parseURL } from '@openfairygui/core';
import { collectPackageResourceReferences } from './publish/resource-references.js';
import type { RootProjectSettings } from './shared-types.js';
import { createTransform } from './utils.js';

export interface PruneOptions {
	/** Remove components with no children (only if also unreferenced and unexported). Default: false. */
	emptyComponents?: boolean;
	/** Remove unreferenced resources (images, sounds, fonts, movieclips, etc. not referenced anywhere). Default: true. */
	unusedResources?: boolean;
}

const PRUNE_DEFAULTS: Required<PruneOptions> = {
	emptyComponents: false,
	unusedResources: true,
};

type PackageResource = ReturnType<Package['listResources']>[number];

interface PruneResourceShape {
	propertyType: string;
	getId(): string;
	getName(): string;
	getPath?(): string;
	getBranch?(): string;
	getExported?(): boolean;
	getTextureId?(): string;
	listGlyphs?(): Array<{ getImg?(): string }>;
	getRequireIds?(): string[];
	getFileName?(): string;
	getFile?(): string;
	dispose(): void;
}

function refKey(packageId: string, resourceId: string): string {
	return `${packageId}:${resourceId}`;
}

function resolveUiRef(doc: Document, url: string | null | undefined): { packageId: string; resourceId: string } | null {
	if (!url || !url.startsWith('ui://')) return null;
	const parsed = parseURL(url);
	if (parsed) return parsed;
	const body = url.slice(5);
	const slashIndex = body.indexOf('/');
	if (slashIndex <= 0) return null;
	const pkgToken = body.slice(0, slashIndex);
	const resToken = body.slice(slashIndex + 1);
	if (!resToken) return null;
	const root = doc.getRoot();
	const pkg =
		root.getPackageById(pkgToken) ?? root.listPackages().find((candidate) => candidate.getName() === pkgToken);
	if (!pkg) return null;
	const res =
		pkg.getResourceById(resToken) ?? pkg.listResources().find((candidate) => candidate.getName() === resToken);
	if (!res) return null;
	return { packageId: pkg.getId(), resourceId: res.getId() };
}

function addUiUrlToSet(doc: Document, target: Set<string>, value: unknown): void {
	if (Array.isArray(value)) {
		for (const item of value) addUiUrlToSet(doc, target, item);
		return;
	}
	if (typeof value !== 'string' || !value.includes('ui://')) return;
	const direct = resolveUiRef(doc, value);
	if (direct) target.add(refKey(direct.packageId, direct.resourceId));
	for (const match of value.matchAll(/ui:\/\/([^\s"'<>[\]]+)/giu)) {
		const resolved = resolveUiRef(doc, `ui://${match[1] ?? ''}`);
		if (resolved) target.add(refKey(resolved.packageId, resolved.resourceId));
	}
}

function collectAllReferencedResources(doc: Document): Set<string> {
	const root = doc.getRoot();
	const referenced = new Set<string>();

	// 1. Project-level common settings references (scrollbars, tooltips, default fonts, etc.)
	const settings = (root.getSettings?.() ?? {}) as RootProjectSettings;
	if (settings.common && typeof settings.common === 'object') {
		for (const value of Object.values(settings.common)) {
			addUiUrlToSet(doc, referenced, value);
		}
	}

	// 2. All component references across all packages (local, cross-package, named ui://, gears, transitions, etc.)
	for (const pkg of root.listPackages()) {
		const pkgId = pkg.getId();
		const pkgRefs = collectPackageResourceReferences(pkg, doc, { exportedOnly: false, includeBranches: true });
		for (const localId of pkgRefs.localResourceIds) {
			referenced.add(refKey(pkgId, localId));
		}
		for (const comp of pkg.listComponents()) {
			const designImage = (comp as Component & { getDesignImage?(): string }).getDesignImage?.();
			addUiUrlToSet(doc, referenced, designImage);
			const hitTest = (comp as Component & { getHitTest?(): string }).getHitTest?.();
			if (hitTest) {
				const hitId = hitTest.split(',')[0]?.trim();
				if (hitId) referenced.add(refKey(pkgId, hitId));
			}
			for (const child of comp.listChildren()) {
				const anyChild = child as unknown as {
					getSrc?(): string;
					getPackageId?(): string;
					getUrl?(): string;
					getDefaultItem?(): string;
					getIcon?(): string;
					getSelectedIcon?(): string;
					getDropdown?(): string;
					getSound?(): string;
					getFont?(): string | string[];
					getText?(): string;
					getInstanceSound?(): string;
					getInstanceIcon?(): string;
					getInstanceSelectedIcon?(): string;
					getVtScrollBarRes?(): string;
					getHzScrollBarRes?(): string;
					getHeaderRes?(): string;
					getFooterRes?(): string;
					getInstanceComboItems?(): Array<{ icon?: string | null }>;
					getListItems?(): Array<{
						icon?: string | null;
						selectedIcon?: string | null;
						url?: string | null;
						propertyOverrides?: Array<{ value: string }>;
					}>;
					getPropertyOverrides?(): Array<{ value: string }>;
					listGears?(): Array<{
						getValues?(): string;
						getPageValues?(): Record<string, string | null>;
						getDefaultValue?(): string | null;
					}>;
				};
				const src = anyChild.getSrc?.();
				if (src) {
					if (src.startsWith('ui://')) {
						addUiUrlToSet(doc, referenced, src);
					} else {
						const targetPkgId = anyChild.getPackageId?.()?.trim() || pkgId;
						referenced.add(refKey(targetPkgId, src));
					}
				}
				for (const field of [
					anyChild.getUrl?.(),
					anyChild.getDefaultItem?.(),
					anyChild.getIcon?.(),
					anyChild.getSelectedIcon?.(),
					anyChild.getDropdown?.(),
					anyChild.getSound?.(),
					anyChild.getFont?.(),
					anyChild.getText?.(),
					anyChild.getInstanceSound?.(),
					anyChild.getInstanceIcon?.(),
					anyChild.getInstanceSelectedIcon?.(),
					anyChild.getVtScrollBarRes?.(),
					anyChild.getHzScrollBarRes?.(),
					anyChild.getHeaderRes?.(),
					anyChild.getFooterRes?.(),
				]) {
					addUiUrlToSet(doc, referenced, field);
				}
				for (const item of anyChild.getInstanceComboItems?.() ?? []) {
					addUiUrlToSet(doc, referenced, item.icon);
				}
				for (const item of anyChild.getListItems?.() ?? []) {
					addUiUrlToSet(doc, referenced, item.icon);
					addUiUrlToSet(doc, referenced, item.selectedIcon);
					addUiUrlToSet(doc, referenced, item.url);
					for (const override of item.propertyOverrides ?? []) addUiUrlToSet(doc, referenced, override.value);
				}
				for (const override of anyChild.getPropertyOverrides?.() ?? []) {
					addUiUrlToSet(doc, referenced, override.value);
				}
				for (const gear of anyChild.listGears?.() ?? []) {
					addUiUrlToSet(doc, referenced, gear.getValues?.());
					addUiUrlToSet(doc, referenced, Object.values(gear.getPageValues?.() ?? {}));
					addUiUrlToSet(doc, referenced, gear.getDefaultValue?.());
				}
			}
			for (const transition of comp.listTransitions()) {
				for (const item of transition.listItems()) {
					addUiUrlToSet(doc, referenced, item.getStartValue());
					addUiUrlToSet(doc, referenced, item.getEndValue());
				}
			}
		}
	}

	// 3. Transitive resource-to-resource dependencies (Font texture/glyphs, Spine/DragonBones requireIds, high-res & branch variants)
	let changed = true;
	while (changed) {
		changed = false;
		for (const pkg of root.listPackages()) {
			const pkgId = pkg.getId();
			const resources = pkg.listResources() as unknown as PruneResourceShape[];
			const liveVariantKeys = new Set<string>();
			for (const res of resources) {
				const id = res.getId();
				const isLive = Boolean(res.getExported?.()) || referenced.has(refKey(pkgId, id));
				if (!isLive) continue;
				const baseName = (res.getFileName?.() ?? res.getFile?.() ?? res.getName()).replace(
					/@[234]x(?=\.[^.]+$)/iu,
					'',
				);
				liveVariantKeys.add(`${res.propertyType}|${res.getPath?.() ?? ''}|${baseName}`);
				liveVariantKeys.add(`${res.propertyType}|${res.getPath?.() ?? ''}|${res.getName()}`);

				if (res.propertyType === 'FontResource') {
					const textureId = res.getTextureId?.();
					if (textureId && !referenced.has(refKey(pkgId, textureId))) {
						referenced.add(refKey(pkgId, textureId));
						changed = true;
					}
					for (const glyph of res.listGlyphs?.() ?? []) {
						const imgId = glyph.getImg?.();
						if (imgId && !referenced.has(refKey(pkgId, imgId))) {
							referenced.add(refKey(pkgId, imgId));
							changed = true;
						}
					}
				}
				for (const reqId of res.getRequireIds?.() ?? []) {
					if (reqId && !referenced.has(refKey(pkgId, reqId))) {
						referenced.add(refKey(pkgId, reqId));
						changed = true;
					}
				}
			}
			// Retain branch overrides and @2x/@3x/@4x variants of any live resource.
			for (const res of resources) {
				const id = res.getId();
				if (referenced.has(refKey(pkgId, id))) continue;
				const rawFile = res.getFileName?.() ?? res.getFile?.() ?? res.getName();
				const stripped = rawFile.replace(/@[234]x(?=\.[^.]+$)/iu, '');
				const keyByFile = `${res.propertyType}|${res.getPath?.() ?? ''}|${stripped}`;
				const keyByName = `${res.propertyType}|${res.getPath?.() ?? ''}|${res.getName()}`;
				if (
					(Boolean(res.getBranch?.()) || stripped !== rawFile) &&
					(liveVariantKeys.has(keyByFile) || liveVariantKeys.has(keyByName))
				) {
					referenced.add(refKey(pkgId, id));
					changed = true;
				}
			}
		}
	}

	return referenced;
}

/**
 * Removes unreferenced resources from the project.
 *
 * By default, removes non-component resources that are not exported and not
 * referenced by any component, gear, transition, font, skeleton, or project setting.
 *
 * ```ts
 * await doc.transform(prune());
 * await doc.transform(prune({ emptyComponents: true }));
 * ```
 */
export function prune(_options: PruneOptions = {}): Transform {
	const options = { ...PRUNE_DEFAULTS, ..._options };

	return createTransform('prune', (doc: Document): void => {
		const root = doc.getRoot();
		const logger = doc.getLogger();
		let pruned = 0;

		if (options.emptyComponents) {
			let removedInPass = true;
			while (removedInPass) {
				removedInPass = false;
				const referenced = collectAllReferencedResources(doc);
				for (const pkg of root.listPackages()) {
					const pkgId = pkg.getId();
					for (const comp of [...pkg.listComponents()]) {
						const compId = comp.getId();
						if (
							comp.listChildren().length === 0 &&
							!comp.getExported() &&
							!referenced.has(refKey(pkgId, compId))
						) {
							comp.dispose();
							pruned++;
							removedInPass = true;
						}
					}
				}
			}
		}

		if (options.unusedResources) {
			const referenced = collectAllReferencedResources(doc);
			for (const pkg of root.listPackages()) {
				const pkgId = pkg.getId();
				for (const res of [...pkg.listResources()] as Array<PackageResource & PruneResourceShape>) {
					if (res.propertyType === 'Component') continue;
					const resId = res.getId();
					if (resId && !referenced.has(refKey(pkgId, resId)) && !res.getExported?.()) {
						res.dispose();
						pruned++;
					}
				}
			}
		}

		logger.info(`prune: Removed ${pruned} unused resource(s).`);
	});
}
