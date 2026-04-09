import { RefMap } from 'property-graph';
import type { Nullable } from '../constants.js';
import type { ExtensionProperty } from './extension-property.js';
import { type IProperty, Property } from './property.js';

export interface IExtensibleProperty extends IProperty {
	extensions: RefMap<ExtensionProperty>;
}

/**
 * A {@link Property} that can have {@link ExtensionProperty} instances attached.
 * @category Properties
 */
export abstract class ExtensibleProperty<T extends IExtensibleProperty = IExtensibleProperty> extends Property<T> {
	protected getDefaults(): Nullable<T> {
		return Object.assign(super.getDefaults(), { extensions: new RefMap<ExtensionProperty>() });
	}

	public getExtension<Prop extends ExtensionProperty>(name: string): Prop | null {
		return (this as ExtensibleProperty).getRefMap('extensions', name) as Prop;
	}

	public setExtension<Prop extends ExtensionProperty>(name: string, extensionProperty: Prop | null): this {
		return (this as ExtensibleProperty).setRefMap('extensions', name, extensionProperty) as this;
	}

	public listExtensions(): ExtensionProperty[] {
		return (this as ExtensibleProperty).listRefMapValues('extensions');
	}
}
