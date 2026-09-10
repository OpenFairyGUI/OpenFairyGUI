import type { UamDisplayNode, UamTextProperties, UamPlainTextProperties } from '../model.js';
import { hasExactKeys, isFiniteUamPoint, isUamColor } from './values.js';

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
		&& isUamColor(properties.color)
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
				: isUamColor(properties.strokeColor)
		)
		&& isFiniteUamPoint(properties.shadowOffset)
		&& (
			properties.shadowColor === null
				? properties.shadowOffset.x === 0 && properties.shadowOffset.y === 0
				: isUamColor(properties.shadowColor)
		);
	if (!commonValid || nodeKind === 'richText') return commonValid;
	return typeof properties.demoText === 'string'
		&& typeof properties.templateVarsEnabled === 'boolean'
		&& typeof properties.faceDilate === 'number'
		&& Number.isFinite(properties.faceDilate);
}

export function textPropertiesFromNode(
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
