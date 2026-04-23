import test from 'ava';
import {
	BACKEND_CAPABILITY_SCHEMA_VERSION,
	BACKEND_CONTRACT_VERSION,
	BackendRuntime,
} from '../src/index.js';
import { createTempBackendProject } from './helpers.js';

interface MutableCapabilitiesProbe {
	methods: string[];
	runtime: {
		events: {
			polling: boolean;
		};
		jobs: {
			supportedKinds: string[];
		};
		cache: {
			sourceOfTruth: boolean;
		};
	};
}

test('P2 capabilities and version fields expose events jobs and cache support', (t) => {
	const runtime = new BackendRuntime();
	const result = runtime.getCapabilities();
	t.true(result.ok);
	if (!result.ok) return;

	t.is(BACKEND_CONTRACT_VERSION, '1.1.0-p2');
	t.is(BACKEND_CAPABILITY_SCHEMA_VERSION, 2);
	t.true(result.data.methods.includes('getEvents'));
	t.true(result.data.methods.includes('getJob'));
	t.true(result.data.methods.includes('listJobs'));
	t.true(result.data.methods.includes('cancelJob'));
	t.true(result.data.methods.includes('getCacheSnapshot'));
	t.true(result.data.methods.includes('refreshCache'));
	t.true(result.data.runtime.events.polling);
	t.false(result.data.runtime.events.subscriptions);
	t.true(result.data.runtime.jobs.inMemory);
	t.true(result.data.runtime.jobs.cooperativeCancel);
	t.false(result.data.runtime.jobs.persistent);
	t.false(result.data.runtime.jobs.artifactJobs);
	t.true(result.data.runtime.cache.derivedReadOnly);
	t.false(result.data.runtime.cache.sourceOfTruth);
});

test('P2 capability snapshots are isolated from external mutation', (t) => {
	const runtime = new BackendRuntime();
	const result = runtime.getCapabilities();
	t.true(result.ok);
	if (!result.ok) return;

	const mutable = result.data as unknown as MutableCapabilitiesProbe;
	mutable.methods.length = 0;
	mutable.runtime.events.polling = false;
	mutable.runtime.jobs.supportedKinds.push('artifact.publish');
	mutable.runtime.cache.sourceOfTruth = true;

	const again = runtime.getCapabilities();
	t.true(again.ok);
	if (!again.ok) return;
	t.true(again.data.methods.includes('refreshCache'));
	t.true(again.data.runtime.events.polling);
	t.deepEqual(again.data.runtime.jobs.supportedKinds, ['cache.refresh']);
	t.false(again.data.runtime.cache.sourceOfTruth);
});

test('session capability snapshots are isolated from external mutation', async (t) => {
	const fixture = await createTempBackendProject();
	const runtime = new BackendRuntime();
	try {
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const mutable = opened.data.capabilities as unknown as MutableCapabilitiesProbe;
		mutable.methods.length = 0;
		mutable.runtime.events.polling = false;
		mutable.runtime.jobs.supportedKinds.push('artifact.publish');
		mutable.runtime.cache.sourceOfTruth = true;

		const session = runtime.getSession({ sessionId: opened.data.sessionId });
		t.true(session.ok);
		if (!session.ok) return;
		t.true(session.data.capabilities.methods.includes('refreshCache'));
		t.true(session.data.capabilities.runtime.events.polling);
		t.deepEqual(session.data.capabilities.runtime.jobs.supportedKinds, ['cache.refresh']);
		t.false(session.data.capabilities.runtime.cache.sourceOfTruth);
	} finally {
		await fixture.cleanup();
	}
});
