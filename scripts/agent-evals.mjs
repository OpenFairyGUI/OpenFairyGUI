import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { artifactName, consumerEnvironment, preparePackedConsumer } from './pack-smoke.mjs';
import { git, isMain, readJson, ROOT, runCommand } from './repo-utils.mjs';

export function evaluationOptions(values) {
	assert(['codex', 'reference'].includes(values.runner), 'Choose --runner codex (real model) or --runner reference (harness self-check only).');
	const tasks = readJson(path.join(ROOT, 'agent/evals/tasks.json')).filter((task) => !values.case || task.id === values.case);
	assert(tasks.length, 'Unknown --case; see agent/evals/tasks.json.');
	const timeoutSeconds = Number(values['timeout-seconds'] ?? 240);
	assert(Number.isSafeInteger(timeoutSeconds) && timeoutSeconds > 0 && timeoutSeconds <= 1800, '--timeout-seconds must be an integer in 1..1800.');
	assert(values.runner !== 'codex' || values.codex, 'Supply --codex with an installed Codex executable (on Windows use codex.exe, not a .cmd shim).');
	assert(!values.codex || !/\.(?:cmd|bat|ps1)$/i.test(values.codex), '--codex must not require shell interpolation.');
	assert(values.runner === 'codex' || (!values.codex && !values.model), '--codex/--model apply only to the real model runner.');
	return { runner: values.runner, codex: values.codex, model: values.model, timeoutSeconds, tasks };
}

export function agentEvaluations(values) {
	const options = evaluationOptions(values); // Reject bad options before builds, installs or model calls.
	const packed = preparePackedConsumer({ artifacts: values.artifacts });
	const { temporary, consumer, directory, expected } = packed;
	try {
		const archives = path.join(temporary, 'artifacts');
		if (directory !== archives) {
			mkdirSync(archives);
			for (const manifest of expected) cpSync(path.join(directory, artifactName(manifest)), path.join(archives, artifactName(manifest)));
		}
		const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
		const configuration = {
			...options, output: path.join(temporary, 'evaluations'),
			provenance: {
				commit: git(ROOT, ['rev-parse', 'HEAD']).trim(), node: process.version, platform: process.platform, arch: process.arch,
				consumerLockSha256: digest(path.join(consumer, 'pnpm-lock.yaml')),
				harness: Object.fromEntries(['scripts/agent-evals.mjs', 'scripts/pack-smoke.mjs', 'scripts/repo-utils.mjs', 'scripts/consumer/agent-eval.mjs', 'scripts/consumer/artifact-eval.mjs', 'scripts/consumer/runtime.mjs', 'scripts/consumer/helpers.mjs', 'scripts/agent-eval-checks.mjs', 'examples/create-demo-project.mjs', 'examples/publish-restore/index.mjs', 'agent/evals/tasks.json'].map((file) => [file, digest(path.join(ROOT, file))])),
				artifacts: expected.map((manifest) => ({ name: manifest.name, version: manifest.version, file: artifactName(manifest), sha256: digest(path.join(directory, artifactName(manifest))) })),
			},
		};
		const configPath = path.join(consumer, 'evaluation.json');
		writeFileSync(configPath, `${JSON.stringify(configuration, null, 2)}\n`);
		runCommand(consumer, process.execPath, ['agent-eval.mjs', configPath], {
			env: consumerEnvironment(), timeout: (options.timeoutSeconds + 30) * options.tasks.length * 1000,
		});
	} finally {
		// All runs, including failures and their original tarballs, remain reproducible outside the checkout.
		console.log(`[agent-eval] Evidence retained: ${temporary}`);
	}
}

if (isMain(import.meta.url)) {
	try {
		const { values } = parseArgs({ options: Object.fromEntries(['runner', 'codex', 'model', 'case', 'artifacts', 'timeout-seconds'].map((name) => [name, { type: 'string' }])) });
		agentEvaluations(values);
	} catch (error) { console.error(error.message); process.exitCode = 1; }
}
