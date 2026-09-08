import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document, ProjectWriter } from '../src/index.js';
import { NodeIO } from '../src/node.js';

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
