import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'ava';
import { createNodeBackendFileSystem } from '../src/node.js';
import { createBackendRuntime, createFailingFileSystem, createTempBackendProject } from './helpers.js';

test('saveSession success updates lastSavedRevision and clears dirty state', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;
		t.is(opened.data.uamFidelity, 'full');

		const applied = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { text: 'Saved Title' },
				},
			],
		});
		t.true(applied.ok);
		if (!applied.ok) return;

		const saved = await runtime.saveSession({ sessionId: opened.data.sessionId });
		t.true(saved.ok);
		if (!saved.ok) return;
		t.is(saved.data.revision, 1);
		t.is(saved.data.lastSavedRevision, 1);
		t.false(saved.data.dirty);
	} finally {
		await fixture.cleanup();
	}
});

test('file sessions preserve display pivot and anchor through apply, save, and reload', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const componentPath = path.join(fixture.rootDir, 'assets', 'Main', 'MainView.xml');
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;
		t.is(opened.data.uamFidelity, 'full');

		const applied = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [{
				kind: 'setDisplayNodeProps',
				selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
				props: { pivot: { x: 0.25, y: 0.5 }, pivotAsAnchor: true },
			}],
		});
		t.true(applied.ok);
		if (!applied.ok) return;

		const saved = await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: 1 });
		t.true(saved.ok);
		if (!saved.ok) return;
		const componentXml = await fs.readFile(componentPath, 'utf8');
		t.true(componentXml.includes('pivot="0.25,0.5"'));
		t.true(componentXml.includes('anchor="true"'));

		await runtime.closeSession({ sessionId: opened.data.sessionId });
		const reloadedRuntime = createBackendRuntime();
		const reloaded = await reloadedRuntime.openSession({ projectPath: fixture.rootDir });
		t.true(reloaded.ok);
		if (reloaded.ok) t.is(reloaded.data.uamFidelity, 'full');
	} finally {
		await fixture.cleanup();
	}
});

test('saveSession partial failure keeps dirty state and reports partial update risk', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const failingFs = createFailingFileSystem((filePath) => filePath.endsWith(`${path.sep}package.xml`));
		const runtime = createBackendRuntime({ fileSystem: failingFs });
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const applied = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { text: 'Half Saved' },
				},
			],
		});
		t.true(applied.ok);
		if (!applied.ok) return;

		const saved = await runtime.saveSession({ sessionId: opened.data.sessionId });
		t.false(saved.ok);
		if (saved.ok) return;
		const failure = saved as Extract<typeof saved, { ok: false }> & {
			error: { diskMayBePartiallyUpdated: true };
		};
		t.is(failure.error.code, 'save_partial_failure');
		t.true(failure.error.diskMayBePartiallyUpdated);
		t.truthy(failure.session);
		t.true(failure.session?.dirty ?? false);
		t.is(failure.session?.lastSavedRevision, 0);
	} finally {
		await fixture.cleanup();
	}
});

test('materializeSession reports write_failed and keeps session dirty state stable', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const failingFs = createFailingFileSystem((filePath) => filePath.endsWith(`${path.sep}package.xml`));
		const runtime = createBackendRuntime({ fileSystem: failingFs });
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const materialized = await runtime.materializeSession({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			mode: 'fullProject',
			reason: 'workspace_bootstrap',
		});
		t.false(materialized.ok);
		if (materialized.ok) return;
		const materializeFailure = materialized as Extract<typeof materialized, { ok: false }>;
		t.is(materializeFailure.error.code, 'write_failed');
		if (materializeFailure.error.code === 'write_failed') {
			t.true(materializeFailure.error.diskMayBePartiallyUpdated);
			t.true(
				materializeFailure.error.failedPaths.some((filePath) => filePath.endsWith(`${path.sep}package.xml`)),
			);
			t.is(materializeFailure.error.lastSavedRevision, 0);
			t.is(materializeFailure.error.diagnostics[0]?.operationKind, 'materializeSession');
		}
		t.false(materializeFailure.session?.dirty ?? true);
		t.is(materializeFailure.session?.lastSavedRevision, 0);
		t.is(materializeFailure.meta.diagnostics[0]?.code, 'write_failed');
	} finally {
		await fixture.cleanup();
	}
});

test('file sessions preserve component properties through UAM writeback', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const componentPath = path.join(fixture.rootDir, 'assets', 'Main', 'MainView.xml');
		const source = (await fs.readFile(componentPath, 'utf8')).replace(
			'<component ',
			'<component overflow="scroll" ',
		);
		await fs.writeFile(componentPath, source);

		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;
		t.is(opened.data.uamFidelity, 'full');

		const applied = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { text: 'Saved with component properties' },
				},
			],
		});
		t.true(applied.ok);
		if (!applied.ok) return;

		const saved = await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: 1 });
		t.true(saved.ok);
		if (!saved.ok) return;
		const savedSource = await fs.readFile(componentPath, 'utf8');
		t.true(savedSource.includes('overflow="scroll"'));
		t.true(savedSource.includes('text="Saved with component properties"'));
	} finally {
		await fixture.cleanup();
	}
});

test('file sessions preserve display skew through UAM writeback', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const componentPath = path.join(fixture.rootDir, 'assets', 'Main', 'MainView.xml');
		const originalSource = await fs.readFile(componentPath, 'utf8');
		const source = originalSource.replace('<image ', '<image skew="3,4" ');
		t.not(source, originalSource);
		t.true(source.includes('skew="3,4"'));
		await fs.writeFile(componentPath, source);

		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;
		t.is(opened.data.uamFidelity, 'full');

		const applied = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { text: 'Saved with skew' },
				},
			],
		});
		t.true(applied.ok);
		if (!applied.ok) return;

		const saved = await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: 1 });
		t.true(saved.ok);
		const savedSource = await fs.readFile(componentPath, 'utf8');
		t.true(savedSource.includes('skew="3,4"'));
		t.true(savedSource.includes('text="Saved with skew"'));
	} finally {
		await fixture.cleanup();
	}
});

test('saveSession serializes a concurrent transaction behind the saved revision', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const base = createNodeBackendFileSystem();
		let releaseWrite = (): void => undefined;
		const writeGate = new Promise<void>((resolve) => {
			releaseWrite = resolve;
		});
		let signalWriteStarted = (): void => undefined;
		const writeStarted = new Promise<void>((resolve) => {
			signalWriteStarted = resolve;
		});
		let delayNextWrite = true;
		const delayedFileSystem = {
			...base,
			async writeFile(filePath: string, content: string): Promise<void> {
				if (delayNextWrite) {
					delayNextWrite = false;
					signalWriteStarted();
					await writeGate;
				}
				await base.writeFile(filePath, content);
			},
		};
		const runtime = createBackendRuntime({ fileSystem: delayedFileSystem });
		const opened = await runtime.openSession({ projectPath: fixture.rootDir });
		t.true(opened.ok);
		if (!opened.ok) return;

		const first = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { text: 'Saved revision' },
				},
			],
		});
		t.true(first.ok);
		if (!first.ok) return;

		const saving = runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: 1 });
		await writeStarted;
		let transactionSettled = false;
		const applying = runtime
			.applyTransaction({
				sessionId: opened.data.sessionId,
				expectedRevision: 1,
				operations: [
					{
						kind: 'setDisplayNodeProps',
						selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
						props: { text: 'Queued revision' },
					},
				],
			})
			.finally(() => {
				transactionSettled = true;
			});
		await Promise.resolve();
		t.false(transactionSettled);

		releaseWrite();
		const saved = await saving;
		const second = await applying;
		t.true(saved.ok);
		if (saved.ok) {
			t.is(saved.data.revision, 1);
			t.is(saved.data.lastSavedRevision, 1);
			t.false(saved.data.dirty);
		}
		t.true(second.ok);
		if (second.ok) {
			t.is(second.data.revision, 2);
			t.is(second.data.lastSavedRevision, 1);
			t.true(second.data.dirty);
		}

		const componentXml = await fs.readFile(path.join(fixture.rootDir, 'assets', 'Main', 'MainView.xml'), 'utf8');
		t.true(componentXml.includes('Saved revision'));
		t.false(componentXml.includes('Queued revision'));
	} finally {
		await fixture.cleanup();
	}
});
