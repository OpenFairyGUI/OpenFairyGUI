import { XMLBuilder } from 'fast-xml-parser';
import type { Document } from '../document.js';
import type { Package } from '../properties/package.js';
import type { Component } from '../properties/component.js';
import type { GObject } from '../properties/g-object.js';
import type { Controller } from '../properties/controller.js';
import type { Transition } from '../properties/transition.js';
import type { Gear } from '../properties/gear.js';
import { GearType } from '../constants.js';
import type { FileSystem } from './project-reader.js';

const builder = new XMLBuilder({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	format: true,
	indentBy: '  ',
	suppressUnpairedNode: false,
	unpairedTags: [],
});

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

const DISPLAY_TAG: Record<string, string> = {
	GImage: 'image',
	GTextField: 'text',
	GRichTextField: 'richtext',
	GTextInput: 'inputtext',
	GGraph: 'graph',
	GGroup: 'group',
	GLoader: 'loader',
	GLoader3D: 'loader3d',
	GMovieClip: 'movieclip',
	GComponent: 'component',
	GButton: 'component',
	GLabel: 'component',
	GComboBox: 'component',
	GProgressBar: 'component',
	GSlider: 'component',
	GScrollBar: 'component',
	GList: 'list',
};

const EXTENSION_TYPE: Record<string, string> = {
	GButton: 'Button',
	GLabel: 'Label',
	GComboBox: 'ComboBox',
	GProgressBar: 'ProgressBar',
	GSlider: 'Slider',
	GScrollBar: 'ScrollBar',
};

type PackageResource = ReturnType<Package['listResources']>[number];

type WritableResource = PackageResource & {
	getId?(): string;
	getPath?(): string;
	getExported?(): boolean;
};

type WritableImageResource = WritableResource & {
	getScaleOption?(): number;
	getScale9Grid?(): [number, number, number, number] | null;
	getSmoothing?(): boolean;
	getDuplicatePadding?(): boolean;
};

interface FontWriterExtras extends Record<string, unknown> {
	texture?: string;
}

type WritableFontResource = WritableResource & {
	getExtras?(): FontWriterExtras;
};

type WritableComponent = Component & {
	getOverflow?(): number;
	getMargin?(): { top?: number; bottom?: number; left?: number; right?: number };
	getClipSoftness?(): { x?: number; y?: number };
	getMask?(): string;
	getReversedMask?(): boolean;
	getHitTest?(): string;
	getCustomData?(): string;
	getScrollType?(): number;
	getScrollBarDisplay?(): number;
	getScrollBarFlags?(): number;
	getScrollBarMargin?(): { top?: number; bottom?: number; left?: number; right?: number };
	getVtScrollBarRes?(): string;
	getHzScrollBarRes?(): string;
	getHeaderRes?(): string;
	getFooterRes?(): string;
	getExtensionType?(): string;
	getButtonMode?(): number;
	getSound?(): string;
	getSoundVolumeScale?(): number;
	getDownEffect?(): number;
	getDownEffectValue?(): number;
	getDropdown?(): string;
	getTitleType?(): number;
	getReverse?(): boolean;
	getWholeNumbers?(): boolean;
	getChangeOnClick?(): boolean;
	getFixedGripSize?(): boolean;
};

type WritableChild = GObject & {
	getSrc?(): string;
	getUrl?(): string;
	getText?(): string;
	getFontSize?(): number;
	getColor?(): string;
	getShadowColor?(): string | null;
	getShadowOffsetX?(): number;
	getShadowOffsetY?(): number;
	getStrikethrough?(): boolean;
	getAlign?(): number;
	getVAlign?(): number;
	getFill?(): number;
	getShrinkOnly?(): boolean;
	getAutoSize?(): boolean;
	getUseResize?(): boolean;
	getAnimationName?(): string;
	getSkinName?(): string;
	getLoop?(): boolean;
	getPlaying?(): boolean;
	getFrame?(): number;
	getFlip?(): number;
	getFillMethod?(): number;
	getFillOrigin?(): number;
	getFillClockwise?(): boolean;
	getFillAmount?(): number;
	getGraphType?(): number;
	getLineSize?(): number;
	getLineColor?(): string;
	getFillColor?(): string;
	getCornerRadius?(): [number, number, number, number] | null;
	getPoints?(): number[] | null;
	getSides?(): number;
	getStartAngle?(): number;
	getDistances?(): number[] | null;
	getLayout?(): number;
	getLineGap?(): number;
	getColumnGap?(): number;
	getAdvanced?(): boolean;
	getSelectionMode?(): number;
	getDefaultItem?(): string;
	getOverflow?(): number;
	getScrollType?(): number;
	getScrollBarFlags?(): number;
	getVtScrollBarRes?(): string;
	getHzScrollBarRes?(): string;
	getHeaderRes?(): string;
	getFooterRes?(): string;
	getMargin?(): { top?: number; bottom?: number; left?: number; right?: number };
	getClipSoftness?(): { x?: number; y?: number };
	getListItems?(): Array<{
		title?: string | null;
		icon?: string | null;
		url?: string | null;
		name?: string | null;
		selectedTitle?: string | null;
		selectedIcon?: string | null;
		level?: number;
		isFolder?: boolean | null;
	}>;
	getTreeView?(): boolean;
	getIndent?(): number;
	getClickToExpand?(): number;
	getPageController?(): string;
	getControllerOverrides?(): string;
	getInstanceExtType?(): string;
	getInstanceTitle?(): string;
	getInstanceSelectedTitle?(): string;
	getInstanceIcon?(): string;
	getInstanceSelectedIcon?(): string;
	getInstanceTitleColor?(): string;
	getInstanceTitleFontSize?(): number;
	getInstanceController?(): string;
	getInstancePage?(): string;
	getInstanceChecked?(): boolean;
	getInstanceVisibleItemCount?(): number;
	getInstanceValue?(): number;
	getInstanceMax?(): number;
	getInstanceMin?(): number;
	getInstanceComboItems?(): Array<{
		title?: string | null;
		value?: string | null;
		icon?: string | null;
	}>;
};

function getFontExtras(resource: { getExtras?(): Record<string, unknown> }): FontWriterExtras {
	return (resource.getExtras?.() ?? {}) as FontWriterExtras;
}

function hasNonZeroInsets(value: { top?: number; bottom?: number; left?: number; right?: number } | null | undefined): boolean {
	return !!value && !!(value.top || value.bottom || value.left || value.right);
}

function formatInsets(value: { top?: number; bottom?: number; left?: number; right?: number }): string {
	return `${value.top ?? 0},${value.bottom ?? 0},${value.left ?? 0},${value.right ?? 0}`;
}

function formatFillMethod(fillMethod: number): string {
	const fillMethodName: Record<number, string> = {
		0: 'none',
		1: 'hz',
		2: 'vt',
		3: 'radial90',
		4: 'radial180',
		5: 'radial360',
	};
	return fillMethodName[fillMethod] ?? 'none';
}

function formatButtonMode(mode: number): string {
	const map: Record<number, string> = {
		0: 'Common',
		1: 'Check',
		2: 'Radio',
	};
	return map[mode] ?? 'Common';
}

function formatTitleType(titleType: number): string {
	const map: Record<number, string> = {
		0: 'percent',
		1: 'valueAndmax',
		2: 'value',
		3: 'max',
	};
	return map[titleType] ?? 'percent';
}

/**
 * Writes a {@link Document} to disk as a FairyGUI project
 * (.fairy file + settings JSON + assets directory with package.xml and component XML files).
 *
 * @category I/O
 */
export class ProjectWriter {
	private readonly _fs: FileSystem;

	constructor(fs: FileSystem) {
		this._fs = fs;
	}

	async write(doc: Document, projectPath: string): Promise<void> {
		const fs = this._fs;
		const root = doc.getRoot();
		const basePath = fs.dirname(projectPath);

		// 1. Write .fairy file
		const fairyXml = `<?xml version="1.0" encoding="utf-8"?>\n`
			+ `<projectDescription id="${root.getProjectId()}" type="${this._projectTypeName(root.getProjectType())}" version="${root.getVersion() || '3.0'}"/>\n`;
		await fs.writeFile(projectPath, fairyXml);

		// 2. Write settings
		const settings = root.getSettings?.() ?? {};
		const settingsPath = fs.join(basePath, 'settings');
		await fs.mkdir(settingsPath);
		const settingFiles: Record<string, string> = {
			'Publish.json': 'publish',
			'Common.json': 'common',
			'Adaptation.json': 'adaptation',
		};
		for (const [fileName, key] of Object.entries(settingFiles)) {
			if (settings[key]) {
				await fs.writeFile(
					fs.join(settingsPath, fileName),
					JSON.stringify(settings[key], null, '\t'),
				);
			}
		}

		// 3. Write packages
		const assetsPath = fs.join(basePath, 'assets');
		await fs.mkdir(assetsPath);
		for (const pkg of root.listPackages()) {
			await this._writePackage(doc, pkg, assetsPath);
		}
	}

	private async _writePackage(_doc: Document, pkg: Package, assetsPath: string): Promise<void> {
		const fs = this._fs;
		const pkgDir = fs.join(assetsPath, pkg.getName());
		await fs.mkdir(pkgDir);

		// Build package.xml object
		const resources: Record<string, unknown[]> = {};

		for (const res of pkg.listResources()) {
			const tagName = this._resourceTag(res.propertyType as string);
			if (!tagName) continue;

			const typedRes = res as WritableResource;
			const attrs: Record<string, unknown> = {
				'@_id': typedRes.getId?.() ?? '',
				'@_name': this._resourceFileName(res),
				'@_path': typedRes.getPath?.() ?? '/',
			};
			if (typedRes.getExported?.()) attrs['@_exported'] = 'true';

			// Image-specific
			if (res.propertyType === 'ImageResource') {
				const imgRes = res as WritableImageResource;
				const scaleOpt = imgRes.getScaleOption?.() ?? 0;
				if (scaleOpt === 1) {
					attrs['@_scale'] = '9grid';
					const g = imgRes.getScale9Grid?.();
					if (g) attrs['@_scale9grid'] = `${g[0]},${g[1]},${g[2]},${g[3]}`;
				} else if (scaleOpt === 2) {
					attrs['@_scale'] = 'tile';
				}
				if (imgRes.getDuplicatePadding?.()) attrs['@_duplicatePadding'] = 'true';
				if (imgRes.getSmoothing?.() === false) attrs['@_smoothing'] = 'false';
			}

			// Font-specific: texture reference
			if (res.propertyType === 'FontResource') {
				const texture = getFontExtras(res as WritableFontResource).texture;
				if (texture) attrs['@_texture'] = texture;
			}

			if (!resources[tagName]) resources[tagName] = [];
			(resources[tagName] as Record<string, unknown>[]).push(attrs);
		}

		const publishName = pkg.getPublishName() || pkg.getName();
		const pkgXmlObj = {
			'?xml': { '@_version': '1.0', '@_encoding': 'utf-8' },
			packageDescription: {
				'@_id': pkg.getId(),
				resources,
				publish: { '@_name': publishName },
			},
		};

		await fs.writeFile(
			fs.join(pkgDir, 'package.xml'),
			builder.build(pkgXmlObj) as string,
		);

		// Write component XML files
		for (const comp of pkg.listComponents()) {
			await this._writeComponent(comp, pkg, pkgDir);
		}
	}

	private async _writeComponent(comp: Component, _pkg: Package, pkgDir: string): Promise<void> {
		const fs = this._fs;
		const typedComp = comp as WritableComponent;
		const path = typedComp.getPath?.() ?? '/';
		const name = comp.getName() + '.xml';

		// Ensure subdirectory exists
		const subDir = path.replace(/^\//, '').replace(/\/$/, '');
		const fileDir = subDir ? fs.join(pkgDir, subDir) : pkgDir;
		if (subDir) await fs.mkdir(fileDir);

		const compAttrs: Record<string, unknown> = {};
		const [w, h] = [typedComp.getWidth?.() ?? 0, typedComp.getHeight?.() ?? 0];
		if (w || h) compAttrs['@_size'] = `${w},${h}`;
		const overflow = typedComp.getOverflow?.() ?? 0;
		if (overflow !== 0) {
			const overflowName: Record<number, string> = { 0: 'visible', 1: 'hidden', 2: 'scroll' };
			compAttrs['@_overflow'] = overflowName[overflow] ?? 'visible';
		}
		const margin = typedComp.getMargin?.();
		if (hasNonZeroInsets(margin)) compAttrs['@_margin'] = formatInsets(margin!);
		const clipSoftness = typedComp.getClipSoftness?.();
		if (clipSoftness && ((clipSoftness.x ?? 0) !== 0 || (clipSoftness.y ?? 0) !== 0)) {
			compAttrs['@_clipSoftness'] = `${clipSoftness.x ?? 0},${clipSoftness.y ?? 0}`;
		}
		if (typedComp.getOpaque?.() === false) compAttrs['@_opaque'] = 'false';
		const mask = typedComp.getMask?.();
		if (mask) {
			compAttrs['@_mask'] = mask;
			if (typedComp.getReversedMask?.()) compAttrs['@_reversedMask'] = '1';
		}
		const hitTest = typedComp.getHitTest?.();
		if (hitTest) compAttrs['@_hitTest'] = hitTest;
		const customData = typedComp.getCustomData?.();
		if (customData) compAttrs['@_customData'] = customData;
		if (overflow === 2) {
			const scrollTypeName: Record<number, string> = { 0: 'horizontal', 1: 'vertical', 2: 'both' };
			const scrollBarName: Record<number, string> = { 0: 'default', 1: 'visible', 2: 'auto', 3: 'hidden' };
			compAttrs['@_scroll'] = scrollTypeName[typedComp.getScrollType?.() ?? 1] ?? 'vertical';
			compAttrs['@_scrollBar'] = scrollBarName[typedComp.getScrollBarDisplay?.() ?? 0] ?? 'default';
			const scrollBarFlags = typedComp.getScrollBarFlags?.() ?? 0;
			if (scrollBarFlags !== 0) compAttrs['@_scrollBarFlags'] = String(scrollBarFlags);
			const scrollBarMargin = typedComp.getScrollBarMargin?.();
			if (hasNonZeroInsets(scrollBarMargin)) compAttrs['@_scrollBarMargin'] = formatInsets(scrollBarMargin!);
			const vtScrollBarRes = typedComp.getVtScrollBarRes?.() ?? '';
			const hzScrollBarRes = typedComp.getHzScrollBarRes?.() ?? '';
			if (vtScrollBarRes || hzScrollBarRes) compAttrs['@_scrollBarRes'] = `${vtScrollBarRes},${hzScrollBarRes}`;
			const headerRes = typedComp.getHeaderRes?.() ?? '';
			const footerRes = typedComp.getFooterRes?.() ?? '';
			if (headerRes || footerRes) compAttrs['@_ptrRes'] = `${headerRes},${footerRes}`;
		}

		const extType = typedComp.getExtensionType?.() ?? '';
		if (extType) compAttrs['@_extention'] = extType;

		const compNode: Record<string, unknown> = { ...compAttrs };

		// Controllers
		const controllers = comp.listControllers();
		if (controllers.length > 0) {
			compNode.controller = controllers.map((ctrl) => this._serializeController(ctrl));
		}

		// Display list
		const children = comp.listChildren();
		if (children.length > 0) {
			compNode.displayList = this._serializeDisplayList(children);
		}

		// Transitions
		const transitions = comp.listTransitions();
		if (transitions.length > 0) {
			compNode.transition = transitions.map((t) => this._serializeTransition(t));
		}

		if (extType) {
			const extAttrs: Record<string, unknown> = {};
			switch (extType) {
				case 'Button':
					if ((typedComp.getButtonMode?.() ?? 0) !== 0) extAttrs['@_mode'] = formatButtonMode(typedComp.getButtonMode?.() ?? 0);
					if (typedComp.getSound?.()) extAttrs['@_sound'] = typedComp.getSound?.();
					if ((typedComp.getSoundVolumeScale?.() ?? 1) !== 1) extAttrs['@_soundVolumeScale'] = String(typedComp.getSoundVolumeScale?.() ?? 1);
					if ((typedComp.getDownEffect?.() ?? 0) !== 0) extAttrs['@_downEffect'] = String(typedComp.getDownEffect?.() ?? 0);
					if ((typedComp.getDownEffectValue?.() ?? 0.8) !== 0.8) extAttrs['@_downEffectValue'] = String(typedComp.getDownEffectValue?.() ?? 0.8);
					break;
				case 'ComboBox':
					if (typedComp.getDropdown?.()) extAttrs['@_dropdown'] = typedComp.getDropdown?.();
					break;
				case 'ProgressBar':
					if ((typedComp.getTitleType?.() ?? 0) !== 0) extAttrs['@_titleType'] = formatTitleType(typedComp.getTitleType?.() ?? 0);
					if (typedComp.getReverse?.()) extAttrs['@_reverse'] = 'true';
					break;
				case 'Slider':
					if ((typedComp.getTitleType?.() ?? 0) !== 0) extAttrs['@_titleType'] = formatTitleType(typedComp.getTitleType?.() ?? 0);
					if (typedComp.getReverse?.()) extAttrs['@_reverse'] = 'true';
					if (typedComp.getWholeNumbers?.()) extAttrs['@_wholeNumbers'] = 'true';
					if (typedComp.getChangeOnClick?.() === false) extAttrs['@_changeOnClick'] = 'false';
					break;
				case 'ScrollBar':
					if (typedComp.getFixedGripSize?.()) extAttrs['@_fixedGripSize'] = 'true';
					break;
				default:
					break;
			}
			compNode[extType] = Object.keys(extAttrs).length > 0 ? extAttrs : '';
		}

		const xmlObj = {
			'?xml': { '@_version': '1.0', '@_encoding': 'utf-8' },
			component: compNode,
		};

		await fs.writeFile(fs.join(fileDir, name), builder.build(xmlObj) as string);
	}

	private _serializeController(ctrl: Controller): Record<string, unknown> {
		const pages = ctrl.listPages();
		const pagesStr = pages.map((p) => `${p.getId()},${p.getName()}`).join(',');
		return {
			'@_name': ctrl.getName(),
			'@_pages': pagesStr,
			'@_selected': String(ctrl.getSelectedIndex()),
		};
	}

	private _serializeDisplayList(children: GObject[]): Record<string, unknown[]> {
		const byTag: Record<string, unknown[]> = {};
		for (const child of children) {
			const tag = DISPLAY_TAG[child.propertyType as string] ?? 'component';
			if (!byTag[tag]) byTag[tag] = [];
			(byTag[tag] as Record<string, unknown>[]).push(this._serializeChild(child));
		}
		return byTag;
	}

	private _serializeChild(obj: GObject): Record<string, unknown> {
		const typedObj = obj as WritableChild;
		const attrs: Record<string, unknown> = {};
		if (obj.getId()) attrs['@_id'] = obj.getId();
		if (obj.getName()) attrs['@_name'] = obj.getName();

		const [x, y] = [obj.getX(), obj.getY()];
		if (x !== 0 || y !== 0) attrs['@_xy'] = `${x},${y}`;

		const [w, h] = [obj.getWidth(), obj.getHeight()];
		if (w !== 0 || h !== 0) attrs['@_size'] = `${w},${h}`;

		if (obj.getAlpha() !== 1) attrs['@_alpha'] = String(obj.getAlpha());
		if (!obj.getVisible()) attrs['@_visible'] = 'false';
		if (!obj.getTouchable()) attrs['@_touchable'] = 'false';
		if (obj.getGrayed()) attrs['@_grayed'] = 'true';
		if (obj.getRotation() !== 0) attrs['@_rotation'] = String(obj.getRotation());
		if (obj.getTooltips()) attrs['@_tooltips'] = obj.getTooltips();
		if (obj.getGroup()) attrs['@_group'] = obj.getGroup();

		const [sx, sy] = [obj.getScaleX(), obj.getScaleY()];
		if (sx !== 1 || sy !== 1) attrs['@_scale'] = `${sx},${sy}`;
		const [skewX, skewY] = [obj.getSkewX(), obj.getSkewY()];
		if (skewX !== 0 || skewY !== 0) attrs['@_skew'] = `${skewX},${skewY}`;

		// Type-specific attributes
		const type = obj.propertyType as string;
		if (type === 'GImage' || type === 'GMovieClip' || type === 'GComponent'
			|| EXTENSION_TYPE[type]) {
			const src = typedObj.getSrc?.();
			if (src) attrs['@_src'] = src;
		}
		if ((type === 'GComponent' || type === 'GList') && typedObj.getControllerOverrides?.()) {
			attrs['@_controller'] = typedObj.getControllerOverrides?.();
		}
		if ((type === 'GComponent' || type === 'GList') && typedObj.getPageController?.()) {
			attrs['@_pageController'] = typedObj.getPageController?.();
		}
		if (type === 'GImage') {
			const flip = typedObj.getFlip?.() ?? 0;
			if (flip !== 0) attrs['@_flip'] = String(flip);
			const fillMethod = typedObj.getFillMethod?.() ?? 0;
			if (fillMethod !== 0) {
				attrs['@_fillMethod'] = formatFillMethod(fillMethod);
				attrs['@_fillOrigin'] = String(typedObj.getFillOrigin?.() ?? 0);
				if (typedObj.getFillClockwise?.() === false) attrs['@_fillClockwise'] = 'false';
				attrs['@_fillAmount'] = String(Math.round((typedObj.getFillAmount?.() ?? 0) * 100));
			}
		}
		if (type === 'GGraph') {
			const graphType = typedObj.getGraphType?.() ?? 0;
			if (graphType !== 0) {
				const graphTypeName: Record<number, string> = {
					1: 'rect',
					2: 'ellipse',
					3: 'polygon',
					4: 'regularpolygon',
				};
				attrs['@_type'] = graphTypeName[graphType] ?? 'rect';
			}
			if ((typedObj.getLineSize?.() ?? 1) !== 1) attrs['@_lineSize'] = String(typedObj.getLineSize?.() ?? 1);
			const lineColor = typedObj.getLineColor?.();
			if (lineColor) attrs['@_lineColor'] = lineColor;
			const fillColor = typedObj.getFillColor?.();
			if (fillColor) attrs['@_fillColor'] = fillColor;
			const cornerRadius = typedObj.getCornerRadius?.();
			if (cornerRadius) attrs['@_corner'] = cornerRadius.join(',');
			const points = typedObj.getPoints?.();
			if (points?.length) attrs['@_points'] = points.join(',');
			const sides = typedObj.getSides?.() ?? 0;
			if (sides > 0) attrs['@_sides'] = String(sides);
			const startAngle = typedObj.getStartAngle?.() ?? 0;
			if (startAngle !== 0) attrs['@_startAngle'] = String(startAngle);
			const distances = typedObj.getDistances?.();
			if (distances?.length) attrs['@_distances'] = distances.join(',');
		}
		if (type === 'GLoader') {
			const url = typedObj.getUrl?.();
			if (url) attrs['@_url'] = url;
			const align = typedObj.getAlign?.();
			if (align !== undefined) {
				const alignName: Record<number, string> = { 0: 'left', 1: 'center', 2: 'right' };
				attrs['@_align'] = alignName[align] ?? 'left';
			}
			const vAlign = typedObj.getVAlign?.();
			if (vAlign !== undefined) {
				const vAlignName: Record<number, string> = { 0: 'top', 1: 'middle', 2: 'bottom' };
				attrs['@_vAlign'] = vAlignName[vAlign] ?? 'top';
			}
			const fill = typedObj.getFill?.();
			if (fill !== undefined) {
				const fillName: Record<number, string> = {
					0: 'none',
					1: 'scale',
					2: 'scaleMatchHeight',
					3: 'scaleMatchWidth',
					4: 'scaleFree',
					5: 'scaleNoBorder',
				};
				attrs['@_fill'] = fillName[fill] ?? 'none';
			}
			if (typedObj.getShrinkOnly?.()) attrs['@_shrinkOnly'] = '1';
			if (typedObj.getAutoSize?.()) attrs['@_autoSize'] = '1';
			if (typedObj.getUseResize?.()) attrs['@_useResize'] = '1';
			const loaderColor = typedObj.getColor?.();
			if (loaderColor) attrs['@_color'] = loaderColor;
			if (typedObj.getPlaying?.() === false) attrs['@_playing'] = 'false';
			const frame = typedObj.getFrame?.() ?? 0;
			if (frame !== 0) attrs['@_frame'] = String(frame);
			const fillMethod = typedObj.getFillMethod?.() ?? 0;
			if (fillMethod !== 0) {
				attrs['@_fillMethod'] = formatFillMethod(fillMethod);
				attrs['@_fillOrigin'] = String(typedObj.getFillOrigin?.() ?? 0);
				if (typedObj.getFillClockwise?.() === false) attrs['@_fillClockwise'] = 'false';
				attrs['@_fillAmount'] = String(Math.round((typedObj.getFillAmount?.() ?? 0) * 100));
			}
		}
		if (type === 'GLoader3D') {
			const url = typedObj.getUrl?.();
			if (url) attrs['@_url'] = url;
			const align = typedObj.getAlign?.();
			if (align !== undefined) {
				const alignName: Record<number, string> = { 0: 'left', 1: 'center', 2: 'right' };
				attrs['@_align'] = alignName[align] ?? 'left';
			}
			const vAlign = typedObj.getVAlign?.();
			if (vAlign !== undefined) {
				const vAlignName: Record<number, string> = { 0: 'top', 1: 'middle', 2: 'bottom' };
				attrs['@_vAlign'] = vAlignName[vAlign] ?? 'top';
			}
			const fill = typedObj.getFill?.();
			if (fill !== undefined) {
				const fillName: Record<number, string> = {
					0: 'none',
					1: 'scale',
					2: 'scaleMatchHeight',
					3: 'scaleMatchWidth',
					4: 'scaleFree',
					5: 'scaleNoBorder',
				};
				attrs['@_fill'] = fillName[fill] ?? 'none';
			}
			if (typedObj.getShrinkOnly?.()) attrs['@_shrinkOnly'] = '1';
			if (typedObj.getAutoSize?.()) attrs['@_autoSize'] = '1';
			const animationName = typedObj.getAnimationName?.();
			if (animationName) attrs['@_animationName'] = animationName;
			const skinName = typedObj.getSkinName?.();
			if (skinName) attrs['@_skinName'] = skinName;
			if (typedObj.getPlaying?.() === false) attrs['@_playing'] = 'false';
			const frame = typedObj.getFrame?.() ?? 0;
			if (frame !== 0) attrs['@_frame'] = String(frame);
			if (typedObj.getLoop?.() === false) attrs['@_loop'] = 'false';
			const loaderColor = typedObj.getColor?.();
			if (loaderColor) attrs['@_color'] = loaderColor;
		}
		if (type === 'GGroup') {
			const layout = typedObj.getLayout?.();
			if (layout !== undefined) {
				const layoutName: Record<number, string> = { 0: 'none', 1: 'horizontal', 2: 'vertical' };
				attrs['@_layout'] = layoutName[layout] ?? 'none';
			}
			const lineGap = typedObj.getLineGap?.() ?? 0;
			if (lineGap !== 0) attrs['@_lineGap'] = String(lineGap);
			const columnGap = typedObj.getColumnGap?.() ?? 0;
			if (columnGap !== 0) attrs['@_columnGap'] = String(columnGap);
			if (typedObj.getAdvanced?.()) attrs['@_advanced'] = '1';
		}
		if (type === 'GList') {
			const layout = typedObj.getLayout?.();
			if (layout !== undefined) {
				const layoutName: Record<number, string> = {
					0: 'singleColumn',
					1: 'singleRow',
					2: 'flowHorizontal',
					3: 'flowVertical',
					4: 'pagination',
				};
				attrs['@_layout'] = layoutName[layout] ?? 'singleColumn';
			}
			const lineGap = typedObj.getLineGap?.() ?? 0;
			if (lineGap !== 0) attrs['@_lineGap'] = String(lineGap);
			const columnGap = typedObj.getColumnGap?.() ?? 0;
			if (columnGap !== 0) attrs['@_columnGap'] = String(columnGap);
			const selectionMode = typedObj.getSelectionMode?.();
			if (selectionMode !== undefined) {
				const selectionName: Record<number, string> = {
					0: 'single',
					1: 'multiple',
					2: 'multipleSingleClick',
					3: 'none',
				};
				attrs['@_selectionMode'] = selectionName[selectionMode] ?? 'single';
			}
			const defaultItem = typedObj.getDefaultItem?.();
			if (defaultItem) attrs['@_defaultItem'] = defaultItem;
			if (typedObj.getTreeView?.()) attrs['@_treeView'] = 'true';
			const indent = typedObj.getIndent?.() ?? 0;
			if (indent !== 0) attrs['@_indent'] = String(indent);
			const clickToExpand = typedObj.getClickToExpand?.() ?? 0;
			if (clickToExpand !== 0) attrs['@_clickToExpand'] = String(clickToExpand);
			const overflow = typedObj.getOverflow?.() ?? 0;
			if (overflow !== 0) {
				const overflowName: Record<number, string> = { 0: 'visible', 1: 'hidden', 2: 'scroll' };
				attrs['@_overflow'] = overflowName[overflow] ?? 'visible';
			}
			const scrollType = typedObj.getScrollType?.();
			if (scrollType !== undefined) {
				const scrollTypeName: Record<number, string> = { 0: 'horizontal', 1: 'vertical', 2: 'both' };
				attrs['@_scroll'] = scrollTypeName[scrollType] ?? 'vertical';
			}
			const scrollBarFlags = typedObj.getScrollBarFlags?.() ?? 0;
			if (scrollBarFlags !== 0) attrs['@_scrollBarFlags'] = String(scrollBarFlags);
			const vtScrollBarRes = typedObj.getVtScrollBarRes?.() ?? '';
			const hzScrollBarRes = typedObj.getHzScrollBarRes?.() ?? '';
			if (vtScrollBarRes || hzScrollBarRes) attrs['@_scrollBarRes'] = `${vtScrollBarRes},${hzScrollBarRes}`;
			const headerRes = typedObj.getHeaderRes?.() ?? '';
			const footerRes = typedObj.getFooterRes?.() ?? '';
			if (headerRes || footerRes) attrs['@_ptrRes'] = `${headerRes},${footerRes}`;
			const margin = typedObj.getMargin?.();
			if (hasNonZeroInsets(margin)) attrs['@_margin'] = formatInsets(margin!);
			const clipSoftness = typedObj.getClipSoftness?.();
			if (clipSoftness && ((clipSoftness.x ?? 0) !== 0 || (clipSoftness.y ?? 0) !== 0)) {
				attrs['@_clipSoftness'] = `${clipSoftness.x ?? 0},${clipSoftness.y ?? 0}`;
			}
			const listItems = typedObj.getListItems?.() ?? [];
			if (listItems.length > 0) {
				attrs.item = listItems.map((item) => ({
					'@_title': item.title ?? undefined,
					'@_icon': item.icon ?? undefined,
					'@_url': item.url ?? undefined,
					'@_name': item.name ?? undefined,
					'@_selectedTitle': item.selectedTitle ?? undefined,
					'@_selectedIcon': item.selectedIcon ?? undefined,
					'@_level': item.level === undefined || item.level === null ? undefined : String(item.level),
					'@_isFolder': item.isFolder === null || item.isFolder === undefined ? undefined : (item.isFolder ? 'true' : 'false'),
				}));
			}
		}
		if (type === 'GTextField' || type === 'GRichTextField' || type === 'GTextInput') {
			const text = typedObj.getText?.();
			if (text) attrs['@_text'] = text;
			const fontSize = typedObj.getFontSize?.();
			if (fontSize) attrs['@_fontSize'] = String(fontSize);
			const color = typedObj.getColor?.();
			if (color) attrs['@_color'] = color;
			const shadowColor = typedObj.getShadowColor?.();
			if (shadowColor) {
				attrs['@_shadowColor'] = shadowColor;
				attrs['@_shadowOffset'] = `${typedObj.getShadowOffsetX?.() ?? 1},${typedObj.getShadowOffsetY?.() ?? 1}`;
			}
			if (typedObj.getStrikethrough?.()) attrs['@_strikethrough'] = '1';
		}
		if (type === 'GComponent') {
			const instanceExtType = typedObj.getInstanceExtType?.() ?? '';
			if (instanceExtType) {
				const extAttrs: Record<string, unknown> = {};
				if (typedObj.getInstanceTitle?.()) extAttrs['@_title'] = typedObj.getInstanceTitle?.();
				if (typedObj.getInstanceSelectedTitle?.()) extAttrs['@_selectedTitle'] = typedObj.getInstanceSelectedTitle?.();
				if (typedObj.getInstanceIcon?.()) extAttrs['@_icon'] = typedObj.getInstanceIcon?.();
				if (typedObj.getInstanceSelectedIcon?.()) extAttrs['@_selectedIcon'] = typedObj.getInstanceSelectedIcon?.();
				if (typedObj.getInstanceTitleColor?.()) extAttrs['@_titleColor'] = typedObj.getInstanceTitleColor?.();
				if ((typedObj.getInstanceTitleFontSize?.() ?? 0) > 0) extAttrs['@_titleFontSize'] = String(typedObj.getInstanceTitleFontSize?.() ?? 0);
				if (typedObj.getInstanceController?.()) extAttrs['@_controller'] = typedObj.getInstanceController?.();
				if (typedObj.getInstancePage?.()) extAttrs['@_page'] = typedObj.getInstancePage?.();
				if (typedObj.getInstanceChecked?.()) extAttrs['@_checked'] = '1';
				if ((typedObj.getInstanceVisibleItemCount?.() ?? 0) > 0) extAttrs['@_visibleItemCount'] = String(typedObj.getInstanceVisibleItemCount?.() ?? 0);
				const instanceValue = typedObj.getInstanceValue?.() ?? 0;
				const instanceMax = typedObj.getInstanceMax?.() ?? 0;
				const instanceMin = typedObj.getInstanceMin?.() ?? 0;
				if (instanceValue !== 0) extAttrs['@_value'] = String(instanceValue);
				if (instanceMax !== 0) extAttrs['@_max'] = String(instanceMax);
				if (instanceMin !== 0) extAttrs['@_min'] = String(instanceMin);
				const comboItems = typedObj.getInstanceComboItems?.() ?? [];
				if (comboItems.length > 0) {
					extAttrs.item = comboItems.map((item) => ({
						'@_title': item.title ?? undefined,
						'@_value': item.value ?? undefined,
						'@_icon': item.icon ?? undefined,
					}));
				}
				attrs[instanceExtType] = Object.keys(extAttrs).length > 0 ? extAttrs : '';
			}
		}

		// Gear child elements
		for (const gear of obj.listGears()) {
			const gearTag = GEAR_TAG[gear.getGearType()];
			if (!gearTag) continue;
			attrs[gearTag] = [this._serializeGear(gear)];
		}

		// Relation child elements
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
			const relElements = Array.from(byTarget.entries()).map(([target, pairs]) => ({
				'@_target': target,
				'@_sidePair': pairs.join(','),
			}));
			if (relElements.length > 0) attrs.relation = relElements;
		}

		return attrs;
	}

	private _serializeGear(gear: Gear): Record<string, unknown> {
		const ctrl = gear.getController();
		const attrs: Record<string, unknown> = {};
		if (ctrl) attrs['@_controller'] = ctrl.getName();
		if (gear.getPages()) attrs['@_pages'] = gear.getPages();
		if (gear.getValues()) attrs['@_values'] = gear.getValues();
		if (gear.getDefaultValue() !== null) attrs['@_default'] = gear.getDefaultValue();
		if (gear.getTween()) attrs['@_tween'] = 'true';
		if (gear.getCondition()) attrs['@_condition'] = gear.getCondition();
		return attrs;
	}

	private _serializeTransition(trans: Transition): Record<string, unknown> {
		const attrs: Record<string, unknown> = { '@_name': trans.getName() };
		if (trans.getAutoPlay()) attrs['@_autoPlay'] = 'true';
		if (trans.getAutoPlayTimes() !== 1) attrs['@_autoPlayTimes'] = String(trans.getAutoPlayTimes());
		if (trans.getAutoPlayDelay() !== 0) attrs['@_autoPlayDelay'] = String(trans.getAutoPlayDelay());

		const ACTION_TYPE_NAMES: Record<number, string> = {
			0: 'XY', 1: 'Size', 2: 'Scale', 3: 'Pivot', 4: 'Alpha', 5: 'Rotation',
			6: 'Color', 7: 'Animation', 8: 'Visible', 9: 'Sound', 10: 'Transition',
			11: 'Shake', 12: 'ColorFilter', 13: 'Skew', 14: 'Text', 15: 'Icon',
		};

		const items = trans.listItems().map((item) => {
			const ia: Record<string, unknown> = {
				'@_time': String(item.getTime()),
				'@_type': ACTION_TYPE_NAMES[item.getActionType()] ?? 'XY',
				'@_target': item.getTargetId(),
			};
			if (item.getDuration() !== 0) ia['@_duration'] = String(item.getDuration());
			if (item.getTween()) ia['@_tween'] = 'true';
			if (item.getRepeat() !== 0) ia['@_repeat'] = String(item.getRepeat());
			if (item.getYoyo()) ia['@_yoyo'] = 'true';
			if (item.getLabel()) ia['@_label'] = item.getLabel();
			const sv = item.getStartValue();
			if (sv.length) {
				if (!item.getTween() && item.getActionType() !== 0) ia['@_value'] = sv.join(',');
				else ia['@_startValue'] = sv.join(',');
			}
			const ev = item.getEndValue();
			if (ev.length) ia['@_endValue'] = ev.join(',');
			return ia;
		});

		if (items.length > 0) attrs.item = items;
		return attrs;
	}

	private _resourceTag(propertyType: string): string | null {
		const map: Record<string, string> = {
			ImageResource: 'image',
			Component: 'component',
			SoundResource: 'sound',
			FontResource: 'font',
			MovieClipResource: 'movieclip',
		};
		return map[propertyType] ?? null;
	}

	private _resourceFileName(res: WritableResource): string {
		const name = res.getName?.() ?? '';
		const type = res.propertyType as string;
		if (type === 'Component') return name + '.xml';
		// For other types the name usually includes the extension already (stored from original)
		return name;
	}

	private _projectTypeName(type: number): string {
		const names: Record<number, string> = {
			0: 'Unity', 1: 'Flash', 2: 'Starling', 3: 'CocosCreator',
			4: 'Layabox', 5: 'Egret', 6: 'Haxe', 7: 'Pixi',
			8: 'LibGDX', 9: 'Unreal',
		};
		return names[type] ?? 'Unity';
	}
}
