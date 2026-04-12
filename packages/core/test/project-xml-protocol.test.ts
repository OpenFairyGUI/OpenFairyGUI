import test, { type ExecutionContext } from 'ava';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import {
	PROJECT_XML_PROTOCOL,
	listXmlAttrNames,
	listXmlChildNames,
	listXmlContainerItemNames,
	listXmlContainerNames,
} from '../src/io/project-xml-protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFERER_ROOT = path.resolve(__dirname, '../../../referer');
const XML_PARSER = new XMLParser({ ignoreAttributes: false, preserveOrder: true });
const GROUP_CONDITIONAL_CHILD_NAMES = new Set([
	'relation',
	'gearDisplay',
	'gearDisplay2',
	'gearXY',
	'gearSize',
	'gearText',
	'gearIcon',
]);
const EXTENSION_CHILD_NAMES = new Set([
	'Button',
	'Label',
	'ComboBox',
	'ProgressBar',
	'Slider',
	'ScrollBar',
]);

function collectAllowedAttrNames(...protocolKeys: Array<keyof typeof PROJECT_XML_PROTOCOL>): Set<string> {
	return new Set(protocolKeys.flatMap((key) => listXmlAttrNames(PROJECT_XML_PROTOCOL[key])));
}

function collectChildNames(protocolKey: keyof typeof PROJECT_XML_PROTOCOL): string[] {
	return [...listXmlChildNames(PROJECT_XML_PROTOCOL[protocolKey])].sort();
}

function collectContainerNames(protocolKey: keyof typeof PROJECT_XML_PROTOCOL): string[] {
	return [...listXmlContainerNames(PROJECT_XML_PROTOCOL[protocolKey])].sort();
}

function collectContainerItemNames(
	protocolKey: keyof typeof PROJECT_XML_PROTOCOL,
	containerName: string,
): string[] {
	return [...listXmlContainerItemNames(PROJECT_XML_PROTOCOL[protocolKey], containerName)].sort();
}

async function walkXmlFiles(dirPath: string): Promise<string[]> {
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	const xmlFiles: string[] = [];

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			xmlFiles.push(...await walkXmlFiles(fullPath));
		} else if (entry.isFile() && fullPath.endsWith('.xml')) {
			xmlFiles.push(fullPath);
		}
	}

	return xmlFiles;
}

async function collectTagAttrNames(filePath: string, tagName: string): Promise<Set<string>> {
	const content = await fs.readFile(filePath, 'utf-8');
	const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'g');
	const attrPattern = /(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=(?:"[^"]*"|'[^']*')/g;
	const attrNames = new Set<string>();

	for (const match of content.matchAll(tagPattern)) {
		const tag = match[0];
		for (const attrMatch of tag.matchAll(attrPattern)) {
			attrNames.add(attrMatch[1]!);
		}
	}

	return attrNames;
}

async function collectConditionalGroupChildren(
	filePath: string,
): Promise<Array<{ advanced: boolean; childNames: string[] }>> {
	const content = await fs.readFile(filePath, 'utf-8');
	const parsed = XML_PARSER.parse(content) as Array<Record<string, unknown>>;
	const rows: Array<{ advanced: boolean; childNames: string[] }> = [];

	const visit = (nodes: unknown): void => {
		if (!Array.isArray(nodes)) return;
		for (const node of nodes) {
			if (!node || typeof node !== 'object') continue;
			const record = node as Record<string, unknown>;
			for (const [key, value] of Object.entries(record)) {
				if (key === ':@' || !Array.isArray(value)) continue;
				if (key === 'group') {
					const childNames = new Set<string>();
					for (const child of value) {
						if (!child || typeof child !== 'object') continue;
						for (const childKey of Object.keys(child as Record<string, unknown>)) {
							if (GROUP_CONDITIONAL_CHILD_NAMES.has(childKey)) {
								childNames.add(childKey);
							}
						}
					}
					if (childNames.size > 0) {
						const attrs = (record[':@'] ?? {}) as Record<string, string>;
						rows.push({
							advanced: attrs['@_advanced'] === 'true',
							childNames: [...childNames].sort(),
						});
					}
				}
				visit(value);
			}
		}
	};

	visit(parsed);
	return rows;
}

async function collectRootExtensionChildren(
	filePath: string,
): Promise<Array<{ extention: string | null; childNames: string[] }>> {
	const content = await fs.readFile(filePath, 'utf-8');
	const parsed = XML_PARSER.parse(content) as Array<Record<string, unknown>>;
	const rows: Array<{ extention: string | null; childNames: string[] }> = [];

	for (const entry of parsed) {
		if (!entry || typeof entry !== 'object' || !('component' in entry) || !Array.isArray(entry.component)) continue;
		const attrs = (entry[':@'] ?? {}) as Record<string, string>;
		const childNames = new Set<string>();
		for (const child of entry.component) {
			if (!child || typeof child !== 'object') continue;
			for (const childKey of Object.keys(child as Record<string, unknown>)) {
				if (EXTENSION_CHILD_NAMES.has(childKey)) {
					childNames.add(childKey);
				}
			}
		}
		if (childNames.size > 0) {
			rows.push({
				extention: attrs['@_extention'] ?? null,
				childNames: [...childNames].sort(),
			});
		}
	}

	return rows;
}

async function collectRootComponentAttrNames(filePath: string): Promise<Set<string>> {
	const content = await fs.readFile(filePath, 'utf-8');
	const match = content.match(/<component\b[^>]*>/);
	if (!match) return new Set();

	const attrPattern = /(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=(?:"[^"]*"|'[^']*')/g;
	const attrNames = new Set<string>();
	for (const attrMatch of match[0].matchAll(attrPattern)) {
		attrNames.add(attrMatch[1]!);
	}
	return attrNames;
}

async function collectRootTagAttrNames(filePath: string, tagName: string): Promise<Set<string>> {
	const content = await fs.readFile(filePath, 'utf-8');
	const match = content.match(new RegExp(`<${tagName}\\b[^>]*>`));
	if (!match) return new Set();

	const attrPattern = /(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=(?:"[^"]*"|'[^']*')/g;
	const attrNames = new Set<string>();
	for (const attrMatch of match[0].matchAll(attrPattern)) {
		attrNames.add(attrMatch[1]!);
	}
	return attrNames;
}

async function collectNestedComponentAttrNames(filePath: string): Promise<Set<string>> {
	const content = await fs.readFile(filePath, 'utf-8');
	const matches = [...content.matchAll(/<component\b[^>]*>/g)];
	const attrPattern = /(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=(?:"[^"]*"|'[^']*')/g;
	const attrNames = new Set<string>();

	for (const match of matches.slice(1)) {
		for (const attrMatch of match[0].matchAll(attrPattern)) {
			attrNames.add(attrMatch[1]!);
		}
	}

	return attrNames;
}

async function assertTagAttrsCovered(t: ExecutionContext, tagName: string, allowedNames: Set<string>): Promise<void> {
	const xmlFiles = await walkXmlFiles(REFERER_ROOT);
	const unknown = new Map<string, string[]>();

	for (const filePath of xmlFiles) {
		const actualNames = await collectTagAttrNames(filePath, tagName);
		for (const name of actualNames) {
			if (allowedNames.has(name)) continue;
			const relative = path.relative(REFERER_ROOT, filePath);
			const fileList = unknown.get(name) ?? [];
			if (fileList.length < 3) fileList.push(relative);
			unknown.set(name, fileList);
		}
	}

	t.deepEqual(
		[...unknown.entries()].sort(([a], [b]) => a.localeCompare(b)),
		[],
		`${tagName} attrs across referer samples are declared by protocol`,
	);
}

async function assertRootComponentAttrsCovered(t: ExecutionContext, allowedNames: Set<string>): Promise<void> {
	const xmlFiles = await walkXmlFiles(REFERER_ROOT);
	const unknown = new Map<string, string[]>();

	for (const filePath of xmlFiles) {
		if (path.basename(filePath) === 'package.xml') continue;
		const actualNames = await collectRootComponentAttrNames(filePath);
		for (const name of actualNames) {
			if (allowedNames.has(name)) continue;
			const relative = path.relative(REFERER_ROOT, filePath);
			const fileList = unknown.get(name) ?? [];
			if (fileList.length < 3) fileList.push(relative);
			unknown.set(name, fileList);
		}
	}

	t.deepEqual(
		[...unknown.entries()].sort(([a], [b]) => a.localeCompare(b)),
		[],
		'component root attrs across referer samples are declared by protocol',
	);
}

async function assertPackageRootTagAttrsCovered(
	t: ExecutionContext,
	tagName: string,
	allowedNames: Set<string>,
	ignoredNames: ReadonlySet<string> = new Set(),
): Promise<void> {
	const xmlFiles = (await walkXmlFiles(REFERER_ROOT)).filter((filePath) => path.basename(filePath) === 'package.xml');
	const unknown = new Map<string, string[]>();

	for (const filePath of xmlFiles) {
		const actualNames = await collectRootTagAttrNames(filePath, tagName);
		for (const name of actualNames) {
			if (allowedNames.has(name) || ignoredNames.has(name)) continue;
			const relative = path.relative(REFERER_ROOT, filePath);
			const fileList = unknown.get(name) ?? [];
			if (fileList.length < 3) fileList.push(relative);
			unknown.set(name, fileList);
		}
	}

	t.deepEqual(
		[...unknown.entries()].sort(([a], [b]) => a.localeCompare(b)),
		[],
		`${tagName} root attrs across referer package.xml samples are declared by protocol`,
	);
}

async function assertNestedComponentAttrsCovered(t: ExecutionContext, allowedNames: Set<string>): Promise<void> {
	const xmlFiles = await walkXmlFiles(REFERER_ROOT);
	const unknown = new Map<string, string[]>();

	for (const filePath of xmlFiles) {
		if (path.basename(filePath) === 'package.xml') continue;
		const actualNames = await collectNestedComponentAttrNames(filePath);
		for (const name of actualNames) {
			if (allowedNames.has(name)) continue;
			const relative = path.relative(REFERER_ROOT, filePath);
			const fileList = unknown.get(name) ?? [];
			if (fileList.length < 3) fileList.push(relative);
			unknown.set(name, fileList);
		}
	}

	t.deepEqual(
		[...unknown.entries()].sort(([a], [b]) => a.localeCompare(b)),
		[],
		'component instance attrs across referer samples are declared by protocol',
	);
}

async function collectContextualChildTagAttrNames(
	filePath: string,
	parentTagName: string,
	childTagName: string,
): Promise<Set<string>> {
	const content = await fs.readFile(filePath, 'utf-8');
	const parentPattern = new RegExp(`<${parentTagName}\\b[^>]*>([\\s\\S]*?)</${parentTagName}>`, 'g');
	const childPattern = new RegExp(`<${childTagName}\\b[^>]*>`, 'g');
	const attrPattern = /(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=(?:"[^"]*"|'[^']*')/g;
	const attrNames = new Set<string>();

	for (const parentMatch of content.matchAll(parentPattern)) {
		const inner = parentMatch[1] ?? '';
		for (const childMatch of inner.matchAll(childPattern)) {
			for (const attrMatch of childMatch[0].matchAll(attrPattern)) {
				attrNames.add(attrMatch[1]!);
			}
		}
	}

	return attrNames;
}

async function assertContextualChildTagAttrsCovered(
	t: ExecutionContext,
	parentTagName: string,
	childTagName: string,
	allowedNames: Set<string>,
	ignoredNames: ReadonlySet<string> = new Set(),
): Promise<void> {
	const xmlFiles = await walkXmlFiles(REFERER_ROOT);
	const unknown = new Map<string, string[]>();

	for (const filePath of xmlFiles) {
		if (path.basename(filePath) === 'package.xml') continue;
		const actualNames = await collectContextualChildTagAttrNames(filePath, parentTagName, childTagName);
		for (const name of actualNames) {
			if (allowedNames.has(name) || ignoredNames.has(name)) continue;
			const relative = path.relative(REFERER_ROOT, filePath);
			const fileList = unknown.get(name) ?? [];
			if (fileList.length < 3) fileList.push(relative);
			unknown.set(name, fileList);
		}
	}

	t.deepEqual(
		[...unknown.entries()].sort(([a], [b]) => a.localeCompare(b)),
		[],
		`${parentTagName} > ${childTagName} attrs across referer samples are declared by protocol`,
	);
}

async function assertPackageResourceAttrsCovered(
	t: ExecutionContext,
	tagName: string,
	allowedNames: Set<string>,
	ignoredNames: ReadonlySet<string> = new Set(),
): Promise<void> {
	const xmlFiles = (await walkXmlFiles(REFERER_ROOT)).filter((filePath) => path.basename(filePath) === 'package.xml');
	const unknown = new Map<string, string[]>();

	for (const filePath of xmlFiles) {
		const actualNames = await collectTagAttrNames(filePath, tagName);
		for (const name of actualNames) {
			if (allowedNames.has(name) || ignoredNames.has(name)) continue;
			const relative = path.relative(REFERER_ROOT, filePath);
			const fileList = unknown.get(name) ?? [];
			if (fileList.length < 3) fileList.push(relative);
			unknown.set(name, fileList);
		}
	}

	t.deepEqual(
		[...unknown.entries()].sort(([a], [b]) => a.localeCompare(b)),
		[],
		`${tagName} resource attrs across referer package.xml samples are declared by protocol`,
	);
}

test('project XML protocol covers selected tag attrs across referer samples', async (t) => {
	await assertPackageResourceAttrsCovered(
		t,
		'image',
		collectAllowedAttrNames('packageResource', 'packageImageResource'),
	);
	await assertPackageRootTagAttrsCovered(
		t,
		'packageDescription',
		collectAllowedAttrNames('packageDescription'),
		new Set(['jpegQuality', 'compressPNG']),
	);
	await assertPackageResourceAttrsCovered(t, 'component', collectAllowedAttrNames('packageResource'));
	await assertPackageResourceAttrsCovered(
		t,
		'font',
		collectAllowedAttrNames('packageResource', 'packageFontResource'),
	);
	await assertContextualChildTagAttrsCovered(
		t,
		'packageDescription',
		'publish',
		collectAllowedAttrNames('packagePublish'),
	);
	await assertPackageResourceAttrsCovered(t, 'sound', collectAllowedAttrNames('packageResource'));
	await assertPackageResourceAttrsCovered(t, 'movieclip', collectAllowedAttrNames('packageResource'));
	await assertRootComponentAttrsCovered(t, collectAllowedAttrNames('componentRoot'));
	await assertNestedComponentAttrsCovered(t, collectAllowedAttrNames('displayObject', 'componentInstance'));
	await assertTagAttrsCovered(t, 'Button', collectAllowedAttrNames('buttonExtension'));
	await assertTagAttrsCovered(t, 'Label', collectAllowedAttrNames('labelExtension'));
	await assertTagAttrsCovered(t, 'ComboBox', collectAllowedAttrNames('comboBoxExtension'));
	await assertTagAttrsCovered(t, 'ProgressBar', collectAllowedAttrNames('progressBarExtension'));
	await assertTagAttrsCovered(t, 'Slider', collectAllowedAttrNames('sliderExtension'));
	await assertTagAttrsCovered(t, 'ScrollBar', collectAllowedAttrNames('scrollBarExtension'));
	await assertTagAttrsCovered(t, 'loader', collectAllowedAttrNames('displayObject', 'loader'));
	await assertTagAttrsCovered(t, 'loader3D', collectAllowedAttrNames('displayObject', 'loader3D'));
	await assertTagAttrsCovered(t, 'graph', collectAllowedAttrNames('displayObject', 'graph'));
	await assertTagAttrsCovered(t, 'group', collectAllowedAttrNames('displayObject', 'group'));
	await assertTagAttrsCovered(t, 'list', collectAllowedAttrNames('displayObject', 'list'));
	await assertContextualChildTagAttrsCovered(t, 'list', 'item', collectAllowedAttrNames('listItem'));
	await assertTagAttrsCovered(t, 'jta', collectAllowedAttrNames('displayObject', 'movieClip'));
	await assertTagAttrsCovered(t, 'text', collectAllowedAttrNames('displayObject', 'text'));
	await assertTagAttrsCovered(t, 'richtext', collectAllowedAttrNames('displayObject', 'text', 'richText'));
	await assertContextualChildTagAttrsCovered(t, 'ComboBox', 'item', collectAllowedAttrNames('comboBoxItem'));
	await assertTagAttrsCovered(t, 'transition', collectAllowedAttrNames('transition'));
	await assertTagAttrsCovered(t, 'relation', collectAllowedAttrNames('relation'));
	await assertTagAttrsCovered(t, 'gearDisplay', collectAllowedAttrNames('gear'));
	await assertTagAttrsCovered(t, 'gearXY', collectAllowedAttrNames('gear'));
	await assertTagAttrsCovered(t, 'gearSize', collectAllowedAttrNames('gear'));
	await assertTagAttrsCovered(t, 'gearLook', collectAllowedAttrNames('gear'));
	await assertTagAttrsCovered(t, 'gearColor', collectAllowedAttrNames('gear'));
	await assertTagAttrsCovered(t, 'gearAni', collectAllowedAttrNames('gear'));
	await assertTagAttrsCovered(t, 'gearText', collectAllowedAttrNames('gear'));
	await assertTagAttrsCovered(t, 'gearIcon', collectAllowedAttrNames('gear'));
	await assertTagAttrsCovered(t, 'gearDisplay2', collectAllowedAttrNames('gear'));
	await assertTagAttrsCovered(t, 'gearFontSize', collectAllowedAttrNames('gear'));
});

test('project XML protocol children maps stay explicit and stable', (t) => {
	t.deepEqual(
		Object.keys(PROJECT_XML_PROTOCOL).sort(),
		[
			'buttonExtension',
			'comboBoxExtension',
			'comboBoxItem',
			'componentInstance',
			'componentRoot',
			'controller',
			'controllerAction',
			'displayObject',
			'gear',
			'graph',
			'group',
			'image',
			'labelExtension',
			'list',
			'listItem',
			'loader',
			'loader3D',
			'movieClip',
			'packageDescription',
			'packageFontResource',
			'packageImageResource',
			'packagePublish',
			'packageResource',
			'progressBarExtension',
			'relation',
			'richText',
			'scrollBarExtension',
			'sliderExtension',
			'text',
			'textInput',
			'transition',
			'transitionItem',
		],
		'protocol should not expose new synthetic base/common nodes',
	);

	t.deepEqual(collectChildNames('componentRoot'), [
		'Button',
		'ComboBox',
		'Label',
		'ProgressBar',
		'ScrollBar',
		'Slider',
		'controller',
		'transition',
	]);
	t.deepEqual(collectChildNames('componentInstance'), [
		'Button',
		'ComboBox',
		'Label',
		'ProgressBar',
		'ScrollBar',
		'Slider',
		'gearAni',
		'gearColor',
		'gearDisplay',
		'gearDisplay2',
		'gearFontSize',
		'gearIcon',
		'gearLook',
		'gearSize',
		'gearText',
		'gearXY',
		'relation',
	]);
	t.deepEqual(collectChildNames('image'), [
		'gearAni',
		'gearColor',
		'gearDisplay',
		'gearDisplay2',
		'gearFontSize',
		'gearIcon',
		'gearLook',
		'gearSize',
		'gearText',
		'gearXY',
		'relation',
	]);
	t.deepEqual(collectChildNames('graph'), [
		'gearAni',
		'gearColor',
		'gearDisplay',
		'gearDisplay2',
		'gearFontSize',
		'gearIcon',
		'gearLook',
		'gearSize',
		'gearText',
		'gearXY',
		'relation',
	]);
	t.deepEqual(collectChildNames('movieClip'), [
		'gearAni',
		'gearColor',
		'gearDisplay',
		'gearDisplay2',
		'gearFontSize',
		'gearIcon',
		'gearLook',
		'gearSize',
		'gearText',
		'gearXY',
		'relation',
	]);
	t.deepEqual(collectChildNames('loader'), [
		'gearAni',
		'gearColor',
		'gearDisplay',
		'gearDisplay2',
		'gearFontSize',
		'gearIcon',
		'gearLook',
		'gearSize',
		'gearText',
		'gearXY',
		'relation',
	]);
	t.deepEqual(collectChildNames('loader3D'), [
		'gearAni',
		'gearColor',
		'gearDisplay',
		'gearDisplay2',
		'gearFontSize',
		'gearIcon',
		'gearLook',
		'gearSize',
		'gearText',
		'gearXY',
		'relation',
	]);
	t.deepEqual(collectChildNames('text'), [
		'gearAni',
		'gearColor',
		'gearDisplay',
		'gearDisplay2',
		'gearFontSize',
		'gearIcon',
		'gearLook',
		'gearSize',
		'gearText',
		'gearXY',
		'relation',
	]);
	t.deepEqual(collectChildNames('richText'), [
		'gearAni',
		'gearColor',
		'gearDisplay',
		'gearDisplay2',
		'gearFontSize',
		'gearIcon',
		'gearLook',
		'gearSize',
		'gearText',
		'gearXY',
		'relation',
	]);
	t.deepEqual(collectChildNames('group'), [
		'gearDisplay',
		'gearDisplay2',
		'gearIcon',
		'gearSize',
		'gearText',
		'gearXY',
		'relation',
	]);
	t.deepEqual(collectChildNames('list'), [
		'gearAni',
		'gearColor',
		'gearDisplay',
		'gearDisplay2',
		'gearFontSize',
		'gearIcon',
		'gearLook',
		'gearSize',
		'gearText',
		'gearXY',
		'item',
		'relation',
	]);
	t.deepEqual(collectChildNames('controller'), ['action']);
	t.deepEqual(collectChildNames('transition'), ['item']);
	t.deepEqual(collectChildNames('comboBoxExtension'), ['item']);
	t.deepEqual(collectChildNames('buttonExtension'), []);
	t.deepEqual(collectChildNames('relation'), []);
	t.deepEqual(collectContainerNames('componentRoot'), ['displayList']);
	t.deepEqual(collectContainerNames('componentInstance'), []);
	t.deepEqual(collectContainerItemNames('componentRoot', 'displayList'), [
		'component',
		'graph',
		'group',
		'image',
		'inputtext',
		'jta',
		'list',
		'loader',
		'loader3D',
		'movieclip',
		'richtext',
		'text',
		'tree',
	]);
});

test('group relation/gear children in referer samples only appear on advanced groups', async (t) => {
	const xmlFiles = await walkXmlFiles(REFERER_ROOT);
	const invalid: Array<{ file: string; childNames: string[] }> = [];
	let matched = 0;

	for (const filePath of xmlFiles) {
		if (path.basename(filePath) === 'package.xml') continue;
		const rows = await collectConditionalGroupChildren(filePath);
		matched += rows.length;
		for (const row of rows) {
			if (row.advanced) continue;
			invalid.push({
				file: path.relative(REFERER_ROOT, filePath),
				childNames: row.childNames,
			});
		}
	}

	t.true(matched > 0, 'referer should contain advanced group structural samples');
	t.deepEqual(
		invalid,
		[],
		'group relation/gear structural children should only appear on advanced groups in referer samples',
	);
});

test('root extension children in referer samples require matching extention attr', async (t) => {
	const xmlFiles = await walkXmlFiles(REFERER_ROOT);
	const invalid: Array<{ file: string; extention: string | null; childNames: string[] }> = [];
	let matched = 0;

	for (const filePath of xmlFiles) {
		if (path.basename(filePath) === 'package.xml') continue;
		const rows = await collectRootExtensionChildren(filePath);
		matched += rows.length;
		for (const row of rows) {
			if (row.childNames.length === 1 && row.extention === row.childNames[0]) continue;
			invalid.push({
				file: path.relative(REFERER_ROOT, filePath),
				extention: row.extention,
				childNames: row.childNames,
			});
		}
	}

	t.true(matched > 0, 'referer should contain root extension structural samples');
	t.deepEqual(
		invalid,
		[],
		'root extension child nodes should only appear when component extention matches the child tag',
	);
});

test('protocolized project XML fields do not regress to legacy direct access patterns', async (t) => {
	const readerPath = path.resolve(__dirname, '../src/io/project-reader.ts');
	const writerPath = path.resolve(__dirname, '../src/io/project-writer.ts');
	const readerSource = await fs.readFile(readerPath, 'utf-8');
	const writerSource = await fs.readFile(writerPath, 'utf-8');

	const forbiddenReaderSnippets = [
		'g.setAnimationName?.(String(attrs.animationName))',
		'g.setPromptText(attrs.promptText)',
		'g.setColumnGap(parseInt2(attrs.columnGap))',
		'g.setLineCount?.(parseInt2(attrs.lineCount))',
		'g.setAutoResizeItem?.(parseBool(attrs.autoResizeItem))',
		'if (attrs.layout) {',
		'if (attrs.lineGap) g.setLineGap(parseInt2(attrs.lineGap))',
		'if (attrs.url) g.setUrl(attrs.url)',
		'if (attrs.maxLength)',
		'if (attrs.restrict)',
		'if (attrs.password)',
		'obj.setFileName?.(attrs.fileName)',
		'obj.setPackageId?.(attrs.pkg)',
		'obj.setAspect?.(parseBool(attrs.aspect))',
		'obj.setFilter?.(attrs.filter)',
		'obj.setFilterData?.(attrs.filterData)',
		'obj.setRotation(parseFloat2(rotation))',
		'obj.setAlpha(parseFloat2(alpha, 1))',
		'obj.setVisible(false)',
		'obj.setTouchable(false)',
		'obj.setGrayed(true)',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.size',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.xy',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.locked',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.restrictSize',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.pivot',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.anchor',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.scale',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.group',
		'obj.setTooltips(tooltips)',
		'obj.setCustomData(objectCustomData)',
		'obj.setSkew(skewX, skewY)',
		'const ctrl = doc.createController(ctrlDef.name || \'\')',
		'parseControllerPages(ctrlDef.pages || \'\')',
		'const actionType = parseControllerActionType(actionDef.type)',
		'.setFromPage(parseControllerActionPages(actionDef.fromPage))',
		'.setTransitionName(getXmlScalar(actionDef.transition))',
		'.setObjectId(getXmlScalar(actionDef.objectId))',
		'const trans = doc.createTransition(transDef.name || \'\')',
		'trans.setAutoPlay(parseBool(transDef.autoPlay))',
		'trans.setAutoPlayTimes(parseInt2(transDef.autoPlayTimes, 1))',
		'ti.setTime(parseFloat2(itemDef.time))',
		'ti.setTargetId(itemDef.target || \'\')',
		'const typeStr = (itemDef.type || \'\').toUpperCase()',
		'if (itemDef.value !== undefined)',
		'if (attrs.playing !== undefined) g.setPlaying(parseBool(attrs.playing))',
		'const id = attrs.id || \'\'',
		'const exported = parseBool(attrs.exported)',
		'res.setTextureSetMode(attrs.atlas)',
		'if (attrs.scale === \'9grid\' && attrs.scale9grid)',
		'res.setQualityOption(attrs.qualityOption)',
		'res.setDuplicatePadding(parseBool(attrs.duplicatePadding))',
		'res.setSmoothing(attrs.smoothing !== \'false\')',
		'if (attrs.texture) {',
		'res.setRenderMode(attrs.renderMode)',
		'res.setSamplePointSize(parseInt2(attrs.samplePointSize))',
		'pkg.setId(desc.id || \'\')',
		'pkg.setPublishName(publish.name || dirName)',
		'pkg.setPublishPath(publish.path || \'\')',
		'pkg.setPublishBranchPath(publish.branchPath || \'\')',
		'pkg.setPublishPackageCount(parseInt2(publish.packageCount, 0))',
		'const sidePairs = parseSidePair(relDef.sidePair || \'\')',
		'target: relDef.target || \'\'',
		'gear.setTween(parseBool(attrs.tween))',
		'const ctrlName = attrs.controller || \'\'',
		'gear.setPages(attrs.pages)',
		'gear.setValues(attrs.values)',
		'title: item.title ?? null,',
		'selectedIcon: item.selectedIcon ?? null,',
		'value: item.value ?? null,',
	];
	const forbiddenWriterSnippets = [
		"attrs['@_animationName']",
		"attrs['@_promptText']",
		"attrs['@_columnGap']",
		"attrs['@_lineCount']",
		"attrs['@_autoResizeItem']",
		"attrs['@_maxLength']",
		"attrs['@_restrict']",
		"attrs['@_password']",
		"attrs['@_keyboardType']",
		"attrs['@_layout']",
		"attrs['@_selectionMode']",
		"attrs['@_defaultItem']",
		"attrs['@_treeView']",
		"attrs['@_overflow']",
		"attrs['@_scroll']",
		"attrs['@_atlas']",
		"attrs['@_scale'] = '9grid'",
		"attrs['@_qualityOption']",
		"attrs['@_duplicatePadding'] = 'true'",
		"attrs['@_smoothing'] = 'false'",
		"attrs['@_texture'] = texture",
		"attrs['@_renderMode']",
		"attrs['@_samplePointSize']",
		"'@_id': pkg.getId()",
		"publish: { '@_name': publishName }",
		"attrs['@_path']",
		"attrs['@_branchPath']",
		"attrs['@_packageCount']",
		"attrs['@_fileName']",
		"attrs['@_pkg']",
		"attrs['@_aspect']",
		"attrs['@_filter']",
		"attrs['@_filterData']",
		"attrs['@_rotation']",
		"attrs['@_alpha']",
		"attrs['@_visible']",
		"attrs['@_touchable']",
		"attrs['@_grayed']",
		'PROJECT_XML_PROTOCOL.displayObject.attrs.size',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.xy',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.locked',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.restrictSize',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.pivot',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.anchor',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.scale',
		'PROJECT_XML_PROTOCOL.displayObject.attrs.group',
		"attrs['@_tooltips']",
		"attrs['@_customData']",
		"attrs['@_skew']",
		"attrs['@_autoPlayTimes']",
		"'@_name': ctrl.getName()",
		"'@_pages': pagesStr",
		"'@_selected': String(ctrl.getSelectedIndex())",
		"attrs['@_transition']",
		"attrs['@_objectId']",
		"attrs['@_targetPage']",
		"attrs['@_type'] = graphTypeName[graphType] ?? 'rect'",
		"attrs['@_lineSize']",
		"attrs['@_lineColor']",
		"attrs['@_fillColor']",
		"attrs['@_corner']",
		"attrs['@_points']",
		"attrs['@_sides']",
		"attrs['@_startAngle']",
		"attrs['@_distances']",
		"attrs['@_sidePair']",
		"attrs['@_controller'] = ctrl.getName()",
		"attrs['@_pages'] = gear.getPages()",
		"attrs['@_values'] = gear.getValues()",
		"attrs['@_default'] = gear.getDefaultValue()",
		"attrs['@_tween'] = 'true'",
		"attrs['@_condition'] = gear.getCondition()",
		"'@_time': String(item.getTime())",
		"'@_type': ACTION_TYPE_NAMES[item.getActionType()] ?? 'XY'",
		"'@_target': item.getTargetId()",
		"ia['@_duration']",
		"ia['@_tween'] = 'true'",
		"ia['@_repeat']",
		"ia['@_yoyo']",
		"ia['@_label']",
		"ia['@_value']",
		"ia['@_startValue']",
		"ia['@_endValue']",
		"attrs['@_playing'] = 'false'",
		"attrs['@_frame'] = String(frame)",
		"'@_selectedTitle': item.selectedTitle ?? undefined,",
		"'@_selectedIcon': item.selectedIcon ?? undefined,",
		"'@_controllers': item.controllers ?? undefined,",
		"'@_value': item.value ?? undefined,",
	];

	for (const snippet of forbiddenReaderSnippets) {
		t.false(readerSource.includes(snippet), `reader should not use legacy direct access snippet: ${snippet}`);
	}
	for (const snippet of forbiddenWriterSnippets) {
		t.false(writerSource.includes(snippet), `writer should not emit legacy direct access snippet: ${snippet}`);
	}
});
