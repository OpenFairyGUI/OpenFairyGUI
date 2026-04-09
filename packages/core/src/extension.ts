import type { Document } from './document.js';

/**
 * Base class for FairyGUI extensions.
 *
 * Extensions add custom property types and behavior to the SDK.
 * Each extension has a unique name and can be required or optional.
 *
 * @category Extensions
 */
export abstract class Extension {
	public static EXTENSION_NAME: string;
	public abstract readonly extensionName: string;

	protected readonly _doc: Document;
	private _required = false;

	constructor(doc: Document) {
		this._doc = doc;
		doc.getRoot()._enableExtension(this);
	}

	public dispose(): void {
		this._doc.getRoot()._disableExtension(this);
	}

	public isRequired(): boolean {
		return this._required;
	}

	public setRequired(required: boolean): this {
		this._required = required;
		return this;
	}
}
