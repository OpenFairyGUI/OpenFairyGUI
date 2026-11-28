import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import { Document, GearType } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { prune, rename } from '../src/index.js';
import { buildCodegenClasses } from '../src/codegen-model.js';
import { resolveCodeGenerationSettings, resolvePackageCodegenPlan } from '../src/codegen-settings.js';
import type { CompatNodeRect } from '../src/max-rects-compat.js';
import { MaxRectsPackerCompat } from '../src/max-rects-packer-compat.js';
import { publishNode } from '../src/node.js';
import { assertSafeOutputFileName, expandPathVariables } from '../src/path-utils.js';

function rect(index: number, width: number, height: number): CompatNodeRect {
	return {
		x: 0,
		y: 0,
		width,
		height,
		rotated: false,
		index,
		subIndex: 0,
		flags: 0,
		score1: 0,
		score2: 0,
	};
}

test('prune preserves loader, gear, and referenced empty components while removing dead assets', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('Main').setId('pkgdemo1');
	const usedIcon = doc.createImageResource('usedIcon').setId('img1').setExported(false);
	const gearIcon = doc.createImageResource('gearIcon').setId('img2').setExported(false);
	const unusedImg = doc.createImageResource('unusedImg').setId('img3').setExported(false);
	const usedEmpty = doc.createComponent('UsedEmpty').setId('cmp2').setExported(false);
	const unusedEmpty = doc.createComponent('UnusedEmpty').setId('cmp3').setExported(false);
	const rootComp = doc.createComponent('Root').setId('cmp1').setExported(true);

	const loader = doc.createGLoader('iconLoader').setId('n1').setUrl('ui://pkgdemo1img1');
	const gear = doc.createGear('g1').setGearType(GearType.Icon).setPages('0').setValues('ui://pkgdemo1img2');
	loader.addGear(gear);
	const inst = doc.createGComponent('sub').setId('n2').setSrc('cmp2');
	rootComp.addChild(loader).addChild(inst);
	pkg.addResource(usedIcon)
		.addResource(gearIcon)
		.addResource(unusedImg)
		.addResource(usedEmpty)
		.addResource(unusedEmpty)
		.addResource(rootComp);

	await doc.transform(prune({ emptyComponents: true }));
	const remaining = new Set(pkg.listResources().map((res) => res.getId()));
	t.true(remaining.has('cmp1'));
	t.true(remaining.has('img1'));
	t.true(remaining.has('img2'));
	t.true(remaining.has('cmp2'));
	t.false(remaining.has('img3'));
	t.false(remaining.has('cmp3'));
});

test('rename validates collisions, preserves file extensions, and updates named ui:// references', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('Main').setId('pkg001');
	const icon = doc.createImageResource('OldIcon').setId('img1').setFileName('OldIcon.png');
	const taken = doc.createImageResource('Taken').setId('img2');
	const comp = doc.createComponent('Panel').setId('cmp1');
	const loader = doc.createGLoader('ldr').setId('n1').setUrl('ui://Main/OldIcon');
	comp.addChild(loader);
	pkg.addResource(icon).addResource(taken).addResource(comp);

	await t.throwsAsync(doc.transform(rename({ packageName: 'Main', resourceName: 'OldIcon', newName: 'Taken' })), {
		message: /already exists/i,
	});
	await t.throwsAsync(doc.transform(rename({ packageName: 'Main', resourceName: 'OldIcon', newName: '../bad' })), {
		message: /invalid/i,
	});

	await doc.transform(
		rename({ packageName: 'Main', resourceName: 'OldIcon', newName: 'NewIcon', updateReferences: true }),
	);
	t.is(icon.getName(), 'NewIcon');
	t.is(icon.getFileName(), 'NewIcon.png');
	t.is(loader.getUrl(), 'ui://Main/NewIcon');
});

test('MaxRectsPackerCompat enforces multiPage:false, avoids edge padding overflow, and packs 0x0 trimmed rects', (t) => {
	const single = new MaxRectsPackerCompat({ maxWidth: 64, maxHeight: 64, padding: 2, multiPage: false });
	t.is(single.pack([rect(0, 50, 50), rect(1, 50, 50)]), null);

	const exact = new MaxRectsPackerCompat({ maxWidth: 64, maxHeight: 64, padding: 4, multiPage: false });
	const exactPages = exact.pack([rect(0, 64, 64)]);
	t.truthy(exactPages);
	const firstRect = exactPages?.[0]?.outputRects[0];
	t.truthy(firstRect);
	t.is(firstRect?.x, 0);
	t.is(firstRect?.y, 0);
	t.true(firstRect!.x + firstRect!.width <= exactPages![0]!.width);

	const emptyTrim = new MaxRectsPackerCompat({ maxWidth: 64, maxHeight: 64, padding: 2, multiPage: true });
	const pages = emptyTrim.pack([rect(0, 0, 0)]);
	t.is(pages?.length, 1);
	t.is(pages?.[0]?.outputRects.length, 1);
});

test('expandPathVariables, assertSafeOutputFileName, and codegen settings block injection and traversal', (t) => {
	t.is(expandPathVariables('{a}/{b}', { a: '{b}', b: 'SECOND' }), '{b}/SECOND');
	t.throws(() => assertSafeOutputFileName('../evil.ts', 'test'));
	t.throws(() => assertSafeOutputFileName('a/b.ts', 'test'));
	t.throws(() => assertSafeOutputFileName(' name.ts', 'test'));

	const badPkgDoc = new Document();
	badPkgDoc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				codePath: 'gen',
				packageName: 'Evil; System.Exit(1)',
			},
		},
	});
	const badPkg = badPkgDoc.createPackage('Main').setId('pkg001').setGenCode(true);
	const memFs = { join: (...parts: string[]) => parts.join('/') } as never;
	const badSettings = resolveCodeGenerationSettings(badPkgDoc);
	t.throws(
		() =>
			resolvePackageCodegenPlan(badPkg, badSettings, {
				basePath: '/tmp/project',
				packages: [badPkg],
				fs: memFs,
			}),
		{ message: /packageName/i },
	);

	const badPrefixDoc = new Document();
	badPrefixDoc.getRoot().setSettings({
		publish: {
			codeGeneration: {
				allowGenCode: true,
				codePath: 'gen',
				classNamePrefix: '../UI_',
			},
		},
	});
	const pkg = badPrefixDoc.createPackage('Main').setId('pkg001').setGenCode(true);
	pkg.addResource(badPrefixDoc.createComponent('MainView').setId('cmp1').setExported(true));
	const settings = resolveCodeGenerationSettings(badPrefixDoc);
	const plan = resolvePackageCodegenPlan(pkg, settings, {
		basePath: '/tmp/project',
		packages: [pkg],
		fs: memFs,
	});
	t.truthy(plan);
	t.throws(() => buildCodegenClasses(badPrefixDoc, pkg, plan!), { message: /classNamePrefix/i });
});

test('publishNode blocks SVG XXE/SSRF payloads while permitting standard W3C SVG 1.1 icons', async (t) => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-fn-svg-publish-'));
	t.teardown(() => fs.rm(dir, { recursive: true, force: true }));
	const doc = new Document();
	doc.getRoot().setProjectType(4);
	const pkg = doc.createPackage('Main').setId('pkg001');
	const img = doc
		.createImageResource('evil.svg')
		.setId('img1')
		.setPath('/')
		.setFileName('evil.svg')
		.setExported(true);
	pkg.addResource(img);
	const fairyPath = path.join(dir, 'src', 'Demo.fairy');
	await fs.mkdir(path.dirname(fairyPath), { recursive: true });
	await new NodeIO().writeProject(doc, fairyPath);

	const svgPath = path.join(dir, 'src', 'assets', 'Main', 'evil.svg');
	await fs.writeFile(
		svgPath,
		'<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>',
	);
	const loadedBad = await new NodeIO().readProject(fairyPath);
	await t.throwsAsync(
		publishNode({ document: loadedBad, output: path.join(dir, 'out-bad'), allowProjectPlugins: false }),
		{ message: /Could not read image|Invalid or unsafe SVG/i },
	);

	await fs.writeFile(
		svgPath,
		'<?xml version="1.0" standalone="no"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><defs><style type="text/css"></style></defs><rect width="16" height="16" fill="#ff0000"/></svg>',
	);
	const loadedOk = await new NodeIO().readProject(fairyPath);
	const okResult = await publishNode({
		document: loadedOk,
		output: path.join(dir, 'out-ok'),
		allowProjectPlugins: false,
	});
	t.true(okResult.files.length >= 1);
});
