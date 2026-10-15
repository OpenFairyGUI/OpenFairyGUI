import assert from 'node:assert/strict';
import test from 'ava';
import { createBackendRuntime, createTempBackendProject } from './helpers.js';

const controller = {
	name: 'c', selectedIndex: 0, autoRadioGroupDepth: false, alias: '', exported: false,
	homePageType: 'default', homePage: '', pages: null, actions: [],
};

const MALFORMED: Array<{ label: string; operations: unknown; diagnostics: Array<[string, string]> }> = [
	{
		label: 'misspelled required field',
		operations: [{ kind: 'renameResource', selector: { packageId: 'pkg001', resourceId: 'X' }, name: 'Panel' }],
		diagnostics: [
			['invalid_operation_payload', 'operations[0].name'],
			['invalid_operation_payload', 'operations[0].newName'],
		],
	},
	{ label: 'operations is not an array', operations: { kind: 'removeResource' }, diagnostics: [['invalid_operation_payload', 'operations']] },
	{ label: 'operation is not an object', operations: [null], diagnostics: [['invalid_operation_payload', 'operations[0]']] },
	{
		label: 'selector is null',
		operations: [{ kind: 'removeResource', selector: null }],
		diagnostics: [['invalid_operation_payload', 'operations[0].selector']],
	},
	{
		label: 'kind whose string conversion throws',
		operations: [{ kind: { toString: null, valueOf: null } }],
		diagnostics: [['unsupported_operation', 'operations[0].kind']],
	},
	{
		label: 'look gear selector with a non-look kind',
		operations: [{
			kind: 'removeLookGear',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n0', kind: 'xy', controllerName: 'state' },
		}],
		diagnostics: [['invalid_operation_payload', 'operations[0].selector.kind']],
	},
	{
		label: 'gear selector with an unknown kind',
		operations: [{
			kind: 'removeGear',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n0', kind: 'bogus', controllerName: 'state' },
		}],
		diagnostics: [['invalid_operation_payload', 'operations[0].selector.kind']],
	},
	{
		label: 'nested payload container',
		operations: [{ kind: 'addController', selector: { packageId: 'pkg001', componentResourceId: 'cmp001', controllerName: 'c' }, controller }],
		diagnostics: [['invalid_controller_payload', 'operations[0].controller.pages']],
	},
];

test('malformed operations return preflight and apply failure envelopes without committing', async (t) => {
	const fixture = await createTempBackendProject();
	const runtime = createBackendRuntime();
	const opened = await runtime.openSession({ projectPath: fixture.rootDir });
	assert(opened.ok, JSON.stringify(opened));
	const sessionId = opened.data.sessionId;
	try {
		for (const { label, operations, diagnostics } of MALFORMED) {
			for (const method of ['preflightTransaction', 'applyTransaction'] as const) {
				const result = await runtime[method]({ sessionId, expectedRevision: 0, operations: operations as never });
				assert(!result.ok, `${method} ${label} must fail`);
				t.is(result.error.code, 'transaction_unsupported', `${method} ${label}`);
				t.deepEqual(result.meta.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.path]), diagnostics, `${method} ${label}`);
				for (const diagnostic of result.meta.diagnostics) {
					t.is(diagnostic.owner, 'core.transaction');
					t.is(diagnostic.remediation?.kind, 'revise-operation');
					t.is(diagnostic.docsUri, `openfairygui://docs/diagnostics/${diagnostic.code}`);
				}
			}
		}
		const session = runtime.getSession({ sessionId });
		assert(session.ok);
		t.is(session.data.revision, 0);
		t.false(session.data.dirty);
	} finally {
		await runtime.closeSession({ sessionId });
		await fixture.cleanup();
	}
});
