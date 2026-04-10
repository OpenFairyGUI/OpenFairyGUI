import { type Nullable, PropertyType, ControllerActionType } from '../constants.js';
import { type IProperty, Property } from './property.js';

interface IControllerAction extends IProperty {
	actionType: number;
	fromPage: string[];
	toPage: string[];
	transitionName: string;
	playTimes: number;
	delay: number;
	stopOnExit: boolean;
	objectId: string;
	controllerName: string;
	targetPage: string;
}

/**
 * An action triggered by a controller page change.
 * @category Properties
 */
export class ControllerAction extends Property<IControllerAction> {
	public declare propertyType: PropertyType.CONTROLLER_ACTION;

	protected init(): void {
		this.propertyType = PropertyType.CONTROLLER_ACTION;
	}

	protected getDefaults(): Nullable<IControllerAction> {
		return Object.assign(super.getDefaults(), {
			actionType: ControllerActionType.PlayTransition,
			fromPage: [],
			toPage: [],
			transitionName: '',
			playTimes: 1,
			delay: 0,
			stopOnExit: false,
			objectId: '',
			controllerName: '',
			targetPage: '',
		});
	}

	public getActionType(): number { return this.get('actionType'); }
	public setActionType(v: number): this { return this.set('actionType', v); }

	public getFromPage(): string[] { return this.get('fromPage'); }
	public setFromPage(v: string[]): this { return this.set('fromPage', v); }

	public getToPage(): string[] { return this.get('toPage'); }
	public setToPage(v: string[]): this { return this.set('toPage', v); }

	public getTransitionName(): string { return this.get('transitionName'); }
	public setTransitionName(v: string): this { return this.set('transitionName', v); }

	public getPlayTimes(): number { return this.get('playTimes'); }
	public setPlayTimes(v: number): this { return this.set('playTimes', v); }

	public getDelay(): number { return this.get('delay'); }
	public setDelay(v: number): this { return this.set('delay', v); }

	public getStopOnExit(): boolean { return this.get('stopOnExit'); }
	public setStopOnExit(v: boolean): this { return this.set('stopOnExit', v); }

	public getObjectId(): string { return this.get('objectId'); }
	public setObjectId(v: string): this { return this.set('objectId', v); }

	public getControllerName(): string { return this.get('controllerName'); }
	public setControllerName(v: string): this { return this.set('controllerName', v); }

	public getTargetPage(): string { return this.get('targetPage'); }
	public setTargetPage(v: string): this { return this.set('targetPage', v); }
}
