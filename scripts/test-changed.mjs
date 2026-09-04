import path from 'node:path';
import { parseArgs } from 'node:util';
import { git, isMain, matches, nulLines, pnpmInvocation, readJson, ROOT, runCommand, testFiles } from './repo-utils.mjs';
import { inspectReferences } from './repo-doctor.mjs';

export function changedFiles(root, base) {
	const resolvedBase = base || (process.env.GITHUB_BASE_REF
		? `refs/remotes/origin/${process.env.GITHUB_BASE_REF}`
		: git(root, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']).trim());
	const commit = git(root, ['rev-parse', '--verify', '--end-of-options', `${resolvedBase}^{commit}`]).trim();
	const ancestor = git(root, ['merge-base', 'HEAD', commit]).trim();
	return [...new Set([
		...nulLines(git(root, ['diff', '--name-only', '--no-renames', '-z', ancestor, 'HEAD', '--'])),
		...nulLines(git(root, ['diff', '--cached', '--name-only', '--no-renames', '-z', '--'])),
		...nulLines(git(root, ['diff', '--name-only', '--no-renames', '-z', '--'])),
		...nulLines(git(root, ['ls-files', '--others', '--exclude-standard', '-z'])),
	])].sort();
}

export function selectTests(map, files, available, fallbackReason) {
	const groups = new Set();
	const docs = new Set();
	let reason = fallbackReason;
	for (const file of files) {
		const rule = map.rules.find((entry) => entry.paths.some((pattern) => matches(file, pattern)));
		if (!rule) reason = `Unmapped path: ${file}`;
		else {
			for (const group of rule.tests) groups.add(group);
			for (const doc of rule.docs) docs.add(doc);
		}
	}
	if (files.length === 0 && !reason) reason = 'No changes found; run the full suite rather than report an empty test success.';
	if (reason) for (const group of Object.keys(map.tests)) groups.add(group);
	const selected = new Set();
	for (const group of groups) {
		if (!map.tests[group]) throw new Error(`Unknown test group: ${group}`);
		const matching = available.filter((file) => matches(file, map.tests[group]));
		if (matching.length === 0) throw new Error(`Empty test group: ${group} (${map.tests[group]})`);
		for (const file of matching) selected.add(file);
	}
	if (reason && selected.size !== available.length) throw new Error('Full fallback does not cover every test file. Update the impact map.');
	return {
		scope: reason ? 'full' : selected.size === 0 ? 'repository-only' : 'selected',
		reason: reason ?? 'Impact-map selection; not a replacement for check:ci.',
		changedFiles: files, tests: [...selected].sort(), docs: [...docs].sort(),
	};
}

export function impactTable(map) {
	return [
		'| 改动路径 | AVA 测试组（含下游） | 需审查的文档 |',
		'|---|---|---|',
		...map.rules.map((rule) => `| ${rule.paths.map((value) => `\`${value}\``).join(', ')} | ${rule.tests.join(', ') || '仅仓库检查'} | ${rule.docs.map((value) => `\`${value}\``).join(', ')} |`),
	].join('\n');
}

export function runSelectedTests(root, pnpmCli, files) {
	if (files.length === 0) return;
	// Built CLI/MCP/backend tests also load workspace dependencies from dist.
	runCommand(root, ...pnpmInvocation(pnpmCli, ['build']));
	// pnpm's AVA shim supplies NODE_PATH needed by existing isolated-build tests.
	runCommand(root, ...pnpmInvocation(pnpmCli, ['exec', 'ava', '--no-worker-threads', ...files]));
}

if (isMain(import.meta.url)) {
	try {
		const { values } = parseArgs({ options: { base: { type: 'string' }, list: { type: 'boolean' }, matrix: { type: 'boolean' } } });
		const map = readJson(path.join(ROOT, 'agent/impact-map.json'));
		if (values.matrix) console.log(impactTable(map));
		else {
			let files = [];
			let reason;
			try { files = changedFiles(ROOT, values.base); }
			catch { reason = 'Cannot resolve comparison base/history; selecting the full suite. Use --base with an available Git ref.'; }
			const plan = selectTests(map, files, testFiles(ROOT), reason);
			console.log(JSON.stringify(plan, null, 2));
			if (!values.list) {
				runCommand(ROOT, process.execPath, ['--test', 'scripts/repository.test.mjs']);
				runCommand(ROOT, process.execPath, ['scripts/check-guidance.mjs']);
				if (plan.tests.length > 0) {
					const refs = inspectReferences(ROOT);
					if (!refs.ok) throw new Error('Required fixtures are not ready. Run pnpm refs:status, then pnpm refs:sync / pnpm refs:verify.');
					runSelectedTests(ROOT, process.env.npm_execpath, plan.tests);
				}
			}
		}
	} catch (error) { console.error(error.message); process.exitCode = 1; }
}
