import type { UamImageProperties, UamMovieClipProperties } from '../model.js';
import { hasExactKeys, isUamColor } from './values.js';

const IMAGE_PROPERTY_KEYS = [
	'color',
	'flip',
	'fillMethod',
	'fillOrigin',
	'fillClockwise',
	'fillAmount',
] as const satisfies readonly (keyof UamImageProperties)[];

export function isValidUamImageProperties(value: unknown): value is UamImageProperties {
	if (typeof value !== 'object' || value === null || !hasExactKeys(value, IMAGE_PROPERTY_KEYS)) return false;
	const properties = value as UamImageProperties;
	return isUamColor(properties.color)
		&& Number.isInteger(properties.flip) && properties.flip >= 0 && properties.flip <= 3
		&& Number.isInteger(properties.fillMethod) && properties.fillMethod >= 0 && properties.fillMethod <= 5
		&& Number.isInteger(properties.fillOrigin) && properties.fillOrigin >= 0 && properties.fillOrigin <= 3
		&& typeof properties.fillClockwise === 'boolean'
		&& typeof properties.fillAmount === 'number' && Number.isFinite(properties.fillAmount)
		&& (properties.fillMethod === 0
			? properties.fillOrigin === 0 && properties.fillClockwise && properties.fillAmount === 100
			: properties.fillAmount >= 0 && properties.fillAmount <= 1);
}

const MOVIE_CLIP_PROPERTY_KEYS = [
	'playing',
	'frame',
	'color',
] as const satisfies readonly (keyof UamMovieClipProperties)[];

export function isValidUamMovieClipProperties(value: unknown): value is UamMovieClipProperties {
	if (typeof value !== 'object' || value === null || !hasExactKeys(value, MOVIE_CLIP_PROPERTY_KEYS)) return false;
	const properties = value as UamMovieClipProperties;
	return typeof properties.playing === 'boolean'
		&& Number.isInteger(properties.frame) && properties.frame >= 0
		&& isUamColor(properties.color);
}
