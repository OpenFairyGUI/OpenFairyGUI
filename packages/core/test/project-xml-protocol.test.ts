import test, { type ExecutionContext } from 'ava';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_XML_PROTOCOL, listXmlAttrNames } from '../src/io/project-xml-protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFERER_ROOT = path.resolve(__dirname, '../../../referer');

function collectAllowedAttrNames(...protocolKeys: Array<keyof typeof PROJECT_XML_PROTOCOL>): Set<string> {
	return new Set(protocolKeys.flatMap((key) => listXmlAttrNames(PROJECT_XML_PROTOCOL[key])));
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
	const attrPattern = /([A-Za-z_][A-Za-z0-9_]*)=/g;
	const attrNames = new Set<string>();

	for (const match of content.matchAll(tagPattern)) {
		const tag = match[0];
		for (const attrMatch of tag.matchAll(attrPattern)) {
			attrNames.add(attrMatch[1]!);
		}
	}

	return attrNames;
}

async function collectRootComponentAttrNames(filePath: string): Promise<Set<string>> {
	const content = await fs.readFile(filePath, 'utf-8');
	const match = content.match(/<component\b[^>]*>/);
	if (!match) return new Set();

	const attrPattern = /([A-Za-z_][A-Za-z0-9_]*)=/g;
	const attrNames = new Set<string>();
	for (const attrMatch of match[0].matchAll(attrPattern)) {
		attrNames.add(attrMatch[1]!);
	}
	return attrNames;
}

async function collectNestedComponentAttrNames(filePath: string): Promise<Set<string>> {
	const content = await fs.readFile(filePath, 'utf-8');
	const matches = [...content.matchAll(/<component\b[^>]*>/g)];
	const attrPattern = /([A-Za-z_][A-Za-z0-9_]*)=/g;
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

test('project XML protocol covers selected tag attrs across referer samples', async (t) => {
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
	await assertTagAttrsCovered(t, 'group', collectAllowedAttrNames('displayObject', 'group'));
	await assertTagAttrsCovered(t, 'list', collectAllowedAttrNames('displayObject', 'list'));
	await assertTagAttrsCovered(t, 'text', collectAllowedAttrNames('displayObject', 'text'));
	await assertTagAttrsCovered(t, 'richtext', collectAllowedAttrNames('displayObject', 'text', 'richText'));
});
