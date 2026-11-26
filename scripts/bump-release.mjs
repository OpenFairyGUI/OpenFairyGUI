import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { isMain, pnpmInvocation, ROOT, runCommand } from './repo-utils.mjs';

const PACKAGES = ['core', 'functions', 'backend', 'cli', 'mcp'];
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function writeJsonPreservingIndent(filePath, data) {
	const raw = readFileSync(filePath, 'utf8');
	const indent = raw.match(/\n(\t+| +)"/)?.[1] ?? '\t';
	const newline = raw.includes('\r\n') ? '\r\n' : '\n';
	const content = `${JSON.stringify(data, null, indent).replaceAll('\n', newline)}${newline}`;
	writeFileSync(filePath, content);
}

export function bumpReleaseVersion(root, version) {
	if (!SEMVER_RE.test(version ?? '')) {
		throw new Error('Expected a semver version without leading "v", such as 0.7.2 or 0.8.0-rc.1.');
	}
	const updated = [];
	for (const directory of PACKAGES) {
		const manifestPath = path.join(root, 'packages', directory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		manifest.version = version;
		writeJsonPreservingIndent(manifestPath, manifest);
		updated.push(path.relative(root, manifestPath).replaceAll('\\', '/'));
	}
	const examplesPath = path.join(root, 'examples', 'package.json');
	const examples = JSON.parse(readFileSync(examplesPath, 'utf8'));
	for (const name of Object.keys(examples.dependencies ?? {})) {
		if (name.startsWith('@openfairygui/')) examples.dependencies[name] = version;
	}
	writeJsonPreservingIndent(examplesPath, examples);
	updated.push('examples/package.json');
	return updated;
}

if (isMain(import.meta.url)) {
	try {
		const { positionals, values } = parseArgs({
			allowPositionals: true,
			options: { 'skip-contracts': { type: 'boolean', default: false } },
		});
		const version = positionals[0];
		const updated = bumpReleaseVersion(ROOT, version);
		console.log(`Updated ${updated.length} manifests to ${version}: ${updated.join(', ')}`);
		if (!values['skip-contracts']) {
			runCommand(ROOT, ...pnpmInvocation(process.env.npm_execpath, ['contracts:generate']));
		}
		console.log(
			`Next steps: update CHANGELOG.md and CHANGELOG_CN.md for v${version}, then run pnpm release:prepare --tag v${version} and pnpm check:ci.`,
		);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
