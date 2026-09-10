import { GearType, type RelationDef } from '../constants.js';
import type { Document } from '../document.js';
import type { Controller } from '../properties/controller.js';
import type { GObject } from '../properties/g-object.js';
import { ensureArray, parseBool, parseFloat2, parseSidePair } from '../utils/xml-utils.js';
import { PROJECT_XML_PROTOCOL, readXmlAttr, type XmlNodeProtocol } from './project-xml-protocol.js';
import {
	getXmlNode,
	getProtocolChildName,
	type GearXmlNode,
	type RelationXmlNode,
	type DisplayObjectXmlNode,
} from './display-object-xml-shared.js';

function _parseEaseType(ease: string): number {
	const map: Record<string, number> = {
		Linear: 0,
		SineIn: 1,
		SineOut: 2,
		SineInOut: 3,
		QuadIn: 4,
		QuadOut: 5,
		QuadInOut: 6,
		CubicIn: 7,
		CubicOut: 8,
		CubicInOut: 9,
		QuartIn: 10,
		QuartOut: 11,
		QuartInOut: 12,
		QuintIn: 13,
		QuintOut: 14,
		QuintInOut: 15,
		ExpoIn: 16,
		ExpoOut: 17,
		ExpoInOut: 18,
		CircIn: 19,
		CircOut: 20,
		CircInOut: 21,
		ElasticIn: 22,
		ElasticOut: 23,
		ElasticInOut: 24,
		BackIn: 25,
		BackOut: 26,
		BackInOut: 27,
		BounceIn: 28,
		BounceOut: 29,
		BounceInOut: 30,
		Custom: 31,
	};
	const normalized = ease.replace(/[.\s_-]/g, '');
	return map[ease] ?? map[normalized] ?? 5; // default QuadOut
}

const GEAR_TAG_MAP: Record<string, number> = {
	gearDisplay: GearType.Display,
	gearXY: GearType.XY,
	gearSize: GearType.Size,
	gearLook: GearType.Look,
	gearColor: GearType.Color,
	gearAni: GearType.Animation,
	gearText: GearType.Text,
	gearIcon: GearType.Icon,
	gearDisplay2: GearType.Display2,
	gearFontSize: GearType.FontSize,
};

function getProtocolGearChildNames(protocol: XmlNodeProtocol): string[] {
	return Object.keys(protocol.children ?? {}).filter((name) => name in GEAR_TAG_MAP);
}

function parseGear(
	doc: Document,
	obj: GObject,
	gearTag: string,
	attrs: GearXmlNode,
	localControllers: Map<string, Controller>,
): void {
	const gearType = GEAR_TAG_MAP[gearTag];
	if (gearType === undefined) return;

	const gear = doc.createGear();
	gear.setGearType(gearType);
	const tween = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.tween);
	gear.setTween(parseBool(tween));
	const positionsInPercent = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.positionsInPercent);
	if (positionsInPercent !== undefined) {
		gear.setPositionsInPercent(parseBool(positionsInPercent));
	}

	// Resolve controller reference
	const ctrlName = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.controller) || '';
	const controller = localControllers.get(ctrlName) || null;
	if (controller) {
		gear.setController(controller);
	}

	// Parse pages and values
	const pages = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.pages);
	if (pages) {
		gear.setPages(pages);
	}
	const values = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.values);
	if (gearType === GearType.Text || gearType === GearType.Icon || values) {
		gear.setValues(values ?? '');
	}
	const defaultValue = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.default);
	if (defaultValue !== undefined) {
		gear.setDefaultValue(defaultValue);
	}
	const condition = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.condition);
	if (condition !== undefined) {
		gear.setCondition(String(condition));
	}
	const ease = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.ease);
	if (ease) {
		gear.setEaseType(_parseEaseType(ease));
	}
	const duration = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.duration);
	if (duration !== undefined) {
		gear.setTweenDuration(parseFloat2(duration));
	}
	const delay = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.delay);
	if (delay !== undefined) {
		gear.setTweenDelay(parseFloat2(delay));
	}

	obj.addGear(gear);
}

export function readDisplayBehaviors(
	doc: Document,
	obj: GObject,
	attrs: DisplayObjectXmlNode,
	objectProtocol: XmlNodeProtocol,
	localControllers: Map<string, Controller>,
): void {
	// Parse gear elements
	for (const gearTag of getProtocolGearChildNames(objectProtocol)) {
		const gearDefs = ensureArray(attrs[gearTag]);
		for (const gearDef of gearDefs) {
			const parsedGear = getXmlNode<GearXmlNode>(gearDef);
			if (!parsedGear) continue;
			parseGear(doc, obj, gearTag, parsedGear, localControllers);
		}
	}

	// Parse relation elements
	const relationChildName = getProtocolChildName(objectProtocol, 'relation');
	const relations = relationChildName ? ensureArray(attrs[relationChildName]) : [];
	for (const relDef of relations) {
		const parsedRelation = getXmlNode<RelationXmlNode>(relDef);
		if (!parsedRelation) continue;
		const sidePair = readXmlAttr<string>(parsedRelation, PROJECT_XML_PROTOCOL.relation.attrs.sidePair) || '';
		const sidePairs = parseSidePair(sidePair);
		for (const sp of sidePairs) {
			const target = readXmlAttr<string>(parsedRelation, PROJECT_XML_PROTOCOL.relation.attrs.target) || '';
			const rel: RelationDef = {
				target,
				type: sp.type,
				usePercent: sp.usePercent,
			};
			obj.addRelation(rel);
		}
	}
}
