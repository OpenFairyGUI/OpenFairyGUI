import test from 'ava';
import { BackendRuntime } from '../src/index.js';

test('P2 runtime coordination methods expose backend-local identifiers without transport fields', (t) => {
	const runtime = new BackendRuntime();
	const capabilities = runtime.getCapabilities();
	t.true(capabilities.ok);
	if (!capabilities.ok) return;

	const serialized = JSON.stringify(capabilities.data);
	t.false(serialized.includes('jsonrpc'));
	t.false(serialized.includes('mcp'));
	t.false(serialized.includes('stdio'));
	t.false(serialized.includes('http'));
});
