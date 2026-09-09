import { GearType } from '../constants.js';
import type { GObject } from '../properties/g-object.js';
import type { Gear } from '../properties/gear.js';
import { PROJECT_XML_PROTOCOL, writeXmlAttr, type XmlNodeProtocol } from './project-xml-protocol.js';
import { formatProjectInt32, formatTrimmedFixed, formatXmlColor, getProtocolChildName, isDefaultBlackColor } from './project-xml-writer-utils.js';

const GEAR_TAG: Record<number, string> = {
	[GearType.Display]: 'gearDisplay',
	[GearType.XY]: 'gearXY',
	[GearType.Size]: 'gearSize',
	[GearType.Look]: 'gearLook',
	[GearType.Color]: 'gearColor',
	[GearType.Animation]: 'gearAni',
	[GearType.Text]: 'gearText',
	[GearType.Icon]: 'gearIcon',
	[GearType.Display2]: 'gearDisplay2',
	[GearType.FontSize]: 'gearFontSize',
};

const RELATION_TYPE_NAME: Record<number, string> = {
	0: 'left-left', 1: 'left-center', 2: 'left-right',
	3: 'center-center',
	4: 'right-left', 5: 'right-center', 6: 'right-right',
	7: 'top-top', 8: 'top-middle', 9: 'top-bottom',
	10: 'middle-middle',
	11: 'bottom-top', 12: 'bottom-middle', 13: 'bottom-bottom',
	14: 'width-width', 15: 'height-height',
	16: 'leftext-left', 17: 'leftext-right',
	18: 'rightext-left', 19: 'rightext-right',
	20: 'topext-top', 21: 'topext-bottom',
	22: 'bottomext-top', 23: 'bottomext-bottom',
};

function stringifyEaseType(easeType: number): string {
	const names: Record<number, string> = {
		0: 'Linear', 1: 'Sine.In', 2: 'Sine.Out', 3: 'Sine.InOut',
		4: 'Quad.In', 5: 'Quad.Out', 6: 'Quad.InOut',
		7: 'Cubic.In', 8: 'Cubic.Out', 9: 'Cubic.InOut',
		10: 'Quart.In', 11: 'Quart.Out', 12: 'Quart.InOut',
		13: 'Quint.In', 14: 'Quint.Out', 15: 'Quint.InOut',
		16: 'Expo.In', 17: 'Expo.Out', 18: 'Expo.InOut',
		19: 'Circ.In', 20: 'Circ.Out', 21: 'Circ.InOut',
		22: 'Elastic.In', 23: 'Elastic.Out', 24: 'Elastic.InOut',
		25: 'Back.In', 26: 'Back.Out', 27: 'Back.InOut',
		28: 'Bounce.In', 29: 'Bounce.Out', 30: 'Bounce.InOut',
		31: 'Custom',
	};
	return names[easeType] ?? 'Quad.Out';
}

function almostEqual(a: number, b: number, epsilon = 0.000001): boolean {
	return Math.abs(a - b) < epsilon;
}

function formatGearLookAlpha(value: string | undefined, fixedAlpha: boolean): string {
	if (value === undefined) return '';
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return value;
	return fixedAlpha ? numeric.toFixed(2) : formatTrimmedFixed(numeric, 2);
}

function normalizeGearLookSegment(segment: string, fixedAlpha: boolean): string {
	if (!segment || segment === '-') return segment;
	const parts = segment.split(',');
	if (parts.length < 3) return segment;
	const normalizeFlag = (value: string | undefined, fallback: string): string => {
		if (value === undefined || value === '') return fallback;
		const lower = value.trim().toLowerCase();
		if (lower === 'true') return '1';
		if (lower === 'false') return '0';
		return value;
	};
	const normalized = [
		formatGearLookAlpha(parts[0], fixedAlpha),
		formatTrimmedFixed(Number(parts[1] ?? 0), 2),
		normalizeFlag(parts[2], '0'),
	];
	if (parts.length >= 4) {
		const touchable = normalizeFlag(parts[3], '1');
		if (touchable !== '1') normalized.push(touchable);
	}
	return normalized.join(',');
}

function normalizeGearColorSegment(segment: string, compactOutline: boolean): string {
	if (!segment || segment === '-') return segment;
	const parts = segment.split(',');
	if (parts.length === 1) return formatXmlColor(parts[0] ?? '');
	const normalized = parts.map((part) => formatXmlColor(part));
	if (compactOutline && normalized.length >= 2 && isDefaultBlackColor(normalized[1])) {
		return normalized[0] ?? '';
	}
	return normalized.join(',');
}

function isIdentityGearSizeScale(segment: string): boolean {
	if (!segment || segment === '-') return true;
	const parts = segment.split(',');
	if (parts.length < 4) return true;
	return almostEqual(Number(parts[2] ?? 1), 1) && almostEqual(Number(parts[3] ?? 1), 1);
}

function normalizeGearSizeSegment(segment: string, fixedScale: boolean, omitIdentityScale: boolean): string {
	if (!segment || segment === '-') return segment;
	const parts = segment.split(',');
	if (parts.length < 2) return segment;
	const normalized = [
		formatProjectInt32(Number(parts[0] ?? 0), 'gearSize width'),
		formatProjectInt32(Number(parts[1] ?? 0), 'gearSize height'),
	];
	if (parts.length >= 4) {
		if (omitIdentityScale && isIdentityGearSizeScale(segment)) {
			return normalized.join(',');
		}
		const scaleFormatter = fixedScale
			? (value: string | undefined) => {
				const numeric = Number(value);
				return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value ?? '');
			}
			: (value: string | undefined) => formatTrimmedFixed(Number(value ?? 0), 2);
		normalized.push(scaleFormatter(parts[2]), scaleFormatter(parts[3]));
	}
	return normalized.join(',');
}

function normalizeGearXYSegment(segment: string): string {
	if (!segment || segment === '-') return segment;
	const parts = segment.split(',');
	if (parts.length < 2) return segment;
	return [
		formatProjectInt32(Number(parts[0] ?? 0), 'gearXY x'),
		formatProjectInt32(Number(parts[1] ?? 0), 'gearXY y'),
		...parts.slice(2),
	].join(',');
}

function shouldCompactTextGearColor(ownerType?: string, ownerName?: string): boolean {
	return (ownerType === 'GTextField' || ownerType === 'GRichTextField' || ownerType === 'GTextInput')
		&& ownerName === 'title';
}

function normalizeGearXmlValue(gearType: number, value: unknown, ownerType?: string, ownerName?: string, gear?: Gear): string {
	const raw = String(value ?? '');
	switch (gearType) {
		case GearType.XY:
			return raw.split('|').map((segment) => normalizeGearXYSegment(segment)).join('|');
		case GearType.Size: {
			const fixedScale = !gear?.getTween();
			const segments = raw.split('|');
			const omitIdentityScale = fixedScale
				&& ownerName !== 'bg'
				&& segments.every((segment) => isIdentityGearSizeScale(segment));
			return segments.map((segment) => normalizeGearSizeSegment(segment, fixedScale, omitIdentityScale)).join('|');
		}
		case GearType.Look: {
			const fixedAlpha = ownerType === 'GLoader'
				|| Boolean(gear?.getTween() && !almostEqual(gear.getTweenDuration(), 0.3));
			return raw.split('|').map((segment) => normalizeGearLookSegment(segment, fixedAlpha)).join('|');
		}
		case GearType.Color: {
			const textLike = ownerType === 'GTextField' || ownerType === 'GRichTextField' || ownerType === 'GTextInput';
			const compactOutline = !textLike || shouldCompactTextGearColor(ownerType, ownerName);
			return raw.split('|').map((segment) => normalizeGearColorSegment(segment, compactOutline)).join('|');
		}
		default:
			return raw;
	}
}

function getProtocolGearChildNameSet(protocol: XmlNodeProtocol): Set<string> {
	const gearTagNames = new Set(Object.values(GEAR_TAG));
	return new Set(Object.keys(protocol.children ?? {}).filter((name) => gearTagNames.has(name)));
}

export function writeDisplayObjectBehaviors(
	attrs: Record<string, unknown>,
	obj: GObject,
	protocol: XmlNodeProtocol,
): void {
	const gearChildNameSet = getProtocolGearChildNameSet(protocol);
	assertDisplayObjectGearXmlValues(obj);
	for (const gear of obj.listGears()) {
		const gearTag = GEAR_TAG[gear.getGearType()];
		if (!gearTag || !gearChildNameSet.has(gearTag)) continue;
		attrs[gearTag] = [serializeGear(gear, obj.propertyType, obj.getName())];
	}

	// Relation child elements
	const relationChildName = getProtocolChildName(protocol, 'relation');
	const relations = obj.getRelations();
	if (relations.length > 0) {
		// Group by target
		const byTarget = new Map<string, string[]>();
		for (const rel of relations) {
			const name = RELATION_TYPE_NAME[rel.type] ?? '';
			if (!name) continue;
			const pair = rel.usePercent ? name + '%' : name;
			if (!byTarget.has(rel.target)) byTarget.set(rel.target, []);
			byTarget.get(rel.target)!.push(pair);
		}
		const relElements = Array.from(byTarget.entries()).map(([target, pairs]) => {
			const relationAttrs: Record<string, unknown> = {};
			writeXmlAttr(relationAttrs, PROJECT_XML_PROTOCOL.relation.attrs.target, target);
			writeXmlAttr(relationAttrs, PROJECT_XML_PROTOCOL.relation.attrs.sidePair, pairs.join(','));
			return relationAttrs;
		});
		if (relElements.length > 0 && relationChildName) attrs[relationChildName] = relElements;
	}
}

export function assertDisplayObjectGearXmlValues(obj: GObject): void {
	const types = new Set<number>();
	for (const gear of obj.listGears()) {
		const type = gear.getGearType();
		if (types.has(type)) throw new Error(`Display node "${obj.getId()}" has duplicate ${GEAR_TAG[type] ?? type} bindings.`);
		types.add(type);
		assertTextGearXmlValues(gear);
	}
}

function assertTextGearXmlValues(gear: Gear): void {
	if (gear.getGearType() !== GearType.Text && gear.getGearType() !== GearType.Icon) return;
	const values = gear.getPageValues();
	for (const page of gear.getPages() ? gear.getPages().split(',') : []) {
		if (values[page]?.includes('|')) {
			throw new Error(`Project XML cannot represent "|" in Text/Icon gear page "${page}"; no verified delimiter escape is available.`);
		}
	}
}

function serializeGear(gear: Gear, ownerType?: string, ownerName?: string | null): Record<string, unknown> {
	const ctrl = gear.getController();
	const attrs: Record<string, unknown> = {};
	if (ctrl) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.controller, ctrl.getName());
	if (gear.getGearType() === GearType.Text || gear.getGearType() === GearType.Icon) {
		assertTextGearXmlValues(gear);
		const values = gear.getPageValues();
		const pages = (gear.getPages() ? gear.getPages().split(',') : []).filter((page) => values[page] != null);
		if (pages.length > 0) {
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.pages, pages.join(','));
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.values, pages.map((page) => values[page]).join('|'));
		}
	} else {
		if (gear.getPages()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.pages, gear.getPages());
		if (gear.getValues()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.values, normalizeGearXmlValue(gear.getGearType(), gear.getValues(), ownerType, ownerName ?? undefined, gear));
	}
	if (gear.getDefaultValue() !== null) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.default, normalizeGearXmlValue(gear.getGearType(), gear.getDefaultValue(), ownerType, ownerName ?? undefined, gear));
	if (gear.getTween()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.tween, 'true');
	if (gear.getEaseType() !== 5) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.ease, stringifyEaseType(gear.getEaseType()));
	if (gear.getTweenDuration() !== 0.3) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.duration, String(gear.getTweenDuration()));
	if (gear.getTweenDelay() !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.delay, String(gear.getTweenDelay()));
	if (gear.getPositionsInPercent()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.positionsInPercent, 'true');
	if (gear.getCondition()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.gear.attrs.condition, gear.getCondition());
	return attrs;
}
