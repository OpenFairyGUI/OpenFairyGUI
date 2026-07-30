import type { RelationDef } from '../constants.js';
import type { Component } from '../properties/component.js';
import type { Package } from '../properties/package.js';

export type ChildNode = ReturnType<Component['listChildren']>[number];
export type TransitionNode = ReturnType<Component['listTransitions']>[number];
export type TransitionItemNode = ReturnType<TransitionNode['listItems']>[number];
export type GearNode = ReturnType<ChildNode['listGears']>[number];

export type EncoderChildLike = ChildNode & {
	getSrc?(): string;
	getPackageId?(): string;
	getX?(): number;
	getY?(): number;
	getWidth?(): number;
	getHeight?(): number;
	getColor?(): string;
	getPivotX?(): number;
	getPivotY?(): number;
	getPivotAsAnchor?(): boolean;
	getScaleX?(): number;
	getScaleY?(): number;
	getSkewX?(): number;
	getSkewY?(): number;
	getAlpha?(): number;
	getRotation?(): number;
	getVisible?(): boolean;
	getTouchable?(): boolean;
	getGrayed?(): boolean;
	getBlendMode?(): number;
	getFlip?(): number;
	getFillMethod?(): number;
	getFillOrigin?(): number;
	getFillClockwise?(): boolean;
	getFillAmount?(): number;
	getFont?(): string | null;
	getFontSize?(): number;
	getAlign?(): number;
	getVAlign?(): number;
	getLeading?(): number;
	getLetterSpacing?(): number;
	getUbbEnabled?(): boolean;
	getAutoSize?(): boolean | number;
	getUnderline?(): boolean;
	getItalic?(): boolean;
	getBold?(): boolean;
	getStrikethrough?(): boolean;
	getSingleLine?(): boolean;
	getStrokeColor?(): string | null;
	getStrokeSize?(): number;
	getShadowColor?(): string | null;
	getShadowOffsetX?(): number;
	getShadowOffsetY?(): number;
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
	getExcludeInvisibles?(): boolean;
	getAutoSizeDisabled?(): boolean;
	getMainGridIndex?(): number;
	getUrl?(): string;
	getFill?(): number;
	getShrinkOnly?(): boolean;
	getPlaying?(): boolean;
	getFrame?(): number;
	getUseResize?(): boolean;
	getAnimationName?(): string;
	getSkinName?(): string;
	getLoop?(): boolean;
	getSelectionMode?(): number;
	getLineCount?(): number;
	getColumnCount?(): number;
	getAutoResizeItem?(): boolean;
	getChildrenRenderOrder?(): number;
	getApexIndex?(): number;
	getGroup?(): string;
	getAdvanced?(): boolean;
	getMargin?(): EdgeInsetsLike | [number, number, number, number];
	getClipSoftness?(): XYLike;
	getOverflow?(): number;
	getScrollItemToViewOnClick?(): boolean;
	getFoldInvisibleItems?(): boolean;
	getText?(): string;
	getTitle?(): string;
	getSelectedTitle?(): string;
	getIcon?(): string;
	getSelectedIcon?(): string;
	getTitleColor?(): string;
	getTitleFontSize?(): number;
	getSound?(): string;
	getSoundVolumeScale?(): number;
	getSelected?(): boolean;
	getItems?(): Array<string | null>;
	getValues?(): Array<string | null>;
	getIcons?(): Array<string | null>;
	getVisibleItemCount?(): number;
	getPopupDirection?(): number;
	getValue?(): number;
	getMax?(): number;
	getMin?(): number;
	getDefaultItem?(): string;
	getListItems?(): ListItemLike[];
	getIndent?(): number;
	getClickToExpand?(): number;
	getPromptText?(): string;
	getPrompt?(): string;
	getRestrict?(): string;
	getMaxLength?(): number;
	getKeyboardType?(): number;
	getPassword?(): boolean;
	getScrollType?(): number;
	getScrollBarFlags?(): number;
	getScrollBarMargin?(): EdgeInsetsLike | null;
	getVtScrollBarRes?(): string;
	getHzScrollBarRes?(): string;
	getHeaderRes?(): string;
	getFooterRes?(): string;
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
	getInstanceSound?(): string;
	getInstanceSoundVolumeScale?(): number;
	getInstanceVisibleItemCount?(): number;
	getInstanceValue?(): number;
	getInstanceMax?(): number;
	getInstanceMin?(): number;
	getInstanceComboItems?(): ComboItemLike[];
	getSelectionController?(): string;
	getCustomData?(): string;
	getTooltips?(): string;
};

export function getRuntimeChildren(comp: Component): EncoderChildLike[] {
	return comp
		.listChildren()
		.filter((child) => {
			const typedChild = child as EncoderChildLike;
			return typedChild.propertyType !== 'GGroup' || typedChild.getAdvanced?.() === true;
		}) as EncoderChildLike[];
}

export function getRuntimeChildIndexMap(comp: Component): Map<string, number> {
	const children = getRuntimeChildren(comp);
	const map = new Map<string, number>();
	for (let i = 0; i < children.length; i++) {
		const id = children[i].getId?.();
		if (id) map.set(id, i);
	}
	return map;
}

export interface XYLike {
	x?: number;
	y?: number;
}

export interface EdgeInsetsLike {
	top?: number;
	bottom?: number;
	left?: number;
	right?: number;
}

export type MarginLike = [number, number, number, number] | EdgeInsetsLike;

export interface ComboItemLike {
	title?: string | null;
	value?: string | null;
	icon?: string | null;
}

export interface ListItemLike {
	url?: string | null;
	title?: string | null;
	selectedTitle?: string | null;
	icon?: string | null;
	selectedIcon?: string | null;
	name?: string | null;
	level?: number;
	isFolder?: boolean | null;
	controllers?: string | null;
}

export interface ChildEncoderExtras extends Record<string, unknown> {
	_clipSoftness?: XYLike;
	controller?: string;
	page?: string;
	sound?: string;
	volume?: string | number;
	checked?: string | boolean;
	scrollBarDisplay?: number;
}

export interface PackagePublishExtras extends Record<string, unknown> {
	publishedEffectiveResourceIds?: Record<string, string>;
}

export interface RelationOwner {
	getRelations?(): RelationDef[];
}

export function getChildExtras(child: { getExtras?(): Record<string, unknown> }): ChildEncoderExtras {
	return (child.getExtras?.() as ChildEncoderExtras | undefined) ?? {};
}

export function getPublishedResourceIdMap(pkg: Package): Record<string, string> {
	return ((pkg.getExtras?.() as PackagePublishExtras | undefined) ?? {}).publishedEffectiveResourceIds ?? {};
}

export function remapLocalResourceId(pkg: Package, value: string | null | undefined): string | null {
	if (!value) return null;
	return getPublishedResourceIdMap(pkg)[value] ?? value;
}

export function resolveChildResourceRef(
	pkg: Package,
	child: Pick<EncoderChildLike, 'getSrc' | 'getPackageId'>,
): { src: string | null; packageId: string | null } {
	const src = child.getSrc?.() ?? null;
	const packageId = child.getPackageId?.() ?? '';
	if (!packageId || packageId === pkg.getId()) {
		return {
			src: remapLocalResourceId(pkg, src),
			packageId: null,
		};
	}
	return {
		src,
		packageId,
	};
}

export function remapLocalUiUrl(pkg: Package, value: string | null | undefined): string | null {
	if (!value || !value.startsWith('ui://')) return value ?? null;
	const pkgId = pkg.getId();
	const raw = value.slice(5);
	if (raw.startsWith(`${pkgId}/`)) return value;
	if (!raw.startsWith(pkgId) || raw.length <= pkgId.length) return value;
	const resourceId = raw.slice(pkgId.length);
	const mappedResourceId = remapLocalResourceId(pkg, resourceId);
	if (!mappedResourceId) return value;
	return `ui://${pkgId}${mappedResourceId}`;
}

export function remapLocalUiRefsInText(pkg: Package, value: string | null | undefined): string | null {
	if (!value) return value ?? null;
	const pkgId = pkg.getId();
	return value.replace(new RegExp(`ui://${pkgId}([0-9a-z]+)`, 'gi'), (_match, resourceId: string) => {
		const mapped = remapLocalResourceId(pkg, resourceId);
		return `ui://${pkgId}${mapped ?? resourceId}`;
	});
}

/** Safely extract a string value — handles arrays returned by property-graph getters. */
export function _strVal(v: unknown): string | null {
	if (v === null || v === undefined) return null;
	if (Array.isArray(v)) return v[0] ?? null;
	return String(v);
}

export function _numVal(v: unknown, fallback = 0): number {
	if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
	if (typeof v === 'boolean') return v ? 1 : 0;
	if (typeof v === 'string') {
		const parsed = Number(v);
		return Number.isFinite(parsed) ? parsed : fallback;
	}
	return fallback;
}

export function _numberToken(value: string | undefined, fallback: number): number {
	if (value === undefined || value.trim() === '') return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function _boolVal(v: unknown, fallback = false): boolean {
	if (typeof v === 'boolean') return v;
	if (typeof v === 'number') return v !== 0;
	if (typeof v === 'string') {
		const normalized = v.trim().toLowerCase();
		if (normalized === 'true' || normalized === '1') return true;
		if (normalized === 'false' || normalized === '0' || normalized === '') return false;
	}
	return fallback;
}
