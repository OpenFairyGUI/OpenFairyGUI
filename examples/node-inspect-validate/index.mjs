import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeIO } from '@openfairygui/core/node';
import { inspect } from '@openfairygui/functions';
import { validateProjectNode } from '@openfairygui/functions/node';
import { createDemoProject } from '../create-demo-project.mjs';

// #region example
export async function inspectAndValidate(projectPath) {
	const document = await new NodeIO().readProject(projectPath);
	return {
		inspection: inspect(document),
		validation: await validateProjectNode(projectPath),
	};
}
// #endregion example

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const projectPath = process.argv[2] ?? await createDemoProject();
	const result = await inspectAndValidate(projectPath);
	console.log(JSON.stringify({ projectPath, ...result }, null, 2));
	process.exitCode = result.validation.status === 'valid' ? 0 : result.validation.status === 'invalid' ? 1 : 2;
}
