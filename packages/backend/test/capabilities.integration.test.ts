import test from 'ava';
import { BackendRuntime } from '../src/index.js';

test('getCapabilities reports derived ownership and runtime capabilities', (t) => {
	const runtime = new BackendRuntime();
	const result = runtime.getCapabilities();

	t.true(result.ok);
	if (!result.ok) return;

	t.is(result.meta.stage, 'read');
	t.true(result.meta.requestId.length > 0);
	t.true(result.meta.durationMs >= 0);
	t.deepEqual(result.meta.warnings, []);
	t.deepEqual(result.meta.diagnostics, []);
	t.is(result.data.transactionKernelOwner, '@openfairygui/core');
	t.is(result.data.appSeamOwner, '@openfairygui/functions');
	t.is(result.data.runtimeOwner, '@openfairygui/backend');
	t.is(result.data.contractVersion, '1.0.0-p1');
	t.is(result.data.capabilitySchemaVersion, 1);
	t.true(result.data.read.capabilitySnapshot);
	t.true(result.data.read.sessionSnapshot);
	t.true(result.data.authoring.applyTransaction);
	t.true(result.data.authoring.saveSession);
	t.false(result.data.artifact.publish);
	t.false(result.data.artifact.restore);
	t.is(result.data.artifact.status, 'deferred');
	t.deepEqual(result.data.authoring.resourceKinds, ['image', 'component']);
	t.deepEqual(result.data.authoring.nodeKinds, ['image', 'text']);
	t.deepEqual(result.data.authoring.gearKinds, ['look']);
	t.true(result.data.runtime.sessionRuntime);
	t.true(result.data.runtime.advisoryLocking);
	t.false(result.data.runtime.atomicSave);
	t.is(result.data.runtime.pathPolicy.sessionIdentity, 'project-root');
	t.is(result.data.runtime.pathPolicy.saveTarget, 'opened-project-only');
});
