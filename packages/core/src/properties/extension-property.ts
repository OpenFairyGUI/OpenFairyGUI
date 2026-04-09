import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';

/**
 * Base class for extension-defined properties that attach to core properties.
 * @category Properties
 */
export abstract class ExtensionProperty<T extends IExtensibleProperty = IExtensibleProperty> extends ExtensibleProperty<T> {
	public static EXTENSION_NAME: string;
	public abstract readonly extensionName: string;

	/** @hidden */
	public _validateParent(_parent: ExtensibleProperty): void {
		// Override in subclasses to enforce parent type constraints.
	}
}
