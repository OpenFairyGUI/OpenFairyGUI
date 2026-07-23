import test from 'ava';
import { Document, ProjectType } from '@openfairygui/core';
import { publishBrowser } from '../src/web.js';

const PNG = Uint8Array.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
	0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
	0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
	0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99,
	0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
	0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

class MemoryFileSystem {
	readonly files = new Map<string, Uint8Array>();

	async readFileRaw(path: string): Promise<Uint8Array> {
		const data = this.files.get(path);
		if (!data) throw new Error(`File not found: ${path}`);
		return data.slice();
	}

	async writeFileRaw(path: string, data: Uint8Array): Promise<void> {
		this.files.set(path, data.slice());
	}

	async mkdir(): Promise<void> {}

	join(...paths: string[]): string {
		return paths.filter(Boolean).join('/').replace(/\/+/g, '/');
	}
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

test('publishBrowser writes Layabox .fui and atlas PNG through browser file systems', async (t) => {
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


