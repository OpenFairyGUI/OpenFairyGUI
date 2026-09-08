import test from 'ava';
import { Document, GearType, applyUamTransaction, liftDocumentToUamProject, materializeUamProject, normalizeUamProject } from '../src/index.js';
import { _writeGear } from '../src/io/component-encoder-transition-gear.js';
import { WriteBuffer } from '../src/io/write-buffer.js';

test('all value gears retain an absent default through normalization, transactions and binary encoding', (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('Defaults').setId('defaults');
	const component = doc.createComponent('Host').setId('host').setSize(100, 100);
	pkg.addResource(component);
	const controller = doc.createController('state');
	for (const id of ['0', '1']) controller.addPage(doc.createControllerPage(id).setId(id));
	component.addController(controller);
	const cases = [
		[GearType.Size, '100,40,2,2'], [GearType.Look, '0.8,30,false,true'],
		[GearType.Color, '#654321'], [GearType.Animation, '8,p'], [GearType.FontSize, '40'],
	] as const;
	for (const [type, value] of cases) {
		const child = doc.createGTextField(`child${type}`).setId(`n${type}`)
			.setSize(80, 30).setScale(0.5, 0.75).setAlpha(0.4).setRotation(20)
			.setGrayed(true).setTouchable(false).setColor('#123456').setFontSize(28);
		child.addGear(doc.createGear().setGearType(type).setController(controller).setPages('1').setValues(value));
		component.addChild(child);
	}
	const lifted = normalizeUamProject(liftDocumentToUamProject(doc));
	const committed = applyUamTransaction(lifted, [{
		kind: 'setDisplayNodeProps',
		selector: { packageId: 'defaults', componentResourceId: 'host', displayNodeId: 'n2' },
		props: { position: { x: 15, y: 20 } },
	}]);
	const result = materializeUamProject(committed).getRoot().getPackage('Defaults')!.getComponent('Host')!;
	for (const [index, [type]] of cases.entries()) {
		const before = component.listChildren()[index]!.listGears()[0]!;
		const after = result.listChildren()[index]!.listGears()[0]!;
		t.is(after.getDefaultValue(), null, `gear ${type} inherits the owner on uncovered page 0`);
		const sourceBytes = new WriteBuffer(), resultBytes = new WriteBuffer();
		_writeGear(sourceBytes, before, type, component, 1);
		_writeGear(resultBytes, after, type, result, 1);
		t.deepEqual(resultBytes.toUint8Array(), sourceBytes.toUint8Array());
		t.deepEqual(resultBytes.getStringTable(), sourceBytes.getStringTable());
	}
});
