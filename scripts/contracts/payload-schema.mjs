import assert from 'node:assert/strict';
import { dereference } from './schema.mjs';

// MCP transport limits stay at the transport; Core checks the structure of the canonical types.
const TRANSPORT_KEYWORDS = new Set(['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems']);
const ENVELOPE_FIELDS = new Set(['kind', 'opId', 'selector']);

/** Operation fields that carry structured snapshots; scalars and selectors belong to Core's envelope table. */
export function payloadFields(contract) {
	const structured = (schema) => {
		const resolved = dereference(schema, contract.$defs);
		return resolved.type === 'object' || Boolean(resolved.anyOf?.some(structured));
	};
	const fields = [];
	for (const [kind, operation] of Object.entries(contract.operations)) {
		for (const [name, field] of Object.entries(dereference(operation, contract.$defs).properties)) {
			if (!ENVELOPE_FIELDS.has(name) && structured(field)) fields.push([kind, name, field]);
		}
	}
	return fields;
}

/** Compact node table for Core preflight, generated from the same canonical schema MCP validates with. */
export function corePayloadSchema(contract) {
	const nodes = [];
	const inline = new Map();
	const definitions = new Map();
	const add = (node) => {
		const key = JSON.stringify(node);
		if (!inline.has(key)) inline.set(key, nodes.push(node) - 1);
		return inline.get(key);
	};
	const literals = (schema) => (schema.const !== undefined ? [schema.const] : schema.enum);
	function encode(schema) {
		if (schema.$ref) {
			const name = schema.$ref.slice('#/$defs/'.length);
			if (!definitions.has(name)) {
				// Reserve the slot first: recursive definitions (JSON values) refer back to themselves.
				definitions.set(name, nodes.push(null) - 1);
				nodes[definitions.get(name)] = build(dereference(schema, contract.$defs), name);
			}
			return definitions.get(name);
		}
		return add(build(schema, 'inline schema'));
	}
	function build(schema, label) {
		const unsupported = Object.keys(schema).filter((key) => !TRANSPORT_KEYWORDS.has(key) && ![
			'type', 'const', 'enum', 'items', 'properties', 'required', 'additionalProperties', 'anyOf', 'x-openfairygui-native',
		].includes(key));
		assert.deepEqual(unsupported, [], `Unsupported payload schema construct in ${label}`);
		if (Object.keys(schema).length === 0) return ['any'];
		if (schema['x-openfairygui-native'] === 'Uint8Array') return ['bytes'];
		if (schema.const !== undefined || schema.enum) return ['literal', literals(schema)];
		if (schema.anyOf) return union(schema.anyOf, label);
		switch (schema.type) {
			case 'string':
			case 'number':
			case 'boolean':
			case 'null':
				return [schema.type];
			case 'array': {
				assert(schema.items && typeof schema.items === 'object', `Unsupported positional tuple in ${label}`);
				const item = encode(schema.items);
				// Equal bounds come from fixed-length tuples; a lone maxItems is a transport limit.
				return schema.minItems !== undefined && schema.minItems === schema.maxItems ? ['array', item, schema.minItems] : ['array', item];
			}
			case 'object': {
				assert(schema.additionalProperties !== true, `Open object in operation input: ${label}`);
				const properties = Object.fromEntries(Object.entries(schema.properties).map(([name, field]) => [name, encode(field)]));
				const index = schema.additionalProperties ? encode(schema.additionalProperties) : null;
				return ['object', properties, schema.required, index];
			}
		}
		throw new Error(`Unsupported payload schema type in ${label}: ${schema.type}`);
	}
	function union(anyOf, label) {
		// Nested unions are flattened so a discriminator sees every object member.
		const members = [];
		const expand = (member) => {
			const resolved = dereference(member, contract.$defs);
			if (resolved.anyOf) resolved.anyOf.forEach(expand);
			else members.push(member);
		};
		anyOf.forEach(expand);
		const values = [];
		const encoded = [];
		for (const member of members) {
			const resolved = dereference(member, contract.$defs);
			if (resolved.const !== undefined || resolved.enum) values.push(...literals(resolved));
			else encoded.push(encode(member));
		}
		if (values.length) {
			const unique = [...new Set(values)];
			const literal = unique.length === 2 && unique.includes(true) && unique.includes(false) ? ['boolean'] : ['literal', unique];
			if (!encoded.length) return literal;
			encoded.push(add(literal));
		}
		if (encoded.length === 1) {
			assert(nodes[encoded[0]], `Self-referencing union in ${label}`);
			return nodes[encoded[0]];
		}
		const objects = members.map((member) => dereference(member, contract.$defs)).filter((member) => member.type === 'object');
		let discriminator = null;
		if (objects.length > 1) {
			discriminator = Object.keys(objects[0].properties).find((name) => objects.every((member) => member.required.includes(name)
				&& member.properties[name] && literals(dereference(member.properties[name], contract.$defs))));
			if (discriminator) {
				const values = objects.flatMap((member) => literals(dereference(member.properties[discriminator], contract.$defs)));
				assert.equal(new Set(values).size, values.length, `Ambiguous union discriminator in ${label}: ${discriminator}`);
			}
		}
		return ['union', encoded, discriminator ?? null];
	}
	const roots = {};
	for (const [kind, name, field] of payloadFields(contract)) (roots[kind] ??= {})[name] = encode(field);
	return { roots, nodes };
}

export function corePayloadSchemaSource(contract) {
	const { roots, nodes } = corePayloadSchema(contract);
	return [
		'// Generated by pnpm contracts:generate. Do not edit.',
		"import type { OperationPayloadSchema } from '../preflight/payload-schema.js';",
		'',
		'/** Snapshot payload structure from the canonical operation contract, without MCP transport limits. */',
		'export const OPERATION_PAYLOAD_SCHEMA: OperationPayloadSchema = {',
		`\troots: ${JSON.stringify(roots)},`,
		'\tnodes: [',
		...nodes.map((node) => `\t\t${JSON.stringify(node)},`),
		'\t],',
		'};',
		'',
	].join('\n');
}
