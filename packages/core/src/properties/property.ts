import {
	$attributes,
	$immutableKeys,
	type Graph,
	GraphEdge,
	GraphNode,
	type Literal,
	type LiteralKeys,
	type Ref,
	RefList,
	RefMap,
	RefSet,
} from 'property-graph';
import type { Nullable } from '../constants.js';

export type PropertyResolver<T extends Property> = (p: T) => T;
export const COPY_IDENTITY = <T extends Property>(t: T): T => t;

export interface IProperty {
	name: string;
	extras: Record<string, unknown>;
}

type NullableStringArrayKeys<T> = { [K in keyof T]-?: T[K] extends Array<string | null> ? K : never }[keyof T];
type UnknownRef = GraphEdge<Property, Property> | RefList<Property> | RefSet<Property> | RefMap<Property>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof GraphEdge)
		&& !(value instanceof RefList) && !(value instanceof RefSet) && !(value instanceof RefMap)
		&& !ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer);
}

function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value) || ArrayBuffer.isView(value);
}

function equalsRef(a: Ref<Property> | null, b: Ref<Property> | null): boolean {
	if (a && b) return a.getChild().equals(b.getChild());
	return a === b;
}

function equalsRefSet(a: RefSet<Property> | RefList<Property> | null, b: RefSet<Property> | RefList<Property> | null): boolean {
	if (!a || !b) return a === b;
	const aValues = [...a.values()];
	const bValues = [...b.values()];
	if (aValues.length !== bValues.length) return false;
	for (let i = 0; i < aValues.length; i++) {
		if (!aValues[i].getChild().equals(bValues[i].getChild())) return false;
	}
	return true;
}

function equalsRefMap(a: RefMap<Property> | null, b: RefMap<Property> | null): boolean {
	if (!a || !b) return a === b;
	const aKeys = [...a.keys()];
	const bKeys = [...b.keys()];
	if (aKeys.length !== bKeys.length) return false;
	for (const key of aKeys) {
		const aRef = a.get(key);
		const bRef = b.get(key);
		if (!aRef || !bRef) return false;
		if (!aRef.getChild().equals(bRef.getChild())) return false;
	}
	return true;
}

function equalsObject(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function equalsArray(a: unknown[], b: unknown[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

const EMPTY_SET = new Set<string>();

/**
 * Properties represent distinct resources in a FairyGUI asset, referenced by other properties.
 *
 * All properties are created with factory methods on the {@link Document} in which they
 * should be constructed. Properties are destroyed by calling {@link Property.dispose}().
 *
 * @category Properties
 */
export abstract class Property<T extends IProperty = IProperty> extends GraphNode<T> {
	public abstract readonly propertyType: string;

	protected declare readonly graph: Graph<Property>;

	/** @hidden */
	constructor(graph: Graph<Property>, name = '') {
		super(graph);
		(this as Property)[$attributes]['name'] = name;
		this.init();
		this.dispatchEvent({ type: 'create' });
	}

	/** @hidden */
	protected abstract init(): void;

	protected getDefaults(): Nullable<T> {
		return Object.assign(super.getDefaults(), { name: '', extras: {} });
	}

	/** @hidden */
	protected set<K extends LiteralKeys<T>>(attribute: K, value: T[K]): this {
		if (Array.isArray(value)) value = value.slice() as T[K];
		return super.set(attribute, value);
	}

	/** @hidden */
	protected getExtendedLiteral<K extends NullableStringArrayKeys<T>>(attribute: K): T[K] {
		return super.get(attribute as unknown as LiteralKeys<T>) as unknown as T[K];
	}

	/** @hidden */
	protected setExtendedLiteral<K extends NullableStringArrayKeys<T>>(attribute: K, value: T[K]): this {
		return super.set(
			attribute as unknown as LiteralKeys<T>,
			(value as Array<string | null>).slice() as unknown as T[LiteralKeys<T>],
		);
	}

	public getName(): string {
		return (this as Property).get('name');
	}

	public setName(name: string): this {
		return (this as Property).set('name', name) as this;
	}

	public getExtras(): Record<string, unknown> {
		return (this as Property).get('extras');
	}

	public setExtras(extras: Record<string, unknown>): this {
		return (this as Property).set('extras', extras) as this;
	}

	public clone(): this {
		const PropertyClass = this.constructor as new (g: Graph<Property>) => this;
		return new PropertyClass(this.graph).copy(this, COPY_IDENTITY);
	}

	public copy(other: this, resolve: PropertyResolver<Property> = COPY_IDENTITY): this {
		for (const key in this[$attributes]) {
			const value = this[$attributes][key] as UnknownRef | Literal;
			if (value instanceof GraphEdge) {
				if (!this[$immutableKeys].has(key)) {
					value.dispose();
				}
			} else if (value instanceof RefList || value instanceof RefSet) {
				for (const ref of value.values()) {
					ref.dispose();
				}
			} else if (value instanceof RefMap) {
				for (const ref of value.values()) {
					ref.dispose();
				}
			}
		}

		for (const key in other[$attributes]) {
			const thisValue = this[$attributes][key];
			const otherValue = other[$attributes][key];
			if (otherValue instanceof GraphEdge) {
				if (this[$immutableKeys].has(key)) {
					const ref = thisValue as unknown as Ref<Property>;
					ref.getChild().copy(resolve(otherValue.getChild()), resolve);
				} else {
					this.setRef(key as any, resolve(otherValue.getChild()), otherValue.getAttributes());
				}
			} else if (otherValue instanceof RefSet || otherValue instanceof RefList) {
				for (const ref of otherValue.values()) {
					this.addRef(key as any, resolve(ref.getChild()) as any, ref.getAttributes());
				}
			} else if (otherValue instanceof RefMap) {
				for (const subkey of otherValue.keys()) {
					const ref = otherValue.get(subkey)!;
					this.setRefMap(key as any, subkey, resolve(ref.getChild()) as any, ref.getAttributes());
				}
			} else if (isPlainObject(otherValue)) {
				this[$attributes][key] = JSON.parse(JSON.stringify(otherValue));
			} else if (
				Array.isArray(otherValue)
				|| otherValue instanceof ArrayBuffer
				|| ArrayBuffer.isView(otherValue)
			) {
				this[$attributes][key] = (otherValue as unknown as Uint8Array).slice() as any;
			} else {
				this[$attributes][key] = otherValue;
			}
		}

		return this;
	}

	public equals(other: this, skip: Set<string> = EMPTY_SET): boolean {
		if (this === other) return true;
		if (this.propertyType !== other.propertyType) return false;

		for (const key in this[$attributes]) {
			if (skip.has(key)) continue;

			const a = this[$attributes][key] as UnknownRef | Literal;
			const b = other[$attributes][key] as UnknownRef | Literal;

			if (a instanceof GraphEdge || b instanceof GraphEdge) {
				if (!equalsRef(a as Ref<Property>, b as Ref<Property>)) return false;
			} else if (a instanceof RefSet || b instanceof RefSet || a instanceof RefList || b instanceof RefList) {
				if (!equalsRefSet(a as RefSet<Property>, b as RefSet<Property>)) return false;
			} else if (a instanceof RefMap || b instanceof RefMap) {
				if (!equalsRefMap(a as RefMap<Property>, b as RefMap<Property>)) return false;
			} else if (isPlainObject(a) || isPlainObject(b)) {
				if (!equalsObject(a, b)) return false;
			} else if (isArray(a) || isArray(b)) {
				if (!equalsArray(a as unknown as [], b as unknown as [])) return false;
			} else {
				if (a !== b) return false;
			}
		}

		return true;
	}

	public detach(): this {
		this.graph.disconnectParents(this, (n: Property) => n.propertyType !== 'Root');
		return this;
	}

	public listParents(): Property[] {
		return this.graph.listParents(this);
	}
}
