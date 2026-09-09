import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document, ProjectWriter } from '../src/index.js';
import { NodeIO } from '../src/node.js';

test('invalid image order hints fail before creating or replacing project files', async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-invalid-hints-'));
	t.teardown(() => fs.rm(directory, { recursive: true, force: true }));
	const target = path.join(directory, 'Images.fairy');
	await fs.writeFile(target, 'original');
	for (const scenario of ['missing', 'package', 'branch', 'cycle']) {
		const doc = new Document();
		const pkg = doc.createPackage('Images').setId('images');
		const image = doc.createImageResource('a.png').setId('a');
		const anchor = doc.createImageResource('b.png').setId('b');
		pkg.addResource(image);
		if (scenario === 'package') doc.createPackage('Other').setId('other').addResource(anchor);
		else if (scenario !== 'missing') pkg.addResource(anchor);
		if (scenario === 'branch') anchor.setBranch('mobile');
		if (scenario === 'cycle') ProjectWriter.setImageWriteHints(anchor, { packageOrder: { afterId: 'a', weight: 0 } });
		ProjectWriter.setImageWriteHints(image, { packageOrder: { afterId: 'b', weight: 0 } });
		await t.throwsAsync(new NodeIO().writeProject(doc, target), { message: /package order anchor/ });
		t.is(await fs.readFile(target, 'utf8'), 'original');
		t.deepEqual(await fs.readdir(directory), ['Images.fairy']);
	}
});

test('image write hints survive Writer replacement, stay local to the image, and can be cleared', async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-write-hints-'));
	try {
		const doc = new Document();
		const pkg = doc.createPackage('Images').setId('images');
		const inferred = doc.createImageResource('inferred.png').setId('inferred').setWidth(40).setHeight(20);
		const authored = doc.createImageResource('authored.png').setId('authored').setWidth(40).setHeight(20);
		pkg.addResource(inferred).addResource(authored);
		ProjectWriter.setImageWriteHints(inferred, { omitPackageSize: true });
		const write = async () => {
			await new NodeIO().writeProject(doc, path.join(directory, 'Images.fairy'));
			return fs.readFile(path.join(directory, 'assets', 'Images', 'package.xml'), 'utf8');
		};
		const first = await write();
		t.false(/<image[^>]*id="inferred"[^>]*(?:width|height)=/.test(first));
		t.regex(first, /<image[^>]*id="authored"[^>]*width="40"[^>]*height="20"/);
		t.is(await write(), first);
		t.deepEqual(inferred.getExtras(), {});
		t.is(inferred.getWidth(), 40);
		ProjectWriter.setImageWriteHints(inferred, {});
		t.regex(await write(), /<image[^>]*id="inferred"[^>]*width="40"[^>]*height="20"/);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test('image ordering hints group by anchor and weight across Writer instances without extras', async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-order-hints-'));
	try {
		const doc = new Document();
		const pkg = doc.createPackage('Images').setId('images');
		const font = doc.createFontResource('font.fnt').setId('f');
		const images = ['a', 'b', 'd', 'e', 'z'].map((id) => doc.createImageResource(`${id}.png`).setId(id));
		pkg.addResource(font);
		for (const image of images) pkg.addResource(image);
		const textureOrder = { afterId: 'f', weight: 0 };
		ProjectWriter.setImageWriteHints(images[0]!, { packageOrder: textureOrder });
		ProjectWriter.setImageWriteHints(images[2]!, { packageOrder: { afterId: 'f', weight: 1 } });
		ProjectWriter.setImageWriteHints(images[3]!, { packageOrder: { afterId: 'f', weight: 1 } });
		ProjectWriter.setImageWriteHints(images[4]!, { packageOrder: { afterId: '', weight: 0 } });
		textureOrder.afterId = 'missing';
		const writeIds = async () => {
			await new NodeIO().writeProject(doc, path.join(directory, 'Images.fairy'));
			const xml = await fs.readFile(path.join(directory, 'assets', 'Images', 'package.xml'), 'utf8');
			return [...xml.matchAll(/^\s*<(?:font|image)\b[^>]*\bid="([^"]+)"/gm)].map((match) => match[1]);
		};
		t.deepEqual(await writeIds(), ['b', 'f', 'a', 'd', 'e', 'z']);
		t.deepEqual(await writeIds(), ['b', 'f', 'a', 'd', 'e', 'z']);
		for (const image of images) t.deepEqual(image.getExtras(), {});
		const originalResources = pkg.listResources();
		t.throws(() => ProjectWriter.setImageWriteHints(images[0]!, { packageOrder: { afterId: 'f', weight: NaN } }), { instanceOf: TypeError });
		ProjectWriter.setImageWriteHints(images[0]!, { packageOrder: { afterId: 'missing', weight: 0 } });
		await t.throwsAsync(writeIds, { message: /package order anchor/ });
		t.deepEqual(pkg.listResources(), originalResources, 'invalid hints must not remove resources');
		for (const image of images) ProjectWriter.setImageWriteHints(image, {});
		t.deepEqual(await writeIds(), ['a', 'b', 'd', 'e', 'f', 'z']);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});
