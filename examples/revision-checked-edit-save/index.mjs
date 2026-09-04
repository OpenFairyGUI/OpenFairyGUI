import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readProjectAsUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { createDemoProject } from '../create-demo-project.mjs';

function data(result) {
	if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
	return result.data;
}

// #region example
export async function editAndSave(projectPath, text = 'Saved by a consumer') {
	const runtime = createNodeBackendRuntime({ allowedProjectRoots: [path.dirname(path.resolve(projectPath))] });
	const opened = data(await runtime.openSession({ projectPath }));
	const sessionId = opened.sessionId;
	try {
		const outline = data(runtime.getProjectOutline({ sessionId }));
		const pkg = outline.packages.find((entry) => entry.name === 'Main');
		const component = pkg?.resources.find((entry) => entry.name === 'MainView' && entry.kind === 'component');
		const title = component?.component?.displayList.find((entry) => entry.name === 'title' && entry.kind === 'text');
		if (!title) throw new Error('This example expects Main/MainView with a text node named title.');
		const selector = { packageId: pkg.id, componentResourceId: component.id, displayNodeId: title.id };
		const current = data(runtime.queryEntity({ sessionId, target: { kind: 'displayNode', selector } }));
		const transaction = {
			sessionId, expectedRevision: current.revision,
			operations: [{ kind: 'setDisplayNodeProps', selector, props: { text } }],
		};
		// Preview executes on an isolated snapshot; apply still rechecks this revision.
		data(await runtime.preflightTransaction(transaction));
		const changed = data(await runtime.applyTransaction(transaction));
		const validation = data(runtime.validateSession({ sessionId }));
		if (validation.status !== 'valid') throw new Error(`Project validation is ${validation.status}.`);
		const saved = data(await runtime.saveSession({ sessionId, expectedRevision: changed.revision }));
		const project = await readProjectAsUam(new NodeIO(), projectPath);
		return { selector, revision: saved.revision, dirty: saved.dirty, project };
	} finally {
		data(await runtime.closeSession({ sessionId }));
	}
}
// #endregion example

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const projectPath = process.argv[2] ?? await createDemoProject();
	console.log(JSON.stringify({ projectPath, ...await editAndSave(projectPath, process.argv[3]) }, null, 2));
}
