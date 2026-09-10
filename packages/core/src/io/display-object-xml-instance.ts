import type { Document } from '../document.js';
import type { GObject } from '../properties/g-object.js';
import { ensureArray, parseBool, parseFloat2, parseInt2 } from '../utils/xml-utils.js';
import { PROJECT_XML_PROTOCOL, readXmlAttr, type XmlNodeProtocol } from './project-xml-protocol.js';
import {
	getXmlNode,
	getProtocolChildName,
	parsePropertyOverrides,
	type ComboItemXmlNode,
	type ExtensionXmlNode,
	type DisplayObjectXmlNode,
} from './display-object-xml-shared.js';

const EXTENSION_PROTOCOL_MAP = {
	Button: PROJECT_XML_PROTOCOL.buttonExtension,
	Label: PROJECT_XML_PROTOCOL.labelExtension,
	ComboBox: PROJECT_XML_PROTOCOL.comboBoxExtension,
	ProgressBar: PROJECT_XML_PROTOCOL.progressBarExtension,
	Slider: PROJECT_XML_PROTOCOL.sliderExtension,
	ScrollBar: PROJECT_XML_PROTOCOL.scrollBarExtension,
} as const;
function getProtocolExtensionChildNames(protocol: XmlNodeProtocol): Array<keyof typeof EXTENSION_PROTOCOL_MAP> {
	return Object.keys(protocol.children ?? {}).filter(
		(name): name is keyof typeof EXTENSION_PROTOCOL_MAP => name in EXTENSION_PROTOCOL_MAP,
	);
}

function parseComboBoxItemXmlNode(item: ComboItemXmlNode): {
	title: string | null;
	value: string | null;
	icon: string | null;
} {
	const specs = PROJECT_XML_PROTOCOL.comboBoxItem.attrs;
	return {
		title: readXmlAttr<string>(item, specs.title) ?? null,
		value: readXmlAttr<string>(item, specs.value) ?? null,
		icon: readXmlAttr<string>(item, specs.icon) ?? null,
	};
}

export function readComponentInstanceOverlays(obj: GObject, attrs: DisplayObjectXmlNode): void {
	if (obj.propertyType === 'GComponent') {
		(obj as ReturnType<Document['createGComponent']>).setPropertyOverrides(
			parsePropertyOverrides(attrs, PROJECT_XML_PROTOCOL.componentInstance),
		);
	}

	// Parse extension overlay data for child component instances
	// e.g. <component id="n18" src="rpmb10"><Button title="点我" icon="..."/></component>
	for (const extTypeName of getProtocolExtensionChildNames(PROJECT_XML_PROTOCOL.componentInstance)) {
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
			const selectedTitle = extSpecs.selectedTitle
				? readXmlAttr<string>(extAttrs, extSpecs.selectedTitle)
				: undefined;
			if (selectedTitle !== undefined) componentObj.setInstanceSelectedTitle?.(selectedTitle);
			const icon = extSpecs.icon ? readXmlAttr<string>(extAttrs, extSpecs.icon) : undefined;
			if (icon !== undefined) componentObj.setInstanceIcon?.(icon);
			const selectedIcon = extSpecs.selectedIcon
				? readXmlAttr<string>(extAttrs, extSpecs.selectedIcon)
				: undefined;
			if (selectedIcon !== undefined) componentObj.setInstanceSelectedIcon?.(selectedIcon);
			const titleColor = extSpecs.titleColor ? readXmlAttr<string>(extAttrs, extSpecs.titleColor) : undefined;
			if (titleColor !== undefined) componentObj.setInstanceTitleColor?.(titleColor);
			const titleFontSize = extSpecs.titleFontSize
				? readXmlAttr<string | number>(extAttrs, extSpecs.titleFontSize)
				: undefined;
			if (titleFontSize !== undefined) componentObj.setInstanceTitleFontSize?.(parseInt2(titleFontSize));
			const controller = extSpecs.controller ? readXmlAttr<string>(extAttrs, extSpecs.controller) : undefined;
			if (controller !== undefined) componentObj.setInstanceController?.(controller);
			const page = extSpecs.page ? readXmlAttr<string>(extAttrs, extSpecs.page) : undefined;
			if (page !== undefined) componentObj.setInstancePage?.(page);
			const checked = extSpecs.checked ? readXmlAttr<string | boolean>(extAttrs, extSpecs.checked) : undefined;
			if (checked !== undefined) componentObj.setInstanceChecked?.(parseBool(checked));
			const sound = extSpecs.sound ? readXmlAttr<string>(extAttrs, extSpecs.sound) : undefined;
			if (sound !== undefined) componentObj.setInstanceSound?.(sound);
			const soundVolumeScale = extSpecs.soundVolumeScale
				? readXmlAttr<string | number>(extAttrs, extSpecs.soundVolumeScale)
				: undefined;
			if (soundVolumeScale !== undefined)
				componentObj.setInstanceSoundVolumeScale?.(parseFloat2(soundVolumeScale, 100) / 100);
			const popupDirection = extSpecs.popupDirection
				? readXmlAttr<string>(extAttrs, extSpecs.popupDirection)
				: undefined;
			if (popupDirection !== undefined) {
				componentObj.setInstancePopupDirection?.(
					({ auto: 0, up: 1, down: 2 } as Record<string, number>)[popupDirection] ?? 0,
				);
			}
			const prompt = extSpecs.prompt ? readXmlAttr<string>(extAttrs, extSpecs.prompt) : undefined;
			if (prompt !== undefined) componentObj.setInstancePromptText?.(prompt);
			const selectionController = extSpecs.selectionController
				? readXmlAttr<string>(extAttrs, extSpecs.selectionController)
				: undefined;
			if (selectionController !== undefined) componentObj.setInstanceSelectionController?.(selectionController);
			const visibleItemCount = extSpecs.visibleItemCount
				? readXmlAttr<string | number>(extAttrs, extSpecs.visibleItemCount)
				: undefined;
			if (visibleItemCount !== undefined) componentObj.setInstanceVisibleItemCount?.(parseInt2(visibleItemCount));
			const autoClearItems = extSpecs.autoClearItems
				? readXmlAttr<string | boolean>(extAttrs, extSpecs.autoClearItems)
				: undefined;
			if (autoClearItems !== undefined) componentObj.setInstanceAutoClearItems?.(parseBool(autoClearItems));
			const value = extSpecs.value ? readXmlAttr<string | number>(extAttrs, extSpecs.value) : undefined;
			if (value !== undefined) componentObj.setInstanceValue?.(parseInt2(value));
			const max = extSpecs.max ? readXmlAttr<string | number>(extAttrs, extSpecs.max) : undefined;
			if (max !== undefined) componentObj.setInstanceMax?.(parseInt2(max, 100));
			const min = extSpecs.min ? readXmlAttr<string | number>(extAttrs, extSpecs.min) : undefined;
			if (min !== undefined) componentObj.setInstanceMin?.(parseInt2(min));
			const comboBoxItemChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.comboBoxExtension, 'item');
			if (extTypeName === 'ComboBox' && comboBoxItemChildName && extAttrs[comboBoxItemChildName]) {
				const comboItems = ensureArray(extAttrs[comboBoxItemChildName]);
				componentObj.setInstanceComboItems?.(
					comboItems
						.map((itemDef) => getXmlNode<ComboItemXmlNode>(itemDef))
						.filter((itemDef): itemDef is ComboItemXmlNode => itemDef !== null)
						.map((itemDef) => parseComboBoxItemXmlNode(itemDef)),
				);
			}
		}
	}
}
