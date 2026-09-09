import type { Component } from '../properties/component.js';
import { ensureArray, getXmlNode } from '../utils/xml-utils.js';
import { PROJECT_XML_PROTOCOL, readXmlAttr, type XmlAttrSpec } from './project-xml-protocol.js';
import type { ReaderContext } from './reader-context.js';

type XmlNode = Record<string, unknown>;

type ProjectInt32Rule = readonly [spec: XmlAttrSpec, partCount: number];

const COMPONENT_INT32_RULES: readonly ProjectInt32Rule[] = [
	[PROJECT_XML_PROTOCOL.componentRoot.attrs.size, 2],
	[PROJECT_XML_PROTOCOL.componentRoot.attrs.restrictSize, 4],
	[PROJECT_XML_PROTOCOL.componentRoot.attrs.margin, 4],
	[PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBarMargin, 4],
	[PROJECT_XML_PROTOCOL.componentRoot.attrs.clipSoftness, 2],
	[PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageOffsetX, 1],
	[PROJECT_XML_PROTOCOL.componentRoot.attrs.designImageOffsetY, 1],
];

const DISPLAY_OBJECT_INT32_RULES: readonly ProjectInt32Rule[] = [
	[PROJECT_XML_PROTOCOL.list.attrs.xy, 2],
	[PROJECT_XML_PROTOCOL.list.attrs.size, 2],
	[PROJECT_XML_PROTOCOL.list.attrs.restrictSize, 4],
];

const LIST_INT32_RULES: readonly ProjectInt32Rule[] = [
	[PROJECT_XML_PROTOCOL.list.attrs.margin, 4],
	[PROJECT_XML_PROTOCOL.list.attrs.scrollBarMargin, 4],
	[PROJECT_XML_PROTOCOL.list.attrs.clipSoftness, 2],
];

function isProjectInt32(value: string): boolean {
	const trimmed = value.trim();
	if (!/^[+-]?\d+$/.test(trimmed)) return false;
	const parsed = BigInt(trimmed);
	return parsed >= -2_147_483_648n && parsed <= 2_147_483_647n;
}

function isProjectFiniteNumber(value: string): boolean {
	const trimmed = value.trim();
	return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)
		&& Number.isFinite(Number(trimmed));
}

function isProjectBoolean(value: string): boolean {
	return ['true', 'false', '1', '0'].includes(value.trim());
}

function hasInvalidProjectInt32Parts(value: unknown, partCount: number, allowSuffix = false): boolean {
	const parts = String(value).split(',');
	if (allowSuffix ? parts.length < partCount : parts.length !== partCount) return true;
	return parts.slice(0, partCount).some((part) => !isProjectInt32(part));
}

export function validateComponentXmlValues(
	ctx: ReaderContext,
	comp: Component,
	sourcePath: string,
	componentNode: XmlNode,
): void {
	const addInvalidValue = (
		attrs: XmlNode,
		spec: XmlAttrSpec | undefined,
		path: string,
		expectation: string,
		isValid: (value: string) => boolean,
		nodeId?: string,
	): void => {
		if (!spec) return;
		const value = readXmlAttr(attrs, spec);
		if (value === undefined || isValid(String(value))) return;
		ctx.addDiagnostic({
			severity: 'error',
			code: 'invalid_project_value',
			path: `${path}.${spec.canonical}`,
			message: `Attribute "${spec.canonical}" must be ${expectation}; received ${JSON.stringify(String(value))}.`,
			resourceId: comp.getId(),
			...(nodeId ? { nodeId } : {}),
			sourcePath,
		});
	};

	const validateBooleanAttrs = (
		attrs: XmlNode,
		specs: readonly (XmlAttrSpec | undefined)[],
		path: string,
		nodeId?: string,
	): void => {
		for (const spec of specs) {
			addInvalidValue(attrs, spec, path, 'true, false, 1, or 0', isProjectBoolean, nodeId);
		}
	};

	const validateInt32Attrs = (
		attrs: XmlNode,
		specs: readonly (XmlAttrSpec | undefined)[],
		path: string,
		nodeId?: string,
	): void => {
		for (const spec of specs) {
			addInvalidValue(attrs, spec, path, 'a signed 32-bit integer', isProjectInt32, nodeId);
		}
	};

	const validateNumberTuple = (
		attrs: XmlNode,
		spec: XmlAttrSpec | undefined,
		partCount: number,
		path: string,
		nodeId?: string,
	): void => {
		addInvalidValue(attrs, spec, path, `exactly ${partCount} finite number(s)`, (value) => {
			const parts = value.split(',');
			return parts.length === partCount && parts.every(isProjectFiniteNumber);
		}, nodeId);
	};

	const validateEnum = (
		attrs: XmlNode,
		spec: XmlAttrSpec | undefined,
		values: readonly string[],
		path: string,
		nodeId?: string,
	): void => {
		addInvalidValue(attrs, spec, path, `one of ${values.map((value) => JSON.stringify(value)).join(', ')}`, (value) => (
			values.includes(value.trim())
		), nodeId);
	};

	const addDiagnostics = (
		attrs: XmlNode,
		rules: readonly ProjectInt32Rule[],
		path: string,
		nodeId?: string,
	): void => {
		for (const [spec, partCount] of rules) {
			const value = readXmlAttr(attrs, spec);
			if (value === undefined || !hasInvalidProjectInt32Parts(value, partCount)) continue;
			ctx.addDiagnostic({
				severity: 'error',
				code: 'desktop_incompatible_geometry',
				path: `${path}.${spec.canonical}`,
				message: `FairyGUI Desktop requires "${spec.canonical}" to contain ${partCount} signed 32-bit integer value(s); received ${JSON.stringify(String(value))}.`,
				resourceId: comp.getId(),
				...(nodeId ? { nodeId } : {}),
				sourcePath,
			});
		}
	};

	const componentPath = `components.${comp.getId()}`;
	const rootPath = `${componentPath}.component`;
	const rootAttrs = PROJECT_XML_PROTOCOL.componentRoot.attrs;
	addDiagnostics(componentNode, COMPONENT_INT32_RULES, rootPath);
	validateBooleanAttrs(componentNode, [
		rootAttrs.anchor,
		rootAttrs.opaque,
		rootAttrs.reversedMask,
		rootAttrs.bgColorEnabled,
	], rootPath);
	validateInt32Attrs(componentNode, [
		rootAttrs.scrollBarFlags,
		rootAttrs.designImageAlpha,
		rootAttrs.designImageLayer,
		rootAttrs.idnum,
	], rootPath);
	validateNumberTuple(componentNode, rootAttrs.pivot, 2, rootPath);
	validateEnum(componentNode, rootAttrs.overflow, ['visible', 'hidden', 'scroll'], rootPath);
	validateEnum(componentNode, rootAttrs.scroll, ['horizontal', 'vertical', 'both'], rootPath);
	validateEnum(componentNode, rootAttrs.scrollBar, ['default', 'visible', 'auto', 'hidden'], rootPath);

	const displayList = getXmlNode<XmlNode>(componentNode.displayList);
	if (!displayList) return;
	let nodeIndex = 0;
	for (const [tagName, definitions] of Object.entries(displayList)) {
		for (const definition of ensureArray(definitions)) {
			const attrs = getXmlNode<XmlNode>(definition);
			if (!attrs) continue;
			const nodeId = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.id);
			const nodePath = `${componentPath}.displayList.${nodeIndex++}`;
			addDiagnostics(attrs, DISPLAY_OBJECT_INT32_RULES, nodePath, nodeId);
			const normalizedTagName = tagName.toLowerCase();
			const displayProtocol = Object.entries(PROJECT_XML_PROTOCOL.componentRoot.containers?.displayList?.items ?? {})
				.find(([name]) => name.toLowerCase() === normalizedTagName)?.[1];
			const displayAttrs = displayProtocol?.attrs;
			if (displayAttrs) {
				validateBooleanAttrs(attrs, [
					displayAttrs.locked,
					displayAttrs.aspect,
					displayAttrs.anchor,
					displayAttrs.visible,
					displayAttrs.touchable,
					displayAttrs.grayed,
				], nodePath, nodeId);
				for (const spec of [displayAttrs.pivot, displayAttrs.scale, displayAttrs.skew]) {
					validateNumberTuple(attrs, spec, 2, nodePath, nodeId);
				}
				addInvalidValue(attrs, displayAttrs.rotation, nodePath, 'a finite number', isProjectFiniteNumber, nodeId);
				addInvalidValue(attrs, displayAttrs.alpha, nodePath, 'a finite number between 0 and 1', (value) => (
					isProjectFiniteNumber(value) && Number(value) >= 0 && Number(value) <= 1
				), nodeId);
			}
			if (normalizedTagName === 'list' || normalizedTagName === 'tree') {
				addDiagnostics(attrs, LIST_INT32_RULES, nodePath, nodeId);
			}

			if (displayAttrs && ['text', 'richtext', 'inputtext'].includes(normalizedTagName)) {
				validateBooleanAttrs(attrs, [
					displayAttrs.input,
					displayAttrs.singleLine,
					displayAttrs.autoClearText,
					displayAttrs.vars,
					displayAttrs.ubb,
					displayAttrs.underline,
					displayAttrs.italic,
					displayAttrs.bold,
					displayAttrs.strikethrough,
					displayAttrs.password,
				], nodePath, nodeId);
				validateInt32Attrs(attrs, [
					displayAttrs.leading,
					displayAttrs.letterSpacing,
					displayAttrs.maxLength,
					displayAttrs.keyboardType,
				], nodePath, nodeId);
				addInvalidValue(attrs, displayAttrs.fontSize, nodePath, 'a positive signed 32-bit integer', (value) => (
					isProjectInt32(value) && BigInt(value.trim()) > 0n
				), nodeId);
				for (const spec of [displayAttrs.strokeSize, displayAttrs.faceDilate, displayAttrs.underlaySoftness]) {
					addInvalidValue(attrs, spec, nodePath, 'a finite number', isProjectFiniteNumber, nodeId);
				}
				validateNumberTuple(attrs, displayAttrs.shadowOffset, 2, nodePath, nodeId);
				validateEnum(attrs, displayAttrs.align, ['left', 'center', 'right'], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.vAlign, ['top', 'middle', 'bottom'], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.autoSize, ['none', 'both', 'height', 'shrink', 'ellipsis'], nodePath, nodeId);
			}

			if (displayAttrs && (normalizedTagName === 'list' || normalizedTagName === 'tree')) {
				validateBooleanAttrs(attrs, [
					displayAttrs.autoResizeItem,
					displayAttrs.treeView,
					displayAttrs.autoClearItems,
					displayAttrs.scrollItemToViewOnClick,
					displayAttrs.foldInvisibleItems,
				], nodePath, nodeId);
				validateInt32Attrs(attrs, [
					displayAttrs.lineGap,
					displayAttrs.columnGap,
					displayAttrs.lineItemCount,
					displayAttrs.lineItemCount2,
					displayAttrs.apexIndex,
					displayAttrs.scrollBarFlags,
					displayAttrs.indent,
					displayAttrs.clickToExpand,
				], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.layout, [
					'singleColumn', 'singleRow', 'flowHorizontal', 'flowVertical', 'pagination',
					'single_column', 'single_row', 'flow_hz', 'flow_vt', 'column', 'row',
				], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.align, ['left', 'center', 'right'], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.vAlign, ['top', 'middle', 'bottom'], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.childrenRenderOrder, ['ascent', 'descent', 'arch'], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.selectionMode, ['single', 'multiple', 'multipleSingleClick', 'none'], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.overflow, ['visible', 'hidden', 'scroll'], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.scroll, ['horizontal', 'vertical', 'both'], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.scrollBar, ['default', 'visible', 'auto', 'hidden'], nodePath, nodeId);
			}

			if (displayAttrs && normalizedTagName === 'group') {
				validateBooleanAttrs(attrs, [
					displayAttrs.advanced,
					displayAttrs.excludeInvisibles,
					displayAttrs.autoSizeDisabled,
				], nodePath, nodeId);
				validateInt32Attrs(attrs, [displayAttrs.lineGap, displayAttrs.columnGap, displayAttrs.mainGridIndex], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.layout, ['none', 'hz', 'vt'], nodePath, nodeId);
			}

			if (displayAttrs && ['image', 'loader', 'loader3d'].includes(normalizedTagName)) {
				validateBooleanAttrs(attrs, [
					displayAttrs.fillClockwise,
					displayAttrs.shrinkOnly,
					displayAttrs.autoSize,
					displayAttrs.useResize,
					displayAttrs.playing,
					displayAttrs.loop,
					displayAttrs.clearOnPublish,
				], nodePath, nodeId);
				validateInt32Attrs(attrs, [displayAttrs.frame, displayAttrs.fillOrigin, displayAttrs.fillAmount], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.align, ['left', 'center', 'right'], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.vAlign, ['top', 'middle', 'bottom'], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.fill, [
					'none', 'scale', 'scaleMatchHeight', 'scaleMatchWidth', 'scaleFree', 'scaleNoBorder',
				], nodePath, nodeId);
				validateEnum(attrs, displayAttrs.fillMethod, ['none', 'hz', 'vt', 'radial90', 'radial180', 'radial360'], nodePath, nodeId);
			}

			if (displayAttrs && (normalizedTagName === 'movieclip' || normalizedTagName === 'jta')) {
				validateBooleanAttrs(attrs, [displayAttrs.playing], nodePath, nodeId);
				validateInt32Attrs(attrs, [displayAttrs.frame], nodePath, nodeId);
			}

			for (const gearTag of ['gearXY', 'gearSize'] as const) {
				for (const [gearIndex, gearDefinition] of ensureArray(attrs[gearTag]).entries()) {
					const gear = getXmlNode<XmlNode>(gearDefinition);
					if (!gear) continue;
					for (const spec of [PROJECT_XML_PROTOCOL.gear.attrs.values, PROJECT_XML_PROTOCOL.gear.attrs.default]) {
						const value = readXmlAttr(gear, spec);
						if (value === undefined || !String(value).split('|').some((segment) => (
							segment.trim() !== '-' && hasInvalidProjectInt32Parts(segment, 2, true)
						))) continue;
						ctx.addDiagnostic({
							severity: 'error',
							code: 'desktop_incompatible_geometry',
							path: `${nodePath}.${gearTag}.${gearIndex}.${spec.canonical}`,
							message: `FairyGUI Desktop requires each "${gearTag}.${spec.canonical}" segment to start with two signed 32-bit integers; received ${JSON.stringify(String(value))}.`,
							resourceId: comp.getId(),
							...(nodeId ? { nodeId } : {}),
							sourcePath,
						});
					}
				}
			}
		}
	}
}

