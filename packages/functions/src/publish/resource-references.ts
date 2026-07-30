import type { Component, Package } from '@openfairygui/core';
import type { HasOptionalFont } from '../shared-types.js';

interface ReferenceItem {
	icon?: string | null;
	url?: string | null;
}

interface ReferenceGear {
	getValues?(): string;
	getDefaultValue?(): unknown;
}

interface ReferenceTransitionItem {
	getStartValue?(): unknown;
	getEndValue?(): unknown;
}

interface ReferenceTransition {
	listItems?(): ReferenceTransitionItem[];
}

interface ReferenceChild extends HasOptionalFont {
	getPackageId?(): string;
	getSrc?(): string;
	getUrl?(): string;
	getInstanceSound?(): string;
	getDefaultItem?(): string;
	getIcon?(): string;
	getSelectedIcon?(): string;
	getDropdown?(): string;
	getSound?(): string;
	getText?(): string;
	getInstanceIcon?(): string;
	getInstanceSelectedIcon?(): string;
	getVtScrollBarRes?(): string;
	getHzScrollBarRes?(): string;
	getHeaderRes?(): string;
	getFooterRes?(): string;
	getInstanceComboItems?(): Array<{ icon: string | null }>;
	getListItems?(): ReferenceItem[];
	listGears?(): ReferenceGear[];
}

interface ReferenceComponent {
	listChildren(): ReferenceChild[];
	getDropdown?(): string;
	getHeaderRes?(): string;
	getFooterRes?(): string;
	getVtScrollBarRes?(): string;
	getHzScrollBarRes?(): string;
	getSound?(): string;
	getFont?(): string | string[] | null | undefined;
	listTransitions?(): ReferenceTransition[];
}

export interface PackageResourceReferences {
	localResourceIds: Set<string>;
	packageIds: Set<string>;
}

function addReference(
	target: PackageResourceReferences,
	ownerPackageId: string,
	packageId: string,
	resourceId: string,
): void {
	if (!packageId || !resourceId) return;
	if (packageId === ownerPackageId) target.localResourceIds.add(resourceId);
	else target.packageIds.add(packageId);
}

function addUiReference(
	target: PackageResourceReferences,
	ownerPackageId: string,
	value: string | null | undefined,
): void {
	if (!value?.startsWith('ui://')) return;
	const reference = value.slice(5);
	const slashIndex = reference.indexOf('/');
	if (slashIndex >= 0) {
		addReference(target, ownerPackageId, reference.slice(0, slashIndex), reference.slice(slashIndex + 1));
		return;
	}
	if (reference.length > 8) {
		addReference(target, ownerPackageId, reference.slice(0, 8), reference.slice(8));
	}
}

function addTextReferences(
	target: PackageResourceReferences,
	ownerPackageId: string,
	value: string | null | undefined,
): void {
	if (!value) return;
	for (const match of value.matchAll(/ui:\/\/([0-9a-z]{8})\/?([0-9a-z]+)/giu)) {
		addReference(target, ownerPackageId, match[1] ?? '', match[2] ?? '');
	}
}

function addUnknownReferences(
	target: PackageResourceReferences,
	ownerPackageId: string,
	value: unknown,
): void {
	if (Array.isArray(value)) {
		for (const entry of value) addUnknownReferences(target, ownerPackageId, entry);
		return;
	}
	if (typeof value === 'string') {
		addUiReference(target, ownerPackageId, value);
		addTextReferences(target, ownerPackageId, value);
	}
}

function addFontReferences(
	target: PackageResourceReferences,
	ownerPackageId: string,
	value: string | string[] | null | undefined,
): void {
	if (Array.isArray(value)) {
		for (const entry of value) addUiReference(target, ownerPackageId, entry);
		return;
	}
	addUiReference(target, ownerPackageId, value);
}

function collectComponentReferences(
	target: PackageResourceReferences,
	ownerPackageId: string,
	component: Component,
): void {
	const referenceComponent = component as Component & ReferenceComponent;
	for (const child of referenceComponent.listChildren()) {
		const sourceId = child.getSrc?.();
		if (sourceId) {
			if (sourceId.startsWith('ui://')) addUiReference(target, ownerPackageId, sourceId);
			else target.localResourceIds.add(sourceId);
		}
		const sourcePackageId = child.getPackageId?.()?.trim();
		if (sourcePackageId && sourcePackageId !== ownerPackageId) target.packageIds.add(sourcePackageId);

		addFontReferences(target, ownerPackageId, child.getFont?.());
		addTextReferences(target, ownerPackageId, child.getText?.());
		for (const reference of [
			child.getUrl?.(),
			child.getDefaultItem?.(),
			child.getIcon?.(),
			child.getSelectedIcon?.(),
			child.getDropdown?.(),
			child.getSound?.(),
			child.getInstanceSound?.(),
			child.getInstanceIcon?.(),
			child.getInstanceSelectedIcon?.(),
			child.getVtScrollBarRes?.(),
			child.getHzScrollBarRes?.(),
			child.getHeaderRes?.(),
			child.getFooterRes?.(),
		]) {
			addUiReference(target, ownerPackageId, reference);
		}
		for (const item of child.getInstanceComboItems?.() ?? []) {
			addUiReference(target, ownerPackageId, item.icon);
		}
		for (const item of child.getListItems?.() ?? []) {
			addUiReference(target, ownerPackageId, item.icon);
			addUiReference(target, ownerPackageId, item.url);
		}
		for (const gear of child.listGears?.() ?? []) {
			addUnknownReferences(target, ownerPackageId, gear.getValues?.());
			addUnknownReferences(target, ownerPackageId, gear.getDefaultValue?.());
		}
	}

	addFontReferences(target, ownerPackageId, referenceComponent.getFont?.());
	for (const reference of [
		referenceComponent.getDropdown?.(),
		referenceComponent.getHeaderRes?.(),
		referenceComponent.getFooterRes?.(),
		referenceComponent.getVtScrollBarRes?.(),
		referenceComponent.getHzScrollBarRes?.(),
		referenceComponent.getSound?.(),
	]) {
		addUiReference(target, ownerPackageId, reference);
	}
	for (const transition of referenceComponent.listTransitions?.() ?? []) {
		for (const item of transition.listItems?.() ?? []) {
			addUnknownReferences(target, ownerPackageId, item.getStartValue?.());
			addUnknownReferences(target, ownerPackageId, item.getEndValue?.());
		}
	}
}

/**
 * Enumerates package-local resource IDs and external package IDs referenced by
 * component content. Callers retain policy decisions such as atlas selection
 * and dependency ordering.
 */
export function collectPackageResourceReferences(pkg: Package): PackageResourceReferences {
	const references: PackageResourceReferences = {
		localResourceIds: new Set<string>(),
		packageIds: new Set<string>(),
	};
	for (const resource of pkg.listResources()) {
		if (resource.propertyType === 'Component') {
			collectComponentReferences(references, pkg.getId(), resource);
		}
	}
	return references;
}
