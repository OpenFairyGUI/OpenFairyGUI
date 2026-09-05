import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { tsImport } from 'tsx/esm/api';
import { checkGeneratedFiles, contractTables, createContractProgram, generateContract, generatedFiles, nativeBytePaths } from './generate-contracts.mjs';
import { ROOT } from './repo-utils.mjs';

const { z } = createRequire(new URL('../packages/mcp/package.json', import.meta.url))('zod');
const contract = generateContract();

test('CLI schemas cover every registered command and reject malformed envelopes; new diagnostic codes fail closed', async () => {
	const { createProgram } = await tsImport('../packages/cli/src/cli.ts', import.meta.url);
	const paths = ['ofgui'];
	function visit(command, prefix = '') {
		for (const child of command.commands) {
			const name = `${prefix}${child.name()}`;
			paths.push(name); visit(child, `${name} `);
		}
	}
	visit(createProgram());
	assert.deepEqual(Object.keys(contract.cli).sort(), paths.sort());
	for (const [command, output] of Object.entries(contract.cli)) {
		assert(z.fromJSONSchema({ ...output, $defs: contract.$defs }).safeParse({
			schemaVersion: 1, command, success: false, error: { code: 'invalid_arguments', message: 'Invalid arguments' },
		}).success, `CLI failure schema: ${command}`);
	}
	const schema = z.fromJSONSchema({ ...contract.cli.validate, $defs: contract.$defs });
	const report = { schemaVersion: 1, command: 'validate', success: true, result: { status: 'valid', complete: true, diagnostics: [] } };
	assert(schema.safeParse(report).success);
	assert(!schema.safeParse({ ...report, result: { status: 'ready' } }).success);
	assert(!schema.safeParse({ ...report, command: 'inspect' }).success);
	assert(!schema.safeParse({ ...report, success: false }).success);
	assert(!schema.safeParse({ ...report, result: { ...report.result, diagnostics: [{ code: 'invented', message: 'x', severity: 'error', path: '' }] } }).success);
	const file = 'packages/core/src/validation.ts';
	const before = readFileSync(path.join(ROOT, file), 'utf8');
	assert.throws(() => generateContract(createContractProgram(ROOT, { [file]: before.replace("| 'invalid_project_xml'", "| 'contract_probe' | 'invalid_project_xml'") })), /every formal diagnostic code/);
	const cli = 'packages/cli/src/contracts.ts';
	const source = readFileSync(path.join(ROOT, cli), 'utf8');
	const changed = generateContract(createContractProgram(ROOT, { [cli]: source.replace('schemaVersion: 1;', 'schemaVersion: 2;') }));
	assert.notEqual(changed.digest, contract.digest);
	assert.throws(() => checkGeneratedFiles(generatedFiles(changed)), /Generated contract drift/);
});

test('canonical types generate precise schemas for the four representative operations', async () => {
	const schema = (kind) => z.fromJSONSchema({ ...contract.operations[kind], $defs: contract.$defs });
	const { createMcpFixtureProject } = await tsImport('../packages/mcp/test/helpers.ts', import.meta.url);
	const project = createMcpFixtureProject();
	const component = project.packages[0].resources.find((resource) => resource.kind === 'component');
	const rename = { kind: 'renameResource', selector: { packageId: 'p', resourceId: 'r' }, newName: 'new' };
	assert(schema(rename.kind).safeParse(rename).success);
	assert(!schema(rename.kind).safeParse({ ...rename, selector: { packageId: 'p' } }).success);
	const update = { kind: 'setDisplayNodeProps', selector: { packageId: 'p', componentResourceId: 'c', displayNodeId: 'n' }, props: { text: 'ok', position: { x: 1, y: 2 } } };
	assert(schema(update.kind).safeParse(update).success);
	assert(!schema(update.kind).safeParse({ ...update, props: { position: { x: 'wrong', y: 2 } } }).success);
	assert(!schema(update.kind).safeParse({ ...update, props: { inventedProperty: true } }).success);
	const add = { kind: 'addComponent', selector: { packageId: 'p' }, component, atIndex: 0 };
	assert(schema(add.kind).safeParse(add).success);
	assert(!schema(add.kind).safeParse({ ...add, component: { ...component, component: { ...component.component, displayList: [{ kind: 'text', text: 'incomplete' }] } } }).success);
	const replace = { kind: 'replaceResourceBytes', selector: { packageId: 'p', resourceId: 'r' }, sourceBytes: [0, 255] };
	assert(schema(replace.kind).safeParse(replace).success);
	assert(!schema(replace.kind).safeParse({ ...replace, sourceBytes: [256] }).success);
	assert(!schema(replace.kind).safeParse({ ...replace, sourceBytes: new Uint8Array([1]) }).success);
	assert(schema('addResourceFolder').safeParse({ kind: 'addResourceFolder', selector: { packageId: 'p' }, path: '/icons/', branch: '' }).success);
	assert(schema('removeResourceFolder').safeParse({ kind: 'removeResourceFolder', selector: { packageId: 'p', path: '/icons/', branch: '' } }).success);
	assert(!schema('removeBranch').safeParse({ kind: 'removeBranch', selector: { branch: '' } }).success);
});

test('current snapshot and bilingual tables match; a canonical field change fails drift checks without editing files', () => {
	checkGeneratedFiles(generatedFiles(contract));
	assert.match(contractTables(contract), /\| `listJobs` .*`kind\?`/);
	const file = 'packages/core/src/uam/transaction-contracts.ts';
	const before = readFileSync(path.join(ROOT, file), 'utf8');
	const edited = before.replace('newName: string;', 'newName: string; contractProbe?: boolean;');
	assert.notEqual(edited, before);
	const changed = generateContract(createContractProgram(ROOT, { [file]: edited }));
	assert.notEqual(changed.digest, contract.digest);
	const files = generatedFiles(changed);
	assert.throws(() => checkGeneratedFiles(files), /Generated contract drift/);
	assert.throws(() => checkGeneratedFiles({ 'docs/guide/contracts.md': files['docs/guide/contracts.md'] }), /Generated contract drift/);
	assert.throws(() => checkGeneratedFiles({ 'docs/en/guide/contracts.md': files['docs/en/guide/contracts.md'] }), /Generated contract drift/);
	assert.equal(readFileSync(path.join(ROOT, file), 'utf8'), before);
	const backendFile = 'packages/backend/src/runtime.ts';
	const backend = readFileSync(path.join(ROOT, backendFile), 'utf8');
	const extraMethod = backend.replace('public getCapabilities()', 'public contractProbe() { return this.getCapabilities(); }\n\tpublic getCapabilities()');
	assert.notEqual(extraMethod, backend);
	assert.throws(() => generateContract(createContractProgram(ROOT, { [backendFile]: extraMethod })), /MCP mapping must cover every public Backend method/);
});

test('installed documentation is bound to the package version, source text and generated contract', async () => {
	const { getInstalledDocumentationIndex, readInstalledDocumentation, getInstalledContractSnapshot } = await tsImport('../packages/backend/src/docs.ts', import.meta.url);
	const index = getInstalledDocumentationIndex();
	const manifest = JSON.parse(readFileSync(path.join(ROOT, 'packages/backend/package.json'), 'utf8'));
	assert.equal(index.packageName, manifest.name);
	assert.equal(index.packageVersion, manifest.version);
	assert.equal(index.nodeEngine, manifest.engines.node);
	assert.equal(index.contractDigest, contract.digest);
	assert.equal(readInstalledDocumentation('workflow').text, readFileSync(path.join(ROOT, 'packages/backend/docs/workflow.md'), 'utf8').replaceAll('\r\n', '\n'));
	assert.equal(readInstalledDocumentation('restore-limits').text, readFileSync(path.join(ROOT, 'docs/published-project-restore-limitations.md'), 'utf8').replaceAll('\r\n', '\n'));
	assert.equal(new Set(index.documents.map((entry) => entry.id)).size, index.documents.length);
	assert.deepEqual(getInstalledContractSnapshot().diagnostics, contract.diagnostics);
	const copy = getInstalledContractSnapshot();
	copy.operations = {};
	assert(Object.keys(getInstalledContractSnapshot().operations).length > 0);
	const files = generatedFiles(contract);
	const docsFile = 'packages/backend/src/generated/docs.ts';
	assert.throws(() => checkGeneratedFiles({ [docsFile]: files[docsFile].replace(manifest.version, '0.0.0-drift') }), /Generated contract drift/);
});

test('generated byte paths cover declared resource snapshots and reject unsupported recursive native bytes', async () => {
	const { decodeToolBytes } = await tsImport('../packages/mcp/src/contract-schema.ts', import.meta.url);
	const resource = { kind: 'misc', sourceBytes: [0, 255], metadata: { sourceBytes: [7, 8] } };
	const input = { project: { packages: [{ resources: [resource] }] } };
	const decoded = decodeToolBytes(input, contract.tools.openProjectSession.bytePaths);
	assert(decoded.project.packages[0].resources[0].sourceBytes instanceof Uint8Array);
	assert.deepEqual(decoded.project.packages[0].resources[0].metadata.sourceBytes, [7, 8]);
	assert.deepEqual(resource.sourceBytes, [0, 255]);
	const batch = { operations: [
		{ kind: 'replaceResourceBytes', sourceBytes: [1] },
		{ kind: 'addResource', resource },
		{ kind: 'addPackage', package: { resources: [resource] } },
	] };
	const operations = decodeToolBytes(batch, contract.tools.applyTransaction.bytePaths).operations;
	assert(operations[0].sourceBytes instanceof Uint8Array);
	assert(operations[1].resource.sourceBytes instanceof Uint8Array);
	assert(operations[2].package.resources[0].sourceBytes instanceof Uint8Array);
	const byteList = { type: 'array', items: { 'x-openfairygui-native': 'Uint8Array' } };
	const byteListInput = { buffers: [[1], [2]] };
	const byteListPaths = nativeBytePaths({ type: 'object', properties: { buffers: byteList } }, {});
	assert.deepEqual(decodeToolBytes(byteListInput, byteListPaths).buffers, [new Uint8Array([1]), new Uint8Array([2])]);
	const recursive = { type: 'object', properties: { next: { $ref: '#/$defs/Node' }, bytes: { 'x-openfairygui-native': 'Uint8Array' } } };
	assert.throws(() => nativeBytePaths({ $ref: '#/$defs/Node' }, { Node: recursive }), /Recursive native bytes/);
});
