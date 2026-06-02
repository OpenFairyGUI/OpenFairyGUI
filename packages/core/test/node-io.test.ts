import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NodeIO } from '../src/node.js';

class ExposedNodeIO extends NodeIO {
	public fileSystem() {
		return this.createFileSystem();
	}
}

test('NodeIO readdir follows directory symlinks', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-node-io-'));
	t.teardown(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	await fs.mkdir(path.join(root, 'real-dir'));
	await fs.mkdir(path.join(root, 'target-dir'));
	await fs.writeFile(path.join(root, 'target-file.txt'), 'not a directory', 'utf-8');

	try {
		await fs.symlink(path.join(root, 'target-dir'), path.join(root, 'linked-dir'), 'dir');
		await fs.symlink(path.join(root, 'target-file.txt'), path.join(root, 'linked-file'), 'file');
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === 'EPERM' || code === 'ENOSYS') {
			t.pass('symlinks are unavailable in this environment');
			return;
		}
		throw err;
	}

	const fileSystem = new ExposedNodeIO().fileSystem();
	const entries = (await fileSystem.readdir(root)).sort((a, b) => a.localeCompare(b));

	t.deepEqual(entries, ['linked-dir', 'real-dir', 'target-dir']);
});
