import assert from 'node:assert/strict';
import test from 'node:test';
import {
	classifyDiffSignature,
	formatHumanReport,
	measureCorpusFidelity,
	parseCliArgs,
	summarizeFidelityResults,
} from './measure-uam-fidelity.mjs';

test('classifyDiffSignature groups XML attribute diffs, missing/extra entries and binary diffs', () => {
	assert.equal(
		classifyDiffSignature({
			path: 'assets/Main/package.xml',
			kind: 'file',
			change: 'modified',
			line: 6,
			sourceExcerpt: '<movieclip id="mc01" name="anim.jta" atlas="alone" smoothing="false"/>',
			materializedExcerpt: '<movieclip id="mc01" name="anim.jta" smoothing="false"/>',
		}),
		'xml:<movieclip>:atlas',
	);
	assert.equal(
		classifyDiffSignature({
			path: 'assets/Main/Host.xml',
			kind: 'file',
			change: 'modified',
			line: 14,
			sourceExcerpt: '<component id="n1" name="btn" src="sub1" fileName="Sub.xml" xy="0,0"/>',
			materializedExcerpt: '<component id="n1" name="btn" src="sub1" xy="0,0"/>',
		}),
		'xml:<component>:fileName',
	);
	assert.equal(classifyDiffSignature({ path: 'assets/Main/a.png', kind: 'file', change: 'missing' }), 'file:missing');
	assert.equal(
		classifyDiffSignature({ path: 'assets/Main/sub', kind: 'directory', change: 'extra' }),
		'directory:extra',
	);
	assert.equal(
		classifyDiffSignature({ path: 'assets/Main/a.png', kind: 'file', change: 'modified' }),
		'file:modified',
	);
});

test('summarizeFidelityResults calculates full ratios and ranks differences by frequency', () => {
	const report = summarizeFidelityResults([
		{
			name: 'CleanSubmodule',
			source: 'reference-submodule',
			projectPath: 'fixtures/Clean/Clean.fairy',
			uamFidelity: 'full',
			packages: 2,
			components: 5,
			resources: 12,
			report: null,
		},
		{
			name: 'BlockedSubmodule',
			source: 'reference-submodule',
			projectPath: 'fixtures/Blocked/Blocked.fairy',
			uamFidelity: 'unsupported',
			packages: 1,
			components: 3,
			resources: 6,
			report: {
				reason: 'round_trip_mismatch',
				totalDiffCount: 3,
				truncated: false,
				diffs: [
					{
						path: 'assets/A/package.xml',
						kind: 'file',
						change: 'modified',
						line: 5,
						sourceExcerpt: '<movieclip id="m1" atlas="alone"/>',
						materializedExcerpt: '<movieclip id="m1"/>',
					},
					{
						path: 'assets/B/package.xml',
						kind: 'file',
						change: 'modified',
						line: 7,
						sourceExcerpt: '<movieclip id="m2" atlas="alone_npot"/>',
						materializedExcerpt: '<movieclip id="m2"/>',
					},
					{
						path: 'assets/A/Main.xml',
						kind: 'file',
						change: 'modified',
						line: 9,
						sourceExcerpt: '<component id="n1" src="c1" fileName="C1.xml"/>',
						materializedExcerpt: '<component id="n1" src="c1"/>',
					},
				],
			},
		},
		{
			name: 'IncompleteTracked',
			source: 'tracked-fixture',
			projectPath: 'fixtures/Incomplete/Incomplete.fairy',
			uamFidelity: 'unsupported',
			packages: 0,
			components: 0,
			resources: 0,
			report: {
				reason: 'incomplete_read',
				errorMessage: 'permission denied',
				totalDiffCount: 0,
				diffs: [],
				truncated: false,
			},
		},
	]);

	assert.equal(report.summary.totalProjects, 3);
	assert.equal(report.summary.fullProjects, 1);
	assert.equal(report.summary.unsupportedProjects, 2);
	assert.equal(report.summary.fullPercent, '33.3%');
	assert.deepEqual(report.summary.referenceSubmodules, {
		totalProjects: 2,
		fullProjects: 1,
		unsupportedProjects: 1,
		fullRatio: 0.5,
		fullPercent: '50.0%',
	});
	assert.equal(report.summary.totalDiffCount, 3);
	assert.deepEqual(
		report.differenceInventory.map((entry) => [entry.signature, entry.count]),
		[
			['xml:<movieclip>:atlas', 2],
			['reason:incomplete_read', 1],
			['xml:<component>:fileName', 1],
		],
	);

	const text = formatHumanReport(report);
	assert.match(text, /UAM Fidelity Summary: 1\/3 full \(33\.3%\)/);
	assert.match(text, /Reference submodules \(references\.json\): 1\/2 full \(50\.0%\)/);
	assert.match(text, /xml:<movieclip>:atlas/);
});

test('measureCorpusFidelity opens sessions with isolated lock paths and closes every session', async () => {
	const closed = [];
	const seenLockPaths = [];
	class StubRuntime {
		constructor({ fileSystem }) {
			this.fileSystem = fileSystem;
		}
		async openSession({ projectPath }) {
			seenLockPaths.push(this.fileSystem.getSessionLockPath(projectPath));
			if (projectPath.endsWith('Bad.fairy')) {
				return {
					ok: true,
					data: {
						sessionId: 'bad-session',
						uamFidelity: 'unsupported',
						uamFidelityReport: {
							reason: 'round_trip_mismatch',
							totalDiffCount: 1,
							diffs: [{ path: 'assets/Main/package.xml', kind: 'file', change: 'missing' }],
							truncated: false,
						},
					},
				};
			}
			return {
				ok: true,
				data: { sessionId: 'good-session', uamFidelity: 'full' },
			};
		}
		getProjectOutline() {
			return {
				ok: true,
				data: {
					packages: [
						{
							id: 'p1',
							name: 'Main',
							resources: [
								{ id: 'c1', kind: 'component' },
								{ id: 'i1', kind: 'image' },
							],
						},
					],
				},
			};
		}
		async closeSession({ sessionId }) {
			closed.push(sessionId);
			return { ok: true, data: { sessionId, closed: true } };
		}
	}

	const report = await measureCorpusFidelity(
		[
			{ name: 'Good', source: 'custom', projectPath: 'Good.fairy' },
			{ name: 'Bad', source: 'custom', projectPath: 'Bad.fairy' },
		],
		{
			backend: {
				BackendRuntime: StubRuntime,
				createNodeBackendFileSystem: () => ({}),
			},
		},
	);
	assert.equal(report.summary.fullProjects, 1);
	assert.equal(report.summary.unsupportedProjects, 1);
	assert.deepEqual(closed, ['good-session', 'bad-session']);
	assert.equal(seenLockPaths.length, 2);
	assert.notEqual(seenLockPaths[0], seenLockPaths[1]);
	assert.equal(report.differenceInventory[0].signature, 'file:missing');
});

test('parseCliArgs handles flags and rejects unexpected positionals', () => {
	assert.deepEqual(
		parseCliArgs(['--json', '--fail-on-unsupported', '--project', 'a.fairy', '--project', 'b.fairy']),
		{
			json: true,
			failOnUnsupported: true,
			projects: ['a.fairy', 'b.fairy'],
			help: false,
		},
	);
	assert.throws(() => parseCliArgs(['unexpected.fairy']), /Unexpected positional|Unexpected argument/);
});
