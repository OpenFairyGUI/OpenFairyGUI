import test from 'ava';
import fs from 'node:fs/promises';
import { Document } from '../src/index.js';
import { ProjectReader, ProjectWriter, type FileSystem } from '../src/project-io.js';
import { createFileSystemAccessFileSystem, WebIO } from '../src/web.js';

type FakeEntry = FakeDirectoryHandle | FakeFileHandle;

class FakeBlob {
	constructor(private readonly _data: Uint8Array) {}

	async text(): Promise<string> {
		return new TextDecoder().decode(this._data);
	}

	async arrayBuffer(): Promise<ArrayBuffer> {
		const copy = new Uint8Array(this._data.byteLength);
		copy.set(this._data);
		return copy.buffer;
	}
}

class FakeWritable {
	constructor(private readonly _file: FakeFileHandle) {}

	async write(data: string | Uint8Array): Promise<void> {
		this._file.data = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
	}

	async close(): Promise<void> {}
}

class FakeFileHandle {
	readonly kind = 'file';

	constructor(
		readonly name: string,
		public data = new Uint8Array(),
	) {}

	async getFile(): Promise<FakeBlob> {
		return new FakeBlob(this.data);
	}

	async createWritable(): Promise<FakeWritable> {
		return new FakeWritable(this);
	}
}

class FakeDirectoryHandle {
	readonly kind = 'directory';
	readonly entriesMap = new Map<string, FakeEntry>();

	constructor(readonly name: string) {}

	async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<FakeFileHandle> {
		const entry = this.entriesMap.get(name);
		if (entry instanceof FakeFileHandle) return entry;
		if (entry) throw new Error(`Path is not a file: ${name}`);
		if (!options.create) throw new Error(`File not found: ${name}`);
		const file = new FakeFileHandle(name);
		this.entriesMap.set(name, file);
		return file;
	}

	async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<FakeDirectoryHandle> {
		const entry = this.entriesMap.get(name);
		if (entry instanceof FakeDirectoryHandle) return entry;
		if (entry) throw new Error(`Path is not a directory: ${name}`);
		if (!options.create) throw new Error(`Directory not found: ${name}`);
		const dir = new FakeDirectoryHandle(name);
		this.entriesMap.set(name, dir);
		return dir;
	}

	async *entries(): AsyncIterableIterator<[string, FakeEntry]> {
		for (const entry of this.entriesMap) yield entry;
	}
}

async function writeFakeFile(root: FakeDirectoryHandle, path: string, content: string | Uint8Array): Promise<void> {
	const fs = createFileSystemAccessFileSystem(root);
	if (typeof content === 'string') {
		await fs.writeFile(path, content);
		return;
	}
	await fs.writeFileRaw(path, content);
}

async function createMinimalFakeProjectRoot(): Promise<FakeDirectoryHandle> {
	const root = new FakeDirectoryHandle('');
	await writeFakeFile(
		root,
		'Project.fairy',
		'<?xml version="1.0" encoding="utf-8"?><projectDescription id="demo-project" type="Unity" version="3.0"/>',
	);
	await writeFakeFile(root, 'settings/Common.json', '{"defaultFont":"Arial"}');
	await writeFakeFile(
		root,
		'assets/Demo/package.xml',
		'<?xml version="1.0" encoding="utf-8"?><packageDescription id="pkgDemo"><resources><component id="cmpMain" name="Main.xml" path="/" exported="true"/></resources></packageDescription>',
	);
	await writeFakeFile(
		root,
		'assets/Demo/Main.xml',
		'<?xml version="1.0" encoding="utf-8"?><component size="100,100"><displayList><text id="n1" name="title" text="Hello"/></displayList></component>',
	);
	return root;
}

class MemoryFileSystem implements FileSystem {
	readonly files = new Map<string, string | Uint8Array>();
	readonly dirs = new Set<string>(['']);

	async readFile(path: string): Promise<string> {
		const value = this.files.get(this.clean(path));
		if (typeof value === 'string') return value;
		if (value instanceof Uint8Array) return new TextDecoder().decode(value);
		throw new Error(`File not found: ${path}`);
	}

	async readFileRaw(path: string): Promise<Uint8Array> {
		const value = this.files.get(this.clean(path));
		if (value instanceof Uint8Array) return value;
		if (typeof value === 'string') return new TextEncoder().encode(value);
		throw new Error(`File not found: ${path}`);
	}

	async writeFile(path: string, content: string): Promise<void> {
		const cleanPath = this.clean(path);
		await this.mkdir(this.dirname(cleanPath));
		this.files.set(cleanPath, content);
	}

	async writeFileRaw(path: string, data: Uint8Array): Promise<void> {
		const cleanPath = this.clean(path);
		await this.mkdir(this.dirname(cleanPath));
		this.files.set(cleanPath, new Uint8Array(data));
	}

	async mkdir(path: string): Promise<void> {
		const parts = this.split(path);
		for (let i = 0; i <= parts.length; i++) {
			this.dirs.add(parts.slice(0, i).join('/'));
		}
	}

	async readdir(path: string): Promise<string[]> {
		const cleanPath = this.clean(path);
		const prefix = cleanPath ? `${cleanPath}/` : '';
		const names = new Set<string>();
		for (const dir of this.dirs) {
			if (!dir.startsWith(prefix) || dir === cleanPath) continue;
			const rest = dir.slice(prefix.length);
			if (rest && !rest.includes('/')) names.add(rest);
		}
		return [...names].sort((a, b) => a.localeCompare(b));
	}

	async exists(path: string): Promise<boolean> {
		const cleanPath = this.clean(path);
		return this.files.has(cleanPath) || this.dirs.has(cleanPath);
	}

	join(...paths: string[]): string {
		return this.clean(paths.filter((part) => part !== '').join('/'));
	}

	dirname(path: string): string {
		const parts = this.split(path);
		parts.pop();
		return parts.join('/');
	}

	private split(path: string): string[] {
		const cleanPath = this.clean(path);
		return cleanPath ? cleanPath.split('/') : [];
	}

	private clean(path: string): string {
		return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
	}
}

async function seedMinimalProject(fs: MemoryFileSystem, prefix = ''): Promise<string> {
	const projectPath = fs.join(prefix, 'Project.fairy');
	await fs.writeFile(
		projectPath,
		'<?xml version="1.0" encoding="utf-8"?><projectDescription id="demo-project" type="Unity" version="3.0"/>',
	);
	await fs.writeFile(fs.join(prefix, 'settings', 'Common.json'), '{"defaultFont":"Arial"}');
	await fs.writeFile(
		fs.join(prefix, 'assets', 'Demo', 'package.xml'),
		'<?xml version="1.0" encoding="utf-8"?><packageDescription id="pkgDemo"><resources><component id="cmpMain" name="Main.xml" path="/" exported="true"/></resources></packageDescription>',
	);
	await fs.writeFile(
		fs.join(prefix, 'assets', 'Demo', 'Main.xml'),
		'<?xml version="1.0" encoding="utf-8"?><component size="100,100"><displayList><text id="n1" name="title" text="Hello"/></displayList></component>',
	);
	return projectPath;
}

function createWritableDocument(): Document {
	const doc = new Document();
	doc.getRoot().setProjectId('written-project').setProjectType(0).setVersion('3.0');
	doc.getRoot().setSettings({ common: { font: 'Arial' } });
	const pkg = doc.createPackage('Demo');
	pkg.setId('pkgDemo');
	const comp = doc.createComponent('Main');
	comp.setId('cmpMain');
	comp.setPath('/');
	comp.setExported(true);
	comp.setSize(100, 100);
	const title = doc.createGTextField('title');
	title.setId('n1');
	title.setText('Hello');
	comp.addChild(title);
	pkg.addResource(comp);
	return doc;
}

test('File System Access adapter reads, writes, lists, and normalizes project paths', async (t) => {
	const root = new FakeDirectoryHandle('');
	const fs = createFileSystemAccessFileSystem(root);

	t.is(fs.dirname('Project.fairy'), '');
	t.is(fs.join('', 'assets'), 'assets');

	await fs.writeFile('settings/Common.json', '{"defaultFont":"Arial"}');
	await fs.writeFileRaw('assets/Demo/raw.bin', new Uint8Array([1, 2, 3]));

	t.true(await fs.exists('settings/Common.json'));
	t.false(await fs.exists('settings/Missing.json'));
	t.is(await fs.readFile('settings/Common.json'), '{"defaultFont":"Arial"}');
	t.deepEqual([...(await fs.readFileRaw('assets/Demo/raw.bin'))], [1, 2, 3]);
	t.deepEqual(await fs.readdir('assets'), ['Demo']);
});

test('WebIO public surface is limited to browser project read/write', async (t) => {
	const coreRoot = await import('../src/index.js') as Record<string, unknown>;
	const io = new WebIO(new MemoryFileSystem());

	t.false('WebIO' in coreRoot);
	t.is(typeof io.readProject, 'function');
	t.is(typeof io.writeProject, 'function');
	t.false('readBinary' in io);
	t.false('writeBinary' in io);
});

test('WebIO source stays within the browser project adapter boundary', async (t) => {
	const sources = [
		await fs.readFile(new URL('../src/web.ts', import.meta.url), 'utf-8'),
		await fs.readFile(new URL('../src/io/web-io.ts', import.meta.url), 'utf-8'),
	].join('\n');

	t.false(sources.includes('node:'));
	t.false(sources.includes('backend'));
	t.false(sources.includes('platform-io'));
	t.false(sources.includes('binary-reader'));
	t.false(sources.includes('binary-writer'));
});

test('WebIO reads a root-level project from a File System Access directory handle', async (t) => {
	const root = await createMinimalFakeProjectRoot();
	const io = new WebIO({ root });
	const doc = await io.readProject('Project.fairy');

	t.is(doc.getRoot().getProjectId(), 'demo-project');
	t.truthy(doc.getRoot().getPackage('Demo'));
	t.truthy(doc.getRoot().getPackage('Demo')?.getComponent('Main'));
});

test('WebIO writes a root-level project through a File System Access directory handle', async (t) => {
	const root = new FakeDirectoryHandle('');
	const io = new WebIO({ root });

	await io.writeProject(createWritableDocument(), 'Project.fairy');

	const fs = createFileSystemAccessFileSystem(root);
	t.true(await fs.exists('Project.fairy'));
	t.true(await fs.exists('settings/Common.json'));
	t.true(await fs.exists('assets/Demo/package.xml'));
	t.true(await fs.exists('assets/Demo/Main.xml'));
	t.true((await fs.readFile('assets/Demo/package.xml')).includes('packageDescription'));
});

test('WebIO accepts a custom Core FileSystem implementation', async (t) => {
	const fs = new MemoryFileSystem();
	await seedMinimalProject(fs);

	const io = new WebIO(fs);
	const doc = await io.readProject('Project.fairy');
	t.truthy(doc.getRoot().getPackage('Demo')?.getComponent('Main'));

	await io.writeProject(doc, 'Project.fairy');
	t.true(await fs.exists('assets/Demo/package.xml'));
	t.true(await fs.exists('assets/Demo/Main.xml'));
});

test('ProjectReader and ProjectWriter support root and nested .fairy project paths', async (t) => {
	const rootFs = new MemoryFileSystem();
	await seedMinimalProject(rootFs);

	const rootDoc = await new ProjectReader(rootFs).read('Project.fairy');
	t.truthy(rootDoc.getRoot().getPackage('Demo')?.getComponent('Main'));

	await new ProjectWriter(rootFs).write(createWritableDocument(), 'Project.fairy');
	t.true(await rootFs.exists('assets/Demo/package.xml'));

	const nestedFs = new MemoryFileSystem();
	await seedMinimalProject(nestedFs, 'samples/Demo');

	const nestedDoc = await new ProjectReader(nestedFs).read('samples/Demo/Project.fairy');
	t.truthy(nestedDoc.getRoot().getPackage('Demo')?.getComponent('Main'));

	await new ProjectWriter(nestedFs).write(createWritableDocument(), 'samples/Demo/Project.fairy');
	t.true(await nestedFs.exists('samples/Demo/assets/Demo/package.xml'));
	t.false(await nestedFs.exists('assets/Demo/package.xml'));
});
