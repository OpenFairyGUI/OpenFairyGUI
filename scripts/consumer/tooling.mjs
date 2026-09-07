import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { contained, json } from './runtime.mjs';

const root = process.cwd();
const manifests = json('expected.json');
const entries = manifests.flatMap((manifest) => Object.entries(manifest.exports ?? {}).map(([subpath, conditions]) => ({
	specifier: manifest.name + (subpath === '.' ? '' : subpath.slice(1)), conditions,
})));

for (const [extension, selected] of [['mts', entries], ['cts', entries.filter((entry) => entry.conditions.require)]]) {
	assert(selected.length > 0);
	writeFileSync(`entries.${extension}`, selected.map(({ specifier }, index) => `import * as entry${index} from '${specifier}'; void entry${index};`).join('\n'));
}
writeFileSync('publish-result.mts', `import { publishNode, type PublishNodeOptions, type PublishNodeResult } from '@openfairygui/functions/node';
async function publish(options: PublishNodeOptions): Promise<PublishNodeResult> {
  const result = await publishNode(options);
  for (const file of result.files) { const path: string = file.path; const size: number = file.size; void path; void size; }
  return result;
}
void publish;\n`);
writeFileSync('tsconfig.json', JSON.stringify({
	compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: false, noEmit: true, types: ['node'], lib: ['ES2022', 'DOM', 'DOM.Iterable'] },
	files: ['entries.mts', 'entries.cts', 'publish-result.mts'],
}));
// The repository compiler is an npm alias; use its declared binary, not an assumed bin/tsc path.
const compilerBin = Object.values(json('node_modules/typescript/package.json').bin)[0];
assert(compilerBin, 'Installed compiler must declare a binary');
execFileSync(process.execPath, [path.join('node_modules/typescript', compilerBin), '-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit', timeout: 60_000 });

const browser = entries.filter(({ specifier }) => !specifier.startsWith('@openfairygui/mcp') && !specifier.endsWith('/node'));
const worker = browser.find(({ specifier }) => specifier.endsWith('/image-validation-worker'));
assert(worker, 'Worker export must be checked');
const main = browser.filter((entry) => entry !== worker);
writeFileSync('browser.mjs', main.map(({ specifier }, index) => `import * as entry${index} from '${specifier}'; console.log(Object.keys(entry${index}));`).join('\n'));
writeFileSync('worker.mjs', `import '${worker.specifier}';\n`);
for (const entry of ['browser.mjs', 'worker.mjs']) {
	const result = await build({ entryPoints: [entry], absWorkingDir: root, bundle: true, platform: 'browser', format: 'esm', treeShaking: false, write: false, metafile: true, logLevel: 'silent' });
	assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings));
	assert(result.outputFiles[0].contents.length > 0);
	if (entry === 'worker.mjs') assert.match(result.outputFiles[0].text, /addEventListener\(["']message["']/);
	for (const file of Object.keys(result.metafile.inputs)) contained(root, path.resolve(root, file));
}
console.log(`[consumer] Tooling PASS: strict NodeNext .mts/.cts declarations; ${browser.length} browser/Worker exports bundled without Node externals`);
