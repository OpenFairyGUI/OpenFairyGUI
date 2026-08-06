import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import { NodeIO } from '@openfairygui/core/node';
import {
	liftDocumentToUamProject,
	normalizeUamProject,
	type UamDisplayNode,
	type UamProject,
} from '@openfairygui/core/uam';
import { publish } from '@openfairygui/functions';
import { BackendRuntime } from '../src/index.js';
import { createBackendRuntime } from './helpers.js';

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

function createPublishFs() {
	return {
		async readFileRaw(filePath: string): Promise<Uint8Array> {
			const data = await fs.readFile(filePath);
			return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
		},
		async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, data);
		},
		async mkdir(dirPath: string): Promise<void> {
			await fs.mkdir(dirPath, { recursive: true });
		},
		async readdir(dirPath: string): Promise<string[]> {
			return fs.readdir(dirPath);
		},
		async deleteFile(filePath: string): Promise<void> {
			await fs.rm(filePath, { force: true });
		},
		join(...paths: string[]): string {
			return path.join(...paths);
		},
	};
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

test('real LayaBox UIProject rejects lossy file-backed UAM saves before writing', async (t) => {
	const sourceRoot = path.dirname(LAYABOX_PROJECT_PATH);
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-layabox-uam-save-'));
	const projectRoot = path.join(tmpDir, 'UIProject');
	const fairyPath = path.join(projectRoot, path.basename(LAYABOX_PROJECT_PATH));
	let runtime: ReturnType<typeof createBackendRuntime> | null = null;
	let sessionId: string | null = null;

	try {
		await fs.cp(sourceRoot, projectRoot, { recursive: true });
		const originalFairy = await fs.readFile(fairyPath);

		const io = new NodeIO();
		const doc = await io.readProject(fairyPath);
		const project = normalizeUamProject(liftDocumentToUamProject(doc));
		const target = findEditableTextNode(project);
		const originalNode = target.node;
		const updatedText = `${originalNode.text} [openfairygui-file-save]`;
		const updatedPosition = {
			x: originalNode.position.x + 3,
			y: originalNode.position.y + 4,
		};
		const updatedSize = {
			width: originalNode.size.width + 5,
			height: originalNode.size.height + 6,
		};
		const updatedVisible = !originalNode.visible;
		const updatedTouchable = !originalNode.touchable;
		const updatedGrayed = !originalNode.grayed;
		const updatedAlpha = originalNode.alpha === 0.65 ? 0.55 : 0.65;
		const updatedRotation = originalNode.rotation === 15 ? 30 : 15;

		runtime = createBackendRuntime();
		const opened = await runtime.openSession({ projectPath: projectRoot });
		t.true(opened.ok);
		if (!opened.ok) return;
		t.is(opened.data.uamFidelity, 'unsupported');
		sessionId = opened.data.sessionId;

		const applied = await runtime.applyTransaction({
			sessionId,
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
						size: updatedSize,
						visible: updatedVisible,
						touchable: updatedTouchable,
						grayed: updatedGrayed,
						alpha: updatedAlpha,
						rotation: updatedRotation,
					},
				},
			],
		});
		t.true(applied.ok);
		if (!applied.ok) return;

		const saved = await runtime.saveSession({ sessionId });
		t.false(saved.ok);
		if (!saved.ok) {
			const failure = saved as Extract<typeof saved, { ok: false }>;
			t.is(failure.error.code, 'uam_fidelity_unsupported');
			t.deepEqual(await fs.readFile(fairyPath), originalFairy);
			return;
		}
		t.false(saved.data.dirty);
		t.is(saved.data.lastSavedRevision, 1);

		const reloaded = normalizeUamProject(liftDocumentToUamProject(await io.readProject(fairyPath)));
		const reloadedNode = findDisplayNode(reloaded, target);
		t.truthy(reloadedNode);
		if (!reloadedNode || !isEditableTextNode(reloadedNode)) return;
		t.is(reloadedNode.text, updatedText);
		t.deepEqual(reloadedNode.position, updatedPosition);
		t.deepEqual(reloadedNode.size, updatedSize);
		t.is(reloadedNode.visible, updatedVisible);
		t.is(reloadedNode.touchable, updatedTouchable);
		t.is(reloadedNode.grayed, updatedGrayed);
		t.is(reloadedNode.alpha, updatedAlpha);
		t.is(reloadedNode.rotation, updatedRotation);

		const publishOut = path.join(tmpDir, 'Release');
		const publishDoc = await io.readProject(fairyPath);
		await publishDoc.transform(publish({
			output: publishOut,
			fs: createPublishFs(),
			basePath: path.join(projectRoot, 'assets'),
		}));
		const publishedNames = await fs.readdir(publishOut);
		t.true(publishedNames.some((name) => name.endsWith('.fui')));
	} finally {
		if (runtime && sessionId) {
			await runtime.closeSession({ sessionId }).catch(() => undefined);
		}
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
