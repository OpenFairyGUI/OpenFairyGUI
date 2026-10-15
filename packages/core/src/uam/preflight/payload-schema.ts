import { isPlainRecord } from './values.js';

type Literal = string | number | boolean;

/**
 * One node of the generated payload table. Indexes refer to other nodes; objects list required names and an
 * optional index-signature node (null when closed); unions name their discriminator when they have one.
 */
export type OperationPayloadSchemaNode =
	| readonly ['any']
	| readonly ['string']
	| readonly ['number']
	| readonly ['boolean']
	| readonly ['null']
	| readonly ['bytes']
	| readonly ['literal', readonly Literal[]]
	| readonly ['array', number, number?]
	| readonly ['object', Readonly<Record<string, number>>, readonly string[], number | null]
	| readonly ['union', readonly number[], string | null];

export interface OperationPayloadSchema {
	/** Root node for each operation snapshot field, keyed by operation kind and field name. */
	readonly roots: Readonly<Record<string, Readonly<Record<string, number>>>>;
	readonly nodes: readonly OperationPayloadSchemaNode[];
}

export interface PayloadSchemaIssue {
	/** Path relative to the payload root, such as `.position.x` or `.displayList[0]`. */
	path: string;
	message: string;
	/** The value's discriminator matches no member of a union. */
	discriminant?: true;
	/** The field is not declared by its closed object. */
	unknownField?: true;
}

function describe(schema: OperationPayloadSchema, index: number): string {
	const node = schema.nodes[index]!;
	switch (node[0]) {
		case 'any':
			return 'any value';
		case 'string':
			return 'a string';
		case 'number':
			return 'a finite number';
		case 'boolean':
			return 'a boolean';
		case 'null':
			return 'null';
		case 'bytes':
			return 'a Uint8Array';
		case 'literal':
			return node[1].length === 1
				? JSON.stringify(node[1][0])
				: `one of ${node[1].map((value) => JSON.stringify(value)).join(', ')}`;
		case 'array':
			return node[2] === undefined ? 'an array' : `an array of ${node[2]} items`;
		case 'object':
			return 'an object';
		case 'union':
			return [...new Set(node[1].map((member) => describe(schema, member)))].join(' or ');
	}
}

/** The value has the node's own JavaScript type; containers are checked further by the validator. */
function matchesType(
	node: Exclude<OperationPayloadSchemaNode, readonly ['union', ...unknown[]]>,
	value: unknown,
): boolean {
	switch (node[0]) {
		case 'any':
			return true;
		case 'string':
		case 'boolean':
			return typeof value === node[0];
		case 'number':
			return typeof value === 'number' && Number.isFinite(value);
		case 'null':
			return value === null;
		case 'bytes':
			return value instanceof Uint8Array;
		case 'literal':
			return node[1].includes(value as Literal);
		case 'array':
			return Array.isArray(value) && (node[2] === undefined || value.length === node[2]);
		case 'object':
			return isPlainRecord(value);
	}
}

function literalOf(schema: OperationPayloadSchema, member: number, key: string): readonly Literal[] {
	const node = schema.nodes[member]!;
	if (node[0] !== 'object') return [];
	const discriminator = schema.nodes[node[1][key]!]!;
	return discriminator[0] === 'literal' ? discriminator[1] : [];
}

class PayloadValidator {
	public constructor(
		private readonly schema: OperationPayloadSchema,
		private readonly issues: PayloadSchemaIssue[],
		private readonly ancestors = new Set<object>(),
	) {}

	public check(index: number, value: unknown, path: string): void {
		const node = this.schema.nodes[index]!;
		if (node[0] === 'union') {
			this.checkUnion(index, node, value, path);
			return;
		}
		if (!matchesType(node, value)) {
			this.issues.push({ path, message: `must be ${describe(this.schema, index)}.` });
			return;
		}
		if (node[0] === 'array') {
			const items = value as unknown[];
			this.within(items, path, () => {
				// Indexed reads also visit holes, which iteration helpers would skip.
				for (let item = 0; item < items.length; item += 1) this.check(node[1], items[item], `${path}[${item}]`);
			});
		} else if (node[0] === 'object') {
			const record = value as Record<string, unknown>;
			this.within(record, path, () => this.checkObject(node, record, path));
		}
	}

	private within(value: object, path: string, visit: () => void): void {
		if (this.ancestors.has(value)) {
			this.issues.push({ path, message: 'must not contain circular references.' });
			return;
		}
		this.ancestors.add(value);
		visit();
		this.ancestors.delete(value);
	}

	private checkObject(
		node: Extract<OperationPayloadSchemaNode, readonly ['object', ...unknown[]]>,
		value: Record<string, unknown>,
		path: string,
	): void {
		const [, properties, required, index] = node;
		for (const name of required) {
			if (value[name] === undefined) {
				this.issues.push({
					path: `${path}.${name}`,
					message: `is required and must be ${describe(this.schema, properties[name]!)}.`,
				});
			}
		}
		for (const [name, field] of Object.entries(value)) {
			if (field === undefined) continue;
			if (Object.hasOwn(properties, name)) this.check(properties[name]!, field, `${path}.${name}`);
			else if (index !== null) this.check(index, field, `${path}.${name}`);
			else {
				this.issues.push({
					path: `${path}.${name}`,
					message: `is not a field of this object; accepted fields: ${Object.keys(properties).join(', ')}.`,
					unknownField: true,
				});
			}
		}
	}

	private checkUnion(
		index: number,
		node: Extract<OperationPayloadSchemaNode, readonly ['union', ...unknown[]]>,
		value: unknown,
		path: string,
	): void {
		const [, members, key] = node;
		if (key !== null && isPlainRecord(value)) {
			const member = members.find((candidate) =>
				literalOf(this.schema, candidate, key).includes(value[key] as Literal),
			);
			if (member !== undefined) {
				this.check(member, value, path);
				return;
			}
			const allowed = members.flatMap((candidate) => literalOf(this.schema, candidate, key));
			this.issues.push({
				path: `${path}.${key}`,
				message: `must be one of ${allowed.map((literal) => JSON.stringify(literal)).join(', ')}.`,
				discriminant: true,
			});
			return;
		}
		// Members whose own type cannot hold the value (null for an object, say) explain nothing.
		const candidates = members.filter((member) => {
			const candidate = this.schema.nodes[member]!;
			return candidate[0] === 'union' || matchesType(candidate, value);
		});
		if (candidates.length === 1) {
			this.check(candidates[0]!, value, path);
			return;
		}
		let closest: PayloadSchemaIssue[] | null = null;
		for (const member of candidates) {
			const attempt: PayloadSchemaIssue[] = [];
			new PayloadValidator(this.schema, attempt, this.ancestors).check(member, value, path);
			if (attempt.length === 0) return;
			if (!closest || attempt.length < closest.length) closest = attempt;
		}
		if (closest) this.issues.push(...closest);
		else this.issues.push({ path, message: `must be ${describe(this.schema, index)}.` });
	}
}

/** Checks a snapshot payload against its generated contract node; issue paths are relative to the payload. */
export function validatePayloadSchema(
	schema: OperationPayloadSchema,
	root: number,
	value: unknown,
): PayloadSchemaIssue[] {
	const issues: PayloadSchemaIssue[] = [];
	new PayloadValidator(schema, issues).check(root, value, '');
	return issues;
}
