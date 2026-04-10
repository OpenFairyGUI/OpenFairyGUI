import test from 'ava';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type GTree, ListSelectionMode, NodeIO, PropertyType } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_PATH = path.resolve(
	__dirname,
	'../../../referer/UIProject/FairyGUI-Unity-Examples/FairyGUI-Unity-Examples.fairy',
);
const EDITOR_PROJECT_PATH = path.resolve(
	__dirname,
	'../../../referer/FairyGUI-Editor/ui/FairyGUI-Editor.fairy',
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

let _editorDoc: Awaited<ReturnType<NodeIO['readProject']>>;
async function getEditorDoc() {
	if (!_editorDoc) {
		const io = new NodeIO();
		_editorDoc = await io.readProject(EDITOR_PROJECT_PATH);
	}
	return _editorDoc;
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

test('Bag package preserves list colGap and selectionController from source XML', async (t) => {
	const doc = await getDoc();
	const bagPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'Bag')!;
	const bagWin = bagPkg.listComponents().find((c) => c.getName() === 'BagWin')!;
	const byId = new Map(bagWin.listChildren().map((child) => [child.getId(), child as any]));

	const pagedList = byId.get('n8');
	t.truthy(pagedList, 'paged list exists');
	t.is(pagedList?.getColumnGap?.(), 5, 'list keeps colGap from XML');
	t.is(pagedList?.getPageController?.(), 'page', 'list keeps pageController from XML');

	const pageDots = byId.get('n25_osdo');
	t.truthy(pageDots, 'page dot list exists');
	t.is(pageDots?.getColumnGap?.(), 40, 'row list keeps colGap from XML');
	t.is(pageDots?.getSelectionController?.(), 'page', 'row list keeps selectionController from XML');
	t.is(pageDots?.getSelectionMode?.(), ListSelectionMode.Single, 'selection mode remains default when XML omits it');
});

test('display objects preserve fileName/pkg/filter metadata from source XML', async (t) => {
	const doc = await getDoc();
	const filterPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'Filter')!;
	const filterMain = filterPkg.listComponents().find((c) => c.getName() === 'Main')!;
	const filterById = new Map(filterMain.listChildren().map((child) => [child.getId(), child as any]));

	const filteredImage = filterById.get('n0');
	t.truthy(filteredImage, 'Filter/Main image exists');
	t.is(filteredImage?.getFileName?.(), 'pic.png', 'image keeps fileName attr');
	t.is(filteredImage?.getFilter?.(), 'color', 'image keeps filter attr');
	t.is(filteredImage?.getFilterData?.(), '0.00,0.00,0.00,1.00', 'image keeps filterData attr');

	const filteredMovieClip = filterById.get('n13');
	t.truthy(filteredMovieClip, 'Filter/Main movieclip exists');
	t.is(filteredMovieClip?.getFileName?.(), 'pet.jta', 'movieclip keeps fileName attr');
	t.is(filteredMovieClip?.getFilter?.(), 'color', 'movieclip keeps filter attr');

	const filteredButton = filterById.get('n14');
	t.truthy(filteredButton, 'Filter/Main button instance exists');
	t.is(filteredButton?.getFileName?.(), 'Button5.xml', 'component instance keeps fileName attr');
	t.is(filteredButton?.getFilterData?.(), '0.00,0.00,0.00,1.00', 'component instance keeps filterData attr');

	const editorDoc = await getEditorDoc();
	const builderPkg = editorDoc.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;
	const alignToolbar = builderPkg.listComponents().find((c) => c.getName() === 'AlignToolbar')!;
	const alignById = new Map(alignToolbar.listChildren().map((child) => [child.getId(), child as any]));

	const separator = alignById.get('n98_wc5q');
	t.truthy(separator, 'AlignToolbar separator exists');
	t.is(separator?.getFileName?.(), 'HzSeperator.png', 'image keeps editor fileName attr');
	t.is(separator?.getPackageId?.(), 'nk9ejx23', 'image keeps editor pkg attr');

	const flatIconButton = alignById.get('n33');
	t.truthy(flatIconButton, 'AlignToolbar FlatIconButton exists');
	t.is(flatIconButton?.getFileName?.(), 'Button/FlatIconButton.xml', 'component keeps editor fileName attr');
	t.is(flatIconButton?.getPackageId?.(), 'nk9ejx23', 'component keeps editor pkg attr');
});

test('FairyGUI-Editor samples preserve lineItemCount/autoItemSize and group visibility attrs', async (t) => {
	const doc = await getEditorDoc();
	const builderPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;

	const viewGrid = builderPkg.listComponents().find((c) => c.getName() === 'ViewGrid')!;
	const viewGridById = new Map(viewGrid.listChildren().map((child) => [child.getId(), child as any]));
	const flowTabs = viewGridById.get('n9_gzi6');
	t.truthy(flowTabs, 'ViewGrid flow list exists');
	t.is(flowTabs?.getColumnGap?.(), -1, 'ViewGrid flow list keeps colGap');
	t.is(flowTabs?.getLineCount?.(), 9999, 'ViewGrid flow list keeps lineItemCount');
	t.true(flowTabs?.getAutoResizeItem?.(), 'ViewGrid flow list keeps autoItemSize=true');

	const chooseFont = builderPkg.listComponents().find((c) => c.getName() === 'ChooseFontDialog')!;
	const chooseFontById = new Map(chooseFont.listChildren().map((child) => [child.getId(), child as any]));
	const tabGroup = chooseFontById.get('n49_g5bp');
	t.truthy(tabGroup, 'ChooseFontDialog group exists');
	t.true(tabGroup?.getAdvanced?.(), 'group keeps advanced attr');
	t.is(tabGroup?.getColumnGap?.(), 1, 'group keeps colGap attr');
	t.true(tabGroup?.getExcludeInvisibles?.(), 'group keeps excludeInvisibles attr');
});

test('FairyGUI-Editor samples preserve component root scroll/restrict attrs and loader/richtext display attrs', async (t) => {
	const doc = await getEditorDoc();
	const root = doc.getRoot();
	const builderPkg = root.listPackages().find((p) => p.getName() === 'Builder')!;
	const basicPkg = root.listPackages().find((p) => p.getName() === 'Basic')!;

	const inspectorView = builderPkg.listComponents().find((c) => c.getName() === 'InspectorView')!;
	t.is(inspectorView.getMinWidth?.(), 286, 'component root keeps restrictSize minWidth');

	const docContainer = builderPkg.listComponents().find((c) => c.getName() === 'DocContainer')!;
	t.is(docContainer.getOverflow?.(), 2, 'component root keeps overflow=scroll');
	t.is(docContainer.getScrollType?.(), 2, 'component root keeps scroll=both');

	const buttonWithIcon = basicPkg.listComponents().find((c) => c.getName() === 'ButtonWithIcon')!;
	const iconLoader = buttonWithIcon.listChildren().find((child) => child.getName() === 'icon') as any;
	t.truthy(iconLoader, 'ButtonWithIcon icon loader exists');
	t.is(iconLoader?.getUrl?.(), 'ui://2pshu6oix5ao5k', 'loader keeps url attr');
	t.is(iconLoader?.getFill?.(), 1, 'loader keeps fill=scale');
	t.true(iconLoader?.getShrinkOnly?.(), 'loader keeps shrinkOnly attr');

	const recentItem = builderPkg.listComponents().find((c) => c.getName() === 'RecentItem')!;
	const title = recentItem.listChildren().find((child) => child.getName() === 'title') as any;
	t.truthy(title, 'RecentItem richtext exists');
	t.true(title?.getUbbEnabled?.(), 'richtext keeps ubb attr');
	t.true(title?.getSingleLine?.(), 'richtext keeps singleLine attr');
	t.is(title?.getText?.(), '[url=xx]FairyGUI-Unity-Demo[/url]', 'richtext keeps text attr');
});

test('FairyGUI-Editor samples preserve component instance attrs and extension overlays', async (t) => {
	const doc = await getEditorDoc();
	const builderPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;
	const basicPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'Basic')!;

	const colorPickerPopup = basicPkg.listComponents().find((c) => c.getName() === 'ColorPickerPopup')!;
	const popupById = new Map(colorPickerPopup.listChildren().map((child) => [child.getId(), child as any]));
	const currentColorValue = popupById.get('n3');
	t.truthy(currentColorValue, 'ColorPickerPopup currentColorValue exists');
	t.is(currentColorValue?.getSrc?.(), 'gcza1s', 'component instance keeps src attr');
	t.is(currentColorValue?.getControllerOverrides?.(), 'noBorder,0,showClear,0', 'component instance keeps controller override attr');

	const alphaInput = popupById.get('n7');
	t.truthy(alphaInput, 'ColorPickerPopup alphaInput exists');
	t.is(alphaInput?.getInstanceExtType?.(), 'Label', 'component instance keeps Label overlay type');
	t.is(alphaInput?.getInstanceTitle?.(), '100', 'Label overlay title survives');

	const choosePackageDialog = builderPkg.listComponents().find((c) => c.getName() === 'ChoosePackageDialog')!;
	const choosePackageById = new Map(choosePackageDialog.listChildren().map((child) => [child.getId(), child as any]));
	const findInput = choosePackageById.get('n50_ajkn');
	t.truthy(findInput, 'ChoosePackageDialog find input exists');
	t.is(findInput?.getInstanceExtType?.(), 'Label', 'find input keeps Label overlay type');
	t.is(findInput?.getInstancePromptText?.(), '[color=#959595]查找...[/color]', 'Label overlay prompt survives');

	const moreButton = popupById.get('n15_mkkf');
	t.truthy(moreButton, 'ColorPickerPopup more button exists');
	t.is(moreButton?.getInstanceExtType?.(), 'Button', 'component instance keeps Button overlay type');
	t.is(moreButton?.getInstanceIcon?.(), 'ui://nk9ejx23t64x7iuex', 'Button overlay icon survives');

	const colorPickerDialog = basicPkg.listComponents().find((c) => c.getName() === 'ColorPickerDialog')!;
	const dialogById = new Map(colorPickerDialog.listChildren().map((child) => [child.getId(), child as any]));
	const okButton = dialogById.get('n23_ss7s');
	t.truthy(okButton, 'ColorPickerDialog ok button exists');
	t.is(okButton?.getInstanceExtType?.(), 'Button', 'button instance keeps Button overlay type');
	t.is(okButton?.getInstanceTitle?.(), '确定', 'Button overlay title survives');

	const hueSlider = dialogById.get('n42_mkkf');
	t.truthy(hueSlider, 'ColorPickerDialog hueSlider exists');
	t.is(hueSlider?.getInstanceExtType?.(), 'Slider', 'slider instance keeps Slider overlay type');
	t.is(hueSlider?.getInstanceValue?.(), 47, 'Slider overlay value survives');
	t.is(hueSlider?.getInstanceMax?.(), 360, 'Slider overlay max survives');

	const controllerEditDialog = builderPkg.listComponents().find((c) => c.getName() === 'ControllerEditDialog')!;
	t.truthy(controllerEditDialog, 'ControllerEditDialog exists');
	const controllerEditById = new Map(controllerEditDialog.listChildren().map((child) => [child.getId(), child as any]));
	const homePageType = controllerEditById.get('n116_omf5');
	t.truthy(homePageType, 'ControllerEditDialog homePageType exists');
	t.is(homePageType?.getInstanceExtType?.(), 'ComboBox', 'ComboBox overlay keeps extension type');
	t.is(homePageType?.getInstanceSelectionController?.(), 'homepage', 'ComboBox overlay keeps selectionController attr');
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
