import { Document, liftDocumentToUamProject, readProjectAsUam, writeProjectFromUam } from '@openfairygui/core';
import { WebIO, createFileSystemAccessFileSystem } from '@openfairygui/core/web';
import { BackendRuntime, createBackendStorageFileSystem } from '@openfairygui/backend';
import { validateProjectWeb } from '@openfairygui/functions/web';

function data(result) {
	if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
	return result.data;
}

// #region example
export async function createBrowserExample() {
	if (!navigator.storage?.getDirectory || !navigator.locks) throw new Error('This example requires OPFS and Web Locks on localhost or HTTPS.');
	const root = await navigator.storage.getDirectory();
	const fileSystem = createBackendStorageFileSystem(createFileSystemAccessFileSystem(root));
	const io = new WebIO(fileSystem);
	const projectPath = 'openfairygui-example/Example.fairy';
	// Only seed our own missing demo. Serialize first-run initialization across tabs.
	await navigator.locks.request('openfairygui-example:initialize', async () => {
		if (await fileSystem.exists(projectPath)) return;
		const document = new Document();
		document.getRoot().setProjectId('browser-example').setProjectType(0).setVersion('3.0')
			.setSettings({ publish: {}, common: {}, adaptation: {} });
		const pkg = document.createPackage('Main').setId('pkgdemo1');
		const component = document.createComponent('MainView').setId('cmpdemo1').setPath('/').setExported(true).setSize(320, 180);
		component.addChild(document.createGTextField('title').setId('title').setText('Hello browser').setXY(16, 18).setSize(240, 32));
		pkg.addResource(component);
		pkg.addResource(document.createImageResource('pixel').setId('pixel').setPath('/').setFileName('pixel.png').setWidth(2).setHeight(1));
		const project = liftDocumentToUamProject(document);
		const canvas = new OffscreenCanvas(2, 1);
		const context = canvas.getContext('2d');
		context.fillStyle = '#ff0000'; context.fillRect(0, 0, 1, 1);
		context.fillStyle = '#0000ff'; context.fillRect(1, 0, 1, 1);
		project.packages[0].resources.find((resource) => resource.kind === 'image').sourceBytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
		await writeProjectFromUam(io, project, projectPath);
	});
	const runtime = new BackendRuntime({ fileSystem, allowedProjectRoots: ['openfairygui-example'] });
	let sessionId;
	function read() {
		const outline = data(runtime.getProjectOutline({ sessionId }));
		const pkg = outline.packages.find((entry) => entry.name === 'Main');
		const component = pkg?.resources.find((entry) => entry.kind === 'component' && entry.name === 'MainView');
		const title = component?.component?.displayList.find((entry) => entry.kind === 'text' && entry.name === 'title');
		if (!title) throw new Error('Expected Main/MainView/title in this demo; no guessed identifiers.');
		const selector = { packageId: pkg.id, componentResourceId: component.id, displayNodeId: title.id };
		return { selector, ...data(runtime.queryEntity({ sessionId, target: { kind: 'displayNode', selector } })) };
	}
	return {
		runtime, fileSystem, projectPath,
		get sessionId() { return sessionId; },
		async open() {
			if (sessionId) return data(runtime.getSession({ sessionId }));
			const opened = data(await runtime.openSession({ projectPath }));
			sessionId = opened.sessionId;
			return opened;
		},
		async close() {
			if (!sessionId) return;
			const session = data(runtime.getSession({ sessionId }));
			if (session.dirty) throw new Error('Save this demo before closing; unsaved edits will not be discarded.');
			data(await runtime.closeSession({ sessionId })); sessionId = undefined;
		},
		read,
		async edit(text) {
			const current = read();
			const transaction = { sessionId, expectedRevision: current.revision, operations: [{ kind: 'setDisplayNodeProps', selector: current.selector, props: { text } }] };
			data(await runtime.preflightTransaction(transaction));
			return data(await runtime.applyTransaction(transaction));
		},
		async save() {
			return data(await runtime.saveSession({ sessionId, expectedRevision: read().revision }));
		},
		async validate() { return validateProjectWeb(await readProjectAsUam(io, projectPath, { hydrateResourceBytes: true })); },
	};
}
// #endregion example

const output = document.querySelector('output');
let example;
for (const button of document.querySelectorAll('button')) button.addEventListener('click', async () => {
	const buttons = [...document.querySelectorAll('button')];
	buttons.forEach((entry) => { entry.disabled = true; });
	try {
		example ??= await createBrowserExample();
		globalThis.example = example;
		const action = button.dataset.action;
		const result = await example[action](document.querySelector('input').value);
		const current = example.sessionId ? example.read() : undefined;
		output.textContent = JSON.stringify({
			action, projectPath: example.projectPath,
			...(current ? { title: current.entity.properties.text, revision: current.revision, dirty: data(example.runtime.getSession({ sessionId: example.sessionId })).dirty } : { session: 'closed' }),
			...(action === 'validate' ? { validation: result } : {}),
		}, null, 2);
	} catch (error) { output.textContent = error.message; }
	finally { buttons.forEach((entry) => { entry.disabled = false; }); }
});
