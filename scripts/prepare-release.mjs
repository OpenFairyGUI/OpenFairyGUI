import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { changelogStructure } from './check-guidance.mjs';
import { isMain, readJson, ROOT } from './repo-utils.mjs';

export function releaseNotes(root, tag) {
	if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag ?? ''))
		throw new Error('Expected a version tag such as v1.2.3.');
	for (const directory of ['core', 'functions', 'backend', 'cli', 'mcp']) {
		const manifest = readJson(path.join(root, 'packages', directory, 'package.json'));
		if (`v${manifest.version}` !== tag)
			throw new Error(`${manifest.name}@${manifest.version} does not match ${tag}.`);
	}
	const texts = ['CHANGELOG.md', 'CHANGELOG_CN.md'].map((file) => readFileSync(path.join(root, file), 'utf8'));
	const structures = texts.map(changelogStructure);
	assert.deepEqual(
		structures[0],
		structures[1],
		'Bilingual changelog versions, links, categories and item counts must match.',
	);
	const entry = structures[0].find((item) => item.version === tag);
	if (!entry || !entry.categories.some((category) => category.count > 0))
		throw new Error(`Missing nonempty bilingual changelog entry for ${tag}.`);
	const sections = texts.map((text) => {
		const lines = text.split(/\r?\n/);
		const start = lines.findIndex((line) => line.match(/^### (v[^ （(]+)/)?.[1] === tag);
		if (start < 0) throw new Error(`Missing changelog heading for ${tag}.`);
		let end = start + 1;
		while (end < lines.length && !/^#{2,3} /.test(lines[end])) end++;
		return lines.slice(start, end).join('\n').trim();
	});
	return `## English\n\n${sections[0]}\n\n## 中文\n\n${sections[1]}\n`;
}

if (isMain(import.meta.url)) {
	try {
		const { values } = parseArgs({
			options: { tag: { type: 'string' }, out: { type: 'string', default: '.release' } },
		});
		if (process.env.GITHUB_ACTIONS === 'true' && process.env.RELEASE_REF_TYPE !== 'tag')
			throw new Error('Release must run from a tag.');
		const notes = releaseNotes(ROOT, values.tag ?? process.env.RELEASE_TAG);
		mkdirSync(values.out, { recursive: true });
		writeFileSync(path.join(values.out, 'release-notes.md'), notes);
		console.log('Release versions and bilingual changelog verified.');
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
