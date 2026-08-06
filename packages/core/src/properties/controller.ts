import { RefList } from 'property-graph';
import { type Nullable, PropertyType } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { ControllerPage } from './controller-page.js';
import type { ControllerAction } from './controller-action.js';

export type ControllerHomePageType = 'default' | 'specific' | 'branch' | 'variable';

interface IController extends IExtensibleProperty {
	selectedIndex: number;
	autoRadioGroupDepth: boolean;
	alias: string;
	exported: boolean;
	homePageType: ControllerHomePageType;
	homePage: string;
	pages: RefList<ControllerPage>;
	actions: RefList<ControllerAction>;
}

/**
 * A controller manages component state through named pages.
 *
 * Controllers are the state-machine mechanism in FairyGUI. Display objects
 * bind their properties to controllers via Gears, allowing different visual
 * states per controller page.
 *
 * @category Properties
 */
export class Controller extends ExtensibleProperty<IController> {
	public declare propertyType: PropertyType.CONTROLLER;

	protected init(): void {
		this.propertyType = PropertyType.CONTROLLER;
	}

	protected getDefaults(): Nullable<IController> {
		return Object.assign(super.getDefaults(), {
			selectedIndex: 0,
			autoRadioGroupDepth: false,
			alias: '',
			exported: false,
			homePageType: 'default',
			homePage: '',
			pages: new RefList<ControllerPage>(),
			actions: new RefList<ControllerAction>(),
		});
	}

	public getSelectedIndex(): number { return this.get('selectedIndex'); }
	public setSelectedIndex(v: number): this { return this.set('selectedIndex', v); }

	public getAutoRadioGroupDepth(): boolean { return this.get('autoRadioGroupDepth'); }
	public setAutoRadioGroupDepth(v: boolean): this { return this.set('autoRadioGroupDepth', v); }

	public getAlias(): string { return this.get('alias'); }
	public setAlias(v: string): this { return this.set('alias', v); }

	public getExported(): boolean { return this.get('exported'); }
	public setExported(v: boolean): this { return this.set('exported', v); }

	public getHomePageType(): ControllerHomePageType { return this.get('homePageType'); }
	public setHomePageType(v: ControllerHomePageType): this { return this.set('homePageType', v); }

	public getHomePage(): string { return this.get('homePage'); }
	public setHomePage(v: string): this { return this.set('homePage', v); }

	public addPage(page: ControllerPage): this { return this.addRef('pages', page); }
	public removePage(page: ControllerPage): this { return this.removeRef('pages', page); }
	public listPages(): ControllerPage[] { return this.listRefs('pages'); }

	public getPage(name: string): ControllerPage | null {
		return this.listPages().find((p) => p.getName() === name) || null;
	}

	public addAction(action: ControllerAction): this { return this.addRef('actions', action); }
	public removeAction(action: ControllerAction): this { return this.removeRef('actions', action); }
	public listActions(): ControllerAction[] { return this.listRefs('actions'); }
}
