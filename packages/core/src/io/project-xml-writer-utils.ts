import type { GComponentPropertyOverride } from '../properties/g-component.js';
import { PROJECT_XML_PROTOCOL, writeXmlAttr, type XmlNodeProtocol } from './project-xml-protocol.js';

export const EXTENSION_PROTOCOL_MAP = {
	Button: PROJECT_XML_PROTOCOL.buttonExtension,
	Label: PROJECT_XML_PROTOCOL.labelExtension,
	ComboBox: PROJECT_XML_PROTOCOL.comboBoxExtension,
	ProgressBar: PROJECT_XML_PROTOCOL.progressBarExtension,
	Slider: PROJECT_XML_PROTOCOL.sliderExtension,
	ScrollBar: PROJECT_XML_PROTOCOL.scrollBarExtension,
} as const;

export function formatButtonDownEffectValue(value: number): string {
	return value.toFixed(2);
}

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;

export function formatProjectInt32(value: number, field = 'project XML integer'): string {
	if (!Number.isFinite(value)) throw new Error(`${field} must be finite.`);
	const normalized = Math.trunc(value);
	if (normalized < INT32_MIN || normalized > INT32_MAX) {
		throw new Error(`${field} must fit a signed 32-bit integer.`);
	}
	return Object.is(normalized, -0) ? '0' : String(normalized);
}

export function formatProjectInt32List(values: readonly number[], field: string): string {
	return values.map((value) => formatProjectInt32(value, field)).join(',');
}

export function hasNonZeroInsets(value: { top?: number; bottom?: number; left?: number; right?: number } | null | undefined): boolean {
	return !!value && !!(value.top || value.bottom || value.left || value.right);
}

export function formatInsets(
	value: { top?: number; bottom?: number; left?: number; right?: number },
	field = 'margin',
): string {
	return formatProjectInt32List([
		value.top ?? 0,
		value.bottom ?? 0,
		value.left ?? 0,
		value.right ?? 0,
	], field);
}

export function formatButtonMode(mode: number): string {
	const map: Record<number, string> = {
		0: 'Common',
		1: 'Check',
		2: 'Radio',
	};
	return map[mode] ?? 'Common';
}

export function formatButtonDownEffect(effect: number): string {
	return ['none', 'dark', 'scale'][effect] ?? 'none';
}

export function formatTitleType(titleType: number): string {
	const map: Record<number, string> = {
		0: 'percent',
		1: 'valueAndmax',
		2: 'value',
		3: 'max',
	};
	return map[titleType] ?? 'percent';
}

export function getProtocolChildName(protocol: XmlNodeProtocol, childName: string): string | null {
	return protocol.children?.[childName] ? childName : null;
}

export function sameColor(a: string | undefined, b: string): boolean {
	return (a ?? '').toLowerCase() === b.toLowerCase();
}

export function formatXmlColor(color: string): string {
	return color.toLowerCase();
}

export function isDefaultWhiteColor(color: string | undefined): boolean {
	return sameColor(color, '#FFFFFF') || sameColor(color, '#FFFFFFFF');
}

export function isDefaultBlackColor(color: string | undefined): boolean {
	return sameColor(color, '#000000') || sameColor(color, '#FF000000');
}

export function serializePropertyOverrideXmlNode(property: GComponentPropertyOverride): Record<string, unknown> {
	const attrs: Record<string, unknown> = {};
	const specs = PROJECT_XML_PROTOCOL.propertyOverride.attrs;
	writeXmlAttr(attrs, specs.target, property.target);
	writeXmlAttr(attrs, specs.propertyId, String(property.propertyId));
	writeXmlAttr(attrs, specs.value, property.value);
	return attrs;
}

export function formatTrimmedFixed(value: number, precision = 2): string {
	if (!Number.isFinite(value)) return String(value);
	if (precision === 0) return value.toFixed(0);
	const fixed = value.toFixed(precision);
	return fixed.replace(/(?:\.0+|(\.\d*?[1-9])0+)$/, '$1');
}
