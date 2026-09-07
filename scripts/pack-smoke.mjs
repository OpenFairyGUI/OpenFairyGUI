import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { isMain, pnpmInvocation, readJson, ROOT, runCommand } from './repo-utils.mjs';

export const PACKAGES = ['core', 'functions', 'backend', 'cli', 'mcp'];

export function consumerEnvironment(environment = process.env) {
	return Object.fromEntries(Object.entries(environment).filter(([key]) => !/^(NODE_PATH|NODE_OPTIONS|TSX_TSCONFIG_PATH|TS_NODE_PROJECT|TS_NODE_COMPILER_OPTIONS|OPENFAIRYGUI_ALLOWED_PROJECT_ROOTS)$/i.test(key)));
}

export function artifactName(manifest) {
	return `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
}

export function preparePackedConsumer({ artifacts } = {}) {
	const pnpmCli = process.env.npm_execpath;
	pnpmInvocation(pnpmCli, []); // Fail before creating files when invoked without pnpm.
	const temporary = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'ofgui-consumer-')));
	const relative = path.relative(realpathSync.native(ROOT), temporary);
	assert(relative.startsWith('..') || path.isAbsolute(relative), 'Consumer must be outside the repository');
	const env = consumerEnvironment();
	const command = (cwd, binary, args) => runCommand(cwd, binary, args, {
		env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000, maxBuffer: 32 * 1024 * 1024,
	});
	const pnpm = (cwd, args) => command(cwd, ...pnpmInvocation(pnpmCli, args));
	const json = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
	try {
		console.log('[consumer] Verify canonical contract snapshot and documentation');
		pnpm(ROOT, ['contracts:check']);
		const expected = PACKAGES.map((name) => readJson(path.join(ROOT, 'packages', name, 'package.json')));
		const directory = artifacts ? path.resolve(ROOT, artifacts) : path.join(temporary, 'artifacts');
		if (!artifacts) {
			console.log('[consumer] Build current workspace');
			pnpm(ROOT, ['build']);
			mkdirSync(directory);
			for (const manifest of expected) {
				console.log(`[consumer] Pack ${manifest.name}@${manifest.version}`);
				pnpm(path.join(ROOT, manifest.repository.directory), ['pack', '--out', path.join(directory, artifactName(manifest))]);
			}
		}
		const dependencies = { ...readJson(path.join(ROOT, 'examples/package.json')).dependencies, ...Object.fromEntries(expected.map((manifest) => {
			const archive = path.join(directory, artifactName(manifest));
			assert(existsSync(archive), `Missing release artifact: ${archive}`);
			return [manifest.name, `file:${archive.replaceAll('\\', '/')}`];
		})) };
		const consumer = path.join(temporary, 'app');
		mkdirSync(consumer);
		json(path.join(consumer, 'package.json'), { name: 'ofgui-isolated-consumer', private: true, type: 'module', dependencies, pnpm: { overrides: dependencies } });
		writeFileSync(path.join(consumer, '.npmrc'), 'hoist=false\nlink-workspace-packages=false\nprefer-workspace-packages=false\n');
		json(path.join(consumer, 'expected.json'), expected);
		for (const name of ['runtime.mjs', 'tooling.mjs', 'agent-eval.mjs', 'artifact-eval.mjs', 'browser-check.mjs']) cpSync(path.join(ROOT, 'scripts/consumer', name), path.join(consumer, name));
		cpSync(path.join(ROOT, 'scripts/agent-eval-checks.mjs'), path.join(consumer, 'agent-eval-checks.mjs'));
		cpSync(path.join(ROOT, 'agent/evals/tasks.json'), path.join(consumer, 'evaluation-tasks.json'));
		cpSync(path.join(ROOT, 'examples'), path.join(consumer, 'examples'), {
			recursive: true, filter: (file) => !file.split(path.sep).some((part) => part === 'node_modules' || part === 'package-lock.json' || part === 'pnpm-lock.yaml'),
		});
		console.log('[consumer] Install tarballs and production dependencies (no workspace or test tools)');
		pnpm(consumer, ['install', '--prod', '--ignore-scripts', '--no-frozen-lockfile']);
		return { temporary, consumer, expected, directory, command, pnpm };
	} catch (error) {
		console.error(`[consumer] Preserved diagnostic project: ${temporary}`);
		throw error;
	}
}

export function packSmoke({ artifacts, keep = false, 'browser-deps': browserDeps = false } = {}) {
	const { temporary, consumer, command, pnpm } = preparePackedConsumer({ artifacts });
	const json = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
	let passed = false;
	try {
		console.log(command(consumer, process.execPath, ['runtime.mjs']).trim());
		console.log(command(consumer, process.execPath, ['agent-eval.mjs', '--reference']).trim());
		const require = createRequire(import.meta.url);
		const compiler = require('typescript/package.json');
		const viteRequire = createRequire(createRequire(require.resolve('vitepress')).resolve('vite'));
		const devDependencies = {
			typescript: `npm:${compiler.name}@${compiler.version}`,
			'@types/node': require('@types/node/package.json').version,
			zod: createRequire(realpathSync(path.join(consumer, 'node_modules/@openfairygui/mcp/package.json')))('zod/package.json').version,
			esbuild: viteRequire('esbuild/package.json').version,
			playwright: '1.63.0',
		};
		const manifest = readJson(path.join(consumer, 'package.json'));
		json(path.join(consumer, 'package.json'), { ...manifest, devDependencies });
		console.log('[consumer] Install declared, version-pinned consumer tooling');
		// esbuild needs its own install script; all packages are ordinary public registry dependencies.
		pnpm(consumer, ['install', '--no-frozen-lockfile', '--config.ignore-scripts=false']);
		console.log(command(consumer, process.execPath, ['tooling.mjs']).trim());
		console.log('[consumer] Install pinned Chromium headless shell (external browser cache)');
		pnpm(consumer, ['exec', 'playwright', 'install', 'chromium', '--only-shell', ...(browserDeps && process.platform === 'linux' ? ['--with-deps'] : [])]);
		console.log(command(consumer, process.execPath, ['browser-check.mjs']).trim());
		console.log('[consumer] PASS: five tarballs, Node ESM/CJS, types, real Chromium storage, CLI, MCP, examples and deterministic evaluation checks');
		passed = true;
	} finally {
		if (!passed || keep) console.log(`[consumer] Preserved diagnostic project: ${temporary}`);
		else rmSync(temporary, { recursive: true, force: true }); // Exact directory created above, outside the checkout.
	}
}

if (isMain(import.meta.url)) {
	try {
		const { values } = parseArgs({ options: { artifacts: { type: 'string' }, keep: { type: 'boolean' }, 'browser-deps': { type: 'boolean' } } });
		packSmoke(values);
	} catch (error) { console.error(error.message); process.exitCode = 1; }
}
