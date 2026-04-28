import test from 'ava';
import { BackendRuntime } from '../src/index.js';

test('capabilities are separated into read, authoring, artifact, and runtime planes', (t) => {
	const runtime = new BackendRuntime();
	const result = runtime.getCapabilities();
	t.true(result.ok);
	if (!result.ok) return;

	t.truthy(result.data.read);
	t.truthy(result.data.authoring);
	t.truthy(result.data.artifact);
	t.truthy(result.data.runtime);
	t.deepEqual(result.data.authoring.unsupported, ['artifact.publish', 'artifact.restore']);
	t.is(result.data.artifact.status, 'bridge-required');
	t.is(result.data.artifact.publishBridge.executionBoundary, 'external-bridge');
	t.is(result.data.artifact.restoreBridge.requiredHost, 'node');
});
