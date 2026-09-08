import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { EaseType, TransitionActionType, readProjectAsUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { createNodeBackendRuntime } from '@openfairygui/backend/node';
import { publishNode } from '@openfairygui/functions/node';
import { createRewardPanelProject, editRewardPanel } from '../reward-panel-states/index.mjs';

function data(result) {
	if (!result.ok) throw new Error(result.error.code, { cause: result });
	return result.data;
}

// Start from task A's saved three-state panel, always in a new temporary project.
export async function createRewardLayoutProject(parent) {
	const projectPath = await createRewardPanelProject(parent);
	await editRewardPanel(projectPath);
	return projectPath;
}

// #region example
export async function redesignRewardPanel(projectPath, runtime = createNodeBackendRuntime({
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
		const current = data(await runtime.queryEntity({ sessionId, target: { kind: 'component', selector } }));
		const controller = data(await runtime.queryEntity({ sessionId, target: { kind: 'controller', selector: { ...selector, controllerName: 'rewardState' } } }));
		assert.equal(controller.revision, current.revision, 'Refresh after a concurrent edit');
		assert.deepEqual(controller.entity.properties.pages.map((page) => page.name), ['Locked', 'Claimable', 'Claimed'], 'Complete task A before this example');
		assert(!components[0].component.transitions.some((transition) => transition.name === 'intro'), 'An intro transition already exists; query and replan');
		const layout = {
			background: { size: { width: 420, height: 320 } },
			title: { position: { x: 32, y: 28 }, size: { width: 356, height: 36 } },
			rewardIcon: { position: { x: 178, y: 104 }, size: { width: 64, height: 64 } },
			claimButton: { position: { x: 110, y: 204 } },
			claimedMark: { position: { x: 32, y: 272 }, size: { width: 356, height: 28 } },
		};
		const operations = [{ kind: 'setComponentProps', selector, props: { size: { width: 420, height: 320 } } }];
		for (const [name, props] of Object.entries(layout)) {
			const nodes = components[0].component.displayList.filter((node) => node.name === name);
			assert.equal(nodes.length, 1, `Expected one ${name} node`);
			const target = data(await runtime.queryEntity({ sessionId, target: { kind: 'displayNode', selector: { ...selector, displayNodeId: nodes[0].id } } }));
			assert.equal(target.revision, current.revision, 'Refresh targets after a concurrent edit');
			operations.push({ kind: 'setDisplayNodeProps', selector: target.target.selector, props });
		}
		// UAM timing is in frames: 12 frames / 30 fps = 0.4 seconds. Empty target means this component.
		const item = { name: '', time: 0, targetNodeId: '', tween: true, duration: 12,
			easeType: EaseType.QuadOut, repeat: 0, yoyo: false, endLabel: '', path: '', customEasePath: '' };
		operations.push({ kind: 'addTransition', selector: { ...selector, transitionName: 'intro' }, transition: {
			name: 'intro', autoPlay: true, autoPlayTimes: 1, autoPlayDelay: 0, options: 0, fps: 30,
			items: [
				{ ...item, actionType: TransitionActionType.Alpha, startValue: [0], endValue: [1], label: 'fade-in' },
				{ ...item, actionType: TransitionActionType.XY, startValue: [0, 24], endValue: [0, 0], label: 'slide-up' },
			],
		} });
		const transaction = { sessionId, expectedRevision: current.revision, operations };
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
		throw Object.assign(new Error('Reward panel redesign needs host recovery; the session remains open.', { cause }), {
			recovery: { runtime, sessionId, projectPath },
		});
	} finally {
		if (!keepOpen) data(await runtime.closeSession({ sessionId }));
	}
}
// #endregion example

export async function publishRewardPreview(projectPath, output) {
	const document = await new NodeIO().readProject(projectPath);
	document.setLogger({ debug() {}, info() {}, warn: console.error, error: console.error });
	return publishNode({ document, output, plugins: [], codeGeneration: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const { values } = parseArgs({ options: { create: { type: 'boolean' } } });
	const workspace = await mkdtemp(path.join(tmpdir(), 'ofgui-reward-layout-'));
	const projectPath = await createRewardLayoutProject(workspace);
	if (values.create) console.log(JSON.stringify({ projectPath, target: 'Main/RewardPanel', redesigned: false }, null, 2));
	else {
		const before = await publishRewardPreview(projectPath, path.join(workspace, 'published-before'));
		const { project: _project, ...report } = await redesignRewardPanel(projectPath);
		const after = await publishRewardPreview(projectPath, path.join(workspace, 'published-after'));
		console.log(JSON.stringify({ ...report, before, after }, null, 2));
	}
}
