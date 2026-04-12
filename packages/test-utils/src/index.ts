import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

export function getFixtureProjectPath(name: string): string {
	return getFixtureProject(name).fairyPath;
}

export function getDefaultFixtureProject(): FixtureProject | null {
	const projects = listFixtureProjects();
	return projects[0] ?? null;
}
