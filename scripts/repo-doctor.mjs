import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { git, isMain, readJson, ROOT } from './repo-utils.mjs';

export function inspectReferences(root, requiredLocal) {
	const manifest = readJson(path.join(root, 'references.json'));
	const configured = git(root, ['config', '-f', '.gitmodules', '--get-regexp', '^submodule[.].*[.]path$'])
		.trim().split('\n').map((line) => {
			const separator = line.indexOf(' ');
			return { key: line.slice(0, separator - '.path'.length), path: line.slice(separator + 1).trim() };
		});
	const entries = configured.map((config) => {
		const entry = manifest.submodules.find((item) => item.path === config.path);
		const url = git(root, ['config', '-f', '.gitmodules', '--get', `${config.key}.url`]).trim();
		const index = git(root, ['ls-files', '--stage', '--', config.path]);
		const expectedCommit = /^160000 ([\da-f]+) 0\t/m.exec(index)?.[1];
		let status = expectedCommit && entry ? 'missing' : 'unregistered';
		let actualCommit;
		if (entry && expectedCommit && existsSync(path.join(root, config.path, '.git'))) {
			actualCommit = git(path.join(root, config.path), ['rev-parse', 'HEAD']).trim();
			status = actualCommit !== expectedCommit ? 'mismatch'
				: !existsSync(path.join(root, config.path, entry.probe)) ? 'incomplete'
					: git(path.join(root, config.path), ['status', '--porcelain']).trim() ? 'dirty' : 'ready';
		}
		return { path: config.path, url, expectedCommit, actualCommit, status, authority: entry?.authority };
	});
	for (const entry of manifest.submodules) {
		if (!entries.some((item) => item.path === entry.path)) entries.push({ path: entry.path, status: 'unregistered' });
	}
	const local = manifest.local.map((entry) => ({
		...entry,
		// Local copies have no recorded provenance. Presence alone is never evidence of a verified version.
		status: entry.paths.every((file) => existsSync(path.join(root, file))) ? 'unverified' : 'missing',
	}));
	if (requiredLocal && !local.some((entry) => entry.id === requiredLocal)) throw new Error(`Unknown reference id: ${requiredLocal}`);
	return {
		ok: entries.length > 0 && entries.every((entry) => entry.status === 'ready') && !requiredLocal,
		submodules: entries, local,
		...(requiredLocal ? { blocked: `Reference ${requiredLocal} requires maintainer provenance and task-specific verification; local presence is not sufficient.` } : {}),
	};
}

export function inspectEnvironment(root, { nodeVersion, pnpmVersion }) {
	const manifest = readJson(path.join(root, 'package.json'));
	const recommended = readFileSync(path.join(root, '.node-version'), 'utf8').trim();
	const minimum = Number(/^>=(\d+)$/.exec(manifest.engines.node)?.[1]);
	const major = Number(nodeVersion.replace(/^v/, '').split('.')[0]);
	const expectedPnpm = manifest.packageManager.replace(/^pnpm@/, '');
	return [
		{ id: 'node', status: major >= minimum ? 'ok' : 'error', actual: nodeVersion, required: manifest.engines.node },
		{ id: 'development-node', status: major === Number(recommended) ? 'ok' : 'warning', recommended,
			message: 'Recommended development major; the package support range and CI matrix remain separate.' },
		{ id: 'pnpm', status: pnpmVersion === expectedPnpm ? 'ok' : 'error', actual: pnpmVersion ?? 'unavailable', required: expectedPnpm },
	];
}

function exportPaths(value) {
	if (typeof value === 'string') return [value];
	return Object.values(value ?? {}).flatMap(exportPaths);
}

export function inspectBuilds(root) {
	const checks = [];
	for (const entry of readdirSync(path.join(root, 'packages'), { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const directory = path.join(root, 'packages', entry.name);
		const manifest = readJson(path.join(directory, 'package.json'));
		if (!manifest.scripts?.build) continue;
		const missing = [...new Set(exportPaths(manifest.exports ?? manifest.main).concat(exportPaths(manifest.bin)))]
			.filter((file) => !existsSync(path.join(directory, file)));
		// CLI's bin is a source bootstrap; its emitted implementation must also exist.
		if (!existsSync(path.join(directory, 'dist'))) missing.push('dist/');
		if (manifest.name === '@openfairygui/cli' && !existsSync(path.join(directory, 'dist/cli.mjs'))) missing.push('dist/cli.mjs');
		checks.push({ id: `build:${manifest.name}`, status: missing.length ? 'error' : 'ok', missing });
	}
	return checks;
}

export function doctor(root) {
	let pnpmVersion = /\bpnpm\/([^ ]+)/.exec(process.env.npm_config_user_agent ?? '')?.[1];
	if (!pnpmVersion) {
		try { pnpmVersion = execFileSync('pnpm', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 }).trim(); }
		catch { /* Report missing/unverifiable pnpm below; never install or change machine configuration. */ }
	}
	const checks = inspectEnvironment(root, { nodeVersion: process.version, pnpmVersion });
	checks.push({ id: 'dependencies', status: existsSync(path.join(root, 'node_modules')) ? 'ok' : 'error' });
	checks.push(...inspectBuilds(root));
	try {
		const sharp = createRequire(path.join(root, 'package.json'))('sharp');
		checks.push({ id: 'sharp', status: 'ok', version: sharp.versions.sharp });
	} catch {
		checks.push({ id: 'sharp', status: 'warning', message: 'Native image capability unavailable; publish/image checks are not proven. Restore dependencies before those tasks.' });
	}
	try {
		accessSync(tmpdir(), constants.W_OK);
		checks.push({ id: 'temp-directory', status: 'ok', message: 'Permission check only; doctor does not create files.' });
	} catch { checks.push({ id: 'temp-directory', status: 'error' }); }
	const references = inspectReferences(root);
	return {
		ok: references.ok && !checks.some((check) => check.status === 'error'), checks, references,
		next: references.ok ? 'pnpm check:ci (full) or pnpm check:fast (impact-selected; not full)' : 'pnpm refs:status; pnpm refs:sync; pnpm refs:verify',
		boundary: 'Export files checked only. Node/Web behavior is covered by package tests, not by doctor.',
	};
}

if (isMain(import.meta.url)) {
	const json = process.argv.includes('--json');
	try {
		const { values, positionals } = parseArgs({ allowPositionals: true, options: {
			json: { type: 'boolean' }, strict: { type: 'boolean' }, require: { type: 'string' },
		} });
		if (positionals.length > 1 || (positionals[0] && positionals[0] !== 'refs')) throw new Error('Usage: repo-doctor.mjs [refs] [--json] [--strict] [--require reference-id]');
		const refsOnly = positionals[0] === 'refs';
		if (!refsOnly && (values.strict || values.require)) throw new Error('--strict and --require apply to refs only.');
		const report = refsOnly ? inspectReferences(ROOT, values.require) : doctor(ROOT);
		if (json) console.log(JSON.stringify(report, null, 2));
		else {
			for (const check of report.checks ?? []) console.log(`${check.status}: ${check.id} ${JSON.stringify(check)}`);
			const refs = refsOnly ? report : report.references;
			for (const entry of refs.submodules) console.log(`${entry.status}: ${entry.path} (expected ${entry.expectedCommit ?? 'gitlink missing'})`);
			for (const entry of refs.local) console.log(`optional/${entry.status}: ${entry.id} — ${entry.acquire}`);
			if (report.blocked) console.log(report.blocked);
			console.log(report.next ?? 'Sources: .gitmodules; pins: Git index gitlinks. Use pnpm refs:sync to initialize, never --remote.');
		}
		if ((!refsOnly || values.strict || values.require) && !report.ok) process.exitCode = 1;
	} catch (error) {
		if (json) console.log(JSON.stringify({ ok: false, error: error.message }));
		else console.error(error.message);
		process.exitCode = 1;
	}
}
