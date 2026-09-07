import path from 'node:path';
import { inspectReferences } from './repo-doctor.mjs';
import { git, isMain, ROOT } from './repo-utils.mjs';

export function grepReferences(root, pattern) {
	if (typeof pattern !== 'string' || !pattern || /[\r\n\0]/.test(pattern)) throw new Error('Expected one non-empty, single-line literal search string.');
	const references = inspectReferences(root);
	if (!references.ok) throw new Error('Required references are not ready. Run pnpm refs:status and reconcile missing, dirty or mismatched fixtures before searching.');
	const lines = references.submodules.flatMap((entry) => {
		let output;
		try {
			output = git(path.join(root, entry.path), ['--no-optional-locks', '-c', 'core.quotePath=false', 'grep', '--no-color', '--no-column', '--no-heading', '--no-break', '--no-textconv', '-n', '-I', '-F', '-e', pattern, '--']);
		} catch (error) {
			if (error.status === 1) return []; // Git's no-match status, not a missing/broken reference.
			throw error;
		}
		return output.replace(/\r?\n$/, '').split(/\r?\n/).map((line) => `${entry.path}/${line}`);
	});
	if (Buffer.byteLength(lines.join('\n'), 'utf8') > 64 * 1024) throw new Error('Reference matches exceed 64 KiB; narrow the literal or use native Git/rg in a verified source directory. No partial results returned.');
	return lines;
}

if (isMain(import.meta.url)) {
	try {
		if (process.argv.length !== 3) throw new Error('Usage: pnpm refs:grep "literal text"');
		const lines = grepReferences(ROOT, process.argv[2]);
		if (lines.length) console.log(lines.join('\n'));
		process.exitCode = lines.length ? 0 : 1;
	} catch (error) { console.error(error.message); process.exitCode = 2; }
}
