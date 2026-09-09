import pinyin from 'tiny-pinyin';
import type { Component, Document, GComponent, GObject, Package } from '@openfairygui/core';
import type { ResolvedPackageCodegenPlan } from './codegen-settings.js';

export interface CodegenMember {
	index: number;
	kind: 'child' | 'controller' | 'transition';
	name: string;
	originalName: string;
	type: string;
	ignored: boolean;
	referencedComponent?: CodegenReferencedComponent;
}

export interface CodegenReferencedComponent {
	component: Component;
	package: Package;
}

export interface CodegenClass {
	classId: string;
	className: string;
	encodedClassName: string;
	componentType: string;
	componentName: string;
	packageName: string;
	url: string;
	members: CodegenMember[];
}

export function buildCodegenClasses(doc: Document, pkg: Package, plan: ResolvedPackageCodegenPlan): CodegenClass[] {
	const codegenComponents = pkg.listComponents().sort((left, right) => left.getId().localeCompare(right.getId()));
	const generatedById = new Map<string, CodegenClass>();
	const usedClassNames = new Set([plan.binderClassName.toLowerCase()]);

	for (const component of codegenComponents) {
		const encodedClassName = claimName(`${plan.settings.classNamePrefix}${normalizeTypeName(component.getName()) || 'Component'}`, usedClassNames, true);
		generatedById.set(component.getId(), {
			classId: component.getId(),
			className: component.getName(),
			encodedClassName,
			componentType: resolveComponentBaseType(component),
			componentName: component.getName(),
			packageName: pkg.getName(),
			url: `ui://${pkg.getId()}${component.getId()}`,
			members: [],
		});
	}

	for (const component of codegenComponents) {
		const classInfo = generatedById.get(component.getId());
		if (!classInfo) continue;
		classInfo.members = buildCodegenMembers(doc, pkg, component, plan, generatedById);
	}

	for (const [componentId, classInfo] of generatedById) {
		if (classInfo.members.every((member) => member.ignored)) {
			generatedById.delete(componentId);
		}
	}

	for (const component of codegenComponents) {
		const classInfo = generatedById.get(component.getId());
		if (!classInfo) continue;
		classInfo.members = buildCodegenMembers(doc, pkg, component, plan, generatedById);
	}

	return [...generatedById.values()];
}

function buildCodegenMembers(
	doc: Document,
	pkg: Package,
	component: Component,
	plan: ResolvedPackageCodegenPlan,
	generatedById: Map<string, CodegenClass>,
): CodegenMember[] {
	const members: CodegenMember[] = [];
	const ownerType = resolveComponentBaseType(component);
	let controllerIndex = 0;
	let childIndex = 0;
	let transitionIndex = 0;

	for (const controller of component.listControllers()) {
		members.push(createMember(ownerType, 'controller', 'Controller', controller.getName(), controllerIndex++, plan));
	}

	for (const child of component.listChildren()) {
		if (!isRuntimeChild(child)) continue;
		const index = childIndex++;
		const resolvedChild = resolveChildType(doc, pkg, child, generatedById);
		members.push(createMember(
			ownerType,
			'child',
			resolvedChild.type,
			child.getName(),
			index,
			plan,
			resolvedChild.referencedComponent,
		));
	}

	for (const transition of component.listTransitions()) {
		members.push(createMember(ownerType, 'transition', 'Transition', transition.getName(), transitionIndex++, plan));
	}

	const usedNames = new Set<string>();
	for (const member of members) {
		if (member.ignored) continue;
		member.name = claimName(member.name, usedNames);
	}

	return members;
}

function isRuntimeChild(child: GObject): boolean {
	return child.propertyType !== 'GGroup' || (child as GObject & { getAdvanced?(): boolean }).getAdvanced?.() === true;
}

function createMember(
	ownerType: string,
	kind: CodegenMember['kind'],
	type: string,
	originalName: string,
	index: number,
	plan: ResolvedPackageCodegenPlan,
	referencedComponent?: CodegenReferencedComponent,
): CodegenMember {
	const ignored = plan.settings.ignoreNoname && isDefaultMemberName(ownerType, kind, originalName);
	return {
		index,
		kind,
		name: applyMemberNamePrefix(originalName, plan.settings.memberNamePrefix),
		originalName,
		type,
		ignored,
		referencedComponent,
	};
}

interface ResolvedChildCodegenType {
	type: string;
	referencedComponent?: CodegenReferencedComponent;
}

function resolveChildType(
	doc: Document,
	pkg: Package,
	child: GObject,
	generatedById: Map<string, CodegenClass>,
): ResolvedChildCodegenType {
	const src = (child as GObject & { getSrc?(): string }).getSrc?.();
	if (src) {
		let referencedComponent: CodegenReferencedComponent | null = null;
		if (src.startsWith('ui://')) {
			const rest = src.slice(5);
			const pkgId = rest.slice(0, 8);
			const resourceId = rest.slice(8);
			const targetPackage = doc.getRoot().listPackages().find((candidate) => candidate.getId() === pkgId);
			const targetResource = targetPackage?.getResourceById(resourceId);
			if (targetPackage && targetResource?.propertyType === 'Component') {
				referencedComponent = { component: targetResource, package: targetPackage };
			}
		} else {
			const packageId = (child as GComponent & { getPackageId?(): string }).getPackageId?.();
			const targetPackage = packageId
				? doc.getRoot().listPackages().find((candidate) => candidate.getId() === packageId)
				: pkg;
			const targetResource = targetPackage?.getResourceById(src);
			if (targetPackage && targetResource?.propertyType === 'Component') {
				referencedComponent = { component: targetResource, package: targetPackage };
			}
		}

		if (referencedComponent) {
			const localGeneratedClass = referencedComponent.package === pkg
				? generatedById.get(referencedComponent.component.getId())
				: undefined;
			return {
				type: localGeneratedClass?.encodedClassName ?? resolveComponentBaseType(referencedComponent.component),
				referencedComponent,
			};
		}
	}

	const instanceExtType = (child as GComponent & { getInstanceExtType?(): string }).getInstanceExtType?.();
	if (instanceExtType) return { type: `G${instanceExtType}` };

	return { type: child.propertyType };
}

function resolveComponentBaseType(component: Component): string {
	const extensionType = component.getExtensionType();
	return extensionType ? `G${extensionType}` : 'GComponent';
}

function isDefaultMemberName(ownerType: string, kind: CodegenMember['kind'], name: string): boolean {
	if (kind === 'controller') {
		return (ownerType === 'GButton' || ownerType === 'GComboBox') && name === 'button';
	}
	if (kind === 'transition') return false;

	if (ownerType === 'GButton' || ownerType === 'GLabel' || ownerType === 'GComboBox') {
		if (name === 'title' || name === 'icon') return true;
	}
	if (ownerType === 'GProgressBar') {
		if (name === 'bar' || name === 'bar_v' || name === 'title' || name === 'ani') return true;
	}
	if (ownerType === 'GSlider') {
		if (name === 'bar' || name === 'bar_v' || name === 'grip' || name === 'title' || name === 'ani') return true;
	}
	return /^n\d+(?:_.*)?$/i.test(name);
}

function applyMemberNamePrefix(name: string, prefix: string): string {
	const normalized = normalizeMemberName(name) || 'member';
	return prefix ? `${prefix}${normalized}` : normalized;
}

function claimName(base: string, used: Set<string>, ignoreCase = false): string {
	let name = base, suffix = 2;
	while (used.has(ignoreCase ? name.toLowerCase() : name)) name = `${base}_${suffix++}`;
	used.add(ignoreCase ? name.toLowerCase() : name);
	return name;
}

function transliterateName(value: string): string {
	return pinyin.parse(value).map((token) => token.type === 2
		? token.target.charAt(0) + token.target.slice(1).toLowerCase() : token.source).join('');
}

function normalizeMemberName(value: string): string {
	const cleaned = transliterateName(value).replace(/[^0-9A-Za-z_]+/g, '_').replace(/^_+|_+$/g, '');
	if (!cleaned) return '';
	return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

export function normalizeTypeName(value: string): string {
	const cleaned = transliterateName(value).replace(/[^0-9A-Za-z_]+/g, '_').replace(/^_+|_+$/g, '');
	if (!cleaned) return '';
	const parts = cleaned.split(/_+/).filter(Boolean);
	const normalized = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
	return /^[0-9]/.test(normalized) ? `_${normalized}` : normalized;
}

