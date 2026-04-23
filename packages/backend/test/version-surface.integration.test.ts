import test from 'ava';
import {
	BACKEND_CAPABILITY_SCHEMA_VERSION,
	BACKEND_COMPATIBILITY_POLICY,
	BACKEND_CONTRACT_VERSION,
	BackendRuntime,
} from '../src/index.js';

test('backend version surface is explicit and pinned', (t) => {
	const runtime = new BackendRuntime();
	const result = runtime.getCapabilities();
	t.true(result.ok);
	if (!result.ok) return;

	t.is(BACKEND_CONTRACT_VERSION, '1.0.0-p1');
	t.is(BACKEND_CAPABILITY_SCHEMA_VERSION, 1);
	t.is(result.meta.contractVersion, BACKEND_CONTRACT_VERSION);
	t.is(result.meta.capabilitySchemaVersion, BACKEND_CAPABILITY_SCHEMA_VERSION);
	t.is(result.data.contractVersion, BACKEND_CONTRACT_VERSION);
	t.is(result.data.capabilitySchemaVersion, BACKEND_CAPABILITY_SCHEMA_VERSION);
	t.deepEqual(result.data.compatibilityPolicy, BACKEND_COMPATIBILITY_POLICY);
});
