import test from 'ava';
import { createBackendRuntime, createTempBackendProject } from './helpers.js';

test('runtime events are monotonic and reflect transaction/save/close ordering', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const initialEvents = runtime.getEvents({ sessionId: opened.data.sessionId });
		t.true(initialEvents.ok);
		if (!initialEvents.ok) return;
		t.is(initialEvents.data.events[0]?.sequence, 1);
		t.is(initialEvents.data.events[0]?.kind, 'session.opened');
		t.is(initialEvents.data.currentSequence, 1);
		const mutableInitialEvent = initialEvents.data.events[0];
		if (!mutableInitialEvent) return;
		mutableInitialEvent.kind = 'job.failed';
		mutableInitialEvent.diagnostics.push({ code: 'mutated', message: 'external mutation', severity: 'error' });
		const initialEventsAgain = runtime.getEvents({ sessionId: opened.data.sessionId });
		t.true(initialEventsAgain.ok);
		if (!initialEventsAgain.ok) return;
		t.is(initialEventsAgain.data.events[0]?.kind, 'session.opened');
		t.false(initialEventsAgain.data.events[0]?.diagnostics.some((diagnostic) => diagnostic.code === 'mutated') ?? true);

		const applied = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { text: 'P2 events' },
				},
			],
		});
		t.true(applied.ok);

		const afterApply = runtime.getEvents({ sessionId: opened.data.sessionId, after: '1' });
		t.true(afterApply.ok);
		if (!afterApply.ok) return;
		t.deepEqual(afterApply.data.events.map((event) => event.kind), ['transaction.applied', 'cache.invalidated']);

		const saved = await runtime.saveSession({ sessionId: opened.data.sessionId });
		t.true(saved.ok);
		const afterSave = runtime.getEvents({ sessionId: opened.data.sessionId, after: String(afterApply.data.currentSequence) });
		t.true(afterSave.ok);
		if (!afterSave.ok) return;
		t.deepEqual(afterSave.data.events.map((event) => event.kind), ['save.started', 'save.completed', 'cache.updated']);

		const closed = await runtime.closeSession({ sessionId: opened.data.sessionId });
		t.true(closed.ok);
	} finally {
		await fixture.cleanup();
	}
});

test('runtime event cursor rejects malformed or unknown cursors', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const malformed = runtime.getEvents({ sessionId: opened.data.sessionId, after: 'not-a-number' });
		t.false(malformed.ok);
		if (!malformed.ok) {
			const failure = malformed as Extract<typeof malformed, { ok: false }>;
			t.is(failure.error.code, 'event_cursor_invalid');
		}

		const unknown = runtime.getEvents({ sessionId: opened.data.sessionId, after: '99' });
		t.false(unknown.ok);
		if (!unknown.ok) {
			const failure = unknown as Extract<typeof unknown, { ok: false }>;
			t.is(failure.error.code, 'event_cursor_invalid');
		}
	} finally {
		await fixture.cleanup();
	}
});

test('runtime events retain the latest 1000 entries and reject expired cursors', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		for (let index = 0; index < 1001; index += 1) {
			const rejected = await runtime.applyTransaction({
				sessionId: opened.data.sessionId,
				expectedRevision: 99,
				operations: [],
			});
			t.false(rejected.ok);
		}

		const expired = runtime.getEvents({ sessionId: opened.data.sessionId, after: '1' });
		t.false(expired.ok);
		if (!expired.ok) {
			const failure = expired as Extract<typeof expired, { ok: false }>;
			t.is(failure.error.code, 'event_cursor_invalid');
		}

		const retained = runtime.getEvents({ sessionId: opened.data.sessionId, after: '2' });
		t.true(retained.ok);
		if (!retained.ok) return;
		t.is(retained.data.events.length, 1000);
		t.is(retained.data.oldestSequence, 3);
		t.is(retained.data.currentSequence, 1002);
	} finally {
		await fixture.cleanup();
	}
});
