import test from 'ava';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type GTree, ListSelectionMode, NodeIO, PropertyType } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_PATH = path.resolve(
	__dirname,
	'../../../referer/UIProject/FairyGUI-Unity-Examples/FairyGUI-Unity-Examples.fairy',
);

// Shared: read the project once for all tests in this file.
let _doc: Awaited<ReturnType<NodeIO['readProject']>>;
async function getDoc() {
	if (!_doc) {
		const io = new NodeIO();
		_doc = await io.readProject(PROJECT_PATH);
	}
	return _doc;
}

test('reads project metadata', async (t) => {
	const doc = await getDoc();
	const root = doc.getRoot();
	t.is(root.getProjectType(), 0, 'type 0 = Unity');
	t.is(root.getVersion(), '3.0');
	t.truthy(root.getProjectId(), 'project ID is non-empty');
});

test('discovers all packages', async (t) => {
	const doc = await getDoc();
	const packages = doc.getRoot().listPackages();
	t.true(packages.length >= 20, `expected ≥20 packages, got ${packages.length}`);
});

test('Basics package has expected resources and components', async (t) => {
	const doc = await getDoc();
	const root = doc.getRoot();
	const basics = root.listPackages().find((p) => p.getName() === 'Basics');
	t.truthy(basics, 'Basics package exists');
	t.true(basics!.listResources().length > 50, 'Basics has many resources');
	t.true(basics!.listComponents().length > 30, 'Basics has many components');
});

test('Button component has controller, children, and gears', async (t) => {
	const doc = await getDoc();
	const root = doc.getRoot();
	const basics = root.listPackages().find((p) => p.getName() === 'Basics')!;
	const button = basics.listComponents().find((c) => c.getName() === 'Button');
	t.truthy(button, 'Button component exists');
	t.is(button!.listControllers().length, 1, 'Button has 1 controller');
	t.is(button!.listChildren().length, 4, 'Button has 4 children');

	// Images should have gearDisplay gears
	const images = button!.listChildren().filter((c) => (c.propertyType as string) === 'GImage');
	const gearedImages = images.filter((img) => img.listGears().length > 0);
	t.true(gearedImages.length > 0, 'some images have gears');
});

test('controller pages are parsed', async (t) => {
	const doc = await getDoc();
	const root = doc.getRoot();
	const basics = root.listPackages().find((p) => p.getName() === 'Basics')!;
	const button = basics.listComponents().find((c) => c.getName() === 'Button')!;
	const ctrl = button.listControllers()[0];
	t.truthy(ctrl, 'controller exists');
	t.is(ctrl.getName(), 'button');
	// pages: "0,up,1,down,2,over,3,selectedOver" → 4 pages
	t.is(ctrl.listPages().length, 4, 'button controller has 4 pages');
});

test('transitions are parsed', async (t) => {
	const doc = await getDoc();
	const root = doc.getRoot();
	const transition = root.listPackages().find((p) => p.getName() === 'Transition');
	t.truthy(transition, 'Transition package exists');
	const compsWithTrans = transition!.listComponents().filter((c) => c.listTransitions().length > 0);
	t.true(compsWithTrans.length > 0, 'at least one component has transitions');
	const trans = compsWithTrans[0].listTransitions()[0];
	t.true(trans.listItems().length > 0, 'transition has items');
});

test('relations are parsed on display objects', async (t) => {
	const doc = await getDoc();
	const root = doc.getRoot();
	const basics = root.listPackages().find((p) => p.getName() === 'Basics')!;
	const button = basics.listComponents().find((c) => c.getName() === 'Button')!;
	const childrenWithRelations = button.listChildren().filter((c) => c.getRelations().length > 0);
	t.true(childrenWithRelations.length > 0, 'some children have relations');
});

test('settings are loaded', async (t) => {
	const doc = await getDoc();
	const settings = doc.getRoot().getSettings();
	t.truthy(settings, 'settings object exists');
	t.truthy(settings.publish, 'publish settings loaded');
	t.truthy(settings.common, 'common settings loaded');
});

test('Demo_List display list order matches component XML order', async (t) => {
	const doc = await getDoc();
	const basics = doc.getRoot().listPackages().find((p) => p.getName() === 'Basics')!;
	const comp = basics.listComponents().find((c) => c.getName() === 'Demo_List')!;
	t.deepEqual(
		comp.listChildren().map((child) => child.getId()),
		['n0', 'n1', 'n2', 'n4', 'n5', 'n7', 'n8', 'n9', 'n10'],
	);
});

test('Demo_Grid display list order matches component XML order', async (t) => {
	const doc = await getDoc();
	const basics = doc.getRoot().listPackages().find((p) => p.getName() === 'Basics')!;
	const comp = basics.listComponents().find((c) => c.getName() === 'Demo_Grid')!;
	t.deepEqual(
		comp.listChildren().map((child) => child.getId()),
		['n27', 'n18', 'n19', 'n20', 'n21', 'n23', 'n24', 'n25', 'n28', 'n29', 'n30', 'n32', 'n33', 'n34', 'n35'],
	);
});

test('totals across all packages', async (t) => {
	const doc = await getDoc();
	const packages = doc.getRoot().listPackages();
	let components = 0;
	let children = 0;
	let gears = 0;
	for (const pkg of packages) {
		for (const comp of pkg.listComponents()) {
			components++;
			for (const child of comp.listChildren()) {
				children++;
				gears += child.listGears().length;
			}
		}
	}
	t.true(components >= 100, `expected ≥100 components, got ${components}`);
	t.true(children >= 500, `expected ≥500 display objects, got ${children}`);
	t.true(gears >= 100, `expected ≥100 gears, got ${gears}`);
});

test('Demo_Image preserves image flip values from source XML', async (t) => {
	const doc = await getDoc();
	const basics = doc.getRoot().listPackages().find((p) => p.getName() === 'Basics')!;
	const comp = basics.listComponents().find((c) => c.getName() === 'Demo_Image')!;
	const byId = new Map(comp.listChildren().map((child) => [child.getId(), child as any]));

	t.is(byId.get('n7')?.getFlip?.(), 1, 'n7 keeps horizontal flip');
	t.is(byId.get('n8')?.getFlip?.(), 2, 'n8 keeps vertical flip');
	t.is(byId.get('n17')?.getFlip?.(), 3, 'n17 keeps both flip');
	t.is(byId.get('n18')?.getFlip?.(), 2, 'n18 keeps vertical flip');
});

test('Demo_Graph preserves pivot anchor on image-backed graph children', async (t) => {
	const doc = await getDoc();
	const basics = doc.getRoot().listPackages().find((p) => p.getName() === 'Basics')!;
	const comp = basics.listComponents().find((c) => c.getName() === 'Demo_Graph')!;
	const byId = new Map(comp.listChildren().map((child) => [child.getId(), child as any]));

	t.true(byId.get('n14_ty2k')?.getPivotAsAnchor?.(), 'n14_ty2k keeps pivot anchor');
	t.true(byId.get('n15_ty2k')?.getPivotAsAnchor?.(), 'n15_ty2k keeps pivot anchor');
});

test('TreeView package preserves tree list attrs and item hierarchy', async (t) => {
	const doc = await getDoc();
	const treeViewPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'TreeView')!;
	const main = treeViewPkg.listComponents().find((c) => c.getName() === 'Main')!;
	const byName = new Map(main.listChildren().map((child) => [child.getName(), child as any]));

	const tree = byName.get('tree');
	const tree2 = byName.get('tree2');
	t.truthy(tree, 'tree child exists');
	t.truthy(tree2, 'tree2 child exists');

	t.is(tree?.propertyType, PropertyType.G_TREE, 'tree lifts to formal GTree');
	t.is(tree2?.propertyType, PropertyType.G_TREE, 'tree2 lifts to formal GTree');
	t.true(tree?.getTreeView?.(), 'tree keeps treeView=true');
	t.is(tree?.getIndent?.(), 15, 'tree keeps indent');
	t.is(tree?.getClickToExpand?.(), 1, 'tree keeps clickToExpand');
	t.true(tree2?.getTreeView?.(), 'tree2 keeps treeView=true');
	t.is(tree2?.getIndent?.(), 15, 'tree2 keeps indent');
	t.is(tree2?.getClickToExpand?.(), 1, 'tree2 keeps clickToExpand');

	t.deepEqual(
		tree?.getListItems?.().map((item: any) => ({
			title: item.title,
			icon: item.icon,
			level: item.level,
			isFolder: item.isFolder,
		})),
		[
			{ title: 'Folder 1', icon: null, level: 0, isFolder: true },
			{ title: 'Leaf 1', icon: 'ui://5nx1f8vzua5o8', level: 1, isFolder: false },
			{ title: 'Leaf 2', icon: 'ui://5nx1f8vzua5o8', level: 1, isFolder: false },
			{ title: 'Leaf 3', icon: 'ui://5nx1f8vzua5o8', level: 1, isFolder: false },
			{ title: 'Leaf 4', icon: 'ui://5nx1f8vzua5o8', level: 1, isFolder: false },
			{ title: 'Folder 2', icon: null, level: 0, isFolder: true },
			{ title: 'Leaf 1', icon: 'ui://5nx1f8vzua5o7', level: 1, isFolder: false },
		],
	);
});

test('TreeView package resolves default tree item template semantics', async (t) => {
	const doc = await getDoc();
	const treeViewPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'TreeView')!;
	const main = treeViewPkg.listComponents().find((c) => c.getName() === 'Main')!;
	const tree = main.listChildren().find((child) => child.getName?.() === 'tree') as ReturnType<Document['createGTree']> | undefined;
	t.truthy(tree, 'tree child exists');

	const template = tree?.inspectDefaultItemTemplate(doc.getRoot());
	t.truthy(template, 'default tree item template resolves');
	t.is(template?.component.getName(), 'TreeItem');
	t.is(template?.expandedController?.getName(), 'expanded');
	t.is(template?.leafController?.getName(), 'leaf');
	t.is(template?.titleChild?.getName(), 'title');
	t.is(template?.titleChild?.propertyType, PropertyType.G_TEXT_FIELD);
	t.is(template?.iconChild?.getName(), 'icon');
	t.is(template?.iconChild?.propertyType, PropertyType.G_LOADER);
	t.is(template?.indentChild?.getName(), 'indent');
	t.is(template?.expandButtonChild?.getName(), 'expandButton');
	t.is(template?.expandButtonChild?.propertyType, PropertyType.G_COMPONENT);
	t.is(template?.expandButtonChild?.getSrc?.(), 'pmk33');
});

test('TreeView package builds runtime tree hierarchy semantics', async (t) => {
	const doc = await getDoc();
	const treeViewPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'TreeView')!;
	const main = treeViewPkg.listComponents().find((c) => c.getName() === 'Main')!;
	const tree = main.listChildren().find((child) => child.getName?.() === 'tree') as ReturnType<Document['createGTree']> | undefined;
	t.truthy(tree, 'tree child exists');

	const runtimeRoot = tree?.buildRuntimeTree();
	t.truthy(runtimeRoot, 'runtime root exists');
	t.true(runtimeRoot?.isFolder ?? false);
	t.true(runtimeRoot?.expanded ?? false);
	t.is(runtimeRoot?.level, 0);
	t.is(runtimeRoot?.children.length, 2);

	const [folder1, folder2] = runtimeRoot?.children ?? [];
	t.is(folder1?.title, 'Folder 1');
	t.true(folder1?.isFolder ?? false);
	t.true(folder1?.expanded ?? false);
	t.is(folder1?.level, 1);
	t.is(folder1?.sourceLevel, 0);
	t.is(folder1?.children.length, 4);
	t.true(folder1?.children.every((node) => node.parent === folder1));
	t.true(folder1?.children.every((node) => node.level === 2));
	t.true(folder1?.children.every((node) => node.isFolder === false));
	t.true(folder1?.children.every((node) => node.expanded === null));
	t.deepEqual(folder1?.children.map((node) => node.title), ['Leaf 1', 'Leaf 2', 'Leaf 3', 'Leaf 4']);

	t.is(folder2?.title, 'Folder 2');
	t.true(folder2?.isFolder ?? false);
	t.is(folder2?.children.length, 1);
	t.is(folder2?.children[0]?.title, 'Leaf 1');
	t.is(folder2?.children[0]?.icon, 'ui://5nx1f8vzua5o7');

	const flattened = tree?.listRuntimeNodes() ?? [];
	t.deepEqual(flattened.map((node) => node.title), ['Folder 1', 'Leaf 1', 'Leaf 2', 'Leaf 3', 'Leaf 4', 'Folder 2', 'Leaf 1']);
});

test('TreeView package exposes interactive runtime tree state helpers', async (t) => {
	const doc = await getDoc();
	const treeViewPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'TreeView')!;
	const main = treeViewPkg.listComponents().find((c) => c.getName() === 'Main')!;
	const tree = main.listChildren().find((child) => child.getName?.() === 'tree') as ReturnType<Document['createGTree']> | undefined;
	t.truthy(tree, 'tree child exists');

	const defaultState = tree?.createInteractionState();
	t.deepEqual(defaultState, {
		expandedItemIndices: [0, 5],
		selectedItemIndices: [],
		lastSelectedItemIndex: -1,
	});

	const collapsed = tree?.collapseAll(defaultState);
	t.deepEqual(collapsed, {
		expandedItemIndices: [],
		selectedItemIndices: [],
		lastSelectedItemIndex: -1,
	});
	t.deepEqual(tree?.listVisibleRuntimeNodes(collapsed).map((node) => node.title), ['Folder 1', 'Folder 2']);

	const folder1Expanded = tree?.setRuntimeNodeExpanded(collapsed ?? {}, 0, true);
	t.deepEqual(folder1Expanded, {
		expandedItemIndices: [0],
		selectedItemIndices: [],
		lastSelectedItemIndex: -1,
	});
	t.deepEqual(tree?.listVisibleRuntimeNodes(folder1Expanded).map((node) => node.title), ['Folder 1', 'Leaf 1', 'Leaf 2', 'Leaf 3', 'Leaf 4', 'Folder 2']);

	const selectedLeaf = tree?.selectRuntimeNode(collapsed ?? {}, 6);
	t.deepEqual(selectedLeaf, {
		expandedItemIndices: [5],
		selectedItemIndices: [6],
		lastSelectedItemIndex: 6,
	});
	t.is(tree?.getSelectedRuntimeNode(selectedLeaf)?.title, 'Leaf 1');
	t.deepEqual(tree?.listVisibleRuntimeNodes(selectedLeaf).map((node) => node.title), ['Folder 1', 'Folder 2', 'Leaf 1']);

	const toggled = tree?.toggleRuntimeNodeExpanded(defaultState ?? {}, 5);
	t.deepEqual(toggled, {
		expandedItemIndices: [0],
		selectedItemIndices: [],
		lastSelectedItemIndex: -1,
	});

	const expandedAll = tree?.expandAll(collapsed ?? {});
	t.deepEqual(expandedAll, {
		expandedItemIndices: [0, 5],
		selectedItemIndices: [],
		lastSelectedItemIndex: -1,
	});

	const unselected = tree?.unselectRuntimeNode(selectedLeaf ?? {}, 6);
	t.deepEqual(unselected, {
		expandedItemIndices: [5],
		selectedItemIndices: [],
		lastSelectedItemIndex: 6,
	});
});

test('TreeView package supports multi-select and range-select interaction semantics', async (t) => {
	const doc = await getDoc();
	const treeViewPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'TreeView')!;
	const main = treeViewPkg.listComponents().find((c) => c.getName() === 'Main')!;
	const sourceTree = main.listChildren().find((child) => child.getName?.() === 'tree') as GTree;
	const tree = sourceTree.clone();
	tree.setSelectionMode(ListSelectionMode.Multiple);

	const collapsed = tree.collapseAll();
	t.deepEqual(collapsed, {
		expandedItemIndices: [],
		selectedItemIndices: [],
		lastSelectedItemIndex: -1,
	});

	const firstPick = tree.setSelectionOnRuntimeNode(collapsed, 0);
	t.deepEqual(firstPick, {
		expandedItemIndices: [],
		selectedItemIndices: [0],
		lastSelectedItemIndex: 0,
	});

	const ctrlPick = tree.setSelectionOnRuntimeNode(firstPick, 5, { ctrlKey: true });
	t.deepEqual(ctrlPick, {
		expandedItemIndices: [],
		selectedItemIndices: [0, 5],
		lastSelectedItemIndex: 5,
	});

	const expandedFolders = tree.setRuntimeNodeExpanded(ctrlPick, 0, true);
	const fullyExpanded = tree.setRuntimeNodeExpanded(expandedFolders, 5, true);
	const shiftRange = tree.setSelectionOnRuntimeNode(fullyExpanded, 6, { shiftKey: true });
	t.deepEqual(shiftRange, {
		expandedItemIndices: [0, 5],
		selectedItemIndices: [0, 5, 6],
		lastSelectedItemIndex: 5,
	});

	const rangeState = tree.selectRuntimeRange(fullyExpanded, 3, 1, false);
	t.deepEqual(rangeState, {
		expandedItemIndices: [0, 5],
		selectedItemIndices: [1, 2, 3],
		lastSelectedItemIndex: 5,
	});

	const selectAll = tree.selectAllVisibleRuntimeNodes(fullyExpanded);
	t.deepEqual(selectAll.selectedItemIndices, [0, 1, 2, 3, 4, 5, 6]);
	t.is(selectAll.lastSelectedItemIndex, 6);

	const reversed = tree.selectReverseVisibleRuntimeNodes({
		expandedItemIndices: [0, 5],
		selectedItemIndices: [1, 4],
		lastSelectedItemIndex: 4,
	});
	t.deepEqual(reversed, {
		expandedItemIndices: [0, 5],
		selectedItemIndices: [0, 2, 3, 5, 6],
		lastSelectedItemIndex: 6,
	});

	const multiSingleClickTree = sourceTree.clone();
	multiSingleClickTree.setSelectionMode(ListSelectionMode.MultipleSingleClick);
	const toggleOn = multiSingleClickTree.setSelectionOnRuntimeNode(multiSingleClickTree.collapseAll(), 0);
	t.deepEqual(toggleOn, {
		expandedItemIndices: [],
		selectedItemIndices: [0],
		lastSelectedItemIndex: 0,
	});
	const toggleOff = multiSingleClickTree.setSelectionOnRuntimeNode(toggleOn, 0);
	t.deepEqual(toggleOff, {
		expandedItemIndices: [],
		selectedItemIndices: [],
		lastSelectedItemIndex: 0,
	});
});

test('TreeView package supports keyboard-style runtime tree navigation', async (t) => {
	const doc = await getDoc();
	const treeViewPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'TreeView')!;
	const main = treeViewPkg.listComponents().find((c) => c.getName() === 'Main')!;
	const sourceTree = main.listChildren().find((child) => child.getName?.() === 'tree') as GTree;
	const tree = sourceTree.clone();

	const collapsed = tree.collapseAll();
	const selectedFolder1 = tree.selectRuntimeNode(collapsed, 0);
	t.deepEqual(selectedFolder1, {
		expandedItemIndices: [],
		selectedItemIndices: [0],
		lastSelectedItemIndex: 0,
	});

	const moveDown = tree.navigateRuntimeSelection(selectedFolder1, 'down');
	t.deepEqual(moveDown, {
		expandedItemIndices: [],
		selectedItemIndices: [5],
		lastSelectedItemIndex: 5,
	});

	const moveUp = tree.navigateRuntimeSelection(moveDown, 'up');
	t.deepEqual(moveUp, {
		expandedItemIndices: [],
		selectedItemIndices: [0],
		lastSelectedItemIndex: 0,
	});

	const expandFolder1 = tree.navigateRuntimeSelection(selectedFolder1, 'right');
	t.deepEqual(expandFolder1, {
		expandedItemIndices: [0],
		selectedItemIndices: [0],
		lastSelectedItemIndex: 0,
	});
	t.deepEqual(tree.listVisibleRuntimeNodes(expandFolder1).map((node) => node.title), ['Folder 1', 'Leaf 1', 'Leaf 2', 'Leaf 3', 'Leaf 4', 'Folder 2']);

	const enterFirstChild = tree.navigateRuntimeSelection(expandFolder1, 'right');
	t.deepEqual(enterFirstChild, {
		expandedItemIndices: [0],
		selectedItemIndices: [1],
		lastSelectedItemIndex: 1,
	});
	t.is(tree.getSelectedRuntimeNode(enterFirstChild)?.title, 'Leaf 1');

	const backToParent = tree.navigateRuntimeSelection(enterFirstChild, 'left');
	t.deepEqual(backToParent, {
		expandedItemIndices: [0],
		selectedItemIndices: [0],
		lastSelectedItemIndex: 0,
	});

	const collapseFolder1 = tree.navigateRuntimeSelection(backToParent, 'left');
	t.deepEqual(collapseFolder1, {
		expandedItemIndices: [],
		selectedItemIndices: [0],
		lastSelectedItemIndex: 0,
	});
	t.deepEqual(tree.listVisibleRuntimeNodes(collapseFolder1).map((node) => node.title), ['Folder 1', 'Folder 2']);

	const leafNoop = tree.navigateRuntimeSelection(tree.selectRuntimeNode(expandFolder1, 1), 'right');
	t.deepEqual(leafNoop, {
		expandedItemIndices: [0],
		selectedItemIndices: [1],
		lastSelectedItemIndex: 1,
	});
});
