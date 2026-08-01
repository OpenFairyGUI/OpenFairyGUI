import test from 'ava';
import { Document, ProjectType } from '@openfairygui/core';
import type { RootProjectSettings } from '../src/index.js';
import { publishBrowser } from '../src/web.js';
import { createTestJta, TEST_JPEG as JPEG, TEST_PNG as PNG } from './test-jta.js';

class MemoryFileSystem {
	readonly files = new Map<string, Uint8Array>();
	readonly readCalls = new Map<string, number>();
	mkdirCalls = 0;

	async readFileRaw(path: string): Promise<Uint8Array> {
		this.readCalls.set(path, (this.readCalls.get(path) ?? 0) + 1);
		const data = this.files.get(path);
		if (!data) throw new Error(`File not found: ${path}`);
		return data.slice();
	}

	async writeFileRaw(path: string, data: Uint8Array): Promise<void> {
		this.files.set(path, data.slice());
	}

	async mkdir(): Promise<void> {
		this.mkdirCalls += 1;
	}

	join(...paths: string[]): string {
		return paths.filter(Boolean).join('/').replace(/\/+/g, '/');
	}
}

class FailingOutputFileSystem extends MemoryFileSystem {
	constructor(private readonly failingPath: string) {
		super();
	}

	override async writeFileRaw(path: string, data: Uint8Array): Promise<void> {
		if (path === this.failingPath) throw new Error(`Write failed: ${path}`);
		await super.writeFileRaw(path, data);
	}
}

function addMovieClipPackage(
	document: Document,
	source: MemoryFileSystem,
	packageName: string,
	packageId: string,
	jta: Uint8Array,
	resourceId = `${packageId}mc`,
): ReturnType<Document['createMovieClipResource']> {
	const pkg = document.createPackage(packageName);
	pkg.setId(packageId);
	const movieClip = document.createMovieClipResource('spinner');
	movieClip.setId(resourceId).setPath('/clips/').setFileName('spinner.jta').setExported(true);
	pkg.addResource(movieClip);
	source.files.set(`assets/${packageName}/clips/spinner.jta`, jta);
	return movieClip;
}

class BrowserCanvasStub {
	readonly width: number;
	readonly height: number;

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
	}

	getContext(): unknown {
		return {
			clearRect() {},
			drawImage() {},
			fillRect() {},
			fillStyle: '',
			getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }),
			rotate() {},
			restore() {},
			save() {},
			translate() {},
		};
	}

	async convertToBlob(): Promise<Blob> {
		return new Blob([PNG], { type: 'image/png' });
	}
}

test.serial('publishBrowser writes Layabox .fui and atlas PNG through browser file systems', async (t) => {
	const globals = globalThis as Record<string, unknown>;
	const previousCanvas = globals.OffscreenCanvas;
	const previousCreateImageBitmap = globals.createImageBitmap;
	globals.OffscreenCanvas = BrowserCanvasStub;
	globals.createImageBitmap = async () => ({ width: 2, height: 2, close() {} });

	try {
		const source = new MemoryFileSystem();
		const output = new MemoryFileSystem();
		source.files.set('assets/Demo/images/icon.png', PNG);

		const document = new Document();
		document.getRoot().setProjectType(ProjectType.Pixi);
		const pkg = document.createPackage('Demo');
		pkg.setId('demo0001');
		const image = document.createImageResource('icon.png');
		image.setId('img0001').setPath('/images/').setFileName('icon.png').setWidth(2).setHeight(2).setExported(true);
		pkg.addResource(image);

		const result = await publishBrowser({
			document,
			sourceFileSystem: source,
			outputFileSystem: output,
			projectType: 'layabox',
			output: '.fairygui-runtime',
		});

		t.true(result.success, result.diagnostics.map((entry) => entry.message).join('\n'));
		t.deepEqual(result.files.map((file) => file.path).sort(), [
			'.fairygui-runtime/Demo.fui',
			'.fairygui-runtime/Demo_atlas0.png',
		]);
		t.true(output.files.has('.fairygui-runtime/Demo.fui'));
		t.true(output.files.has('.fairygui-runtime/Demo_atlas0.png'));
		t.deepEqual([...output.files.get('.fairygui-runtime/Demo_atlas0.png')!.subarray(0, 8)], [...PNG.subarray(0, 8)]);
		t.is(document.getRoot().getProjectType(), ProjectType.Pixi, 'publish target does not change the loaded project type');
	} finally {
		if (previousCanvas === undefined) delete globals.OffscreenCanvas;
		else globals.OffscreenCanvas = previousCanvas;
		if (previousCreateImageBitmap === undefined) delete globals.createImageBitmap;
		else globals.createImageBitmap = previousCreateImageBitmap;
	}
});

test.serial('publishBrowser resolves supported settings and rejects unsafe browser output', async (t) => {
	const globals = globalThis as Record<string, unknown>;
	const previousCanvas = globals.OffscreenCanvas;
	const previousCreateImageBitmap = globals.createImageBitmap;
	globals.OffscreenCanvas = BrowserCanvasStub;
	globals.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

	try {
		const document = new Document();
		document.getRoot().setSettings({
			publish: {
				fileExtension: 'bin',
				codeGeneration: { allowGenCode: true },
			},
		} as RootProjectSettings);
		const included = document.createPackage('Included');
		included.setId('include1').setPublishPath('../desktop').setPublishBranchPath('C:\\desktop');
		const component = document.createComponent('Main');
		component.setId('main0001').setExported(true);
		included.addResource(component);
		const ignored = document.createPackage('CodegenOnly');
		ignored.setId('codegen1').setGenCode(true);

		const extensionOutput = new MemoryFileSystem();
		const extensionResult = await publishBrowser({
			document,
			sourceFileSystem: new MemoryFileSystem(),
			outputFileSystem: extensionOutput,
			projectType: 'layabox',
			output: '.fairygui-runtime',
			packages: ['Included'],
		});

		t.true(extensionResult.success, extensionResult.diagnostics.map((entry) => entry.message).join('\n'));
		t.deepEqual(extensionResult.files.map((file) => file.path), ['.fairygui-runtime/Included.bin']);
		t.true(extensionOutput.files.has('.fairygui-runtime/Included.bin'));
		t.false(extensionOutput.files.has('.fairygui-runtime/CodegenOnly.bin'));

		delete globals.OffscreenCanvas;
		delete globals.createImageBitmap;
		const codegenDocument = new Document();
		codegenDocument.getRoot().setSettings({
			publish: { codeGeneration: { allowGenCode: true } },
		} as RootProjectSettings);
		const codegenPackage = codegenDocument.createPackage('Demo');
		codegenPackage.setId('demo0001').setGenCode(true);
		const codegenOutput = new MemoryFileSystem();

		const codegenResult = await publishBrowser({
			document: codegenDocument,
			sourceFileSystem: new MemoryFileSystem(),
			outputFileSystem: codegenOutput,
			projectType: 'layabox',
			output: '.fairygui-runtime',
		});

		t.false(codegenResult.success);
		t.like(codegenResult.diagnostics.at(-1), {
			code: 'unsupported_publish_setting',
			setting: 'codeGeneration',
			path: 'packages[0].publish.genCode',
		});
		t.deepEqual(codegenResult.files, []);
		t.is(codegenOutput.mkdirCalls, 0);
		t.is(codegenOutput.files.size, 0);

		const extensionDocument = new Document();
		extensionDocument.getRoot().setSettings({ publish: { fileExtension: '../bin' } } as RootProjectSettings);
		const extensionPackage = extensionDocument.createPackage('Demo');
		extensionPackage.setId('demo0001');
		const unsafeOutput = new MemoryFileSystem();
		const unsafeResult = await publishBrowser({
			document: extensionDocument,
			sourceFileSystem: new MemoryFileSystem(),
			outputFileSystem: unsafeOutput,
			projectType: 'layabox',
			output: '.fairygui-runtime',
		});

		t.false(unsafeResult.success);
		t.like(unsafeResult.diagnostics.at(-1), {
			code: 'unsupported_publish_setting',
			setting: 'fileExtension',
			path: 'settings.publish.fileExtension',
		});
		t.deepEqual(unsafeResult.files, []);
		t.is(unsafeOutput.mkdirCalls, 0);
		t.is(unsafeOutput.files.size, 0);

		globals.OffscreenCanvas = BrowserCanvasStub;
		globals.createImageBitmap = async () => ({ width: 2, height: 2, close() {} });
		const source = new MemoryFileSystem();
		source.files.set('assets/Demo/images/icon.png', PNG);
		const partialDocument = new Document();
		const pkg = partialDocument.createPackage('Demo');
		pkg.setId('demo0001');
		const image = partialDocument.createImageResource('icon.png');
		image.setId('img0001').setPath('/images/').setFileName('icon.png').setWidth(2).setHeight(2).setExported(true);
		pkg.addResource(image);
		const partialOutput = new FailingOutputFileSystem('.fairygui-runtime/Demo.fui');

		const partialResult = await publishBrowser({
			document: partialDocument,
			sourceFileSystem: source,
			outputFileSystem: partialOutput,
			projectType: 'layabox',
			output: '.fairygui-runtime',
		});

		t.false(partialResult.success);
		t.is(partialResult.diagnostics.at(-1)?.code, 'publish_failed');
		t.deepEqual(partialResult.files.map((file) => file.path), ['.fairygui-runtime/Demo_atlas0.png']);
		t.true(partialOutput.files.has('.fairygui-runtime/Demo_atlas0.png'));
		t.false(partialOutput.files.has('.fairygui-runtime/Demo.fui'));
	} finally {
		if (previousCanvas === undefined) delete globals.OffscreenCanvas;
		else globals.OffscreenCanvas = previousCanvas;
		if (previousCreateImageBitmap === undefined) delete globals.createImageBitmap;
		else globals.createImageBitmap = previousCreateImageBitmap;
	}
});

test.serial('publishBrowser decodes PNG/JPEG JTA textures in authoritative texture-table order', async (t) => {
	const globals = globalThis as Record<string, unknown>;
	const previousCanvas = globals.OffscreenCanvas;
	const previousCreateImageBitmap = globals.createImageBitmap;
	const decodedMimeTypes: string[] = [];
	globals.OffscreenCanvas = BrowserCanvasStub;
	globals.createImageBitmap = async (source: Blob) => {
		decodedMimeTypes.push(source.type);
		return { width: 2, height: 2, close() {} };
	};

	try {
		const source = new MemoryFileSystem();
		const output = new MemoryFileSystem();
		const document = new Document();
		const movieClip = addMovieClipPackage(
			document,
			source,
			'Demo',
			'demo0001',
			createTestJta([PNG, JPEG], [
				{ textureIndex: 1 },
				{ textureIndex: 0 },
				{ textureIndex: 1 },
				{ textureIndex: -1 },
			]),
		);

		const result = await publishBrowser({
			document,
			sourceFileSystem: source,
			outputFileSystem: output,
			projectType: 'layabox',
			output: '.fairygui-runtime',
			atlas: { allowRotation: false },
		});

		t.true(result.success, result.diagnostics.map((entry) => entry.message).join('\n'));
		t.deepEqual(movieClip.listFrames().map((frame) => frame.getSpriteId()), [
			'demo0001mc_0',
			'demo0001mc_1',
			'demo0001mc_0',
			'',
		]);
		t.deepEqual(
			movieClip
				.listFrames()
				.map((frame) => frame.getSpriteId())
				.filter((id, index, ids) => id && ids.indexOf(id) === index),
			['demo0001mc_0', 'demo0001mc_1'],
			'sprite IDs and insertion order follow the first frame that references each texture',
		);
		t.deepEqual(document.getRoot().listPackages()[0]?.listAtlases()[0]?.listSprites().map((sprite) => sprite.getItemId()), [
			'demo0001mc_1',
			'demo0001mc_0',
		]);
		t.is(source.readCalls.get('assets/Demo/clips/spinner.jta'), 1, 'publish reuses the global JTA preflight cache');
		t.true(decodedMimeTypes.includes('image/jpeg'), 'embedded JPEG bytes use the JPEG Blob MIME type');
		t.true(decodedMimeTypes.includes('image/png'), 'mixed embedded PNG bytes remain PNG');
		t.true(output.files.has('.fairygui-runtime/Demo.fui'));
		t.true(output.files.has('.fairygui-runtime/Demo_atlas0.png'));
	} finally {
		if (previousCanvas === undefined) delete globals.OffscreenCanvas;
		else globals.OffscreenCanvas = previousCanvas;
		if (previousCreateImageBitmap === undefined) delete globals.createImageBitmap;
		else globals.createImageBitmap = previousCreateImageBitmap;
	}
});

test.serial('publishBrowser preflights every package before creating or writing output', async (t) => {
	const globals = globalThis as Record<string, unknown>;
	const previousCanvas = globals.OffscreenCanvas;
	const previousCreateImageBitmap = globals.createImageBitmap;
	globals.OffscreenCanvas = BrowserCanvasStub;
	globals.createImageBitmap = async () => ({ width: 2, height: 2, close() {} });

	try {
		const source = new MemoryFileSystem();
		const output = new MemoryFileSystem();
		const document = new Document();
		addMovieClipPackage(document, source, 'First', 'first001', createTestJta([PNG], [{ textureIndex: 0 }]));
		addMovieClipPackage(document, source, 'Second', 'second01', createTestJta([PNG], [{ textureIndex: 2 }]));

		const result = await publishBrowser({
			document,
			sourceFileSystem: source,
			outputFileSystem: output,
			projectType: 'layabox',
			output: '.fairygui-runtime',
		});

		t.false(result.success);
		t.regex(result.diagnostics.at(-1)?.message ?? '', /texture index 2 is outside/);
		t.is(output.mkdirCalls, 0, 'global preflight fails before the first output directory is created');
		t.is(output.files.size, 0, 'global preflight fails before any package or atlas bytes are written');
		t.deepEqual(result.files, []);
	} finally {
		if (previousCanvas === undefined) delete globals.OffscreenCanvas;
		else globals.OffscreenCanvas = previousCanvas;
		if (previousCreateImageBitmap === undefined) delete globals.createImageBitmap;
		else globals.createImageBitmap = previousCreateImageBitmap;
	}
});

test.serial('publishBrowser publishes single-frame PNG/JPEG resources with same-ID cache isolation', async (t) => {
	const globals = globalThis as Record<string, unknown>;
	const previousCanvas = globals.OffscreenCanvas;
	const previousCreateImageBitmap = globals.createImageBitmap;
	globals.OffscreenCanvas = BrowserCanvasStub;
	globals.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

	try {
		const source = new MemoryFileSystem();
		const output = new MemoryFileSystem();
		const document = new Document();
		const pngMovieClip = addMovieClipPackage(
			document,
			source,
			'PngPackage',
			'pngpkg01',
			createTestJta([PNG], [{ textureIndex: 0 }]),
			'sharedmc',
		);
		const jpegMovieClip = addMovieClipPackage(
			document,
			source,
			'JpegPackage',
			'jpegpkg1',
			createTestJta([JPEG], [{ textureIndex: 0 }]),
			'sharedmc',
		);

		const result = await publishBrowser({
			document,
			sourceFileSystem: source,
			outputFileSystem: output,
			projectType: 'layabox',
			output: '.fairygui-runtime',
		});

		t.true(result.success, result.diagnostics.map((entry) => entry.message).join('\n'));
		t.deepEqual(pngMovieClip.listFrames().map((frame) => frame.getSpriteId()), ['sharedmc_0']);
		t.deepEqual(jpegMovieClip.listFrames().map((frame) => frame.getSpriteId()), ['sharedmc_0']);
		t.is(source.readCalls.get('assets/PngPackage/clips/spinner.jta'), 1);
		t.is(source.readCalls.get('assets/JpegPackage/clips/spinner.jta'), 1);
		t.true(output.files.has('.fairygui-runtime/PngPackage_atlas0.png'));
		t.true(output.files.has('.fairygui-runtime/JpegPackage_atlas0.png'));
	} finally {
		if (previousCanvas === undefined) delete globals.OffscreenCanvas;
		else globals.OffscreenCanvas = previousCanvas;
		if (previousCreateImageBitmap === undefined) delete globals.createImageBitmap;
		else globals.createImageBitmap = previousCreateImageBitmap;
	}
});

test.serial('publishBrowser skips an invalid unselected MovieClip during preflight', async (t) => {
	const globals = globalThis as Record<string, unknown>;
	const previousCanvas = globals.OffscreenCanvas;
	const previousCreateImageBitmap = globals.createImageBitmap;
	globals.OffscreenCanvas = BrowserCanvasStub;
	globals.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

	try {
		const source = new MemoryFileSystem();
		const output = new MemoryFileSystem();
		const document = new Document();
		addMovieClipPackage(document, source, 'Demo', 'demo0001', createTestJta([PNG], [{ textureIndex: 0 }]));
		const pkg = document.getRoot().listPackages()[0]!;
		const ignored = document.createMovieClipResource('ignored');
		ignored.setId('ignored1').setPath('/clips/').setFileName('ignored.jta');
		pkg.addResource(ignored);
		source.files.set(
			'assets/Demo/clips/ignored.jta',
			createTestJta([Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])], [{ textureIndex: 0 }]),
		);

		const result = await publishBrowser({
			document,
			sourceFileSystem: source,
			outputFileSystem: output,
			projectType: 'layabox',
			output: '.fairygui-runtime',
		});

		t.true(result.success, result.diagnostics.map((entry) => entry.message).join('\n'));
		t.is(source.readCalls.get('assets/Demo/clips/spinner.jta'), 1);
		t.false(source.readCalls.has('assets/Demo/clips/ignored.jta'));
	} finally {
		if (previousCanvas === undefined) delete globals.OffscreenCanvas;
		else globals.OffscreenCanvas = previousCanvas;
		if (previousCreateImageBitmap === undefined) delete globals.createImageBitmap;
		else globals.createImageBitmap = previousCreateImageBitmap;
	}
});

test.serial('publishBrowser rejects truncated and unsupported JTA textures before built-in output', async (t) => {
	const globals = globalThis as Record<string, unknown>;
	const previousCanvas = globals.OffscreenCanvas;
	const previousCreateImageBitmap = globals.createImageBitmap;
	globals.OffscreenCanvas = BrowserCanvasStub;
	let decoderCalls = 0;
	globals.createImageBitmap = async () => {
		decoderCalls += 1;
		return { width: 1, height: 1, close() {} };
	};

	try {
		const invalidTextures = [
			['truncated PNG', PNG.subarray(0, PNG.byteLength - 1), /Could not decode MovieClip/],
			['truncated JPEG', JPEG.subarray(0, JPEG.byteLength - 1), /Could not decode MovieClip/],
			['WebP', Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), /unsupported raster format/],
			['GIF', Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), /unsupported raster format/],
			['TIFF', Uint8Array.from([0x49, 0x49, 0x2a, 0x00]), /unsupported raster format/],
		] as const;

		for (const [name, texture, expectedMessage] of invalidTextures) {
			const source = new MemoryFileSystem();
			const output = new MemoryFileSystem();
			const document = new Document();
			addMovieClipPackage(document, source, 'Broken', 'broken01', createTestJta([texture], [{ textureIndex: 0 }]));

			const result = await publishBrowser({
				document,
				sourceFileSystem: source,
				outputFileSystem: output,
				projectType: 'layabox',
				output: '.fairygui-runtime',
			});

			t.false(result.success, name);
			t.regex(result.diagnostics.at(-1)?.message ?? '', expectedMessage, name);
			t.is(output.mkdirCalls, 0, `${name}: no built-in output directory`);
			t.is(output.files.size, 0, `${name}: no built-in output files`);
		}
		t.is(decoderCalls, 0, 'shared validation rejects invalid data before the browser host decoder');
	} finally {
		if (previousCanvas === undefined) delete globals.OffscreenCanvas;
		else globals.OffscreenCanvas = previousCanvas;
		if (previousCreateImageBitmap === undefined) delete globals.createImageBitmap;
		else globals.createImageBitmap = previousCreateImageBitmap;
	}
});
