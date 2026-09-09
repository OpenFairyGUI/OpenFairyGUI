import type { GComponent, IGComponent } from '../properties/g-component.js';
import { PROJECT_XML_PROTOCOL, writeXmlAttr } from './project-xml-protocol.js';
import { EXTENSION_PROTOCOL_MAP, formatProjectInt32, getProtocolChildName, serializePropertyOverrideXmlNode } from './project-xml-writer-utils.js';

/** Returns the extension separately so the caller can append it after Gear and relations. */
export function writeComponentInstanceXmlNode(
	attrs: Record<string, unknown>,
	object: GComponent,
): { name: string; value: Record<string, unknown> | string } | undefined {
	const specs = PROJECT_XML_PROTOCOL.componentInstance.attrs;
	const src = object.getSrc();
	if (src) writeXmlAttr(attrs, specs.src, src);
	const controllerOverrides = object.getControllerOverrides();
	if (controllerOverrides) writeXmlAttr(attrs, specs.controllerOverrides, controllerOverrides);
	const pageController = object.getPageController();
	if (pageController) writeXmlAttr(attrs, specs.pageController, pageController);
	const fileName = object.getFileName();
	if (fileName) writeXmlAttr(attrs, specs.fileName, fileName);
	const packageId = object.getPackageId();
	if (packageId) writeXmlAttr(attrs, specs.pkg, packageId);
	const propertyOverrides = object.getPropertyOverrides() ?? [];
	const propertyChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.componentInstance, 'property');
	if (propertyChildName && propertyOverrides.length > 0) {
		attrs[propertyChildName] = propertyOverrides.map(serializePropertyOverrideXmlNode);
	}
	const instanceExtType = object.getInstanceExtType() ?? '';
	if (instanceExtType) {
		const extProtocol = EXTENSION_PROTOCOL_MAP[instanceExtType as keyof typeof EXTENSION_PROTOCOL_MAP];
		const extSpecs = extProtocol.attrs as Record<string, { canonical: string }>;
		const extAttrs: Record<string, unknown> = {};
		if (object.getInstanceTitle() && extSpecs.title) writeXmlAttr(extAttrs, extSpecs.title, object.getInstanceTitle());
		if (object.getInstanceSelectedTitle() && extSpecs.selectedTitle) writeXmlAttr(extAttrs, extSpecs.selectedTitle, object.getInstanceSelectedTitle());
		if (object.getInstanceIcon() && extSpecs.icon) writeXmlAttr(extAttrs, extSpecs.icon, object.getInstanceIcon());
		if (object.getInstanceSelectedIcon() && extSpecs.selectedIcon) writeXmlAttr(extAttrs, extSpecs.selectedIcon, object.getInstanceSelectedIcon());
		if (object.getInstanceTitleColor() && extSpecs.titleColor) writeXmlAttr(extAttrs, extSpecs.titleColor, object.getInstanceTitleColor());
		if ((object.getInstanceTitleFontSize() ?? 0) > 0 && extSpecs.titleFontSize) writeXmlAttr(extAttrs, extSpecs.titleFontSize, String(object.getInstanceTitleFontSize() ?? 0));
		if (object.getInstanceController() && extSpecs.controller) writeXmlAttr(extAttrs, extSpecs.controller, object.getInstanceController());
		if (object.getInstancePage() && extSpecs.page) writeXmlAttr(extAttrs, extSpecs.page, object.getInstancePage());
		if (object.getInstanceChecked() && extSpecs.checked) writeXmlAttr(extAttrs, extSpecs.checked, '1');
		const popupDirection = object.getInstancePopupDirection() ?? 0;
		if (popupDirection !== 0 && extSpecs.popupDirection) {
			writeXmlAttr(extAttrs, extSpecs.popupDirection, ({ 1: 'up', 2: 'down' } as Record<number, string>)[popupDirection]);
		}
		if (object.getInstanceSound() && extSpecs.sound) writeXmlAttr(extAttrs, extSpecs.sound, object.getInstanceSound());
		if ((object.getInstanceSoundVolumeScale() ?? 1) !== 1 && extSpecs.soundVolumeScale) {
			writeXmlAttr(extAttrs, extSpecs.soundVolumeScale, formatProjectInt32(
				Math.round((object.getInstanceSoundVolumeScale() ?? 1) * 100),
				'component instance volume',
			));
		}
		if (object.getInstancePromptText() && extSpecs.prompt) writeXmlAttr(extAttrs, extSpecs.prompt, object.getInstancePromptText());
		if (object.getInstanceSelectionController() && extSpecs.selectionController) writeXmlAttr(extAttrs, extSpecs.selectionController, object.getInstanceSelectionController());
		if ((object.getInstanceVisibleItemCount() ?? 0) > 0 && extSpecs.visibleItemCount) writeXmlAttr(extAttrs, extSpecs.visibleItemCount, String(object.getInstanceVisibleItemCount() ?? 0));
		if (object.getInstanceAutoClearItems() && extSpecs.autoClearItems) writeXmlAttr(extAttrs, extSpecs.autoClearItems, 'true');
		const instanceValue = object.getInstanceValue() ?? 0;
		const instanceMax = object.getInstanceMax() ?? 0;
		const instanceMin = object.getInstanceMin() ?? 0;
		if (instanceValue !== 0 && extSpecs.value) writeXmlAttr(extAttrs, extSpecs.value, String(instanceValue));
		if (instanceMax !== 0 && extSpecs.max) writeXmlAttr(extAttrs, extSpecs.max, String(instanceMax));
		if (instanceMin !== 0 && extSpecs.min) writeXmlAttr(extAttrs, extSpecs.min, String(instanceMin));
		const comboItems = object.getInstanceComboItems() ?? [];
		const comboBoxItemChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.comboBoxExtension, 'item');
		if (comboItems.length > 0 && comboBoxItemChildName) {
			extAttrs[comboBoxItemChildName] = comboItems.map((item) => serializeComboBoxItemXmlNode(item));
		}
		const extensionChildName = getProtocolChildName(PROJECT_XML_PROTOCOL.componentInstance, instanceExtType) ?? undefined;
		if (extensionChildName) {
			return { name: extensionChildName, value: Object.keys(extAttrs).length > 0 ? extAttrs : '' };
		}
	}
	return undefined;
}

function serializeComboBoxItemXmlNode(item: IGComponent['instanceComboItems'][number]): Record<string, unknown> {
	const attrs: Record<string, unknown> = {};
	const specs = PROJECT_XML_PROTOCOL.comboBoxItem.attrs;
	if (item.title !== undefined && item.title !== null) writeXmlAttr(attrs, specs.title, item.title);
	if (item.value !== undefined && item.value !== null) writeXmlAttr(attrs, specs.value, item.value);
	if (item.icon !== undefined && item.icon !== null) writeXmlAttr(attrs, specs.icon, item.icon);
	return attrs;
}
