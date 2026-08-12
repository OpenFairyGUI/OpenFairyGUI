import { readdir, rm } from 'node:fs/promises';

const target = process.argv[2];
if (target !== 'dist' && target !== 'node_modules') {
	throw new Error('Usage: node scripts/clean.mjs <dist|node_modules>');
}
for (const entry of await readdir('packages', { withFileTypes: true })) {
	if (entry.isDirectory()) await rm(`packages/${entry.name}/${target}`, { recursive: true, force: true });
}
