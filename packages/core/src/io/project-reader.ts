import { Document } from '../document.js';
import { GearType, type RelationDef } from '../constants.js';
import type { Component } from '../properties/component.js';
import type { GObject } from '../properties/g-object.js';
import type { Controller } from '../properties/controller.js';
import type { Package } from '../properties/package.js';
import type { ProjectSettings } from '../types/settings.js';
import {
	parseXML,
	parseXMLPreserveOrder,
	parseXYString,
	parseSizeString,
	parseScale9GridString,
	parseControllerPages,
	parseBool,
	parseFloat2,
	parseInt2,
	parseSidePair,
	ensureArray,
} from '../utils/xml-utils.js';
import { ReaderContext } from './reader-context.js';

/** Map ease type string to numeric code matching editor's EaseType.parseEaseType. */
function _parseEaseType(ease: string): number {
	const map: Record<string, number> = {
		Linear: 0, SineIn: 1, SineOut: 2, SineInOut: 3,
		QuadIn: 4, QuadOut: 5, QuadInOut: 6,
		CubicIn: 7, CubicOut: 8, CubicInOut: 9,
		QuartIn: 10, QuartOut: 11, QuartInOut: 12,
		QuintIn: 13, QuintOut: 14, QuintInOut: 15,
		ExpoIn: 16, ExpoOut: 17, ExpoInOut: 18,
		CircIn: 19, CircOut: 20, CircInOut: 21,
		ElasticIn: 22, ElasticOut: 23, ElasticInOut: 24,
		BackIn: 25, BackOut: 26, BackInOut: 27,
		BounceIn: 28, BounceOut: 29, BounceInOut: 30,
		Custom: 31,
	};
	return map[ease] ?? 5; // default QuadOut
}

// Maps XML tag names for display objects to factory method names.
const DISPLAY_TAG_MAP: Record<string, string> = {
	image: 'GImage',
	text: 'GTextField',
	richtext: 'GRichTextField',
	inputtext: 'GTextInput',
	graph: 'GGraph',
	group: 'GGroup',
	loader: 'GLoader',
	loader3d: 'GLoader3D',
	movieclip: 'GMovieClip',
	jta: 'GMovieClip',
	component: 'GComponent',
	list: 'GList',
	tree: 'GTree',
};

// Maps extension type (from <component extention="...">) to extended component type.
const EXTENSION_TYPE_MAP: Record<string, string> = {
	Button: 'GButton',
	Label: 'GLabel',
	ComboBox: 'GComboBox',
	ProgressBar: 'GProgressBar',
	Slider: 'GSlider',
	ScrollBar: 'GScrollBar',
};

// Maps gear XML element names to gear type indices.
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

type XmlNode = Record<string, unknown>;
type OrderedXmlEntry = Record<string, unknown>;

type ProjectSettingKey = 'publish' | 'common' | 'adaptation' | 'customProperties' | 'i18n';

interface FairyProjectDescriptionNode extends XmlNode {
	id?: string;
	type?: string;
	version?: string;
}

interface PackagePublishNode {
	name?: string;
}

interface PackageResourcesNode extends Record<string, unknown> {}

interface PackageDescriptionNode extends XmlNode {
	id?: string;
	publish?: PackagePublishNode;
	resources?: PackageResourcesNode;
}

interface ResourceXmlAttrs extends XmlNode {
	id?: string;
	name?: string;
	path?: string;
	exported?: string | boolean;
	scale?: string;
	scale9grid?: string;
	smoothing?: string | boolean;
	duplicatePadding?: string | boolean;
	texture?: string;
}

interface ControllerXmlNode {
	name?: string;
	selected?: string | number;
	pages?: string;
}

interface TransitionItemXmlNode {
	time?: string | number;
	target?: string;
	tween?: string | boolean;
	duration?: string | number;
	repeat?: string | number;
	yoyo?: string | boolean;
	label?: string;
	label2?: string;
	path?: string;
	ease?: string;
	type?: string;
	value?: string | number;
	startValue?: string | number;
	endValue?: string | number;
}

interface TransitionXmlNode {
	name?: string;
	autoPlay?: string | boolean;
	autoPlayTimes?: string | number;
	autoPlayDelay?: string | number;
	options?: string | number;
	fps?: string | number;
	item?: TransitionItemXmlNode | TransitionItemXmlNode[];
}

interface RelationXmlNode {
	target?: string;
	sidePair?: string;
}

interface GearXmlNode extends XmlNode {
	tween?: string | boolean;
	controller?: string;
	pages?: string;
	values?: string;
	default?: string;
	condition?: string;
}

interface ListItemXmlNode {
	title?: string;
	icon?: string;
	url?: string;
	name?: string;
	selectedTitle?: string;
	selectedIcon?: string;
	level?: string | number;
	isFolder?: string | boolean;
}

interface ComboItemXmlNode {
	title?: string;
	value?: string;
	icon?: string;
}

interface ExtensionXmlNode extends Record<string, unknown> {
	mode?: string | number;
	sound?: string;
	soundVolumeScale?: string | number;
	downEffect?: string | number;
	downEffectValue?: string | number;
	dropdown?: string;
	titleType?: string | number;
	reverse?: string | boolean;
	wholeNumbers?: string | boolean;
	changeOnClick?: string | boolean;
	fixedGripSize?: string | boolean;
	title?: string;
	selectedTitle?: string;
	icon?: string;
	selectedIcon?: string;
	titleColor?: string;
	titleFontSize?: string | number;
	controller?: string;
	page?: string;
	checked?: string | boolean;
	visibleItemCount?: string | number;
	value?: string | number;
	max?: string | number;
	min?: string | number;
	item?: ComboItemXmlNode | ComboItemXmlNode[];
}

interface DisplayObjectXmlNode extends Record<string, unknown> {
	id?: string;
	name?: string;
	src?: string;
	url?: string;
	text?: string;
	fontSize?: string | number;
	font?: string;
	color?: string;
	align?: string;
	vAlign?: string;
	autoSize?: string;
	singleLine?: string | boolean;
	ubb?: string | boolean;
	leading?: string | number;
	letterSpacing?: string | number;
	underline?: string | boolean;
	italic?: string | boolean;
	bold?: string | boolean;
	strikethrough?: string | boolean;
	strokeColor?: string;
	strokeSize?: string | number;
	shadowColor?: string;
	shadowOffset?: string;
	input?: string | boolean;
	prompt?: string;
	promptText?: string;
	maxLength?: string | number;
	restrict?: string;
	password?: string | boolean;
	keyboardType?: string | number;
	type?: string;
	lineSize?: string | number;
	lineColor?: string;
	fillColor?: string;
	corner?: string;
	points?: string;
	sides?: string | number;
	startAngle?: string | number;
	distances?: string;
	layout?: string;
	lineGap?: string | number;
	columnGap?: string | number;
	colGap?: string | number;
	fill?: string;
	shrinkOnly?: string | boolean;
	autoSizeDisabled?: string | boolean;
	playing?: string | boolean;
	frame?: string | number;
	fillMethod?: string;
	flip?: string | number;
	fillOrigin?: string | number;
	fillClockwise?: string | boolean;
	fillAmount?: string | number;
	useResize?: string | boolean;
	animationName?: string;
	skinName?: string;
	loop?: string | boolean;
	defaultItem?: string;
	treeView?: string | boolean;
	indent?: string | number;
	clickToExpand?: string | number;
	selectionMode?: string;
	overflow?: string;
	scroll?: string;
	scrollBarFlags?: string | number;
	scrollBarRes?: string;
	ptrRes?: string;
	margin?: string;
	clipSoftness?: string;
	controller?: string;
	pageController?: string;
	item?: ListItemXmlNode | ListItemXmlNode[];
	xy?: string;
	size?: string;
	pivot?: string;
	anchor?: string | boolean;
	scale?: string;
	skew?: string;
	rotation?: string | number;
	alpha?: string | number;
	visible?: string | boolean;
	touchable?: string | boolean;
	grayed?: string | boolean;
	tooltips?: string;
	customData?: string;
	group?: string;
	advanced?: string | boolean;
	relation?: RelationXmlNode | RelationXmlNode[];
	gearDisplay?: GearXmlNode | GearXmlNode[];
	gearXY?: GearXmlNode | GearXmlNode[];
	gearSize?: GearXmlNode | GearXmlNode[];
	gearLook?: GearXmlNode | GearXmlNode[];
	gearColor?: GearXmlNode | GearXmlNode[];
	gearAni?: GearXmlNode | GearXmlNode[];
	gearText?: GearXmlNode | GearXmlNode[];
	gearIcon?: GearXmlNode | GearXmlNode[];
	gearDisplay2?: GearXmlNode | GearXmlNode[];
	gearFontSize?: GearXmlNode | GearXmlNode[];
	Button?: ExtensionXmlNode | ExtensionXmlNode[];
	Label?: ExtensionXmlNode | ExtensionXmlNode[];
	ComboBox?: ExtensionXmlNode | ExtensionXmlNode[];
	ProgressBar?: ExtensionXmlNode | ExtensionXmlNode[];
	Slider?: ExtensionXmlNode | ExtensionXmlNode[];
	ScrollBar?: ExtensionXmlNode | ExtensionXmlNode[];
}

interface ComponentXmlNode extends Record<string, unknown> {
	size?: string;
	overflow?: string;
	pivot?: string;
	anchor?: string | boolean;
	margin?: string;
	restrictSize?: string;
	clipSoftness?: string;
	opaque?: string | boolean;
	mask?: string;
	reversedMask?: string | boolean;
	hitTest?: string;
	customData?: string;
	scroll?: string;
	scrollBar?: string;
	scrollBarFlags?: string | number;
	scrollBarMargin?: string;
	scrollBarRes?: string;
	ptrRes?: string;
	extention?: string;
	controller?: ControllerXmlNode | ControllerXmlNode[];
	displayList?: Record<string, DisplayObjectXmlNode | DisplayObjectXmlNode[]>;
	transition?: TransitionXmlNode | TransitionXmlNode[];
	[key: string]: unknown;
}

interface ProjectComponentExtras extends Record<string, unknown> {
	_filePath?: string;
}

function appendOrderedValue(target: Record<string, unknown>, key: string, value: unknown): void {
	const current = target[key];
	if (current === undefined) {
		target[key] = value;
		return;
	}
	if (Array.isArray(current)) {
		current.push(value);
		return;
	}
	target[key] = [current, value];
}

function normalizeOrderedChildren(entries: OrderedXmlEntry[]): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const entry of entries) {
		const attrs = (entry[':@'] as Record<string, unknown> | undefined) ?? {};
		for (const [tagName, value] of Object.entries(entry)) {
			if (tagName === ':@' || tagName === '#text') continue;
			const nestedEntries = Array.isArray(value) ? (value as OrderedXmlEntry[]) : [];
			const normalizedChildren = normalizeOrderedChildren(nestedEntries);
			const normalizedValue = Object.keys(normalizedChildren).length > 0
				? { ...attrs, ...normalizedChildren }
				: { ...attrs };
			appendOrderedValue(out, tagName, normalizedValue);
		}
	}
	return out;
}

function getOrderedDisplayListItems(xmlContent: string): Array<{ tagName: string; attrs: DisplayObjectXmlNode }> {
	const ordered = parseXMLPreserveOrder(xmlContent);
	const componentEntry = ordered.find((entry) => 'component' in entry);
	if (!componentEntry) return [];
	const componentChildren = Array.isArray(componentEntry.component)
		? (componentEntry.component as OrderedXmlEntry[])
		: [];
	const displayListEntry = componentChildren.find((entry) => 'displayList' in entry);
	if (!displayListEntry) return [];
	const displayListChildren = Array.isArray(displayListEntry.displayList)
		? (displayListEntry.displayList as OrderedXmlEntry[])
		: [];

	return displayListChildren.flatMap((entry) => {
		const tagName = Object.keys(entry).find((key) => key !== ':@' && key !== '#text');
		if (!tagName) return [];
		const attrs = (entry[':@'] as Record<string, unknown> | undefined) ?? {};
		const nestedEntries = Array.isArray(entry[tagName]) ? (entry[tagName] as OrderedXmlEntry[]) : [];
		return [{
			tagName,
			attrs: {
				...attrs,
				...normalizeOrderedChildren(nestedEntries),
			} as DisplayObjectXmlNode,
		}];
	});
}

function getOrderedPackageResourceItems(xmlContent: string): Array<{ tagName: string; attrs: ResourceXmlAttrs }> {
	const ordered = parseXMLPreserveOrder(xmlContent);
	const packageEntry = ordered.find((entry) => 'packageDescription' in entry);
	if (!packageEntry) return [];
	const packageChildren = Array.isArray(packageEntry.packageDescription)
		? (packageEntry.packageDescription as OrderedXmlEntry[])
		: [];
	const resourcesEntry = packageChildren.find((entry) => 'resources' in entry);
	if (!resourcesEntry) return [];
	const resourcesChildren = Array.isArray(resourcesEntry.resources)
		? (resourcesEntry.resources as OrderedXmlEntry[])
		: [];

	return resourcesChildren.flatMap((entry) => {
		const tagName = Object.keys(entry).find((key) => key !== ':@' && key !== '#text');
		if (!tagName) return [];
		const attrs = (entry[':@'] as Record<string, unknown> | undefined) ?? {};
		return [{
			tagName,
			attrs: attrs as ResourceXmlAttrs,
		}];
	});
}

function getXmlNode<T extends XmlNode>(value: unknown): T | null {
	const node = Array.isArray(value) ? value[0] : value;
	if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
	return node as T;
}

function assignSetting(
	settings: ProjectSettings,
	key: ProjectSettingKey,
	value: unknown,
): void {
	switch (key) {
		case 'publish':
			settings.publish = value as ProjectSettings['publish'];
			break;
		case 'common':
			settings.common = value as ProjectSettings['common'];
			break;
		case 'adaptation':
			settings.adaptation = value as ProjectSettings['adaptation'];
			break;
		default:
			settings[key] = value;
			break;
	}
}

function getProjectComponentExtras(comp: { getExtras(): Record<string, unknown> }): ProjectComponentExtras {
	return comp.getExtras() as ProjectComponentExtras;
}

function parseButtonMode(value: unknown): number {
	if (typeof value === 'number') return value;
	const normalized = String(value ?? '').trim().toLowerCase();
	const map: Record<string, number> = {
		common: 0,
		check: 1,
		radio: 2,
	};
	const parsed = Number(normalized);
	return map[normalized] ?? (Number.isFinite(parsed) ? parsed : 0);
}

function parseTitleType(value: unknown): number {
	if (typeof value === 'number') return value;
	const normalized = String(value ?? '').trim().toLowerCase();
	const map: Record<string, number> = {
		percent: 0,
		valueandmax: 1,
		value: 2,
		max: 3,
	};
	const parsed = Number(normalized);
	return map[normalized] ?? (Number.isFinite(parsed) ? parsed : 0);
}

export interface FileSystem {
	readFile(path: string): Promise<string>;
	readFileRaw(path: string): Promise<Uint8Array>;
	writeFile(path: string, content: string): Promise<void>;
	writeFileRaw(path: string, data: Uint8Array): Promise<void>;
	mkdir(path: string): Promise<void>;
	readdir(path: string): Promise<string[]>;
	exists(path: string): Promise<boolean>;
	join(...paths: string[]): string;
	dirname(path: string): string;
}

export class ProjectReader {
	private readonly _fs: FileSystem;

	constructor(fs: FileSystem) {
		this._fs = fs;
	}

	async read(projectPath: string): Promise<Document> {
		const fs = this._fs;
		const doc = new Document();
		const basePath = projectPath.replace(/[/\\][^/\\]*\.fairy$/i, '');
		const ctx = new ReaderContext(doc, basePath);

		// 1. Parse .fairy file
		const fairyContent = await fs.readFile(projectPath);
		const fairyXML = parseXML(fairyContent);
		const projDesc = getXmlNode<FairyProjectDescriptionNode>(fairyXML.projectDescription);
		if (projDesc) {
			const root = doc.getRoot();
			root.setProjectId(projDesc.id ?? '');
			root.setProjectType(this._resolveProjectType(projDesc.type ?? ''));
			root.setVersion(projDesc.version ?? '');
		}

		// 2. Read settings
		await this._readSettings(ctx);

		// 3. Scan packages
		const assetsPath = fs.join(basePath, 'assets');
		let packageDirs: string[];
		try {
			packageDirs = await fs.readdir(assetsPath);
		} catch {
			packageDirs = [];
		}

		for (const dirName of packageDirs) {
			const pkgXmlPath = fs.join(assetsPath, dirName, 'package.xml');
			if (!(await fs.exists(pkgXmlPath))) continue;

			await this._readPackage(ctx, dirName, pkgXmlPath);
		}

		// 4. Parse component XMLs (second pass, after all resources registered)
		for (const [_key, resource] of ctx.resourceMap) {
			if (resource.propertyType !== 'Component') continue;
			const comp = resource as Component;
			const compPath = getProjectComponentExtras(comp)._filePath;
			if (!compPath) continue;

			try {
				const compContent = await fs.readFile(compPath);
				this._parseComponentXML(ctx, comp, compContent);
			} catch (err) {
				ctx.logger.warn(`Failed to parse component: ${compPath} — ${err}`);
			}
		}

		return doc;
	}

	private async _readSettings(ctx: ReaderContext): Promise<void> {
		const fs = this._fs;
		const settingsPath = fs.join(ctx.basePath, 'settings');

		const settingFiles: Array<{ name: string; key: ProjectSettingKey }> = [
			{ name: 'Publish.json', key: 'publish' },
			{ name: 'Common.json', key: 'common' },
			{ name: 'Adaptation.json', key: 'adaptation' },
			{ name: 'CustomProperties.json', key: 'customProperties' },
			{ name: 'i18n.json', key: 'i18n' },
		];

		for (const { name, key } of settingFiles) {
			try {
				const filePath = fs.join(settingsPath, name);
				if (await fs.exists(filePath)) {
					const content = await fs.readFile(filePath);
					assignSetting(ctx.settings, key, JSON.parse(content));
				}
			} catch {
				// Skip missing/invalid settings files.
			}
		}

		ctx.document.getRoot().setSettings(ctx.settings);
	}

	private async _readPackage(ctx: ReaderContext, dirName: string, pkgXmlPath: string): Promise<void> {
		const fs = this._fs;
		const content = await fs.readFile(pkgXmlPath);
		const xml = parseXML(content);
		const desc = getXmlNode<PackageDescriptionNode>(xml.packageDescription);
		if (!desc) return;

		const pkg = ctx.document.createPackage(dirName);
		pkg.setId(desc.id || '');

		// Publish name
		const publish = desc.publish;
		if (publish) {
			pkg.setPublishName(publish.name || dirName);
		}

		ctx.packageMap.set(pkg.getId(), pkg);

		// Parse resources
		const resources = desc.resources;
		if (!resources) return;

		const packageDir = fs.join(ctx.basePath, 'assets', dirName);

		const orderedResources = getOrderedPackageResourceItems(content);
		if (orderedResources.length > 0) {
			for (const { tagName, attrs } of orderedResources) {
				this._createResourceFromXML(ctx, pkg, tagName, attrs, packageDir);
			}
			return;
		}

		// Fallback for non-standard XML parser output.
		for (const tagName of ['image', 'component', 'font', 'sound', 'movieclip', 'swf', 'misc', 'atlas']) {
			const items = ensureArray(resources[tagName]);
			for (const item of items) {
				const attrs = getXmlNode<ResourceXmlAttrs>(item);
				if (!attrs) continue;
				this._createResourceFromXML(ctx, pkg, tagName, attrs, packageDir);
			}
		}
	}

	private _createResourceFromXML(
		ctx: ReaderContext,
		pkg: Package,
		tagName: string,
		attrs: ResourceXmlAttrs,
		packageDir: string,
	): void {
		const doc = ctx.document;
		const fs = this._fs;
		const id = attrs.id || '';
		const name = attrs.name || '';
		const path = attrs.path || '/';
		const exported = parseBool(attrs.exported);

		switch (tagName) {
			case 'image': {
				const res = doc.createImageResource(name.replace(/\.\w+$/, ''));
				res.setId(id);
				res.setPath(path);
				res.setExported(exported);
				res.setExtras({ ...res.getExtras(), _fileName: name });
				if (attrs.scale === '9grid' && attrs.scale9grid) {
					res.setScaleOption(1);
					res.setScale9Grid(parseScale9GridString(attrs.scale9grid));
				} else if (attrs.scale === 'tile') {
					res.setScaleOption(2);
				}
				res.setDuplicatePadding(parseBool(attrs.duplicatePadding));
				res.setSmoothing(attrs.smoothing !== 'false');
				pkg.addResource(res);
				ctx.registerResource(pkg.getId(), id, res);
				break;
			}
			case 'component': {
				const res = doc.createComponent(name.replace(/\.xml$/i, ''));
				res.setId(id);
				res.setPath(path);
				res.setExported(exported);
				// Store file path for second-pass parsing
				const filePath = fs.join(packageDir, path.replace(/^\//, ''), name);
				res.setExtras({ ...res.getExtras(), _filePath: filePath });
				pkg.addResource(res);
				ctx.registerResource(pkg.getId(), id, res);
				break;
			}
			case 'sound': {
				const res = doc.createSoundResource(name.replace(/\.\w+$/, ''));
				res.setId(id);
				res.setPath(path);
				res.setFile(name);
				res.setExported(exported);
				pkg.addResource(res);
				ctx.registerResource(pkg.getId(), id, res);
				break;
			}
			case 'font': {
				const res = doc.createFontResource(name.replace(/\.\w+$/, ''));
				res.setId(id);
				res.setPath(path);
				res.setExported(exported);
				// Store texture reference and original filename for Bitmap Fonts
				if (attrs.texture) {
					res.setExtras({ ...res.getExtras(), _textureId: attrs.texture, _fileName: name });
				}
				pkg.addResource(res);
				ctx.registerResource(pkg.getId(), id, res);
				break;
			}
			case 'movieclip': {
				const res = doc.createMovieClipResource(name.replace(/\.\w+$/, ''));
				res.setId(id);
				res.setPath(path);
				res.setExported(exported);
				pkg.addResource(res);
				ctx.registerResource(pkg.getId(), id, res);
				break;
			}
			default: {
				// swf, misc, atlas — store as extras on package for now
				break;
			}
		}
	}

	private _parseComponentXML(ctx: ReaderContext, comp: Component, xmlContent: string): void {
		const xml = parseXML(xmlContent);
		const compNode = getXmlNode<ComponentXmlNode>(xml.component);
		if (!compNode) return;
		const orderedDisplayItems = getOrderedDisplayListItems(xmlContent);

		// fast-xml-parser may wrap in array due to isArray config
		const doc = ctx.document;

		// Size
		if (compNode.size) {
			const [w, h] = parseSizeString(compNode.size);
			comp.setSize(w, h);
		}

		// Overflow
		if (compNode.overflow) {
			const overflowMap: Record<string, number> = { visible: 0, hidden: 1, scroll: 2 };
			comp.setOverflow?.(overflowMap[compNode.overflow] ?? 0);
		}

		// Pivot
		if (compNode.pivot) {
			const parts = compNode.pivot.split(',');
			comp.setPivotX?.(parseFloat(parts[0]) || 0);
			comp.setPivotY?.(parseFloat(parts[1]) || 0);
			if (compNode.anchor) comp.setPivotAsAnchor?.(parseBool(compNode.anchor));
		}

		// Margin
		if (compNode.margin) {
			const parts = compNode.margin.split(',').map(Number);
			comp.setMargin?.({ top: parts[0] ?? 0, bottom: parts[1] ?? 0, left: parts[2] ?? 0, right: parts[3] ?? 0 });
		}

		// Restrict size
		if (compNode.restrictSize) {
			const parts = compNode.restrictSize.split(',').map(Number);
			comp.setMinWidth?.(parts[0] ?? 0);
			comp.setMaxWidth?.(parts[1] ?? 0);
			comp.setMinHeight?.(parts[2] ?? 0);
			comp.setMaxHeight?.(parts[3] ?? 0);
		}

		// Clip softness
		if (compNode.clipSoftness) {
			const parts = compNode.clipSoftness.split(',').map(Number);
			comp.setClipSoftness?.({ x: parts[0] ?? 0, y: parts[1] ?? 0 });
		}

		// Opaque
		if (compNode.opaque !== undefined) {
			comp.setOpaque?.(parseBool(compNode.opaque));
		}

		// Mask / HitTest / Custom data
		if (compNode.mask !== undefined) comp.setMask?.(compNode.mask);
		if (compNode.reversedMask !== undefined) comp.setReversedMask?.(parseBool(compNode.reversedMask));
		if (compNode.hitTest !== undefined) comp.setHitTest?.(compNode.hitTest);
		if (compNode.customData !== undefined) comp.setCustomData?.(compNode.customData);

		// Scroll pane data for overflow=scroll
		if (compNode.overflow === 'scroll') {
			if (compNode.scroll) {
				const scrollMap: Record<string, number> = { horizontal: 0, vertical: 1, both: 2 };
				comp.setScrollType?.(scrollMap[compNode.scroll] ?? 1);
			}
			if (compNode.scrollBar) {
				const barMap: Record<string, number> = { default: 0, visible: 1, auto: 2, hidden: 3 };
				comp.setScrollBarDisplay?.(barMap[compNode.scrollBar] ?? 0);
			}
			if (compNode.scrollBarFlags !== undefined) comp.setScrollBarFlags?.(parseInt2(compNode.scrollBarFlags));
			if (compNode.scrollBarMargin) {
				const parts = compNode.scrollBarMargin.split(',').map(Number);
				comp.setScrollBarMargin?.({
					top: parts[0] ?? 0,
					bottom: parts[1] ?? 0,
					left: parts[2] ?? 0,
					right: parts[3] ?? 0,
				});
			}
			if (compNode.scrollBarRes) {
				const parts = compNode.scrollBarRes.split(',');
				comp.setVtScrollBarRes?.(parts[0] ?? '');
				comp.setHzScrollBarRes?.(parts[1] ?? '');
			}
			if (compNode.ptrRes) {
				const parts = compNode.ptrRes.split(',');
				comp.setHeaderRes?.(parts[0] ?? '');
				comp.setFooterRes?.(parts[1] ?? '');
			}
		}

		// Extension type (Button, Label, etc.)
		if (compNode.extention) {
			const extType = EXTENSION_TYPE_MAP[compNode.extention];
			if (extType) {
				comp.setExtensionType?.(compNode.extention);
				// Parse extension element attributes (e.g. <Button mode="Check" sound="..."/>)
				const extElement = compNode[compNode.extention] as ExtensionXmlNode | ExtensionXmlNode[] | undefined;
				if (extElement) {
					const extAttrs = getXmlNode<ExtensionXmlNode>(extElement);
					if (extAttrs) {
						switch (compNode.extention) {
							case 'Button':
								if (extAttrs.mode !== undefined) comp.setButtonMode?.(parseButtonMode(extAttrs.mode));
								if (extAttrs.sound !== undefined) comp.setSound?.(String(extAttrs.sound));
								if (extAttrs.soundVolumeScale !== undefined) comp.setSoundVolumeScale?.(parseFloat2(extAttrs.soundVolumeScale, 1));
								if (extAttrs.downEffect !== undefined) comp.setDownEffect?.(parseInt2(extAttrs.downEffect));
								if (extAttrs.downEffectValue !== undefined) comp.setDownEffectValue?.(parseFloat2(extAttrs.downEffectValue, 0.8));
								break;
							case 'ComboBox':
								if (extAttrs.dropdown !== undefined) comp.setDropdown?.(String(extAttrs.dropdown));
								break;
							case 'ProgressBar':
								if (extAttrs.titleType !== undefined) comp.setTitleType?.(parseTitleType(extAttrs.titleType));
								if (extAttrs.reverse !== undefined) comp.setReverse?.(parseBool(extAttrs.reverse));
								break;
							case 'Slider':
								if (extAttrs.titleType !== undefined) comp.setTitleType?.(parseTitleType(extAttrs.titleType));
								if (extAttrs.reverse !== undefined) comp.setReverse?.(parseBool(extAttrs.reverse));
								if (extAttrs.wholeNumbers !== undefined) comp.setWholeNumbers?.(parseBool(extAttrs.wholeNumbers));
								if (extAttrs.changeOnClick !== undefined) comp.setChangeOnClick?.(parseBool(extAttrs.changeOnClick));
								break;
							case 'ScrollBar':
								if (extAttrs.fixedGripSize !== undefined) comp.setFixedGripSize?.(parseBool(extAttrs.fixedGripSize));
								break;
							default:
								break;
						}
					}
				}
			}
		}

		// Build a local controller map for this component
		const localControllers = new Map<string, Controller>();

		// Controllers
		const controllers = ensureArray(compNode.controller);
		for (const ctrlDef of controllers) {
			const ctrl = doc.createController(ctrlDef.name || '');
			ctrl.setSelectedIndex(parseInt2(ctrlDef.selected));

			// Parse pages: "0,up,1,down,2,over" → [{id:"0",name:"up"}, ...]
			const pages = parseControllerPages(ctrlDef.pages || '');
			for (const page of pages) {
				const p = doc.createControllerPage(page.name);
				p.setId(page.id);
				ctrl.addPage(p);
			}

			comp.addController(ctrl);
			localControllers.set(ctrl.getName(), ctrl);
		}

		// Display list
		if (orderedDisplayItems.length > 0) {
			for (const { tagName, attrs } of orderedDisplayItems) {
				if (!DISPLAY_TAG_MAP[tagName]) continue;
				const child = this._createDisplayObject(ctx, doc, tagName, attrs, localControllers);
				if (child) comp.addChild(child);
			}
		} else {
			const displayList = compNode.displayList;
			if (displayList) {
				for (const tagName of Object.keys(displayList)) {
					if (!DISPLAY_TAG_MAP[tagName]) continue;

					const items = ensureArray(displayList[tagName]);
					for (const itemDef of items) {
						const child = this._createDisplayObject(ctx, doc, tagName, itemDef, localControllers);
						if (child) {
							comp.addChild(child);
						}
					}
				}
			}
		}

		// Transitions
		const transitions = ensureArray(compNode.transition);
		for (const transDef of transitions) {
			const trans = doc.createTransition(transDef.name || '');
			trans.setAutoPlay(parseBool(transDef.autoPlay));
			trans.setAutoPlayTimes(parseInt2(transDef.autoPlayTimes, 1));
			trans.setAutoPlayDelay(parseFloat2(transDef.autoPlayDelay));
			if (transDef.options !== undefined) trans.setOptions?.(parseInt2(transDef.options));
			if (transDef.fps !== undefined) trans.setFps?.(parseInt2(transDef.fps));

			const items = ensureArray(transDef.item);
			for (const itemDef of items) {
				const ti = doc.createTransitionItem();
				ti.setTime(parseFloat2(itemDef.time));
				ti.setTargetId(itemDef.target || '');
				ti.setTween(parseBool(itemDef.tween));
				ti.setDuration(parseFloat2(itemDef.duration));
				ti.setRepeat(parseInt2(itemDef.repeat));
				ti.setYoyo(parseBool(itemDef.yoyo));
				ti.setLabel(itemDef.label || '');
				if (itemDef.label2 !== undefined) ti.setEndLabel?.(itemDef.label2);
				if (itemDef.path !== undefined) ti.setPath?.(itemDef.path);

				// Ease type
				if (itemDef.ease) {
					ti.setEaseType?.(_parseEaseType(itemDef.ease));
				}

				// Action type from string
				const typeStr = (itemDef.type || '').toUpperCase();
				const actionTypeMap: Record<string, number> = {
					XY: 0, SIZE: 1, SCALE: 2, PIVOT: 3, ALPHA: 4, ROTATION: 5,
					COLOR: 6, ANIMATION: 7, VISIBLE: 8, SOUND: 9, TRANSITION: 10,
					SHAKE: 11, COLORFILTER: 12, SKEW: 13, TEXT: 14, ICON: 15,
				};
				ti.setActionType(actionTypeMap[typeStr] ?? 16);

				// Values
				if (itemDef.value !== undefined) {
					ti.setStartValue(String(itemDef.value).split(','));
				}
				if (itemDef.startValue !== undefined) {
					ti.setStartValue(String(itemDef.startValue).split(','));
				}
				if (itemDef.endValue !== undefined) {
					ti.setEndValue(String(itemDef.endValue).split(','));
				}

				trans.addItem(ti);
			}

			comp.addTransition(trans);
		}
	}

	private _createDisplayObject(
		ctx: ReaderContext,
		doc: Document,
		tagName: string,
		attrs: DisplayObjectXmlNode,
		localControllers: Map<string, Controller>,
	): GObject | null {
		const name = attrs.name || '';
		let obj: GObject;

		switch (tagName) {
			case 'image': {
				const g = doc.createGImage(name);
				g.setSrc(attrs.src || '');
				if (attrs.color) g.setColor(attrs.color);
				if (attrs.flip !== undefined) {
					const flipRaw = String(attrs.flip).trim().toLowerCase();
					const flipMap: Record<string, number> = {
						hz: 1,
						horizontal: 1,
						vt: 2,
						vertical: 2,
						both: 3,
					};
					g.setFlip(flipMap[flipRaw] ?? parseInt2(attrs.flip));
				}
				if (attrs.fillMethod || attrs.fillOrigin !== undefined || attrs.fillClockwise !== undefined || attrs.fillAmount !== undefined) {
					const fillMap: Record<string, number> = { none: 0, hz: 1, vt: 2, radial90: 3, radial180: 4, radial360: 5 };
					const fillMethod = typeof attrs.fillMethod === 'string' ? attrs.fillMethod : undefined;
					g.setFillMethod(fillMap[fillMethod ?? ''] ?? 0);
					g.setFillOrigin(parseInt2(attrs.fillOrigin));
					g.setFillClockwise(attrs.fillClockwise !== 'false');
					g.setFillAmount(parseInt2(attrs.fillAmount, 100) / 100);
				}
				obj = g;
				break;
			}
			case 'text': {
				const isInputText = parseBool(attrs.input as string | boolean | undefined);
				const g = isInputText ? doc.createGTextInput(name) : doc.createGTextField(name);
				if (attrs.text !== undefined) g.setText(String(attrs.text));
				if (attrs.fontSize) g.setFontSize(parseInt2(attrs.fontSize));
				if (attrs.font) g.setFont(attrs.font);
				if (attrs.color) g.setColor(attrs.color);
				if (attrs.align) {
					const alignMap: Record<string, number> = { left: 0, center: 1, right: 2 };
					g.setAlign(alignMap[attrs.align] ?? 0);
				}
				if (attrs.vAlign) {
					const vAlignMap: Record<string, number> = { top: 0, middle: 1, bottom: 2 };
					g.setVAlign(vAlignMap[attrs.vAlign] ?? 0);
				}
				if (attrs.autoSize) {
					const autoSizeMap: Record<string, number> = { none: 0, both: 1, height: 2, shrink: 3, ellipsis: 4 };
					g.setAutoSize(autoSizeMap[attrs.autoSize] ?? 1);
				}
				if (attrs.singleLine) g.setSingleLine(parseBool(attrs.singleLine));
				if (attrs.ubb) g.setUbbEnabled(parseBool(attrs.ubb));
				if (attrs.leading !== undefined) g.setLeading?.(parseInt2(attrs.leading));
				if (attrs.letterSpacing !== undefined) g.setLetterSpacing?.(parseInt2(attrs.letterSpacing));
				if (attrs.underline) g.setUnderline?.(parseBool(attrs.underline));
				if (attrs.italic) g.setItalic?.(parseBool(attrs.italic));
				if (attrs.bold) g.setBold?.(parseBool(attrs.bold));
				if (attrs.strikethrough) g.setStrikethrough?.(parseBool(attrs.strikethrough));
				if (attrs.strokeColor) {
					g.setStrokeColor?.(attrs.strokeColor);
					g.setStrokeSize?.(parseInt2(attrs.strokeSize, 1));
				}
				if (attrs.shadowColor) {
					g.setShadowColor?.(attrs.shadowColor);
					const shadowParts = String(attrs.shadowOffset ?? '1,1').split(',');
					g.setShadowOffset?.({
						x: parseFloat(shadowParts[0] ?? '1') || 1,
						y: parseFloat(shadowParts[1] ?? '1') || 1,
					});
				}
				if (isInputText) {
					const input = g as ReturnType<Document['createGTextInput']>;
					if (attrs.prompt !== undefined) input.setPromptText(String(attrs.prompt));
					if (attrs.maxLength !== undefined) input.setMaxLength(parseInt2(attrs.maxLength));
					if (attrs.restrict !== undefined) input.setRestrict(String(attrs.restrict));
					if (attrs.password !== undefined) input.setPassword(parseBool(attrs.password as string | boolean | undefined));
					if (attrs.keyboardType !== undefined) input.setKeyboardType?.(parseInt2(attrs.keyboardType as string | number));
				}
				obj = g;
				break;
			}
			case 'richtext': {
				const g = doc.createGRichTextField(name);
				if (attrs.text !== undefined) g.setText(String(attrs.text));
				if (attrs.fontSize) g.setFontSize(parseInt2(attrs.fontSize));
				if (attrs.font) g.setFont(attrs.font);
				if (attrs.color) g.setColor(attrs.color);
				if (attrs.align) { const m: Record<string,number> = {left:0,center:1,right:2}; g.setAlign(m[attrs.align]??0); }
				if (attrs.vAlign) { const m: Record<string,number> = {top:0,middle:1,bottom:2}; g.setVAlign(m[attrs.vAlign]??0); }
				if (attrs.leading !== undefined) g.setLeading?.(parseInt2(attrs.leading));
				if (attrs.letterSpacing !== undefined) g.setLetterSpacing?.(parseInt2(attrs.letterSpacing));
				if (attrs.ubb) g.setUbbEnabled?.(parseBool(attrs.ubb));
				if (attrs.autoSize) { const m: Record<string,number> = {none:0,both:1,height:2,shrink:3}; g.setAutoSize(m[attrs.autoSize]??1); }
				if (attrs.singleLine) g.setSingleLine?.(parseBool(attrs.singleLine));
				if (attrs.underline) g.setUnderline?.(parseBool(attrs.underline));
				if (attrs.italic) g.setItalic?.(parseBool(attrs.italic));
				if (attrs.bold) g.setBold?.(parseBool(attrs.bold));
				if (attrs.strikethrough) g.setStrikethrough?.(parseBool(attrs.strikethrough));
				if (attrs.strokeColor) { g.setStrokeColor?.(attrs.strokeColor); g.setStrokeSize?.(parseInt2(attrs.strokeSize, 1)); }
				if (attrs.shadowColor) {
					g.setShadowColor?.(attrs.shadowColor);
					const shadowParts = String(attrs.shadowOffset ?? '1,1').split(',');
					g.setShadowOffset?.({
						x: parseFloat(shadowParts[0] ?? '1') || 1,
						y: parseFloat(shadowParts[1] ?? '1') || 1,
					});
				}
				obj = g;
				break;
			}
			case 'inputtext': {
				const g = doc.createGTextInput(name);
				if (attrs.text !== undefined) g.setText(String(attrs.text));
				if (attrs.fontSize) g.setFontSize(parseInt2(attrs.fontSize));
				if (attrs.font) g.setFont(attrs.font);
				if (attrs.color) g.setColor(attrs.color);
				if (attrs.align) { const m: Record<string,number> = {left:0,center:1,right:2}; g.setAlign(m[attrs.align]??0); }
				if (attrs.vAlign) { const m: Record<string,number> = {top:0,middle:1,bottom:2}; g.setVAlign(m[attrs.vAlign]??0); }
				if (attrs.leading !== undefined) g.setLeading?.(parseInt2(attrs.leading));
				if (attrs.letterSpacing !== undefined) g.setLetterSpacing?.(parseInt2(attrs.letterSpacing));
				if (attrs.autoSize) { const m: Record<string,number> = {none:0,both:1,height:2,shrink:3}; g.setAutoSize(m[attrs.autoSize]??1); }
				if (attrs.singleLine) g.setSingleLine?.(parseBool(attrs.singleLine));
				if (attrs.underline) g.setUnderline?.(parseBool(attrs.underline));
				if (attrs.italic) g.setItalic?.(parseBool(attrs.italic));
				if (attrs.bold) g.setBold?.(parseBool(attrs.bold));
				if (attrs.strikethrough) g.setStrikethrough?.(parseBool(attrs.strikethrough));
				if (attrs.strokeColor) { g.setStrokeColor?.(attrs.strokeColor); g.setStrokeSize?.(parseInt2(attrs.strokeSize, 1)); }
				if (attrs.promptText) g.setPromptText(attrs.promptText);
				if (attrs.maxLength) g.setMaxLength(parseInt2(attrs.maxLength));
				if (attrs.restrict) g.setRestrict(attrs.restrict);
				if (attrs.password) g.setPassword(parseBool(attrs.password as string | boolean | undefined));
				if (attrs.keyboardType !== undefined) g.setKeyboardType?.(parseInt2(attrs.keyboardType as string | number));
				obj = g;
				break;
			}
			case 'graph': {
				const g = doc.createGGraph(name);
				if (attrs.type) {
					const graphTypeMap: Record<string, number> = {
						rect: 1, eclipse: 2, ellipse: 2, polygon: 3, regularpolygon: 4, regular_polygon: 4,
					};
					g.setGraphType(graphTypeMap[attrs.type] ?? 0);
				}
				if (attrs.lineSize !== undefined) g.setLineSize(parseInt2(attrs.lineSize));
				if (attrs.lineColor) g.setLineColor(attrs.lineColor);
				if (attrs.fillColor) g.setFillColor(attrs.fillColor);
				if (attrs.corner) {
					const parts = attrs.corner.split(',').map(Number);
					g.setCornerRadius([
						parts[0] ?? 0,
						parts[1] ?? parts[0] ?? 0,
						parts[2] ?? parts[0] ?? 0,
						parts[3] ?? parts[0] ?? 0,
					]);
				}
				if (attrs.points) g.setPoints(attrs.points.split(',').map(Number));
				if (attrs.sides !== undefined) {
					g.setSides(parseInt2(attrs.sides));
					g.setStartAngle(parseFloat2(attrs.startAngle));
					if (attrs.distances) g.setDistances(attrs.distances.split(',').map(Number));
				}
				obj = g;
				break;
			}
			case 'group': {
				const g = doc.createGGroup(name);
				if (attrs.layout) {
					const layoutMap: Record<string, number> = { none: 0, horizontal: 1, vertical: 2 };
					g.setLayout(layoutMap[attrs.layout] ?? 0);
				}
				if (attrs.lineGap) g.setLineGap(parseInt2(attrs.lineGap));
				if (attrs.columnGap) g.setColumnGap(parseInt2(attrs.columnGap));
				if (attrs.advanced !== undefined) g.setAdvanced(parseBool(attrs.advanced));
				obj = g;
				break;
			}
			case 'loader': {
				const g = doc.createGLoader(name);
				if (attrs.url) g.setUrl(attrs.url);
				if (attrs.align) { const m: Record<string,number> = {left:0,center:1,right:2}; g.setAlign?.(m[attrs.align]??0); }
				if (attrs.vAlign) { const m: Record<string,number> = {top:0,middle:1,bottom:2}; g.setVAlign?.(m[attrs.vAlign]??0); }
				if (attrs.fill) {
					const fillMap: Record<string, number> = {
						none: 0, scale: 1, scaleMatchHeight: 2, scaleMatchWidth: 3, scaleFree: 4, scaleNoBorder: 5,
					};
					g.setFill(fillMap[attrs.fill] ?? 0);
				}
				if (attrs.shrinkOnly) g.setShrinkOnly?.(parseBool(attrs.shrinkOnly));
				if (attrs.autoSize) g.setAutoSize?.(parseBool(attrs.autoSize));
				if (attrs.useResize !== undefined) g.setUseResize?.(parseBool(attrs.useResize));
				if (attrs.color) g.setColor(attrs.color);
				if (attrs.playing !== undefined) g.setPlaying?.(parseBool(attrs.playing));
				if (attrs.frame !== undefined) g.setFrame?.(parseInt2(attrs.frame));
				if (attrs.fillMethod) {
					const fmMap: Record<string,number> = { none:0, hz:1, vt:2, radial90:3, radial180:4, radial360:5 };
					g.setFillMethod?.(fmMap[attrs.fillMethod] ?? 0);
					g.setFillOrigin?.(parseInt2(attrs.fillOrigin));
					g.setFillClockwise?.(attrs.fillClockwise !== 'false');
					g.setFillAmount?.(parseInt2(attrs.fillAmount, 100) / 100);
				}
				obj = g;
				break;
			}
			case 'loader3d': {
				const g = doc.createGLoader3D(name);
				if (attrs.url) g.setUrl(attrs.url);
				if (attrs.align) { const m: Record<string, number> = { left: 0, center: 1, right: 2 }; g.setAlign?.(m[attrs.align] ?? 0); }
				if (attrs.vAlign) { const m: Record<string, number> = { top: 0, middle: 1, bottom: 2 }; g.setVAlign?.(m[attrs.vAlign] ?? 0); }
				if (attrs.fill) {
					const fillMap: Record<string, number> = {
						none: 0, scale: 1, scaleMatchHeight: 2, scaleMatchWidth: 3, scaleFree: 4, scaleNoBorder: 5,
					};
					g.setFill(fillMap[attrs.fill] ?? 0);
				}
				if (attrs.shrinkOnly) g.setShrinkOnly?.(parseBool(attrs.shrinkOnly));
				if (attrs.autoSize) g.setAutoSize?.(parseBool(attrs.autoSize));
				if (attrs.animationName !== undefined) g.setAnimationName?.(String(attrs.animationName));
				if (attrs.skinName !== undefined) g.setSkinName?.(String(attrs.skinName));
				if (attrs.playing !== undefined) g.setPlaying?.(parseBool(attrs.playing));
				if (attrs.frame !== undefined) g.setFrame?.(parseInt2(attrs.frame));
				if (attrs.loop !== undefined) g.setLoop?.(parseBool(attrs.loop));
				if (attrs.color) g.setColor(attrs.color);
				obj = g;
				break;
			}
			case 'movieclip':
			case 'jta': {
				const g = doc.createGMovieClip(name);
				g.setSrc(attrs.src || '');
				if (attrs.playing !== undefined) g.setPlaying(parseBool(attrs.playing));
				if (attrs.frame !== undefined) g.setFrame(parseInt2(attrs.frame));
				if (attrs.color) g.setColor(attrs.color);
				obj = g;
				break;
			}
			case 'component': {
				const g = doc.createGComponent(name);
				g.setSrc(attrs.src || '');
				if (attrs.controller) g.setControllerOverrides?.(attrs.controller);
				if (attrs.pageController) g.setPageController?.(attrs.pageController);
				obj = g;
				break;
			}
			case 'list': {
				const isTree = attrs.treeView !== undefined && parseBool(attrs.treeView);
				const g = isTree ? doc.createGTree(name) : doc.createGList(name);
				g.setSrc(attrs.src || '');
				if (attrs.defaultItem) g.setDefaultItem(attrs.defaultItem);
				if (isTree) g.setTreeView?.(true);
				if (isTree && attrs.indent !== undefined) g.setIndent?.(parseInt2(attrs.indent));
				if (isTree && attrs.clickToExpand !== undefined) g.setClickToExpand?.(parseInt2(attrs.clickToExpand));
				if (attrs.scrollBarRes) {
					const parts = String(attrs.scrollBarRes).split(',');
					g.setVtScrollBarRes?.(parts[0] ?? '');
					g.setHzScrollBarRes?.(parts[1] ?? '');
				}
				if (attrs.ptrRes) {
					const parts = String(attrs.ptrRes).split(',');
					g.setHeaderRes?.(parts[0] ?? '');
					g.setFooterRes?.(parts[1] ?? '');
				}
				if (attrs.controller) g.setControllerOverrides?.(attrs.controller);
				if (attrs.pageController) g.setPageController?.(attrs.pageController);
				if (attrs.layout) {
					const layoutMap: Record<string, number> = {
						singleColumn: 0, singleRow: 1, flowHorizontal: 2, flowVertical: 3, pagination: 4,
						single_column: 0, single_row: 1, flow_hz: 2, flow_vt: 3,
						column: 0, row: 1,
					};
					g.setLayout(layoutMap[attrs.layout] ?? 0);
				}
				if (attrs.lineGap) g.setLineGap(parseInt2(attrs.lineGap));
				if (attrs.colGap || attrs.columnGap) g.setColumnGap(parseInt2(attrs.colGap || attrs.columnGap));
				if (attrs.selectionMode) {
					const selMap: Record<string, number> = { single: 0, multiple: 1, multipleSingleClick: 2, none: 3 };
					g.setSelectionMode(selMap[attrs.selectionMode] ?? 0);
				}
				// Overflow & scroll
				if (attrs.overflow || attrs.scroll || attrs.scrollBarFlags || attrs.margin) {
					if (attrs.overflow) {
						const overflowMap: Record<string, number> = { visible: 0, hidden: 1, scroll: 2 };
						g.setOverflow(overflowMap[attrs.overflow] ?? 0);
					}
					if (attrs.scroll) {
						const scrollMap: Record<string, number> = { horizontal: 0, vertical: 1, both: 2 };
						g.setScrollType(scrollMap[attrs.scroll] ?? 1);
					}
					if (attrs.scrollBarFlags !== undefined) g.setScrollBarFlags(parseInt2(attrs.scrollBarFlags));
					if (attrs.margin) {
						const parts = attrs.margin.split(',').map(Number);
						g.setMargin({
							top: parts[0] ?? 0,
							bottom: parts[1] ?? 0,
							left: parts[2] ?? 0,
							right: parts[3] ?? 0,
						});
					}
				}
				// clipSoftness
				if (attrs.clipSoftness) {
					const csParts = attrs.clipSoftness.split(',').map(Number);
					g.setClipSoftness({ x: csParts[0] ?? 0, y: csParts[1] ?? 0 });
				}
				// Parse static list items
				const items = ensureArray(attrs.item);
				if (items.length > 0) {
					const listItems = items.map((item) => ({
						title: item.title ?? null,
						icon: item.icon ?? null,
						url: item.url ?? null,
						name: item.name ?? null,
						selectedTitle: item.selectedTitle ?? null,
						selectedIcon: item.selectedIcon ?? null,
						level: parseInt2(item.level),
						isFolder: item.isFolder !== undefined ? parseBool(item.isFolder) : null,
					}));
					g.setListItems(listItems);
				}
				obj = g;
				break;
			}
			default:
				return null;
		}

		// Common GObject attributes
		obj.setId(attrs.id || '');
		if (attrs.xy) {
			const [x, y] = parseXYString(attrs.xy);
			obj.setXY(x, y);
		}
		if (attrs.size) {
			const [w, h] = parseSizeString(attrs.size);
			obj.setSize(w, h);
		}
		if (attrs.pivot) {
			const [px, py] = parseXYString(attrs.pivot);
			obj.setPivot(px, py, parseBool(attrs.anchor));
		}
		if (attrs.scale) {
			const [sx, sy] = parseXYString(attrs.scale);
			obj.setScale(sx, sy);
		}
		if (attrs.skew) {
			const [skewX, skewY] = parseXYString(attrs.skew);
			obj.setSkew(skewX, skewY);
		}
		if (attrs.rotation !== undefined) obj.setRotation(parseFloat2(attrs.rotation));
		if (attrs.alpha !== undefined) obj.setAlpha(parseFloat2(attrs.alpha, 1));
		if (attrs.visible === 'false') obj.setVisible(false);
		if (attrs.touchable === 'false') obj.setTouchable(false);
		if (attrs.grayed === 'true') obj.setGrayed(true);
		if (attrs.tooltips) obj.setTooltips(attrs.tooltips);
		if (attrs.customData) obj.setCustomData(attrs.customData);
		if (attrs.group) obj.setGroup(attrs.group);

		// Parse gear elements
		for (const gearTag of Object.keys(GEAR_TAG_MAP)) {
			const gearDefs = ensureArray(attrs[gearTag]);
			for (const gearDef of gearDefs) {
				const parsedGear = getXmlNode<GearXmlNode>(gearDef);
				if (!parsedGear) continue;
				this._parseGear(ctx, doc, obj, gearTag, parsedGear, localControllers);
			}
		}

		// Parse relation elements
		const relations = ensureArray(attrs.relation);
		for (const relDef of relations) {
			const sidePairs = parseSidePair(relDef.sidePair || '');
			for (const sp of sidePairs) {
				const rel: RelationDef = {
					target: relDef.target || '',
					type: sp.type,
					usePercent: sp.usePercent,
				};
				obj.addRelation(rel);
			}
		}

		// Parse extension overlay data for child component instances
		// e.g. <component id="n18" src="rpmb10"><Button title="点我" icon="..."/></component>
		for (const extTypeName of Object.keys(EXTENSION_TYPE_MAP)) {
			const extElement = attrs[extTypeName];
			if (extElement) {
				const extAttrs = getXmlNode<ExtensionXmlNode>(extElement);
				if (!extAttrs || obj.propertyType !== 'GComponent') continue;
				const componentObj = obj as ReturnType<Document['createGComponent']>;
				componentObj.setInstanceExtType?.(extTypeName);
				if (extAttrs.title !== undefined) componentObj.setInstanceTitle?.(extAttrs.title);
				if (extAttrs.selectedTitle !== undefined) componentObj.setInstanceSelectedTitle?.(extAttrs.selectedTitle);
				if (extAttrs.icon !== undefined) componentObj.setInstanceIcon?.(extAttrs.icon);
				if (extAttrs.selectedIcon !== undefined) componentObj.setInstanceSelectedIcon?.(extAttrs.selectedIcon);
				if (extAttrs.titleColor !== undefined) componentObj.setInstanceTitleColor?.(extAttrs.titleColor);
				if (extAttrs.titleFontSize !== undefined) componentObj.setInstanceTitleFontSize?.(parseInt2(extAttrs.titleFontSize));
				if (extAttrs.controller !== undefined) componentObj.setInstanceController?.(extAttrs.controller);
				if (extAttrs.page !== undefined) componentObj.setInstancePage?.(extAttrs.page);
				if (extAttrs.checked !== undefined) componentObj.setInstanceChecked?.(parseBool(extAttrs.checked));
				if (extAttrs.visibleItemCount !== undefined) componentObj.setInstanceVisibleItemCount?.(parseInt2(extAttrs.visibleItemCount));
				if (extAttrs.value !== undefined) componentObj.setInstanceValue?.(parseInt2(extAttrs.value));
				if (extAttrs.max !== undefined) componentObj.setInstanceMax?.(parseInt2(extAttrs.max, 100));
				if (extAttrs.min !== undefined) componentObj.setInstanceMin?.(parseInt2(extAttrs.min));
				if (extTypeName === 'ComboBox' && extAttrs.item) {
					const comboItems = ensureArray(extAttrs.item);
					componentObj.setInstanceComboItems?.(comboItems.map((item) => ({
						title: item.title ?? null,
						value: item.value ?? null,
						icon: item.icon ?? null,
					})));
				}
			}
		}

		return obj;
	}

	private _parseGear(
		_ctx: ReaderContext,
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
		gear.setTween(parseBool(attrs.tween));

		// Resolve controller reference
		const ctrlName = attrs.controller || '';
		const controller = localControllers.get(ctrlName) || null;
		if (controller) {
			gear.setController(controller);
		}

		// Parse pages and values
		if (attrs.pages) {
			gear.setPages(attrs.pages);
		}
		if (attrs.values) {
			gear.setValues(attrs.values);
		}
		if (attrs.default !== undefined) {
			gear.setDefaultValue(attrs.default);
		}
		if (attrs.condition !== undefined) {
			gear.setCondition(String(attrs.condition));
		}

		obj.addGear(gear);
	}

	private _resolveProjectType(typeStr: string): number {
		const map: Record<string, number> = {
			Unity: 0, Flash: 1, Starling: 2, CocosCreator: 3,
			Layabox: 4, LayaBox: 4, Egret: 5, Haxe: 6, Pixi: 7,
			LibGDX: 8, Unreal: 9, CryEngine: 10, MonoGame: 11, Vision: 12,
		};
		return map[typeStr] ?? 0;
	}
}
