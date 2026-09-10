import type { UamComponentInstanceProperties, UamComponentPropertyOverride } from '../model.js';
import { hasExactKeys, isUamColor, isUiResourceReference as isSoundReference } from './values.js';

export function isValidUamComponentPropertyOverride(
	value: unknown,
): value is UamComponentPropertyOverride {
	if (!value || typeof value !== 'object' || !hasExactKeys(value, ['target', 'propertyId', 'value'])) return false;
	const property = value as UamComponentPropertyOverride;
	return typeof property.target === 'string'
		&& property.target.length > 0
		&& Number.isSafeInteger(property.propertyId)
		&& property.propertyId >= 0
		&& typeof property.value === 'string';
}

function isNullableString(value: unknown): boolean {
	return value === null || typeof value === 'string';
}

function isSoundVolume(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function isValidUamComponentInstanceProperties(
	value: unknown,
): value is UamComponentInstanceProperties {
	if (typeof value !== 'object' || value === null || !('extensionType' in value)) return false;
	const properties = value as UamComponentInstanceProperties;
	const finite = (number: unknown) => typeof number === 'number' && Number.isFinite(number);
	switch (properties.extensionType) {
		case 'Button':
			return hasExactKeys(properties, [
				'extensionType', 'title', 'selectedTitle', 'icon', 'selectedIcon', 'titleColor',
				'titleFontSize', 'controller', 'page', 'checked', 'sound', 'soundVolumeScale',
			])
				&& [
					properties.title, properties.selectedTitle, properties.icon, properties.selectedIcon,
					properties.titleColor, properties.controller, properties.page, properties.sound,
				].every((item) => typeof item === 'string')
				&& finite(properties.titleFontSize)
				&& typeof properties.checked === 'boolean'
				&& isSoundReference(properties.sound)
				&& isSoundVolume(properties.soundVolumeScale);
		case 'Label':
			return hasExactKeys(properties, [
				'extensionType', 'title', 'icon', 'titleColor', 'titleFontSize', 'promptText',
				'sound', 'soundVolumeScale',
			])
				&& [properties.title, properties.icon, properties.promptText]
					.every((item) => typeof item === 'string')
				&& (properties.titleColor === '' || isUamColor(properties.titleColor))
				&& finite(properties.titleFontSize)
				&& isSoundReference(properties.sound)
				&& isSoundVolume(properties.soundVolumeScale);
		case 'ComboBox':
			return hasExactKeys(properties, [
				'extensionType', 'title', 'icon', 'titleColor', 'popupDirection', 'sound', 'soundVolumeScale',
				'visibleItemCount', 'selectionController', 'autoClearItems', 'items',
			])
				&& [properties.title, properties.icon, properties.selectionController]
					.every((item) => typeof item === 'string')
				&& (properties.titleColor === '' || isUamColor(properties.titleColor))
				&& Number.isInteger(properties.popupDirection)
				&& properties.popupDirection >= 0
				&& properties.popupDirection <= 2
				&& isSoundReference(properties.sound)
				&& isSoundVolume(properties.soundVolumeScale)
				&& finite(properties.visibleItemCount)
				&& typeof properties.autoClearItems === 'boolean'
				&& Array.isArray(properties.items)
				&& properties.items.every((item) => (
					item
					&& typeof item === 'object'
					&& hasExactKeys(item, ['title', 'value', 'icon'])
					&& isNullableString(item.title)
					&& isNullableString(item.value)
					&& isNullableString(item.icon)
				));
		case 'ProgressBar':
			return hasExactKeys(properties, [
				'extensionType', 'value', 'max', 'min', 'sound', 'soundVolumeScale',
			])
				&& [properties.value, properties.max, properties.min].every(finite)
				&& isSoundReference(properties.sound)
				&& isSoundVolume(properties.soundVolumeScale);
		case 'Slider':
			return hasExactKeys(properties, ['extensionType', 'value', 'max', 'min'])
				&& [properties.value, properties.max, properties.min].every(finite);
		case 'ScrollBar':
			return hasExactKeys(properties, ['extensionType']);
		default:
			return false;
	}
}
