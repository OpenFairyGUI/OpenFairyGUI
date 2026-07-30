import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UamProject } from '@openfairygui/core';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = path.join(PACKAGE_ROOT, 'test', 'fixtures');

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
				resources: [
					{
						kind: 'image',
						id: 'img001',
						name: 'background.png',
						path: '/images',
						exported: true,
						branch: '',
						branchItemIds: [],
						fileName: 'background.png',
						dimensions: { width: 320, height: 180 },
						metadata: { textureSetMode: 'atlas' },
					},
					{
						kind: 'component',
						id: 'cmp001',
						name: 'MainView',
						path: '/',
						exported: true,
						branch: '',
						branchItemIds: [],
						component: {
							size: { width: 320, height: 180 },
							customData: '',
							displayList: [
								{
									kind: 'image',
									id: 'n0',
									name: 'bg',
									position: { x: 0, y: 0 },
									size: { width: 320, height: 180 },
									visible: true,
									touchable: true,
									grayed: false,
									alpha: 1,
									rotation: 0,
									customData: '',
									relations: [],
									gears: [],
									resource: { resourceId: 'img001' },
								},
								{
									kind: 'text',
									id: 'n1',
									name: 'title',
									position: { x: 16, y: 18 },
									size: { width: 180, height: 32 },
									visible: true,
									touchable: true,
									grayed: false,
									alpha: 1,
									rotation: 0,
									customData: '',
									relations: [],
									gears: [],
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
