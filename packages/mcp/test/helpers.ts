import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type UamProject, writeProjectFromUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';

export function createMcpFixtureProject(): UamProject {
	return {
		projectId: 'mcp-p0',
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

export async function createTempMcpProject() {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-mcp-p0-'));
	const fairyPath = path.join(tmpDir, 'McpProject.fairy');
	const io = new NodeIO();
	await writeProjectFromUam(io, createMcpFixtureProject(), fairyPath);

	return {
		rootDir: tmpDir,
		fairyPath,
		async cleanup(): Promise<void> {
			await fs.rm(tmpDir, { recursive: true, force: true });
		},
	};
}
