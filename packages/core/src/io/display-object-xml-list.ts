import type { Document } from '../document.js';
import type { GComponentPropertyOverride } from '../properties/g-component.js';
import { getDefaultListAutoResizeItem } from '../properties/g-list.js';
import { ensureArray, parseBool, parseInt2 } from '../utils/xml-utils.js';
import { PROJECT_XML_PROTOCOL, readXmlAttr } from './project-xml-protocol.js';
import { resolveTreeItemIsFolder } from './tree-item-hierarchy.js';
import {
	getXmlNode,
	getProtocolChildName,
	parsePropertyOverrides,
	type ListItemXmlNode,
	type DisplayObjectXmlNode,
} from './display-object-xml-shared.js';

function inferTreeItemFolderFlags(
	items: Array<{
		title: string | null;
		icon: string | null;
		url: string | null;
		name: string | null;
		selectedTitle: string | null;
		selectedIcon: string | null;
		level: number;
		isFolder: boolean | null;
		controllers?: string | null;
	}>,
): Array<{
	title: string | null;
	icon: string | null;
	url: string | null;
	name: string | null;
	selectedTitle: string | null;
	selectedIcon: string | null;
	level: number;
	isFolder: boolean | null;
	controllers?: string | null;
}> {
	return items.map((item, index) => {
		if (item.isFolder !== null) return item;
		return { ...item, isFolder: resolveTreeItemIsFolder(items, index) };
	});
}

function parseListItemXmlNode(item: ListItemXmlNode): {
	title: string | null;
	icon: string | null;
	url: string | null;
	name: string | null;
	selectedTitle: string | null;
	selectedIcon: string | null;
	level: number;
	isFolder: boolean | null;
	controllers?: string | null;
	propertyOverrides?: GComponentPropertyOverride[];
} {
	const specs = PROJECT_XML_PROTOCOL.listItem.attrs;
	const isFolder = readXmlAttr<string | boolean>(item, specs.isFolder);
	const controllers = readXmlAttr<string>(item, specs.controllers);
	const propertyOverrides = parsePropertyOverrides(item, PROJECT_XML_PROTOCOL.listItem);
	return {
		title: readXmlAttr<string>(item, specs.title) ?? null,
		icon: readXmlAttr<string>(item, specs.icon) ?? null,
		url: readXmlAttr<string>(item, specs.url) ?? null,
		name: readXmlAttr<string>(item, specs.name) ?? null,
		selectedTitle: readXmlAttr<string>(item, specs.selectedTitle) ?? null,
		selectedIcon: readXmlAttr<string>(item, specs.selectedIcon) ?? null,
		level: parseInt2(readXmlAttr<string | number>(item, specs.level)),
		isFolder: isFolder !== undefined ? parseBool(isFolder) : null,
		...(controllers !== undefined ? { controllers } : {}),
		...(propertyOverrides.length > 0 ? { propertyOverrides } : {}),
	};
}

export function createListDisplayObject(
	doc: Document,
	name: string,
	attrs: DisplayObjectXmlNode,
): ReturnType<Document['createGList']> | ReturnType<Document['createGTree']> {
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
			singleColumn: 0,
			singleRow: 1,
			flowHorizontal: 2,
			flowVertical: 3,
			pagination: 4,
			single_column: 0,
			single_row: 1,
			flow_hz: 2,
			flow_vt: 3,
			column: 0,
			row: 1,
		};
		g.setLayout(layoutMap[layout] ?? 0);
	}
	const align = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.align);
	if (align) {
		const alignMap: Record<string, number> = { left: 0, center: 1, right: 2 };
		g.setAlign(alignMap[align] ?? 0);
	}
	const vAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.vAlign);
	if (vAlign) {
		const vAlignMap: Record<string, number> = { top: 0, middle: 1, bottom: 2 };
		g.setVAlign(vAlignMap[vAlign] ?? 0);
	}
	const lineGap = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineGap);
	if (lineGap !== undefined) g.setLineGap(parseInt2(lineGap));
	const columnGap = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.columnGap);
	if (columnGap !== undefined) g.setColumnGap(parseInt2(columnGap));
	const lineItemCount = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineItemCount);
	const lineItemCount2 = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineItemCount2);
	if (layout) {
		const resolvedLayout = g.getLayout?.() ?? 0;
		if (resolvedLayout === 2 || resolvedLayout === 4) {
			if (lineItemCount !== undefined) g.setColumnCount?.(parseInt2(lineItemCount));
		} else if (resolvedLayout === 3 && lineItemCount !== undefined) {
			g.setLineCount?.(parseInt2(lineItemCount));
		}
		if (resolvedLayout === 4 && lineItemCount2 !== undefined) {
			g.setLineCount?.(parseInt2(lineItemCount2));
		}
	}
	const autoResizeItem = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.list.attrs.autoResizeItem);
	g.setAutoResizeItem?.(
		autoResizeItem === undefined ? getDefaultListAutoResizeItem(g.getLayout?.() ?? 0) : parseBool(autoResizeItem),
	);
	const childrenRenderOrder = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.childrenRenderOrder);
	if (childrenRenderOrder) {
		const renderOrderMap: Record<string, number> = { ascent: 0, descent: 1, arch: 2 };
		g.setChildrenRenderOrder?.(renderOrderMap[childrenRenderOrder] ?? 0);
	}
	const apexIndex = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.apexIndex);
	if (apexIndex !== undefined) g.setApexIndex?.(parseInt2(apexIndex));
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
	const scrollBar = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBar);
	const scrollBarFlags = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBarFlags);
	const margin = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.margin);
	if (overflow || scroll || scrollBar || scrollBarFlags !== undefined || margin) {
		if (overflow) {
			const overflowMap: Record<string, number> = { visible: 0, hidden: 1, scroll: 2 };
			g.setOverflow(overflowMap[overflow] ?? 0);
		}
		if (scroll) {
			const scrollMap: Record<string, number> = { horizontal: 0, vertical: 1, both: 2 };
			g.setScrollType(scrollMap[scroll] ?? 1);
		}
		if (scrollBar) {
			const scrollBarMap: Record<string, number> = { default: 0, visible: 1, auto: 2, hidden: 3 };
			g.setScrollBarDisplay(scrollBarMap[scrollBar] ?? 0);
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
	const scrollBarMargin = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBarMargin);
	if (scrollBarMargin) {
		const parts = scrollBarMargin.split(',').map(Number);
		g.setScrollBarMargin?.({
			top: parts[0] ?? 0,
			bottom: parts[1] ?? 0,
			left: parts[2] ?? 0,
			right: parts[3] ?? 0,
		});
	}
	// clipSoftness
	const clipSoftness = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.list.attrs.clipSoftness);
	if (clipSoftness) {
		const csParts = clipSoftness.split(',').map(Number);
		g.setClipSoftness({ x: csParts[0] ?? 0, y: csParts[1] ?? 0 });
	}
	const scrollItemToViewOnClick = readXmlAttr<string | boolean>(
		attrs,
		PROJECT_XML_PROTOCOL.list.attrs.scrollItemToViewOnClick,
	);
	if (scrollItemToViewOnClick !== undefined) {
		g.setScrollItemToViewOnClick?.(parseBool(scrollItemToViewOnClick));
	}
	const foldInvisibleItems = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.list.attrs.foldInvisibleItems);
	if (foldInvisibleItems !== undefined) g.setFoldInvisibleItems?.(parseBool(foldInvisibleItems));
	const autoClearItems = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.list.attrs.autoClearItems);
	if (autoClearItems !== undefined) g.setAutoClearItems?.(parseBool(autoClearItems));
	// Parse static list items
	const listItemChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.list, 'item');
	const items = listItemChildName ? ensureArray(attrs[listItemChildName]) : [];
	if (items.length > 0) {
		const listItems = items
			.map((itemDef) => getXmlNode<ListItemXmlNode>(itemDef))
			.filter((itemDef): itemDef is ListItemXmlNode => itemDef !== null)
			.map((itemDef) => parseListItemXmlNode(itemDef));
		g.setListItems(isTree ? inferTreeItemFolderFlags(listItems) : listItems);
	}
	return g;
}
