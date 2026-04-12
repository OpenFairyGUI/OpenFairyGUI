import { type Nullable, PropertyType, AlignType, VertAlignType, AutoSizeType } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

export interface IGTextField extends IGObject {
	x: number;
	y: number;
	width: number;
	height: number;
	minWidth: number;
	maxWidth: number;
	minHeight: number;
	maxHeight: number;
	group: string;
	alpha: number;
	rotation: number;
	visible: boolean;
	touchable: boolean;
	grayed: boolean;
	tooltips: string;
	customData: string;
	text: string;
	font: string;
	fontSize: number;
	color: string;
	align: number;
	vAlign: number;
	leading: number;
	letterSpacing: number;
	autoSize: number;
	singleLine: boolean;
	autoClearText: boolean;
	demoText: string;
	templateVarsEnabled: boolean;
	faceDilate: number;
	underlaySoftness: number;
	ubbEnabled: boolean;
	underline: boolean;
	italic: boolean;
	bold: boolean;
	strikethrough: boolean;
	outline: boolean;
	outlineColor: string | null;
	outlineSize: number;
	shadowColor: string | null;
	shadowOffsetX: number;
	shadowOffsetY: number;
	templateVars: Record<string, string> | null;
}

interface ShadowOffsetLike {
	x: number;
	y: number;
}

/**
 * A text display object.
 * @category Properties
 */
export class GTextField<
	TProps extends IGTextField = IGTextField,
	TType extends PropertyType = PropertyType,
> extends GObject<TProps, TType> {
	public declare propertyType: TType;

	protected init(): void {
		this.propertyType = PropertyType.G_TEXT_FIELD as TType;
	}

	protected getDefaults(): Nullable<TProps> {
		return Object.assign(super.getDefaults(), {
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			minWidth: 0,
			maxWidth: 0,
			minHeight: 0,
			maxHeight: 0,
			group: '',
			alpha: 1,
			rotation: 0,
			visible: true,
			touchable: true,
			grayed: false,
			tooltips: '',
			customData: '',
			text: '',
			font: '',
			fontSize: 12,
			color: '#000000',
			align: AlignType.Left,
			vAlign: VertAlignType.Top,
			leading: 3,
			letterSpacing: 0,
			autoSize: AutoSizeType.Both,
			singleLine: false,
			autoClearText: false,
			demoText: '',
			templateVarsEnabled: false,
			faceDilate: 0,
			underlaySoftness: 0,
			ubbEnabled: false,
			underline: false,
			italic: false,
			bold: false,
			strikethrough: false,
			outline: false,
			outlineColor: null,
			outlineSize: 1,
			shadowColor: null,
			shadowOffsetX: 0,
			shadowOffsetY: 0,
			templateVars: null,
		}) as Nullable<TProps>;
	}

	protected getTextFieldProp<K extends keyof IGTextField>(key: K): IGTextField[K] {
		const self = this as unknown as GTextField<IGTextField, TType>;
		return self.get(key as never) as IGTextField[K];
	}

	protected setTextFieldProp<K extends keyof IGTextField>(key: K, value: IGTextField[K]): this {
		const self = this as unknown as GTextField<IGTextField, TType>;
		return self.set(key as never, value as never) as this;
	}

	public getText(): string { return this.getTextFieldProp('text'); }
	public setText(v: string): this { return this.setTextFieldProp('text', v); }

	public getX(): number { return this.getTextFieldProp('x'); }
	public getY(): number { return this.getTextFieldProp('y'); }
	public getWidth(): number { return this.getTextFieldProp('width'); }
	public getHeight(): number { return this.getTextFieldProp('height'); }
	public getMinWidth(): number { return this.getTextFieldProp('minWidth'); }
	public getMaxWidth(): number { return this.getTextFieldProp('maxWidth'); }
	public getMinHeight(): number { return this.getTextFieldProp('minHeight'); }
	public getMaxHeight(): number { return this.getTextFieldProp('maxHeight'); }
	public setXY(x: number, y: number): this {
		this.setTextFieldProp('x', x);
		return this.setTextFieldProp('y', y);
	}
	public setSize(w: number, h: number): this {
		this.setTextFieldProp('width', w);
		return this.setTextFieldProp('height', h);
	}
	public setMinWidth(v: number): this { return this.setTextFieldProp('minWidth', v); }
	public setMaxWidth(v: number): this { return this.setTextFieldProp('maxWidth', v); }
	public setMinHeight(v: number): this { return this.setTextFieldProp('minHeight', v); }
	public setMaxHeight(v: number): this { return this.setTextFieldProp('maxHeight', v); }
	public setX(v: number): this { return this.setTextFieldProp('x', v); }
	public setY(v: number): this { return this.setTextFieldProp('y', v); }

	public getGroup(): string { return this.getTextFieldProp('group'); }
	public setGroup(v: string): this { return this.setTextFieldProp('group', v); }

	public getAlpha(): number { return this.getTextFieldProp('alpha'); }
	public setAlpha(v: number): this { return this.setTextFieldProp('alpha', v); }

	public getRotation(): number { return this.getTextFieldProp('rotation'); }
	public setRotation(v: number): this { return this.setTextFieldProp('rotation', v); }

	public getVisible(): boolean { return this.getTextFieldProp('visible'); }
	public setVisible(v: boolean): this { return this.setTextFieldProp('visible', v); }

	public getTouchable(): boolean { return this.getTextFieldProp('touchable'); }
	public setTouchable(v: boolean): this { return this.setTextFieldProp('touchable', v); }

	public getGrayed(): boolean { return this.getTextFieldProp('grayed'); }
	public setGrayed(v: boolean): this { return this.setTextFieldProp('grayed', v); }

	public getTooltips(): string { return this.getTextFieldProp('tooltips'); }
	public setTooltips(v: string): this { return this.setTextFieldProp('tooltips', v); }

	public getCustomData(): string { return this.getTextFieldProp('customData'); }
	public setCustomData(v: string): this { return this.setTextFieldProp('customData', v); }

	public getFont(): string { return this.getTextFieldProp('font'); }
	public setFont(v: string): this { return this.setTextFieldProp('font', v); }

	public getFontSize(): number { return this.getTextFieldProp('fontSize'); }
	public setFontSize(v: number): this { return this.setTextFieldProp('fontSize', v); }

	public getColor(): string { return this.getTextFieldProp('color'); }
	public setColor(v: string): this { return this.setTextFieldProp('color', v); }

	public getAlign(): number { return this.getTextFieldProp('align'); }
	public setAlign(v: number): this { return this.setTextFieldProp('align', v); }

	public getVAlign(): number { return this.getTextFieldProp('vAlign'); }
	public setVAlign(v: number): this { return this.setTextFieldProp('vAlign', v); }

	public getLeading(): number { return this.getTextFieldProp('leading'); }
	public setLeading(v: number): this { return this.setTextFieldProp('leading', v); }

	public getLetterSpacing(): number { return this.getTextFieldProp('letterSpacing'); }
	public setLetterSpacing(v: number): this { return this.setTextFieldProp('letterSpacing', v); }

	public getAutoSize(): number { return this.getTextFieldProp('autoSize'); }
	public setAutoSize(v: number): this { return this.setTextFieldProp('autoSize', v); }

	public getSingleLine(): boolean { return this.getTextFieldProp('singleLine'); }
	public setSingleLine(v: boolean): this { return this.setTextFieldProp('singleLine', v); }

	public getAutoClearText(): boolean { return this.getTextFieldProp('autoClearText'); }
	public setAutoClearText(v: boolean): this { return this.setTextFieldProp('autoClearText', v); }

	public getDemoText(): string { return this.getTextFieldProp('demoText'); }
	public setDemoText(v: string): this { return this.setTextFieldProp('demoText', v); }

	public getTemplateVarsEnabled(): boolean { return this.getTextFieldProp('templateVarsEnabled'); }
	public setTemplateVarsEnabled(v: boolean): this { return this.setTextFieldProp('templateVarsEnabled', v); }

	public getFaceDilate(): number { return this.getTextFieldProp('faceDilate'); }
	public setFaceDilate(v: number): this { return this.setTextFieldProp('faceDilate', v); }

	public getUnderlaySoftness(): number { return this.getTextFieldProp('underlaySoftness'); }
	public setUnderlaySoftness(v: number): this { return this.setTextFieldProp('underlaySoftness', v); }

	public getUbbEnabled(): boolean { return this.getTextFieldProp('ubbEnabled'); }
	public setUbbEnabled(v: boolean): this { return this.setTextFieldProp('ubbEnabled', v); }

	public getUnderline(): boolean { return this.getTextFieldProp('underline'); }
	public setUnderline(v: boolean): this { return this.setTextFieldProp('underline', v); }

	public getItalic(): boolean { return this.getTextFieldProp('italic'); }
	public setItalic(v: boolean): this { return this.setTextFieldProp('italic', v); }

	public getBold(): boolean { return this.getTextFieldProp('bold'); }
	public setBold(v: boolean): this { return this.setTextFieldProp('bold', v); }

	public getStrikethrough(): boolean { return this.getTextFieldProp('strikethrough'); }
	public setStrikethrough(v: boolean): this { return this.setTextFieldProp('strikethrough', v); }

	public getStrokeColor(): string | null { return this.getTextFieldProp('outlineColor'); }
	public setStrokeColor(v: string | null): this { return this.setTextFieldProp('outlineColor', v); }

	public getStrokeSize(): number { return this.getTextFieldProp('outlineSize'); }
	public setStrokeSize(v: number): this { return this.setTextFieldProp('outlineSize', v); }

	public getShadowColor(): string | null { return this.getTextFieldProp('shadowColor'); }
	public setShadowColor(v: string | null): this { return this.setTextFieldProp('shadowColor', v); }

	public getShadowOffsetX(): number { return this.getTextFieldProp('shadowOffsetX'); }
	public setShadowOffsetX(v: number): this { return this.setTextFieldProp('shadowOffsetX', v); }

	public getShadowOffsetY(): number { return this.getTextFieldProp('shadowOffsetY'); }
	public setShadowOffsetY(v: number): this { return this.setTextFieldProp('shadowOffsetY', v); }

	public getShadowOffset(): ShadowOffsetLike {
		return {
			x: this.getShadowOffsetX(),
			y: this.getShadowOffsetY(),
		};
	}
	public setShadowOffset(v: ShadowOffsetLike): this {
		this.setShadowOffsetX(v.x ?? 0);
		return this.setShadowOffsetY(v.y ?? 0);
	}
}
