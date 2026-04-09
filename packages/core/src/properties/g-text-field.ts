import { type Nullable, PropertyType, AlignType, VertAlignType, AutoSizeType } from '../constants.js';
import { GObject, type IGObject } from './g-object.js';

export interface IGTextField extends IGObject {
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
