import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
export const git = (root, args) => execFileSync('git', args, {
	cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
});
export const nulLines = (text) => text.split('\0').filter(Boolean);
export const isMain = (url) => process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(url);

export function repositoryFiles(root) {
	return [...new Set(nulLines(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])))];
}

export function matches(file, pattern) {
	// Only *, ** and **/ are supported; the impact map deliberately has no glob-language dependency.
	const expression = pattern.split(/(\*\*\/|\*\*|\*)/).map((part) => (
		part === '**/' ? '(?:.*/)?' : part === '**' ? '.*' : part === '*' ? '[^/]*'
			: part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	)).join('');
	return new RegExp(`^${expression}$`).test(file);
}

export function testFiles(root) {
	const files = [];
	function visit(directory) {
		if (!existsSync(path.join(root, directory))) return;
		for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
			const file = `${directory}/${entry.name}`;
			if (entry.isDirectory() && entry.name !== 'fixtures') visit(file);
			else if (entry.isFile() && entry.name.endsWith('.test.ts')) files.push(file);
		}
	}
	for (const entry of readdirSync(path.join(root, 'packages'), { withFileTypes: true })) {
		if (entry.isDirectory()) visit(`packages/${entry.name}/test`);
	}
	return files.sort();
}

export function pnpmInvocation(pnpmCli, args) {
	if (!pnpmCli) throw new Error('Execute through pnpm test:changed or pnpm pack:check; direct Node invocation is for inspection only.');
	return /\.[cm]?js$/i.test(pnpmCli) ? [process.execPath, [pnpmCli, ...args]] : [pnpmCli, args];
}

export function runCommand(root, command, args, options = {}) {
	const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
	if (result.error) throw result.error;
	if (result.status !== 0) {
		if (result.stdout) process.stdout.write(result.stdout);
		if (result.stderr) process.stderr.write(result.stderr);
		throw new Error(`Check failed (${result.signal ?? result.status}): ${command} ${args[0]}`);
	}
	return result.stdout;
}
