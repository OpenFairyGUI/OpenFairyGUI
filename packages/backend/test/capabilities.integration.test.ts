import test from 'ava';
import { BackendRuntime } from '../src/index.js';

test('getCapabilities reports derived ownership and runtime capabilities', (t) => {
	const runtime = new BackendRuntime();
	const result = runtime.getCapabilities();

	t.true(result.ok);
	if (!result.ok) return;

	t.is(result.data.transactionKernelOwner, '@openfairygui/core');
	t.is(result.data.appSeamOwner, '@openfairygui/functions');
	t.is(result.data.runtimeOwner, '@openfairygui/backend');
	t.deepEqual(result.data.authoring.resourceKinds, ['image', 'component']);
	t.deepEqual(result.data.authoring.nodeKinds, ['image', 'text']);
	t.deepEqual(result.data.authoring.gearKinds, ['look']);
	t.true(result.data.runtime.sessionRuntime);
	t.true(result.data.runtime.advisoryLocking);
	t.false(result.data.runtime.atomicSave);
});
