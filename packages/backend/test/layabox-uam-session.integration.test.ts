import test from 'ava';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import { NodeIO } from '@openfairygui/core/node';
import {
	liftDocumentToUamProject,
	normalizeUamProject,
	type UamDisplayNode,
	type UamProject,
} from '@openfairygui/core/uam';
import { BackendRuntime } from '../src/index.js';

const LAYABOX_PROJECT_PATH = getFixtureProjectPath(
	'FairyGUI-layabox',
	'demo/UIProject/FairyGUI-layabox-demo.fairy',
);

type EditableTextNode = Extract<UamDisplayNode, { kind: 'text' | 'richText' | 'textInput' }>;

interface DisplayNodeTarget {
	packageId: string;
	componentResourceId: string;
	node: EditableTextNode;
}

function isEditableTextNode(node: UamDisplayNode): node is EditableTextNode {
	return node.kind === 'text' || node.kind === 'richText' || node.kind === 'textInput';
}

function findEditableTextNode(project: UamProject): DisplayNodeTarget {
	for (const packageModel of project.packages) {
		for (const resource of packageModel.resources) {
			if (resource.kind !== 'component') continue;
			for (const node of resource.component.displayList) {
				if (!isEditableTextNode(node)) continue;
				return {
					packageId: packageModel.id,
					componentResourceId: resource.id,
					node,
				};
			}
		}
	}
	throw new Error('Expected the LayaBox fixture to contain at least one editable text display node.');
}

function findDisplayNode(project: UamProject, target: DisplayNodeTarget): UamDisplayNode | null {
	const packageModel = project.packages.find((candidate) => candidate.id === target.packageId);
	const component = packageModel?.resources.find((resource) => resource.id === target.componentResourceId);
	if (component?.kind !== 'component') return null;
	return component.component.displayList.find((node) => node.id === target.node.id) ?? null;
}

test('real LayaBox UIProject supports browser-safe UAM session edit with undo and save boundaries', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(LAYABOX_PROJECT_PATH);
	const project = normalizeUamProject(liftDocumentToUamProject(doc));
	const originalProject = structuredClone(project);
	const target = findEditableTextNode(originalProject);
	const originalNode = target.node;
	const updatedText = `${originalNode.text} [openfairygui-session-edit]`;
	const updatedPosition = {
		x: originalNode.position.x + 1,
		y: originalNode.position.y + 2,
	};

	const runtime = new BackendRuntime();
	const opened = runtime.openProjectSession({
		project,
		canonicalProjectPath: 'memory://layabox-ui-project',
	});
	t.true(opened.ok);
	if (!opened.ok) return;
	t.false(opened.data.lockHeld);
	t.is(opened.data.revision, 0);
	t.false(opened.data.dirty);
	t.true(opened.data.capabilities.manifest.browserSafe);

	const applied = await runtime.applyTransaction({
		sessionId: opened.data.sessionId,
		expectedRevision: 0,
		operations: [
			{
				kind: 'setDisplayNodeProps',
				selector: {
					packageId: target.packageId,
					componentResourceId: target.componentResourceId,
					displayNodeId: originalNode.id,
				},
				props: {
					text: updatedText,
					position: updatedPosition,
				},
			},
		],
	});
	t.true(applied.ok);
	if (!applied.ok) return;
	t.is(applied.data.revision, 1);
	t.true(applied.data.dirty);

	const saved = await runtime.saveSession({ sessionId: opened.data.sessionId });
	t.false(saved.ok);
	if (saved.ok) return;
	const saveFailure = saved as Extract<typeof saved, { ok: false }>;
	t.is(saveFailure.error.code, 'capability_unavailable');
	if (saveFailure.error.code === 'capability_unavailable') {
		t.is(saveFailure.error.capability, 'fileSystem');
		t.is(saveFailure.error.requiredAdapter, 'BackendFileSystem');
	}
	t.is(saveFailure.session?.revision, 1);
	t.true(saveFailure.session?.dirty);
	t.deepEqual(saveFailure.meta.diagnostics, [
		{
			code: 'capability_unavailable',
			message: 'saveSession requires an injected BackendFileSystem adapter.',
			severity: 'error',
		},
	]);

	t.deepEqual(project, originalProject);
	const undoOpened = runtime.openProjectSession({
		project: originalProject,
		canonicalProjectPath: 'memory://layabox-ui-project-undo',
	});
	t.true(undoOpened.ok);
	if (!undoOpened.ok) return;
	t.is(undoOpened.data.revision, 0);
	t.false(undoOpened.data.dirty);
	const undoNode = findDisplayNode(originalProject, target);
	t.truthy(undoNode);
	if (!undoNode || !isEditableTextNode(undoNode)) return;
	t.is(undoNode.text, originalNode.text);
	t.deepEqual(undoNode.position, originalNode.position);
});
