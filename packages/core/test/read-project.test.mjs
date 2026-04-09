/**
 * Integration smoke test — reads the FairyGUI-Unity-Examples project and verifies the graph.
 *
 * Usage: yarn node packages/core/test/read-project.test.mjs
 */

import { NodeIO } from '../dist/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_PATH = path.resolve(
	__dirname,
	'../../../referer/UIProject/FairyGUI-Unity-Examples/FairyGUI-Unity-Examples.fairy',
);

async function main() {
	console.log('Reading project:', PROJECT_PATH);
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);
	const root = doc.getRoot();

	// Project metadata
	console.log('\n--- Project ---');
	console.log('ID:      ', root.getProjectId());
	console.log('Type:    ', root.getProjectType(), '(0 = Unity)');
	console.log('Version: ', root.getVersion());

	// Packages
	const packages = root.listPackages();
	console.log(`\n--- Packages (${packages.length}) ---`);

	let totalResources = 0;
	let totalComponents = 0;
	let totalChildren = 0;
	let totalControllers = 0;
	let totalTransitions = 0;
	let totalGears = 0;

	for (const pkg of packages) {
		const resources = pkg.listResources();
		const components = pkg.listComponents();
		totalResources += resources.length;
		totalComponents += components.length;

		console.log(`  [${pkg.getId()}] ${pkg.getName()} — ${resources.length} resources, ${components.length} components`);

		for (const comp of components) {
			const children = comp.listChildren();
			const controllers = comp.listControllers();
			const transitions = comp.listTransitions();
			totalChildren += children.length;
			totalControllers += controllers.length;
			totalTransitions += transitions.length;

			for (const child of children) {
				totalGears += child.listGears().length;
			}
		}

		// Show detail for first component
		if (components.length > 0) {
			const comp = components[0];
			const children = comp.listChildren();
			console.log(`    "${comp.getName()}" — ${children.length} children, ${comp.listControllers().length} controllers, ${comp.listTransitions().length} transitions`);
			for (const child of children.slice(0, 3)) {
				console.log(`      [${child.propertyType}] "${child.getName()}" src="${child.getSrc?.() ?? ''}" gears=${child.listGears().length} relations=${child.getRelations().length}`);
			}
		}
	}

	// Totals
	console.log('\n--- Totals ---');
	console.log('Resources:   ', totalResources);
	console.log('Components:  ', totalComponents);
	console.log('Children:    ', totalChildren);
	console.log('Controllers: ', totalControllers);
	console.log('Transitions: ', totalTransitions);
	console.log('Gears:       ', totalGears);

	// Settings
	const settings = root.getExtras()?.settings;
	if (settings) {
		console.log('\n--- Settings ---');
		console.log('Keys:', Object.keys(settings).join(', '));
	}

	// Basic assertions
	if (packages.length === 0) throw new Error('Expected at least one package');
	if (totalComponents === 0) throw new Error('Expected at least one component');
	if (totalChildren === 0) throw new Error('Expected at least one display object');

	console.log('\n✓ All assertions passed');
}

main().catch((err) => {
	console.error('\n✗ Test failed:', err);
	process.exit(1);
});
