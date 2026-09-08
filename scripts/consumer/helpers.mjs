import assert from 'node:assert/strict';
import { accessSync, constants, existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
export const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function contained(parent, file) {
	const relative = path.relative(realpathSync(parent), realpathSync(file));
	assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `Path outside consumer package: ${file}`);
}

export function exportFiles(directory, manifest) {
	function visit(value) {
		if (typeof value === 'string') {
			assert(value.startsWith('./dist/'), `Non-dist public export: ${manifest.name}: ${value}`);
			const file = path.join(directory, value);
			assert(statSync(file).isFile(), `Missing export file: ${file}`);
			contained(directory, file);
		} else {
			assert(value && !Array.isArray(value), `Unsupported export map: ${manifest.name}`);
			for (const item of Object.values(value)) visit(item);
		}
	}
	for (const value of Object.values(manifest.exports ?? {})) visit(value);
}

export function bin(name, packageName, args = []) {
	const directory = path.join(root, 'node_modules', packageName);
	const manifest = json(path.join(directory, 'package.json'));
	assert(manifest.bin?.[name], `Missing bin: ${name}`);
	const target = path.join(directory, manifest.bin[name]);
	contained(directory, target);
	assert(readFileSync(target, 'utf8').startsWith('#!/usr/bin/env node'), `Missing Node shebang: ${name}`);
	const shim = path.join(root, 'node_modules/.bin', `${name}${process.platform === 'win32' ? '.cmd' : ''}`);
	assert(existsSync(shim), `Missing installed bin shim: ${name}`);
	if (process.platform !== 'win32') { accessSync(shim, constants.X_OK); accessSync(target, constants.X_OK); }
	// Windows .cmd requires a shell; test its mapped Node bootstrap without shell interpolation.
	return process.platform === 'win32' ? [process.execPath, [target, ...args]] : [shim, args];
}

export function assertCliEnvelope(envelope, status) {
	const { getInstalledContractSnapshot } = require('@openfairygui/backend/docs');
	const { z } = createRequire(require.resolve('@openfairygui/mcp'))('zod');
	const contract = getInstalledContractSnapshot();
	assert(Object.hasOwn(contract.cli, envelope.command), `Unknown CLI command: ${envelope.command}`);
	const validated = z.fromJSONSchema({ ...contract.cli[envelope.command], $defs: contract.$defs }).safeParse(envelope);
	assert(validated.success, JSON.stringify(validated.error));
	assert.equal(envelope.success, status === 0);
}

export function snapshot(directory) {
	const result = {};
	function visit(current, prefix) {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			assert(!entry.isSymbolicLink(), 'Example output must not contain symlinks');
			const name = `${prefix}${entry.name}`;
			if (entry.isDirectory()) visit(path.join(current, entry.name), `${name}/`);
			else result[name] = readFileSync(path.join(current, entry.name)).toString('base64');
		}
	}
	visit(directory, '');
	return result;
}

