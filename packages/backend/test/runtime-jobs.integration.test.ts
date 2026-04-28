import test from 'ava';
import { createBackendRuntime, createTempBackendProject, waitForBackendJobStatus } from './helpers.js';

test('refreshCache creates queryable cache refresh jobs that complete asynchronously', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const refreshed = runtime.refreshCache({ sessionId: opened.data.sessionId });
		t.true(refreshed.ok);
		if (!refreshed.ok) return;
		t.is(refreshed.data.kind, 'cache.refresh');
		t.is(refreshed.data.status, 'queued');

		const completed = await waitForBackendJobStatus(runtime, opened.data.sessionId, refreshed.data.jobId, 'completed');
		t.is(completed.status, 'completed');
		t.is(completed.cacheRevision, opened.data.revision);
		completed.status = 'failed';
		if (completed.progress) completed.progress.message = 'external mutation';
		const completedAgain = runtime.getJob({ sessionId: opened.data.sessionId, jobId: refreshed.data.jobId });
		t.true(completedAgain.ok);
		if (!completedAgain.ok) return;
		t.is(completedAgain.data.status, 'completed');
		t.not(completedAgain.data.progress?.message, 'external mutation');

		const jobs = runtime.listJobs({ sessionId: opened.data.sessionId, status: 'terminal', kind: 'cache.refresh', limit: 1 });
		t.true(jobs.ok);
		if (!jobs.ok) return;
		t.is(jobs.data.jobs.length, 1);
		const mutableListedJob = jobs.data.jobs[0];
		if (!mutableListedJob) return;
		mutableListedJob.status = 'failed';
		const jobsAgain = runtime.listJobs({ sessionId: opened.data.sessionId, status: 'terminal', kind: 'cache.refresh', limit: 1 });
		t.true(jobsAgain.ok);
		if (!jobsAgain.ok) return;
		t.is(jobsAgain.data.jobs[0]?.status, 'completed');
	} finally {
		await fixture.cleanup();
	}
});

test('cancelJob cancels queued and running refresh jobs cooperatively', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const refreshed = runtime.refreshCache({ sessionId: opened.data.sessionId });
		t.true(refreshed.ok);
		if (!refreshed.ok) return;

		const queuedCancel = runtime.cancelJob({ sessionId: opened.data.sessionId, jobId: refreshed.data.jobId });
		t.true(queuedCancel.ok);
		if (!queuedCancel.ok) return;
		t.is(queuedCancel.data.status, 'cancelled');

		const runningRefresh = runtime.refreshCache({ sessionId: opened.data.sessionId });
		t.true(runningRefresh.ok);
		if (!runningRefresh.ok) return;
		await waitForBackendJobStatus(runtime, opened.data.sessionId, runningRefresh.data.jobId, 'running');
		const runningCancel = runtime.cancelJob({ sessionId: opened.data.sessionId, jobId: runningRefresh.data.jobId });
		t.true(runningCancel.ok);
		if (!runningCancel.ok) return;
		t.is(runningCancel.data.status, 'cancelled');

		const events = runtime.getEvents({ sessionId: opened.data.sessionId });
		t.true(events.ok);
		if (!events.ok) return;
		t.true(events.data.events.some((event) => event.kind === 'job.cancelRequested'));
		t.true(events.data.events.some((event) => event.kind === 'job.cancelled'));
	} finally {
		await fixture.cleanup();
	}
});

test('cancelJob reports terminal jobs as not cancellable and missing jobs as not found', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const refreshed = runtime.refreshCache({ sessionId: opened.data.sessionId });
		t.true(refreshed.ok);
		if (!refreshed.ok) return;
		await waitForBackendJobStatus(runtime, opened.data.sessionId, refreshed.data.jobId, 'completed');

		const terminalCancel = runtime.cancelJob({ sessionId: opened.data.sessionId, jobId: refreshed.data.jobId });
		t.false(terminalCancel.ok);
		if (!terminalCancel.ok) {
			const failure = terminalCancel as Extract<typeof terminalCancel, { ok: false }>;
			t.is(failure.error.code, 'job_not_cancellable');
		}

		const missing = runtime.cancelJob({ sessionId: opened.data.sessionId, jobId: 'missing-job' });
		t.false(missing.ok);
		if (!missing.ok) {
			const failure = missing as Extract<typeof missing, { ok: false }>;
			t.is(failure.error.code, 'job_not_found');
		}
	} finally {
		await fixture.cleanup();
	}
});

test('listJobs retains only the latest 100 terminal jobs per session', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const created: string[] = [];
		for (let index = 0; index < 101; index += 1) {
			const refreshed = runtime.refreshCache({ sessionId: opened.data.sessionId });
			t.true(refreshed.ok);
			if (!refreshed.ok) return;
			created.push(refreshed.data.jobId);
			await waitForBackendJobStatus(runtime, opened.data.sessionId, refreshed.data.jobId, 'completed');
		}

		const jobs = runtime.listJobs({ sessionId: opened.data.sessionId, status: 'terminal' });
		t.true(jobs.ok);
		if (!jobs.ok) return;
		t.is(jobs.data.jobs.length, 100);
		t.false(jobs.data.jobs.some((job) => job.jobId === created[0]));
		t.true(jobs.data.jobs.some((job) => job.jobId === created[100]));
	} finally {
		await fixture.cleanup();
	}
});
