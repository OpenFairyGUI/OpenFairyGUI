import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'ava';
import { NodeIO } from '@openfairygui/core/node';
import { createNodeBackendFileSystem } from '../src/node.js';
import { createBackendRuntime, createFailingFileSystem, createTempBackendProject } from './helpers.js';

test.serial('Node saves leave unrelated trees and links untouched and never copy or rename the root', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	await fs.mkdir(path.join(fixture.rootDir, 'Library'));
	await fs.writeFile(path.join(fixture.rootDir, 'Library', 'untouched'), 'user data');
	await fs.symlink(path.join(fixture.rootDir, 'Library'), path.join(fixture.rootDir, 'external-cache'), 'junction');
	const runtime = createBackendRuntime();
	const opened = await runtime.openSession({ projectPath: fixture.rootDir });
	t.true(opened.ok);
	if (!opened.ok) return;
	t.teardown(() => runtime.closeSession({ sessionId: opened.data.sessionId }));
	await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations: [
			{ kind: 'renameResource', selector: { packageId: 'pkg001', resourceId: 'cmp001' }, newName: 'Saved' },
		],
	});
	const copy = fs.cp;
	const rename = fs.rename;
	fs.cp = (async (source, target, options) => {
		t.not(String(source), fixture.rootDir);
		t.false(String(source).includes('Library'));
		return copy(source, target, options);
	}) as typeof fs.cp;
	fs.rename = async (source, target) => {
		t.not(String(source), fixture.rootDir);
		t.not(String(target), fixture.rootDir);
		return rename(source, target);
	};
	try {
		t.true((await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: 1 })).ok);
	} finally {
		fs.cp = copy;
		fs.rename = rename;
	}
	t.is(await fs.readFile(path.join(fixture.rootDir, 'Library', 'untouched'), 'utf8'), 'user data');
	t.true((await fs.lstat(path.join(fixture.rootDir, 'external-cache'))).isSymbolicLink());
	t.regex(await fs.readFile(path.join(fixture.rootDir, 'assets', 'Main', 'Saved.xml'), 'utf8'), /component/);
});

test.serial(
	'a later managed-entry commit failure restores earlier entries and preserves unrelated files',
	async (t) => {
		const fixture = await createTempBackendProject();
		t.teardown(() => fixture.cleanup());
		await fs.writeFile(path.join(fixture.rootDir, 'notes.txt'), 'keep');
		const before = await fs.readFile(fixture.fairyPath, 'utf8');
		const component = path.join(fixture.rootDir, 'assets', 'Main', 'MainView.xml');
		const beforeComponent = await fs.readFile(component, 'utf8');
		const base = createNodeBackendFileSystem();
		const rename = fs.rename;
		let installed = 0;
		fs.rename = async (source, target) => {
			if (
				String(source).includes('.save-') &&
				!String(source).includes('.save-backup-') &&
				path.dirname(String(target)) === fixture.rootDir
			) {
				if (++installed === 2) throw new Error('second entry failed');
			}
			return rename(source, target);
		};
		try {
			const error = await t.throwsAsync(
				base.runProjectWriteTransaction!(fixture.rootDir, async (staged) => {
					await staged.writeFile(fixture.fairyPath, 'new project');
					await staged.writeFile(component, 'new component');
				}),
			);
			t.like(error, { diskMayBePartiallyUpdated: false });
		} finally {
			fs.rename = rename;
		}
		t.is(await fs.readFile(fixture.fairyPath, 'utf8'), before);
		t.is(await fs.readFile(component, 'utf8'), beforeComponent);
		t.is(await fs.readFile(path.join(fixture.rootDir, 'notes.txt'), 'utf8'), 'keep');
	},
);

test('saveSession succeeds and warns when the host keeps a previous project copy', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const base = createNodeBackendFileSystem();
	const retained = path.join(path.dirname(fixture.rootDir), 'retained-backup');
	const runtime = createBackendRuntime({
		fileSystem: {
			...base,
			async runProjectWriteTransaction(projectRoot, write) {
				await base.runProjectWriteTransaction!(projectRoot, write);
				return { retainedBackupPaths: [retained] };
			},
		},
	});
	const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
	t.true(opened.ok);
	if (!opened.ok) return;
	const sessionId = opened.data.sessionId;
	t.true(
		(
			await runtime.applyTransaction({
				sessionId,
				expectedRevision: 0,
				operations: [
					{
						kind: 'renameResource',
						selector: { packageId: 'pkg001', resourceId: 'cmp001' },
						newName: 'Retained',
					},
				],
			})
		).ok,
	);
	const saved = await runtime.saveSession({ sessionId, expectedRevision: 1 });
	t.true(saved.ok);
	t.deepEqual(
		saved.meta.warnings.map((warning) => warning.code),
		['save_backup_retained'],
	);
	t.true(saved.meta.warnings[0]?.message.includes(retained));
	await runtime.closeSession({ sessionId });
});

test('case-only component rename preserves the new source through staged save and reopen', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const runtime = createBackendRuntime();
	const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
	t.true(opened.ok);
	if (!opened.ok) return;
	const sessionId = opened.data.sessionId;
	t.true(
		(
			await runtime.applyTransaction({
				sessionId,
				expectedRevision: 0,
				operations: [
					{
						kind: 'renameResource',
						selector: { packageId: 'pkg001', resourceId: 'cmp001' },
						newName: 'mainview',
					},
				],
			})
		).ok,
	);
	t.true((await runtime.saveSession({ sessionId, expectedRevision: 1 })).ok);
	t.regex(await fs.readFile(path.join(fixture.rootDir, 'assets', 'Main', 'mainview.xml'), 'utf8'), /<component/);
	t.true((await runtime.closeSession({ sessionId })).ok);
	const reopened = await runtime.openSession({ projectPath: fixture.fairyPath });
	t.true(reopened.ok);
	if (reopened.ok) {
		t.is(reopened.data.uamFidelity, 'full');
		await runtime.closeSession({ sessionId: reopened.data.sessionId });
	}
});

test.serial('commit plus rollback failure reports recovery directories and uncertain disk state', async (t) => {
	for (const method of ['save', 'materialize']) {
		const fixture = await createTempBackendProject();
		const runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
		t.true(opened.ok);
		if (!opened.ok) {
			await fixture.cleanup();
			continue;
		}
		const sessionId = opened.data.sessionId;
		t.true(
			(
				await runtime.applyTransaction({
					sessionId,
					expectedRevision: 0,
					operations: [
						{
							kind: 'renameResource',
							selector: { packageId: 'pkg001', resourceId: 'cmp001' },
							newName: 'Changed',
						},
					],
				})
			).ok,
		);
		const rename = fs.rename;
		const recoveries: string[] = [];
		fs.rename = async (from, to) => {
			if (path.dirname(String(to)) === fixture.rootDir && String(from).includes('.save-')) {
				recoveries.push(path.dirname(String(from)));
				throw new Error('injected rename failure');
			}
			return rename(from, to);
		};
		try {
			const result =
				method === 'save'
					? await runtime.saveSession({ sessionId, expectedRevision: 1 })
					: await runtime.materializeSession({ sessionId, expectedRevision: 1 });
			t.false(result.ok);
			if (!result.ok && (result.error.code === 'save_partial_failure' || result.error.code === 'write_failed')) {
				t.true(result.error.diskMayBePartiallyUpdated);
				t.deepEqual([...(result.error.recoveryPaths ?? [])].sort(), [...recoveries].sort());
				t.true(result.session?.dirty);
				t.is(result.session?.lastSavedRevision, 0);
				for (const directory of result.error.recoveryPaths ?? [])
					t.true((await fs.stat(directory)).isDirectory());
			} else t.fail('expected structured write failure');
			t.true((await fs.stat(fixture.rootDir)).isDirectory(), 'the project root is never moved');
		} finally {
			fs.rename = rename;
			const backup = recoveries.find((item) => item.includes('.save-backup-'));
			if (backup) {
				for (const entry of await fs.readdir(backup))
					await fs.rename(path.join(backup, entry), path.join(fixture.rootDir, entry));
				await fs.rmdir(backup);
			}
			for (const directory of recoveries.filter((item) => item !== backup))
				await fs.rm(directory, { recursive: true, force: true });
			await runtime.closeSession({ sessionId });
			await fixture.cleanup();
		}
	}
});

test('percentage XY source sessions remain fully editable and save all four coordinates', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const io = new NodeIO();
	const document = await io.readProject(fixture.fairyPath);
	const component = document.getRoot().getPackage('Main')!.getComponent('MainView')!;
	const controller = document.createController('state');
	controller.addPage(document.createControllerPage('Idle').setId('0'));
	controller.addPage(document.createControllerPage('Active').setId('1'));
	component.addController(controller);
	const values = '80,45,0.25,0.25|160,90,0.5,0.5';
	component
		.listChildren()
		.find((child) => child.getId() === 'n1')!
		.addGear(
			document
				.createGear('')
				.setGearType(1)
				.setController(controller)
				.setPages('0,1')
				.setValues(values)
				.setDefaultValue('0,0,0,0')
				.setPositionsInPercent(true),
		);
	await io.writeProject(document, fixture.fairyPath);
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
				props: { text: 'Still editable' },
			},
		],
	});
	t.true(applied.ok);
	const saved = await runtime.saveSession({ sessionId: opened.data.sessionId, expectedRevision: 1 });
	t.true(saved.ok);
	await runtime.closeSession({ sessionId: opened.data.sessionId });
	const reloaded = await io.readProject(fixture.fairyPath);
	const gear = reloaded
		.getRoot()
		.getPackage('Main')!
		.getComponent('MainView')!
		.listChildren()
		.find((child) => child.getId() === 'n1')!
		.listGears()[0]!;
	t.is(gear.getValues(), values);
	t.is(gear.getDefaultValue(), '0,0,0,0');
	t.true(gear.getPositionsInPercent());
});

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
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { pivot: { x: 0.25, y: 0.5 }, pivotAsAnchor: true },
				},
			],
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

test('saveSession failure rolls back the Node project tree', async (t) => {
	const fixture = await createTempBackendProject();
	try {
		const failingFs = createFailingFileSystem((filePath) => filePath.endsWith(`${path.sep}package.xml`));
		const runtime = createBackendRuntime({ fileSystem: failingFs });
		const before = await fs.readFile(path.join(fixture.rootDir, 'assets', 'Main', 'MainView.xml'), 'utf8');
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
		const failure = saved as Extract<typeof saved, { ok: false }>;
		t.is(failure.error.code, 'save_partial_failure');
		if (failure.error.code === 'save_partial_failure') {
			t.false(failure.error.diskMayBePartiallyUpdated);
			t.deepEqual(failure.error.committedPaths, []);
		}
		t.is(await fs.readFile(path.join(fixture.rootDir, 'assets', 'Main', 'MainView.xml'), 'utf8'), before);
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
			t.false(materializeFailure.error.diskMayBePartiallyUpdated);
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
			runProjectWriteTransaction: undefined,
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

test('closeSession waits for an in-flight save before releasing its lock', async (t) => {
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
			runProjectWriteTransaction: undefined,
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
		const applied = await runtime.applyTransaction({
			sessionId: opened.data.sessionId,
			expectedRevision: 0,
			operations: [
				{
					kind: 'setDisplayNodeProps',
					selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
					props: { text: 'Saved before close' },
				},
			],
		});
		t.true(applied.ok);
		if (!applied.ok) return;

		const saving = runtime.saveSession({ sessionId: opened.data.sessionId });
		await writeStarted;
		let closeSettled = false;
		const closing = runtime.closeSession({ sessionId: opened.data.sessionId }).finally(() => {
			closeSettled = true;
		});
		await Promise.resolve();
		t.false(closeSettled);
		const lockPath = path.join(
			path.dirname(fixture.rootDir),
			`.${path.basename(fixture.rootDir)}.openfairygui.backend.lock`,
		);
		await fs.stat(lockPath);

		releaseWrite();
		t.true((await saving).ok);
		t.true((await closing).ok);
		await t.throwsAsync(fs.stat(lockPath));
	} finally {
		await fixture.cleanup();
	}
});
