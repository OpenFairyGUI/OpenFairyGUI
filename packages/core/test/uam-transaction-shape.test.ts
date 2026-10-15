import test from 'ava';
import {
	applyUamTransaction,
	applyUamTransactionAsync,
	createDefaultUamPlainTextProperties,
	normalizeUamProject,
	UamTransactionError,
	validateTransactionSupport,
	type UamProject,
	type UamTransactionOperation,
	type UamTransactionSupportIssueCode,
} from '../src/index.js';
import { OPERATION_PAYLOAD_SCHEMA } from '../src/uam/generated/operation-payload-schema.js';
import {
	createControllerModel,
	createLifecycleComponent,
	createLifecyclePackage,
	createLookGear,
	createNonLookGears,
	createSupportedProject,
	createTransitionModel,
	updateNonLookGear,
} from './uam-transaction-fixtures.js';

const PNG = new Uint8Array(Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
));

function createShapeProject(): UamProject {
	const project = createSupportedProject();
	project.branches = ['cn'];
	const pkg = project.packages[0]!;
	pkg.branchNames = ['cn'];
	pkg.folders.push({ branch: '', path: '/empty/', favorite: false, atlas: '' });
	pkg.folders.push({ branch: '', path: '/other/', favorite: false, atlas: '' });
	pkg.resources.push(createLifecycleComponent('cmp002', 'Popup'));
	pkg.resources.push({
		kind: 'misc', id: 'misc001', name: 'notes.txt', path: '/', exported: false, favorite: false,
		branch: '', branchItemIds: [], fileName: 'notes.txt', sourceBytes: new Uint8Array([1]),
	});
	const component = pkg.resources.find((resource) => resource.id === 'cmp001');
	if (component?.kind !== 'component') throw new Error('Expected cmp001.');
	component.component.controllers.push(createControllerModel('state'));
	component.component.transitions.push(createTransitionModel('intro'));
	component.component.displayList[0]!.gears.push(createLookGear('state'));
	component.component.displayList[1]!.gears.push(createNonLookGears('state').find((gear) => gear.kind === 'xy')!);
	project.packages.push(createLifecyclePackage('pkg002', 'Overlay'));
	return normalizeUamProject(project);
}

const project = createShapeProject();
const component = { packageId: 'pkg001', componentResourceId: 'cmp001' };
const image = { packageId: 'pkg001', resourceId: 'img001' };
const imageResource = project.packages[0]!.resources[0]!;
if (imageResource.kind !== 'image') throw new Error('Expected img001.');
const cmp001 = project.packages[0]!.resources[1]!;
if (cmp001.kind !== 'component') throw new Error('Expected cmp001.');
const textNode = { ...structuredClone(cmp001.component.displayList[1]!), id: 'n9', name: 'n9', gears: [] };
const xyGear = createNonLookGears('state').find((gear) => gear.kind === 'xy')!;

/** One contract-valid operation per kind; the compile-time key check keeps this sweep exhaustive. */
const VALID_OPERATIONS = {
	updateProjectSettings: { kind: 'updateProjectSettings', settings: { ...structuredClone(project.settings), i18n: { langFiles: [] } } },
	updatePackageSettings: { kind: 'updatePackageSettings', selector: { packageId: 'pkg001' }, settings: { compressPNG: true, jpegQuality: null, publish: structuredClone(createLifecyclePackage().publish) } },
	renameResource: { kind: 'renameResource', selector: image, newName: 'bg2' },
	moveResource: { kind: 'moveResource', selector: image, toPath: '/' },
	setResourceFavorite: { kind: 'setResourceFavorite', selector: image, favorite: true },
	setResourceFolderFavorite: { kind: 'setResourceFolderFavorite', selector: { packageId: 'pkg001', path: '/images/' }, favorite: true },
	setResourceFolderAtlas: { kind: 'setResourceFolderAtlas', selector: { packageId: 'pkg001', path: '/images/' }, atlas: '1' },
	setResourceExported: { kind: 'setResourceExported', selector: image, exported: false },
	addResourceFolder: { kind: 'addResourceFolder', selector: { packageId: 'pkg001' }, path: '/new/', favorite: true, atlas: '' },
	renameResourceFolder: { kind: 'renameResourceFolder', selector: { packageId: 'pkg001', path: '/empty/' }, newName: 'pics' },
	moveResourceFolder: { kind: 'moveResourceFolder', selector: { packageId: 'pkg001', path: '/empty/' }, toPath: '/other/' },
	removeResourceFolder: { kind: 'removeResourceFolder', selector: { packageId: 'pkg001', path: '/empty/' } },
	setImageResourceProps: { kind: 'setImageResourceProps', selector: image, props: { ...structuredClone(imageResource.image), smoothing: !imageResource.image.smoothing } },
	addResource: {
		kind: 'addResource',
		selector: { packageId: 'pkg001' },
		resource: { ...structuredClone(imageResource), id: 'img009', name: 'x.png', fileName: 'x.png', sourcePath: undefined, sourceBytes: new Uint8Array([1, 2]) },
		atIndex: 0,
	},
	addBranch: { kind: 'addBranch', branch: 'en' },
	renameBranch: { kind: 'renameBranch', selector: { branch: 'cn' }, newName: 'zh' },
	removeBranch: { kind: 'removeBranch', selector: { branch: 'cn' } },
	addPackage: { kind: 'addPackage', package: createLifecyclePackage('pkg003', 'Third'), atIndex: 2 },
	renamePackage: { kind: 'renamePackage', selector: { packageId: 'pkg002' }, newName: 'Overlay2' },
	removePackage: { kind: 'removePackage', selector: { packageId: 'pkg002' } },
	addComponent: { kind: 'addComponent', selector: { packageId: 'pkg001' }, component: createLifecycleComponent('cmp009', 'Popup9'), atIndex: 0 },
	removeComponent: { kind: 'removeComponent', selector: { packageId: 'pkg001', componentResourceId: 'cmp002' } },
	moveComponent: { kind: 'moveComponent', selector: { packageId: 'pkg001', componentResourceId: 'cmp002' }, toPackageId: 'pkg002', toIndex: 0 },
	replaceResourceBytes: { kind: 'replaceResourceBytes', selector: image, sourceBytes: PNG },
	removeResource: { kind: 'removeResource', selector: { packageId: 'pkg001', resourceId: 'misc001' } },
	setComponentProps: { kind: 'setComponentProps', selector: component, props: { size: { width: 10, height: 10 } } },
	setDisplayNodeProps: { kind: 'setDisplayNodeProps', selector: { ...component, displayNodeId: 'n1' }, props: { text: 'Hi', alpha: 0.5 } },
	attachDisplayNode: { kind: 'attachDisplayNode', selector: component, atIndex: 0, node: textNode },
	detachDisplayNode: { kind: 'detachDisplayNode', selector: { ...component, displayNodeId: 'n1' } },
	addController: { kind: 'addController', selector: { ...component, controllerName: 'c2' }, controller: createControllerModel('c2') },
	updateController: { kind: 'updateController', selector: { ...component, controllerName: 'state' }, controller: { ...createControllerModel('state'), selectedIndex: 1 } },
	removeController: { kind: 'removeController', selector: { ...component, controllerName: 'state' } },
	addTransition: { kind: 'addTransition', selector: { ...component, transitionName: 't2' }, transition: createTransitionModel('t2') },
	updateTransition: { kind: 'updateTransition', selector: { ...component, transitionName: 'intro' }, transition: { ...createTransitionModel('intro'), autoPlay: false } },
	removeTransition: { kind: 'removeTransition', selector: { ...component, transitionName: 'intro' } },
	addLookGear: { kind: 'addLookGear', selector: { ...component, displayNodeId: 'n1', kind: 'look', controllerName: 'state' }, gear: createLookGear('state') },
	updateLookGear: { kind: 'updateLookGear', selector: { ...component, displayNodeId: 'n0', kind: 'look', controllerName: 'state' }, gear: createLookGear('state', 0.5) },
	removeLookGear: { kind: 'removeLookGear', selector: { ...component, displayNodeId: 'n0', kind: 'look', controllerName: 'state' } },
	addGear: { kind: 'addGear', selector: { ...component, displayNodeId: 'n0', kind: 'xy', controllerName: 'state' }, gear: xyGear },
	updateGear: { kind: 'updateGear', selector: { ...component, displayNodeId: 'n1', kind: 'xy', controllerName: 'state' }, gear: updateNonLookGear(xyGear) },
	removeGear: { kind: 'removeGear', selector: { ...component, displayNodeId: 'n1', kind: 'xy', controllerName: 'state' } },
} satisfies { [K in UamTransactionOperation['kind']]: Extract<UamTransactionOperation, { kind: K }> };

const MALFORMED_VALUES: unknown[] = [undefined, null, 0, '', 'x', true, [], {}];

function issuesFor(operations: unknown) {
	return validateTransactionSupport(project, operations as UamTransactionOperation[]);
}

/** A malformed transaction may be rejected, but only through the transaction error contract. */
function assertRejectedWithoutCrash(t: import('ava').ExecutionContext, operations: unknown, label: string): void {
	const before = structuredClone(project);
	t.notThrows(() => issuesFor(operations), label);
	try {
		applyUamTransaction(project, operations as UamTransactionOperation[]);
	} catch (error) {
		t.true(error instanceof UamTransactionError, `${label}: ${String(error)}`);
	}
	t.deepEqual(project, before, label);
}

test('every operation kind accepts its contract shape', (t) => {
	for (const [kind, operation] of Object.entries(VALID_OPERATIONS)) {
		t.deepEqual(issuesFor([operation]), [], kind);
	}
});

test('a misspelled required field is reported at both field paths instead of throwing', async (t) => {
	const operations = [{ kind: 'renameResource', selector: image, name: 'Panel' }];
	t.deepEqual(issuesFor(operations).map(({ code, path, operationKind, field }) => ({ code, path, operationKind, field })), [
		{ code: 'invalid_operation_payload', path: 'operations[0].name', operationKind: 'renameResource', field: 'name' },
		{ code: 'invalid_operation_payload', path: 'operations[0].newName', operationKind: 'renameResource', field: 'newName' },
	]);
	t.regex(issuesFor(operations)[0]!.message, /accepted fields: kind, selector, newName, opId/);
	const error = await t.throwsAsync(applyUamTransactionAsync(project, operations as UamTransactionOperation[]), { instanceOf: UamTransactionError });
	t.is(error?.code, 'transaction_unsupported');
});

test('batch and element shapes are rejected before any stage reads them', (t) => {
	for (const operations of [null, {}, 'renameResource', 1]) {
		t.like(issuesFor(operations)[0], { code: 'invalid_operation_payload', path: 'operations' });
		assertRejectedWithoutCrash(t, operations, `operations=${JSON.stringify(operations)}`);
	}
	const elements: unknown[] = [null, 'renameResource', [], [VALID_OPERATIONS.renameResource]];
	elements[5] = VALID_OPERATIONS.setResourceFavorite; // leaves a hole at index 4
	t.deepEqual(issuesFor(elements).map(({ code, path }) => [code, path]), [
		['invalid_operation_payload', 'operations[0]'],
		['invalid_operation_payload', 'operations[1]'],
		['invalid_operation_payload', 'operations[2]'],
		['invalid_operation_payload', 'operations[3]'],
		['invalid_operation_payload', 'operations[4]'],
	]);
	t.deepEqual(issuesFor([{ selector: image }, { kind: 'toString' }, { kind: 7 }]).map(({ code, path }) => [code, path]), [
		['unsupported_operation', 'operations[0].kind'],
		['unsupported_operation', 'operations[1].kind'],
		['unsupported_operation', 'operations[2].kind'],
	]);
	// A malformed later operation must not crash projections run for earlier, valid ones.
	assertRejectedWithoutCrash(t, [VALID_OPERATIONS.renameResource, { kind: 'bogus', selector: null }], 'unknown kind with null selector');
});

test('malformed top-level and selector fields never throw and null is reported at its exact path', (t) => {
	for (const [kind, operation] of Object.entries(VALID_OPERATIONS) as Array<[string, Record<string, unknown>]>) {
		const fields = Object.keys(operation).filter((field) => field !== 'kind');
		for (const field of [...fields, 'opId']) {
			for (const value of MALFORMED_VALUES) {
				const mutated = { ...operation, [field]: value };
				assertRejectedWithoutCrash(t, [mutated], `${kind}.${field}=${JSON.stringify(value)}`);
				assertRejectedWithoutCrash(t, [mutated, VALID_OPERATIONS.setResourceFavorite], `${kind}.${field} before a valid operation`);
			}
			t.true(
				issuesFor([{ ...operation, [field]: null }])
					.some((issue) => issue.code === 'invalid_operation_payload' && issue.path === `operations[0].${field}`),
				`${kind}.${field}=null`,
			);
		}
		t.like(issuesFor([{ ...operation, unexpected: true }])[0], {
			code: 'invalid_operation_payload',
			path: 'operations[0].unexpected',
			field: 'unexpected',
		});
		const selector = operation.selector as Record<string, unknown> | undefined;
		if (!selector) continue;
		for (const field of Object.keys(selector)) {
			for (const value of MALFORMED_VALUES) {
				assertRejectedWithoutCrash(t, [{ ...operation, selector: { ...selector, [field]: value } }], `${kind}.selector.${field}`);
			}
			t.like(issuesFor([{ ...operation, selector: { ...selector, [field]: 1 } }])[0], {
				code: 'invalid_operation_payload',
				path: `operations[0].selector.${field}`,
			}, `${kind}.selector.${field}=1`);
		}
		t.like(issuesFor([{ ...operation, selector: { ...selector, extra: 'x' } }])[0], {
			code: 'invalid_operation_payload',
			path: 'operations[0].selector.extra',
		});
	}
});

test('required and optional fields follow the operation contract', (t) => {
	const { atIndex: _atIndex, ...appendResource } = VALID_OPERATIONS.addResource;
	t.deepEqual(issuesFor([appendResource]), []);
	const { atIndex: _packageIndex, ...unplacedPackage } = VALID_OPERATIONS.addPackage;
	t.deepEqual(issuesFor([unplacedPackage]).map(({ code, path }) => [code, path]), [['invalid_operation_payload', 'operations[0].atIndex']]);
	t.deepEqual(
		issuesFor([{ ...VALID_OPERATIONS.addResourceFolder, branch: undefined, favorite: undefined, atlas: undefined }]),
		[],
	);
	t.like(issuesFor([{ ...VALID_OPERATIONS.replaceResourceBytes, sourceBytes: [1, 2, 3] }])[0], {
		code: 'invalid_operation_payload',
		path: 'operations[0].sourceBytes',
		message: 'replaceResourceBytes.sourceBytes must be a Uint8Array.',
	});
});

test('malformed nested payloads are reported at their exact path with the owning domain code', (t) => {
	const cases: Array<[unknown, string, string]> = [
		[{ ...VALID_OPERATIONS.addController, controller: { ...createControllerModel('c2'), pages: null } }, 'invalid_controller_payload', 'operations[0].controller.pages'],
		[{ ...VALID_OPERATIONS.addController, controller: { ...createControllerModel('c2'), actions: [{ fromPageIds: 'x' }] } }, 'invalid_controller_payload', 'operations[0].controller.actions[0].fromPageIds'],
		[{ ...VALID_OPERATIONS.addTransition, transition: { ...createTransitionModel('t2'), items: {} } }, 'invalid_transition_payload', 'operations[0].transition.items'],
		[{ ...VALID_OPERATIONS.addGear, gear: { ...xyGear, states: [null] } }, 'invalid_gear_payload', 'operations[0].gear.states[0]'],
		[{ ...VALID_OPERATIONS.attachDisplayNode, node: { ...textNode, gears: 'x' } }, 'invalid_display_node_payload', 'operations[0].node.gears'],
		[{ ...VALID_OPERATIONS.attachDisplayNode, node: { ...textNode, color: 0 } }, 'invalid_display_node_payload', 'operations[0].node.color'],
		[{ ...VALID_OPERATIONS.addComponent, component: { ...createLifecycleComponent('cmp009', 'Popup9'), kind: 'image' } }, 'invalid_component_payload', 'operations[0].component.kind'],
		[{ ...VALID_OPERATIONS.addComponent, component: { ...createLifecycleComponent('cmp009', 'Popup9'), component: null } }, 'invalid_component_payload', 'operations[0].component.component'],
		[{ ...VALID_OPERATIONS.addPackage, package: { ...createLifecyclePackage('pkg003', 'Third'), resources: 0 } }, 'invalid_package_payload', 'operations[0].package.resources'],
		[{ ...VALID_OPERATIONS.addPackage, package: { ...createLifecyclePackage('pkg003', 'Third'), name: null } }, 'invalid_package_payload', 'operations[0].package.name'],
		[{ ...VALID_OPERATIONS.addResource, resource: { ...VALID_OPERATIONS.addResource.resource, branchItemIds: 0 } }, 'invalid_resource_payload', 'operations[0].resource.branchItemIds'],
	];
	for (const [operation, code, path] of cases) {
		assertRejectedWithoutCrash(t, [operation], path);
		t.true(issuesFor([operation]).some((issue) => issue.code === code && issue.path === path), `${code} at ${path}`);
	}
	// Same-batch readers skip a malformed earlier payload; its own operation reports it.
	const malformedController = { ...VALID_OPERATIONS.updateController, controller: { ...createControllerModel('state'), pages: 'x' } };
	assertRejectedWithoutCrash(t, [malformedController, VALID_OPERATIONS.updateGear], 'controller then gear');
});

/** Valid JSON that structured clone keeps, but whose string conversion throws. */
const unconvertible = () => ({ toString: null, valueOf: null });

test('an unconvertible kind is reported at its path by support checks and both apply paths', async (t) => {
	const operations = [{ kind: unconvertible() }] as unknown as UamTransactionOperation[];
	const before = structuredClone(project);
	let issues: ReturnType<typeof validateTransactionSupport> = [];
	t.notThrows(() => { issues = validateTransactionSupport(project, operations); });
	t.deepEqual(issues.map(({ code, path, message }) => ({ code, path, message })), [{
		code: 'unsupported_operation',
		path: 'operations[0].kind',
		message: 'Transaction operation kind must be a string; received object.',
	}]);
	const syncError = t.throws(() => applyUamTransaction(project, operations), { instanceOf: UamTransactionError });
	const asyncError = await t.throwsAsync(applyUamTransactionAsync(project, operations), { instanceOf: UamTransactionError });
	for (const error of [syncError, asyncError]) {
		t.is(error?.code, 'transaction_unsupported');
		t.like(error?.issues?.[0], { code: 'unsupported_operation', path: 'operations[0].kind' });
	}
	t.deepEqual(project, before);
});

test('unconvertible values inside payloads are reported without converting them', (t) => {
	const cases: Array<[unknown, UamTransactionSupportIssueCode, string]> = [
		[{ ...VALID_OPERATIONS.addController, controller: { ...createControllerModel('c2'), homePageType: unconvertible() } }, 'invalid_controller_payload', 'operations[0].controller.homePageType'],
		[{ ...VALID_OPERATIONS.addController, controller: { ...createControllerModel('c2'), selectedIndex: unconvertible() } }, 'invalid_controller_payload', 'operations[0].controller.selectedIndex'],
		[{ ...VALID_OPERATIONS.attachDisplayNode, node: { ...textNode, kind: unconvertible() } }, 'unsupported_display_node_kind', 'operations[0].node.kind'],
		[{ ...VALID_OPERATIONS.attachDisplayNode, node: { ...textNode, id: unconvertible() } }, 'invalid_display_node_payload', 'operations[0].node.id'],
		[{ ...VALID_OPERATIONS.addComponent, component: { ...createLifecycleComponent('cmp009', 'Popup9'), id: unconvertible() } }, 'invalid_component_payload', 'operations[0].component.id'],
		[{ ...VALID_OPERATIONS.addResource, resource: { ...VALID_OPERATIONS.addResource.resource, kind: unconvertible() } }, 'unsupported_resource_kind', 'operations[0].resource.kind'],
		[{ ...VALID_OPERATIONS.addResource, resource: { ...VALID_OPERATIONS.addResource.resource, branch: unconvertible() } }, 'invalid_resource_payload', 'operations[0].resource.branch'],
	];
	for (const [operation, code, path] of cases) {
		assertRejectedWithoutCrash(t, [operation], path);
		const issue = issuesFor([operation]).find((candidate) => candidate.path === path);
		t.is(issue?.code, code, path);
		// Kind details are typed strings; a caller object is never copied into a diagnostic.
		t.false(issue !== undefined && Object.values(issue).some((value) => typeof value === 'object'), path);
	}
});

test('literal selector kinds only accept their contract values', (t) => {
	const lookSelector = VALID_OPERATIONS.removeLookGear.selector;
	// The XY gear on n1 shares the look selector's controller; a look operation must not reach it.
	const wrongLook = { kind: 'removeLookGear', selector: { ...lookSelector, displayNodeId: 'n1', kind: 'xy' } };
	t.like(issuesFor([wrongLook])[0], {
		code: 'invalid_operation_payload',
		path: 'operations[0].selector.kind',
		message: 'removeLookGear.selector.kind must be one of "look".',
	});
	const error = t.throws(() => applyUamTransaction(project, [wrongLook as never]), { instanceOf: UamTransactionError });
	t.is(error?.code, 'transaction_unsupported');
	t.true(cmp001.component.displayList[1]!.gears.some((gear) => gear.kind === 'xy'));
	for (const kind of ['addLookGear', 'updateLookGear'] as const) {
		t.like(issuesFor([{ ...VALID_OPERATIONS[kind], selector: { ...VALID_OPERATIONS[kind].selector, kind: 'xy' } }])[0], {
			code: 'invalid_operation_payload',
			path: 'operations[0].selector.kind',
		}, kind);
	}
	for (const kind of ['addGear', 'updateGear', 'removeGear'] as const) {
		const operation = { ...VALID_OPERATIONS[kind], selector: { ...VALID_OPERATIONS[kind].selector, kind: 'bogus' } };
		t.like(issuesFor([operation])[0], { code: 'invalid_operation_payload', path: 'operations[0].selector.kind' }, kind);
		t.throws(() => applyUamTransaction(project, [operation as never]), { instanceOf: UamTransactionError }, kind);
	}
});

test('snapshot payloads follow the generated contract structure with the owning domain code', (t) => {
	const attach = VALID_OPERATIONS.attachDisplayNode;
	const props = VALID_OPERATIONS.setDisplayNodeProps;
	const lifecycleComponent = createLifecycleComponent('cmp009', 'Popup9');
	const { name: _name, ...unnamedNode } = textNode;
	const holes: unknown[] = [];
	holes[1] = { id: '1', name: 'Alert', remark: '' };
	const cases: Array<[string, unknown, string, string, RegExp?]> = [
		['wrong type', { ...attach, node: { ...textNode, position: { x: '1', y: 0 } } }, 'invalid_display_node_payload', 'node.position.x', /^attachDisplayNode\.node\.position\.x must be a finite number\.$/],
		['missing required field', { ...attach, node: unnamedNode }, 'invalid_display_node_payload', 'node.name', /is required and must be a string/],
		['undeclared nested field', { ...attach, node: { ...textNode, position: { x: 0, y: 0, z: 0 } } }, 'invalid_display_node_payload', 'node.position.z', /accepted fields: x, y/],
		['non-finite number', { ...attach, node: { ...textNode, alpha: Number.NaN } }, 'invalid_display_node_payload', 'node.alpha'],
		['unknown payload kind', { ...attach, node: { ...textNode, kind: 'bogus' } }, 'unsupported_display_node_kind', 'node.kind', /must be one of "image", "text"/],
		['unknown nested kind', { ...VALID_OPERATIONS.addComponent, component: { ...lifecycleComponent, component: { ...lifecycleComponent.component, displayList: [{ ...textNode, kind: 'bogus' }] } } }, 'invalid_component_payload', 'component.component.displayList[0].kind'],
		['unsupported props field', { ...props, props: { width: 10 } }, 'unsupported_display_node_field', 'props.width'],
		['undeclared field inside props', { ...props, props: { position: { x: 0, y: 0, z: 0 } } }, 'invalid_display_node_payload', 'props.position.z'],
		['closest union member', { ...props, props: { textProperties: { ...createDefaultUamPlainTextProperties(), fontSize: 'x' } } }, 'invalid_display_node_payload', 'props.textProperties.fontSize'],
		['fixed-length tuple', { ...VALID_OPERATIONS.setImageResourceProps, props: { ...imageResource.image, scale9Grid: [1, 2, 3] } }, 'invalid_resource_payload', 'props.scale9Grid', /an array of 4 items/],
		['plain array where bytes are declared', { ...VALID_OPERATIONS.addResource, resource: { ...VALID_OPERATIONS.addResource.resource, sourceBytes: [1, 2] } }, 'invalid_resource_payload', 'resource.sourceBytes'],
		['unknown resource kind', { ...VALID_OPERATIONS.addResource, resource: { ...VALID_OPERATIONS.addResource.resource, kind: 'component' } }, 'unsupported_resource_kind', 'resource.kind'],
		['array hole', { ...VALID_OPERATIONS.addController, controller: { ...createControllerModel('c2'), pages: holes } }, 'invalid_controller_payload', 'controller.pages[0]'],
		// These used to apply and then fail while saving, or to be written to disk as given.
		['component name', { ...VALID_OPERATIONS.addComponent, component: { ...lifecycleComponent, name: 42 } }, 'invalid_component_payload', 'component.name'],
		['transition item time', { ...VALID_OPERATIONS.addTransition, transition: { ...createTransitionModel('t2'), items: [{ ...createTransitionModel('t2').items[0]!, time: 'x' }] } }, 'invalid_transition_payload', 'transition.items[0].time'],
		['controller selected index', { ...VALID_OPERATIONS.addController, controller: { ...createControllerModel('c2'), selectedIndex: 'x' } }, 'invalid_controller_payload', 'controller.selectedIndex'],
		['gear tween duration', { ...VALID_OPERATIONS.addGear, gear: { ...xyGear, tweenDuration: 'x' } }, 'invalid_gear_payload', 'gear.tweenDuration'],
		['package jpeg quality', { ...VALID_OPERATIONS.updatePackageSettings, settings: { ...VALID_OPERATIONS.updatePackageSettings.settings, jpegQuality: '80' } }, 'invalid_package_settings', 'settings.jpegQuality'],
	];
	for (const [label, operation, code, path, message] of cases) {
		const issues = issuesFor([operation]);
		t.deepEqual(issues.map((issue) => [issue.code, issue.path]), [[code, `operations[0].${path}`]], label);
		if (message) t.regex(issues[0]!.message, message, label);
		assertRejectedWithoutCrash(t, [operation], label);
		const error = t.throws(() => applyUamTransaction(project, [operation] as UamTransactionOperation[]), { instanceOf: UamTransactionError }, label);
		t.is(error?.code, 'transaction_unsupported', label);
	}
	t.like(issuesFor([{ ...props, props: { width: 10 } }])[0], { field: 'width', operationKind: 'setDisplayNodeProps' });
	// A structural issue stops the batch before domain stages read any operation.
	t.deepEqual(issuesFor([VALID_OPERATIONS.removeResource, { ...attach, node: { ...textNode, alpha: 'x' } }]).map((issue) => issue.path), ['operations[1].node.alpha']);
});

test('every generated payload root is enforced by the shape gate', (t) => {
	for (const [kind, fields] of Object.entries(OPERATION_PAYLOAD_SCHEMA.roots)) {
		const operation = VALID_OPERATIONS[kind as keyof typeof VALID_OPERATIONS] as Record<string, unknown>;
		for (const field of Object.keys(fields)) {
			const payload = operation[field] as Record<string, unknown>;
			const key = Object.keys(payload).find((name) => payload[name] !== undefined)!;
			const issues = issuesFor([{ ...operation, [field]: { ...payload, [key]: Symbol('probe') } }]);
			t.true(
				issues.some((issue) => issue.code !== 'invalid_operation_payload' && issue.path.startsWith(`operations[0].${field}.${key}`)),
				`${kind}.${field}.${key}`,
			);
		}
	}
});
