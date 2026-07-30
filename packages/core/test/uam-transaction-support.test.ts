import test from 'ava';
import {
	UamTransactionError,
	applyUamTransaction,
	assertTransactionSupported,
	normalizeUamProject,
	validateTransactionSupport,
	type UamButtonNode,
	type UamComponentRefNode,
	type UamDisplayNode,
	type UamDisplayNodePropsUpdate,
	type UamListNode,
	type UamLoader3DProperties,
	type UamTransactionOperation,
} from '../src/index.js';

import {
	createControllerModel,
	createDisplayNodeBase,
	createListNodeBase,
	createLookGear,
	createSupportedProject,
	createTransitionModel,
	roundTripCommittedProject,
} from './uam-transaction-fixtures.js';

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
				branch: '',
				branchItemIds: [],
				fileName: 'shared.png',
				dimensions: { width: 16, height: 16 },
				metadata: null,
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
			...createDisplayNodeBase('n7', 'rich-text', 48),
			text: '[b]Rich[/b]',
			font: '',
			fontSize: 14,
			color: '#ffaa00',
		},
		{
			kind: 'textInput',
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
			props.text = '[i]Updated rich text[/i]';
			props.fontSize = 18;
			props.color = '#ff00ff';
		}
		if (node.kind === 'textInput') {
			props.text = 'Updated input';
			props.font = 'Arial';
			props.color = '#00aaee';
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
	}

	const textInput = resultComponent.component.displayList.find((node) => node.id === 'n8');
	t.is(textInput?.kind, 'textInput');
	if (textInput?.kind === 'textInput') {
		t.is(textInput.text, 'Updated input');
		t.is(textInput.font, 'Arial');
		t.is(textInput.color, '#00aaee');
	}

	const invalidPivotIssues = validateTransactionSupport(normalizedProject, [{
		kind: 'setDisplayNodeProps',
		selector: { packageId: 'pkg001', componentResourceId: 'cmp001', displayNodeId: 'n3' },
		props: { pivot: { x: Number.NaN, y: 0.5 } },
	}]);
	t.true(invalidPivotIssues.some((issue) => issue.code === 'invalid_display_node_payload'));
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
