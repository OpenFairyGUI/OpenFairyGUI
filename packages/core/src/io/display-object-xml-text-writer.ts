import type { GTextField } from '../properties/g-text-field.js';
import type { GTextInput } from '../properties/g-text-input.js';
import { PROJECT_XML_PROTOCOL, writeXmlAttr } from './project-xml-protocol.js';
import { formatXmlColor, isDefaultBlackColor } from './project-xml-writer-utils.js';

export function writeTextXmlAttributes(attrs: Record<string, unknown>, object: GTextField): void {
	const type = object.propertyType;
	if (object.getAutoClearText()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoClearText, 'true');
	if (type !== 'GRichTextField') {
		const demoText = object.getDemoText();
		if (demoText !== undefined && demoText !== '') writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.demoText, demoText);
		if (object.getTemplateVarsEnabled()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.vars, 'true');
		const faceDilate = object.getFaceDilate() ?? 0;
		if (faceDilate !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.faceDilate, String(faceDilate));
		const outlineSoftness = object.getOutlineSoftness() ?? 0;
		if (outlineSoftness !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.outlineSoftness, String(outlineSoftness));
		const underlaySoftness = object.getUnderlaySoftness() ?? 0;
		if (underlaySoftness !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.underlaySoftness, String(underlaySoftness));
	}
	if (type === 'GRichTextField') {
		const outlineSoftness = object.getOutlineSoftness() ?? 0;
		if (outlineSoftness !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.richText.attrs.outlineSoftness, String(outlineSoftness));
		const underlaySoftness = object.getUnderlaySoftness() ?? 0;
		if (underlaySoftness !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.richText.attrs.underlaySoftness, String(underlaySoftness));
	}
	const text = object.getText();
	if (text !== undefined && text !== null) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.text, text);
	const font = object.getFont();
	if (font) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.font, font);
	const fontSize = object.getFontSize();
	if (fontSize) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.fontSize, String(fontSize));
	const color = object.getColor();
	if (color && !isDefaultBlackColor(color)) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.color, formatXmlColor(color));
	const align = object.getAlign();
	if (align !== undefined && align !== 0) {
		const alignName: Record<number, string> = { 0: 'left', 1: 'center', 2: 'right' };
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.align, alignName[align] ?? 'left');
	}
	const vAlign = object.getVAlign();
	if (vAlign !== undefined && vAlign !== 0) {
		const vAlignName: Record<number, string> = { 0: 'top', 1: 'middle', 2: 'bottom' };
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.vAlign, vAlignName[vAlign] ?? 'top');
	}
	const autoSize = object.getAutoSize();
	if (typeof autoSize === 'number' && autoSize !== 1) {
		const autoSizeName: Record<number, string> = { 0: 'none', 1: 'both', 2: 'height', 3: 'shrink', 4: 'ellipsis' };
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoSize, autoSizeName[autoSize] ?? 'both');
	}
	if (object.getSingleLine()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.singleLine, 'true');
	if (object.getUbbEnabled()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.ubb, 'true');
	const leading = object.getLeading() ?? 3;
	if (leading !== 3) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.leading, String(leading));
	const letterSpacing = object.getLetterSpacing() ?? 0;
	if (letterSpacing !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.letterSpacing, String(letterSpacing));
	if (object.getUnderline()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.underline, 'true');
	if (object.getItalic()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.italic, 'true');
	if (object.getBold()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.bold, 'true');
	if (object.getStrikethrough()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.strikethrough, '1');
	const strokeColor = object.getStrokeColor();
	if (strokeColor) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeColor, formatXmlColor(strokeColor));
		const strokeSize = object.getStrokeSize() ?? 1;
		if (strokeSize !== 1) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeSize, String(strokeSize));
	}
	const shadowColor = object.getShadowColor();
	if (shadowColor) {
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowColor, formatXmlColor(shadowColor));
		writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowOffset, `${object.getShadowOffsetX() ?? 1},${object.getShadowOffsetY() ?? 1}`);
	}
}

export function writeTextInputXmlAttributes(attrs: Record<string, unknown>, object: GTextInput): void {
	const promptText = object.getPromptText();
	if (promptText) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.prompt, promptText);
	const maxLength = object.getMaxLength() ?? 0;
	if (maxLength !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.maxLength, String(maxLength));
	const restrict = object.getRestrict();
	if (restrict) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.restrict, restrict);
	if (object.getPassword()) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.password, 'true');
	const keyboardType = object.getKeyboardType() ?? 0;
	if (keyboardType !== 0) writeXmlAttr(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.keyboardType, String(keyboardType));
}
