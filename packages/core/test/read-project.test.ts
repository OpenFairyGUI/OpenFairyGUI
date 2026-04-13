import test from 'ava';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import { Document, type GTree, GearType, ListSelectionMode, NodeIO, PropertyType } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_PATH = getFixtureProjectPath('FairyGUI-Unity-Examples');
const EDITOR_PROJECT_PATH = path.resolve(
	__dirname,
	'../../../referer/FairyGUI-Editor/ui/FairyGUI-Editor.fairy',
);
const LAYABOX_PROJECT_PATH = path.resolve(
	__dirname,
	'../../../referer/Runtimes/Layabox/demo/UIProject/FairyGUI-layabox-demo.fairy',
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

let _layaboxDoc: Awaited<ReturnType<NodeIO['readProject']>>;
async function getLayaboxDoc() {
	if (!_layaboxDoc) {
		const io = new NodeIO();
		_layaboxDoc = await io.readProject(LAYABOX_PROJECT_PATH);
	}
	return _layaboxDoc;
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

test('Basics samples preserve gear tween attrs and text demoText', async (t) => {
	const doc = await getDoc();
	const basics = doc.getRoot().listPackages().find((p) => p.getName() === 'Basics')!;

	const button9 = basics.listComponents().find((c) => c.getName() === 'Button9')!;
	const button9Image = button9.listChildren().find((child) => child.getId() === 'n1') as any;
	t.truthy(button9Image, 'Button9 geared image exists');
	const gearLook = button9Image?.listGears?.().find((gear: any) => gear.getGearType?.() === GearType.Look);
	t.truthy(gearLook, 'Button9 gearLook exists');
	t.true(gearLook?.getTween?.(), 'gear tween survives');
	t.is(gearLook?.getEaseType?.(), 5, 'gear ease survives');
	t.is(gearLook?.getTweenDuration?.(), 0.5, 'gear duration survives');

	const button10 = basics.listComponents().find((c) => c.getName() === 'Button10')!;
	const title = button10.listChildren().find((child) => child.getName() === 'title') as any;
	t.truthy(title, 'Button10 title text exists');
	t.is(title?.getDemoText?.(), '', 'text demoText survives');

	const relationDemo = basics.listComponents().find((c) => c.getName() === 'Demo_Relation')!;
	t.is(relationDemo.getDesignImageLayer?.(), 1, 'component root designImageLayer survives');

	const builder = await getEditorDoc();
	const builderPkg = builder.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;
	const referenceView = builderPkg.listComponents().find((c) => c.getName() === 'ReferenceView')!;
	const resultText = referenceView.listChildren().find((child) => child.getName() === 'result') as any;
	t.truthy(resultText, 'ReferenceView result text exists');
	t.true(resultText?.getTemplateVarsEnabled?.(), 'text vars survives');
});

test('TextMeshPro samples preserve TMP text attrs', async (t) => {
	const doc = await getDoc();
	const textMeshPro = doc.getRoot().listPackages().find((p) => p.getName() === 'TextMeshPro')!;
	const main = textMeshPro.listComponents().find((c) => c.getName() === 'Main')!;
	const byId = new Map(main.listChildren().map((child) => [child.getId(), child as any]));

	const rich = byId.get('n0_v040');
	t.truthy(rich, 'TMP richtext exists');
	t.is(rich?.getUnderlaySoftness?.(), 0.056, 'richtext underlaySoftness survives');

	const title = byId.get('n1_v040');
	t.truthy(title, 'TMP title text exists');
	t.is(title?.getFaceDilate?.(), 0.324, 'text faceDilate survives');

	const label = byId.get('n4_mpsw');
	t.truthy(label, 'TMP label text exists');
	t.is(label?.getFaceDilate?.(), 1, 'text faceDilate survives on secondary sample');
	t.is(label?.getUnderlaySoftness?.(), 1, 'text underlaySoftness survives');
});

test('package.xml resources preserve image qualityOption and TMP font import attrs', async (t) => {
	const editorDoc = await getEditorDoc();
	const builderPkg = editorDoc.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;
	const editorImage = builderPkg.listResources().find((res) => res.getId?.() === 'au3n10') as any;
	t.truthy(editorImage, 'Builder image resource exists');
	t.is(editorImage.getQualityOption?.(), 'source', 'image resource keeps qualityOption');

	const runtimeDoc = await getDoc();
	const textMeshPro = runtimeDoc.getRoot().listPackages().find((p) => p.getName() === 'TextMeshPro')!;
	const tmpFont = textMeshPro.listResources().find((res) => res.propertyType === PropertyType.FONT_RESOURCE) as any;
	t.truthy(tmpFont, 'TMP font resource exists');
	t.is(tmpFont.getRenderMode?.(), 'sdfaa', 'font resource keeps renderMode');
	t.is(tmpFont.getSamplePointSize?.(), 60, 'font resource keeps samplePointSize');
});

test('package.xml resources preserve image textureSetMode', async (t) => {
	const editorDoc = await getEditorDoc();
	const builderPkg = editorDoc.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;
	const atlasImage = builderPkg.listResources().find((res) => res.getId?.() === 'kpzgiua3') as any;
	t.truthy(atlasImage, 'Builder atlas-configured image exists');
	t.is(atlasImage.getTextureSetMode?.(), 'alone_npot', 'image resource keeps textureSetMode');
});

test('Loader package preserves spine and dragonbones resource attrs', async (t) => {
	const doc = await getDoc();
	const loaderPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'Loader')!;
	t.truthy(loaderPkg, 'Loader package exists');

	const dragon = loaderPkg.listResources().find((res) => res.getId?.() === 'biss6') as any;
	t.truthy(dragon, 'dragonbones resource exists');
	t.is(dragon.propertyType, PropertyType.DRAGON_BONES_RESOURCE);
	t.is(dragon.getFile?.(), 'dragon_ske.json');
	t.deepEqual(dragon.getRequireIds?.(), ['biss7', 'biss8']);
	t.deepEqual(dragon.getAtlasNames?.(), []);
	t.is(dragon.getAnchorX?.(), 0);
	t.is(dragon.getAnchorY?.(), 0);

	const misc = loaderPkg.listResources().find((res) => res.getId?.() === 'nbcg7') as any;
	t.truthy(misc, 'misc atlas dependency exists');
	t.is(misc.propertyType, PropertyType.MISC_RESOURCE);
	t.is(misc.getFile?.(), 'alien-pma.atlas');

	const spine = loaderPkg.listResources().find((res) => res.getId?.() === 'nbcge') as any;
	t.truthy(spine, 'spine resource exists');
	t.is(spine.propertyType, PropertyType.SPINE_RESOURCE);
	t.is(spine.getFile?.(), 'alien-pro.skel');
	t.is(spine.getWidth?.(), 368);
	t.is(spine.getHeight?.(), 384);
	t.deepEqual(spine.getRequireIds?.(), ['nbcg7', 'nbcg8']);
	t.deepEqual(spine.getAtlasNames?.(), ['alien-pma']);
	t.is(spine.getAnchorX?.(), 176);
	t.is(spine.getAnchorY?.(), 380);
});

test('Branch package preserves branch resources and root branch list', async (t) => {
	const doc = await getDoc();
	const root = doc.getRoot();
	t.true(root.listBranches().includes('dev'), 'root keeps project branch list');

	const branchPkg = root.listPackages().find((p) => p.getName() === 'Branch')!;
	t.truthy(branchPkg, 'Branch package exists');

	const mainImage = branchPkg.listResources().find((res) => res.getId?.() === 'kn7w1') as any;
	t.truthy(mainImage, 'main branch image exists');
	t.is(mainImage.propertyType, PropertyType.IMAGE_RESOURCE);
	t.is(mainImage.getBranch?.(), '');

	const devImage = branchPkg.listResources().find((res) => res.getId?.() === 'kn7w2') as any;
	t.truthy(devImage, 'dev branch image exists');
	t.is(devImage.propertyType, PropertyType.IMAGE_RESOURCE);
	t.is(devImage.getBranch?.(), 'dev');

	const devComponent = branchPkg.listResources().find((res) => res.getId?.() === 'kn7w3') as any;
	t.truthy(devComponent, 'dev branch component exists');
	t.is(devComponent.propertyType, PropertyType.COMPONENT);
	t.is(devComponent.getBranch?.(), 'dev');
	t.is(devComponent.getWidth?.(), 820);
	t.is(devComponent.getHeight?.(), 620);
	const devLoader = devComponent.listChildren?.().find((child: any) => child.getId?.() === 'n0_kn7w');
	t.truthy(devLoader, 'dev branch component child exists');
	t.is(devLoader?.getUrl?.(), 'ui://a9lkf94skn7w2', 'dev branch component keeps branch-local resource reference');
});

test('package.xml publish preserves packageCount', async (t) => {
	const layaboxDoc = await getLayaboxDoc();
	const joystickPkg = layaboxDoc.getRoot().listPackages().find((p) => p.getName() === 'Joystick');
	t.truthy(joystickPkg, 'Joystick package exists');
	t.is(joystickPkg?.getPublishName(), 'Joystick', 'publish name survives');
	t.is(joystickPkg?.getPublishPackageCount?.(), 1, 'publish packageCount survives');
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
	t.true(Math.abs((byId.get('n8')?.getAlpha?.() ?? 0) - 0.62) < 1e-6, 'n8 keeps alpha');
	t.is(byId.get('n9')?.getRotation?.(), -39, 'n9 keeps rotation');
	t.true(byId.get('n17')?.getGrayed?.(), 'n17 keeps grayed');
	t.true(byId.get('n18')?.getGrayed?.(), 'n18 keeps grayed');
});

test('Demo_Graph preserves pivot anchor on image-backed graph children', async (t) => {
	const doc = await getDoc();
	const basics = doc.getRoot().listPackages().find((p) => p.getName() === 'Basics')!;
	const comp = basics.listComponents().find((c) => c.getName() === 'Demo_Graph')!;
	const byId = new Map(comp.listChildren().map((child) => [child.getId(), child as any]));

	t.true(byId.get('n14_ty2k')?.getPivotAsAnchor?.(), 'n14_ty2k keeps pivot anchor');
	t.true(byId.get('n15_ty2k')?.getPivotAsAnchor?.(), 'n15_ty2k keeps pivot anchor');
	t.is(byId.get('n5')?.getSkewX?.(), 60, 'n5 keeps graph skewX');
	t.is(byId.get('n5')?.getSkewY?.(), 30, 'n5 keeps graph skewY');
});

test('display objects preserve tag-scoped pivot and scale attrs from source XML', async (t) => {
	const doc = await getDoc();
	const basics = doc.getRoot().listPackages().find((p) => p.getName() === 'Basics')!;

	const demoLoader = basics.listComponents().find((c) => c.getName() === 'Demo_Loader')!;
	const loaderById = new Map(demoLoader.listChildren().map((child) => [child.getId(), child as any]));
	t.is(loaderById.get('n3')?.getScaleX?.(), 2, 'loader keeps scaleX from XML');
	t.is(loaderById.get('n3')?.getScaleY?.(), 2, 'loader keeps scaleY from XML');

	const windowB = basics.listComponents().find((c) => c.getName() === 'WindowB')!;
	const windowBById = new Map(windowB.listChildren().map((child) => [child.getId(), child as any]));
	t.is(windowBById.get('n12')?.getScaleX?.(), 0.7, 'component keeps scaleX from XML');
	t.is(windowBById.get('n12')?.getScaleY?.(), 1, 'component keeps scaleY from XML');

	const movieClipDemo = basics.listComponents().find((c) => c.getName() === 'Demo_MovieClip')!;
	const movieClipById = new Map(movieClipDemo.listChildren().map((child) => [child.getId(), child as any]));
	t.is(movieClipById.get('n15')?.getPivotX?.(), 0.5, 'movieclip keeps pivotX from XML');
	t.is(movieClipById.get('n15')?.getPivotY?.(), 0.5, 'movieclip keeps pivotY from XML');

	const editorDoc = await getEditorDoc();
	const basicPkg = editorDoc.getRoot().listPackages().find((p) => p.getName() === 'Basic')!;
	const hueSlider = basicPkg.listComponents().find((c) => c.getName() === 'HueSlider')!;
	const hueById = new Map(hueSlider.listChildren().map((child) => [child.getId(), child as any]));
	t.is(hueById.get('n43_mkkf')?.getPivotX?.(), 0, 'component keeps pivotX from editor XML');
	t.is(hueById.get('n43_mkkf')?.getPivotY?.(), 0.5, 'component keeps pivotY from editor XML');
	t.true(hueById.get('n43_mkkf')?.getPivotAsAnchor?.(), 'component keeps anchor=true from editor XML');
});

test('display objects preserve tag-scoped group attrs from source XML', async (t) => {
	const editorDoc = await getEditorDoc();
	const basicPkg = editorDoc.getRoot().listPackages().find((p) => p.getName() === 'Basic')!;
	const colorPicker = basicPkg.listComponents().find((c) => c.getName() === 'ColorPickerDialog')!;
	const colorById = new Map(colorPicker.listChildren().map((child) => [child.getId(), child as any]));
	t.is(colorById.get('n18_ss7s')?.getGroup?.(), 'n20_ss7s', 'image keeps group attr');
	t.is(colorById.get('n48_qfvx')?.getGroup?.(), 'n20_ss7s', 'graph keeps group attr');
	t.is(colorById.get('n0_ss7s')?.getGroup?.(), 'n50_qfvx', 'text keeps group attr');
	t.is(colorById.get('n1_ss7s')?.getGroup?.(), 'n50_qfvx', 'component keeps group attr');

	const builderPkg = editorDoc.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;
	const libraryView = builderPkg.listComponents().find((c) => c.getName() === 'LibraryView')!;
	const libraryById = new Map(libraryView.listChildren().map((child) => [child.getId(), child as any]));
	t.is(libraryById.get('n3')?.getGroup?.(), 'n16_emg4', 'list keeps group attr');

	const customArrange = builderPkg.listComponents().find((c) => c.getName() === 'CustomArrangePanel')!;
	const arrangeById = new Map(customArrange.listChildren().map((child) => [child.getId(), child as any]));
	t.is(arrangeById.get('n46_ov4h')?.getGroup?.(), 'n48_ryaj', 'group keeps group attr');

	const runtimeDoc = await getDoc();
	const transitionPkg = runtimeDoc.getRoot().listPackages().find((p) => p.getName() === 'Transition')!;
	const powerUp = transitionPkg.listComponents().find((c) => c.getName() === 'PowerUp')!;
	const powerById = new Map(powerUp.listChildren().map((child) => [child.getId(), child as any]));
	t.is(powerById.get('n5')?.getGroup?.(), 'n6', 'movieclip keeps group attr');
});

test('display objects preserve tag-scoped xy attrs from source XML', async (t) => {
	const doc = await getDoc();
	const basics = doc.getRoot().listPackages().find((p) => p.getName() === 'Basics')!;

	const demoLoader = basics.listComponents().find((c) => c.getName() === 'Demo_Loader')!;
	const loaderById = new Map(demoLoader.listChildren().map((child) => [child.getId(), child as any]));
	t.is(loaderById.get('n3')?.getX?.(), 295, 'loader keeps x from XML');
	t.is(loaderById.get('n3')?.getY?.(), 66, 'loader keeps y from XML');

	const windowB = basics.listComponents().find((c) => c.getName() === 'WindowB')!;
	const windowBById = new Map(windowB.listChildren().map((child) => [child.getId(), child as any]));
	t.is(windowBById.get('n12')?.getX?.(), 185, 'component keeps x from XML');
	t.is(windowBById.get('n12')?.getY?.(), 139, 'component keeps y from XML');

	const movieClipDemo = basics.listComponents().find((c) => c.getName() === 'Demo_MovieClip')!;
	const movieClipById = new Map(movieClipDemo.listChildren().map((child) => [child.getId(), child as any]));
	t.is(movieClipById.get('n15')?.getX?.(), 298, 'movieclip keeps x from XML');
	t.is(movieClipById.get('n15')?.getY?.(), 227, 'movieclip keeps y from XML');

	const editorDoc = await getEditorDoc();
	const basicPkg = editorDoc.getRoot().listPackages().find((p) => p.getName() === 'Basic')!;
	const colorPicker = basicPkg.listComponents().find((c) => c.getName() === 'ColorPickerDialog')!;
	const colorById = new Map(colorPicker.listChildren().map((child) => [child.getId(), child as any]));
	t.is(colorById.get('n18_ss7s')?.getX?.(), 325, 'image keeps x from editor XML');
	t.is(colorById.get('n18_ss7s')?.getY?.(), 35, 'image keeps y from editor XML');
	t.is(colorById.get('n0_ss7s')?.getX?.(), 322, 'text keeps x from editor XML');
	t.is(colorById.get('n0_ss7s')?.getY?.(), 109, 'text keeps y from editor XML');

	const builderPkg = editorDoc.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;
	const libraryView = builderPkg.listComponents().find((c) => c.getName() === 'LibraryView')!;
	const libraryById = new Map(libraryView.listChildren().map((child) => [child.getId(), child as any]));
	t.is(libraryById.get('n3')?.getX?.(), 0, 'list keeps x from editor XML');
	t.is(libraryById.get('n3')?.getY?.(), 27, 'list keeps y from editor XML');
});

test('display objects preserve tag-scoped size attrs from source XML', async (t) => {
	const doc = await getDoc();
	const basics = doc.getRoot().listPackages().find((p) => p.getName() === 'Basics')!;

	const demoLoader = basics.listComponents().find((c) => c.getName() === 'Demo_Loader')!;
	const loaderById = new Map(demoLoader.listChildren().map((child) => [child.getId(), child as any]));
	t.is(loaderById.get('n3')?.getWidth?.(), 133, 'loader keeps width from XML');
	t.is(loaderById.get('n3')?.getHeight?.(), 131, 'loader keeps height from XML');

	const demoButton = basics.listComponents().find((c) => c.getName() === 'Demo_Button')!;
	const buttonById = new Map(demoButton.listChildren().map((child) => [child.getId(), child as any]));
	t.is(buttonById.get('n4')?.getWidth?.(), 88, 'component keeps width from XML');
	t.is(buttonById.get('n4')?.getHeight?.(), 19, 'component keeps height from XML');

	const movieClipDemo = basics.listComponents().find((c) => c.getName() === 'Demo_MovieClip')!;
	const movieClipById = new Map(movieClipDemo.listChildren().map((child) => [child.getId(), child as any]));
	t.is(movieClipById.get('n15')?.getWidth?.(), 155, 'movieclip keeps width from XML');
	t.is(movieClipById.get('n15')?.getHeight?.(), 144, 'movieclip keeps height from XML');

	const editorDoc = await getEditorDoc();
	const basicPkg = editorDoc.getRoot().listPackages().find((p) => p.getName() === 'Basic')!;
	const colorPicker = basicPkg.listComponents().find((c) => c.getName() === 'ColorPickerDialog')!;
	const colorById = new Map(colorPicker.listChildren().map((child) => [child.getId(), child as any]));
	t.is(colorById.get('n18_ss7s')?.getWidth?.(), 57, 'image keeps width from editor XML');
	t.is(colorById.get('n18_ss7s')?.getHeight?.(), 59, 'image keeps height from editor XML');
	t.is(colorById.get('n0_ss7s')?.getWidth?.(), 17, 'text keeps width from editor XML');
	t.is(colorById.get('n0_ss7s')?.getHeight?.(), 16, 'text keeps height from editor XML');
	t.is(colorById.get('n48_qfvx')?.getWidth?.(), 58, 'graph keeps width from editor XML');
	t.is(colorById.get('n48_qfvx')?.getHeight?.(), 30, 'graph keeps height from editor XML');

	const builderPkg = editorDoc.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;
	const libraryView = builderPkg.listComponents().find((c) => c.getName() === 'LibraryView')!;
	const libraryById = new Map(libraryView.listChildren().map((child) => [child.getId(), child as any]));
	t.is(libraryById.get('n3')?.getWidth?.(), 137, 'list keeps width from editor XML');
	t.is(libraryById.get('n3')?.getHeight?.(), 553, 'list keeps height from editor XML');

	const customArrange = builderPkg.listComponents().find((c) => c.getName() === 'CustomArrangePanel')!;
	const arrangeById = new Map(customArrange.listChildren().map((child) => [child.getId(), child as any]));
	t.is(arrangeById.get('n46_ov4h')?.getWidth?.(), 146, 'group keeps width from editor XML');
	t.is(arrangeById.get('n46_ov4h')?.getHeight?.(), 20, 'group keeps height from editor XML');
});

test('display objects preserve tag-scoped locked and restrictSize attrs from source XML', async (t) => {
	const editorDoc = await getEditorDoc();
	const basicPkg = editorDoc.getRoot().listPackages().find((p) => p.getName() === 'Basic')!;
	const colorPicker = basicPkg.listComponents().find((c) => c.getName() === 'ColorPickerDialog')!;
	const colorById = new Map(colorPicker.listChildren().map((child) => [child.getId(), child as any]));
	t.true(colorById.get('n37_mkkf')?.getLocked?.(), 'component keeps locked attr');

	const builderPkg = editorDoc.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;
	const relationPopup = builderPkg.listComponents().find((c) => c.getName() === 'RelationTypePopup')!;
	const relationById = new Map(relationPopup.listChildren().map((child) => [child.getId(), child as any]));
	t.true(relationById.get('n3')?.getLocked?.(), 'image keeps locked attr');

	const customArrange = builderPkg.listComponents().find((c) => c.getName() === 'CustomArrangePanel')!;
	const arrangeById = new Map(customArrange.listChildren().map((child) => [child.getId(), child as any]));
	t.true(arrangeById.get('n48_ryaj')?.getLocked?.() === false || arrangeById.get('n48_ryaj')?.getLocked?.() === undefined, 'unlocked group remains default false');

	const langItem = builderPkg.listComponents().find((c) => c.getName() === 'LangSetting_item')!;
	const langById = new Map(langItem.listChildren().map((child) => [child.getId(), child as any]));
	t.is(langById.get('n16')?.getMinWidth?.(), 0, 'graph keeps restrictSize minWidth');
	t.is(langById.get('n16')?.getMaxWidth?.(), 1, 'graph keeps restrictSize maxWidth');
	t.is(langById.get('n16')?.getMinHeight?.(), 0, 'graph keeps restrictSize minHeight');
	t.is(langById.get('n16')?.getMaxHeight?.(), 0, 'graph keeps restrictSize maxHeight');

	const inspectorPanel = builderPkg.listComponents().find((c) => c.getName() === 'BasicPropsInTransPanel')!;
	const inspectorById = new Map(inspectorPanel.listChildren().map((child) => [child.getId(), child as any]));
	t.is(inspectorById.get('n22')?.getMinWidth?.(), 0, 'text keeps restrictSize minWidth');
	t.is(inspectorById.get('n22')?.getMaxWidth?.(), 60, 'text keeps restrictSize maxWidth');

	const libraryView = builderPkg.listComponents().find((c) => c.getName() === 'LibraryView')!;
	const libraryById = new Map(libraryView.listChildren().map((child) => [child.getId(), child as any]));
	t.is(libraryById.get('n11_qilr')?.getMaxWidth?.(), 200, 'component keeps restrictSize maxWidth');

	const doc = await getDoc();
	const emojiPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'Emoji')!;
	const chatLeft = emojiPkg.listComponents().find((c) => c.getName() === 'chatLeft')!;
	const chatById = new Map(chatLeft.listChildren().map((child) => [child.getId(), child as any]));
	t.is(chatById.get('n3')?.getMaxWidth?.(), 663, 'richtext keeps restrictSize maxWidth');

	const turnPagePkg = doc.getRoot().listPackages().find((p) => p.getName() === 'TurnPage')!;
	const book = turnPagePkg.listComponents().find((c) => c.getName() === 'Book')!;
	const bookById = new Map(book.listChildren().map((child) => [child.getId(), child as any]));
	t.true(bookById.get('n10_jva6')?.getLocked?.(), 'group keeps locked attr');
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

test('Builder package preserves list static item controllers from source XML', async (t) => {
	const doc = await getEditorDoc();
	const builderPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;
	const consoleView = builderPkg.listComponents().find((c) => c.getName() === 'ConsoleView')!;
	const list = consoleView.listChildren().find((child) => child.getName?.() === 'list') as any;
	t.truthy(list, 'ConsoleView/list exists');
	t.deepEqual(
		list.getListItems?.().map((item: any) => item.controllers ?? null),
		['bg,0,type,0', 'bg,1,type,1', 'bg,0,type,2'],
		'list static items preserve controllers attr',
	);
});

test('Builder package preserves ComboBox static item collection from source XML', async (t) => {
	const doc = await getEditorDoc();
	const builderPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;
	const dialog = builderPkg.listComponents().find((c) => c.getName() === 'CreatePluginDialog')!;
	const combo = dialog.listChildren().find((child) => child.getName?.() === 'template') as any;
	t.truthy(combo, 'CreatePluginDialog/template exists');
	t.deepEqual(
		combo.getInstanceComboItems?.(),
		[
			{ title: '空白(Lua)', value: 'empty', icon: null },
			{ title: '空白(JavaScript)', value: 'empty_js', icon: null },
			{ title: '空白(TypeScript)', value: 'empty_ts', icon: null },
			{ title: '发布代码(Lua)', value: 'code', icon: null },
			{ title: '发布代码(TypeScript)', value: 'code_ts', icon: null },
		],
		'ComboBox overlay items preserve canonical title/value attrs',
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
	t.false(pageDots?.getTouchable?.(), 'row list keeps touchable=false from XML');
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
	t.true(separator?.getAspect?.(), 'image keeps editor aspect attr');

	const flatIconButton = alignById.get('n33');
	t.truthy(flatIconButton, 'AlignToolbar FlatIconButton exists');
	t.is(flatIconButton?.getFileName?.(), 'Button/FlatIconButton.xml', 'component keeps editor fileName attr');
	t.is(flatIconButton?.getPackageId?.(), 'nk9ejx23', 'component keeps editor pkg attr');
	t.is(flatIconButton?.getTooltips?.(), '左对齐', 'component keeps editor tooltips attr');

	const basicsPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'Basics')!;
	const windowFrame = basicsPkg.listComponents().find((c) => c.getName() === 'WindowFrame')!;
	const windowFrameById = new Map(windowFrame.listChildren().map((child) => [child.getId(), child as any]));
	const closeButton = windowFrameById.get('n1');
	t.truthy(closeButton, 'WindowFrame closeButton exists');
	t.true(closeButton?.getAspect?.(), 'component instance keeps aspect attr');
});

test('FairyGUI-Editor samples preserve text customData attrs', async (t) => {
	const doc = await getEditorDoc();
	const builderPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;
	const hierarchyItem = builderPkg.listComponents().find((c) => c.getName() === 'HierarchyView_item')!;
	const byId = new Map(hierarchyItem.listChildren().map((child) => [child.getId(), child as any]));

	const title = byId.get('n2');
	t.truthy(title, 'HierarchyView_item title exists');
	t.is(title?.getCustomData?.(), 'k', 'text keeps customData attr');
});

test('FairyGUI-Editor samples preserve component/group/loader state attrs', async (t) => {
	const editorDoc = await getEditorDoc();
	const builderPkg = editorDoc.getRoot().listPackages().find((p) => p.getName() === 'Builder')!;

	const toolbar = builderPkg.listComponents().find((c) => c.getName() === 'Toolbar')!;
	const toolbarById = new Map(toolbar.listChildren().map((child) => [child.getId(), child as any]));
	const reload = toolbarById.get('n133_s3qd');
	t.truthy(reload, 'Toolbar reload button exists');
	t.false(reload?.getTouchable?.(), 'component keeps touchable=false attr');
	t.true(reload?.getGrayed?.(), 'component keeps grayed attr');

	const textInputDialog = builderPkg.listComponents().find((c) => c.getName() === 'TextInputDialog')!;
	const textInputById = new Map(textInputDialog.listChildren().map((child) => [child.getId(), child as any]));
	const inputPanel = textInputById.get('n80_hd18');
	t.truthy(inputPanel, 'TextInputDialog inputPanel group exists');
	t.false(inputPanel?.getVisible?.(), 'group keeps visible=false attr');

	const doc = await getDoc();
	const basicsPkg = doc.getRoot().listPackages().find((p) => p.getName() === 'Basics')!;
	const button52 = basicsPkg.listComponents().find((c) => c.getName() === 'Button52')!;
	const iconLoader = button52.listChildren().find((child) => child.getName() === 'icon') as any;
	t.truthy(iconLoader, 'Button52 icon loader exists');
	t.true(iconLoader?.getGrayed?.(), 'loader keeps grayed attr');
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
	t.true(inspectorView.getBgColorEnabled?.(), 'component root keeps bgColorEnabled');
	t.is(inspectorView.getBgColor?.(), '#383838', 'component root keeps bgColor');

	const referenceView = builderPkg.listComponents().find((c) => c.getName() === 'ReferenceView')!;
	t.is(referenceView.getDesignImageAlpha?.(), 100, 'component root keeps designImageAlpha');
	t.is(referenceView.getDesignImageOffsetX?.(), -428, 'component root keeps designImageOffsetX');

	const imageContainer = builderPkg.listComponents().find((c) => c.getName() === 'ImageContainer')!;
	t.is(imageContainer.getIdNum?.(), 0, 'component root keeps idnum');

	const windowFrame = basicPkg.listComponents().find((c) => c.getName() === 'WindowFrame')!;
	t.is(windowFrame.getInitName?.(), 'frame', 'component root keeps initName');

	const docContainer = builderPkg.listComponents().find((c) => c.getName() === 'DocContainer')!;
	t.is(docContainer.getOverflow?.(), 2, 'component root keeps overflow=scroll');
	t.is(docContainer.getScrollType?.(), 2, 'component root keeps scroll=both');

	const buttonWithIcon = basicPkg.listComponents().find((c) => c.getName() === 'ButtonWithIcon')!;
	const iconLoader = buttonWithIcon.listChildren().find((child) => child.getName() === 'icon') as any;
	t.truthy(iconLoader, 'ButtonWithIcon icon loader exists');
	t.is(iconLoader?.getUrl?.(), 'ui://2pshu6oix5ao5k', 'loader keeps url attr');
	t.is(iconLoader?.getFill?.(), 1, 'loader keeps fill=scale');
	t.true(iconLoader?.getShrinkOnly?.(), 'loader keeps shrinkOnly attr');
	t.true(iconLoader?.getClearOnPublish?.(), 'loader keeps clearOnPublish attr');

	const recentItem = builderPkg.listComponents().find((c) => c.getName() === 'RecentItem')!;
	const title = recentItem.listChildren().find((child) => child.getName() === 'title') as any;
	t.truthy(title, 'RecentItem richtext exists');
	t.true(title?.getUbbEnabled?.(), 'richtext keeps ubb attr');
	t.true(title?.getSingleLine?.(), 'richtext keeps singleLine attr');
	t.true(title?.getAutoClearText?.(), 'richtext keeps autoClearText attr');
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
