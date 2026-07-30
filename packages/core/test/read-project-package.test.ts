import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import {
	GearType,
	PropertyType,
} from '../src/index.js';
import { NodeIO } from '../src/node.js';

const PROJECT_PATH = getFixtureProjectPath('FairyGUI-unity', 'UIProject/FairyGUI-Unity-Examples.fairy');
const BRANCH_LOADER_PROJECT_PATH = getFixtureProjectPath('FairyGUI-Experiments');
const EDITOR_PROJECT_PATH = getFixtureProjectPath('FairyGUI-Editor', 'ui/FairyGUI-Editor.fairy');
const LAYABOX_PROJECT_PATH = getFixtureProjectPath('FairyGUI-layabox', 'demo/UIProject/FairyGUI-layabox-demo.fairy');

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

let _branchLoaderDoc: Awaited<ReturnType<NodeIO['readProject']>>;
async function getBranchLoaderDoc() {
	if (!_branchLoaderDoc) {
		const io = new NodeIO();
		_branchLoaderDoc = await io.readProject(BRANCH_LOADER_PROJECT_PATH);
	}
	return _branchLoaderDoc;
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
	const doc = await getBranchLoaderDoc();
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
	const doc = await getBranchLoaderDoc();
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

test('opt-in hydration loads primary source bytes from main and branch packages', async (t) => {
	const io = new NodeIO();
	const branchDoc = await io.readProject(BRANCH_LOADER_PROJECT_PATH, { hydrateResourceBytes: true });
	const branchPkg = branchDoc.getRoot().listPackages().find((pkg) => pkg.getName() === 'Branch');
	const mainImage = branchPkg?.getResourceById('kn7w1') as any;
	const devImage = branchPkg?.getResourceById('kn7w2') as any;
	t.true(mainImage?.getSourceData?.()?.getData?.() instanceof Uint8Array);
	t.true(devImage?.getSourceData?.()?.getData?.() instanceof Uint8Array);
	t.is(mainImage?.getSourceData?.()?.getURI?.(), '/face.png');
	t.is(devImage?.getSourceData?.()?.getURI?.(), '/face.png');

	const layaboxDoc = await io.readProject(LAYABOX_PROJECT_PATH, { hydrateResourceBytes: true });
	const hydratedDocuments = [branchDoc, layaboxDoc];
	for (const propertyType of [
		PropertyType.IMAGE_RESOURCE,
		PropertyType.SOUND_RESOURCE,
		PropertyType.MISC_RESOURCE,
		PropertyType.FONT_RESOURCE,
		PropertyType.MOVIE_CLIP_RESOURCE,
		PropertyType.SPINE_RESOURCE,
		PropertyType.DRAGON_BONES_RESOURCE,
	]) {
		const resource = hydratedDocuments
			.flatMap((doc) => doc.getRoot().listPackages())
			.flatMap((pkg) => pkg.listResources())
			.find((candidate) => (
				candidate.propertyType === propertyType
				&& (candidate as any).getSourceData?.()?.getData?.() instanceof Uint8Array
			));
		t.truthy(resource, `expected hydrated ${propertyType} source bytes`);
	}
});

test('opt-in hydration never follows traversal paths from package XML', async (t) => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-hydration-path-'));
	const projectPath = path.join(tmpDir, 'Project.fairy');
	try {
		await fs.writeFile(projectPath, '<?xml version="1.0" encoding="utf-8"?><projectDescription id="safe" type="Layabox" version="3.0"/>');
		await fs.mkdir(path.join(tmpDir, 'assets', 'Demo'), { recursive: true });
		await fs.writeFile(
			path.join(tmpDir, 'assets', 'Demo', 'package.xml'),
			'<?xml version="1.0" encoding="utf-8"?><packageDescription id="pkgDemo"><resources><image id="img" name="secret.bin" path="../../" exported="true"/></resources></packageDescription>',
		);
		await fs.writeFile(path.join(tmpDir, 'secret.bin'), new Uint8Array([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
			0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
			0x00, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x09,
		]));

		const doc = await new NodeIO().readProject(projectPath, { hydrateResourceBytes: true });
		const image = doc.getRoot().getPackage('Demo')?.getResourceById('img') as {
			getSourceData?(): unknown;
			getWidth?(): number;
			getHeight?(): number;
		} | undefined;
		t.is(image?.getSourceData?.() ?? null, null);
		t.is(image?.getWidth?.() ?? 0, 0);
		t.is(image?.getHeight?.() ?? 0, 0);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('package.xml publish preserves packageCount', async (t) => {
	const layaboxDoc = await getLayaboxDoc();
	const joystickPkg = layaboxDoc.getRoot().listPackages().find((p) => p.getName() === 'Joystick');
	t.truthy(joystickPkg, 'Joystick package exists');
	t.is(joystickPkg?.getPublishName(), 'Joystick', 'publish name survives');
	t.is(joystickPkg?.getPublishPackageCount?.(), 1, 'publish packageCount survives');
});


