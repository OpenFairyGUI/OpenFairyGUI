import fs from 'node:fs/promises';
import path from 'node:path';

/** Resolve input to a .fairy file path. Accepts a directory or a .fairy file. */
export async function resolveFairyPath(input: string): Promise<string> {
	const resolved = path.resolve(input);
	const stat = await fs.stat(resolved);

	if (stat.isFile() && resolved.endsWith('.fairy')) {
		return resolved;
	}

	if (stat.isDirectory()) {
		const entries = await fs.readdir(resolved);
		const fairyFiles = entries.filter((entry) => entry.endsWith('.fairy'));
		if (fairyFiles.length === 1) {
			return path.join(resolved, fairyFiles[0]);
		}
		if (fairyFiles.length > 1) {
			throw new Error(`Multiple .fairy files found in ${resolved}: ${fairyFiles.join(', ')}. Please specify one.`);
		}
		throw new Error(`No .fairy file found in ${resolved}`);
	}

	throw new Error(`Input is not a .fairy file or directory: ${resolved}`);
}
