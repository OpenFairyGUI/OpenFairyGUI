import type {
	UamAssetResource,
	UamComponentInstanceProperties,
	UamComponentProperties,
	UamControllerAction,
	UamControllerModel,
	UamDisplayNode,
	UamGearBinding,
	UamImageResourceProperties,
	UamProject,
	UamValidationIssue,
} from './model.js';

function pushIssue(issues: UamValidationIssue[], path: string, message: string): void {
	issues.push({ path, message });
}

export function isFiniteUamPoint(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false;
	const point = value as { x?: unknown; y?: unknown };
	return typeof point.x === 'number'
		&& Number.isFinite(point.x)
		&& typeof point.y === 'number'
		&& Number.isFinite(point.y);
}

function isFiniteUamSize(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false;
	const size = value as { width?: unknown; height?: unknown };
	return typeof size.width === 'number'
		&& Number.isFinite(size.width)
		&& typeof size.height === 'number'
		&& Number.isFinite(size.height);
}

function isFiniteUamEdgeInsets(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false;
	const insets = value as { top?: unknown; bottom?: unknown; left?: unknown; right?: unknown };
	return [insets.top, insets.bottom, insets.left, insets.right]
		.every((part) => typeof part === 'number' && Number.isFinite(part));
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
	const actual = Object.keys(value);
	return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

const IMAGE_RESOURCE_PROPERTY_KEYS = [
	'textureSetMode',
	'qualityOption',
	'quality',
	'smoothing',
	'duplicatePadding',
	'scaleOption',
	'scale9Grid',
	'tileGridIndice',
] as const satisfies readonly (keyof UamImageResourceProperties)[];

export function isValidUamImageResourceProperties(
	value: unknown,
): value is UamImageResourceProperties {
	if (typeof value !== 'object' || value === null || !hasExactKeys(value, IMAGE_RESOURCE_PROPERTY_KEYS)) return false;
	const properties = value as UamImageResourceProperties;
	if (typeof properties.textureSetMode !== 'string'
		|| typeof properties.qualityOption !== 'string'
		|| !Number.isInteger(properties.quality)
		|| properties.quality < 0
		|| properties.quality > 100
		|| typeof properties.smoothing !== 'boolean'
		|| typeof properties.duplicatePadding !== 'boolean'
		|| ![0, 1, 2].includes(properties.scaleOption)
		|| !Number.isInteger(properties.tileGridIndice)
		|| properties.tileGridIndice < 0
		|| properties.tileGridIndice > 31
	) {
		return false;
	}
	if (properties.scaleOption !== 1) return properties.scale9Grid === null;
	if (!Array.isArray(properties.scale9Grid)
		|| properties.scale9Grid.length !== 4
		|| !properties.scale9Grid.every(Number.isInteger)
	) {
		return false;
	}
	const [x, y, width, height] = properties.scale9Grid;
	return x >= 0 && y >= 0 && width > 0 && height > 0;
}

const COMPONENT_PROPERTY_KEYS = [
	'minSize',
	'maxSize',
	'pivot',
	'pivotAsAnchor',
	'overflow',
	'margin',
	'clipSoftness',
	'hitTest',
	'mask',
	'reversedMask',
	'scrollType',
	'scrollBarDisplay',
	'scrollBarFlags',
	'scrollBarMargin',
	'vtScrollBarRes',
	'hzScrollBarRes',
	'headerRes',
	'footerRes',
	'bgColor',
	'bgColorEnabled',
	'designImageAlpha',
	'designImageLayer',
	'designImageOffset',
	'idNum',
	'initName',
	'remark',
	'extensionType',
	'opaque',
	'buttonMode',
	'sound',
	'soundVolumeScale',
	'downEffect',
	'downEffectValue',
	'dropdown',
	'promptText',
	'selectionController',
	'titleType',
	'reverse',
	'wholeNumbers',
	'changeOnClick',
	'fixedGripSize',
	'customProperties',
] as const satisfies readonly (keyof UamComponentProperties)[];

export function isValidUamComponentProperties(value: unknown): value is UamComponentProperties {
	if (typeof value !== 'object' || value === null || !hasExactKeys(value, COMPONENT_PROPERTY_KEYS)) return false;
	const properties = value as UamComponentProperties;
	const strings = [
		properties.hitTest,
		properties.mask,
		properties.vtScrollBarRes,
		properties.hzScrollBarRes,
		properties.headerRes,
		properties.footerRes,
		properties.bgColor,
		properties.initName,
		properties.remark,
		properties.extensionType,
		properties.sound,
		properties.dropdown,
		properties.promptText,
		properties.selectionController,
	];
	const booleans = [
		properties.pivotAsAnchor,
		properties.reversedMask,
		properties.bgColorEnabled,
		properties.opaque,
		properties.reverse,
		properties.wholeNumbers,
		properties.changeOnClick,
		properties.fixedGripSize,
	];
	const numbers = [
		properties.overflow,
		properties.scrollType,
		properties.scrollBarDisplay,
		properties.scrollBarFlags,
		properties.designImageAlpha,
		properties.designImageLayer,
		properties.idNum,
		properties.buttonMode,
		properties.soundVolumeScale,
		properties.downEffect,
		properties.downEffectValue,
		properties.titleType,
	];
	return isFiniteUamSize(properties.minSize)
		&& isFiniteUamSize(properties.maxSize)
		&& isFiniteUamPoint(properties.pivot)
		&& isFiniteUamEdgeInsets(properties.margin)
		&& isFiniteUamPoint(properties.clipSoftness)
		&& isFiniteUamEdgeInsets(properties.scrollBarMargin)
		&& isFiniteUamPoint(properties.designImageOffset)
		&& strings.every((item) => typeof item === 'string')
		&& booleans.every((item) => typeof item === 'boolean')
		&& numbers.every((item) => typeof item === 'number' && Number.isFinite(item))
		&& Array.isArray(properties.customProperties)
		&& properties.customProperties.every((property) => (
			property
			&& typeof property === 'object'
			&& hasExactKeys(property, ['target', 'propertyId', 'label'])
			&& typeof property.target === 'string'
			&& (property.propertyId === 0 || property.propertyId === 1)
			&& typeof property.label === 'string'
		));
}

function isNullableString(value: unknown): boolean {
	return value === null || typeof value === 'string';
}

export function isValidUamComponentInstanceProperties(
	value: unknown,
): value is UamComponentInstanceProperties {
	if (typeof value !== 'object' || value === null || !('extensionType' in value)) return false;
	const properties = value as UamComponentInstanceProperties;
	const finite = (number: unknown) => typeof number === 'number' && Number.isFinite(number);
	switch (properties.extensionType) {
		case 'Button':
			return hasExactKeys(properties, [
				'extensionType', 'title', 'selectedTitle', 'icon', 'selectedIcon', 'titleColor',
				'titleFontSize', 'controller', 'page', 'checked', 'sound', 'soundVolumeScale',
			])
				&& [
					properties.title, properties.selectedTitle, properties.icon, properties.selectedIcon,
					properties.titleColor, properties.controller, properties.page, properties.sound,
				].every((item) => typeof item === 'string')
				&& finite(properties.titleFontSize)
				&& typeof properties.checked === 'boolean'
				&& finite(properties.soundVolumeScale);
		case 'Label':
			return hasExactKeys(properties, [
				'extensionType', 'title', 'icon', 'titleColor', 'titleFontSize', 'promptText',
			])
				&& [properties.title, properties.icon, properties.titleColor, properties.promptText]
					.every((item) => typeof item === 'string')
				&& finite(properties.titleFontSize);
		case 'ComboBox':
			return hasExactKeys(properties, [
				'extensionType', 'title', 'icon', 'visibleItemCount', 'selectionController', 'items',
			])
				&& [properties.title, properties.icon, properties.selectionController]
					.every((item) => typeof item === 'string')
				&& finite(properties.visibleItemCount)
				&& Array.isArray(properties.items)
				&& properties.items.every((item) => (
					item
					&& typeof item === 'object'
					&& hasExactKeys(item, ['title', 'value', 'icon'])
					&& isNullableString(item.title)
					&& isNullableString(item.value)
					&& isNullableString(item.icon)
				));
		case 'ProgressBar':
		case 'Slider':
			return hasExactKeys(properties, ['extensionType', 'value', 'max', 'min'])
				&& [properties.value, properties.max, properties.min].every(finite);
		case 'ScrollBar':
			return hasExactKeys(properties, ['extensionType']);
		default:
			return false;
	}
}

function validateControllerAction(
	action: UamControllerAction,
	knownPageIds: Set<string>,
	knownChildIds: Set<string>,
	path: string,
	issues: UamValidationIssue[],
): void {
	for (const pageId of action.fromPageIds) {
		if (!knownPageIds.has(pageId)) {
			pushIssue(issues, `${path}.fromPageIds`, `Unknown controller page id "${pageId}".`);
		}
	}
	for (const pageId of action.toPageIds) {
		if (!knownPageIds.has(pageId)) {
			pushIssue(issues, `${path}.toPageIds`, `Unknown controller page id "${pageId}".`);
		}
	}
	if (action.targetNodeId && !knownChildIds.has(action.targetNodeId)) {
		pushIssue(issues, `${path}.targetNodeId`, `Unknown target node id "${action.targetNodeId}".`);
	}
}

function validateGearBinding(
	gear: UamGearBinding,
	controllerMap: Map<string, UamControllerModel>,
	path: string,
	issues: UamValidationIssue[],
): void {
	const controller = controllerMap.get(gear.controllerName);
	if (!controller) {
		pushIssue(issues, `${path}.controllerName`, `Unknown gear controller "${gear.controllerName}".`);
		return;
	}

	const pageIds = new Set(controller.pages.map((page) => page.id));
	if (gear.kind === 'display' || gear.kind === 'display2') {
		const seen = new Set<string>();
		for (const pageId of gear.visibleOnPageIds) {
			if (seen.has(pageId)) pushIssue(issues, `${path}.visibleOnPageIds`, `Duplicate gear page id "${pageId}".`);
			seen.add(pageId);
		}
		return;
	}

	const seen = new Set<string>();
	for (const state of gear.states) {
		if (!pageIds.has(state.pageId)) pushIssue(issues, `${path}.states`, `Unknown gear state page id "${state.pageId}".`);
		if (seen.has(state.pageId)) pushIssue(issues, `${path}.states`, `Duplicate gear state page id "${state.pageId}".`);
		seen.add(state.pageId);
	}
}

function isSafePathSegment(value: string): boolean {
	return value.length > 0 && value !== '.' && value !== '..' && !/[\\/:]/.test(value);
}

function normalizedResourceTarget(path: string, fileName: string): string | null {
	if (!isSafePathSegment(fileName)) return null;
	const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
	if (segments.some((segment) => !isSafePathSegment(segment))) return null;
	return [...segments, fileName].join('/');
}

function isSafeRelativePath(value: string): boolean {
	const segments = value.replace(/\\/g, '/').split('/').filter(Boolean);
	return segments.length > 0 && segments.every(isSafePathSegment);
}

function assetFileName(resource: UamAssetResource): string {
	return resource.fileName || (resource.kind === 'image' ? '' : resource.file) || resource.name;
}

function validatePackageOutputTargets(
	pkg: UamProject['packages'][number],
	pkgPath: string,
	issues: UamValidationIssue[],
): void {
	if (!isSafePathSegment(pkg.name)) {
		pushIssue(issues, `${pkgPath}.name`, `Invalid package output name "${pkg.name}".`);
	}
	const outputs = new Map<string, string>();
	for (const [resourceIndex, resource] of pkg.resources.entries()) {
		const resourcePath = `${pkgPath}.resources[${resourceIndex}]`;
		if (resource.branch && !isSafePathSegment(resource.branch)) {
			pushIssue(issues, `${resourcePath}.branch`, `Invalid package branch name "${resource.branch}".`);
		}
		const fileName = resource.kind === 'component' ? `${resource.name}.xml` : assetFileName(resource);
		const target = normalizedResourceTarget(resource.path, fileName);
		if (!target) {
			pushIssue(issues, `${resourcePath}.path`, 'Resource output path must be package-relative and traversal-free.');
			continue;
		}
		const descriptor = resource.branch ? 'package_branch.xml' : 'package.xml';
		if (target === descriptor) {
			pushIssue(issues, `${resourcePath}.path`, `Resource output "${target}" conflicts with the package descriptor.`);
		}
		const key = `${resource.branch}\0${target}`;
		const previous = outputs.get(key);
		if (previous) {
			pushIssue(issues, `${resourcePath}.path`, `Resource output "${target}" conflicts with ${previous}.`);
		} else {
			outputs.set(key, resourcePath);
		}
		if (resource.kind !== 'component' && resource.sourcePath && !isSafeRelativePath(resource.sourcePath)) {
			pushIssue(issues, `${resourcePath}.sourcePath`, 'Resource sourcePath must be package-relative and traversal-free.');
		}
	}
}

function validateDisplayNode(
	node: UamDisplayNode,
	controllerMap: Map<string, UamControllerModel>,
	knownChildIds: Set<string>,
	path: string,
	issues: UamValidationIssue[],
): void {
	if (node.pivot !== undefined) {
		if (!isFiniteUamPoint(node.pivot)) {
			pushIssue(issues, `${path}.pivot`, 'Display node pivot must contain finite x and y numbers.');
		}
	}
	if (node.pivotAsAnchor !== undefined) {
		if (typeof node.pivotAsAnchor !== 'boolean') {
			pushIssue(issues, `${path}.pivotAsAnchor`, 'Display node pivotAsAnchor must be boolean.');
		}
	}
	for (const [gearIndex, gear] of node.gears.entries()) {
		validateGearBinding(gear, controllerMap, `${path}.gears[${gearIndex}]`, issues);
	}
	for (const [relationIndex, relation] of node.relations.entries()) {
		if (relation.targetNodeId && !knownChildIds.has(relation.targetNodeId)) {
			pushIssue(issues, `${path}.relations[${relationIndex}]`, `Unknown relation target node id "${relation.targetNodeId}".`);
		}
	}
}

export function validateUamProject(project: UamProject): UamValidationIssue[] {
	const issues: UamValidationIssue[] = [];
	const packageIds = new Set<string>();
	const packageNames = new Set<string>();

	for (const [pkgIndex, pkg] of project.packages.entries()) {
		const pkgPath = `packages[${pkgIndex}]`;
		if (packageIds.has(pkg.id)) pushIssue(issues, `${pkgPath}.id`, `Duplicate package id "${pkg.id}".`);
		if (packageNames.has(pkg.name)) pushIssue(issues, `${pkgPath}.name`, `Duplicate package name "${pkg.name}".`);
		packageIds.add(pkg.id);
		packageNames.add(pkg.name);
		validatePackageOutputTargets(pkg, pkgPath, issues);

		const resourceIds = new Set<string>();
		for (const [resourceIndex, resource] of pkg.resources.entries()) {
			const resourcePath = `${pkgPath}.resources[${resourceIndex}]`;
			if (resourceIds.has(resource.id)) pushIssue(issues, `${resourcePath}.id`, `Duplicate resource id "${resource.id}".`);
			resourceIds.add(resource.id);
			if (typeof resource.favorite !== 'boolean') {
				pushIssue(issues, `${resourcePath}.favorite`, 'Resource favorite must be boolean.');
			}
			if (resource.kind === 'image' && !isValidUamImageResourceProperties(resource.image)) {
				pushIssue(issues, `${resourcePath}.image`, 'Image resource properties must be a complete valid property snapshot.');
			}

			if (resource.kind !== 'component') continue;

			const component = resource.component;
			if (!isValidUamComponentProperties(component.properties)) {
				pushIssue(issues, `${resourcePath}.component.properties`, 'Component properties must be a complete valid property snapshot.');
			}
			const childIds = new Set<string>();
			for (const [childIndex, child] of component.displayList.entries()) {
				const childPath = `${resourcePath}.component.displayList[${childIndex}]`;
				if (childIds.has(child.id)) pushIssue(issues, `${childPath}.id`, `Duplicate child id "${child.id}".`);
				childIds.add(child.id);
			}

			const controllerMap = new Map<string, UamControllerModel>();
			for (const [controllerIndex, controller] of component.controllers.entries()) {
				const controllerPath = `${resourcePath}.component.controllers[${controllerIndex}]`;
				if (controllerMap.has(controller.name)) pushIssue(issues, `${controllerPath}.name`, `Duplicate controller name "${controller.name}".`);
				controllerMap.set(controller.name, controller);

				const pageIds = new Set<string>();
				for (const [pageIndex, page] of controller.pages.entries()) {
					const pagePath = `${controllerPath}.pages[${pageIndex}]`;
					if (pageIds.has(page.id)) pushIssue(issues, `${pagePath}.id`, `Duplicate controller page id "${page.id}".`);
					pageIds.add(page.id);
				}

				for (const [actionIndex, action] of controller.actions.entries()) {
					validateControllerAction(action, pageIds, childIds, `${controllerPath}.actions[${actionIndex}]`, issues);
				}
			}

			for (const [childIndex, child] of component.displayList.entries()) {
				if (child.kind === 'component'
					&& child.instanceProperties !== undefined
					&& !isValidUamComponentInstanceProperties(child.instanceProperties)
				) {
					pushIssue(
						issues,
						`${resourcePath}.component.displayList[${childIndex}].instanceProperties`,
						'Component instance properties must be a complete valid extension snapshot.',
					);
				}
				validateDisplayNode(child, controllerMap, childIds, `${resourcePath}.component.displayList[${childIndex}]`, issues);
			}
		}
	}

	return issues;
}

export function assertValidUamProject(project: UamProject): void {
	const issues = validateUamProject(project);
	if (issues.length === 0) return;
	throw new Error(`UAM validation failed:\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`);
}
