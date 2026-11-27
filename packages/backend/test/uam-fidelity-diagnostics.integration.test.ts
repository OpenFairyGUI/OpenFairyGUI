import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'ava';
import { Document } from '@openfairygui/core';
import { liftDocumentToUamProject } from '@openfairygui/core/uam';
import { createTestMovieClipJta } from '@openfairygui/test-utils';
import type { BackendContext } from '../src/services/context.js';
import {
	diffCapturedProjects,
	evaluateUamFidelity,
	formatUamFidelityUnsupportedMessage,
} from '../src/services/uam-fidelity.js';
import { createBackendRuntime, createTempBackendProject } from './helpers.js';

test('diffCapturedProjects reports missing, extra, modified text, binary, type mismatch and directory diffs with truncation', (t) => {
	const sourceFiles = new Map<string, string | Uint8Array>([
		['assets/Main/Main.xml', '<component>\n  <image id="n0" src="a"/>\n</component>'],
		['assets/Main/only-source.xml', '<component/>'],
		['assets/Main/bin.png', new Uint8Array([1, 2, 3])],
		['assets/Main/type-mismatch.dat', 'text'],
	]);
	const materializedFiles = new Map<string, string | Uint8Array>([
		['assets/Main/Main.xml', '<component>\n  <image id="n0" src="b"/>\n</component>'],
		['assets/Main/only-mat.xml', '<component/>'],
		['assets/Main/bin.png', new Uint8Array([1, 2, 4])],
		['assets/Main/type-mismatch.dat', new Uint8Array([9])],
	]);
	const sourceDirs = new Set(['assets/Main', 'assets/Main/src-only-dir']);
	const materializedDirs = new Set(['assets/Main', 'assets/Main/mat-only-dir']);

	const full = diffCapturedProjects(sourceFiles, sourceDirs, materializedFiles, materializedDirs);
	t.is(full.totalDiffCount, 7);
	t.false(full.truncated);
	t.deepEqual(
		full.diffs.map((entry) => [entry.path, entry.kind, entry.change]),
		[
			['assets/Main/bin.png', 'file', 'modified'],
			['assets/Main/Main.xml', 'file', 'modified'],
			['assets/Main/mat-only-dir', 'directory', 'extra'],
			['assets/Main/only-mat.xml', 'file', 'extra'],
			['assets/Main/only-source.xml', 'file', 'missing'],
			['assets/Main/src-only-dir', 'directory', 'missing'],
			['assets/Main/type-mismatch.dat', 'file', 'type_mismatch'],
		],
	);
	const textDiff = full.diffs.find((entry) => entry.path === 'assets/Main/Main.xml');
	t.is(textDiff?.line, 2);
	t.is(textDiff?.sourceExcerpt, '<image id="n0" src="a"/>');
	t.is(textDiff?.materializedExcerpt, '<image id="n0" src="b"/>');

	const capped = diffCapturedProjects(sourceFiles, sourceDirs, materializedFiles, materializedDirs, 2);
	t.is(capped.totalDiffCount, 7);
	t.is(capped.diffs.length, 2);
	t.true(capped.truncated);
});

test('evaluateUamFidelity distinguishes full, incomplete_read, materialize_failed, and round_trip_mismatch', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('fidelity-eval').setProjectType(0).setVersion('3.0');
	const pkg = doc.createPackage('Main').setId('pkg001');
	pkg.addResource(doc.createComponent('MainView').setId('cmp001').setPath('/').setSize(100, 100));
	const project = liftDocumentToUamProject(doc);

	const ok = await evaluateUamFidelity(doc, project, { fairyFileName: 'Demo.fairy' });
	t.deepEqual(ok, { uamFidelity: 'full' });

	const incomplete = await evaluateUamFidelity(doc, project, {
		readComplete: false,
		readDiagnostics: [
			{ severity: 'error', code: 'unreadable_source', path: 'assets/Main', message: 'cannot read assets' },
		],
	});
	t.is(incomplete.uamFidelity, 'unsupported');
	if (incomplete.uamFidelity === 'unsupported') {
		t.is(incomplete.report.reason, 'incomplete_read');
		t.is(incomplete.report.errorMessage, 'cannot read assets');
		t.regex(formatUamFidelityUnsupportedMessage(incomplete.report), /incomplete_read|incomplete/i);
	}

	const invalidProject = structuredClone(project);
	const invalidComponent = invalidProject.packages[0]!.resources[0]!;
	if (invalidComponent.kind === 'component') {
		invalidComponent.component.properties.pageController = 'missing_controller';
	}
	const failed = await evaluateUamFidelity(doc, invalidProject, { fairyFileName: 'Demo.fairy' });
	t.is(failed.uamFidelity, 'unsupported');
	if (failed.uamFidelity === 'unsupported') {
		t.is(failed.report.reason, 'materialize_failed');
		t.truthy(failed.report.errorMessage);
		t.regex(formatUamFidelityUnsupportedMessage(failed.report), /could not be materialized/i);
	}

	const alteredProject = structuredClone(project);
	const component = alteredProject.packages[0]!.resources[0]!;
	if (component.kind === 'component') component.component.size.width = 200;
	const mismatch = await evaluateUamFidelity(doc, alteredProject, { fairyFileName: 'Demo.fairy' });
	t.is(mismatch.uamFidelity, 'unsupported');
	if (mismatch.uamFidelity === 'unsupported') {
		t.is(mismatch.report.reason, 'round_trip_mismatch');
		t.is(mismatch.report.totalDiffCount, 1);
		t.is(mismatch.report.diffs[0]?.path, 'assets/Main/MainView.xml');
		t.is(mismatch.report.diffs[0]?.line, 2);
		t.regex(formatUamFidelityUnsupportedMessage(mismatch.report), /assets\/Main\/MainView\.xml:2/);
	}
});

test('movieclip atlas textureSetMode stays full-fidelity across backend open, edit, save and reopen', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const pkgDir = path.join(fixture.rootDir, 'assets', 'Main');
	await fs.writeFile(path.join(pkgDir, 'spinner.jta'), createTestMovieClipJta(102, { width: 32, height: 32 }));
	await fs.writeFile(
		path.join(pkgDir, 'package.xml'),
		'<?xml version="1.0" encoding="utf-8"?>\n' +
			'<packageDescription id="pkg001">\n' +
			'  <resources>\n' +
			'    <image id="img001" name="background.png" path="/images/" exported="true" atlas="atlas" width="320" height="180"/>\n' +
			'    <component id="cmp001" name="MainView.xml" path="/" exported="true"/>\n' +
			'    <movieclip id="mc001" name="spinner.jta" path="/" atlas="alone_mof" smoothing="false"/>\n' +
			'  </resources>\n' +
			'  <publish name="Main"/>\n' +
			'</packageDescription>\n',
	);

	const runtime = createBackendRuntime();
	const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
	t.true(opened.ok);
	if (!opened.ok) return;
	const sessionId = opened.data.sessionId;
	t.teardown(() => runtime.closeSession({ sessionId }).then(() => undefined));
	t.is(opened.data.uamFidelity, 'full');
	t.is(opened.data.uamFidelityReport, undefined);

	const edited = await runtime.applyTransaction({
		sessionId,
		expectedRevision: 0,
		operations: [
			{
				kind: 'setDisplayNodeProps',
				selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
				props: { text: 'Updated Title' },
			},
		],
	});
	t.true(edited.ok);
	t.true((await runtime.saveSession({ sessionId, expectedRevision: 1 })).ok);
	const savedPackageXml = await fs.readFile(path.join(pkgDir, 'package.xml'), 'utf8');
	t.regex(savedPackageXml, /<movieclip[^>]*id="mc001"[^>]*atlas="alone_mof"[^>]*smoothing="false"/);
	t.true((await runtime.closeSession({ sessionId })).ok);

	const reopened = await runtime.openSession({ projectPath: fixture.fairyPath });
	t.true(reopened.ok);
	if (reopened.ok) {
		t.is(reopened.data.uamFidelity, 'full');
		await runtime.closeSession({ sessionId: reopened.data.sessionId });
	}
});

test('unsupported session exposes bounded fidelityReport on session reads and save/materialize failures', async (t) => {
	const fixture = await createTempBackendProject();
	t.teardown(() => fixture.cleanup());
	const runtime = createBackendRuntime();
	const opened = await runtime.openSession({ projectPath: fixture.fairyPath });
	t.true(opened.ok);
	if (!opened.ok) return;
	const sessionId = opened.data.sessionId;
	t.teardown(() => runtime.closeSession({ sessionId }).then(() => undefined));

	const applied = await runtime.applyTransaction({
		sessionId,
		expectedRevision: 0,
		operations: [
			{
				kind: 'setDisplayNodeProps',
				selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
				props: { text: 'Blocked Edit' },
			},
		],
	});
	t.true(applied.ok);
	if (!applied.ok) return;

	const session = (runtime as unknown as { context: BackendContext }).context.sessions.get(sessionId)!;
	session.uamFidelity = 'unsupported';
	session.uamFidelityReport = {
		reason: 'round_trip_mismatch',
		totalDiffCount: 1,
		diffs: [
			{
				path: 'assets/Main/MainView.xml',
				kind: 'file',
				change: 'modified',
				line: 4,
				sourceExcerpt: '<text id="n1" name="title" customAttr="1"/>',
				materializedExcerpt: '<text id="n1" name="title"/>',
			},
		],
		truncated: false,
	};

	const snapshot = runtime.getSession({ sessionId });
	t.true(snapshot.ok);
	if (snapshot.ok) {
		t.is(snapshot.data.uamFidelity, 'unsupported');
		t.deepEqual(snapshot.data.uamFidelityReport, session.uamFidelityReport);
	}

	const state = runtime.readSessionState({ sessionId });
	t.true(state.ok);
	if (state.ok) {
		t.is(state.data.uamFidelity, 'unsupported');
		t.deepEqual(state.data.uamFidelityReport, session.uamFidelityReport);
	}

	for (const attempt of [
		await runtime.saveSession({ sessionId, expectedRevision: applied.data.revision }),
		await runtime.materializeSession({ sessionId, expectedRevision: applied.data.revision }),
	]) {
		t.false(attempt.ok);
		if (attempt.ok) continue;
		t.is(attempt.error.code, 'uam_fidelity_unsupported');
		if (attempt.error.code === 'uam_fidelity_unsupported') {
			t.deepEqual(attempt.error.fidelityReport, session.uamFidelityReport);
			t.regex(attempt.error.message, /assets\/Main\/MainView\.xml:4 \[modified\]/);
		}
		t.is(attempt.meta.diagnostics.length, 1);
		t.is(attempt.meta.diagnostics[0]?.code, 'uam_fidelity_unsupported');
		t.is(attempt.meta.diagnostics[0]?.path, 'assets/Main/MainView.xml');
		t.regex(attempt.meta.diagnostics[0]?.message ?? '', /line 4/);
		t.is(attempt.meta.diagnostics[0]?.owner, 'backend');
		t.is(attempt.meta.diagnostics[0]?.remediation?.kind, 'host-action');
	}
});
