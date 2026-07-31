import test from 'ava';
import {
	UamTransactionError,
	applyUamTransaction,
	assertTransactionSupported,
	createDefaultUamImageResourceProperties,
	createDefaultUamPlainTextProperties,
	createDefaultUamTextProperties,
	normalizeUamProject,
	validateTransactionSupport,
	validateUamProject,
	type UamButtonNode,
	type UamComponentRefNode,
	type UamDisplayNode,
	type UamDisplayNodePropsUpdate,
	type UamGraphProperties,
	type UamImageResourceProperties,
	type UamListNode,
	type UamListProperties,
	type UamLoader3DProperties,
	type UamLoaderProperties,
	type UamTransactionOperation,
	type UamTreeProperties,
} from '../src/index.js';

import {
	LAYABOX_PROJECT_PATH,
	createControllerModel,
	createDisplayNodeBase,
	createListNodeBase,
	createLookGear,
	createSupportedProject,
	createTransitionModel,
	roundTripCommittedProject,
} from './uam-transaction-fixtures.js';
import { NodeIO } from '../src/node.js';
import { readProjectAsUam } from '../src/uam/index.js';

const DISPLAY_NODE_BASE_KEYS = [
	'kind',
	'id',
	'name',
	'position',
	'size',
	'pivot',
	'pivotAsAnchor',
	'visible',
	'touchable',
	'grayed',
	'alpha',
	'rotation',
	'customData',
	'relations',
	'gears',
	'group',
] as const;

function readSpecificProperties<T>(node: UamDisplayNode): T {
	const snapshot = structuredClone(node) as unknown as Record<string, unknown>;
	for (const key of DISPLAY_NODE_BASE_KEYS) delete snapshot[key];
	return snapshot as T;
}

test('image resource properties survive transaction, save/reload, inverse, and second reload', async (t) => {
	const project = await readProjectAsUam(new NodeIO(), LAYABOX_PROJECT_PATH, { hydrateResourceBytes: true });
	const pkg = project.packages.find((candidate) => candidate.resources.some((resource) => (
		resource.kind === 'image'
		&& resource.sourceBytes instanceof Uint8Array
		&& resource.sourceBytes.length > 0
		&& (resource.dimensions?.width ?? 0) > 4
		&& (resource.dimensions?.height ?? 0) > 4
	)));
	const image = pkg?.resources.find((resource) => (
		resource.kind === 'image'
		&& resource.sourceBytes instanceof Uint8Array
		&& resource.sourceBytes.length > 0
		&& (resource.dimensions?.width ?? 0) > 4
		&& (resource.dimensions?.height ?? 0) > 4
	));
	if (!pkg || !image || image.kind !== 'image' || !image.dimensions || !image.sourceBytes) {
		t.fail('expected a hydrated real image resource');
		return;
	}

	const selector = { packageId: pkg.id, resourceId: image.id };
	const originalProps = structuredClone(image.image);
	const originalBytes = new Uint8Array(image.sourceBytes);
	const updatedProps: UamImageResourceProperties = {
		textureSetMode: 'alone_npot',
		qualityOption: 'custom',
		quality: 72,
		smoothing: !originalProps.smoothing,
		duplicatePadding: !originalProps.duplicatePadding,
		scaleOption: 1,
		scale9Grid: [1, 1, image.dimensions.width - 2, image.dimensions.height - 2],
		tileGridIndice: 5,
	};
	const forward: UamTransactionOperation = {
		kind: 'setImageResourceProps',
		selector,
		props: updatedProps,
	};

	t.deepEqual(validateTransactionSupport(project, [forward]), []);
	const applied = applyUamTransaction(project, [forward]);
	const appliedImage = applied.packages.find((candidate) => candidate.id === pkg.id)?.resources
		.find((resource) => resource.id === image.id);
	if (!appliedImage || appliedImage.kind !== 'image') {
		t.fail('expected applied image resource');
		return;
	}
	t.deepEqual(appliedImage.image, updatedProps);
	t.deepEqual(appliedImage.sourceBytes, originalBytes);

	const committed = await roundTripCommittedProject(applied);
	const committedImage = committed.packages.find((candidate) => candidate.id === pkg.id)?.resources
		.find((resource) => resource.id === image.id);
	if (!committedImage || committedImage.kind !== 'image') {
		t.fail('expected committed image resource');
		return;
	}
	t.deepEqual(committedImage.image, updatedProps);
	t.deepEqual(committedImage.sourceBytes, originalBytes);

	const restored = await roundTripCommittedProject(applyUamTransaction(committed, [{
		kind: 'setImageResourceProps',
		selector,
		props: originalProps,
	}]));
	const restoredImage = restored.packages.find((candidate) => candidate.id === pkg.id)?.resources
		.find((resource) => resource.id === image.id);
	if (!restoredImage || restoredImage.kind !== 'image') {
		t.fail('expected restored image resource');
		return;
	}
	t.deepEqual(restoredImage.image, originalProps);
	t.deepEqual(restoredImage.sourceBytes, originalBytes);

	const nonImage = pkg.resources.find((resource) => resource.kind !== 'image');
	t.truthy(nonImage);
	const invalidTargetIssues = validateTransactionSupport(project, [{
		...forward,
		selector: { packageId: pkg.id, resourceId: nonImage!.id },
	}]);
	t.true(invalidTargetIssues.some((issue) => issue.code === 'invalid_resource_selector'));
	const invalidGridIssues = validateTransactionSupport(project, [{
		...forward,
		props: {
			...updatedProps,
			scale9Grid: [0, 0, 0, image.dimensions.height],
		},
	}]);
	t.true(invalidGridIssues.some((issue) => issue.code === 'invalid_resource_payload'));
	const incompleteProps = structuredClone(updatedProps) as Partial<UamImageResourceProperties>;
	delete incompleteProps.quality;
	const incompleteIssues = validateTransactionSupport(project, [{
		...forward,
		props: incompleteProps as UamImageResourceProperties,
	}]);
	t.true(incompleteIssues.some((issue) => issue.code === 'invalid_resource_payload'));
});

test('assertTransactionSupported accepts current materialization scope and rejects unsupported cross-package refs', (t) => {
	const buttonNodeProject = createSupportedProject();
	const componentResource = buttonNodeProject.packages[0]!.resources[1];
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	componentResource.component.displayList.push({
		kind: 'button',
		id: 'n2',
		name: 'button',
		position: { x: 0, y: 0 },
		size: { width: 10, height: 10 },
		visible: true,
		touchable: true,
		grayed: false,
		alpha: 1,
		rotation: 0,
		customData: '',
		relations: [],
		gears: [],
		src: '',
		packageId: '',
		title: 'Button',
		icon: '',
		titleColor: '#000000',
		titleFontSize: 12,
		sound: '',
		soundVolumeScale: 1,
		selectedTitle: '',
		selectedIcon: '',
		mode: 0,
		downEffect: 0,
		downEffectValue: 0.8,
	});
	t.notThrows(() => assertTransactionSupported(buttonNodeProject));

	const nonLookGearProject = createSupportedProject();
	const nonLookComponent = nonLookGearProject.packages[0]!.resources[1];
	if (nonLookComponent?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	(nonLookComponent.component.displayList[0]!.gears as any[]).push({
		kind: 'xy',
		name: 'xy-gear',
		controllerName: 'state',
		states: [],
		defaultValue: { x: 0, y: 0 },
		condition: '',
		positionsInPercent: false,
		tween: false,
		tweenDuration: 0.3,
		tweenDelay: 0,
		easeType: 5,
		customEasePath: '',
	});
	t.notThrows(() => assertTransactionSupported(nonLookGearProject));

	const crossPackageImageRefProject = createSupportedProject();
	crossPackageImageRefProject.packages.push({
		id: 'pkg002',
		name: 'Shared',
		publish: null,
		resources: [
			{
				kind: 'image',
				id: 'img002',
				name: 'shared.png',
				path: '/',
				exported: true,
				favorite: false,
				branch: '',
				branchItemIds: [],
				fileName: 'shared.png',
				dimensions: { width: 16, height: 16 },
				image: createDefaultUamImageResourceProperties(),
			},
		],
	});
	const crossPackageComponent = crossPackageImageRefProject.packages[0]!.resources[1];
	if (crossPackageComponent?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	(crossPackageComponent.component.displayList[0] as any).resource = {
		packageId: 'pkg002',
		resourceId: 'img002',
	};
	t.throws(
		() => assertTransactionSupported(crossPackageImageRefProject),
		{ instanceOf: UamTransactionError },
	);
});

test('validateTransactionSupport accepts supported baseline nodes and fields', (t) => {
	const project = createSupportedProject();
	const componentResource = project.packages[0]!.resources[1];
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	const supportedComponentNode: UamComponentRefNode = {
		kind: 'component',
		id: 'n2',
		name: 'sub',
		position: { x: 0, y: 0 },
		size: { width: 10, height: 10 },
		visible: true,
		touchable: true,
		grayed: false,
		alpha: 1,
		rotation: 0,
		customData: '',
		relations: [],
		gears: [],
		resource: { packageId: 'pkg001', resourceId: 'cmp001' },
	};
	const supportedListNode: UamListNode = {
		kind: 'list',
		id: 'n3',
		name: 'menu',
		position: { x: 8, y: 12 },
		size: { width: 180, height: 96 },
		visible: true,
		touchable: true,
		grayed: false,
		alpha: 0.9,
		rotation: 0,
		customData: 'list-passthrough',
		relations: [],
		gears: [],
		group: '',
		layout: 2,
		align: 1,
		vAlign: 0,
		lineGap: 4,
		columnGap: 6,
		lineCount: 2,
		columnCount: 3,
		selectionMode: 1,
		defaultItem: 'ui://pkg001/item',
		autoResizeItem: false,
		childrenRenderOrder: 1,
		apexIndex: 0,
		src: 'ui://pkg001/list',
		overflow: 2,
		scrollType: 1,
		scrollBarFlags: 7,
		scrollBarMargin: { top: 1, bottom: 2, left: 3, right: 4 },
		vtScrollBarRes: 'ui://pkg001/vbar',
		hzScrollBarRes: 'ui://pkg001/hbar',
		headerRes: 'ui://pkg001/header',
		footerRes: 'ui://pkg001/footer',
		margin: { top: 5, bottom: 6, left: 7, right: 8 },
		clipSoftness: { x: 2, y: 3 },
		scrollItemToViewOnClick: false,
		foldInvisibleItems: true,
		listItems: [
			{
				title: 'Item',
				icon: 'ui://pkg001/icon',
				url: 'ui://pkg001/item',
				name: 'item0',
				selectedTitle: 'Item selected',
				selectedIcon: 'ui://pkg001/icon-selected',
				level: 0,
				isFolder: null,
				controllers: 'state',
			},
		],
		pageController: 'state',
		controllerOverrides: 'state=0',
		selectionController: 'state',
	};
	const unsupportedButtonNode: UamButtonNode = {
		kind: 'button',
		id: 'n4',
		name: 'button',
		position: { x: 30, y: 40 },
		size: { width: 96, height: 28 },
		visible: true,
		touchable: true,
		grayed: false,
		alpha: 1,
		rotation: 0,
		customData: 'button-passthrough',
		relations: [],
		gears: [],
		src: 'ui://pkg001/button',
		packageId: 'pkg001',
		title: 'Button',
		icon: 'ui://pkg001/button-icon',
		titleColor: '#112233',
		titleFontSize: 14,
		sound: 'click',
		soundVolumeScale: 0.75,
		selectedTitle: 'Selected',
		selectedIcon: 'ui://pkg001/button-selected-icon',
		mode: 2,
		downEffect: 1,
		downEffectValue: 0.6,
	};
	componentResource.component.displayList.push(supportedComponentNode, supportedListNode, unsupportedButtonNode);
	componentResource.component.controllers.push(createControllerModel('state'));
	(componentResource.component.displayList[0]!.gears as any[]).push({
		kind: 'xy',
		name: 'xy-gear',
		controllerName: 'state',
		states: [],
		defaultValue: { x: 0, y: 0 },
		condition: '',
		positionsInPercent: false,
		tween: false,
		tweenDuration: 0.3,
		tweenDelay: 0,
		easeType: 5,
		customEasePath: '',
	});

	const normalizedProject = normalizeUamProject(project);
	const normalizedComponent = normalizedProject.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (normalizedComponent?.kind !== 'component') {
		t.fail('expected normalized component resource');
		return;
	}
	const untouchedComponentSnapshot = structuredClone(normalizedComponent.component.displayList.find((node) => node.id === 'n2'));
	const untouchedListSnapshot = structuredClone(normalizedComponent.component.displayList.find((node) => node.id === 'n3'));
	const untouchedButtonSnapshot = structuredClone(normalizedComponent.component.displayList.find((node) => node.id === 'n4'));

	t.deepEqual(validateTransactionSupport(normalizedProject), []);
	t.deepEqual(validateTransactionSupport(normalizedProject, []), []);
	t.deepEqual(validateTransactionSupport(normalizedProject, [
		{
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
			props: { text: 'Scoped Update' },
		},
	]), []);

	const result = applyUamTransaction(normalizedProject, [
		{
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
			props: { text: 'Scoped Update' },
		},
	]);
	const resultComponent = result.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	t.is(resultComponent?.kind, 'component');
	if (resultComponent?.kind !== 'component') return;
	const textNode = resultComponent.component.displayList.find((node) => node.id === 'n1');
	t.is(textNode?.kind, 'text');
	if (textNode?.kind === 'text') t.is(textNode.text, 'Scoped Update');
	t.deepEqual(resultComponent.component.displayList.find((node) => node.id === 'n2'), untouchedComponentSnapshot);
	t.deepEqual(resultComponent.component.displayList.find((node) => node.id === 'n3'), untouchedListSnapshot);
	t.deepEqual(resultComponent.component.displayList.find((node) => node.id === 'n4'), untouchedButtonSnapshot);

	const buttonNodeIssues = validateTransactionSupport(normalizedProject, [
		{
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n4' },
			props: { alpha: 0.5 },
		},
	]);
	t.deepEqual(buttonNodeIssues, []);
});

test('applyUamTransaction leaves untouched invalid baseline refs as passthrough for simple display props', (t) => {
	const project = createSupportedProject();
	const componentResource = project.packages[0]!.resources[1];
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	componentResource.component.displayList[0]!.relations.push({
		targetNodeId: '',
		type: 0,
		usePercent: false,
	});

	const result = applyUamTransaction(project, [
		{
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' },
			props: {
				position: { x: 24, y: 32 },
				text: 'Scoped edit',
			},
		},
	]);
	const resultComponent = result.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	t.is(resultComponent?.kind, 'component');
	if (resultComponent?.kind !== 'component') return;
	t.deepEqual(resultComponent.component.displayList[0]?.relations, [
		{
			targetNodeId: '',
			type: 0,
			usePercent: false,
		},
	]);
	const title = resultComponent.component.displayList.find((node) => node.id === 'n1');
	t.is(title?.kind, 'text');
	if (title?.kind === 'text') {
		t.deepEqual(title.position, { x: 24, y: 32 });
		t.is(title.text, 'Scoped edit');
	}
});

test('setDisplayNodeProps preserves pivot and anchor through save/reload and inverse', async (t) => {
	const project = normalizeUamProject(createSupportedProject());
	const selector = { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' };
	const forward: UamTransactionOperation[] = [{
		kind: 'setDisplayNodeProps',
		selector,
		props: { pivot: { x: 0.25, y: 0.5 }, pivotAsAnchor: true },
	}];
	t.deepEqual(validateTransactionSupport(project, forward), []);

	const updated = applyUamTransaction(project, forward);
	const committed = await roundTripCommittedProject(updated);
	const committedComponent = committed.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	t.is(committedComponent?.kind, 'component');
	if (committedComponent?.kind !== 'component') return;
	const committedNode = committedComponent.component.displayList.find((node) => node.id === 'n1');
	t.deepEqual(committedNode?.pivot, { x: 0.25, y: 0.5 });
	t.true(committedNode?.pivotAsAnchor ?? false);

	const restored = await roundTripCommittedProject(applyUamTransaction(committed, [{
		kind: 'setDisplayNodeProps',
		selector,
		props: { pivot: { x: 0, y: 0 }, pivotAsAnchor: false },
	}]));
	const restoredComponent = restored.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	t.is(restoredComponent?.kind, 'component');
	if (restoredComponent?.kind !== 'component') return;
	const restoredNode = restoredComponent.component.displayList.find((node) => node.id === 'n1');
	t.deepEqual(restoredNode?.pivot, { x: 0, y: 0 });
	t.false(restoredNode?.pivotAsAnchor ?? true);
});

test('Loader3D properties survive transaction, save/reload, inverse, and invalid payload checks', async (t) => {
	const project = normalizeUamProject(createSupportedProject());
	const component = project.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (component?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	const loader = {
		kind: 'loader3D' as const,
		...createDisplayNodeBase('loader3d-node', 'loader3d'),
		url: '',
		fill: 0,
		shrinkOnly: false,
		autoSize: false,
		align: 0,
		vAlign: 0,
		animationName: '',
		skinName: '',
		playing: true,
		frame: 0,
		loop: true,
		color: '#FFFFFF',
		clearOnPublish: false,
	};
	component.component.displayList.push(loader);
	const selector = { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: loader.id };
	const updated: UamLoader3DProperties = {
		url: 'ui://pkg001spine001',
		fill: 5,
		shrinkOnly: true,
		autoSize: true,
		align: 2,
		vAlign: 1,
		animationName: 'run',
		skinName: 'hero',
		playing: false,
		frame: 7,
		loop: false,
		color: '#A1B2C3',
		clearOnPublish: true,
	};
	const read = (node: UamDisplayNode | undefined): UamLoader3DProperties | null => (
		node?.kind === 'loader3D'
			? {
				url: node.url,
				fill: node.fill,
				shrinkOnly: node.shrinkOnly,
				autoSize: node.autoSize,
				align: node.align,
				vAlign: node.vAlign,
				animationName: node.animationName,
				skinName: node.skinName,
				playing: node.playing,
				frame: node.frame,
				loop: node.loop,
				color: node.color,
				clearOnPublish: node.clearOnPublish,
			}
			: null
	);
	const forward: UamTransactionOperation[] = [{
		kind: 'setDisplayNodeProps',
		selector,
		props: { loader3DProperties: updated },
	}];
	t.deepEqual(validateTransactionSupport(project, forward), []);

	const committed = await roundTripCommittedProject(applyUamTransaction(project, forward));
	const committedComponent = committed.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (committedComponent?.kind !== 'component') {
		t.fail('expected committed component resource');
		return;
	}
	t.deepEqual(read(committedComponent.component.displayList.find((node) => node.id === loader.id)), updated);

	const restored = await roundTripCommittedProject(applyUamTransaction(committed, [{
		kind: 'setDisplayNodeProps',
		selector,
		props: { loader3DProperties: read(loader)! },
	}]));
	const restoredComponent = restored.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (restoredComponent?.kind !== 'component') {
		t.fail('expected restored component resource');
		return;
	}
	t.deepEqual(read(restoredComponent.component.displayList.find((node) => node.id === loader.id)), read(loader));

	t.true(validateTransactionSupport(project, [{
		kind: 'setDisplayNodeProps',
		selector: { ...selector, displayNodeId: 'n1' },
		props: { loader3DProperties: updated },
	}]).some((issue) => issue.code === 'unsupported_display_node_field'));
	t.true(validateTransactionSupport(project, [{
		kind: 'setDisplayNodeProps',
		selector,
		props: { loader3DProperties: { ...updated, frame: -1 } },
	}]).some((issue) => issue.code === 'invalid_display_node_payload'));
	const unexpectedFields: UamTransactionOperation[] = [{
		kind: 'setDisplayNodeProps',
		selector,
		props: { loader3DProperties: { ...updated, kind: 'text', id: 'hijacked' } },
	}];
	t.true(validateTransactionSupport(project, unexpectedFields).some((issue) => issue.code === 'invalid_display_node_payload'));
	t.throws(() => applyUamTransaction(project, unexpectedFields), { instanceOf: UamTransactionError });
});

test('graph, loader, list, and tree property snapshots survive transaction lifecycle', async (t) => {
	const project = normalizeUamProject(createSupportedProject());
	const component = project.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (component?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}

	const graph: UamDisplayNode = {
		kind: 'graph',
		...createDisplayNodeBase('graph-props', 'graph'),
		pivot: { x: 0, y: 0 },
		pivotAsAnchor: false,
		locked: false,
		minWidth: 0,
		maxWidth: 0,
		minHeight: 0,
		maxHeight: 0,
		group: '',
		skew: { x: 0, y: 0 },
		graphType: 1,
		lineSize: 1,
		lineColor: '#000000',
		fillColor: '#FFFFFF',
		cornerRadius: null,
		points: null,
		sides: 0,
		startAngle: 0,
		distances: null,
	};
	const loader: UamDisplayNode = {
		kind: 'loader',
		...createDisplayNodeBase('loader-props', 'loader', 16),
		pivot: { x: 0, y: 0 },
		scale: { x: 1, y: 1 },
		url: '',
		filter: '',
		filterData: '',
		fill: 0,
		shrinkOnly: false,
		autoSize: false,
		useResize: false,
		align: 0,
		vAlign: 0,
		frame: 0,
		playing: true,
		color: '#FFFFFF',
		fillMethod: 0,
		fillOrigin: 0,
		fillClockwise: true,
		fillAmount: 100,
		clearOnPublish: false,
	};
	const list: UamDisplayNode = {
		kind: 'list',
		...createListNodeBase('list-props', 'list', 32),
	};
	const tree: UamDisplayNode = {
		kind: 'tree',
		...createListNodeBase('tree-props', 'tree', 48),
		treeView: true,
		indent: 30,
		clickToExpand: 0,
	};
	list.listItems[0]!.controllers = 'initial-list';
	tree.listItems[0]!.controllers = 'initial-tree';
	tree.listItems[0]!.isFolder = false;
	component.component.displayList.push(graph, loader, list, tree);

	const initialGraph = readSpecificProperties<UamGraphProperties>(graph);
	const initialLoader = readSpecificProperties<UamLoaderProperties>(loader);
	const initialList = readSpecificProperties<UamListProperties>(list);
	const initialTree = readSpecificProperties<UamTreeProperties>(tree);
	const updatedGraph: UamGraphProperties = {
		...initialGraph,
		locked: true,
		minWidth: 10,
		maxWidth: 200,
		minHeight: 12,
		maxHeight: 160,
		skew: { x: 2, y: 3 },
		graphType: 4,
		lineSize: 3,
		lineColor: '#112233',
		fillColor: '#445566',
		cornerRadius: [1, 2, 3, 4],
		points: [0, 0, 40, 0, 20, 30],
		sides: 6,
		startAngle: 15,
		distances: [1, 0.8, 1, 0.8, 1, 0.8],
	};
	const updatedLoader: UamLoaderProperties = {
		...initialLoader,
		scale: { x: 1.25, y: 0.75 },
		url: 'ui://pkg001img001',
		filter: 'color',
		filterData: '1,0,0,1',
		fill: 5,
		shrinkOnly: true,
		autoSize: true,
		useResize: true,
		align: 2,
		vAlign: 1,
		frame: 4,
		playing: false,
		color: '#AABBCC',
		fillMethod: 3,
		fillOrigin: 2,
		fillClockwise: false,
		fillAmount: 0.65,
		clearOnPublish: true,
	};
	const updatedList: UamListProperties = {
		...initialList,
		layout: 4,
		align: 1,
		vAlign: 2,
		lineGap: 8,
		columnGap: 9,
		lineCount: 2,
		columnCount: 3,
		selectionMode: 2,
		autoResizeItem: false,
		childrenRenderOrder: 2,
		apexIndex: 1,
		src: 'ui://pkg001list',
		overflow: 1,
		scrollType: 2,
		scrollBarFlags: 7,
		scrollBarMargin: { top: 1, bottom: 2, left: 3, right: 4 },
		vtScrollBarRes: 'ui://pkg001vbar',
		hzScrollBarRes: 'ui://pkg001hbar',
		headerRes: 'ui://pkg001header',
		footerRes: 'ui://pkg001footer',
		margin: { top: 5, bottom: 6, left: 7, right: 8 },
		clipSoftness: { x: 2, y: 3 },
		scrollItemToViewOnClick: false,
		foldInvisibleItems: true,
		listItems: [{
			title: 'Updated',
			icon: 'ui://pkg001img001',
			url: 'ui://pkg001item',
			name: 'updated-item',
			selectedTitle: 'Selected',
			selectedIcon: null,
			level: 0,
			isFolder: null,
			controllers: 'state',
		}],
		pageController: 'page',
		controllerOverrides: 'state=active',
		selectionController: 'selection',
	};
	const updatedTree: UamTreeProperties = {
		...updatedList,
		listItems: [{
			title: 'Folder',
			icon: null,
			url: 'ui://pkg001item',
			name: 'folder',
			selectedTitle: null,
			selectedIcon: null,
			level: 0,
			isFolder: true,
			controllers: 'state',
		}],
		treeView: true,
		indent: 42,
		clickToExpand: 1,
	};
	const selector = (displayNodeId: string) => ({
		packageId: 'pkg001',
		componentResourceId: 'cmp001',
		displayNodeId,
	});
	const forward: UamTransactionOperation[] = [
		{ kind: 'setDisplayNodeProps', selector: selector(graph.id), props: { graphProperties: updatedGraph } },
		{ kind: 'setDisplayNodeProps', selector: selector(loader.id), props: { loaderProperties: updatedLoader } },
		{ kind: 'setDisplayNodeProps', selector: selector(list.id), props: { listProperties: updatedList } },
		{ kind: 'setDisplayNodeProps', selector: selector(tree.id), props: { listProperties: updatedTree } },
	];
	t.deepEqual(validateTransactionSupport(project, forward), []);

	const applied = applyUamTransaction(project, forward);
	updatedGraph.points![0] = 999;
	const appliedComponent = applied.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (appliedComponent?.kind !== 'component') {
		t.fail('expected applied component resource');
		return;
	}
	const appliedGraph = appliedComponent.component.displayList.find((node) => node.id === graph.id);
	t.is(appliedGraph?.kind, 'graph');
	if (appliedGraph?.kind === 'graph') t.is(appliedGraph.points?.[0], 0, 'transaction clones nested snapshot values');
	updatedGraph.points![0] = 0;

	const assertProperties = (
		node: UamDisplayNode | undefined,
		expected: UamGraphProperties | UamLoaderProperties | UamListProperties | UamTreeProperties,
	) => {
		t.truthy(node);
		if (!node) return;
		t.deepEqual(readSpecificProperties(node), expected);
	};
	const committed = await roundTripCommittedProject(applied);
	const committedComponent = committed.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (committedComponent?.kind !== 'component') {
		t.fail('expected committed component resource');
		return;
	}
	assertProperties(committedComponent.component.displayList.find((node) => node.id === graph.id), updatedGraph);
	assertProperties(committedComponent.component.displayList.find((node) => node.id === loader.id), updatedLoader);
	assertProperties(committedComponent.component.displayList.find((node) => node.id === list.id), updatedList);
	assertProperties(committedComponent.component.displayList.find((node) => node.id === tree.id), updatedTree);

	const inverse: UamTransactionOperation[] = [
		{ kind: 'setDisplayNodeProps', selector: selector(graph.id), props: { graphProperties: initialGraph } },
		{ kind: 'setDisplayNodeProps', selector: selector(loader.id), props: { loaderProperties: initialLoader } },
		{ kind: 'setDisplayNodeProps', selector: selector(list.id), props: { listProperties: initialList } },
		{ kind: 'setDisplayNodeProps', selector: selector(tree.id), props: { listProperties: initialTree } },
	];
	const restored = await roundTripCommittedProject(applyUamTransaction(committed, inverse));
	const restoredComponent = restored.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (restoredComponent?.kind !== 'component') {
		t.fail('expected restored component resource');
		return;
	}
	assertProperties(restoredComponent.component.displayList.find((node) => node.id === graph.id), initialGraph);
	assertProperties(restoredComponent.component.displayList.find((node) => node.id === loader.id), initialLoader);
	assertProperties(restoredComponent.component.displayList.find((node) => node.id === list.id), initialList);
	assertProperties(restoredComponent.component.displayList.find((node) => node.id === tree.id), initialTree);

	const crossKindOperations: UamTransactionOperation[] = [
		{ kind: 'setDisplayNodeProps', selector: selector(loader.id), props: { graphProperties: updatedGraph } },
		{ kind: 'setDisplayNodeProps', selector: selector(tree.id), props: { listProperties: updatedList } },
		{ kind: 'setDisplayNodeProps', selector: selector(list.id), props: { listProperties: updatedTree } },
	];
	const crossKindIssues = validateTransactionSupport(project, crossKindOperations);
	t.is(crossKindIssues.filter((issue) => issue.code === 'unsupported_display_node_field').length, 1);
	t.is(crossKindIssues.filter((issue) => issue.code === 'invalid_display_node_payload').length, 2);

	const invalidPayloadIssues = validateTransactionSupport(project, [
		{
			kind: 'setDisplayNodeProps',
			selector: selector(graph.id),
			props: { graphProperties: { ...updatedGraph, pivot: { x: 0, y: 0 } } as UamGraphProperties },
		},
		{
			kind: 'setDisplayNodeProps',
			selector: selector(loader.id),
			props: { loaderProperties: { ...updatedLoader, frame: -1 } },
		},
		{
			kind: 'setDisplayNodeProps',
			selector: selector(list.id),
			props: {
				listProperties: {
					...updatedList,
					listItems: [{ ...updatedList.listItems[0]!, level: -1 }],
				},
			},
		},
	]);
	t.is(invalidPayloadIssues.filter((issue) => issue.code === 'invalid_display_node_payload').length, 3);

	const mixed = await roundTripCommittedProject(applyUamTransaction(project, [
		forward[0]!,
		{
			kind: 'renameResource',
			selector: { packageId: 'pkg001', resourceId: 'img001' },
			newName: 'renamed.png',
		},
	]));
	const mixedComponent = mixed.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (mixedComponent?.kind !== 'component') {
		t.fail('expected mixed transaction component resource');
		return;
	}
	assertProperties(mixedComponent.component.displayList.find((node) => node.id === graph.id), updatedGraph);
	t.is(mixed.packages[0]?.resources.find((resource) => resource.id === 'img001')?.name, 'renamed');
});

test('Phase A transactions support common FairyGUI display node kinds for common props', (t) => {
	const project = createSupportedProject();
	const componentResource = project.packages[0]!.resources[1];
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}

	const nodes: UamDisplayNode[] = [
		{
			kind: 'component',
			...createDisplayNodeBase('n2', 'component-ref', 8),
			resource: { packageId: 'pkg001', resourceId: 'cmp001' },
		},
		{
			kind: 'graph',
			...createDisplayNodeBase('n3', 'graph', 16),
			locked: false,
			minWidth: 0,
			maxWidth: 0,
			minHeight: 0,
			maxHeight: 0,
			pivot: { x: 0, y: 0 },
			pivotAsAnchor: false,
			group: '',
			skew: { x: 0, y: 0 },
			graphType: 1,
			lineSize: 1,
			lineColor: '#111111',
			fillColor: '#eeeeee',
			cornerRadius: null,
			points: null,
			sides: 0,
			startAngle: 0,
			distances: null,
		},
		{
			kind: 'group',
			...createDisplayNodeBase('n4', 'group', 24),
			locked: false,
			group: '',
			layout: 1,
			lineGap: 2,
			columnGap: 2,
			advanced: false,
			excludeInvisibles: false,
			autoSizeDisabled: false,
			mainGridIndex: -1,
		},
		{
			kind: 'list',
			...createListNodeBase('n5', 'list', 32),
		},
		{
			kind: 'loader',
			...createDisplayNodeBase('n6', 'loader', 40),
			pivot: { x: 0, y: 0 },
			scale: { x: 1, y: 1 },
			url: 'ui://pkg001/img001',
			filter: '',
			filterData: '',
			fill: 0,
			shrinkOnly: false,
			autoSize: false,
			useResize: false,
			align: 0,
			vAlign: 0,
			frame: 0,
			playing: true,
			color: '#ffffff',
			fillMethod: 0,
			fillOrigin: 0,
			fillClockwise: true,
			fillAmount: 100,
			clearOnPublish: false,
		},
		{
			kind: 'richText',
			...createDefaultUamTextProperties(),
			...createDisplayNodeBase('n7', 'rich-text', 48),
			text: '[b]Rich[/b]',
			font: '',
			fontSize: 14,
			color: '#ffaa00',
		},
		{
			kind: 'textInput',
			...createDefaultUamPlainTextProperties(),
			...createDisplayNodeBase('n8', 'text-input', 56),
			text: 'Input',
			font: '',
			fontSize: 14,
			color: '#222222',
			promptText: 'Prompt',
			maxLength: 32,
			restrict: '',
			password: false,
			keyboardType: 0,
		},
		{
			kind: 'tree',
			...createListNodeBase('n9', 'tree', 64),
			treeView: true,
			indent: 20,
			clickToExpand: 1,
		},
	];
	componentResource.component.displayList.push(...nodes);

	const operations: UamTransactionOperation[] = nodes.map((node, index) => {
		const props: UamDisplayNodePropsUpdate = {
			position: { x: 100 + index, y: 120 + index },
			size: { width: 200 + index, height: 40 + index },
			pivot: { x: 0.25, y: 0.75 },
			pivotAsAnchor: true,
			alpha: 0.5,
			rotation: 5 + index,
			customData: `phase-a-${node.kind}`,
		};
		if (node.kind === 'richText') {
			props.textProperties = {
				...createDefaultUamTextProperties(),
				text: '[i]Updated rich text[/i]',
				fontSize: 18,
				color: '#ff00ff',
				autoSize: 4,
				strokeColor: '#123456',
				strokeSize: 0.25,
				shadowColor: '#654321',
				shadowOffset: { x: 0, y: 2 },
			};
		}
		if (node.kind === 'textInput') {
			props.textProperties = {
				...createDefaultUamPlainTextProperties(),
				text: 'Updated input',
				font: 'Arial',
				color: '#00aaee',
				demoText: 'Preview input',
				templateVarsEnabled: true,
				faceDilate: 0.125,
			};
		}
		return {
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: node.id },
			props,
		};
	});

	const normalizedProject = normalizeUamProject(project);
	t.deepEqual(validateTransactionSupport(normalizedProject), []);
	t.deepEqual(validateTransactionSupport(normalizedProject, operations), []);

	const result = applyUamTransaction(normalizedProject, operations);
	const resultComponent = result.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	t.is(resultComponent?.kind, 'component');
	if (resultComponent?.kind !== 'component') return;

	for (const [index, sourceNode] of nodes.entries()) {
		const updatedNode = resultComponent.component.displayList.find((node) => node.id === sourceNode.id);
		t.is(updatedNode?.kind, sourceNode.kind);
		t.deepEqual(updatedNode?.position, { x: 100 + index, y: 120 + index });
		t.deepEqual(updatedNode?.size, { width: 200 + index, height: 40 + index });
		t.deepEqual(updatedNode?.pivot, { x: 0.25, y: 0.75 });
		t.true(updatedNode?.pivotAsAnchor ?? false);
		t.is(updatedNode?.alpha, 0.5);
		t.is(updatedNode?.rotation, 5 + index);
		t.is(updatedNode?.customData, `phase-a-${sourceNode.kind}`);
	}

	const richText = resultComponent.component.displayList.find((node) => node.id === 'n7');
	t.is(richText?.kind, 'richText');
	if (richText?.kind === 'richText') {
		t.is(richText.text, '[i]Updated rich text[/i]');
		t.is(richText.fontSize, 18);
		t.is(richText.color, '#ff00ff');
		t.is(richText.autoSize, 4);
		t.is(richText.strokeSize, 0.25);
		t.deepEqual(richText.shadowOffset, { x: 0, y: 2 });
	}

	const textInput = resultComponent.component.displayList.find((node) => node.id === 'n8');
	t.is(textInput?.kind, 'textInput');
	if (textInput?.kind === 'textInput') {
		t.is(textInput.text, 'Updated input');
		t.is(textInput.font, 'Arial');
		t.is(textInput.color, '#00aaee');
		t.is(textInput.demoText, 'Preview input');
		t.true(textInput.templateVarsEnabled);
		t.is(textInput.faceDilate, 0.125);
	}

	const invalidPivotIssues = validateTransactionSupport(normalizedProject, [{
		kind: 'setDisplayNodeProps',
		selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n3' },
		props: { pivot: { x: Number.NaN, y: 0.5 } },
	}]);
	t.true(invalidPivotIssues.some((issue) => issue.code === 'invalid_display_node_payload'));
	const invalidTextIssues = validateTransactionSupport(normalizedProject, [{
		kind: 'setDisplayNodeProps',
		selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n7' },
		props: {
			textProperties: createDefaultUamPlainTextProperties(),
		},
	}]);
	t.true(invalidTextIssues.some((issue) => issue.code === 'invalid_display_node_payload'));
	for (const textProperties of [
		{ ...createDefaultUamTextProperties(), fontSize: 0 },
		{ ...createDefaultUamTextProperties(), strokeSize: 2 },
		{ ...createDefaultUamTextProperties(), shadowOffset: { x: 3, y: 4 } },
	]) {
		t.true(validateTransactionSupport(normalizedProject, [{
			kind: 'setDisplayNodeProps',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n7' },
			props: { textProperties },
		}]).some((issue) => issue.code === 'invalid_display_node_payload'));
	}
});

test('group references validate against the projected component display list', (t) => {
	const project = createSupportedProject();
	const selector = { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n1' };
	const groupNode: UamDisplayNode = {
		kind: 'group',
		...createDisplayNodeBase('group-1', 'layout-group'),
		group: '',
		locked: false,
		layout: 0,
		lineGap: 0,
		columnGap: 0,
		advanced: false,
		excludeInvisibles: false,
		autoSizeDisabled: false,
		mainGridIndex: -1,
	};
	const attachAndAssign: UamTransactionOperation[] = [
		{
			kind: 'attachDisplayNode',
			selector: { packageId: 'pkg001', componentResourceId: 'cmp001' },
			atIndex: 0,
			node: groupNode,
		},
		{ kind: 'setDisplayNodeProps', selector, props: { group: groupNode.id } },
	];
	t.deepEqual(validateTransactionSupport(project, attachAndAssign), []);
	const grouped = applyUamTransaction(project, attachAndAssign);

	t.true(validateTransactionSupport(grouped, [{
		kind: 'setDisplayNodeProps',
		selector,
		props: { group: 'missing-group' },
	}]).some((issue) => issue.code === 'invalid_group_reference'));
	t.true(validateTransactionSupport(grouped, [
		{ kind: 'setDisplayNodeProps', selector, props: { group: 'missing-group' } },
		{
			kind: 'renameResource',
			selector: { packageId: 'pkg001', resourceId: 'img001' },
			newName: 'background-renamed.png',
		},
	]).some((issue) => issue.code === 'invalid_group_reference'));
	const historicallyInvalid = structuredClone(grouped);
	const historicalComponent = historicallyInvalid.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	const historicalTitle = historicalComponent?.kind === 'component'
		? historicalComponent.component.displayList.find((node) => node.id === selector.displayNodeId)
		: null;
	if (historicalTitle && 'group' in historicalTitle) historicalTitle.group = 'missing-group';
	t.true(validateTransactionSupport(historicallyInvalid, [{
		kind: 'setDisplayNodeProps',
		selector,
		props: { group: 'missing-group' },
	}]).some((issue) => issue.code === 'invalid_group_reference'));
	t.deepEqual(validateTransactionSupport(historicallyInvalid, [{
		kind: 'setDisplayNodeProps',
		selector,
		props: { alpha: 0.75 },
	}]), []);
	const mixedOperations: UamTransactionOperation[] = [
		{ kind: 'setDisplayNodeProps', selector, props: { alpha: 0.75 } },
		{
			kind: 'renameResource',
			selector: { packageId: 'pkg001', resourceId: 'img001' },
			newName: 'background-renamed.png',
		},
	];
	t.true(validateTransactionSupport(historicallyInvalid, mixedOperations)
		.some((issue) => issue.code === 'invalid_group_reference'));
	t.throws(
		() => applyUamTransaction(historicallyInvalid, mixedOperations),
		{ instanceOf: UamTransactionError },
	);

	const loaderTarget = { ...selector, displayNodeId: 'loader-group-target' };
	const withLoader = normalizeUamProject(grouped);
	const component = withLoader.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (component?.kind !== 'component') return;
	component.component.displayList.push({
		kind: 'loader',
		...createDisplayNodeBase(loaderTarget.displayNodeId, 'loader'),
		pivot: { x: 0, y: 0 },
		scale: { x: 1, y: 1 },
		url: '',
		filter: '',
		filterData: '',
		fill: 0,
		shrinkOnly: false,
		autoSize: false,
		useResize: false,
		align: 0,
		vAlign: 0,
		frame: 0,
		playing: true,
		color: '#FFFFFF',
		fillMethod: 0,
		fillOrigin: 0,
		fillClockwise: true,
		fillAmount: 100,
		clearOnPublish: false,
	});
	t.true(validateTransactionSupport(withLoader, [{
		kind: 'setDisplayNodeProps',
		selector: loaderTarget,
		props: { group: groupNode.id },
	}]).some((issue) => issue.code === 'unsupported_display_node_field'));
	const loaderWithGroup = structuredClone(withLoader);
	const loaderComponent = loaderWithGroup.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	const loaderNode = loaderComponent?.kind === 'component'
		? loaderComponent.component.displayList.find((node) => node.id === loaderTarget.displayNodeId)
		: null;
	if (loaderNode) Object.assign(loaderNode, { group: groupNode.id });
	t.true(validateUamProject(loaderWithGroup).some((issue) => issue.path.endsWith('.group')));

	t.true(validateTransactionSupport(grouped, [{
		kind: 'detachDisplayNode',
		selector: { ...selector, displayNodeId: groupNode.id },
	}]).some((issue) => issue.code === 'invalid_group_reference'));

	const clearAndDetach: UamTransactionOperation[] = [
		{ kind: 'setDisplayNodeProps', selector, props: { group: '' } },
		{ kind: 'detachDisplayNode', selector: { ...selector, displayNodeId: groupNode.id } },
	];
	t.deepEqual(validateTransactionSupport(grouped, clearAndDetach), []);
	const cleared = applyUamTransaction(grouped, clearAndDetach);
	const clearedComponent = cleared.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (clearedComponent?.kind !== 'component') return;
	t.false(clearedComponent.component.displayList.some((node) => node.id === groupNode.id));
	const clearedTitle = clearedComponent.component.displayList.find((node) => node.id === selector.displayNodeId);
	t.true(clearedTitle !== undefined && 'group' in clearedTitle);
	if (clearedTitle && 'group' in clearedTitle) t.is(clearedTitle.group, '');
});

test('assertTransactionSupported rejects duplicate transition names and duplicate look-gear-per-controller', (t) => {
	const duplicateTransitionProject = createSupportedProject();
	const componentResource = duplicateTransitionProject.packages[0]!.resources[1];
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	componentResource.component.transitions.push(createTransitionModel('intro'));
	componentResource.component.transitions.push(createTransitionModel('intro'));
	t.throws(
		() => assertTransactionSupported(duplicateTransitionProject),
		{ instanceOf: UamTransactionError },
	);

	const duplicateLookGearProject = createSupportedProject();
	const duplicateLookComponent = duplicateLookGearProject.packages[0]!.resources[1];
	if (duplicateLookComponent?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	duplicateLookComponent.component.controllers.push(createControllerModel('state'));
	duplicateLookComponent.component.displayList[0]!.gears.push(createLookGear('state'));
	duplicateLookComponent.component.displayList[0]!.gears.push(createLookGear('state', 0.75));
	t.throws(
		() => assertTransactionSupported(duplicateLookGearProject),
		{ instanceOf: UamTransactionError },
	);
});
