import test from 'ava';
import {
	applyUamTransaction,
	createDefaultUamComponentProperties,
	createDefaultUamImageResourceProperties,
	createDefaultUamPlainTextProperties,
	liftDocumentToUamProject,
	materializeUamProject,
	UamTransactionError,
	type UamTransactionOperation,
} from '../src/index.js';
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
