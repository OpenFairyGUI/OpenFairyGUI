import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeProjectFromUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { createMinimalUamProject } from '@openfairygui/test-utils';
import type { BackendFileSystem, BackendJobSnapshot, BackendJobStatus, BackendRuntime } from '../src/index.js';
import { createNodeBackendFileSystem, createNodeBackendRuntime } from '../src/node.js';

export function createBackendFixtureProject() {
	return createMinimalUamProject('backend-p0');
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
			await fs.rm(path.join(path.dirname(tmpDir), `.${path.basename(tmpDir)}.openfairygui.backend.lock`), { force: true });
			await fs.rm(tmpDir, { recursive: true, force: true });
		},
	};
}

export function createFailingFileSystem(shouldFail: (filePath: string) => boolean): BackendFileSystem {
	const base = createNodeBackendFileSystem();
	const injectFailure = (fileSystem: BackendFileSystem): BackendFileSystem => ({
		...fileSystem,
		runProjectWriteTransaction: undefined,
		async writeFile(filePath: string, content: string): Promise<void> {
			if (shouldFail(filePath)) throw new Error(`Injected write failure for ${filePath}`);
			await fileSystem.writeFile(filePath, content);
		},
		async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
			if (shouldFail(filePath)) throw new Error(`Injected raw write failure for ${filePath}`);
			await fileSystem.writeFileRaw(filePath, data);
		},
	});
	return {
		...base,
		async runProjectWriteTransaction(projectRoot, write) {
			await base.runProjectWriteTransaction!(projectRoot, (staged) => write(injectFailure(staged)));
		},
	};
}

export function createBackendRuntime(options: {
	fileSystem?: BackendFileSystem;
	allowedProjectRoots?: readonly string[];
} = {}): BackendRuntime {
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
