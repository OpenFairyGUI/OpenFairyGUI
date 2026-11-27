import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {
	BinaryFormatError,
	Document,
	type GComponent,
	type GTextField,
	GearType,
	RelationType,
	validateSafeSvgSource,
} from '../src/index.js';
import { ByteBuffer } from '../src/io/byte-buffer.js';
import { WriteBuffer } from '../src/io/write-buffer.js';
import { NodeIO } from '../src/node.js';
import { parseScale9GridString } from '../src/utils/xml-utils.js';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

test('validateSafeSvgSource blocks XML numeric entities, unknown entities, and CSS escapes', (t) => {
	t.notThrows(() =>
		validateSafeSvgSource(
			utf8('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="#fff"/></svg>'),
		),
	);
	for (const payload of [
		'<svg xmlns="http://www.w3.org/2000/svg"><use href="&#106;avascript:alert(1)"/></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(&#x68;ttps://evil.example/a.svg#x)"/></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg"><rect fill="\\75rl(https://evil.example/a.svg#x)"/></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg"><rect data-x="&customEntity;"/></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg"><rect data-x="&#0;"/></svg>',
	]) {
		t.throws(() => validateSafeSvgSource(utf8(payload)), { message: /Invalid or unsafe SVG source/ }, payload);
	}
});

test('ProjectReader emits unsafe_path diagnostic for component path traversal and does not read outside package', async (t) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-core-unsafe-comp-'));
	t.teardown(() => fs.rm(root, { recursive: true, force: true }));
	const seed = new Document();
	seed.createPackage('Main').setId('pkgdemo1');
	const fairyPath = path.join(root, 'Demo.fairy');
	await new NodeIO().writeProject(seed, fairyPath);
	await fs.writeFile(path.join(root, 'secret.xml'), '<component size="10,10"><displayList/></component>');
	await fs.writeFile(
		path.join(root, 'assets', 'Main', 'package.xml'),
		'<?xml version="1.0" encoding="utf-8"?><packageDescription id="pkgdemo1"><resources><component id="c1" name="../../secret.xml" path="/"/></resources></packageDescription>',
	);

	const detailed = await new NodeIO().readProjectDetailed(fairyPath);
	t.true(
		detailed.diagnostics.some((entry) => entry.code === 'unsafe_path'),
		JSON.stringify(detailed.diagnostics),
	);
	const comp = detailed.document
		?.getRoot()
		.getPackageById('pkgdemo1')
		?.listComponents()
		.find((entry) => entry.getId() === 'c1');
	t.is(comp?.getWidth(), 0);
});

test('GComboBox, GProgressBar, and GSlider instance extension properties round-trip via Project XML', async (t) => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-core-ext-rt-'));
	t.teardown(() => fs.rm(dir, { recursive: true, force: true }));
	const doc = new Document();
	const pkg = doc.createPackage('Main').setId('pkg001');
	const host = doc.createComponent('Host').setId('host1').setPath('/').setSize(300, 200);
	const comboDef = doc.createComponent('ComboDef').setId('cmb1').setPath('/').setExtensionType('ComboBox');
	const barDef = doc.createComponent('BarDef').setId('bar1').setPath('/').setExtensionType('ProgressBar');
	const sliderDef = doc.createComponent('SliderDef').setId('sld1').setPath('/').setExtensionType('Slider');
	pkg.addResource(host).addResource(comboDef).addResource(barDef).addResource(sliderDef);

	const combo = doc
		.createGComboBox('combo')
		.setId('n1')
		.setSrc('cmb1')
		.setTitle('Choose')
		.setItems(['One', 'Two'])
		.setValues(['1', '2'])
		.setVisibleItemCount(5);
	const bar = doc.createGProgressBar('bar').setId('n2').setSrc('bar1').setValue(42).setMax(200);
	const slider = doc.createGSlider('slider').setId('n3').setSrc('sld1').setValue(75).setMax(150);
	host.addChild(combo).addChild(bar).addChild(slider);

	const fairyPath = path.join(dir, 'Demo.fairy');
	await new NodeIO().writeProject(doc, fairyPath);
	const reread = await new NodeIO().readProject(fairyPath);
	const rereadHost = reread
		.getRoot()
		.getPackageById('pkg001')
		?.listComponents()
		.find((entry) => entry.getId() === 'host1');
	t.truthy(rereadHost);
	const [rCombo, rBar, rSlider] = rereadHost!.listChildren() as [GComponent?, GComponent?, GComponent?];
	t.is(rCombo?.getInstanceExtType(), 'ComboBox');
	t.is(rCombo?.getInstanceTitle(), 'Choose');
	t.is(rCombo?.getInstanceVisibleItemCount(), 5);
	t.deepEqual(
		rCombo
			?.getInstanceComboItems()
			.map((item: { title: string | null; value: string | null }) => [item.title, item.value]),
		[
			['One', '1'],
			['Two', '2'],
		],
	);
	t.is(rBar?.getInstanceExtType(), 'ProgressBar');
	t.is(rBar?.getInstanceValue(), 42);
	t.is(rBar?.getInstanceMax(), 200);
	t.is(rSlider?.getInstanceExtType(), 'Slider');
	t.is(rSlider?.getInstanceValue(), 75);
	t.is(rSlider?.getInstanceMax(), 150);
});

test('Property.equals and copy handle nested objects/arrays safely without aliasing', (t) => {
	const doc = new Document();
	const a = doc.createGComboBox('a').setItems(['x', 'y']);
	const b = doc.createGComboBox('b').setItems(['x', 'y']);
	const c = doc.createGComboBox('c').setItems(['x', 'z']);
	t.true(a.equals(b, new Set(['name'])));
	t.false(a.equals(c, new Set(['name'])));

	const cloned = doc.createGComboBox('cloned').copy(a);
	cloned.getItems().push('mutated');
	t.deepEqual(a.getItems(), ['x', 'y']);
});

test('WriteBuffer(0), ByteBuffer.getUint8/getInt8, parseScale9GridString, and BinaryReader block bounds', async (t) => {
	const wb = new WriteBuffer(0);
	wb.writeUint8(0xfe);
	wb.skip(2);
	const bytes = wb.toUint8Array();
	t.deepEqual([...bytes], [0xfe, 0, 0]);

	const bb = new ByteBuffer(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	t.is(bb.getUint8(), 0xfe);
	t.is(bb.getInt8(), 0);
	t.is(bb.pos, 2);

	t.is(parseScale9GridString('1,2,NaN,4'), null);
	t.deepEqual(parseScale9GridString('1,2,3,4'), [1, 2, 3, 4]);

	// Missing mandatory blocks in binary package throws BinaryFormatError.
	const bad = new WriteBuffer(64);
	bad.writeUint32(0x46475549); // FGUI magic
	bad.writeInt32(7); // version
	bad.writeBool(false); // uncompressed
	bad.writeUTFString('pkg01');
	bad.writeUTFString('Bad');
	bad.skip(20);
	bad.writeUint8(0); // 0 blocks -> missing mandatory block 4
	const badBytes = bad.toUint8Array();
	class MemIO extends NodeIO {
		protected override createFileSystem() {
			return { ...super.createFileSystem(), readFileRaw: async () => badBytes };
		}
	}
	await t.throwsAsync(new MemIO().readBinary('bad.fui'), { instanceOf: BinaryFormatError });
});

test('Component XML preserves multiline/tab attributes, Gear.customEasePath, and RelationType.Size', async (t) => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-core-xml-rt-'));
	t.teardown(() => fs.rm(dir, { recursive: true, force: true }));
	const doc = new Document();
	const pkg = doc.createPackage('Main').setId('pkg001');
	const comp = doc.createComponent('Panel').setId('cmp001').setPath('/').setSize(200, 100);
	pkg.addResource(comp);
	const ctrl = doc.createController('state');
	ctrl.addPage(doc.createControllerPage('p0').setId('0'));
	ctrl.addPage(doc.createControllerPage('p1').setId('1'));
	comp.addController(ctrl);

	const label = doc.createGTextField('label').setId('n1').setText('Line1\n\tLine2');
	label.setRelations([{ target: '', type: RelationType.Size, usePercent: false }]);
	const gear = doc
		.createGear('g1')
		.setGearType(GearType.XY)
		.setController(ctrl)
		.setPages('0,1')
		.setValues('0,0|10,10')
		.setTween(true)
		.setEaseType(31)
		.setCustomEasePath('M0,0 C0.2,0.8 0.8,0.2 1,1');
	label.addGear(gear);
	comp.addChild(label);

	const fairyPath = path.join(dir, 'Demo.fairy');
	await new NodeIO().writeProject(doc, fairyPath);
	const rawXml = await fs.readFile(path.join(dir, 'assets', 'Main', 'Panel.xml'), 'utf8');
	t.true(rawXml.includes('&#xA;') && rawXml.includes('&#x9;'));
	t.true(rawXml.includes('sidePair="width-width,height-height"'));
	t.true(rawXml.includes('customEase="M0,0 C0.2,0.8 0.8,0.2 1,1"'));

	const reread = await new NodeIO().readProject(fairyPath);
	const rereadLabel = reread
		.getRoot()
		.getPackageById('pkg001')
		?.listComponents()
		.find((entry) => entry.getId() === 'cmp001')
		?.listChildren()[0] as GTextField | undefined;
	t.is(rereadLabel?.getText(), 'Line1\n\tLine2');
	t.is(rereadLabel?.listGears()[0]?.getCustomEasePath(), 'M0,0 C0.2,0.8 0.8,0.2 1,1');
});
