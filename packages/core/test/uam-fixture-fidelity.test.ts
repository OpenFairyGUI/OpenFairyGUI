import test from 'ava';
import { getFixtureProjectPath } from '@openfairygui/test-utils';
import type { Document } from '../src/index.js';
import { NodeIO } from '../src/node.js';
import { type FileSystem, ProjectWriter } from '../src/project-io.js';
import { liftDocumentToUamProject, materializeUamProject } from '../src/uam/index.js';

const FIXTURE_PROJECTS = [
	['FairyGUI-Experiments', 'FairyGUI-Experiments.fairy'],
	['FairyGUI-layabox', 'demo/UIProject/FairyGUI-layabox-demo.fairy'],
	['FairyGUI-unity', 'UIProject/FairyGUI-Unity-Examples.fairy'],
	['FairyGUI-Editor', 'ui/FairyGUI-Editor.fairy'],
] as const;

async function captureProject(
	document: Document,
): Promise<{ files: Map<string, string | Uint8Array>; directories: Set<string> }> {
	const files = new Map<string, string | Uint8Array>();
	const directories = new Set<string>();
	const normalize = (filePath: string) => filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
	const fileSystem: FileSystem = {
		async readFile(filePath) {
			return files.get(normalize(filePath)) as string;
		},
		async readFileRaw(filePath) {
			return files.get(normalize(filePath)) as Uint8Array;
		},
		async writeFile(filePath, content) {
			files.set(normalize(filePath), content);
		},
		async writeFileRaw(filePath, data) {
			files.set(normalize(filePath), data.slice());
		},
		async mkdir(dirPath) {
			directories.add(normalize(dirPath));
		},
		async readdir() {
			return [];
		},
		async exists(filePath) {
			return files.has(normalize(filePath));
		},
		join: (...paths) => normalize(paths.filter(Boolean).join('/')),
		dirname: (filePath) => normalize(filePath).replace(/\/[^/]*$/, ''),
	};
	await new ProjectWriter(fileSystem).write(document, 'Project.fairy');
	return { files, directories };
}

// Backend sessions accept saves only when this round trip is exact, so each real fixture must stay lossless.
for (const [fixture, fairyPath] of FIXTURE_PROJECTS) {
	test(`${fixture} project XML survives UAM lift and materialize unchanged`, async (t) => {
		const read = await new NodeIO().readProjectDetailed(getFixtureProjectPath(fixture, fairyPath), {
			hydrateResourceBytes: true,
		});
		t.true(read.complete);
		if (!read.document) return t.fail('expected fixture document');
		const source = await captureProject(read.document);
		const roundTripped = await captureProject(materializeUamProject(liftDocumentToUamProject(read.document)));
		t.deepEqual([...roundTripped.directories].sort(), [...source.directories].sort());
		t.deepEqual([...roundTripped.files.keys()].sort(), [...source.files.keys()].sort());
		const differing = [...source.files]
			.filter(([filePath, bytes]) => {
				const other = roundTripped.files.get(filePath);
				return typeof bytes === 'string'
					? bytes !== other
					: !(other instanceof Uint8Array && Buffer.from(bytes).equals(other));
			})
			.map(([filePath]) => filePath);
		t.deepEqual(differing, []);
	});
}
