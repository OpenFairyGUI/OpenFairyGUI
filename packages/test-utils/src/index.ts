import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	createDefaultUamComponentProperties,
	createDefaultUamImageResourceProperties,
	createDefaultUamPlainTextProperties,
	type UamProject,
} from '@openfairygui/core';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = path.join(PACKAGE_ROOT, 'test', 'fixtures');
const WORKSPACE_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');

export interface FixtureProject {
	name: string;
	fairyPath: string;
}

function listFairyProjects(rootDir: string): FixtureProject[] {
	if (!fs.existsSync(rootDir)) return [];

	const entries = fs.readdirSync(rootDir, { withFileTypes: true });
	const projects: FixtureProject[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const projectDir = path.join(rootDir, entry.name);
		const fairyFiles = fs.readdirSync(projectDir).filter((file) => file.endsWith('.fairy'));
		if (fairyFiles.length === 0) continue;

		projects.push({
			name: entry.name,
			fairyPath: path.join(projectDir, fairyFiles[0]),
		});
	}

	return projects.sort((a, b) => a.name.localeCompare(b.name));
}

export function getFixturesDir(): string {
	return FIXTURES_DIR;
}

export function getWorkspaceRoot(): string {
	return WORKSPACE_ROOT;
}

export function getWorkspacePath(...segments: string[]): string {
	return path.join(WORKSPACE_ROOT, ...segments);
}

export function getWorkspaceReleasePath(...segments: string[]): string {
	return path.join(WORKSPACE_ROOT, 'release', ...segments);
}

export function hasLocalFixtures(): boolean {
	return fs.existsSync(FIXTURES_DIR) && fs.readdirSync(FIXTURES_DIR).length > 0;
}

export function listFixtureProjects(): FixtureProject[] {
	return listFairyProjects(FIXTURES_DIR);
}

export function getFixtureProject(name: string): FixtureProject {
	const match = listFixtureProjects().find((project) => project.name === name);
	if (!match) {
		throw new Error(`Unknown fixture project "${name}".`);
	}
	return match;
}

export function getFixtureDir(name: string): string {
	const fullPath = path.join(FIXTURES_DIR, name);
	if (!fs.existsSync(fullPath)) {
		throw new Error(`Unknown fixture directory "${name}".`);
	}
	return fullPath;
}

export function getFixturePath(name: string, ...segments: string[]): string {
	return path.join(getFixtureDir(name), ...segments);
}

export function getFixtureProjectPath(name: string, relativeFairyPath?: string): string {
	if (relativeFairyPath) {
		const fullPath = getFixturePath(name, relativeFairyPath);
		if (!fs.existsSync(fullPath)) {
			throw new Error(`Unknown fixture project file "${name}/${relativeFairyPath}".`);
		}
		return fullPath;
	}
	return getFixtureProject(name).fairyPath;
}

export function getDefaultFixtureProject(): FixtureProject | null {
	const projects = listFixtureProjects();
	return projects[0] ?? null;
}

export function createMinimalUamProject(projectId: string): UamProject {
	return {
		projectId,
		projectType: 0,
		version: '3.0',
		branches: [],
		settings: {
			publish: {},
			common: {},
			adaptation: {},
		},
		packages: [
			{
				id: 'pkg001',
				name: 'Main',
				publish: null,
				folders: [{ branch: '', path: '/images/', favorite: false, atlas: '' }],
				resources: [
					{
						kind: 'image',
						id: 'img001',
						name: 'background.png',
						path: '/images',
						exported: true,
						favorite: false,
						branch: '',
						branchItemIds: [],
						fileName: 'background.png',
						dimensions: { width: 320, height: 180 },
						image: {
							...createDefaultUamImageResourceProperties(),
							textureSetMode: 'atlas',
						},
					},
					{
						kind: 'component',
						id: 'cmp001',
						name: 'MainView',
						path: '/',
						exported: true,
						favorite: false,
						branch: '',
						branchItemIds: [],
						component: {
							size: { width: 320, height: 180 },
							properties: createDefaultUamComponentProperties(),
							customData: '',
							displayList: [
								{
									kind: 'image',
									id: 'n0',
									name: 'bg',
									position: { x: 0, y: 0 },
									size: { width: 320, height: 180 },
									locked: false,
									aspect: false,
									minSize: { width: 0, height: 0 },
									maxSize: { width: 0, height: 0 },
									scale: { x: 1, y: 1 },
									skew: { x: 0, y: 0 },
									visible: true,
									touchable: true,
									grayed: false,
									alpha: 1,
									rotation: 0,
									tooltips: '',
									blendMode: 'normal',
									filter: '',
									filterData: '',
									customData: '',
									relations: [],
									gears: [],
									group: '',
									resource: { resourceId: 'img001' },
								},
								{
									kind: 'text',
									...createDefaultUamPlainTextProperties(),
									id: 'n1',
									name: 'title',
									position: { x: 16, y: 18 },
									size: { width: 180, height: 32 },
									locked: false,
									aspect: false,
									minSize: { width: 0, height: 0 },
									maxSize: { width: 0, height: 0 },
									scale: { x: 1, y: 1 },
									skew: { x: 0, y: 0 },
									visible: true,
									touchable: true,
									grayed: false,
									alpha: 1,
									rotation: 0,
									tooltips: '',
									blendMode: 'normal',
									filter: '',
									filterData: '',
									customData: '',
									relations: [],
									gears: [],
									group: '',
									text: 'Title',
									font: '',
									fontSize: 18,
									color: '#ffffff',
								},
							],
							controllers: [],
							transitions: [],
						},
					},
				],
			},
		],
	};
}
