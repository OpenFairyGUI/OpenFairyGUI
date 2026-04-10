import { Document } from '../document.js';
import { ControllerActionType, GearType, type RelationDef } from '../constants.js';
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
import { PROJECT_XML_PROTOCOL, readXmlAttr } from './project-xml-protocol.js';
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

const EXTENSION_PROTOCOL_MAP = {
	Button: PROJECT_XML_PROTOCOL.buttonExtension,
	Label: PROJECT_XML_PROTOCOL.labelExtension,
	ComboBox: PROJECT_XML_PROTOCOL.comboBoxExtension,
	ProgressBar: PROJECT_XML_PROTOCOL.progressBarExtension,
	Slider: PROJECT_XML_PROTOCOL.sliderExtension,
	ScrollBar: PROJECT_XML_PROTOCOL.scrollBarExtension,
} as const;

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
	action?: ControllerActionXmlNode | ControllerActionXmlNode[];
}

interface ControllerActionXmlNode {
	[key: string]: unknown;
	type?: string;
	fromPage?: string;
	toPage?: string;
	transition?: string;
	repeat?: string | number;
	delay?: string | number;
	stopOnExit?: string | boolean;
	objectId?: string;
	controller?: string;
	targetPage?: string;
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
	lineItemCount?: string | number;
	autoItemSize?: string | boolean;
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
	selectionController?: string;
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

function parseControllerActionType(value: unknown): number {
	const normalized = String(value ?? '').trim().toLowerCase();
	switch (normalized) {
		case 'play_transition':
			return ControllerActionType.PlayTransition;
		case 'change_page':
			return ControllerActionType.ChangePage;
		default:
			return ControllerActionType.PlayTransition;
	}
}

function parseControllerActionPages(value: unknown): string[] {
	const raw = String(value ?? '').trim();
	if (!raw) return [];
	return raw.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '');
}

function getXmlScalar(value: unknown): string {
	if (Array.isArray(value)) {
		return value.length > 0 ? String(value[0] ?? '') : '';
	}
	return value === undefined || value === null ? '' : String(value);
}

function inferTreeItemFolderFlags(items: Array<{
	title: string | null;
	icon: string | null;
	url: string | null;
	name: string | null;
	selectedTitle: string | null;
	selectedIcon: string | null;
	level: number;
	isFolder: boolean | null;
}>): Array<{
	title: string | null;
	icon: string | null;
	url: string | null;
	name: string | null;
	selectedTitle: string | null;
	selectedIcon: string | null;
	level: number;
	isFolder: boolean | null;
}> {
	return items.map((item, index) => {
		if (item.isFolder !== null) return item;
		const next = items[index + 1];
		if (next && next.level > item.level) {
			return { ...item, isFolder: true };
		}
		if (next && next.level <= item.level) {
			return { ...item, isFolder: false };
		}
		if (!item.icon && !item.url) {
			return { ...item, isFolder: true };
		}
		return { ...item, isFolder: false };
	});
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
				res.setFileName(name);
				res.setExported(exported);
				// Store texture reference for bitmap fonts.
				if (attrs.texture) {
					res.setTextureId(attrs.texture);
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
		const compSize = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.size);
		if (compSize) {
			const [w, h] = parseSizeString(compSize);
			comp.setSize(w, h);
		}

		// Overflow
		const overflow = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.overflow);
		if (overflow) {
			const overflowMap: Record<string, number> = { visible: 0, hidden: 1, scroll: 2 };
			comp.setOverflow?.(overflowMap[overflow] ?? 0);
		}

		// Pivot
		const pivot = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.pivot);
		if (pivot) {
			const parts = pivot.split(',');
			comp.setPivotX?.(parseFloat(parts[0]) || 0);
			comp.setPivotY?.(parseFloat(parts[1]) || 0);
			const anchor = readXmlAttr<string | boolean>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.anchor);
			if (anchor !== undefined) comp.setPivotAsAnchor?.(parseBool(anchor));
		}

		// Margin
		const margin = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.margin);
		if (margin) {
			const parts = margin.split(',').map(Number);
			comp.setMargin?.({ top: parts[0] ?? 0, bottom: parts[1] ?? 0, left: parts[2] ?? 0, right: parts[3] ?? 0 });
		}

		// Restrict size
		const restrictSize = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.restrictSize);
		if (restrictSize) {
			const parts = restrictSize.split(',').map(Number);
			comp.setMinWidth?.(parts[0] ?? 0);
			comp.setMaxWidth?.(parts[1] ?? 0);
			comp.setMinHeight?.(parts[2] ?? 0);
			comp.setMaxHeight?.(parts[3] ?? 0);
		}

		// Clip softness
		const clipSoftness = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.clipSoftness);
		if (clipSoftness) {
			const parts = clipSoftness.split(',').map(Number);
			comp.setClipSoftness?.({ x: parts[0] ?? 0, y: parts[1] ?? 0 });
		}

		// Opaque
		const opaque = readXmlAttr<string | boolean>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.opaque);
		if (opaque !== undefined) {
			comp.setOpaque?.(parseBool(opaque));
		}

		// Mask / HitTest / Custom data
		const mask = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.mask);
		if (mask !== undefined) comp.setMask?.(mask);
		const reversedMask = readXmlAttr<string | boolean>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.reversedMask);
		if (reversedMask !== undefined) comp.setReversedMask?.(parseBool(reversedMask));
		const hitTest = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.hitTest);
		if (hitTest !== undefined) comp.setHitTest?.(hitTest);
		const customData = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.customData);
		if (customData !== undefined) comp.setCustomData?.(customData);

		// Scroll pane data for overflow=scroll
		if (overflow === 'scroll') {
			const scroll = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.scroll);
			if (scroll) {
				const scrollMap: Record<string, number> = { horizontal: 0, vertical: 1, both: 2 };
				comp.setScrollType?.(scrollMap[scroll] ?? 1);
			}
			const scrollBar = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBar);
			if (scrollBar) {
				const barMap: Record<string, number> = { default: 0, visible: 1, auto: 2, hidden: 3 };
				comp.setScrollBarDisplay?.(barMap[scrollBar] ?? 0);
			}
			const scrollBarFlags = readXmlAttr<string | number>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBarFlags);
			if (scrollBarFlags !== undefined) comp.setScrollBarFlags?.(parseInt2(scrollBarFlags));
			const scrollBarMargin = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBarMargin);
			if (scrollBarMargin) {
				const parts = scrollBarMargin.split(',').map(Number);
				comp.setScrollBarMargin?.({
					top: parts[0] ?? 0,
					bottom: parts[1] ?? 0,
					left: parts[2] ?? 0,
					right: parts[3] ?? 0,
				});
			}
			const scrollBarRes = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.scrollBarRes);
			if (scrollBarRes) {
				const parts = scrollBarRes.split(',');
				comp.setVtScrollBarRes?.(parts[0] ?? '');
				comp.setHzScrollBarRes?.(parts[1] ?? '');
			}
			const ptrRes = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.ptrRes);
			if (ptrRes) {
				const parts = ptrRes.split(',');
				comp.setHeaderRes?.(parts[0] ?? '');
				comp.setFooterRes?.(parts[1] ?? '');
			}
		}

		// Extension type (Button, Label, etc.)
		const extention = readXmlAttr<string>(compNode, PROJECT_XML_PROTOCOL.componentRoot.attrs.extention);
		if (extention) {
			const extType = EXTENSION_TYPE_MAP[extention];
			if (extType) {
				comp.setExtensionType?.(extention);
				// Parse extension element attributes (e.g. <Button mode="Check" sound="..."/>)
				const extElement = compNode[extention] as ExtensionXmlNode | ExtensionXmlNode[] | undefined;
				if (extElement) {
					const extAttrs = getXmlNode<ExtensionXmlNode>(extElement);
					if (extAttrs) {
						switch (extention) {
							case 'Button':
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.mode) !== undefined) comp.setButtonMode?.(parseButtonMode(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.mode)!));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.sound) !== undefined) comp.setSound?.(String(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.sound)));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.soundVolumeScale) !== undefined) comp.setSoundVolumeScale?.(parseFloat2(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.soundVolumeScale), 1));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.downEffect) !== undefined) comp.setDownEffect?.(parseInt2(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.downEffect)));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.downEffectValue) !== undefined) comp.setDownEffectValue?.(parseFloat2(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Button.attrs.downEffectValue), 0.8));
								break;
							case 'ComboBox':
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ComboBox.attrs.dropdown) !== undefined) comp.setDropdown?.(String(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ComboBox.attrs.dropdown)));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ComboBox.attrs.selectionController) !== undefined) comp.setSelectionController?.(String(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ComboBox.attrs.selectionController)));
								break;
							case 'Label':
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Label.attrs.prompt) !== undefined) comp.setPromptText?.(String(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Label.attrs.prompt)));
								break;
							case 'ProgressBar':
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ProgressBar.attrs.titleType) !== undefined) comp.setTitleType?.(parseTitleType(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ProgressBar.attrs.titleType)!));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ProgressBar.attrs.reverse) !== undefined) comp.setReverse?.(parseBool(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ProgressBar.attrs.reverse)));
								break;
							case 'Slider':
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.titleType) !== undefined) comp.setTitleType?.(parseTitleType(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.titleType)!));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.reverse) !== undefined) comp.setReverse?.(parseBool(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.reverse)));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.wholeNumbers) !== undefined) comp.setWholeNumbers?.(parseBool(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.wholeNumbers)));
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.changeOnClick) !== undefined) comp.setChangeOnClick?.(parseBool(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.Slider.attrs.changeOnClick)));
								break;
							case 'ScrollBar':
								if (readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ScrollBar.attrs.fixedGripSize) !== undefined) comp.setFixedGripSize?.(parseBool(readXmlAttr(extAttrs, EXTENSION_PROTOCOL_MAP.ScrollBar.attrs.fixedGripSize)));
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
			const ctrlName = readXmlAttr<string>(ctrlDef, PROJECT_XML_PROTOCOL.controller.attrs.name) ?? '';
			const ctrl = doc.createController(ctrlName);
			const selected = readXmlAttr<string | number>(ctrlDef, PROJECT_XML_PROTOCOL.controller.attrs.selected);
			ctrl.setSelectedIndex(parseInt2(selected));

			// Parse pages: "0,up,1,down,2,over" → [{id:"0",name:"up"}, ...]
			const pagesAttr = readXmlAttr<string>(ctrlDef, PROJECT_XML_PROTOCOL.controller.attrs.pages) ?? '';
			const pages = parseControllerPages(pagesAttr);
			for (const page of pages) {
				const p = doc.createControllerPage(page.name);
				p.setId(page.id);
				ctrl.addPage(p);
			}

			const actions = ensureArray(ctrlDef.action);
			for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
				const actionDef = getXmlNode<ControllerActionXmlNode>(actions[actionIndex]);
				if (!actionDef) continue;
				const action = doc.createControllerAction(`${ctrl.getName()}_action${actionIndex}`);
				const actionType = parseControllerActionType(readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.type));
				const fromPage = readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.fromPage);
				const toPage = readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.toPage);
				action
					.setActionType(actionType)
					.setFromPage(parseControllerActionPages(fromPage))
					.setToPage(parseControllerActionPages(toPage));
				switch (actionType) {
					case ControllerActionType.PlayTransition:
						const transitionName = readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.transition);
						const repeat = readXmlAttr<string | number>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.repeat);
						const delay = readXmlAttr<string | number>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.delay);
						const stopOnExit = readXmlAttr<string | boolean>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.stopOnExit);
						action
							.setTransitionName(getXmlScalar(transitionName))
							.setPlayTimes(parseInt2(repeat, 1))
							.setDelay(parseFloat2(delay))
							.setStopOnExit(parseBool(stopOnExit));
						break;
					case ControllerActionType.ChangePage:
						const objectId = readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.objectId);
						const controllerName = readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.controller);
						const targetPage = readXmlAttr<string>(actionDef, PROJECT_XML_PROTOCOL.controllerAction.attrs.targetPage);
						action
							.setObjectId(getXmlScalar(objectId))
							.setControllerName(getXmlScalar(controllerName))
							.setTargetPage(getXmlScalar(targetPage));
						break;
					default:
						break;
				}
				ctrl.addAction(action);
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
			const transitionName = readXmlAttr<string>(transDef, PROJECT_XML_PROTOCOL.transition.attrs.name) ?? '';
			const trans = doc.createTransition(transitionName);
			const autoPlay = readXmlAttr<string | boolean>(transDef, PROJECT_XML_PROTOCOL.transition.attrs.autoPlay);
			const autoPlayTimes = readXmlAttr<string | number>(transDef, PROJECT_XML_PROTOCOL.transition.attrs.autoPlayTimes);
			const autoPlayDelay = readXmlAttr<string | number>(transDef, PROJECT_XML_PROTOCOL.transition.attrs.autoPlayDelay);
			const options = readXmlAttr<string | number>(transDef, PROJECT_XML_PROTOCOL.transition.attrs.options);
			const fps = readXmlAttr<string | number>(transDef, PROJECT_XML_PROTOCOL.transition.attrs.fps);
			trans.setAutoPlay(parseBool(autoPlay));
			trans.setAutoPlayTimes(parseInt2(autoPlayTimes, 1));
			trans.setAutoPlayDelay(parseFloat2(autoPlayDelay));
			if (options !== undefined) trans.setOptions?.(parseInt2(options));
			if (fps !== undefined) trans.setFps?.(parseInt2(fps));

			const items = ensureArray(transDef.item);
			for (const itemDef of items) {
				const ti = doc.createTransitionItem();
				const time = readXmlAttr<string | number>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.time);
				const target = readXmlAttr<string>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.target);
				const tween = readXmlAttr<string | boolean>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.tween);
				const duration = readXmlAttr<string | number>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.duration);
				const repeat = readXmlAttr<string | number>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.repeat);
				const yoyo = readXmlAttr<string | boolean>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.yoyo);
				const label = readXmlAttr<string>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.label);
				const label2 = readXmlAttr<string>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.label2);
				const pathValue = readXmlAttr<string>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.path);
				ti.setTime(parseFloat2(time));
				ti.setTargetId(target || '');
				ti.setTween(parseBool(tween));
				ti.setDuration(parseFloat2(duration));
				ti.setRepeat(parseInt2(repeat));
				ti.setYoyo(parseBool(yoyo));
				ti.setLabel(label || '');
				if (label2 !== undefined) ti.setEndLabel?.(label2);
				if (pathValue !== undefined) ti.setPath?.(pathValue);

				// Ease type
				const ease = readXmlAttr<string>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.ease);
				if (ease) {
					ti.setEaseType?.(_parseEaseType(ease));
				}

				// Action type from string
				const typeStr = (readXmlAttr<string>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.type) || '').toUpperCase();
				const actionTypeMap: Record<string, number> = {
					XY: 0, SIZE: 1, SCALE: 2, PIVOT: 3, ALPHA: 4, ROTATION: 5,
					COLOR: 6, ANIMATION: 7, VISIBLE: 8, SOUND: 9, TRANSITION: 10,
					SHAKE: 11, COLORFILTER: 12, SKEW: 13, TEXT: 14, ICON: 15,
				};
				ti.setActionType(actionTypeMap[typeStr] ?? 16);

				// Values
				const value = readXmlAttr<string>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.value);
				if (value !== undefined) {
					ti.setStartValue(String(value).split(','));
				}
				const startValue = readXmlAttr<string>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.startValue);
				if (startValue !== undefined) {
					ti.setStartValue(String(startValue).split(','));
				}
				const endValue = readXmlAttr<string>(itemDef, PROJECT_XML_PROTOCOL.transitionItem.attrs.endValue);
				if (endValue !== undefined) {
					ti.setEndValue(String(endValue).split(','));
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
					const prompt = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.prompt);
					if (prompt !== undefined) input.setPromptText(String(prompt));
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
				const richText = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.text);
				if (richText !== undefined) g.setText(String(richText));
				const richTextFontSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.fontSize);
				if (richTextFontSize !== undefined) g.setFontSize(parseInt2(richTextFontSize));
				const richTextFont = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.font);
				if (richTextFont) g.setFont(richTextFont);
				const richTextColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.color);
				if (richTextColor) g.setColor(richTextColor);
				const richTextAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.align);
				if (richTextAlign) { const m: Record<string,number> = {left:0,center:1,right:2}; g.setAlign(m[richTextAlign]??0); }
				const richTextVAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.vAlign);
				if (richTextVAlign) { const m: Record<string,number> = {top:0,middle:1,bottom:2}; g.setVAlign(m[richTextVAlign]??0); }
				const richTextLeading = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.leading);
				if (richTextLeading !== undefined) g.setLeading?.(parseInt2(richTextLeading));
				const richTextLetterSpacing = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.letterSpacing);
				if (richTextLetterSpacing !== undefined) g.setLetterSpacing?.(parseInt2(richTextLetterSpacing));
				const richTextUbb = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.ubb);
				if (richTextUbb !== undefined) g.setUbbEnabled?.(parseBool(richTextUbb));
				const richTextAutoSize = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoSize);
				if (richTextAutoSize) { const m: Record<string,number> = {none:0,both:1,height:2,shrink:3}; g.setAutoSize(m[richTextAutoSize]??1); }
				const richTextSingleLine = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.singleLine);
				if (richTextSingleLine !== undefined) g.setSingleLine?.(parseBool(richTextSingleLine));
				if (attrs.underline) g.setUnderline?.(parseBool(attrs.underline));
				if (attrs.italic) g.setItalic?.(parseBool(attrs.italic));
				if (attrs.bold) g.setBold?.(parseBool(attrs.bold));
				if (attrs.strikethrough) g.setStrikethrough?.(parseBool(attrs.strikethrough));
				const richTextStrokeColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeColor);
				if (richTextStrokeColor) {
					g.setStrokeColor?.(richTextStrokeColor);
					const richTextStrokeSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeSize);
					g.setStrokeSize?.(parseInt2(richTextStrokeSize, 1));
				}
				const richTextShadowColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowColor);
				if (richTextShadowColor) {
					g.setShadowColor?.(richTextShadowColor);
					const richTextShadowOffset = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowOffset);
					const shadowParts = String(richTextShadowOffset ?? '1,1').split(',');
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
				const inputText = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.text);
				if (inputText !== undefined) g.setText(String(inputText));
				const inputFontSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.fontSize);
				if (inputFontSize !== undefined) g.setFontSize(parseInt2(inputFontSize));
				const inputFont = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.font);
				if (inputFont) g.setFont(inputFont);
				const inputColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.color);
				if (inputColor) g.setColor(inputColor);
				const inputAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.align);
				if (inputAlign) { const m: Record<string,number> = {left:0,center:1,right:2}; g.setAlign(m[inputAlign]??0); }
				const inputVAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.vAlign);
				if (inputVAlign) { const m: Record<string,number> = {top:0,middle:1,bottom:2}; g.setVAlign(m[inputVAlign]??0); }
				const inputLeading = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.leading);
				if (inputLeading !== undefined) g.setLeading?.(parseInt2(inputLeading));
				const inputLetterSpacing = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.letterSpacing);
				if (inputLetterSpacing !== undefined) g.setLetterSpacing?.(parseInt2(inputLetterSpacing));
				const inputAutoSize = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoSize);
				if (inputAutoSize) { const m: Record<string,number> = {none:0,both:1,height:2,shrink:3}; g.setAutoSize(m[inputAutoSize]??1); }
				const inputSingleLine = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.singleLine);
				if (inputSingleLine !== undefined) g.setSingleLine?.(parseBool(inputSingleLine));
				const inputUnderline = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.underline);
				if (inputUnderline !== undefined) g.setUnderline?.(parseBool(inputUnderline));
				const inputItalic = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.italic);
				if (inputItalic !== undefined) g.setItalic?.(parseBool(inputItalic));
				const inputBold = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.bold);
				if (inputBold !== undefined) g.setBold?.(parseBool(inputBold));
				const inputStrikethrough = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strikethrough);
				if (inputStrikethrough !== undefined) g.setStrikethrough?.(parseBool(inputStrikethrough));
				const inputStrokeColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeColor);
				if (inputStrokeColor) {
					g.setStrokeColor?.(inputStrokeColor);
					const inputStrokeSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeSize);
					g.setStrokeSize?.(parseInt2(inputStrokeSize, 1));
				}
				const prompt = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.prompt);
				if (prompt !== undefined) g.setPromptText(prompt);
				const inputMaxLength = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.maxLength);
				if (inputMaxLength !== undefined) g.setMaxLength(parseInt2(inputMaxLength));
				const inputRestrict = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.restrict);
				if (inputRestrict !== undefined) g.setRestrict(inputRestrict);
				const inputPassword = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.password);
				if (inputPassword !== undefined) g.setPassword(parseBool(inputPassword));
				const inputKeyboardType = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.keyboardType);
				if (inputKeyboardType !== undefined) g.setKeyboardType?.(parseInt2(inputKeyboardType));
				obj = g;
				break;
			}
			case 'graph': {
				const g = doc.createGGraph(name);
				const graphType = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.type);
				if (graphType) {
					const graphTypeMap: Record<string, number> = {
						rect: 1, eclipse: 2, ellipse: 2, polygon: 3, regularpolygon: 4, regular_polygon: 4,
					};
					g.setGraphType(graphTypeMap[graphType] ?? 0);
				}
				const lineSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.lineSize);
				if (lineSize !== undefined) g.setLineSize(parseInt2(lineSize));
				const lineColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.lineColor);
				if (lineColor) g.setLineColor(lineColor);
				const fillColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.fillColor);
				if (fillColor) g.setFillColor(fillColor);
				const corner = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.corner);
				if (corner) {
					const parts = corner.split(',').map(Number);
					g.setCornerRadius([
						parts[0] ?? 0,
						parts[1] ?? parts[0] ?? 0,
						parts[2] ?? parts[0] ?? 0,
						parts[3] ?? parts[0] ?? 0,
					]);
				}
				const points = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.points);
				if (points) g.setPoints(points.split(',').map(Number));
				const sides = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.sides);
				if (sides !== undefined) {
					g.setSides(parseInt2(sides));
					const startAngle = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.startAngle);
					g.setStartAngle(parseFloat2(startAngle));
					const distances = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.graph.attrs.distances);
					if (distances) g.setDistances(distances.split(',').map(Number));
				}
				obj = g;
				break;
			}
			case 'group': {
				const g = doc.createGGroup(name);
				const groupLayout = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.group.attrs.layout);
				if (groupLayout) {
					const layoutMap: Record<string, number> = { none: 0, horizontal: 1, vertical: 2 };
					g.setLayout(layoutMap[groupLayout] ?? 0);
				}
				const groupLineGap = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.group.attrs.lineGap);
				if (groupLineGap !== undefined) g.setLineGap(parseInt2(groupLineGap));
				const columnGap = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.group.attrs.columnGap);
				if (columnGap !== undefined) g.setColumnGap(parseInt2(columnGap));
				const groupAdvanced = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.group.attrs.advanced);
				if (groupAdvanced !== undefined) g.setAdvanced(parseBool(groupAdvanced));
				const excludeInvisibles = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.group.attrs.excludeInvisibles);
				if (excludeInvisibles !== undefined) g.setExcludeInvisibles?.(parseBool(excludeInvisibles));
				const autoSizeDisabled = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.group.attrs.autoSizeDisabled);
				if (autoSizeDisabled !== undefined) g.setAutoSizeDisabled?.(parseBool(autoSizeDisabled));
				const mainGridIndex = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.group.attrs.mainGridIndex);
				if (mainGridIndex !== undefined) g.setMainGridIndex?.(parseInt2(mainGridIndex));
				obj = g;
				break;
			}
			case 'loader': {
				const g = doc.createGLoader(name);
				const loaderUrl = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.url);
				if (loaderUrl) g.setUrl(loaderUrl);
				const loaderAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.align);
				if (loaderAlign) { const m: Record<string,number> = {left:0,center:1,right:2}; g.setAlign?.(m[loaderAlign]??0); }
				const loaderVAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.vAlign);
				if (loaderVAlign) { const m: Record<string,number> = {top:0,middle:1,bottom:2}; g.setVAlign?.(m[loaderVAlign]??0); }
				const loaderFill = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fill);
				if (loaderFill) {
					const fillMap: Record<string, number> = {
						none: 0, scale: 1, scaleMatchHeight: 2, scaleMatchWidth: 3, scaleFree: 4, scaleNoBorder: 5,
					};
					g.setFill(fillMap[loaderFill] ?? 0);
				}
				const loaderShrinkOnly = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.shrinkOnly);
				if (loaderShrinkOnly !== undefined) g.setShrinkOnly?.(parseBool(loaderShrinkOnly));
				const loaderAutoSize = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.autoSize);
				if (loaderAutoSize !== undefined) g.setAutoSize?.(parseBool(loaderAutoSize));
				const useResize = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.useResize);
				if (useResize !== undefined) g.setUseResize?.(parseBool(useResize));
				const loaderColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.color);
				if (loaderColor) g.setColor(loaderColor);
				const loaderPlaying = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.playing);
				if (loaderPlaying !== undefined) g.setPlaying?.(parseBool(loaderPlaying));
				const loaderFrame = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.frame);
				if (loaderFrame !== undefined) g.setFrame?.(parseInt2(loaderFrame));
				const fillMethod = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillMethod);
				if (fillMethod) {
					const fmMap: Record<string,number> = { none:0, hz:1, vt:2, radial90:3, radial180:4, radial360:5 };
					g.setFillMethod?.(fmMap[fillMethod] ?? 0);
					const fillOrigin = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillOrigin);
					g.setFillOrigin?.(parseInt2(fillOrigin));
					const fillClockwise = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillClockwise);
					g.setFillClockwise?.(fillClockwise !== 'false');
					const fillAmount = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.loader.attrs.fillAmount);
					g.setFillAmount?.(parseInt2(fillAmount, 100) / 100);
				}
				obj = g;
				break;
			}
			case 'loader3d': {
				const g = doc.createGLoader3D(name);
				const loader3dUrl = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.url);
				if (loader3dUrl) g.setUrl(loader3dUrl);
				const loader3dAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.align);
				if (loader3dAlign) { const m: Record<string, number> = { left: 0, center: 1, right: 2 }; g.setAlign?.(m[loader3dAlign] ?? 0); }
				const loader3dVAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.vAlign);
				if (loader3dVAlign) { const m: Record<string, number> = { top: 0, middle: 1, bottom: 2 }; g.setVAlign?.(m[loader3dVAlign] ?? 0); }
				const loader3dFill = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.fill);
				if (loader3dFill) {
					const fillMap: Record<string, number> = {
						none: 0, scale: 1, scaleMatchHeight: 2, scaleMatchWidth: 3, scaleFree: 4, scaleNoBorder: 5,
					};
					g.setFill(fillMap[loader3dFill] ?? 0);
				}
				const loader3dShrinkOnly = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.shrinkOnly);
				if (loader3dShrinkOnly !== undefined) g.setShrinkOnly?.(parseBool(loader3dShrinkOnly));
				const loader3dAutoSize = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.autoSize);
				if (loader3dAutoSize !== undefined) g.setAutoSize?.(parseBool(loader3dAutoSize));
				const animation = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.animation);
				if (animation !== undefined) g.setAnimationName?.(String(animation));
				const skinName = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.skinName);
				if (skinName !== undefined) g.setSkinName?.(String(skinName));
				const playing = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.playing);
				if (playing !== undefined) g.setPlaying?.(parseBool(playing));
				const frame = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.frame);
				if (frame !== undefined) g.setFrame?.(parseInt2(frame));
				const loop = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.loop);
				if (loop !== undefined) g.setLoop?.(parseBool(loop));
				const loader3dColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.loader3D.attrs.color);
				if (loader3dColor) g.setColor(loader3dColor);
				obj = g;
				break;
			}
			case 'movieclip':
			case 'jta': {
				const g = doc.createGMovieClip(name);
				const src = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.src);
				g.setSrc(src || '');
				const playing = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.playing);
				if (playing !== undefined) g.setPlaying(parseBool(playing));
				const frame = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.frame);
				if (frame !== undefined) g.setFrame(parseInt2(frame));
				const movieClipColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.movieClip.attrs.color);
				if (movieClipColor) g.setColor(movieClipColor);
				obj = g;
				break;
			}
			case 'component': {
				const g = doc.createGComponent(name);
				const src = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.src);
				g.setSrc(src || '');
				const controllerOverrides = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.controllerOverrides);
				if (controllerOverrides) g.setControllerOverrides?.(controllerOverrides);
				const pageController = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.componentInstance.attrs.pageController);
				if (pageController) g.setPageController?.(pageController);
				obj = g;
				break;
			}
			case 'list': {
				const treeView = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.list.attrs.treeView);
				const isTree = treeView !== undefined && parseBool(treeView);
				let g;
				if (isTree) {
					g = doc.createGTree(name).setTreeView(true);
					const indent = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.indent);
					if (indent !== undefined) g.setIndent(parseInt2(indent));
					const clickToExpand = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.clickToExpand);
					if (clickToExpand !== undefined) g.setClickToExpand(parseInt2(clickToExpand));
				} else {
					g = doc.createGList(name);
				}
				const src = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.src);
				g.setSrc(src || '');
				const defaultItem = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.defaultItem);
				if (defaultItem) g.setDefaultItem(defaultItem);
				const scrollBarRes = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBarRes);
				if (scrollBarRes) {
					const parts = String(scrollBarRes).split(',');
					g.setVtScrollBarRes?.(parts[0] ?? '');
					g.setHzScrollBarRes?.(parts[1] ?? '');
				}
				const ptrRes = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.ptrRes);
				if (ptrRes) {
					const parts = String(ptrRes).split(',');
					g.setHeaderRes?.(parts[0] ?? '');
					g.setFooterRes?.(parts[1] ?? '');
				}
				const controllerOverrides = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.controllerOverrides);
				if (controllerOverrides) g.setControllerOverrides?.(controllerOverrides);
				const pageController = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.pageController);
				if (pageController) g.setPageController?.(pageController);
				const layout = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.layout);
				if (layout) {
					const layoutMap: Record<string, number> = {
						singleColumn: 0, singleRow: 1, flowHorizontal: 2, flowVertical: 3, pagination: 4,
						single_column: 0, single_row: 1, flow_hz: 2, flow_vt: 3,
						column: 0, row: 1,
					};
					g.setLayout(layoutMap[layout] ?? 0);
				}
				const lineGap = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineGap);
				if (lineGap !== undefined) g.setLineGap(parseInt2(lineGap));
				const columnGap = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.columnGap);
				if (columnGap !== undefined) g.setColumnGap(parseInt2(columnGap));
				const lineCount = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineCount);
				if (lineCount !== undefined) g.setLineCount?.(parseInt2(lineCount));
				const autoResizeItem = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.list.attrs.autoResizeItem);
				if (autoResizeItem !== undefined) g.setAutoResizeItem?.(parseBool(autoResizeItem));
				const selectionMode = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.selectionMode);
				if (selectionMode) {
					const selMap: Record<string, number> = { single: 0, multiple: 1, multipleSingleClick: 2, none: 3 };
					g.setSelectionMode(selMap[selectionMode] ?? 0);
				}
				const selectionController = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.selectionController);
				if (selectionController !== undefined) g.setSelectionController?.(selectionController);
				// Overflow & scroll
				const overflow = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.overflow);
				const scroll = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.scroll);
				const scrollBarFlags = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBarFlags);
				const margin = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.margin);
				if (overflow || scroll || scrollBarFlags !== undefined || margin) {
					if (overflow) {
						const overflowMap: Record<string, number> = { visible: 0, hidden: 1, scroll: 2 };
						g.setOverflow(overflowMap[overflow] ?? 0);
					}
					if (scroll) {
						const scrollMap: Record<string, number> = { horizontal: 0, vertical: 1, both: 2 };
						g.setScrollType(scrollMap[scroll] ?? 1);
					}
					if (scrollBarFlags !== undefined) g.setScrollBarFlags(parseInt2(scrollBarFlags));
					if (margin) {
						const parts = margin.split(',').map(Number);
						g.setMargin({
							top: parts[0] ?? 0,
							bottom: parts[1] ?? 0,
							left: parts[2] ?? 0,
							right: parts[3] ?? 0,
						});
					}
				}
				// clipSoftness
				const clipSoftness = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.clipSoftness);
				if (clipSoftness) {
					const csParts = clipSoftness.split(',').map(Number);
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
					g.setListItems(isTree ? inferTreeItemFolderFlags(listItems) : listItems);
				}
				obj = g;
				break;
			}
			default:
				return null;
		}

		// Common GObject attributes
		const objectId = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.id);
		obj.setId(objectId || '');
		const xy = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.xy);
		if (xy) {
			const [x, y] = parseXYString(xy);
			obj.setXY(x, y);
		}
		const size = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.size);
		if (size) {
			const [w, h] = parseSizeString(size);
			obj.setSize(w, h);
		}
		const objectPivot = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.pivot);
		if (objectPivot) {
			const [px, py] = parseXYString(objectPivot);
			const objectAnchor = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.anchor);
			obj.setPivot(px, py, parseBool(objectAnchor));
		}
		const scale = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.scale);
		if (scale) {
			const [sx, sy] = parseXYString(scale);
			obj.setScale(sx, sy);
		}
		const skew = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.skew);
		if (skew) {
			const [skewX, skewY] = parseXYString(skew);
			obj.setSkew(skewX, skewY);
		}
		const rotation = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.rotation);
		if (rotation !== undefined) obj.setRotation(parseFloat2(rotation));
		const alpha = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.alpha);
		if (alpha !== undefined) obj.setAlpha(parseFloat2(alpha, 1));
		const visible = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.visible);
		if (visible === 'false') obj.setVisible(false);
		const touchable = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.touchable);
		if (touchable === 'false') obj.setTouchable(false);
		const grayed = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.grayed);
		if (grayed === 'true') obj.setGrayed(true);
		const tooltips = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.tooltips);
		if (tooltips) obj.setTooltips(tooltips);
		const objectCustomData = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.customData);
		if (objectCustomData) obj.setCustomData(objectCustomData);
		const group = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.group);
		if (group) obj.setGroup(group);
		const fileName = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.fileName);
		if (fileName !== undefined) obj.setFileName?.(fileName);
		const packageId = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.pkg);
		if (packageId !== undefined) obj.setPackageId?.(packageId);
		const filter = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.filter);
		if (filter !== undefined) obj.setFilter?.(filter);
		const filterData = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.displayObject.attrs.filterData);
		if (filterData !== undefined) obj.setFilterData?.(filterData);

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
			const sidePair = readXmlAttr<string>(relDef, PROJECT_XML_PROTOCOL.relation.attrs.sidePair) || '';
			const sidePairs = parseSidePair(sidePair);
			for (const sp of sidePairs) {
				const target = readXmlAttr<string>(relDef, PROJECT_XML_PROTOCOL.relation.attrs.target) || '';
				const rel: RelationDef = {
					target,
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
				const extProtocol = EXTENSION_PROTOCOL_MAP[extTypeName as keyof typeof EXTENSION_PROTOCOL_MAP];
				const extSpecs = extProtocol.attrs as Record<string, { canonical: string }>;
				componentObj.setInstanceExtType?.(extTypeName);
				const title = extSpecs.title ? readXmlAttr<string>(extAttrs, extSpecs.title) : undefined;
				if (title !== undefined) componentObj.setInstanceTitle?.(title);
				const selectedTitle = extSpecs.selectedTitle ? readXmlAttr<string>(extAttrs, extSpecs.selectedTitle) : undefined;
				if (selectedTitle !== undefined) componentObj.setInstanceSelectedTitle?.(selectedTitle);
				const icon = extSpecs.icon ? readXmlAttr<string>(extAttrs, extSpecs.icon) : undefined;
				if (icon !== undefined) componentObj.setInstanceIcon?.(icon);
				const selectedIcon = extSpecs.selectedIcon ? readXmlAttr<string>(extAttrs, extSpecs.selectedIcon) : undefined;
				if (selectedIcon !== undefined) componentObj.setInstanceSelectedIcon?.(selectedIcon);
				const titleColor = extSpecs.titleColor ? readXmlAttr<string>(extAttrs, extSpecs.titleColor) : undefined;
				if (titleColor !== undefined) componentObj.setInstanceTitleColor?.(titleColor);
				const titleFontSize = extSpecs.titleFontSize ? readXmlAttr<string | number>(extAttrs, extSpecs.titleFontSize) : undefined;
				if (titleFontSize !== undefined) componentObj.setInstanceTitleFontSize?.(parseInt2(titleFontSize));
				const controller = extSpecs.controller ? readXmlAttr<string>(extAttrs, extSpecs.controller) : undefined;
				if (controller !== undefined) componentObj.setInstanceController?.(controller);
				const page = extSpecs.page ? readXmlAttr<string>(extAttrs, extSpecs.page) : undefined;
				if (page !== undefined) componentObj.setInstancePage?.(page);
				const checked = extSpecs.checked ? readXmlAttr<string | boolean>(extAttrs, extSpecs.checked) : undefined;
				if (checked !== undefined) componentObj.setInstanceChecked?.(parseBool(checked));
				const prompt = extSpecs.prompt ? readXmlAttr<string>(extAttrs, extSpecs.prompt) : undefined;
				if (prompt !== undefined) componentObj.setInstancePromptText?.(prompt);
				const selectionController = extSpecs.selectionController ? readXmlAttr<string>(extAttrs, extSpecs.selectionController) : undefined;
				if (selectionController !== undefined) componentObj.setInstanceSelectionController?.(selectionController);
				const visibleItemCount = extSpecs.visibleItemCount ? readXmlAttr<string | number>(extAttrs, extSpecs.visibleItemCount) : undefined;
				if (visibleItemCount !== undefined) componentObj.setInstanceVisibleItemCount?.(parseInt2(visibleItemCount));
				const value = extSpecs.value ? readXmlAttr<string | number>(extAttrs, extSpecs.value) : undefined;
				if (value !== undefined) componentObj.setInstanceValue?.(parseInt2(value));
				const max = extSpecs.max ? readXmlAttr<string | number>(extAttrs, extSpecs.max) : undefined;
				if (max !== undefined) componentObj.setInstanceMax?.(parseInt2(max, 100));
				const min = extSpecs.min ? readXmlAttr<string | number>(extAttrs, extSpecs.min) : undefined;
				if (min !== undefined) componentObj.setInstanceMin?.(parseInt2(min));
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
		const tween = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.tween);
		gear.setTween(parseBool(tween));

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
		if (values) {
			gear.setValues(values);
		}
		const defaultValue = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.default);
		if (defaultValue !== undefined) {
			gear.setDefaultValue(defaultValue);
		}
		const condition = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.gear.attrs.condition);
		if (condition !== undefined) {
			gear.setCondition(String(condition));
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
