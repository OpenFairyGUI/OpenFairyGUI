import { parseArgs } from 'node:util';
import { isMain, pnpmInvocation, ROOT, runCommand } from './repo-utils.mjs';

export function ciCommands(browserDeps = false, artifacts = undefined) {
	const packArgs = ['pack:check'];
	if (artifacts) packArgs.push('--artifacts', artifacts);
	if (browserDeps) packArgs.push('--browser-deps');
	return [
		['refs:verify'],
		['lint:ci'],
		['typecheck'],
		['docs:check'],
		packArgs,
		['test:repo'],
		['test'],
		['docs:build'],
	];
}

if (isMain(import.meta.url)) {
	try {
		const { values } = parseArgs({
			options: {
				'browser-deps': { type: 'boolean' },
				artifacts: { type: 'string' },
			},
		});
		if (values.artifacts !== undefined && !values.artifacts.trim())
			throw new Error('--artifacts must be a non-empty directory path.');
		for (const args of ciCommands(values['browser-deps'], values.artifacts)) {
			runCommand(ROOT, ...pnpmInvocation(process.env.npm_execpath, args));
		}
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
