import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import ts from 'typescript';
import { isMain, ROOT } from './repo-utils.mjs';
import { CORE, BACKEND, METADATA, CLI, createContractProgram, createSchemaEmitter, exported, constantValue, dereference } from './contracts/schema.mjs';
import { boundInput, nativeBytePaths } from './contracts/transport.mjs';
import { checkGeneratedFiles, generatedFiles } from './contracts/output.mjs';

export { createContractProgram, createSchemaEmitter, dereference } from './contracts/schema.mjs';
export { nativeBytePaths } from './contracts/transport.mjs';
export { generatedSource, contractTables, generatedFiles, checkGeneratedFiles } from './contracts/output.mjs';

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
