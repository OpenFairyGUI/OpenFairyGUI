import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { JsonSchemaType, JsonSchemaValidator, jsonSchemaValidator } from '@modelcontextprotocol/sdk/validation';
import { writeProjectFromUam } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import { createMinimalUamProject } from '@openfairygui/test-utils';

// The SDK's default validator, loaded untyped: its ajv-provider declarations do not compile under this
// repository's settings.
const ajvProvider: string = '@modelcontextprotocol/sdk/validation/ajv';
const { AjvJsonSchemaValidator } = (await import(ajvProvider)) as {
	AjvJsonSchemaValidator: new () => jsonSchemaValidator;
};
const ajvValidator = new AjvJsonSchemaValidator();
const compiledOutputValidators = new Map<string, JsonSchemaValidator<unknown>>();

/**
 * The SDK client compiles every advertised output schema again on each tools/list, about a second of synchronous CPU
 * for this server. Clients in one test worker share compiled validators so concurrent tests do not stall each other.
 */
const sharedOutputSchemaValidator: jsonSchemaValidator = {
	getValidator<T>(schema: JsonSchemaType): JsonSchemaValidator<T> {
		const key = JSON.stringify(schema);
		let validator = compiledOutputValidators.get(key);
		if (!validator) compiledOutputValidators.set(key, (validator = ajvValidator.getValidator(schema)));
		return validator as JsonSchemaValidator<T>;
	},
};

/** An SDK client that still validates tool output against the advertised schemas after listTools. */
export function createMcpTestClient(name: string): Client {
	return new Client({ name, version: 'test' }, { jsonSchemaValidator: sharedOutputSchemaValidator });
}

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
