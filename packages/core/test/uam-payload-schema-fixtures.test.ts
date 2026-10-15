import test from 'ava';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import { normalizeUamProject, type UamTransactionOperation, type UamTransactionSupportIssue } from '../src/index.js';
import { NodeIO } from '../src/node.js';
import { readProjectAsUam } from '../src/uam/index.js';
import { validateOperationShapes } from '../src/uam/preflight/operation-shape.js';

const LAYABOX_PROJECT_PATH = getFixtureProjectPath('FairyGUI-layabox', 'demo/UIProject/FairyGUI-layabox-demo.fairy');

test('every snapshot read from a real project passes the generated payload structure', async (t) => {
	const project = normalizeUamProject(await readProjectAsUam(new NodeIO(), LAYABOX_PROJECT_PATH, { hydrateResourceBytes: true }));
	const operations: UamTransactionOperation[] = [{ kind: 'updateProjectSettings', settings: project.settings }];
	for (const pkg of project.packages) {
		const packageSelector = { packageId: pkg.id };
		operations.push(
			{ kind: 'addPackage', package: pkg, atIndex: 0 },
			{ kind: 'updatePackageSettings', selector: packageSelector, settings: { compressPNG: pkg.compressPNG, jpegQuality: pkg.jpegQuality, publish: pkg.publish } },
		);
		for (const resource of pkg.resources) {
			const resourceSelector = { packageId: pkg.id, resourceId: resource.id };
			if (resource.kind !== 'component') {
				operations.push({ kind: 'addResource', selector: packageSelector, resource });
				if (resource.kind === 'image') operations.push({ kind: 'setImageResourceProps', selector: resourceSelector, props: resource.image });
				continue;
			}
			const selector = { packageId: pkg.id, componentResourceId: resource.id };
			const { size, properties, controllers, transitions, displayList } = resource.component;
			operations.push(
				{ kind: 'addComponent', selector: packageSelector, component: resource, atIndex: 0 },
				{ kind: 'setComponentProps', selector, props: { size, properties } },
			);
			for (const controller of controllers) {
				operations.push({ kind: 'updateController', selector: { ...selector, controllerName: controller.name }, controller });
			}
			for (const transition of transitions) {
				operations.push({ kind: 'updateTransition', selector: { ...selector, transitionName: transition.name }, transition });
			}
			for (const node of displayList) {
				operations.push({ kind: 'attachDisplayNode', selector, atIndex: 0, node });
				for (const gear of node.gears) {
					const gearSelector = { ...selector, displayNodeId: node.id, controllerName: gear.controllerName };
					operations.push(gear.kind === 'look'
						? { kind: 'updateLookGear', selector: { ...gearSelector, kind: 'look' }, gear }
						: { kind: 'updateGear', selector: { ...gearSelector, kind: gear.kind }, gear });
				}
			}
		}
	}
	const issues: UamTransactionSupportIssue[] = [];
	const valid = validateOperationShapes(operations, issues);
	t.deepEqual(issues, []);
	t.true(valid);
	t.true(operations.length > 1000, `${operations.length} snapshot operations`);
});
