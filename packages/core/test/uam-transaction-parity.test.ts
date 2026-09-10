import test from 'ava';
import {
	applyUamTransaction,
	createDefaultUamComponentProperties,
	createDefaultUamImageResourceProperties,
	createDefaultUamPlainTextProperties,
	liftDocumentToUamProject,
	materializeUamProject,
	UamTransactionError,
	validateTransactionSupport,
	validateUamProject,
	type UamTransactionOperation,
} from '../src/index.js';
import { isValidUamTextProperties } from '../src/uam/property-rules/text.js';
import { isValidUamImageProperties } from '../src/uam/property-rules/image.js';
import { isValidUamComponentInstanceProperties, isValidUamComponentPropertyOverride } from '../src/uam/property-rules/component-instance.js';
import { canApplyOperationsInUam } from '../src/uam/transaction-uam-apply.js';
import { createControllerModel, createLookGear, createSupportedProject } from './uam-transaction-fixtures.js';

const selector = { packageId: 'pkg001', componentResourceId: 'cmp001' };
const controllerSelector = { ...selector, controllerName: 'route-probe' };
// A real Document-only batch whose net effect is empty, without a test-only routing override.
const documentRoute: UamTransactionOperation[] = [
	{ kind: 'addController', selector: controllerSelector, controller: createControllerModel('route-probe') },
	{ kind: 'removeController', selector: controllerSelector },
];

function parityProject() {
	const doc = materializeUamProject(createSupportedProject());
	const pkg = doc.getRoot().getPackageById('pkg001')!;
	const component = doc.createComponent('Child').setId('child').setPath('/');
	pkg.addResource(component);
	pkg.addResource(
		doc.createMovieClipResource('clip.jta').setId('clip-resource').setFileName('clip.jta').setPath('/'),
	);
	const host = pkg.getResourceById('cmp001') as ReturnType<typeof doc.createComponent>;
	for (const child of [
		doc.createGRichTextField('rich'),
		doc.createGTextInput('input'),
		doc.createGGraph('graph'),
		doc.createGGroup('group'),
		doc.createGLoader('loader'),
		doc.createGLoader3D('loader3d'),
		doc.createGList('list'),
		doc.createGTree('tree'),
		doc.createGMovieClip('clip').setSrc('clip-resource').setPackageId('pkg001'),
		doc.createGComponent('instance').setSrc('child').setPackageId('pkg001'),
	])
		host.addChild(child.setId(child.getName()).setSize(20, 30));
	const project = liftDocumentToUamProject(doc);
	const resource = project.packages[0]!.resources.find((entry) => entry.id === 'cmp001')!;
	if (resource.kind !== 'component') throw new Error('Missing parity component');
	resource.component.controllers.push(createControllerModel());
	resource.component.displayList[1]!.gears.push(createLookGear());
	return project;
}

test('native and mixed Document batches preserve the same properties and existing behavior bindings', (t) => {
	const project = parityProject();
	const baseline = structuredClone(project);
	const resource = project.packages[0]!.resources.find((entry) => entry.id === 'cmp001')!;
	if (resource.kind !== 'component') throw new Error('Missing parity component');
	const operations: UamTransactionOperation[] = resource.component.displayList.flatMap((node) => [
		{
			kind: 'setDisplayNodeProps',
			selector: { ...selector, displayNodeId: node.id },
			props: {
				position: { x: 7, y: 9 },
				size: { width: 60, height: 40 },
				locked: true,
				aspect: true,
				minSize: { width: 10, height: 10 },
				maxSize: { width: 100, height: 100 },
				pivot: { x: 0.2, y: 0.8 },
				scale: { x: 1.2, y: 0.8 },
				skew: { x: 3, y: 4 },
				visible: false,
				touchable: false,
				grayed: true,
				alpha: 0.4,
				rotation: 30,
				tooltips: 'tip',
				customData: 'kept',
			},
		},
		{
			kind: 'setDisplayNodeProps',
			selector: { ...selector, displayNodeId: node.id },
			props: { pivotAsAnchor: true },
		},
	]);
	operations.push(
		{
			kind: 'setComponentProps',
			selector,
			props: {
				size: { width: 400, height: 240 },
				properties: { ...createDefaultUamComponentProperties(), opaque: true },
			},
		},
		{
			kind: 'setDisplayNodeProps',
			selector: { ...selector, displayNodeId: 'n1' },
			props: { textProperties: { ...createDefaultUamPlainTextProperties(), text: 'bulk', bold: true } },
		},
		{
			kind: 'setDisplayNodeProps',
			selector: { ...selector, displayNodeId: 'n1' },
			props: { text: 'override', fontSize: 22 },
		},
		{
			kind: 'setDisplayNodeProps',
			selector: { ...selector, displayNodeId: 'n0' },
			props: {
				imageProperties: {
					color: '#123456',
					flip: 1,
					fillMethod: 0,
					fillOrigin: 0,
					fillClockwise: true,
					fillAmount: 100,
				},
			},
		},
		{ kind: 'setResourceFavorite', selector: { packageId: 'pkg001', resourceId: 'img001' }, favorite: true },
		{ kind: 'setResourceExported', selector: { packageId: 'pkg001', resourceId: 'img001' }, exported: false },
		{
			kind: 'setImageResourceProps',
			selector: { packageId: 'pkg001', resourceId: 'img001' },
			props: { ...createDefaultUamImageResourceProperties(), duplicatePadding: true },
		},
		{ kind: 'updateProjectSettings', settings: { ...project.settings, common: { fontSize: 24 } } },
		{
			kind: 'updatePackageSettings',
			selector: { packageId: 'pkg001' },
			settings: { compressPNG: true, jpegQuality: 90, publish: project.packages[0]!.publish! },
		},
	);
	t.true(canApplyOperationsInUam(operations));
	t.false(canApplyOperationsInUam([...operations, ...documentRoute]));
	const native = applyUamTransaction(project, operations);
	const mixed = applyUamTransaction(project, [...operations, ...documentRoute]);
	t.deepEqual(mixed, native);
	t.deepEqual(project, baseline);
});

test('both routes clear instance overlays and preserve explicit empty, false and zero values', (t) => {
	const project = parityProject();
	const resource = project.packages[0]!.resources.find((entry) => entry.id === 'cmp001')!;
	if (resource.kind !== 'component') throw new Error('Missing parity component');
	const instance = resource.component.displayList.find((node) => node.id === 'instance')!;
	if (instance.kind !== 'component') throw new Error('Missing parity instance');
	instance.instanceProperties = {
		extensionType: 'Label',
		title: 'Before',
		icon: '',
		titleColor: '#123456',
		titleFontSize: 24,
		promptText: 'Prompt',
		sound: '',
		soundVolumeScale: 1,
	};
	const operations: UamTransactionOperation[] = [
		{
			kind: 'setDisplayNodeProps',
			selector: { ...selector, displayNodeId: instance.id },
			props: { componentInstanceProperties: null },
		},
		{
			kind: 'setDisplayNodeProps',
			selector: { ...selector, displayNodeId: 'n1' },
			props: { text: '', visible: false, alpha: 0, pivot: { x: 0, y: 0 }, pivotAsAnchor: false },
		},
	];
	t.true(canApplyOperationsInUam(operations));
	t.false(canApplyOperationsInUam([...operations, ...documentRoute]));
	const native = applyUamTransaction(project, operations);
	t.deepEqual(applyUamTransaction(project, [...operations, ...documentRoute]), native);
	const changed = native.packages[0]!.resources.find((entry) => entry.id === 'cmp001')!;
	if (changed.kind !== 'component') throw new Error('Missing changed component');
	t.false('instanceProperties' in changed.component.displayList.find((node) => node.id === instance.id)!);
	const text = changed.component.displayList.find((node) => node.id === 'n1')!;
	if (text.kind !== 'text') throw new Error('Missing changed text');
	t.deepEqual([text.text, text.visible, text.alpha, text.pivotAsAnchor], ['', false, 0, false]);
});

test('both routes report the same ordered failure and leave the input unchanged', (t) => {
	const project = parityProject();
	const baseline = structuredClone(project);
	const operations: UamTransactionOperation[] = [
		{
			kind: 'setDisplayNodeProps',
			opId: 'first',
			selector: { ...selector, displayNodeId: 'n1' },
			props: { text: 'temporary' },
		},
		{
			kind: 'setDisplayNodeProps',
			opId: 'missing',
			selector: { ...selector, displayNodeId: 'absent' },
			props: { text: 'fail' },
		},
	];
	const native = t.throws(() => applyUamTransaction(project, operations), { instanceOf: UamTransactionError })!;
	const mixed = t.throws(() => applyUamTransaction(project, [...operations, ...documentRoute]), {
		instanceOf: UamTransactionError,
	})!;
	t.deepEqual({ ...mixed, message: mixed.message }, { ...native, message: native.message });
	t.deepEqual(project, baseline);
});


test('shared property rules preserve ordered diagnostics and rejected transaction inputs', (t) => {
	const project = parityProject();
	const baseline = structuredClone(project);
	const invalid = structuredClone(project);
	const resource = invalid.packages[0]!.resources.find((entry) => entry.id === 'cmp001')!;
	if (resource.kind !== 'component') throw new Error('Missing parity component');
	const operations: UamTransactionOperation[] = [];
	const expectedProjectPaths: string[] = [];
	const fields: string[] = [];
	for (const [index, node] of resource.component.displayList.entries()) {
		let props: Extract<UamTransactionOperation, { kind: 'setDisplayNodeProps' }>['props'];
		if (node.id === 'n0' && node.kind === 'image') {
			node.fillAmount = 0;
			props = { imageProperties: { color: node.color, flip: node.flip, fillMethod: 0, fillOrigin: 0, fillClockwise: true, fillAmount: 0 } };
		} else if (node.id === 'n1' && node.kind === 'text') {
			node.fontSize = 0;
			props = { textProperties: { ...createDefaultUamPlainTextProperties(), fontSize: 0 } };
		} else if (node.id === 'clip' && node.kind === 'movieClip') {
			node.frame = -1;
			props = { movieClipProperties: { playing: node.playing, frame: -1, color: node.color } };
		} else if (node.id === 'instance' && node.kind === 'component') {
			node.instanceProperties = { extensionType: 'Slider', value: Number.NaN, min: 0, max: 1 };
			props = { componentInstanceProperties: node.instanceProperties };
		} else continue;
		operations.push({ kind: 'setDisplayNodeProps', selector: { ...selector, displayNodeId: node.id }, props });
		fields.push(Object.keys(props)[0]!);
		expectedProjectPaths.push('packages[0].resources[1].component.displayList[' + index + ']' + (node.kind === 'component' ? '.instanceProperties' : ''));
	}
	const invalidBaseline = structuredClone(invalid);
	t.deepEqual(validateUamProject(invalid).map(({ code, path }) => ({ code, path })),
		expectedProjectPaths.map((path) => ({ code: 'invalid_uam', path })));
	const operationBaseline = structuredClone(operations);
	const issues = validateTransactionSupport(project, operations);
	t.deepEqual(issues.map(({ code, path }) => ({ code, path })),
		fields.map((field, index) => ({ code: 'invalid_display_node_payload', path: 'operations[' + index + '].props.' + field })));
	for (const batch of [operations, [...operations, ...documentRoute]]) {
		t.throws(() => applyUamTransaction(project, batch), { instanceOf: UamTransactionError });
	}
	t.deepEqual(project, baseline);
	t.deepEqual(invalid, invalidBaseline);
	t.deepEqual(operations, operationBaseline);
});


test('property rule leaves distinguish missing fields, explicit defaults and extension snapshots', (t) => {
	const text = createDefaultUamPlainTextProperties();
	const image = { color: '#ffffff', flip: 0, fillMethod: 0, fillOrigin: 0, fillClockwise: true, fillAmount: 100 };
	const instance = { extensionType: 'Slider', value: 0, min: 0, max: 1 };
	const override = { target: 'label', propertyId: 0, value: '' };
	const baseline = structuredClone({ text, image, instance, override });
	t.true(isValidUamTextProperties(text, 'text'));
	t.true(isValidUamTextProperties(text, 'textInput'));
	t.false(isValidUamTextProperties(text, 'richText'));
	t.false(isValidUamTextProperties({ ...text, strokeSize: 0 }, 'text'));
	t.true(isValidUamTextProperties({ ...text, strokeColor: '#ffffff00', strokeSize: 0 }, 'text'));
	t.true(isValidUamImageProperties(image));
	t.false(isValidUamImageProperties({ ...image, fillAmount: 1 }));
	t.true(isValidUamImageProperties({ ...image, fillMethod: 1, fillAmount: 0 }));
	t.true(isValidUamComponentInstanceProperties(instance));
	t.false(isValidUamComponentInstanceProperties({ ...instance, max: undefined }));
	t.false(isValidUamComponentInstanceProperties({ ...instance, extra: true }));
	t.true(isValidUamComponentInstanceProperties({ extensionType: 'ScrollBar' }));
	t.false(isValidUamComponentInstanceProperties(null));
	t.true(isValidUamComponentPropertyOverride(override));
	t.false(isValidUamComponentPropertyOverride({ ...override, target: '' }));
	t.deepEqual({ text, image, instance, override }, baseline);
});
