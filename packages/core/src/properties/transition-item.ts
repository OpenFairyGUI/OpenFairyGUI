import { type Nullable, PropertyType, TransitionActionType, EaseType } from '../constants.js';
import { type IProperty, Property } from './property.js';

interface ITransitionItem extends IProperty {
	time: number;
	targetId: string;
	actionType: number;
	tween: boolean;
	duration: number;
	startValue: unknown[];
	endValue: unknown[];
	easeType: number;
	repeat: number;
	yoyo: boolean;
	label: string;
	label2: string;
	path: string;
	customEasePath: string;
	hook: string;
	hook2: string;
}

/**
 * A single keyframe item within a Transition timeline.
 * @category Properties
 */
export class TransitionItem extends Property<ITransitionItem> {
	public declare propertyType: PropertyType.TRANSITION_ITEM;

	protected init(): void {
		this.propertyType = PropertyType.TRANSITION_ITEM;
	}

	protected getDefaults(): Nullable<ITransitionItem> {
		return Object.assign(super.getDefaults(), {
			time: 0,
			targetId: '',
			actionType: TransitionActionType.XY,
			tween: false,
			duration: 0,
			startValue: [],
			endValue: [],
			easeType: EaseType.QuadOut,
			repeat: 0,
			yoyo: false,
			label: '',
			label2: '',
			path: '',
			customEasePath: '',
			hook: '',
			hook2: '',
		});
	}

	public getTime(): number { return this.get('time'); }
	public setTime(v: number): this { return this.set('time', v); }

	public getTargetId(): string { return this.get('targetId'); }
	public setTargetId(v: string): this { return this.set('targetId', v); }

	public getActionType(): number { return this.get('actionType'); }
	public setActionType(v: number): this { return this.set('actionType', v); }

	public getTween(): boolean { return this.get('tween'); }
	public setTween(v: boolean): this { return this.set('tween', v); }

	public getDuration(): number { return this.get('duration'); }
	public setDuration(v: number): this { return this.set('duration', v); }

	public getStartValue(): unknown[] { return this.get('startValue' as never) as unknown[]; }
	public setStartValue(v: unknown[]): this { return this.set('startValue' as never, v as never); }

	public getEndValue(): unknown[] { return this.get('endValue' as never) as unknown[]; }
	public setEndValue(v: unknown[]): this { return this.set('endValue' as never, v as never); }

	public getEaseType(): number { return this.get('easeType'); }
	public setEaseType(v: number): this { return this.set('easeType', v); }

	public getRepeat(): number { return this.get('repeat'); }
	public setRepeat(v: number): this { return this.set('repeat', v); }

	public getYoyo(): boolean { return this.get('yoyo'); }
	public setYoyo(v: boolean): this { return this.set('yoyo', v); }

	public getLabel(): string { return this.get('label'); }
	public setLabel(v: string): this { return this.set('label', v); }

	public getEndLabel(): string { return this.get('label2'); }
	public setEndLabel(v: string): this { return this.set('label2', v); }

	public getPath(): string { return this.get('path'); }
	public setPath(v: string): this { return this.set('path', v); }

	public getCustomEasePath(): string { return this.get('customEasePath'); }
	public setCustomEasePath(v: string): this { return this.set('customEasePath', v); }
}
