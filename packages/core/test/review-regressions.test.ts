import { isValidUamComponentInstanceProperties } from '../src/uam/property-rules/component-instance.js';
import { encodeComponent } from '../src/io/component-encoder.js';
import { decodeComponentDefinition } from '../src/io/component-decoder.js';
import { ByteBuffer } from '../src/io/byte-buffer.js';
import { WriteBuffer } from '../src/io/write-buffer.js';
import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as root from '../src/index.js';
import * as uam from '../src/uam/index.js';
import { NodeIO } from '../src/node.js';
import { createFileSystemAccessFileSystem } from '../src/web.js';
import { validateProjectedState, validateProjectedGroupState } from '../src/uam/preflight/projected-state.js';
import { PROJECT_XML_PROTOCOL } from '../src/io/project-xml-protocol.js';

test('root and UAM entry exports share the complete runtime surface', (t) => {
	for (const key of Object.keys(uam) as Array<keyof typeof uam>) t.is(root[key], uam[key], key);
	// @ts-expect-error Protocol keys must reject spelling mistakes at compile time.
	t.is(PROJECT_XML_PROTOCOL.labelExtension.attrs.promtp, undefined);
});

test('component numeric and collection getters have concrete defaults', (t) => {
	const component = new root.Document().createGComponent();
	for (const name of Object.getOwnPropertyNames(root.GComponent.prototype)) {
		if (!name.startsWith('get') || name === 'getComponentProp' || name === 'getDefaults') continue;
		const getter = Reflect.get(component, name) as () => unknown;
		t.not(getter.call(component), undefined, name);
	}
});

test('Button overrides and Label prompt survive binary and XML re-encoding', async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-review-'));
	t.teardown(() => fs.rm(directory, { recursive: true, force: true }));
	let doc = new root.Document();
	const pkg = doc.createPackage('Review').setId('review01');
	const component = doc.createComponent('Host').setId('host').setSize(200, 100);
	pkg.addResource(component);
	component.addController(
		doc.createController('choice').addPage(doc.createControllerPage('Selected').setId('selected')),
	);
	component.addChild(
		doc
			.createGButton('button')
			.setId('button')
			.setTitle('Title')
			.setSelectedTitle('Selected')
			.setTitleColor('#000000')
			.setController('choice')
			.setPage('selected')
			.setChecked(true)
			.setSound('click.mp3')
			.setSoundVolumeScale(0.25),
	);
	component.addChild(
		doc.createGLabel('label').setId('label').setTitle('Label').setInstancePromptText('Enter a name'),
	);
	const io = new NodeIO();
	for (let iteration = 0; iteration < 2; iteration++) {
		const output = path.join(directory, `round-${iteration}.bytes`);
		await io.writeBinary(doc, output);
		doc = await io.readBinary(output);
		const children = doc.getRoot().listPackages()[0]!.listComponents()[0]!.listChildren();
		const button = children[0] as root.GButton;
		t.is(button.getController(), 'choice');
		t.is(button.getPage(), 'selected');
		t.true(button.getChecked());
		t.is(button.getTitleColor(), '#000000');
		t.is(button.getSoundVolumeScale(), 0.25);
		t.is(button.getSound(), 'click.mp3');
		t.is((children[1] as root.GLabel).getInstancePromptText(), 'Enter a name');
	}
	const lifted = root.liftDocumentToUamProject(doc);
	const materialized = root.materializeUamProject(lifted);
	t.deepEqual(root.liftDocumentToUamProject(materialized), lifted);
	const source = path.join(directory, 'source', 'Review.fairy');
	await fs.mkdir(path.dirname(source));
	await io.writeProject(doc, source);
	const reread = await io.readProject(source);
	const children = reread.getRoot().listPackages()[0]!.listComponents()[0]!.listChildren() as root.GComponent[];
	t.true(children[0].getInstanceChecked());
	t.is(children[0].getInstanceController(), 'choice');
	t.is(children[1].getInstancePromptText(), 'Enter a name');
});

test('projection exceptions fail closed with a support issue', (t) => {
	const project = {
		get packages() {
			throw new Error('projection fault');
		},
	} as unknown as uam.UamProject;
	for (const validate of [validateProjectedState, validateProjectedGroupState]) {
		const issues: uam.UamTransactionSupportIssue[] = [];
		const operations: uam.UamTransactionOperation[] =
			validate === validateProjectedState
				? []
				: [{ kind: 'renameResource', selector: { packageId: 'p', resourceId: 'c' }, newName: 'Name' }];
		validate(project, operations, issues);
		t.is(issues[0]?.code, 'projection_failed');
	}
	const issues: uam.UamTransactionSupportIssue[] = [];
	validateProjectedGroupState(
		root.liftDocumentToUamProject(new root.Document()),
		[
			{ kind: 'renameResource', selector: { packageId: 'p', resourceId: 'c' }, newName: 'Name' },
			{ kind: 'removePackage', opId: 'missing', selector: { packageId: 'missing' } },
		],
		issues,
	);
	t.is(issues[0]?.code, 'projection_failed');
	t.is(issues[0]?.operationIndex, 1);
	t.is(issues[0]?.operationId, 'missing');
});

test('filesystem existence preserves access failures', async (t) => {
	const denied = new DOMException('denied', 'NotAllowedError');
	const web = createFileSystemAccessFileSystem({
		kind: 'directory',
		name: 'root',
		async getFileHandle() {
			throw denied;
		},
		async getDirectoryHandle() {
			throw denied;
		},
	});
	t.is(await t.throwsAsync(web.exists('file')), denied);
	class InspectableNodeIO extends NodeIO {
		fileSystem() {
			return this.createFileSystem();
		}
	}
	const node = new InspectableNodeIO().fileSystem();
	await t.throwsAsync(node.exists('\0'));
	t.false(await node.exists(path.join(os.tmpdir(), `ofgui-missing-${crypto.randomUUID()}`)));
});

test('Label input settings preserve null, empty and non-default values through binary and UAM', async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-label-input-'));
	t.teardown(() => fs.rm(directory, { recursive: true, force: true }));
	const inputs = [
		null,
		{ promptText: null, restrict: null, maxLength: 0, keyboardType: 0, password: false },
		{ promptText: '', restrict: '0-9', maxLength: 12, keyboardType: 3, password: true },
		{ promptText: 'Prompt', restrict: '', maxLength: 5, keyboardType: 2, password: false },
	];
	for (const input of inputs) {
		for (const concrete of [true, false]) {
			let doc = new root.Document();
			const pkg = doc.createPackage('Input').setId('input001');
			const component = doc.createComponent('Host').setId('host');
			pkg.addResource(component);
			const child = concrete
				? doc.createGLabel('label')
				: doc.createGComponent('label').setInstanceExtType('Label');
			component.addChild(child.setId('label').setInstanceLabelInputSettings(input));
			const io = new NodeIO();
			for (let iteration = 0; iteration < 2; iteration++) {
				const binary = path.join(directory, 'Input.bytes');
				await io.writeBinary(doc, binary);
				doc = await io.readBinary(binary);
				doc = root.materializeUamProject(root.liftDocumentToUamProject(doc));
				const actual = doc.getRoot().listPackages()[0].listComponents()[0].listChildren()[0] as root.GComponent;
				t.deepEqual(actual.getInstanceLabelInputSettings(), input);
			}
			if (input)
				await t.throwsAsync(io.writeProject(doc, path.join(directory, 'Input.fairy')), {
					message: /cannot be represented losslessly/,
				});
		}
	}
});

test('published Label input block survives decoding and re-encoding without defaulting fields', (t) => {
	const doc = new root.Document(),
		pkg = doc.createPackage('P').setId('pkgtest1');
	const component = doc.createComponent('Host').setId('host');
	pkg.addResource(component);
	component.addChild(doc.createGLabel('L').setId('label').setInstancePromptText('Input'));
	const parent = new WriteBuffer();
	const bytes = encodeComponent(component, doc, pkg, 6, parent);
	const reader = new ByteBuffer(bytes.buffer, bytes.byteOffset, bytes.length);
	reader.seek(0, 2);
	reader.getInt16();
	reader.getInt16();
	const childStart = reader.pos;
	reader.seek(childStart, 6);
	reader.skip(5);
	if (reader.readBool()) reader.skip(4);
	reader.skip(4);
	t.true(reader.readBool());
	reader.skip(2);
	const offset = reader.pos;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
	view.setInt32(offset + 2, 12);
	view.setInt32(offset + 6, 3);
	view.setUint8(offset + 10, 1);
	reader.version = 6;
	reader.stringTable = parent.getStringTable();
	const decoded = doc.createComponent('Decoded').setId('decoded');
	decodeComponentDefinition(decoded, reader, 0, doc);
	t.deepEqual((decoded.listChildren()[0] as root.GComponent).getInstanceLabelInputSettings(), {
		promptText: 'Input',
		restrict: null,
		maxLength: 12,
		keyboardType: 3,
		password: true,
	});
	const nextParent = new WriteBuffer();
	const output = encodeComponent(decoded, doc, pkg, 6, nextParent);
	const next = new ByteBuffer(output.buffer, output.byteOffset, output.length);
	next.version = 6;
	next.stringTable = nextParent.getStringTable();
	const twice = doc.createComponent('Twice');
	decodeComponentDefinition(twice, next, 0, doc);
	t.deepEqual(
		(twice.listChildren()[0] as root.GComponent).getInstanceLabelInputSettings(),
		(decoded.listChildren()[0] as root.GComponent).getInstanceLabelInputSettings(),
	);
});

test('Label input snapshots reject invalid fields and preserve explicit defaults', (t) => {
	const base = {
		extensionType: 'Label',
		title: '',
		icon: '',
		titleColor: '',
		titleFontSize: 0,
		sound: '',
		soundVolumeScale: 1,
	};
	const input = { promptText: null, restrict: '', maxLength: 12, keyboardType: 3, password: true };
	t.true(isValidUamComponentInstanceProperties({ ...base, inputSettings: input }));
	t.true(isValidUamComponentInstanceProperties({ ...base, inputSettings: null }));
	for (const patch of [
		{ maxLength: -1 },
		{ maxLength: 0.5 },
		{ keyboardType: 2147483648 },
		{ password: 'true' },
		{ restrict: 1 },
		{ extra: true },
	]) {
		t.false(isValidUamComponentInstanceProperties({ ...base, inputSettings: { ...input, ...patch } }));
	}
});
