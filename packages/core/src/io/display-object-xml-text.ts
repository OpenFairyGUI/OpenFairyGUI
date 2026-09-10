import type { Document } from '../document.js';
import type { GObject } from '../properties/g-object.js';
import { parseBool, parseFloat2, parseInt2 } from '../utils/xml-utils.js';
import { PROJECT_XML_PROTOCOL, readXmlAttr } from './project-xml-protocol.js';
import type { DisplayObjectXmlNode } from './display-object-xml-shared.js';

export function createTextDisplayObject(
	doc: Document,
	tagName: 'text' | 'richtext' | 'inputtext',
	name: string,
	attrs: DisplayObjectXmlNode,
): GObject {
	switch (tagName) {
		case 'text': {
			const isInputText = parseBool(readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.input));
			const g = isInputText ? doc.createGTextInput(name) : doc.createGTextField(name);
			const textValue = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.text);
			if (textValue !== undefined) g.setText(String(textValue));
			const textFontSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.fontSize);
			if (textFontSize !== undefined) g.setFontSize(parseInt2(textFontSize));
			const textFont = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.font);
			if (textFont) g.setFont(textFont);
			const textColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.color);
			if (textColor) g.setColor(textColor);
			const textAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.align);
			if (textAlign) {
				const alignMap: Record<string, number> = { left: 0, center: 1, right: 2 };
				g.setAlign(alignMap[textAlign] ?? 0);
			}
			const textVAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.vAlign);
			if (textVAlign) {
				const vAlignMap: Record<string, number> = { top: 0, middle: 1, bottom: 2 };
				g.setVAlign(vAlignMap[textVAlign] ?? 0);
			}
			const textAutoSize = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoSize);
			if (textAutoSize) {
				const autoSizeMap: Record<string, number> = { none: 0, both: 1, height: 2, shrink: 3, ellipsis: 4 };
				g.setAutoSize(autoSizeMap[textAutoSize] ?? 1);
			}
			const textSingleLine = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.singleLine);
			if (textSingleLine !== undefined) g.setSingleLine(parseBool(textSingleLine));
			const textAutoClearText = readXmlAttr<string | boolean>(
				attrs,
				PROJECT_XML_PROTOCOL.text.attrs.autoClearText,
			);
			if (textAutoClearText !== undefined) g.setAutoClearText?.(parseBool(textAutoClearText));
			const textDemoText = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.demoText);
			if (textDemoText !== undefined) g.setDemoText?.(String(textDemoText));
			const textVars = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.vars);
			if (textVars !== undefined) g.setTemplateVarsEnabled?.(parseBool(textVars));
			const textFaceDilate = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.faceDilate);
			if (textFaceDilate !== undefined) g.setFaceDilate?.(parseFloat2(textFaceDilate));
			const textOutlineSoftness = readXmlAttr<string | number>(
				attrs,
				PROJECT_XML_PROTOCOL.text.attrs.outlineSoftness,
			);
			if (textOutlineSoftness !== undefined) g.setOutlineSoftness?.(parseFloat2(textOutlineSoftness));
			const textUnderlaySoftness = readXmlAttr<string | number>(
				attrs,
				PROJECT_XML_PROTOCOL.text.attrs.underlaySoftness,
			);
			if (textUnderlaySoftness !== undefined) g.setUnderlaySoftness?.(parseFloat2(textUnderlaySoftness));
			const textUbb = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.ubb);
			if (textUbb !== undefined) g.setUbbEnabled(parseBool(textUbb));
			const textLeading = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.leading);
			if (textLeading !== undefined) g.setLeading?.(parseInt2(textLeading));
			const textLetterSpacing = readXmlAttr<string | number>(
				attrs,
				PROJECT_XML_PROTOCOL.text.attrs.letterSpacing,
			);
			if (textLetterSpacing !== undefined) g.setLetterSpacing?.(parseInt2(textLetterSpacing));
			const textUnderline = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.underline);
			if (textUnderline !== undefined) g.setUnderline?.(parseBool(textUnderline));
			const textItalic = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.italic);
			if (textItalic !== undefined) g.setItalic?.(parseBool(textItalic));
			const textBold = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.bold);
			if (textBold !== undefined) g.setBold?.(parseBool(textBold));
			const textStrikethrough = readXmlAttr<string | boolean>(
				attrs,
				PROJECT_XML_PROTOCOL.text.attrs.strikethrough,
			);
			if (textStrikethrough !== undefined) g.setStrikethrough?.(parseBool(textStrikethrough));
			const textStrokeColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeColor);
			if (textStrokeColor) {
				g.setStrokeColor?.(textStrokeColor);
				const textStrokeSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeSize);
				g.setStrokeSize?.(parseFloat2(textStrokeSize, 1));
			}
			const textShadowColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowColor);
			if (textShadowColor) {
				g.setShadowColor?.(textShadowColor);
				const textShadowOffset = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowOffset);
				const shadowParts = String(textShadowOffset ?? '1,1').split(',');
				g.setShadowOffset?.({
					x: parseFloat2(shadowParts[0], 1),
					y: parseFloat2(shadowParts[1], 1),
				});
			}
			if (isInputText) {
				const input = g as ReturnType<Document['createGTextInput']>;
				const prompt = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.prompt);
				if (prompt !== undefined) input.setPromptText(String(prompt));
				const inputMaxLength = readXmlAttr<string | number>(
					attrs,
					PROJECT_XML_PROTOCOL.textInput.attrs.maxLength,
				);
				if (inputMaxLength !== undefined) input.setMaxLength(parseInt2(inputMaxLength));
				const inputRestrict = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.restrict);
				if (inputRestrict !== undefined) input.setRestrict(String(inputRestrict));
				const inputPassword = readXmlAttr<string | boolean>(
					attrs,
					PROJECT_XML_PROTOCOL.textInput.attrs.password,
				);
				if (inputPassword !== undefined) input.setPassword(parseBool(inputPassword));
				const inputKeyboardType = readXmlAttr<string | number>(
					attrs,
					PROJECT_XML_PROTOCOL.textInput.attrs.keyboardType,
				);
				if (inputKeyboardType !== undefined) input.setKeyboardType?.(parseInt2(inputKeyboardType));
			}
			return g;
		}
		case 'richtext': {
			const g = doc.createGRichTextField(name);
			const richText = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.text);
			if (richText !== undefined) g.setText(String(richText));
			const richTextFontSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.fontSize);
			if (richTextFontSize !== undefined) g.setFontSize(parseInt2(richTextFontSize));
			const richTextFont = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.font);
			if (richTextFont) g.setFont(richTextFont);
			const richTextColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.color);
			if (richTextColor) g.setColor(richTextColor);
			const richTextAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.align);
			if (richTextAlign) {
				const m: Record<string, number> = { left: 0, center: 1, right: 2 };
				g.setAlign(m[richTextAlign] ?? 0);
			}
			const richTextVAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.vAlign);
			if (richTextVAlign) {
				const m: Record<string, number> = { top: 0, middle: 1, bottom: 2 };
				g.setVAlign(m[richTextVAlign] ?? 0);
			}
			const richTextLeading = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.leading);
			if (richTextLeading !== undefined) g.setLeading?.(parseInt2(richTextLeading));
			const richTextLetterSpacing = readXmlAttr<string | number>(
				attrs,
				PROJECT_XML_PROTOCOL.text.attrs.letterSpacing,
			);
			if (richTextLetterSpacing !== undefined) g.setLetterSpacing?.(parseInt2(richTextLetterSpacing));
			const richTextUbb = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.ubb);
			if (richTextUbb !== undefined) g.setUbbEnabled?.(parseBool(richTextUbb));
			const richTextAutoSize = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoSize);
			if (richTextAutoSize) {
				const m: Record<string, number> = { none: 0, both: 1, height: 2, shrink: 3, ellipsis: 4 };
				g.setAutoSize(m[richTextAutoSize] ?? 1);
			}
			const richTextSingleLine = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.singleLine);
			if (richTextSingleLine !== undefined) g.setSingleLine?.(parseBool(richTextSingleLine));
			const richTextAutoClearText = readXmlAttr<string | boolean>(
				attrs,
				PROJECT_XML_PROTOCOL.text.attrs.autoClearText,
			);
			if (richTextAutoClearText !== undefined) g.setAutoClearText?.(parseBool(richTextAutoClearText));
			const richTextOutlineSoftness = readXmlAttr<string | number>(
				attrs,
				PROJECT_XML_PROTOCOL.richText.attrs.outlineSoftness,
			);
			if (richTextOutlineSoftness !== undefined) g.setOutlineSoftness?.(parseFloat2(richTextOutlineSoftness));
			const richTextUnderlaySoftness = readXmlAttr<string | number>(
				attrs,
				PROJECT_XML_PROTOCOL.richText.attrs.underlaySoftness,
			);
			if (richTextUnderlaySoftness !== undefined) g.setUnderlaySoftness?.(parseFloat2(richTextUnderlaySoftness));
			const richTextUnderline = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.underline);
			if (richTextUnderline !== undefined) g.setUnderline?.(parseBool(richTextUnderline));
			const richTextItalic = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.italic);
			if (richTextItalic !== undefined) g.setItalic?.(parseBool(richTextItalic));
			const richTextBold = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.bold);
			if (richTextBold !== undefined) g.setBold?.(parseBool(richTextBold));
			const richTextStrikethrough = readXmlAttr<string | boolean>(
				attrs,
				PROJECT_XML_PROTOCOL.text.attrs.strikethrough,
			);
			if (richTextStrikethrough !== undefined) g.setStrikethrough?.(parseBool(richTextStrikethrough));
			const richTextStrokeColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeColor);
			if (richTextStrokeColor) {
				g.setStrokeColor?.(richTextStrokeColor);
				const richTextStrokeSize = readXmlAttr<string | number>(
					attrs,
					PROJECT_XML_PROTOCOL.text.attrs.strokeSize,
				);
				g.setStrokeSize?.(parseFloat2(richTextStrokeSize, 1));
			}
			const richTextShadowColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowColor);
			if (richTextShadowColor) {
				g.setShadowColor?.(richTextShadowColor);
				const richTextShadowOffset = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowOffset);
				const shadowParts = String(richTextShadowOffset ?? '1,1').split(',');
				g.setShadowOffset?.({
					x: parseFloat2(shadowParts[0], 1),
					y: parseFloat2(shadowParts[1], 1),
				});
			}
			return g;
		}
		case 'inputtext': {
			const g = doc.createGTextInput(name);
			const inputText = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.text);
			if (inputText !== undefined) g.setText(String(inputText));
			const inputFontSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.fontSize);
			if (inputFontSize !== undefined) g.setFontSize(parseInt2(inputFontSize));
			const inputFont = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.font);
			if (inputFont) g.setFont(inputFont);
			const inputColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.color);
			if (inputColor) g.setColor(inputColor);
			const inputAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.align);
			if (inputAlign) {
				const m: Record<string, number> = { left: 0, center: 1, right: 2 };
				g.setAlign(m[inputAlign] ?? 0);
			}
			const inputVAlign = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.vAlign);
			if (inputVAlign) {
				const m: Record<string, number> = { top: 0, middle: 1, bottom: 2 };
				g.setVAlign(m[inputVAlign] ?? 0);
			}
			const inputLeading = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.leading);
			if (inputLeading !== undefined) g.setLeading?.(parseInt2(inputLeading));
			const inputLetterSpacing = readXmlAttr<string | number>(
				attrs,
				PROJECT_XML_PROTOCOL.text.attrs.letterSpacing,
			);
			if (inputLetterSpacing !== undefined) g.setLetterSpacing?.(parseInt2(inputLetterSpacing));
			const inputAutoSize = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.autoSize);
			if (inputAutoSize) {
				const m: Record<string, number> = { none: 0, both: 1, height: 2, shrink: 3, ellipsis: 4 };
				g.setAutoSize(m[inputAutoSize] ?? 1);
			}
			const inputSingleLine = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.singleLine);
			if (inputSingleLine !== undefined) g.setSingleLine?.(parseBool(inputSingleLine));
			const inputAutoClearText = readXmlAttr<string | boolean>(
				attrs,
				PROJECT_XML_PROTOCOL.text.attrs.autoClearText,
			);
			if (inputAutoClearText !== undefined) g.setAutoClearText?.(parseBool(inputAutoClearText));
			const inputDemoText = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.demoText);
			if (inputDemoText !== undefined) g.setDemoText?.(String(inputDemoText));
			const inputVars = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.vars);
			if (inputVars !== undefined) g.setTemplateVarsEnabled?.(parseBool(inputVars));
			const inputFaceDilate = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.faceDilate);
			if (inputFaceDilate !== undefined) g.setFaceDilate?.(parseFloat2(inputFaceDilate));
			const inputOutlineSoftness = readXmlAttr<string | number>(
				attrs,
				PROJECT_XML_PROTOCOL.text.attrs.outlineSoftness,
			);
			if (inputOutlineSoftness !== undefined) g.setOutlineSoftness?.(parseFloat2(inputOutlineSoftness));
			const inputUnderlaySoftness = readXmlAttr<string | number>(
				attrs,
				PROJECT_XML_PROTOCOL.text.attrs.underlaySoftness,
			);
			if (inputUnderlaySoftness !== undefined) g.setUnderlaySoftness?.(parseFloat2(inputUnderlaySoftness));
			const inputUbb = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.ubb);
			if (inputUbb !== undefined) g.setUbbEnabled?.(parseBool(inputUbb));
			const inputUnderline = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.underline);
			if (inputUnderline !== undefined) g.setUnderline?.(parseBool(inputUnderline));
			const inputItalic = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.italic);
			if (inputItalic !== undefined) g.setItalic?.(parseBool(inputItalic));
			const inputBold = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.text.attrs.bold);
			if (inputBold !== undefined) g.setBold?.(parseBool(inputBold));
			const inputStrikethrough = readXmlAttr<string | boolean>(
				attrs,
				PROJECT_XML_PROTOCOL.text.attrs.strikethrough,
			);
			if (inputStrikethrough !== undefined) g.setStrikethrough?.(parseBool(inputStrikethrough));
			const inputStrokeColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeColor);
			if (inputStrokeColor) {
				g.setStrokeColor?.(inputStrokeColor);
				const inputStrokeSize = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.text.attrs.strokeSize);
				g.setStrokeSize?.(parseFloat2(inputStrokeSize, 1));
			}
			const inputShadowColor = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowColor);
			if (inputShadowColor) {
				g.setShadowColor?.(inputShadowColor);
				const inputShadowOffset = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.text.attrs.shadowOffset);
				const shadowParts = String(inputShadowOffset ?? '1,1').split(',');
				g.setShadowOffset?.({
					x: parseFloat2(shadowParts[0], 1),
					y: parseFloat2(shadowParts[1], 1),
				});
			}
			const prompt = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.prompt);
			if (prompt !== undefined) g.setPromptText(prompt);
			const inputMaxLength = readXmlAttr<string | number>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.maxLength);
			if (inputMaxLength !== undefined) g.setMaxLength(parseInt2(inputMaxLength));
			const inputRestrict = readXmlAttr<string>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.restrict);
			if (inputRestrict !== undefined) g.setRestrict(inputRestrict);
			const inputPassword = readXmlAttr<string | boolean>(attrs, PROJECT_XML_PROTOCOL.textInput.attrs.password);
			if (inputPassword !== undefined) g.setPassword(parseBool(inputPassword));
			const inputKeyboardType = readXmlAttr<string | number>(
				attrs,
				PROJECT_XML_PROTOCOL.textInput.attrs.keyboardType,
			);
			if (inputKeyboardType !== undefined) g.setKeyboardType?.(parseInt2(inputKeyboardType));
			return g;
		}
	}
}
