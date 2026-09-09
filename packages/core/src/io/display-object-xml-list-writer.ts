import { type GList, type GListItemData, getDefaultListAutoResizeItem } from '../properties/g-list.js';
import type { GTree } from '../properties/g-tree.js';
import { PROJECT_XML_PROTOCOL, writeXmlAttr } from './project-xml-protocol.js';
import { formatInsets, formatProjectInt32List, getProtocolChildName, hasNonZeroInsets, serializePropertyOverrideXmlNode } from './project-xml-writer-utils.js';

export function writeListXmlNode(attrs: Record<string, unknown>, object: GList | GTree): void {
	const specs = PROJECT_XML_PROTOCOL.list.attrs;
	const src = object.getSrc();
	if (src) writeXmlAttr(attrs, specs.src, src);
	const controllerOverrides = object.getControllerOverrides();
	if (controllerOverrides) writeXmlAttr(attrs, specs.controllerOverrides, controllerOverrides);
	const pageController = object.getPageController();
	if (pageController) writeXmlAttr(attrs, specs.pageController, pageController);
	const isTree = object.propertyType === 'GTree';
	const layout = object.getLayout();
	if (layout !== undefined && layout !== 0) {
		const layoutName: Record<number, string> = {
			1: 'row',
			2: 'flow_hz',
			3: 'flow_vt',
			4: 'pagination',
		};
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.layout, layoutName[layout] ?? 'row');
	}
	const lineGap = object.getLineGap() ?? 0;
	if (lineGap !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineGap, String(lineGap));
	const columnGap = object.getColumnGap() ?? 0;
	if (columnGap !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.columnGap, String(columnGap));
	const align = object.getAlign();
	if (align !== undefined && align !== 0) {
		const alignName: Record<number, string> = { 0: 'left', 1: 'center', 2: 'right' };
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.align, alignName[align] ?? 'left');
	}
	const vAlign = object.getVAlign();
	if (vAlign !== undefined && vAlign !== 0) {
		const vAlignName: Record<number, string> = { 0: 'top', 1: 'middle', 2: 'bottom' };
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.vAlign, vAlignName[vAlign] ?? 'top');
	}
	const lineCount = object.getLineCount() ?? 0;
	const columnCount = object.getColumnCount() ?? 0;
	if ((layout === 2 || layout === 4) && columnCount !== 0) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineItemCount, String(columnCount));
	} else if (layout === 3 && lineCount !== 0) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineItemCount, String(lineCount));
	}
	if (layout === 4 && lineCount !== 0) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.lineItemCount2, String(lineCount));
	}
	const autoResizeItem = object.getAutoResizeItem() ?? true;
	if (autoResizeItem !== getDefaultListAutoResizeItem(layout ?? 0)) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.autoResizeItem, String(autoResizeItem));
	}
	const childrenRenderOrder = object.getChildrenRenderOrder() ?? 0;
	if (childrenRenderOrder !== 0) {
		const renderOrderName: Record<number, string> = { 0: 'ascent', 1: 'descent', 2: 'arch' };
		writeXmlAttr(
			attrs,
			PROJECT_XML_PROTOCOL.list.attrs.childrenRenderOrder,
			renderOrderName[childrenRenderOrder] ?? 'ascent',
		);
		const apexIndex = object.getApexIndex() ?? 0;
		if (childrenRenderOrder === 2 && apexIndex !== 0) {
			writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.apexIndex, String(apexIndex));
		}
	}
	const selectionMode = object.getSelectionMode();
	if (selectionMode !== undefined && selectionMode !== 0) {
		const selectionName: Record<number, string> = {
			0: 'single',
			1: 'multiple',
			2: 'multipleSingleClick',
			3: 'none',
		};
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.selectionMode, selectionName[selectionMode] ?? 'single');
	}
	const defaultItem = object.getDefaultItem();
	if (defaultItem) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.defaultItem, defaultItem);
	const selectionController = object.getSelectionController();
	if (selectionController) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.selectionController, selectionController);
	if (isTree) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.treeView, 'true');
	if (isTree) {
		const indent = object.getIndent() ?? 0;
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.indent, String(indent));
		const clickToExpand = object.getClickToExpand() ?? 0;
		if (clickToExpand !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.clickToExpand, String(clickToExpand));
	}
	const overflow = object.getOverflow() ?? 0;
	if (overflow !== 0) {
		const overflowName: Record<number, string> = { 0: 'visible', 1: 'hidden', 2: 'scroll' };
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.overflow, overflowName[overflow] ?? 'visible');
	}
	const scrollType = object.getScrollType();
	if (scrollType !== undefined && scrollType !== 1) {
		const scrollTypeName: Record<number, string> = { 0: 'horizontal', 1: 'vertical', 2: 'both' };
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.scroll, scrollTypeName[scrollType] ?? 'vertical');
	}
	const scrollBarDisplay = object.getScrollBarDisplay() ?? 0;
	if (overflow === 2 && scrollBarDisplay !== 0) {
		const scrollBarName: Record<number, string> = { 0: 'default', 1: 'visible', 2: 'auto', 3: 'hidden' };
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBar, scrollBarName[scrollBarDisplay] ?? 'default');
	}
	const scrollBarFlags = object.getScrollBarFlags() ?? 0;
	if (scrollBarFlags !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBarFlags, String(scrollBarFlags));
	const scrollBarMargin = object.getScrollBarMargin();
	if (hasNonZeroInsets(scrollBarMargin)) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBarMargin, formatInsets(scrollBarMargin!, 'list scrollBarMargin'));
	}
	const vtScrollBarRes = object.getVtScrollBarRes() ?? '';
	const hzScrollBarRes = object.getHzScrollBarRes() ?? '';
	if (vtScrollBarRes || hzScrollBarRes) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollBarRes, `${vtScrollBarRes},${hzScrollBarRes}`);
	const headerRes = object.getHeaderRes() ?? '';
	const footerRes = object.getFooterRes() ?? '';
	if (headerRes || footerRes) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.ptrRes, `${headerRes},${footerRes}`);
	const margin = object.getMargin();
	if (hasNonZeroInsets(margin)) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.margin, formatInsets(margin!, 'list margin'));
	const clipSoftness = object.getClipSoftness();
	if (clipSoftness && ((clipSoftness.x ?? 0) !== 0 || (clipSoftness.y ?? 0) !== 0)) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.clipSoftness, formatProjectInt32List([
			clipSoftness.x ?? 0,
			clipSoftness.y ?? 0,
		], 'list clipSoftness'));
	}
	if (object.getScrollItemToViewOnClick() === false) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.scrollItemToViewOnClick, 'false');
	}
	if (object.getFoldInvisibleItems() === true) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.foldInvisibleItems, 'true');
	}
	if (object.getAutoClearItems() === true) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.list.attrs.autoClearItems, 'true');
	}
	const listItems = object.getListItems() ?? [];
	const listItemChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.list, 'item');
	if (listItems.length > 0 && listItemChildName) {
		attrs[listItemChildName] = listItems.map((item) => serializeListItemXmlNode(item, { forceLevel: isTree }));
	}
}

function serializeListItemXmlNode(item: GListItemData, options?: {
	forceLevel?: boolean;
}): Record<string, unknown> {
	const attrs: Record<string, unknown> = {};
	const specs = PROJECT_XML_PROTOCOL.listItem.attrs;
	if (item.title !== undefined && item.title !== null) writeXmlAttr(attrs, specs.title, item.title);
	if (item.icon !== undefined && item.icon !== null) writeXmlAttr(attrs, specs.icon, item.icon);
	if (item.url !== undefined && item.url !== null) writeXmlAttr(attrs, specs.url, item.url);
	if (item.name !== undefined && item.name !== null) writeXmlAttr(attrs, specs.name, item.name);
	if (item.selectedTitle !== undefined && item.selectedTitle !== null) writeXmlAttr(attrs, specs.selectedTitle, item.selectedTitle);
	if (item.selectedIcon !== undefined && item.selectedIcon !== null) writeXmlAttr(attrs, specs.selectedIcon, item.selectedIcon);
	if (item.level !== undefined && item.level !== null && ((options?.forceLevel ?? false) || item.level !== 0 || item.isFolder === true)) {
		writeXmlAttr(attrs, specs.level, String(item.level));
	}
	if (item.isFolder !== undefined && item.isFolder !== null) {
		writeXmlAttr(attrs, specs.isFolder, item.isFolder ? 'true' : 'false');
	}
	if (item.controllers !== undefined && item.controllers !== null) writeXmlAttr(attrs, specs.controllers, item.controllers);
	const propertyChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.listItem, 'property');
	if (propertyChildName && item.propertyOverrides?.length) {
		attrs[propertyChildName] = item.propertyOverrides.map(serializePropertyOverrideXmlNode);
	}
	return attrs;
}
