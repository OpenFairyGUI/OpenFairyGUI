import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeProjectFromUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { createMinimalUamProject } from '@openfairygui/test-utils';

export function createMcpFixtureProject() {
	return createMinimalUamProject('mcp-p0');
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
