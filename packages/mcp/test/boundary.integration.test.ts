import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'ava';

async function directoryExists(directory: string): Promise<boolean> {
	try {
		return (await fs.stat(directory)).isDirectory();
	} catch {
		return false;
	}
}

async function readSourceFiles(directory: string): Promise<Array<{ path: string; text: string }>> {
	const entries = await fs.readdir(directory, { withFileTypes: true });
	const files: Array<{ path: string; text: string }> = [];

	for (const entry of entries) {
		const fullPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...await readSourceFiles(fullPath));
		} else if (entry.isFile() && entry.name.endsWith('.ts')) {
			files.push({ path: fullPath, text: await fs.readFile(fullPath, 'utf8') });
		}
	}

	return files;
}

test('MCP P1 keeps roots as docs-only and does not import backend path policy internals', async (t) => {
	const sourceDirectory = await directoryExists(path.resolve('src'))
		? path.resolve('src')
		: path.resolve('packages/mcp/src');
	const files = await readSourceFiles(sourceDirectory);
	const source = files.map((file) => `// ${file.path}\n${file.text}`).join('\n');

	t.false(source.includes('path-policy'));
	t.false(source.includes('createRuntimePathPolicy'));
	t.false(source.includes('listRoots'));
	t.false(source.includes('roots/list'));
	t.false(source.includes('@modelcontextprotocol/sdk/client'));
});
