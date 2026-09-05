import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// In-memory build from installed packages; only these two files are served on loopback.
export async function serveBrowserExample(port = 4178) {
	const root = path.dirname(fileURLToPath(import.meta.url));
	const built = await build({ entryPoints: [path.join(root, 'main.mjs')], bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, logLevel: 'silent' });
	assert.equal(built.warnings.length, 0, JSON.stringify(built.warnings));
	const html = await readFile(path.join(root, 'index.html'));
	const server = createServer((request, response) => {
		if (request.method !== 'GET' || !['/', '/main.js', '/favicon.ico'].includes(request.url)) { response.writeHead(404).end(); return; }
		if (request.url === '/favicon.ico') { response.writeHead(204).end(); return; }
		response.setHeader('Cache-Control', 'no-store');
		response.setHeader('Content-Type', request.url === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
		response.end(request.url === '/' ? html : built.outputFiles[0].contents);
	});
	await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
	return { url: `http://127.0.0.1:${server.address().port}`, inputs: Object.keys(built.metafile.inputs), close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const host = await serveBrowserExample();
	console.log(`Open ${host.url} in a browser. Keep this terminal running; Ctrl+C stops it.`);
}
