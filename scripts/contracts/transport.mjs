import assert from 'node:assert/strict';
import { dereference } from './schema.mjs';

/** Input-only transport limits, not a second set of transaction semantics. */
export function boundInput(shape, definitions, operation = false) {
	const constrain = (object, name, constraint) => {
		if (object.properties[name])
			object.properties[name] = { ...dereference(object.properties[name], definitions), ...constraint };
	};
	const identifier = { minLength: 1, maxLength: 256 };
	if (operation) {
		for (const name of ['opId', 'newName', 'toPackageId']) constrain(shape, name, identifier);
		constrain(shape, 'branch', shape.required.includes('branch') ? identifier : { maxLength: 256 });
		for (const name of ['path', 'toPath']) constrain(shape, name, { maxLength: 4096 });
		constrain(shape, 'atlas', { maxLength: 32 });
		for (const name of ['atIndex', 'toIndex']) constrain(shape, name, { type: 'integer', minimum: 0 });
		if (shape.properties.selector) {
			const selector = structuredClone(dereference(shape.properties.selector, definitions));
			for (const name of Object.keys(selector.properties)) {
				constrain(
					selector,
					name,
					name === 'branch' && !selector.required.includes(name)
						? { maxLength: 256 }
						: name === 'path'
							? { minLength: 1, maxLength: 4096 }
							: identifier,
				);
			}
			shape.properties.selector = selector;
		}
	} else {
		for (const name of [
			'sessionId',
			'projectPath',
			'canonicalProjectPath',
			'canonicalPathKey',
			'targetPath',
			'reason',
		])
			constrain(shape, name, { minLength: 1 });
		for (const name of ['expectedRevision', 'limit']) constrain(shape, name, { type: 'integer', minimum: 0 });
		constrain(shape, 'operations', { minItems: 1, maxItems: 1000 });
		if (shape.properties.target) {
			for (const variant of dereference(shape.properties.target, definitions).anyOf ?? [])
				boundInput(dereference(variant, definitions), definitions, true);
		}
		if (shape.properties.project) {
			const project = dereference(shape.properties.project, definitions);
			constrain(project, 'projectId', identifier);
			constrain(project, 'projectType', { type: 'integer' });
			constrain(project, 'version', { maxLength: 256 });
			constrain(project, 'branches', { maxItems: 256, items: { type: 'string', maxLength: 256 } });
			constrain(project, 'packages', { maxItems: 1000 });
			const pkg = dereference(project.properties.packages.items, definitions);
			for (const name of ['id', 'name']) constrain(pkg, name, identifier);
			constrain(pkg, 'branchNames', { maxItems: 256, items: { type: 'string', maxLength: 256 } });
			constrain(pkg, 'folders', { maxItems: 10_000 });
			constrain(pkg, 'resources', { maxItems: 100_000 });
		}
	}
}

export function nativeBytePaths(schema, definitions, prefix = [], visiting = new Set()) {
	if (schema.$ref) {
		if (visiting.has(schema.$ref)) {
			// Only byte-free recursion (the JSON value type) can use a finite path codec.
			const pending = [schema];
			const seen = new Set();
			while (pending.length) {
				const value = pending.pop();
				if (!value || typeof value !== 'object') continue;
				assert(
					value['x-openfairygui-native'] !== 'Uint8Array',
					'Recursive native bytes require a recursive transport codec',
				);
				if (value.$ref) {
					if (!seen.has(value.$ref)) {
						seen.add(value.$ref);
						pending.push(dereference(value, definitions));
					}
				} else pending.push(...Object.values(value));
			}
			return [];
		}
		visiting = new Set([...visiting, schema.$ref]);
	}
	const resolved = dereference(schema, definitions);
	if (resolved['x-openfairygui-native'] === 'Uint8Array') return [prefix];
	const result = [];
	for (const variant of resolved.anyOf ?? []) result.push(...nativeBytePaths(variant, definitions, prefix, visiting));
	for (const [name, property] of Object.entries(resolved.properties ?? {}))
		result.push(...nativeBytePaths(property, definitions, [...prefix, name], visiting));
	if (resolved.items && typeof resolved.items === 'object')
		result.push(...nativeBytePaths(resolved.items, definitions, [...prefix, '*'], visiting));
	for (const [index, item] of (resolved.prefixItems ?? []).entries())
		result.push(...nativeBytePaths(item, definitions, [...prefix, String(index)], visiting));
	if (resolved.additionalProperties && typeof resolved.additionalProperties === 'object')
		result.push(...nativeBytePaths(resolved.additionalProperties, definitions, [...prefix, '*'], visiting));
	return [...new Map(result.map((entry) => [JSON.stringify(entry), entry])).values()];
}
