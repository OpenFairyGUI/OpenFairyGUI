import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { liftDocumentToUamProject, writeProjectFromUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { publishNode, restoreNode, validateProjectNode } from '@openfairygui/functions/node';
import { createDemoProject } from '../create-demo-project.mjs';

// Two opaque 2x2 PNGs make atlas references and recovered pixels independently checkable.
export const IMAGE_BYTES = {
	red: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4z8DwH4QZYAwAR8oH+WdZbrcAAAAASUVORK5CYII=',
	blue: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVR4nGNgYPj/H4KhDAA/0gf5tBJPzQAAAABJRU5ErkJggg==',
};

export async function createPublishProject(parent) {
	const projectPath = await createDemoProject(parent);
	const document = await new NodeIO().readProject(projectPath);
	document.getRoot().setProjectType(4);
	const main = document.getRoot().listPackages()[0].listComponents()[0];
	const shared = document.createPackage('Shared').setId('pkgshare');
	const badge = document.createComponent('Badge').setId('badge').setPath('/').setSize(24, 24).setExported(true);
	shared.addResource(badge);
	for (const color of Object.keys(IMAGE_BYTES)) {
		shared.addResource(document.createImageResource(color).setId(color).setPath('/').setFileName(`${color}.png`).setWidth(2).setHeight(2).setExported(true));
		badge.addChild(document.createGImage(color).setId(color).setSrc(color).setXY(color === 'red' ? 0 : 4, 0).setSize(2, 2));
	}
	main.addChild(document.createGImage('icon').setId('icon').setSrc('red').setPackageId('pkgshare').setXY(8, 8).setSize(2, 2));
	main.addChild(document.createGComponent('badge').setId('badge-instance').setSrc('badge').setPackageId('pkgshare').setXY(48, 72).setSize(24, 24));
	const project = liftDocumentToUamProject(document);
	for (const resource of project.packages.find((pkg) => pkg.id === 'pkgshare').resources) {
		if (resource.kind === 'image') resource.sourceBytes = Uint8Array.from(Buffer.from(IMAGE_BYTES[resource.id], 'base64'));
	}
	await writeProjectFromUam(new NodeIO(), project, projectPath);
	return projectPath;
}

// Deliberately compares supported runtime semantics, not editor-local state or original XML spelling.
export function supportedSemantics(document) {
	return document.getRoot().listPackages().map((pkg) => ({
		id: pkg.getId(), resources: pkg.listResources().map((resource) => ({
			id: resource.getId(), kind: resource.propertyType,
			size: [resource.getWidth(), resource.getHeight()],
			...(resource.propertyType === 'Component' ? { children: resource.listChildren().map((node) => ({
				id: node.getId(), kind: node.propertyType, name: node.getName(),
				position: [node.getX(), node.getY()], size: [node.getWidth(), node.getHeight()],
				...(node.getText ? { text: node.getText() } : {}),
				...(node.getSrc?.() ? { reference: { packageId: node.getPackageId() || pkg.getId(), resourceId: node.getSrc() } } : {}),
			})) } : {}),
		})).sort((a, b) => a.id.localeCompare(b.id)),
	})).sort((a, b) => a.id.localeCompare(b.id));
}

export function mergePublishedPackages(packages) {
	// NodeIO reads one binary at a time and includes empty dependency placeholders.
	const byId = new Map();
	for (const pkg of packages) {
		const previous = byId.get(pkg.id);
		assert(!previous?.resources.length || !pkg.resources.length, `Duplicate populated package: ${pkg.id}`);
		if (!previous || pkg.resources.length) byId.set(pkg.id, pkg);
	}
	return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// #region example
export async function publishAndRestore(projectPath) {
	const io = new NodeIO();
	const document = await io.readProject(projectPath);
	const expected = supportedSemantics(document);
	document.setLogger({ debug() {}, info() {}, warn: console.error, error: console.error });
	const output = path.join(path.dirname(projectPath), 'release');
	const published = await publishNode({ document, output, plugins: [], codeGeneration: false });
	const packages = [];
	for (const file of published.files) {
		assert.equal((await stat(file.path)).size, file.size);
		if (file.path.endsWith('.fui')) packages.push(...supportedSemantics(await io.readBinary(file.path)));
	}
	assert.deepEqual(mergePublishedPackages(packages), expected);
	// Trusted artifacts produced above; never point this at unknown third-party downloads.
	const restored = await restoreNode({ inputDir: output, output: path.join(path.dirname(projectPath), 'restored'), projectType: 4 });
	assert.deepEqual(supportedSemantics(await io.readProject(restored.projectPath)), expected);
	const validation = await validateProjectNode(restored.projectPath);
	assert.equal(validation.status, 'valid');
	assert.equal(validation.complete, true);
	return { projectPath, published, restored: { projectPath: restored.projectPath, warnings: restored.warnings }, validation };
}
// #endregion example

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	console.log(JSON.stringify(await publishAndRestore(await createPublishProject()), null, 2));
}
