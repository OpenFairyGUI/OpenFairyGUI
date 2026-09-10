import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import { ROOT } from '../repo-utils.mjs';

export const CORE = 'packages/core/src/uam/transaction-contracts.ts';
export const BACKEND = 'packages/backend/src/runtime.ts';
export const METADATA = 'packages/mcp/src/tool-metadata.ts';
export const CLI = 'packages/cli/src/contracts.ts';
export const GENERATED = 'packages/backend/src/generated/contracts.ts';

export function createContractProgram(root = ROOT, sourceOverrides = {}) {
	const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
	if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
	const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
	const options = { ...parsed.options, types: ['node'], noEmit: true };
	const host = ts.createCompilerHost(options);
	const read = host.readFile.bind(host);
	host.readFile = (file) => {
		const relative = path.relative(root, file).replaceAll('\\', '/');
		// Canonical types must not depend on whether yesterday's generated value still typechecks.
		if (relative === GENERATED)
			return "import type { ContractSnapshot } from '../docs.js'; export declare const CONTRACT_SNAPSHOT: ContractSnapshot;";
		return sourceOverrides[relative] ?? read(file);
	};
	const program = ts.createProgram(
		[CORE, BACKEND, METADATA, CLI].map((file) => path.join(root, file)),
		options,
		host,
	);
	const diagnostics = ts.getPreEmitDiagnostics(program);
	if (diagnostics.length)
		throw new Error(
			ts.formatDiagnosticsWithColorAndContext(diagnostics, {
				getCanonicalFileName: (file) => file,
				getCurrentDirectory: () => root,
				getNewLine: () => '\n',
			}),
		);
	return program;
}

/** Only the data types used by our public contracts; unsupported constructs fail closed. */
export function createSchemaEmitter(checker, root = ROOT, openObjects = false) {
	const definitions = {};
	const references = new Map();
	const labels = new Map();
	const describe = (type) =>
		checker
			.typeToString(
				type,
				undefined,
				ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
			)
			.replaceAll(root.replaceAll('\\', '/'), '.');
	function schema(type) {
		if (type.flags & ts.TypeFlags.Unknown) return {};
		if (type.flags & (ts.TypeFlags.Never | ts.TypeFlags.Undefined)) return { not: {} };
		if (type.flags & ts.TypeFlags.StringLiteral) return { type: 'string', const: type.value };
		if (type.flags & ts.TypeFlags.NumberLiteral) return { type: 'number', const: type.value };
		if (type.flags & ts.TypeFlags.BooleanLiteral) return { type: 'boolean', const: type.intrinsicName === 'true' };
		if (type.flags & ts.TypeFlags.String) return { type: 'string' };
		if (type.flags & ts.TypeFlags.Number) return { type: 'number' };
		if (type.flags & ts.TypeFlags.Boolean) return { type: 'boolean' };
		if (type.flags & ts.TypeFlags.Null) return { type: 'null' };
		if (type.isUnion()) {
			const members = type.types.filter((member) => !(member.flags & ts.TypeFlags.Undefined));
			if (members.length === 1) return schema(members[0]);
			if (members.every((member) => member.isLiteral())) return { enum: members.map((member) => member.value) };
		}
		if (references.has(type)) return { $ref: references.get(type) };
		const label = describe(type);
		const prefix = (type.aliasSymbol?.name ?? type.symbol?.name ?? 'Shape')
			.replace(/[^a-zA-Z0-9_]/g, '')
			.slice(0, 64);
		const name = `${prefix}_${createHash('sha256').update(label).digest('hex').slice(0, 10)}${openObjects ? '_read' : ''}`;
		assert(!labels.has(name) || labels.get(name) === label, `Schema name collision: ${name}`);
		labels.set(name, label);
		const reference = `#/$defs/${name}`;
		references.set(type, reference);
		definitions[name] = {};
		let result;
		if (type.symbol?.name === 'Uint8Array') {
			result = {
				type: 'array',
				items: { type: 'integer', minimum: 0, maximum: 255 },
				maxItems: 8 * 1024 * 1024,
				'x-openfairygui-native': 'Uint8Array',
			};
		} else if (type.isUnion()) {
			result = { anyOf: type.types.filter((member) => !(member.flags & ts.TypeFlags.Undefined)).map(schema) };
		} else if (checker.isTupleType(type)) {
			assert(
				type.target.elementFlags.every((flag) => flag === ts.ElementFlags.Required),
				`Unsupported optional/rest tuple: ${label}`,
			);
			const prefixItems = checker.getTypeArguments(type).map(schema);
			result = {
				type: 'array',
				prefixItems,
				minItems: prefixItems.length,
				maxItems: prefixItems.length,
				items: false,
			};
			// Uniform fixed tuples need no positional schema (which some MCP clients cannot read).
			if (prefixItems.length && prefixItems.every((item) => isDeepStrictEqual(item, prefixItems[0]))) {
				delete result.prefixItems;
				result.items = prefixItems[0];
			}
		} else if (checker.isArrayType(type) || type.symbol?.name === 'ReadonlyArray') {
			result = { type: 'array', items: schema(checker.getTypeArguments(type)[0]) };
		} else if (type.flags & ts.TypeFlags.Object) {
			assert(
				!type.getCallSignatures().length && !type.getConstructSignatures().length,
				`Host function cannot cross JSON: ${label}`,
			);
			const properties = {};
			const required = [];
			for (const property of checker.getPropertiesOfType(type)) {
				assert(!property.name.startsWith('__@'), `Symbol property cannot cross JSON: ${label}`);
				const declaration = property.valueDeclaration ?? property.declarations?.[0];
				assert(declaration, `Missing property declaration: ${label}.${property.name}`);
				properties[property.name] = schema(checker.getTypeOfSymbolAtLocation(property, declaration));
				if (!(property.flags & ts.SymbolFlags.Optional)) required.push(property.name);
			}
			const index = checker.getIndexTypeOfType(type, ts.IndexKind.String);
			assert(
				!checker.getIndexTypeOfType(type, ts.IndexKind.Number),
				`Unsupported numeric object index: ${label}`,
			);
			result = {
				type: 'object',
				properties,
				required,
				additionalProperties: index ? schema(index) : openObjects,
			};
			// Omitted primary bytes stay forbidden even in the extensible read model.
			if (
				openObjects &&
				type.aliasSymbol?.name === 'Omit' &&
				type.aliasTypeArguments?.[1]?.value === 'sourceBytes'
			)
				properties.sourceBytes = { not: {} };
		} else throw new Error(`Unsupported contract type: ${label} (flags ${type.flags})`);
		definitions[name] = result;
		return { $ref: reference };
	}
	return { schema, definitions };
}

export function exported(program, file, name) {
	const checker = program.getTypeChecker();
	const source = program.getSourceFile(path.join(ROOT, file));
	assert(source, `Missing contract source: ${file}`);
	const symbol = checker.getExportsOfModule(checker.getSymbolAtLocation(source)).find((entry) => entry.name === name);
	assert(symbol, `Missing contract export: ${file}#${name}`);
	return {
		symbol,
		type: checker.getDeclaredTypeOfSymbol(symbol),
		declaration: symbol.valueDeclaration ?? symbol.declarations[0],
	};
}

export function constantValue(checker, type) {
	if (type.isStringLiteral() || type.isNumberLiteral()) return type.value;
	if (type.flags & ts.TypeFlags.BooleanLiteral) return type.intrinsicName === 'true';
	if (checker.isTupleType(type)) return checker.getTypeArguments(type).map((entry) => constantValue(checker, entry));
	assert(type.flags & ts.TypeFlags.Object, `Metadata must be literal data: ${checker.typeToString(type)}`);
	return Object.fromEntries(
		checker
			.getPropertiesOfType(type)
			.map((property) => [
				property.name,
				constantValue(
					checker,
					checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration ?? property.declarations[0]),
				),
			]),
	);
}

export function dereference(schema, definitions) {
	while (schema.$ref) {
		assert(schema.$ref.startsWith('#/$defs/'), `External schema reference: ${schema.$ref}`);
		schema = definitions[schema.$ref.slice('#/$defs/'.length)];
		assert(schema, 'Missing schema reference');
	}
	return schema;
}
