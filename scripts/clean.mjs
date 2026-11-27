import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './repo-utils.mjs';

const target = process.argv[2];
if (target !== 'dist' && target !== 'node_modules') {
	throw new Error('Usage: node scripts/clean.mjs <dist|node_modules>');
}
const packagesDir = path.join(ROOT, 'packages');
for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
	if (entry.isDirectory()) await rm(path.join(packagesDir, entry.name, target), { recursive: true, force: true });
}
if (target === 'node_modules') {
	await rm(path.join(ROOT, 'node_modules'), { recursive: true, force: true });
}
