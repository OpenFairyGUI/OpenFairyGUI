import type {
	UamAssetResource,
	UamComponentInstanceProperties,
	UamComponentPropertyOverride,
	UamComponentProperties,
	UamControllerAction,
	UamControllerModel,
	UamDisplayNode,
	UamGearBinding,
	UamImageProperties,
	UamImageResourceProperties,
	UamMovieClipProperties,
	UamMovieClipResourceProperties,
	UamPlainTextProperties,
	UamProject,
	UamTextProperties,
	UamValidationIssue,
} from './model.js';
import { normalizeResourceFolderPath, resourceFolderParentPath } from '../utils/resource-folder.js';

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

export function isValidUamComponentPropertyOverride(
	value: unknown,
): value is UamComponentPropertyOverride {
	if (!value || typeof value !== 'object' || !hasExactKeys(value, ['target', 'propertyId', 'value'])) return false;
	const property = value as UamComponentPropertyOverride;
	return typeof property.target === 'string'
		&& property.target.length > 0
		&& Number.isSafeInteger(property.propertyId)
		&& property.propertyId >= 0
		&& typeof property.value === 'string';
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

const MOVIE_CLIP_RESOURCE_PROPERTY_KEYS = [
	'interval',
	'repeatDelay',
	'swing',
	'smoothing',
	'frames',
] as const satisfies readonly (keyof UamMovieClipResourceProperties)[];

const MOVIE_CLIP_FRAME_KEYS = [
	'rectX',
	'rectY',
	'rectWidth',
	'rectHeight',
	'addDelay',
	'spriteId',
] as const satisfies readonly (keyof UamMovieClipResourceProperties['frames'][number])[];

export function isValidUamMovieClipResourceProperties(
	value: unknown,
): value is UamMovieClipResourceProperties {
	if (typeof value !== 'object' || value === null || !hasExactKeys(value, MOVIE_CLIP_RESOURCE_PROPERTY_KEYS)) return false;
	const properties = value as UamMovieClipResourceProperties;
	if (!Number.isInteger(properties.interval) || properties.interval < 0
		|| !Number.isInteger(properties.repeatDelay) || properties.repeatDelay < 0
		|| typeof properties.swing !== 'boolean'
		|| typeof properties.smoothing !== 'boolean'
		|| !Array.isArray(properties.frames)
	) {
		return false;
	}
	return properties.frames.every((frame) => (
		typeof frame === 'object'
		&& frame !== null
		&& hasExactKeys(frame, MOVIE_CLIP_FRAME_KEYS)
		&& [frame.rectX, frame.rectY, frame.rectWidth, frame.rectHeight, frame.addDelay].every(Number.isInteger)
		&& frame.rectWidth >= 0
		&& frame.rectHeight >= 0
		&& frame.addDelay >= 0
		&& typeof frame.spriteId === 'string'
	));
}

const TEXT_PROPERTY_KEYS = [
	'text',
	'font',
	'fontSize',
	'color',
	'align',
	'vAlign',
	'leading',
	'letterSpacing',
	'autoSize',
	'singleLine',
	'autoClearText',
	'outlineSoftness',
	'underlaySoftness',
	'ubbEnabled',
	'underline',
	'italic',
	'bold',
	'strikethrough',
	'strokeColor',
	'strokeSize',
	'shadowColor',
	'shadowOffset',
] as const satisfies readonly (keyof UamTextProperties)[];

const PLAIN_TEXT_PROPERTY_KEYS = [
	...TEXT_PROPERTY_KEYS,
	'demoText',
	'templateVarsEnabled',
	'faceDilate',
] as const satisfies readonly (keyof UamPlainTextProperties)[];

type UamTextNodeKind = Extract<UamDisplayNode['kind'], 'text' | 'richText' | 'textInput'>;

function isTextColor(value: unknown): value is string {
	return typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value);
}

export function isValidUamTextProperties(
	value: unknown,
	nodeKind: UamTextNodeKind,
): value is UamTextProperties | UamPlainTextProperties {
	const keys = nodeKind === 'richText' ? TEXT_PROPERTY_KEYS : PLAIN_TEXT_PROPERTY_KEYS;
	if (typeof value !== 'object' || value === null || !hasExactKeys(value, keys)) return false;
	const properties = value as UamPlainTextProperties;
	const commonValid = [properties.text, properties.font].every((item) => typeof item === 'string')
		&& Number.isInteger(properties.fontSize)
		&& properties.fontSize > 0
		&& isTextColor(properties.color)
		&& Number.isInteger(properties.align)
		&& properties.align >= 0
		&& properties.align <= 2
		&& Number.isInteger(properties.vAlign)
		&& properties.vAlign >= 0
		&& properties.vAlign <= 2
		&& Number.isInteger(properties.leading)
		&& Number.isInteger(properties.letterSpacing)
		&& Number.isInteger(properties.autoSize)
		&& properties.autoSize >= 0
		&& properties.autoSize <= 4
		&& [
			properties.singleLine,
			properties.autoClearText,
			properties.ubbEnabled,
			properties.underline,
			properties.italic,
			properties.bold,
			properties.strikethrough,
		].every((item) => typeof item === 'boolean')
		&& typeof properties.outlineSoftness === 'number'
		&& Number.isFinite(properties.outlineSoftness)
		&& typeof properties.underlaySoftness === 'number'
		&& Number.isFinite(properties.underlaySoftness)
		&& typeof properties.strokeSize === 'number'
		&& Number.isFinite(properties.strokeSize)
		&& properties.strokeSize >= 0
		&& (
			properties.strokeColor === null
				? properties.strokeSize === 1
				: isTextColor(properties.strokeColor)
		)
		&& isFiniteUamPoint(properties.shadowOffset)
		&& (
			properties.shadowColor === null
				? properties.shadowOffset.x === 0 && properties.shadowOffset.y === 0
				: isTextColor(properties.shadowColor)
		);
	if (!commonValid || nodeKind === 'richText') return commonValid;
	return typeof properties.demoText === 'string'
		&& typeof properties.templateVarsEnabled === 'boolean'
		&& typeof properties.faceDilate === 'number'
		&& Number.isFinite(properties.faceDilate);
}

function textPropertiesFromNode(
	node: Extract<UamDisplayNode, { kind: UamTextNodeKind }>,
): UamTextProperties | UamPlainTextProperties {
	const common: UamTextProperties = {
		text: node.text,
		font: node.font,
		fontSize: node.fontSize,
		color: node.color,
		align: node.align,
		vAlign: node.vAlign,
		leading: node.leading,
		letterSpacing: node.letterSpacing,
		autoSize: node.autoSize,
		singleLine: node.singleLine,
		autoClearText: node.autoClearText,
		outlineSoftness: node.outlineSoftness,
		underlaySoftness: node.underlaySoftness,
		ubbEnabled: node.ubbEnabled,
		underline: node.underline,
		italic: node.italic,
		bold: node.bold,
		strikethrough: node.strikethrough,
		strokeColor: node.strokeColor,
		strokeSize: node.strokeSize,
		shadowColor: node.shadowColor,
		shadowOffset: node.shadowOffset,
	};
	if (node.kind === 'richText') return common;
	return {
		...common,
		demoText: node.demoText,
		templateVarsEnabled: node.templateVarsEnabled,
		faceDilate: node.faceDilate,
	};
}

const IMAGE_PROPERTY_KEYS = [
	'color',
	'flip',
	'fillMethod',
	'fillOrigin',
	'fillClockwise',
	'fillAmount',
] as const satisfies readonly (keyof UamImageProperties)[];

export function isValidUamImageProperties(value: unknown): value is UamImageProperties {
	if (typeof value !== 'object' || value === null || !hasExactKeys(value, IMAGE_PROPERTY_KEYS)) return false;
	const properties = value as UamImageProperties;
	return isTextColor(properties.color)
		&& Number.isInteger(properties.flip) && properties.flip >= 0 && properties.flip <= 3
		&& Number.isInteger(properties.fillMethod) && properties.fillMethod >= 0 && properties.fillMethod <= 5
		&& Number.isInteger(properties.fillOrigin) && properties.fillOrigin >= 0 && properties.fillOrigin <= 3
		&& typeof properties.fillClockwise === 'boolean'
		&& typeof properties.fillAmount === 'number' && Number.isFinite(properties.fillAmount)
		&& (properties.fillMethod === 0
			? properties.fillOrigin === 0 && properties.fillClockwise && properties.fillAmount === 100
			: properties.fillAmount >= 0 && properties.fillAmount <= 1);
}

const MOVIE_CLIP_PROPERTY_KEYS = [
	'playing',
	'frame',
	'color',
] as const satisfies readonly (keyof UamMovieClipProperties)[];

export function isValidUamMovieClipProperties(value: unknown): value is UamMovieClipProperties {
	if (typeof value !== 'object' || value === null || !hasExactKeys(value, MOVIE_CLIP_PROPERTY_KEYS)) return false;
	const properties = value as UamMovieClipProperties;
	return typeof properties.playing === 'boolean'
		&& Number.isInteger(properties.frame) && properties.frame >= 0
		&& isTextColor(properties.color);
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
	'autoClearItems',
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
		properties.autoClearItems,
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

function isSoundReference(value: unknown): value is string {
	return typeof value === 'string'
		&& (value === '' || (value.startsWith('ui://') && value.length > 5 && !/\s/.test(value)));
}

function isSoundVolume(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
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
				&& isSoundReference(properties.sound)
				&& isSoundVolume(properties.soundVolumeScale);
		case 'Label':
			return hasExactKeys(properties, [
				'extensionType', 'title', 'icon', 'titleColor', 'titleFontSize', 'promptText',
				'sound', 'soundVolumeScale',
			])
				&& [properties.title, properties.icon, properties.promptText]
					.every((item) => typeof item === 'string')
				&& (properties.titleColor === '' || isTextColor(properties.titleColor))
				&& finite(properties.titleFontSize)
				&& isSoundReference(properties.sound)
				&& isSoundVolume(properties.soundVolumeScale);
		case 'ComboBox':
			return hasExactKeys(properties, [
				'extensionType', 'title', 'icon', 'titleColor', 'popupDirection', 'sound', 'soundVolumeScale',
				'visibleItemCount', 'selectionController', 'autoClearItems', 'items',
			])
				&& [properties.title, properties.icon, properties.selectionController]
					.every((item) => typeof item === 'string')
				&& (properties.titleColor === '' || isTextColor(properties.titleColor))
				&& Number.isInteger(properties.popupDirection)
				&& properties.popupDirection >= 0
				&& properties.popupDirection <= 2
				&& isSoundReference(properties.sound)
				&& isSoundVolume(properties.soundVolumeScale)
				&& finite(properties.visibleItemCount)
				&& typeof properties.autoClearItems === 'boolean'
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
			return hasExactKeys(properties, [
				'extensionType', 'value', 'max', 'min', 'sound', 'soundVolumeScale',
			])
				&& [properties.value, properties.max, properties.min].every(finite)
				&& isSoundReference(properties.sound)
				&& isSoundVolume(properties.soundVolumeScale);
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
	return value.length > 0
		&& value.trim() === value
		&& value !== '.'
		&& value !== '..'
		&& !/[\\/:]/.test(value)
		&& !/[. ]$/.test(value)
		&& !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(value);
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
	const folderKeys = new Set<string>();
	for (const [folderIndex, folder] of pkg.folders.entries()) {
		const folderPath = `${pkgPath}.folders[${folderIndex}]`;
		if (folder.branch && !isSafePathSegment(folder.branch)) {
			pushIssue(issues, `${folderPath}.branch`, `Invalid package branch name "${folder.branch}".`);
		}
		const normalizedPath = normalizeResourceFolderPath(folder.path);
		if (folder.path === '/' || folder.path !== normalizedPath || !folder.path.split('/').filter(Boolean).every(isSafePathSegment)) {
			pushIssue(issues, `${folderPath}.path`, 'Resource folder path must be canonical, non-root, and traversal-free.');
			continue;
		}
		if (typeof folder.favorite !== 'boolean') {
			pushIssue(issues, `${folderPath}.favorite`, 'Resource folder favorite must be boolean.');
		}
		if (typeof folder.atlas !== 'string') {
			pushIssue(issues, `${folderPath}.atlas`, 'Resource folder atlas must be a string.');
		}
		const key = `${folder.branch}\0${folder.path}`;
		if (folderKeys.has(key)) {
			pushIssue(issues, `${folderPath}.path`, `Duplicate resource folder path "${folder.path}".`);
		}
		folderKeys.add(key);
		const parentPath = resourceFolderParentPath(folder.path);
		if (parentPath !== '/' && !folderKeys.has(`${folder.branch}\0${parentPath}`)
			&& !pkg.folders.some((candidate) => candidate.branch === folder.branch && candidate.path === parentPath)
		) {
			pushIssue(issues, `${folderPath}.path`, `Parent resource folder "${parentPath}" does not exist.`);
		}
		const target = folder.path.replace(/^\/+|\/+$/g, '');
		const descriptor = folder.branch ? 'package_branch.xml' : 'package.xml';
		if (target === descriptor) {
			pushIssue(issues, `${folderPath}.path`, `Resource folder output "${target}" conflicts with the package descriptor.`);
		}
		outputs.set(`${folder.branch}\0${target}`, folderPath);
	}
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
	knownGroupIds: Set<string>,
	path: string,
	issues: UamValidationIssue[],
): void {
	if (!isFiniteUamPoint(node.position)) pushIssue(issues, `${path}.position`, 'Display node position must contain finite x and y numbers.');
	if (!isFiniteUamSize(node.size) || node.size.width < 0 || node.size.height < 0) {
		pushIssue(issues, `${path}.size`, 'Display node size must contain finite non-negative width and height values.');
	}
	if (typeof node.locked !== 'boolean') pushIssue(issues, `${path}.locked`, 'Display node locked must be boolean.');
	if (typeof node.aspect !== 'boolean') pushIssue(issues, `${path}.aspect`, 'Display node aspect must be boolean.');
	for (const [key, value] of [['minSize', node.minSize], ['maxSize', node.maxSize]] as const) {
		if (!isFiniteUamSize(value) || value.width < 0 || value.height < 0) {
			pushIssue(issues, `${path}.${key}`, `Display node ${key} must contain finite non-negative width and height values.`);
		}
	}
	if (isFiniteUamSize(node.minSize) && isFiniteUamSize(node.maxSize)) {
		if (node.maxSize.width > 0 && node.maxSize.width < node.minSize.width) {
			pushIssue(issues, `${path}.maxSize.width`, 'Display node maxSize.width must be zero or at least minSize.width.');
		}
		if (node.maxSize.height > 0 && node.maxSize.height < node.minSize.height) {
			pushIssue(issues, `${path}.maxSize.height`, 'Display node maxSize.height must be zero or at least minSize.height.');
		}
	}
	if (!isFiniteUamPoint(node.scale)) pushIssue(issues, `${path}.scale`, 'Display node scale must contain finite x and y numbers.');
	if (!isFiniteUamPoint(node.skew)) pushIssue(issues, `${path}.skew`, 'Display node skew must contain finite x and y numbers.');
	if (![node.visible, node.touchable, node.grayed].every((value) => typeof value === 'boolean')) {
		pushIssue(issues, path, 'Display node visible, touchable, and grayed must be boolean.');
	}
	if (typeof node.alpha !== 'number' || !Number.isFinite(node.alpha) || node.alpha < 0 || node.alpha > 1) {
		pushIssue(issues, `${path}.alpha`, 'Display node alpha must be a finite number between 0 and 1.');
	}
	if (typeof node.rotation !== 'number' || !Number.isFinite(node.rotation)) {
		pushIssue(issues, `${path}.rotation`, 'Display node rotation must be finite.');
	}
	if (![node.tooltips, node.filter, node.filterData, node.customData].every((value) => typeof value === 'string')) {
		pushIssue(issues, path, 'Display node tooltips, filter, filterData, and customData must be strings.');
	}
	if (!['normal', 'none', 'add', 'multiply', 'screen', 'erase'].includes(node.blendMode)) {
		pushIssue(issues, `${path}.blendMode`, `Unsupported display node blendMode "${node.blendMode}".`);
	}
	if (node.filter !== '' && node.filter !== 'color') {
		pushIssue(issues, `${path}.filter`, `Unsupported display node filter "${node.filter}".`);
	} else if (node.filter === 'color') {
		const values = node.filterData.split(',').map((part) => Number(part.trim()));
		if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
			pushIssue(issues, `${path}.filterData`, 'Color filterData must contain four finite comma-separated numbers.');
		}
	} else if (node.filterData !== '') {
		pushIssue(issues, `${path}.filterData`, 'filterData must be empty when filter is empty.');
	}
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
	if (node.kind === 'component'
		&& node.propertyOverrides !== undefined
		&& (!Array.isArray(node.propertyOverrides)
			|| !node.propertyOverrides.every(isValidUamComponentPropertyOverride))
	) {
		pushIssue(issues, `${path}.propertyOverrides`, 'Component property overrides must contain a non-empty target, a non-negative integer propertyId, and a string value.');
	}
	if (node.kind === 'list' || node.kind === 'tree') {
		if (!Number.isInteger(node.scrollBarDisplay) || node.scrollBarDisplay < 0 || node.scrollBarDisplay > 3) {
			pushIssue(issues, `${path}.scrollBarDisplay`, 'List scrollBarDisplay must be an integer between 0 and 3.');
		}
		for (const [itemIndex, item] of node.listItems.entries()) {
			if (item.propertyOverrides !== undefined
				&& (!Array.isArray(item.propertyOverrides)
					|| !item.propertyOverrides.every(isValidUamComponentPropertyOverride))
			) {
				pushIssue(issues, `${path}.listItems[${itemIndex}].propertyOverrides`, 'List item property overrides must contain a non-empty target, a non-negative integer propertyId, and a string value.');
			}
		}
	}
	if (
		(node.kind === 'text' || node.kind === 'richText' || node.kind === 'textInput')
		&& !isValidUamTextProperties(textPropertiesFromNode(node), node.kind)
	) {
		pushIssue(issues, path, 'Text properties must be a complete valid snapshot matching the display node kind.');
	}
	if (node.kind === 'image' && !isValidUamImageProperties({
		color: node.color,
		flip: node.flip,
		fillMethod: node.fillMethod,
		fillOrigin: node.fillOrigin,
		fillClockwise: node.fillClockwise,
		fillAmount: node.fillAmount,
	})) {
		pushIssue(issues, path, 'Image properties must be a complete valid property snapshot.');
	}
	if (node.kind === 'movieClip' && !isValidUamMovieClipProperties({
		playing: node.playing,
		frame: node.frame,
		color: node.color,
	})) {
		pushIssue(issues, path, 'MovieClip properties must be a complete valid property snapshot.');
	}
	if (node.kind === 'loader' || node.kind === 'loader3D') {
		if ('group' in node) {
			pushIssue(issues, `${path}.group`, `${node.kind} display nodes must not declare a group reference.`);
		}
	} else {
		if (!('group' in node) || typeof node.group !== 'string') {
			pushIssue(issues, `${path}.group`, 'Display node group must be a string.');
		} else if (node.group && (node.group === node.id || !knownGroupIds.has(node.group))) {
			pushIssue(issues, `${path}.group`, `Group reference "${node.group}" must target another group in the same component.`);
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
	const declaredProjectBranches = Array.isArray(project.branches) ? project.branches : [];
	if (!Array.isArray(project.branches)) pushIssue(issues, 'branches', 'Project branches must be an array.');
	const projectBranchNames = new Set<string>();
	for (const [branchIndex, branchName] of declaredProjectBranches.entries()) {
		if (!isSafePathSegment(branchName)) pushIssue(issues, `branches[${branchIndex}]`, `Invalid branch name "${branchName}".`);
		if (projectBranchNames.has(branchName)) pushIssue(issues, `branches[${branchIndex}]`, `Duplicate branch name "${branchName}".`);
		if (branchIndex > 0 && declaredProjectBranches[branchIndex - 1]!.localeCompare(branchName) > 0) {
			pushIssue(issues, `branches[${branchIndex}]`, 'Project branches must use canonical lexical order.');
		}
		projectBranchNames.add(branchName);
	}

	for (const [pkgIndex, pkg] of project.packages.entries()) {
		const pkgPath = `packages[${pkgIndex}]`;
		if (packageIds.has(pkg.id)) pushIssue(issues, `${pkgPath}.id`, `Duplicate package id "${pkg.id}".`);
		if (packageNames.has(pkg.name)) pushIssue(issues, `${pkgPath}.name`, `Duplicate package name "${pkg.name}".`);
		packageIds.add(pkg.id);
		packageNames.add(pkg.name);
		validatePackageOutputTargets(pkg, pkgPath, issues);
		const declaredBranchNames = Array.isArray(pkg.branchNames) ? pkg.branchNames : [];
		if (!Array.isArray(pkg.branchNames)) {
			pushIssue(issues, `${pkgPath}.branchNames`, 'Package branchNames must be an array.');
		}
		const packageBranchNames = new Set<string>();
		for (const [branchIndex, branchName] of declaredBranchNames.entries()) {
			if (!branchName || !projectBranchNames.has(branchName)) {
				pushIssue(issues, `${pkgPath}.branchNames[${branchIndex}]`, `Unknown package branch "${branchName}".`);
			}
			if (packageBranchNames.has(branchName)) {
				pushIssue(issues, `${pkgPath}.branchNames[${branchIndex}]`, `Duplicate package branch "${branchName}".`);
			}
			packageBranchNames.add(branchName);
		}

		const resourceIds = new Set<string>();
		for (const [resourceIndex, resource] of pkg.resources.entries()) {
			const resourcePath = `${pkgPath}.resources[${resourceIndex}]`;
			if (resourceIds.has(resource.id)) pushIssue(issues, `${resourcePath}.id`, `Duplicate resource id "${resource.id}".`);
			resourceIds.add(resource.id);
			if (resource.branch && !packageBranchNames.has(resource.branch)) {
				pushIssue(issues, `${resourcePath}.branch`, `Unknown package branch "${resource.branch}".`);
			}
			if (resource.branchItemIds.length > declaredBranchNames.length) {
				pushIssue(issues, `${resourcePath}.branchItemIds`, 'Branch item ids exceed the package branch table.');
			}
			if (typeof resource.favorite !== 'boolean') {
				pushIssue(issues, `${resourcePath}.favorite`, 'Resource favorite must be boolean.');
			}
			if (resource.kind === 'image' && !isValidUamImageResourceProperties(resource.image)) {
				pushIssue(issues, `${resourcePath}.image`, 'Image resource properties must be a complete valid property snapshot.');
			}
			if (resource.kind === 'movieClip') {
				if (!isFiniteUamSize(resource.dimensions) || resource.dimensions.width < 0 || resource.dimensions.height < 0) {
					pushIssue(issues, `${resourcePath}.dimensions`, 'MovieClip dimensions must contain finite non-negative width and height values.');
				}
				if (!isValidUamMovieClipResourceProperties(resource.movieClip)) {
					pushIssue(issues, `${resourcePath}.movieClip`, 'MovieClip properties must be a complete valid property snapshot.');
				}
			}

			if (resource.kind !== 'component') continue;

			const component = resource.component;
			if (!isValidUamComponentProperties(component.properties)) {
				pushIssue(issues, `${resourcePath}.component.properties`, 'Component properties must be a complete valid property snapshot.');
			}
			const childIds = new Set<string>();
			const groupIds = new Set<string>();
			for (const [childIndex, child] of component.displayList.entries()) {
				const childPath = `${resourcePath}.component.displayList[${childIndex}]`;
				if (childIds.has(child.id)) pushIssue(issues, `${childPath}.id`, `Duplicate child id "${child.id}".`);
				childIds.add(child.id);
				if (child.kind === 'group') groupIds.add(child.id);
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
				validateDisplayNode(child, controllerMap, childIds, groupIds, `${resourcePath}.component.displayList[${childIndex}]`, issues);
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
