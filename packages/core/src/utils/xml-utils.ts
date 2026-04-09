import { XMLParser } from 'fast-xml-parser';

const defaultOptions = {
	ignoreAttributes: false,
	attributeNamePrefix: '',
	parseAttributeValue: false,
	allowBooleanAttributes: true,
	processEntities: true,
	htmlEntities: true,
	trimValues: true,
	isArray: (tagName: string) => {
		return ARRAY_TAGS.has(tagName);
	},
};

const ARRAY_TAGS = new Set([
	'image', 'component', 'font', 'sound', 'movieclip', 'swf', 'atlas', 'misc',
	'text', 'richtext', 'inputtext', 'graph', 'group', 'loader', 'list',
	'controller', 'transition', 'item',
	'relation',
	'gearDisplay', 'gearXY', 'gearSize', 'gearLook', 'gearColor',
	'gearAni', 'gearText', 'gearIcon', 'gearDisplay2', 'gearFontSize',
	'action',
]);

const parser = new XMLParser(defaultOptions);
const preserveOrderParser = new XMLParser({
	...defaultOptions,
	preserveOrder: true,
});

export function parseXML(xml: string): Record<string, unknown> {
	return parser.parse(xml);
}

export function parseXMLPreserveOrder(xml: string): Array<Record<string, unknown>> {
	return preserveOrderParser.parse(xml);
}

export function parseXYString(v: string | undefined): [number, number] {
	if (!v) return [0, 0];
	const parts = v.split(',');
	return [parseFloat(parts[0]) || 0, parseFloat(parts[1]) || 0];
}

export function parseSizeString(v: string | undefined): [number, number] {
	if (!v) return [0, 0];
	const parts = v.split(',');
	return [parseFloat(parts[0]) || 0, parseFloat(parts[1]) || 0];
}

export function parseScale9GridString(v: string | undefined): [number, number, number, number] | null {
	if (!v) return null;
	const parts = v.split(',');
	if (parts.length < 4) return null;
	return [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
}

export function parseControllerPages(pagesStr: string): Array<{ id: string; name: string }> {
	if (!pagesStr) return [];
	const parts = pagesStr.split(',');
	const pages: Array<{ id: string; name: string }> = [];
	for (let i = 0; i < parts.length; i += 2) {
		pages.push({ id: parts[i] || '', name: parts[i + 1] || '' });
	}
	return pages;
}

export function parseMarginString(v: string | undefined): [number, number, number, number] {
	if (!v) return [0, 0, 0, 0];
	const parts = v.split(',');
	return [
		parseFloat(parts[0]) || 0,
		parseFloat(parts[1]) || 0,
		parseFloat(parts[2]) || 0,
		parseFloat(parts[3]) || 0,
	];
}

export function parseBool(v: string | boolean | undefined): boolean {
	if (v === undefined || v === null) return false;
	if (typeof v === 'boolean') return v;
	const normalized = v.trim().toLowerCase();
	return normalized === '' || normalized === 'true' || normalized === '1';
}

export function parseFloat2(v: string | number | undefined, defaultValue = 0): number {
	if (v === undefined || v === null) return defaultValue;
	if (typeof v === 'number') return v;
	const n = parseFloat(v);
	return Number.isNaN(n) ? defaultValue : n;
}

export function parseInt2(v: string | number | undefined, defaultValue = 0): number {
	if (v === undefined || v === null) return defaultValue;
	if (typeof v === 'number') return v;
	const n = parseInt(v, 10);
	return Number.isNaN(n) ? defaultValue : n;
}

const RELATION_TYPE_MAP: Record<string, number> = {
	'left-left': 0, 'left-center': 1, 'left-right': 2,
	'center-center': 3,
	'right-left': 4, 'right-center': 5, 'right-right': 6,
	'top-top': 7, 'top-middle': 8, 'top-bottom': 9,
	'middle-middle': 10,
	'bottom-top': 11, 'bottom-middle': 12, 'bottom-bottom': 13,
	'width-width': 14, 'height-height': 15,
	'leftext-left': 16, 'leftext-right': 17,
	'rightext-left': 18, 'rightext-right': 19,
	'topext-top': 20, 'topext-bottom': 21,
	'bottomext-top': 22, 'bottomext-bottom': 23,
};

export function parseSidePair(sidePair: string): Array<{ type: number; usePercent: boolean }> {
	if (!sidePair) return [];
	return sidePair.split(',').map((pair) => {
		const usePercent = pair.endsWith('%');
		const clean = usePercent ? pair.slice(0, -1) : pair;
		const type = RELATION_TYPE_MAP[clean] ?? 0;
		return { type, usePercent };
	});
}

export function ensureArray<T>(v: T | T[] | undefined): T[] {
	if (v === undefined || v === null) return [];
	return Array.isArray(v) ? v : [v];
}
