import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	NodeIO,
	type UamProject,
	writeProjectFromUam,
} from '@openfairygui/core';
import {
	type BackendFileSystem,
	type BackendJobSnapshot,
	type BackendJobStatus,
	type BackendRuntime,
} from '../src/index.js';
import {
	createNodeBackendFileSystem,
	createNodeBackendRuntime,
} from '../src/node.js';

export function createBackendFixtureProject(): UamProject {
	return {
		projectId: 'backend-p0',
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

export async function createTempBackendProject() {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-backend-p0-'));
	const fairyPath = path.join(tmpDir, 'BackendProject.fairy');
	const io = new NodeIO();
	await writeProjectFromUam(io, createBackendFixtureProject(), fairyPath);

	return {
		rootDir: tmpDir,
		fairyPath,
		async cleanup(): Promise<void> {
			await fs.rm(tmpDir, { recursive: true, force: true });
		},
	};
}

export function createFailingFileSystem(
	shouldFail: (filePath: string) => boolean,
): BackendFileSystem {
	const base = createNodeBackendFileSystem();
	return {
		...base,
		async writeFile(filePath: string, content: string): Promise<void> {
			if (shouldFail(filePath)) {
				throw new Error(`Injected write failure for ${filePath}`);
			}
			await base.writeFile(filePath, content);
		},
		async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			if (shouldFail(filePath)) {
				throw new Error(`Injected raw write failure for ${filePath}`);
			}
			await base.writeFileRaw(filePath, data);
		},
	};
}

export function createBackendRuntime(options: { fileSystem?: BackendFileSystem } = {}): BackendRuntime {
	return createNodeBackendRuntime(options);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export async function waitForBackendJobStatus(
	runtime: BackendRuntime,
	sessionId: string,
	jobId: string,
	status: BackendJobStatus,
): Promise<BackendJobSnapshot> {
	for (let attempt = 0; attempt < 30; attempt += 1) {
		const job = runtime.getJob({ sessionId, jobId });
		if (job.ok && job.data.status === status) return job.data;
		await sleep(10);
	}
	const finalJob = runtime.getJob({ sessionId, jobId });
	if (finalJob.ok) return finalJob.data;
	throw new Error(`Job did not become ${status}: ${jobId}`);
}
