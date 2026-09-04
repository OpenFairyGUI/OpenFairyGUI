import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { avaInvocation, changedFiles, impactTable, selectTests } from './test-changed.mjs';
import { checkCommands, checkGuidance, changelogStructure, markdownCode, markdownLinks, resolveLink } from './check-guidance.mjs';
import { inspectBuilds, inspectEnvironment, inspectReferences } from './repo-doctor.mjs';
import { git, matches, readJson, ROOT, testFiles } from './repo-utils.mjs';

function temporaryRepository(t) {
	const root = mkdtempSync(path.join(tmpdir(), 'ofgui-repo-test-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	git(root, ['init', '--quiet']);
	git(root, ['config', 'core.autocrlf', 'false']);
	return root;
}

function write(root, file, contents) {
	mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
	writeFileSync(path.join(root, file), contents);
}

function commit(root) {
	git(root, ['add', '--all']);
	git(root, ['-c', 'user.name=Repository Test', '-c', 'user.email=repo-test@example.invalid', 'commit', '--quiet', '--no-gpg-sign', '-m', 'test fixture']);
	return git(root, ['rev-parse', 'HEAD']).trim();
}

const map = readJson(path.join(ROOT, 'agent/impact-map.json'));
const available = testFiles(ROOT);

test('impact patterns cover both flat and nested tests without interpreting regex characters', () => {
	assert(matches('packages/core/test/a.test.ts', 'packages/core/test/**/*.test.ts'));
	assert(matches('packages/core/test/nested/a.test.ts', 'packages/core/test/**/*.test.ts'));
	assert(!matches('packages/core/test/nested/a.test.ts', 'packages/core/test/*.test.ts'));
	assert(!matches('scripts/badXmjs', 'scripts/bad.mjs'));
});

test('impact selection includes downstream consumers and conservatively falls back', () => {
	const backend = selectTests(map, ['packages/backend/src/runtime.ts'], available);
	assert(backend.tests.some((file) => file.startsWith('packages/mcp/')));
	assert(backend.tests.some((file) => file.startsWith('packages/cli/')));
	assert(!backend.tests.some((file) => file.startsWith('packages/functions/')));
	for (const files of [[], ['pnpm-lock.yaml'], ['package.json'], ['new-unknown/file.ts']]) {
		const plan = selectTests(map, files, available);
		assert.equal(plan.scope, 'full');
		assert.deepEqual(plan.tests, available);
	}
	assert.deepEqual(selectTests(map, [], available, 'base unavailable').tests, available);
	assert.equal(selectTests(map, ['docs/guide/getting-started.md'], available).scope, 'repository-only');
	assert.deepEqual(selectTests(map, ['docs/.vitepress/config.ts'], available).tests, available);
});

test('empty, unknown and incomplete full-test groups are errors', () => {
	assert.throws(() => selectTests({ ...map, tests: { ...map.tests, typo: 'missing/*.test.ts' } }, [], available), /Empty test group/);
	assert.throws(() => selectTests({ tests: {}, rules: [{ paths: ['**'], tests: ['typo'], docs: [] }] }, ['x'], available), /Unknown test group/);
	assert.throws(() => selectTests(map, [], [...available, 'packages/new/test/a.test.ts']), /does not cover every test/);
	assert(impactTable(map).includes('core, functions, backend, cli, mcp'));
});

test('Git selection includes committed, staged, unstaged, untracked, renamed and deleted paths', (t) => {
	const root = temporaryRepository(t);
	for (const file of ['staged.txt', 'working.txt', 'old name.txt', 'deleted.txt']) write(root, file, 'baseline');
	const base = commit(root);
	write(root, 'committed.txt', 'committed');
	commit(root);
	write(root, 'staged.txt', 'staged');
	git(root, ['add', '--', 'staged.txt']);
	write(root, 'working.txt', 'working');
	write(root, 'untracked 中文.txt', 'new');
	renameSync(path.join(root, 'old name.txt'), path.join(root, 'new name.txt'));
	rmSync(path.join(root, 'deleted.txt'));
	assert.deepEqual(changedFiles(root, base), ['committed.txt', 'deleted.txt', 'new name.txt', 'old name.txt', 'staged.txt', 'untracked 中文.txt', 'working.txt'].sort());
	assert.throws(() => changedFiles(root, 'nonexistent-ref'));
});

test('invalid comparison base produces a non-empty full plan via the real CLI', () => {
	const result = JSON.parse(execFileSync(process.execPath, ['scripts/test-changed.mjs', '--base', 'refs/heads/does-not-exist', '--list'], { cwd: ROOT, encoding: 'utf8' }));
	assert.equal(result.scope, 'full');
	assert.deepEqual(result.tests, available);
});

test('AVA selection preserves pnpm shims instead of executing the raw JS entrypoint', () => {
	const files = ['packages/backend/test/browser-entry.contract.test.ts'];
	assert.deepEqual(avaInvocation('/tools/pnpm.cjs', files), [process.execPath, ['/tools/pnpm.cjs', 'exec', 'ava', '--no-worker-threads', ...files]]);
	assert.deepEqual(avaInvocation('/tools/pnpm', files), ['/tools/pnpm', ['exec', 'ava', '--no-worker-threads', ...files]]);
	assert.throws(() => avaInvocation(undefined, files), /pnpm test:changed/);
});

test('local links cover Markdown and HTML, ignore code examples and reject broken/escaping paths', (t) => {
	const root = temporaryRepository(t);
	write(root, 'docs/guide/start.md', '# Start');
	write(root, 'docs/public/logo.svg', '<svg/>');
	const markdown = '[start](/guide/start)\n[x][id]\n[id]: /guide/start\n<img src="../public/logo.svg">\n```md\n[example](missing.md)\n```';
	assert.deepEqual(markdownLinks(markdown), ['/guide/start', '/guide/start', '../public/logo.svg']);
	assert.equal(resolveLink(root, 'docs/guide/development.md', '/guide/start#heading'), 'docs/guide/start.md');
	assert.equal(resolveLink(root, 'docs/guide/development.md', 'https://example.com'), null);
	assert.equal(resolveLink(root, 'docs/guide/development.md', '/api/'), null);
	assert.throws(() => resolveLink(root, 'README.md', 'missing.md'), /Broken link/);
	assert.throws(() => resolveLink(root, 'README.md', '../outside.md'), /escapes repository/);
});

test('only documented code commands are checked, not prose mentioning pnpm', () => {
	const scripts = { check: 'node check.mjs' };
	checkCommands(markdownCode('Prepare pnpm using local tools. Run `pnpm check`.\n```bash\npnpm install --frozen-lockfile\n```'), scripts);
	assert.throws(() => checkCommands(markdownCode('`pnpm run missing`'), scripts), /Unknown pnpm command/);
	assert.throws(() => checkCommands(markdownCode('```bash\npnpm missing\n```'), scripts), /Unknown pnpm command/);
});

test('bilingual changelog checks versions, release URLs, categories and item counts', () => {
	const en = '## Unreleased\nOther:\n- pending\n### v1.2.3 ([Release](https://github.com/a/b/releases/tag/v1.2.3))\nFixes:\n- fixed';
	const cn = '## 未发布\n其他：\n- 待发布\n### v1.2.3（[发布页](https://github.com/a/b/releases/tag/v1.2.3)）\n修复：\n- 修复';
	assert.deepEqual(changelogStructure(en), changelogStructure(cn));
	assert.notDeepEqual(changelogStructure(en), changelogStructure(`${cn}\n- 额外项目`));
	assert.throws(() => changelogStructure(cn.replace('tag/v1.2.3', 'tag/v1.2.2')), /release link/);
	assert.throws(() => changelogStructure(`${en}\n### v1.2.3 ([Release](https://github.com/a/b/releases/tag/v1.2.3))`), /Duplicate/);
});

function referenceFixture(t, initialized = true) {
	const root = temporaryRepository(t);
	const fixturePath = 'fixtures/sample';
	const child = path.join(root, fixturePath);
	const manifest = { submodules: [{ path: fixturePath, probe: 'project.fairy', authority: 'fixture' }],
		local: [{ id: 'legacy-editor', paths: ['referer/Editor'], source: null, revision: null, authority: 'legacy', acquire: 'Ask maintainer' }] };
	write(root, 'references.json', JSON.stringify(manifest));
	write(root, '.gitmodules', `[submodule "named-reference"]\n\tpath = ${fixturePath}\n\turl = https://example.invalid/fixture.git\n`);
	let sha = '1'.repeat(40);
	if (initialized) {
		mkdirSync(child, { recursive: true });
		git(child, ['init', '--quiet']);
		git(child, ['config', 'core.autocrlf', 'false']);
		write(child, 'project.fairy', 'fixture');
		sha = commit(child);
	}
	git(root, ['update-index', '--add', '--cacheinfo', `160000,${sha},${fixturePath}`]);
	return { root, child, fixturePath };
}

test('references use gitlinks and .gitmodules; missing optional corpus does not block ordinary checks', (t) => {
	const { root } = referenceFixture(t);
	const report = inspectReferences(root);
	assert.equal(report.ok, true);
	assert.equal(report.submodules[0].url, 'https://example.invalid/fixture.git');
	assert.equal(report.submodules[0].expectedCommit, report.submodules[0].actualCommit);
	assert.equal(report.local[0].status, 'missing');
	assert.equal(inspectReferences(root, 'legacy-editor').ok, false);
	mkdirSync(path.join(root, 'referer/Editor'), { recursive: true });
	assert.equal(inspectReferences(root, 'legacy-editor').local[0].status, 'unverified');
	assert.throws(() => inspectReferences(root, 'typo'), /Unknown reference/);
});

test('missing, dirty, mismatched and incomplete required fixtures cannot pass', (t) => {
	const missing = referenceFixture(t, false);
	assert.equal(inspectReferences(missing.root).submodules[0].status, 'missing');
	assert.equal(inspectReferences(missing.root).ok, false);
	const { root, child, fixturePath } = referenceFixture(t);
	write(child, 'project.fairy', 'changed');
	assert.equal(inspectReferences(root).submodules[0].status, 'dirty');
	const changed = commit(child);
	assert.equal(inspectReferences(root).submodules[0].status, 'mismatch');
	rmSync(path.join(child, 'project.fairy'));
	const incomplete = commit(child);
	assert.notEqual(changed, incomplete);
	git(root, ['update-index', '--cacheinfo', `160000,${incomplete},${fixturePath}`]);
	assert.equal(inspectReferences(root).submodules[0].status, 'incomplete');
	assert.equal(inspectReferences(root).ok, false);
});

test('doctor separates recommendation from support and detects missing export output', (t) => {
	const root = temporaryRepository(t);
	write(root, 'package.json', JSON.stringify({ engines: { node: '>=20' }, packageManager: 'pnpm@10.14.0' }));
	write(root, '.node-version', '24\n');
	const checks = inspectEnvironment(root, { nodeVersion: 'v22.22.2', pnpmVersion: '10.14.0' });
	assert.equal(checks[0].status, 'ok');
	assert.equal(checks[1].status, 'warning');
	assert.equal(checks[2].status, 'ok');
	assert.equal(inspectEnvironment(root, { nodeVersion: 'v18.0.0' })[0].status, 'error');
	write(root, 'packages/core/package.json', JSON.stringify({ name: '@test/core', scripts: { build: 'build' }, exports: { '.': './dist/index.js' } }));
	assert.equal(inspectBuilds(root)[0].status, 'error');
	write(root, 'packages/core/dist/index.js', 'export {};');
	assert.equal(inspectBuilds(root)[0].status, 'ok');
	write(root, 'packages/cli/package.json', JSON.stringify({ name: '@openfairygui/cli', scripts: { build: 'build' }, bin: { ofgui: 'bin/cli.cjs' } }));
	write(root, 'packages/cli/bin/cli.cjs', '// bootstrap');
	mkdirSync(path.join(root, 'packages/cli/dist'));
	assert(inspectBuilds(root).find((entry) => entry.id === 'build:@openfairygui/cli').missing.includes('dist/cli.mjs'));
	assert(!existsSync(path.join(root, 'node_modules')));
});

test('current guidance, public source mappings and bilingual documentation are consistent', () => {
	const result = checkGuidance(ROOT);
	assert.equal(result.agentFiles, 7);
	assert.equal(result.tests, available.length);
	assert(result.documents > 0);
	assert(readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8').includes(impactTable(map)));
});
