import assert from 'node:assert/strict';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { AlignType, AutoSizeType, GraphType, liftDocumentToUamProject, readProjectAsUam, writeProjectFromUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { createPublishProject, IMAGE_BYTES } from '../publish-restore/index.mjs';

function data(result) {
	if (!result.ok) throw new Error(result.error.code, { cause: result });
	return result.data;
}

// Only creates a new temporary project. MainView and Shared provide unrelated content and PNG bytes to preserve.
export async function createRewardPanelProject(parent) {
	const projectPath = await createPublishProject(parent);
	const document = await new NodeIO().readProject(projectPath);
	const main = document.getRoot().listPackages().find((pkg) => pkg.getName() === 'Main');
	const button = document.createComponent('ClaimButton').setId('claimbtn').setPath('/').setSize(200, 48)
		.setExtensionType('Button').setOpaque(true);
	button.addChild(document.createGGraph('background').setId('button-bg').setSize(200, 48)
		.setGraphType(GraphType.Rect).setFillColor('#147D64').setLineSize(0).setTouchable(false));
	button.addChild(document.createGTextField('title').setId('button-title').setXY(0, 10).setSize(200, 28)
		.setText('领取奖励').setFontSize(20).setColor('#FFFFFF').setAlign(AlignType.Center).setAutoSize(AutoSizeType.None).setTouchable(false));
	main.addResource(button);
	const panel = document.createComponent('RewardPanel').setId('reward01').setPath('/').setSize(360, 280).setExported(true);
	panel.addChild(document.createGGraph('background').setId('panel-bg').setSize(360, 280)
		.setGraphType(GraphType.Rect).setFillColor('#F3F6F4').setLineSize(0).setTouchable(false));
	panel.addChild(document.createGTextField('title').setId('reward-title').setXY(24, 24).setSize(312, 32)
		.setText('每日奖励').setFontSize(24).setColor('#173B32').setAlign(AlignType.Center).setAutoSize(AutoSizeType.None).setTouchable(false));
	panel.addChild(document.createGImage('rewardIcon').setId('reward-icon').setSrc('red').setPackageId('pkgshare')
		.setXY(152, 80).setSize(56, 56).setTouchable(false));
	panel.addChild(document.createGComponent('claimButton').setId('claim-button').setSrc('claimbtn').setXY(80, 160).setSize(200, 48)
		.setInstanceExtType('Button').setInstanceTitle('领取奖励'));
	panel.addChild(document.createGTextField('claimedMark').setId('claimed-mark').setXY(24, 228).setSize(312, 28)
		.setText('✓ 奖励已领取').setFontSize(18).setColor('#147D64').setAlign(AlignType.Center).setAutoSize(AutoSizeType.None).setTouchable(false));
	main.addResource(panel);
	const project = liftDocumentToUamProject(document);
	for (const resource of project.packages.find((pkg) => pkg.id === 'pkgshare').resources) {
		if (resource.kind === 'image') resource.sourceBytes = Uint8Array.from(Buffer.from(IMAGE_BYTES[resource.id], 'base64'));
	}
	await writeProjectFromUam(new NodeIO(), project, projectPath);
	return projectPath;
}

// #region example
export async function editRewardPanel(projectPath, runtime = createNodeBackendRuntime({
	allowedProjectRoots: [path.dirname(path.resolve(projectPath))],
})) {
	const { sessionId } = data(await runtime.openSession({ projectPath }));
	let keepOpen = false;
	try {
		const outline = data(await runtime.getProjectOutline({ sessionId }));
		const packages = outline.packages.filter((pkg) => pkg.name === 'Main');
		assert.equal(packages.length, 1, 'Expected one Main package');
		const components = packages[0].resources.filter((resource) => resource.kind === 'component' && resource.name === 'RewardPanel');
		assert.equal(components.length, 1, 'Expected one Main/RewardPanel component');
		const selector = { packageId: packages[0].id, componentResourceId: components[0].id };
		const targets = {};
		for (const name of ['claimButton', 'claimedMark']) {
			const nodes = components[0].component.displayList.filter((node) => node.name === name);
			assert.equal(nodes.length, 1, `Expected one ${name} node`);
			targets[name] = data(await runtime.queryEntity({ sessionId,
				target: { kind: 'displayNode', selector: { ...selector, displayNodeId: nodes[0].id } },
			}));
		}
		assert.equal(targets.claimButton.revision, targets.claimedMark.revision, 'Refresh targets after a concurrent edit');
		const controllerName = 'rewardState';
		const pages = [
			{ id: 'locked', name: 'Locked', remark: '' },
			{ id: 'claimable', name: 'Claimable', remark: '' },
			{ id: 'claimed', name: 'Claimed', remark: '' },
		];
		const common = { name: '', controllerName, condition: '', positionsInPercent: false,
			tween: false, tweenDuration: 0.3, tweenDelay: 0, easeType: 5, customEasePath: '' };
		const transaction = { sessionId, expectedRevision: targets.claimButton.revision, operations: [
			{ kind: 'addController', selector: { ...selector, controllerName }, controller: {
				name: controllerName, selectedIndex: 0, autoRadioGroupDepth: false, alias: '', exported: true,
				homePageType: 'default', homePage: '', pages, actions: [],
			} },
			{ kind: 'addGear', selector: { ...targets.claimButton.target.selector, kind: 'text', controllerName }, gear: {
				...common, kind: 'text', defaultValue: { text: '未达成' },
				states: pages.map((page, index) => ({ pageId: page.id, value: { text: ['未达成', '领取奖励', '已领取'][index] } })),
			} },
			{ kind: 'addGear', selector: { ...targets.claimButton.target.selector, kind: 'look', controllerName }, gear: {
				...common, kind: 'look', defaultValue: { alpha: 1, rotation: 0, grayed: true, touchable: false },
				states: pages.map((page, index) => ({ pageId: page.id, value: { alpha: 1, rotation: 0, grayed: index !== 1, touchable: index === 1 } })),
			} },
			{ kind: 'addGear', selector: { ...targets.claimedMark.target.selector, kind: 'display', controllerName },
				gear: { kind: 'display', name: '', controllerName, visibleOnPageIds: ['claimed'] } },
		] };
		const preview = data(await runtime.preflightTransaction(transaction));
		const changed = data(await runtime.applyTransaction(transaction));
		keepOpen = true;
		const validation = data(await runtime.validateSession({ sessionId }));
		if (validation.status !== 'valid' || !validation.complete) throw new Error(`Project validation is ${validation.status} (complete: ${validation.complete}).`, { cause: validation });
		const saved = data(await runtime.saveSession({ sessionId, expectedRevision: changed.revision }));
		const project = await readProjectAsUam(new NodeIO(), projectPath);
		keepOpen = false;
		return { projectPath, selector, revision: saved.revision, dirty: saved.dirty, preview, validation, project };
	} catch (cause) {
		if (!keepOpen) throw cause;
		throw Object.assign(new Error('Reward panel edit needs host recovery; the session remains open.', { cause }), {
			recovery: { runtime, sessionId, projectPath },
		});
	} finally {
		if (!keepOpen) data(await runtime.closeSession({ sessionId }));
	}
}
// #endregion example

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const { values } = parseArgs({ options: { create: { type: 'boolean' } } });
	const projectPath = await createRewardPanelProject();
	if (values.create) console.log(JSON.stringify({ projectPath, target: 'Main/RewardPanel', edited: false }, null, 2));
	else {
		const { project: _project, ...report } = await editRewardPanel(projectPath);
		console.log(JSON.stringify(report, null, 2));
	}
}
