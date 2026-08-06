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
	type UamGroupProperties,
	type UamImageProperties,
	type UamImageResourceProperties,
	type UamListNode,
	type UamListProperties,
	type UamLoader3DProperties,
	type UamLoaderProperties,
	type UamMovieClipProperties,
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
	'locked',
	'aspect',
	'minSize',
	'maxSize',
	'pivot',
	'pivotAsAnchor',
	'scale',
	'skew',
	'visible',
	'touchable',
	'grayed',
	'alpha',
	'rotation',
	'tooltips',
	'blendMode',
	'filter',
	'filterData',
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

const COMMON_DISPLAY_PROPERTY_KEYS = [
	'locked',
	'aspect',
	'minSize',
	'maxSize',
	'scale',
	'skew',
	'tooltips',
	'blendMode',
	'filter',
	'filterData',
] as const satisfies readonly (keyof UamDisplayNode)[];

function readCommonDisplayProperties(node: UamDisplayNode): Pick<UamDisplayNode, (typeof COMMON_DISPLAY_PROPERTY_KEYS)[number]> {
	return Object.fromEntries(COMMON_DISPLAY_PROPERTY_KEYS.map((key) => [key, structuredClone(node[key])])) as
		Pick<UamDisplayNode, (typeof COMMON_DISPLAY_PROPERTY_KEYS)[number]>;
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

test('image source replacement validates format and refreshes dimensions through inverse reload', async (t) => {
	const project = await readProjectAsUam(new NodeIO(), LAYABOX_PROJECT_PATH, { hydrateResourceBytes: true });
	const images = project.packages.flatMap((pkg) => pkg.resources.flatMap((resource) => (
		resource.kind === 'image'
			&& resource.sourceBytes instanceof Uint8Array
			&& resource.dimensions
			&& resource.fileName
			? [{ pkg, resource }]
			: []
	)));
	const pngImages = images.filter(({ resource }) => resource.fileName?.toLowerCase().endsWith('.png'));
	const target = pngImages.find(({ resource }, index) => pngImages.some(({ resource: donor }, donorIndex) => (
		donorIndex !== index
		&& (resource.dimensions?.width !== donor.dimensions?.width
			|| resource.dimensions?.height !== donor.dimensions?.height)
	)));
	const donor = target && pngImages.find(({ resource }) => resource.id !== target.resource.id
		&& (resource.dimensions?.width !== target.resource.dimensions?.width
			|| resource.dimensions?.height !== target.resource.dimensions?.height));
	if (!target || !donor || !target.resource.sourceBytes || !target.resource.dimensions || !donor.resource.sourceBytes || !donor.resource.dimensions) {
		t.fail('expected two hydrated PNG resources with different dimensions');
		return;
	}

	const selector = { packageId: target.pkg.id, resourceId: target.resource.id };
	const originalBytes = new Uint8Array(target.resource.sourceBytes);
	const originalDimensions = structuredClone(target.resource.dimensions);
	const imageProps = structuredClone(target.resource.image);
	const forward: UamTransactionOperation = {
		kind: 'replaceResourceBytes',
		selector,
		sourceBytes: new Uint8Array(donor.resource.sourceBytes),
	};
	t.deepEqual(validateTransactionSupport(project, [forward]), []);
	const applied = applyUamTransaction(project, [forward]);
	const appliedImage = applied.packages.find((pkg) => pkg.id === selector.packageId)?.resources
		.find((resource) => resource.id === selector.resourceId);
	if (appliedImage?.kind !== 'image') {
		t.fail('expected replaced image resource');
		return;
	}
	t.deepEqual(appliedImage.dimensions, donor.resource.dimensions);
	t.deepEqual(appliedImage.sourceBytes, donor.resource.sourceBytes);
	t.deepEqual(appliedImage.image, imageProps);

	const committed = await roundTripCommittedProject(applied);
	const committedImage = committed.packages.find((pkg) => pkg.id === selector.packageId)?.resources
		.find((resource) => resource.id === selector.resourceId);
	if (committedImage?.kind !== 'image') {
		t.fail('expected reloaded replaced image resource');
		return;
	}
	t.deepEqual(committedImage.dimensions, donor.resource.dimensions);
	t.deepEqual(committedImage.sourceBytes, donor.resource.sourceBytes);
	const staleMetadata = structuredClone(applied);
	const staleImage = staleMetadata.packages.find((pkg) => pkg.id === selector.packageId)?.resources
		.find((resource) => resource.id === selector.resourceId);
	if (staleImage?.kind === 'image') staleImage.dimensions = structuredClone(originalDimensions);
	const hydratedFromStaleMetadata = await roundTripCommittedProject(staleMetadata);
	const hydratedStaleImage = hydratedFromStaleMetadata.packages.find((pkg) => pkg.id === selector.packageId)?.resources
		.find((resource) => resource.id === selector.resourceId);
	t.deepEqual(hydratedStaleImage?.kind === 'image' ? hydratedStaleImage.dimensions : undefined, donor.resource.dimensions);

	const restored = await roundTripCommittedProject(applyUamTransaction(committed, [{
		kind: 'replaceResourceBytes',
		selector,
		sourceBytes: originalBytes,
	}]));
	const restoredImage = restored.packages.find((pkg) => pkg.id === selector.packageId)?.resources
		.find((resource) => resource.id === selector.resourceId);
	if (restoredImage?.kind !== 'image') {
		t.fail('expected inverse-reloaded image resource');
		return;
	}
	t.deepEqual(restoredImage.dimensions, originalDimensions);
	t.deepEqual(restoredImage.sourceBytes, originalBytes);
	t.deepEqual(restoredImage.image, imageProps);

	const invalidBytes = new Uint8Array([1, 2, 3, 4]);
	const invalidIssues = validateTransactionSupport(project, [{ ...forward, sourceBytes: invalidBytes }]);
	t.true(invalidIssues.some((issue) => issue.code === 'invalid_resource_bytes'
		&& issue.path === 'operations[0].sourceBytes'));
	const forgedPng = new Uint8Array(donor.resource.sourceBytes.slice(0, 24));
	t.true(validateTransactionSupport(project, [{ ...forward, sourceBytes: forgedPng }])
		.some((issue) => issue.code === 'invalid_resource_bytes'));
	const invalidBatch = t.throws(() => applyUamTransaction(project, [
		{ kind: 'setResourceFavorite', selector, favorite: !target.resource.favorite },
		{ ...forward, sourceBytes: invalidBytes },
	]), { instanceOf: UamTransactionError });
	t.true(invalidBatch?.issues?.some((issue) => 'code' in issue && issue.code === 'invalid_resource_bytes') ?? false);
	t.deepEqual(target.resource.sourceBytes, originalBytes);
	t.deepEqual(target.resource.dimensions, originalDimensions);

	const renamedToJpeg = target.resource.fileName!.replace(/\.[^.]+$/, '.jpg');
	t.true(validateTransactionSupport(project, [
		{ kind: 'renameResource', selector, newName: renamedToJpeg },
		forward,
	]).some((issue) => issue.code === 'invalid_resource_bytes'));
	t.true(validateTransactionSupport(project, [
		forward,
		{ kind: 'renameResource', selector, newName: renamedToJpeg },
	]).some((issue) => issue.code === 'invalid_resource_bytes'));
	t.true(validateTransactionSupport(project, [
		{ kind: 'renameResource', selector, newName: renamedToJpeg },
		forward,
		{ kind: 'renameResource', selector, newName: target.resource.fileName! },
	]).some((issue) => issue.code === 'invalid_resource_bytes'
		&& issue.path === 'operations[1].sourceBytes'));
	t.deepEqual(validateTransactionSupport(project, [
		forward,
		{ kind: 'renameResource', selector, newName: renamedToJpeg },
		{ kind: 'renameResource', selector, newName: target.resource.fileName! },
	]), []);
	const readdedImage = structuredClone(target.resource);
	delete readdedImage.sourcePath;
	readdedImage.name = 'replacement';
	readdedImage.fileName = 'replacement.png';
	const lifecycleReplacement: UamTransactionOperation[] = [
		{ kind: 'renameResource', selector, newName: renamedToJpeg },
		{ kind: 'removeResource', selector },
		{ kind: 'addResource', selector: { packageId: selector.packageId }, resource: readdedImage },
		forward,
	];
	t.deepEqual(validateTransactionSupport(project, lifecycleReplacement), []);
	t.notThrows(() => applyUamTransaction(project, lifecycleReplacement));
	const unsupported = structuredClone(project);
	const unsupportedTarget = unsupported.packages.find((pkg) => pkg.id === selector.packageId)?.resources
		.find((resource) => resource.id === selector.resourceId);
	if (unsupportedTarget?.kind === 'image') unsupportedTarget.fileName = 'unsupported.webp';
	t.true(validateTransactionSupport(unsupported, [forward])
		.some((issue) => issue.code === 'unsupported_resource_mutation'));

	const jpegImages = images.filter(({ resource }) => resource.sourceBytes?.[0] === 0xff && resource.sourceBytes[1] === 0xd8);
	const jpeg = jpegImages.find(({ resource }, index) => jpegImages.some(({ resource: donor }, donorIndex) => (
		donorIndex !== index
		&& (resource.dimensions?.width !== donor.dimensions?.width
			|| resource.dimensions?.height !== donor.dimensions?.height)
	)));
	const jpegDonor = jpeg && jpegImages.find(({ resource }) => resource.id !== jpeg.resource.id
		&& (resource.dimensions?.width !== jpeg.resource.dimensions?.width
			|| resource.dimensions?.height !== jpeg.resource.dimensions?.height));
	if (!jpeg || !jpegDonor || !jpeg.resource.sourceBytes || !jpeg.resource.dimensions
		|| !jpegDonor.resource.sourceBytes || !jpegDonor.resource.dimensions
	) {
		t.fail('expected two hydrated JPEG resources with different dimensions');
		return;
	}
	const jpegProject = structuredClone(project);
	const jpegTarget = jpegProject.packages.find((pkg) => pkg.id === jpeg.pkg.id)?.resources
		.find((resource) => resource.id === jpeg.resource.id);
	if (jpegTarget?.kind !== 'image') {
		t.fail('expected cloned JPEG resource');
		return;
	}
	jpegTarget.fileName = jpegTarget.fileName?.replace(/\.jpe?g$/i, '.JPEG');
	const jpegOperation: UamTransactionOperation = {
		kind: 'replaceResourceBytes',
		selector: { packageId: jpeg.pkg.id, resourceId: jpeg.resource.id },
		sourceBytes: new Uint8Array(jpegDonor.resource.sourceBytes),
	};
	t.deepEqual(validateTransactionSupport(jpegProject, [jpegOperation]), []);
	t.true(validateTransactionSupport(jpegProject, [{
		...jpegOperation,
		sourceBytes: new Uint8Array(jpegDonor.resource.sourceBytes.slice(0, -2)),
	}]).some((issue) => issue.code === 'invalid_resource_bytes'));
	t.true(validateTransactionSupport(project, [{
		...forward,
		sourceBytes: new Uint8Array(jpeg.resource.sourceBytes),
	}]).some((issue) => issue.code === 'invalid_resource_bytes'));
	const replacedJpeg = applyUamTransaction(jpegProject, [jpegOperation]).packages
		.find((pkg) => pkg.id === jpeg.pkg.id)?.resources.find((resource) => resource.id === jpeg.resource.id);
	t.deepEqual(replacedJpeg?.kind === 'image' ? replacedJpeg.dimensions : undefined, jpegDonor.resource.dimensions);
});

test('assertTransactionSupported accepts current materialization scope and rejects unsupported cross-package refs', (t) => {
	const buttonNodeProject = createSupportedProject();
	const componentResource = buttonNodeProject.packages[0]!.resources[1];
	if (componentResource?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	componentResource.component.displayList.push({
		...createDisplayNodeBase('n2', 'button'),
		kind: 'button',
		group: '',
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
		compressPNG: null,
		jpegQuality: null,
		publish: null,
		branchNames: [],
		folders: [],
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
		...createDisplayNodeBase('n2', 'sub'),
		kind: 'component',
		group: '',
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
		...createDisplayNodeBase('n3', 'menu'),
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
		scrollBarDisplay: 2,
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
		autoClearItems: false,
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
		...createDisplayNodeBase('n4', 'button'),
		kind: 'button',
		group: '',
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
		color: '#ffffff',
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
		props: { loader3DProperties: { ...updated, kind: 'text', id: 'hijacked' } as never },
	}];
	t.true(validateTransactionSupport(project, unexpectedFields).some((issue) => issue.code === 'invalid_display_node_payload'));
	t.throws(() => applyUamTransaction(project, unexpectedFields), { instanceOf: UamTransactionError });
});

test('image and movieClip property snapshots survive transaction lifecycle', async (t) => {
	const project = normalizeUamProject(createSupportedProject());
	const component = project.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (component?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	const image = component.component.displayList.find((node) => node.kind === 'image');
	if (image?.kind !== 'image') {
		t.fail('expected image display node');
		return;
	}
	const movieClip: UamDisplayNode = {
		kind: 'movieClip',
		...createDisplayNodeBase('movie-props', 'movieClip', 24),
		group: '',
		resource: { resourceId: 'img001' },
		fileName: '',
		playing: true,
		frame: 0,
		color: '#FFFFFF',
	};
	component.component.displayList.push(movieClip);
	const readImage = (node: UamDisplayNode | undefined): UamImageProperties | null => node?.kind === 'image' ? {
		color: node.color,
		flip: node.flip,
		fillMethod: node.fillMethod,
		fillOrigin: node.fillOrigin,
		fillClockwise: node.fillClockwise,
		fillAmount: node.fillAmount,
	} : null;
	const readMovieClip = (node: UamDisplayNode | undefined): UamMovieClipProperties | null => node?.kind === 'movieClip' ? {
		playing: node.playing,
		frame: node.frame,
		color: node.color,
	} : null;
	const initialImage = readImage(image)!;
	const initialMovieClip = readMovieClip(movieClip)!;
	const updatedImage: UamImageProperties = {
		color: '#123456',
		flip: 3,
		fillMethod: 2,
		fillOrigin: 1,
		fillClockwise: false,
		fillAmount: 0.37,
	};
	const updatedMovieClip: UamMovieClipProperties = {
		playing: false,
		frame: 5,
		color: '#abcdef',
	};
	const selector = (displayNodeId: string) => ({
		packageId: 'pkg001',
		componentResourceId: 'cmp001',
		displayNodeId,
	});
	const forward: UamTransactionOperation[] = [
		{ kind: 'setDisplayNodeProps', selector: selector(image.id), props: { imageProperties: updatedImage } },
		{ kind: 'setDisplayNodeProps', selector: selector(movieClip.id), props: { movieClipProperties: updatedMovieClip } },
	];
	t.deepEqual(validateTransactionSupport(project, forward), []);
	const original = structuredClone(project);
	const committed = await roundTripCommittedProject(applyUamTransaction(project, forward));
	t.deepEqual(project, original, 'transaction input remains immutable');
	const committedComponent = committed.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (committedComponent?.kind !== 'component') {
		t.fail('expected committed component resource');
		return;
	}
	t.deepEqual(readImage(committedComponent.component.displayList.find((node) => node.id === image.id)), updatedImage);
	t.deepEqual(readMovieClip(committedComponent.component.displayList.find((node) => node.id === movieClip.id)), updatedMovieClip);

	const restored = await roundTripCommittedProject(applyUamTransaction(committed, [
		{ kind: 'setDisplayNodeProps', selector: selector(image.id), props: { imageProperties: initialImage } },
		{ kind: 'setDisplayNodeProps', selector: selector(movieClip.id), props: { movieClipProperties: initialMovieClip } },
	]));
	const restoredComponent = restored.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (restoredComponent?.kind !== 'component') {
		t.fail('expected restored component resource');
		return;
	}
	t.deepEqual(readImage(restoredComponent.component.displayList.find((node) => node.id === image.id)), initialImage);
	t.deepEqual(readMovieClip(restoredComponent.component.displayList.find((node) => node.id === movieClip.id)), initialMovieClip);

	const invalid = validateTransactionSupport(project, [
		{ kind: 'setDisplayNodeProps', selector: selector(movieClip.id), props: { imageProperties: updatedImage } },
		{ kind: 'setDisplayNodeProps', selector: selector(image.id), props: { imageProperties: { ...updatedImage, fillAmount: 1.01 } } },
		{ kind: 'setDisplayNodeProps', selector: selector(movieClip.id), props: { movieClipProperties: { ...updatedMovieClip, frame: -1 } } },
	]);
	t.is(invalid.filter((issue) => issue.code === 'unsupported_display_node_field').length, 1);
	t.is(invalid.filter((issue) => issue.code === 'invalid_display_node_payload').length, 2);
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
		group: '',
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
		url: '',
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
		url: 'ui://pkg001img001',
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
		overflow: 2,
		scrollType: 2,
		scrollBarDisplay: 3,
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
		clickToExpand: 2,
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
	const unchangedTreeIssues = validateTransactionSupport(project, [{
		kind: 'setDisplayNodeProps',
		selector: selector(tree.id),
		props: { listProperties: initialTree },
	}]);
	t.deepEqual(unchangedTreeIssues.map((issue) => issue.code), ['display_node_props_unchanged']);

	const invalidTreeClickValues = [-1, 3, 1.5, true, '2', null] as const;
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
		{
			kind: 'setDisplayNodeProps',
			selector: selector(tree.id),
			props: { listProperties: { ...updatedTree, scrollBarDisplay: 4 } },
		},
		...invalidTreeClickValues.map((clickToExpand) => ({
			kind: 'setDisplayNodeProps' as const,
			selector: selector(tree.id),
			props: {
				listProperties: { ...updatedTree, clickToExpand: clickToExpand as number },
			},
		})),
	]);
	t.is(invalidPayloadIssues.filter((issue) => issue.code === 'invalid_display_node_payload').length, 10);

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

test('common display and group properties survive transaction, save/reload, inverse, and invalid target checks', async (t) => {
	const project = normalizeUamProject(createSupportedProject());
	const component = project.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (component?.kind !== 'component') {
		t.fail('expected component resource');
		return;
	}
	const text = component.component.displayList.find((node) => node.id === 'n1')!;
	const group: UamDisplayNode = {
		kind: 'group',
		...createDisplayNodeBase('group-props', 'group'),
		group: '',
		layout: 0,
		lineGap: 0,
		columnGap: 0,
		advanced: false,
		excludeInvisibles: false,
		autoSizeDisabled: false,
		mainGridIndex: -1,
	};
	component.component.displayList.push(group);
	const originalCommon = readCommonDisplayProperties(text);
	const originalGroup: UamGroupProperties = readSpecificProperties(group);
	const updatedCommon = {
		locked: true,
		aspect: true,
		minSize: { width: 10, height: 12 },
		maxSize: { width: 500, height: 400 },
		scale: { x: 1.25, y: 0.75 },
		skew: { x: 5, y: 7 },
		tooltips: 'tip',
		blendMode: 'add',
		filter: 'color',
		filterData: '1,0.5,0.25,1',
	} as const;
	const updatedGroup: UamGroupProperties = {
		layout: 1,
		lineGap: 4,
		columnGap: 6,
		advanced: true,
		excludeInvisibles: true,
		autoSizeDisabled: false,
		mainGridIndex: 0,
	};
	const selector = (displayNodeId: string) => ({
		packageId: 'pkg001',
		componentResourceId: 'cmp001',
		displayNodeId,
	});
	const forward: UamTransactionOperation[] = [
		{ kind: 'setDisplayNodeProps', selector: selector(text.id), props: updatedCommon },
		{ kind: 'setDisplayNodeProps', selector: selector(group.id), props: { groupProperties: updatedGroup } },
	];
	t.deepEqual(validateTransactionSupport(project, forward), []);
	const committed = await roundTripCommittedProject(applyUamTransaction(project, forward));
	const committedComponent = committed.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (committedComponent?.kind !== 'component') {
		t.fail('expected committed component resource');
		return;
	}
	const committedText = committedComponent.component.displayList.find((node) => node.id === text.id)!;
	const committedGroup = committedComponent.component.displayList.find((node) => node.id === group.id)!;
	t.deepEqual(readCommonDisplayProperties(committedText), updatedCommon);
	t.deepEqual(readSpecificProperties(committedGroup), updatedGroup);

	const inverse: UamTransactionOperation[] = [
		{ kind: 'setDisplayNodeProps', selector: selector(text.id), props: originalCommon },
		{ kind: 'setDisplayNodeProps', selector: selector(group.id), props: { groupProperties: originalGroup } },
	];
	const restored = await roundTripCommittedProject(applyUamTransaction(committed, inverse));
	const restoredComponent = restored.packages[0]?.resources.find((resource) => resource.id === 'cmp001');
	if (restoredComponent?.kind !== 'component') {
		t.fail('expected restored component resource');
		return;
	}
	t.deepEqual(readCommonDisplayProperties(restoredComponent.component.displayList.find((node) => node.id === text.id)!), originalCommon);
	t.deepEqual(readSpecificProperties(restoredComponent.component.displayList.find((node) => node.id === group.id)!), originalGroup);

	const invalidTarget = [{
		kind: 'setDisplayNodeProps' as const,
		selector: selector(text.id),
		props: { groupProperties: updatedGroup },
	}];
	t.true(validateTransactionSupport(project, invalidTarget).some((issue) => issue.code === 'unsupported_display_node_field'));
	t.throws(() => applyUamTransaction(project, invalidTarget), { instanceOf: UamTransactionError });
	t.deepEqual(readCommonDisplayProperties(text), originalCommon, 'invalid target leaves source state unchanged');
	t.true(validateTransactionSupport(project, [{
		kind: 'setDisplayNodeProps',
		selector: selector(text.id),
		props: { minSize: { width: 20, height: 10 }, maxSize: { width: 10, height: 5 } },
	}]).some((issue) => issue.code === 'invalid_display_node_payload'));
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
			group: '',
			resource: { packageId: 'pkg001', resourceId: 'cmp001' },
		},
		{
			kind: 'graph',
			...createDisplayNodeBase('n3', 'graph', 16),
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
			group: '',
			text: '[b]Rich[/b]',
			font: '',
			fontSize: 14,
			color: '#ffaa00',
		},
		{
			kind: 'textInput',
			...createDefaultUamPlainTextProperties(),
			...createDisplayNodeBase('n8', 'text-input', 56),
			group: '',
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
				outlineSoftness: 0.375,
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
				outlineSoftness: 0.25,
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
		t.is(richText.outlineSoftness, 0.375);
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
		t.is(textInput.outlineSoftness, 0.25);
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
		{ ...createDefaultUamTextProperties(), outlineSoftness: Number.NaN },
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
	}]).some((issue) => issue.code === 'display_node_props_unchanged'));
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
