import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import ts from 'typescript';
import { isMain, ROOT } from './repo-utils.mjs';

const CORE = 'packages/core/src/uam/transaction-contracts.ts';
const BACKEND = 'packages/backend/src/runtime.ts';
const METADATA = 'packages/mcp/src/tool-metadata.ts';
const CLI = 'packages/cli/src/contracts.ts';
const GENERATED = 'packages/backend/src/generated/contracts.ts';

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
		if (relative === GENERATED) return "import type { ContractSnapshot } from '../docs.js'; export declare const CONTRACT_SNAPSHOT: ContractSnapshot;";
		return sourceOverrides[relative] ?? read(file);
	};
	const program = ts.createProgram([CORE, BACKEND, METADATA, CLI].map((file) => path.join(root, file)), options, host);
	const diagnostics = ts.getPreEmitDiagnostics(program);
	if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
		getCanonicalFileName: (file) => file, getCurrentDirectory: () => root, getNewLine: () => '\n',
	}));
	return program;
}

/** Only the data types used by our public contracts; unsupported constructs fail closed. */
export function createSchemaEmitter(checker, root = ROOT, openObjects = false) {
	const definitions = {};
	const references = new Map();
	const labels = new Map();
	const describe = (type) => checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope).replaceAll(root.replaceAll('\\', '/'), '.');
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
		const prefix = (type.aliasSymbol?.name ?? type.symbol?.name ?? 'Shape').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64);
		const name = `${prefix}_${createHash('sha256').update(label).digest('hex').slice(0, 10)}${openObjects ? '_read' : ''}`;
		assert(!labels.has(name) || labels.get(name) === label, `Schema name collision: ${name}`);
		labels.set(name, label);
		const reference = `#/$defs/${name}`;
		references.set(type, reference);
		definitions[name] = {};
		let result;
		if (type.symbol?.name === 'Uint8Array') {
			result = { type: 'array', items: { type: 'integer', minimum: 0, maximum: 255 }, maxItems: 8 * 1024 * 1024, 'x-openfairygui-native': 'Uint8Array' };
		} else if (type.isUnion()) {
			result = { anyOf: type.types.filter((member) => !(member.flags & ts.TypeFlags.Undefined)).map(schema) };
		} else if (checker.isTupleType(type)) {
			assert(type.target.elementFlags.every((flag) => flag === ts.ElementFlags.Required), `Unsupported optional/rest tuple: ${label}`);
			const prefixItems = checker.getTypeArguments(type).map(schema);
			result = { type: 'array', prefixItems, minItems: prefixItems.length, maxItems: prefixItems.length, items: false };
			// Uniform fixed tuples need no positional schema (which some MCP clients cannot read).
			if (prefixItems.length && prefixItems.every((item) => isDeepStrictEqual(item, prefixItems[0]))) {
				delete result.prefixItems;
				result.items = prefixItems[0];
			}
		} else if (checker.isArrayType(type) || type.symbol?.name === 'ReadonlyArray') {
			result = { type: 'array', items: schema(checker.getTypeArguments(type)[0]) };
		} else if (type.flags & ts.TypeFlags.Object) {
			assert(!type.getCallSignatures().length && !type.getConstructSignatures().length, `Host function cannot cross JSON: ${label}`);
			const properties = {}; const required = [];
			for (const property of checker.getPropertiesOfType(type)) {
				assert(!property.name.startsWith('__@'), `Symbol property cannot cross JSON: ${label}`);
				const declaration = property.valueDeclaration ?? property.declarations?.[0];
				assert(declaration, `Missing property declaration: ${label}.${property.name}`);
				properties[property.name] = schema(checker.getTypeOfSymbolAtLocation(property, declaration));
				if (!(property.flags & ts.SymbolFlags.Optional)) required.push(property.name);
			}
			const index = checker.getIndexTypeOfType(type, ts.IndexKind.String);
			assert(!checker.getIndexTypeOfType(type, ts.IndexKind.Number), `Unsupported numeric object index: ${label}`);
			result = { type: 'object', properties, required, additionalProperties: index ? schema(index) : openObjects };
			// Omitted primary bytes stay forbidden even in the extensible read model.
			if (openObjects && type.aliasSymbol?.name === 'Omit' && type.aliasTypeArguments?.[1]?.value === 'sourceBytes') properties.sourceBytes = { not: {} };
		} else throw new Error(`Unsupported contract type: ${label} (flags ${type.flags})`);
		definitions[name] = result;
		return { $ref: reference };
	}
	return { schema, definitions };
}

function exported(program, file, name) {
	const checker = program.getTypeChecker();
	const source = program.getSourceFile(path.join(ROOT, file));
	assert(source, `Missing contract source: ${file}`);
	const symbol = checker.getExportsOfModule(checker.getSymbolAtLocation(source)).find((entry) => entry.name === name);
	assert(symbol, `Missing contract export: ${file}#${name}`);
	return { symbol, type: checker.getDeclaredTypeOfSymbol(symbol), declaration: symbol.valueDeclaration ?? symbol.declarations[0] };
}

function constantValue(checker, type) {
	if (type.isStringLiteral() || type.isNumberLiteral()) return type.value;
	if (type.flags & ts.TypeFlags.BooleanLiteral) return type.intrinsicName === 'true';
	if (checker.isTupleType(type)) return checker.getTypeArguments(type).map((entry) => constantValue(checker, entry));
	assert(type.flags & ts.TypeFlags.Object, `Metadata must be literal data: ${checker.typeToString(type)}`);
	return Object.fromEntries(checker.getPropertiesOfType(type).map((property) => [property.name,
		constantValue(checker, checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration ?? property.declarations[0])),
	]));
}

export function dereference(schema, definitions) {
	while (schema.$ref) {
		assert(schema.$ref.startsWith('#/$defs/'), `External schema reference: ${schema.$ref}`);
		schema = definitions[schema.$ref.slice('#/$defs/'.length)];
		assert(schema, 'Missing schema reference');
	}
	return schema;
}

/** Input-only transport limits, not a second set of transaction semantics. */
function boundInput(shape, definitions, operation = false) {
	const constrain = (object, name, constraint) => {
		if (object.properties[name]) object.properties[name] = { ...dereference(object.properties[name], definitions), ...constraint };
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
				constrain(selector, name, name === 'branch' && !selector.required.includes(name) ? { maxLength: 256 } : name === 'path' ? { minLength: 1, maxLength: 4096 } : identifier);
			}
			shape.properties.selector = selector;
		}
	} else {
		for (const name of ['sessionId', 'jobId', 'projectPath', 'canonicalProjectPath', 'canonicalPathKey', 'targetPath', 'reason']) constrain(shape, name, { minLength: 1 });
		for (const name of ['expectedRevision', 'limit']) constrain(shape, name, { type: 'integer', minimum: 0 });
		constrain(shape, 'operations', { minItems: 1, maxItems: 1000 });
		if (shape.properties.target) {
			for (const variant of dereference(shape.properties.target, definitions).anyOf ?? []) boundInput(dereference(variant, definitions), definitions, true);
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
			const pending = [schema]; const seen = new Set();
			while (pending.length) {
				const value = pending.pop();
				if (!value || typeof value !== 'object') continue;
				assert(value['x-openfairygui-native'] !== 'Uint8Array', 'Recursive native bytes require a recursive transport codec');
				if (value.$ref) {
					if (!seen.has(value.$ref)) { seen.add(value.$ref); pending.push(dereference(value, definitions)); }
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
	for (const [name, property] of Object.entries(resolved.properties ?? {})) result.push(...nativeBytePaths(property, definitions, [...prefix, name], visiting));
	if (resolved.items && typeof resolved.items === 'object') result.push(...nativeBytePaths(resolved.items, definitions, [...prefix, '*'], visiting));
	for (const [index, item] of (resolved.prefixItems ?? []).entries()) result.push(...nativeBytePaths(item, definitions, [...prefix, String(index)], visiting));
	if (resolved.additionalProperties && typeof resolved.additionalProperties === 'object') result.push(...nativeBytePaths(resolved.additionalProperties, definitions, [...prefix, '*'], visiting));
	return [...new Map(result.map((entry) => [JSON.stringify(entry), entry])).values()];
}

export function generateContract(program = createContractProgram()) {
	const checker = program.getTypeChecker();
	const emitter = createSchemaEmitter(checker);
	const operation = exported(program, CORE, 'UamTransactionOperation').type;
	assert(operation.isUnion(), 'Operations must remain a discriminated union');
	const operations = {};
	for (const member of operation.types) {
		const property = member.getProperty('kind');
		const kind = property && checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration);
		assert(kind?.isStringLiteral() && !operations[kind.value], 'Every operation needs one unique literal kind');
		operations[kind.value] = emitter.schema(member);
		boundInput(dereference(operations[kind.value], emitter.definitions), emitter.definitions, true);
	}
	const runtime = exported(program, BACKEND, 'BackendRuntime');
	const methods = runtime.declaration.members.filter((member) => ts.isMethodDeclaration(member)
		&& !member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword));
	const metadataExport = exported(program, METADATA, 'OPENFAIRYGUI_BACKEND_TOOL_METADATA');
	const metadata = constantValue(checker, checker.getTypeOfSymbolAtLocation(metadataExport.symbol, metadataExport.declaration));
	assert.deepEqual(metadata.map((entry) => entry.backendMethod), methods.map((method) => method.name.text), 'MCP mapping must cover every public Backend method exactly once, in capability order');
	assert.equal(new Set(metadata.map((entry) => entry.name)).size, methods.length, 'Duplicate MCP tool name');
	const omittedExport = exported(program, METADATA, 'MCP_OMITTED_INPUT_FIELDS');
	const omitted = constantValue(checker, checker.getTypeOfSymbolAtLocation(omittedExport.symbol, omittedExport.declaration));
	for (const name of Object.keys(omitted)) assert(methods.some((method) => method.name.text === name), `Stale MCP method omission: ${name}`);
	const unhandled = emitter.schema(exported(program, METADATA, 'McpUnhandledFailure').type);
	const responseBudgetFailure = emitter.schema(exported(program, METADATA, 'McpResponseBudgetFailure').type);
	const tools = {};
	for (const [index, method] of methods.entries()) {
		const signature = checker.getSignatureFromDeclaration(method);
		assert(signature && signature.parameters.length <= 1, `Unsupported method signature: ${method.name.text}`);
		const input = { type: 'object', properties: {}, required: [], additionalProperties: false };
		if (signature.parameters[0]) {
			const inputType = checker.getTypeOfSymbolAtLocation(signature.parameters[0], method.parameters[0]);
			// Omit host injection points before traversing their non-JSON function types.
			const fields = checker.getPropertiesOfType(inputType);
			for (const name of omitted[method.name.text] ?? []) assert(fields.some((field) => field.name === name), `Stale MCP omission: ${method.name.text}.${name}`);
			for (const field of fields) {
				if (omitted[method.name.text]?.includes(field.name)) continue;
				input.properties[field.name] = emitter.schema(checker.getTypeOfSymbolAtLocation(field, field.valueDeclaration ?? field.declarations[0]));
				if (!(field.flags & ts.SymbolFlags.Optional)) input.required.push(field.name);
			}
		}
		boundInput(input, emitter.definitions);
		const returnType = checker.getAwaitedType(checker.getReturnTypeOfSignature(signature));
		const failures = metadata[index].maxResponseBytes === undefined ? [unhandled] : [unhandled, responseBudgetFailure];
		const output = { type: 'object', properties: { backendResult: { anyOf: [emitter.schema(returnType), ...failures] } }, required: ['backendResult'], additionalProperties: false };
		tools[method.name.text] = { ...metadata[index], input, output, bytePaths: nativeBytePaths(input, emitter.definitions) };
	}
	// Reader-retained settings/extensions are valid output even when not named in a structural UAM type.
	// Only this read model gets open object schemas; shared operation inputs and other outputs stay strict.
	const modelType = exported(program, 'packages/backend/src/runtime/contracts.ts', 'BackendSessionProjectModel').type;
	const readEmitter = createSchemaEmitter(checker, ROOT, true);
	const modelReference = emitter.schema(modelType);
	const readReference = readEmitter.schema(modelType);
	Object.assign(emitter.definitions, readEmitter.definitions);
	emitter.definitions[modelReference.$ref.slice('#/$defs/'.length)] = readReference;
	const capabilitiesType = exported(program, 'packages/backend/src/runtime/contracts.ts', 'BackendCapabilities').type;
	const methodsProperty = capabilitiesType.getProperty('methods');
	assert.deepEqual(constantValue(checker, checker.getTypeOfSymbolAtLocation(methodsProperty, methodsProperty.valueDeclaration)), Object.keys(tools), 'Backend capabilities must list exactly the public methods');
	const versions = {};
	for (const name of ['BACKEND_CONTRACT_VERSION', 'BACKEND_CAPABILITY_SCHEMA_VERSION']) {
		const entry = exported(program, 'packages/backend/src/contracts.ts', name);
		versions[name] = constantValue(checker, checker.getTypeOfSymbolAtLocation(entry.symbol, entry.declaration));
	}
	const cli = {};
	const cliContracts = exported(program, CLI, 'CliOutputContracts');
	for (const command of checker.getPropertiesOfType(cliContracts.type)) {
		cli[command.name] = emitter.schema(checker.getTypeOfSymbolAtLocation(command, cliContracts.declaration));
	}
	const snapshot = { schemaVersion: 1, versions, operations, tools, cli, $defs: emitter.definitions };
	const guides = exported(program, 'packages/backend/src/diagnostics.ts', 'BACKEND_DIAGNOSTIC_GUIDES');
	snapshot.diagnostics = constantValue(checker, checker.getTypeOfSymbolAtLocation(guides.symbol, guides.declaration));
	assert.equal(new Set(snapshot.diagnostics.map((guide) => guide.code)).size, snapshot.diagnostics.length, 'Duplicate diagnostic recovery guide');
	const literals = (type) => (type.isUnion() ? type.types : [type]).map((part) => {
		assert(part.isStringLiteral(), `Diagnostic codes must be literal strings: ${checker.typeToString(part)}`);
		return part.value;
	});
	const codes = (file, name) => literals(exported(program, file, name).type);
	const formalCodes = codes('packages/backend/src/contracts.ts', 'BackendDiagnosticCode');
	assert.deepEqual(snapshot.diagnostics.map((guide) => guide.code).sort(), formalCodes.sort(), 'Recovery guides must cover every formal diagnostic code exactly once');
	const transaction = new Set([...codes(CORE, 'UamTransactionErrorCode'), ...codes(CORE, 'UamTransactionSupportIssueCode')]);
	const validation = new Set(codes('packages/core/src/validation.ts', 'ProjectDiagnosticCode'));
	const backendError = exported(program, 'packages/backend/src/runtime/contracts.ts', 'BackendError').type;
	const backend = new Set(literals(checker.getTypeOfPropertyOfType(backendError, 'code')).filter((code) => !transaction.has(code)));
	for (const guide of snapshot.diagnostics) {
		const owners = [['backend', backend], ['core.transaction', transaction], ['core.validation', validation]].filter(([, codes]) => codes.has(guide.code)).map(([owner]) => owner);
		assert.deepEqual([...guide.owners].sort(), owners.sort(), `Incorrect diagnostic owners: ${guide.code}`);
	}
	return { ...snapshot, digest: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
}

export function generatedSource(contract) {
	return `// Generated by pnpm contracts:generate. Do not edit.\nimport type { ContractSnapshot } from '../docs.js';\nexport const CONTRACT_SNAPSHOT: ContractSnapshot = ${JSON.stringify(contract, null, '\t')};\n`;
}

export function contractTables(contract, english = false) {
	const fields = (schema, omitKind = false) => {
		const object = dereference(schema, contract.$defs);
		return Object.keys(object.properties).filter((name) => !omitKind || name !== 'kind').map((name) => `\`${name}${object.required.includes(name) ? '' : '?'}\``).join(', ') || '—';
	};
	return [
		`SHA-256: \`${contract.digest}\``, '',
		english ? '| Operation | Parameters (`?` = optional) |' : '| 操作 | 参数（`?` 表示可选） |',
		'|---|---|',
		...Object.entries(contract.operations).map(([kind, schema]) => `| \`${kind}\` | ${fields(schema, true)} |`), '',
		english ? '| Backend method | MCP tool | Parameters | Read-only hint |' : '| Backend 方法 | MCP 工具 | 参数 | 只读提示 |',
		'|---|---|---|---|',
		...Object.entries(contract.tools).map(([method, tool]) => `| \`${method}\` | \`${tool.name}\` | ${fields(tool.input)} | \`${tool.annotations.readOnlyHint}\` |`),
		'', english ? '| CLI command | Installed output schema |' : '| CLI 命令 | 已安装输出 Schema |', '|---|---|',
		...Object.keys(contract.cli).map((command) => `| \`${command}\` | \`cli/${command}\` |`),
	].join('\n');
}

export function generatedFiles(contract, root = ROOT) {
	const files = { [GENERATED]: generatedSource(contract) };
	const backend = JSON.parse(readFileSync(path.join(root, 'packages/backend/package.json'), 'utf8'));
	assert(/^>=\d+$/.test(backend.engines.node), 'Update product doctor Node range handling before changing the engine format');
	const docs = {
		version: { packageName: backend.name, packageVersion: backend.version, nodeEngine: backend.engines.node },
		workflow: readFileSync(path.join(root, 'packages/backend/docs/workflow.md'), 'utf8').replaceAll('\r\n', '\n'),
		restoreLimits: readFileSync(path.join(root, 'docs/published-project-restore-limitations.md'), 'utf8').replaceAll('\r\n', '\n'),
		skill: readFileSync(path.join(root, 'packages/backend/docs/skills/openfairygui/SKILL.md'), 'utf8').replaceAll('\r\n', '\n'),
	};
	docs.version.documentationDigest = createHash('sha256').update(JSON.stringify(docs)).update(contract.digest).digest('hex');
	files['packages/backend/src/generated/docs.ts'] = `// Generated by pnpm contracts:generate. Do not edit.\nexport const INSTALLED_DOCS = ${JSON.stringify(docs, null, '\t')};\n`;
	for (const [file, english] of [['docs/guide/contracts.md', false], ['docs/en/guide/contracts.md', true]]) {
		const source = readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
		const marker = /<!-- contracts:start -->\n[\s\S]*?\n<!-- contracts:end -->/g;
		assert.equal([...source.matchAll(marker)].length, 1, `Missing/duplicate contract section: ${file}`);
		files[file] = source.replace(marker, `<!-- contracts:start -->\n${contractTables(contract, english)}\n<!-- contracts:end -->`);
	}
	for (const file of ['docs/guide/diagnostics.md', 'docs/en/guide/diagnostics.md']) {
		const source = readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
		const marker = /<!-- diagnostics:start -->\n[\s\S]*?\n<!-- diagnostics:end -->/g;
		assert.equal([...source.matchAll(marker)].length, 1, `Missing/duplicate diagnostics section: ${file}`);
		const guides = contract.diagnostics.map((guide) => [
			`### ${guide.code}`, '',
			`Owners: ${guide.owners.map((owner) => `\`${owner}\``).join(', ')} · Recovery: \`${guide.remediation.kind}\``, '',
			`URI: \`openfairygui://docs/diagnostics/${guide.code}\``, '', guide.remediation.message,
		].join('\n')).join('\n\n');
		files[file] = source.replace(marker, `<!-- diagnostics:start -->\n${guides}\n<!-- diagnostics:end -->`);
	}
	return files;
}

export function checkGeneratedFiles(files, root = ROOT) {
	for (const [file, expected] of Object.entries(files)) {
		assert(readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n') === expected, `Generated contract drift: ${file}. Run pnpm contracts:generate.`);
	}
}

if (isMain(import.meta.url)) {
	try {
		const { values } = parseArgs({ options: { check: { type: 'boolean' }, probe: { type: 'boolean' } } });
		const contract = generateContract();
		if (values.probe) {
			console.log(JSON.stringify({ operations: Object.keys(contract.operations), definitions: Object.keys(contract.$defs).length }));
		} else {
			const files = generatedFiles(contract);
			if (values.check) checkGeneratedFiles(files);
			else for (const [file, source] of Object.entries(files)) {
				const target = path.join(ROOT, file);
				mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, source);
			}
			console.log(`Contract ${values.check ? 'check' : 'generation'} passed: ${Object.keys(contract.operations).length} operations / ${Object.keys(contract.tools).length} methods`);
		}
	} catch (error) { console.error(error.message); process.exitCode = 1; }
}
