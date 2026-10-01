import { parseArgs } from 'node:util';
import { isMain, pnpmInvocation, ROOT, runCommand } from './repo-utils.mjs';

export function ciCommands(browserDeps = false) {
	return [
		['refs:verify'],
		['lint:ci'],
		['typecheck'],
		['check:agent-links'],
		['pack:check', ...(browserDeps ? ['--browser-deps'] : [])],
		['test:repo'],
		['test'],
		['docs:build'],
	];
}

if (isMain(import.meta.url)) {
	try {
		const { values } = parseArgs({ options: { 'browser-deps': { type: 'boolean' } } });
		for (const args of ciCommands(values['browser-deps'])) {
			runCommand(ROOT, ...pnpmInvocation(process.env.npm_execpath, args));
		}
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
