import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { AlignType, AutoSizeType, Document, GraphType, LoaderFillType, liftDocumentToUamProject, readProjectAsUam, writeProjectFromUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { createPublishProject, IMAGE_BYTES } from '../publish-restore/index.mjs';
import { publishRewardPreview } from '../reward-panel-layout/index.mjs';

function data(result) {
	if (!result.ok) throw new Error(result.error.code, { cause: result });
	return result.data;
}

// Seed only: a new project with an existing Label template and two reusable PNG swatches.
export async function createRewardCardProject(parent) {
	const projectPath = await createPublishProject(parent);
	const document = await new NodeIO().readProject(projectPath);
	const main = document.getRoot().listPackages().find((pkg) => pkg.getName() === 'Main');
	const template = document.createComponent('RewardCardTemplate').setId('cardtmpl').setPath('/').setSize(240, 180)
		.setExtensionType('Label').setExported(true);
	template.addChild(document.createGGraph('background').setId('card-bg').setSize(240, 180)
		.setGraphType(GraphType.Rect).setFillColor('#F3F6F4').setLineSize(0).setTouchable(false));
	template.addChild(document.createGLoader('icon').setId('card-icon').setXY(88, 28).setSize(64, 64)
		.setUrl('ui://pkgsharered').setFill(LoaderFillType.Scale).setTouchable(false));
	template.addChild(document.createGTextField('title').setId('card-title').setXY(16, 124).setSize(208, 32)
		.setText('奖励模板').setFontSize(20).setColor('#173B32').setAlign(AlignType.Center).setAutoSize(AutoSizeType.None).setTouchable(false));
	main.addResource(template);
	const project = liftDocumentToUamProject(document);
	for (const resource of project.packages.find((pkg) => pkg.name === 'Shared').resources) {
		if (resource.kind === 'image') resource.sourceBytes = Uint8Array.from(Buffer.from(IMAGE_BYTES[resource.id], 'base64'));
	}
	await writeProjectFromUam(new NodeIO(), project, projectPath);
	return projectPath;
}

// #region example
const cards = [
	{ id: 'cardday1', name: 'DailyRewardCard', title: '每日奖励 ×100', image: 'red' },
	{ id: 'cardweek', name: 'WeeklyRewardCard', title: '连签奖励 ×500', image: 'blue' },
	{ id: 'cardbon1', name: 'BonusRewardCard', title: '额外奖励 ×20', image: 'red' },
];

export async function generateRewardCards(projectPath, runtime = createNodeBackendRuntime({
	allowedProjectRoots: [path.dirname(path.resolve(projectPath))],
})) {
	const { sessionId } = data(await runtime.openSession({ projectPath }));
	let keepOpen = false;
	try {
		const outline = data(await runtime.getProjectOutline({ sessionId }));
		const packages = outline.packages.filter((pkg) => pkg.name === 'Main');
		const sharedPackages = outline.packages.filter((pkg) => pkg.name === 'Shared');
		assert.equal(packages.length, 1, 'Expected one Main package');
		assert.equal(sharedPackages.length, 1, 'Expected one Shared package');
		const main = packages[0]; const shared = sharedPackages[0];
		const templates = main.resources.filter((resource) => resource.kind === 'component' && resource.name === 'RewardCardTemplate');
		assert.equal(templates.length, 1, 'Expected one RewardCardTemplate');
		const selector = { packageId: main.id, componentResourceId: templates[0].id };
		const template = data(await runtime.queryEntity({ sessionId, target: { kind: 'component', selector } }));
		assert.equal(template.revision, outline.revision, 'Refresh after a concurrent edit');
		assert.equal(template.entity.properties.properties.extensionType, 'Label', 'Expected a Label template');
		for (const [name, kind] of [['title', 'text'], ['icon', 'loader']]) {
			const nodes = templates[0].component.displayList.filter((node) => node.name === name);
			assert.equal(nodes.length, 1, `Expected one child named ${name}`);
			assert.equal(nodes[0].kind, kind, `Expected ${name} to be a ${kind}`);
		}
		// Build only new wrappers through public Core defaults; do not copy or reconstruct the template.
		const document = new Document();
		const generated = document.createPackage(main.name).setId(main.id);
		const { width, height } = template.entity.properties.size;
		for (const card of cards) {
			assert(!main.resources.some((resource) => resource.id === card.id || resource.name === card.name), `Generated card already exists: ${card.name}; query and replan`);
			const images = shared.resources.filter((resource) => resource.kind === 'image' && resource.name === card.image);
			assert.equal(images.length, 1, `Expected one Shared/${card.image} image`);
			const icon = data(await runtime.queryEntity({ sessionId, target: { kind: 'resource', selector: { packageId: shared.id, resourceId: images[0].id } } }));
			assert.equal(icon.revision, outline.revision, 'Refresh resource references after a concurrent edit');
			assert(icon.entity.properties.exported, 'The icon must already be exported for its ui:// reference');
			const wrapper = document.createComponent(card.name).setId(card.id).setPath('/').setSize(width, height).setExported(true);
			wrapper.addChild(document.createGComponent('card').setId('card').setSrc(templates[0].id).setPackageId(main.id).setSize(width, height)
				.setInstanceExtType('Label').setInstanceTitle(card.title).setInstanceIcon(`ui://${shared.id}${images[0].id}`));
			generated.addResource(wrapper);
		}
		const resources = liftDocumentToUamProject(document).packages[0].resources;
		const transaction = { sessionId, expectedRevision: outline.revision, operations: resources.map((component, index) => ({
			kind: 'addComponent', selector: { packageId: main.id }, component, atIndex: main.resources.length + index,
		})) };
		const preview = data(await runtime.preflightTransaction(transaction));
		const changed = data(await runtime.applyTransaction(transaction));
		keepOpen = true;
		const validation = data(await runtime.validateSession({ sessionId }));
		if (validation.status !== 'valid' || !validation.complete) throw new Error(`Project validation is ${validation.status} (complete: ${validation.complete}).`, { cause: validation });
		const saved = data(await runtime.saveSession({ sessionId, expectedRevision: changed.revision }));
		const project = await readProjectAsUam(new NodeIO(), projectPath);
		keepOpen = false;
		return { projectPath, template: selector, generated: resources.map(({ id, name }) => ({ id, name })), revision: saved.revision, dirty: saved.dirty, preview, validation, project };
	} catch (cause) {
		if (!keepOpen) throw cause;
		throw Object.assign(new Error('Reward card generation needs host recovery; the session remains open.', { cause }), {
			recovery: { runtime, sessionId, projectPath },
		});
	} finally {
		if (!keepOpen) data(await runtime.closeSession({ sessionId }));
	}
}
// #endregion example

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const { values } = parseArgs({ options: { create: { type: 'boolean' } } });
	const workspace = await mkdtemp(path.join(tmpdir(), 'ofgui-reward-cards-'));
	const projectPath = await createRewardCardProject(workspace);
	if (values.create) console.log(JSON.stringify({ projectPath, target: 'Main/RewardCardTemplate', generated: false }, null, 2));
	else {
		const { project: _project, ...report } = await generateRewardCards(projectPath);
		const published = await publishRewardPreview(projectPath, path.join(workspace, 'published'));
		console.log(JSON.stringify({ ...report, published }, null, 2));
	}
}
