import { ObjectType } from '../constants.js';

export const COMPONENT_EXTENSION_TYPE_CODES: Readonly<Record<string, number>> = {
	Label: ObjectType.Label,
	Button: ObjectType.Button,
	ComboBox: ObjectType.ComboBox,
	ProgressBar: ObjectType.ProgressBar,
	Slider: ObjectType.Slider,
	ScrollBar: ObjectType.ScrollBar,
};
export const COMPONENT_EXTENSION_TYPE_NAMES: Readonly<Record<number, string>> = Object.fromEntries(
	Object.entries(COMPONENT_EXTENSION_TYPE_CODES).map(([name, code]) => [code, name]),
);
