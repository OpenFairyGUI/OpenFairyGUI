import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { serveBrowserExample } from './examples/browser-project-storage/serve.mjs';
import { contained } from './helpers.mjs';

const host = await serveBrowserExample(0);
let browser;
const errors = [];
const checks = [];
try {
	for (const input of host.inputs) contained(process.cwd(), path.resolve(input));
	browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({ viewport: { width: 1000, height: 850 } });
	context.on('page', (page) => {
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
		page.on('request', (request) => { if (!request.url().startsWith(`${host.url}/`)) errors.push(`Unexpected request: ${request.url()}`); });
	});
	const page = await context.newPage();
	await page.goto(host.url);
	await page.getByRole('button', { name: 'Open example', exact: true }).click();
	await page.waitForFunction(() => globalThis.example?.sessionId);
	const initial = await page.evaluate(() => example.read());
	assert.equal(initial.entity.properties.text, 'Hello browser');
	checks.push('real OPFS creation, public WebIO read, exact entity query');
	async function snapshot(tab) {
		return tab.evaluate(async () => {
			const files = {};
			async function visit(directory, prefix = '') {
				for await (const [name, handle] of directory.entries()) {
					const path = `${prefix}${name}`;
					if (handle.kind === 'directory') { files[`${path}/`] = null; await visit(handle, `${path}/`); }
					else files[path] = Array.from(new Uint8Array(await (await handle.getFile()).arrayBuffer()));
				}
			}
			await visit(await navigator.storage.getDirectory());
			return files;
		});
	}
	const before = await snapshot(page);
	const transaction = { sessionId: await page.evaluate(() => example.sessionId), expectedRevision: initial.revision, operations: [{ kind: 'setDisplayNodeProps', selector: initial.selector, props: { text: 'Saved in Chromium' } }] };
	const preview = await page.evaluate((input) => example.runtime.preflightTransaction(input), transaction);
	assert(preview.ok, JSON.stringify(preview));
	assert.equal(preview.data.projectedRevision, initial.revision + 1);
	assert.deepEqual(preview.data.impact.entities.find((entry) => entry.target.kind === 'displayNode' && entry.target.selector.displayNodeId === initial.selector.displayNodeId),
		{ target: { kind: 'displayNode', selector: initial.selector }, change: 'updated', fields: ['text'] });
	assert.deepEqual(preview.data.impact.files, [{ path: 'assets/Main/MainView.xml', kind: 'file', change: 'updated' }]);
	assert.equal(preview.data.persistence.nextAction, 'saveSession');
	assert.deepEqual(await snapshot(page), before);
	assert.deepEqual(await page.evaluate(() => example.read()), initial);
	await page.getByLabel('Title text').fill('Saved in Chromium');
	await page.getByRole('button', { name: 'Preview & apply', exact: true }).click();
	await page.waitForFunction(() => example.read().revision === 1);
	const changed = await page.evaluate(() => example.read());
	assert.equal(changed.entity.properties.text, 'Saved in Chromium');
	assert.deepEqual(await snapshot(page), before, 'Apply must not write before save');
	const stale = await page.evaluate((input) => example.runtime.applyTransaction(input), transaction);
	assert.equal(stale.error?.code, 'stale_write');
	assert.deepEqual(await page.evaluate(() => example.read()), changed);
	const denied = await page.evaluate(() => example.runtime.saveSession({ sessionId: example.sessionId, expectedRevision: 1, targetPath: '../escape' }));
	assert.equal(denied.error?.code, 'path_policy_violation');
	assert.deepEqual(await snapshot(page), before);
	assert.equal(await page.evaluate(() => example.runtime.getSession({ sessionId: example.sessionId }).data.dirty), true);
	checks.push('read-only preflight; exact edit; stale revision and path refusal preserve files and dirty state');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.waitForFunction(() => example.runtime.getSession({ sessionId: example.sessionId }).data.dirty === false);
	const saved = await snapshot(page);
	assert.deepEqual(Object.keys(saved).sort(), Object.keys(before).sort());
	const altered = Object.keys(before).filter((file) => JSON.stringify(before[file]) !== JSON.stringify(saved[file]));
	assert.equal(altered.length, 1, JSON.stringify(altered));
	assert(altered[0].endsWith('/MainView.xml'));
	assert(new TextDecoder().decode(new Uint8Array(saved[altered[0]])).includes('Saved in Chromium'));
	const validation = await page.evaluate(() => example.validate());
	assert.equal(validation.status, 'valid', JSON.stringify(validation)); assert.equal(validation.complete, true);
	const pixels = await page.evaluate(async () => {
		const image = await createImageBitmap(new Blob([await example.fileSystem.readFileRaw('openfairygui-example/assets/Main/pixel.png')], { type: 'image/png' }));
		try {
			const canvas = new OffscreenCanvas(image.width, image.height);
			const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
			return Array.from(context.getImageData(0, 0, 2, 1).data);
		} finally { image.close(); }
	});
	assert.deepEqual(pixels, [255, 0, 0, 255, 0, 0, 255, 255]);
	await page.reload();
	await page.getByRole('button', { name: 'Open example', exact: true }).click();
	await page.waitForFunction(() => globalThis.example?.sessionId);
	assert.equal((await page.evaluate(() => example.read())).entity.properties.text, 'Saved in Chromium');
	assert.deepEqual(await snapshot(page), saved);
	checks.push('save changes only target XML; PNG bytes and decoded RGBA intact; refresh reads persisted edit');
	const peer = await context.newPage();
	await peer.goto(host.url);
	await peer.getByRole('button', { name: 'Open example', exact: true }).click();
	await peer.waitForFunction(() => document.querySelector('output').textContent.startsWith('lock_conflict:'));
	assert.deepEqual(await snapshot(peer), saved);
	await page.getByRole('button', { name: 'Close session', exact: true }).click();
	await page.waitForFunction(() => !example.sessionId);
	await peer.getByRole('button', { name: 'Open example', exact: true }).click();
	await peer.waitForFunction(() => example.sessionId);
	await peer.close(); // Native Web Locks must release when the owner document terminates.
	await page.getByRole('button', { name: 'Open example', exact: true }).click();
	await page.waitForFunction(() => example.sessionId);
	assert.deepEqual(await snapshot(page), saved);
	checks.push('two real tabs: live owner blocks; explicit close and abrupt termination release Web Lock');
	await page.getByRole('button', { name: 'Validate saved files', exact: true }).click();
	await page.waitForFunction(() => document.querySelector('output').textContent.includes('"action": "validate"'));
	await page.screenshot({ path: 'browser-consumer.png', fullPage: true });
	assert.deepEqual(errors, []);
	writeFileSync('browser-evidence.json', JSON.stringify({ browser: browser.version(), checks, validation, pixels, changedFiles: altered, errors }, null, 2));
	console.log(`[consumer] Browser PASS: Chromium ${browser.version()}, ${checks.length} real storage/safety checks; browser-evidence.json and browser-consumer.png`);
} catch (error) {
	writeFileSync('browser-evidence.json', JSON.stringify({ browser: browser?.version(), checks, errors, failure: error.stack ?? String(error) }, null, 2));
	for (const [index, page] of (browser?.contexts()[0]?.pages() ?? []).entries()) {
		await page.screenshot({ path: `browser-failure-${index}.png`, fullPage: true }).catch(() => {});
	}
	throw error;
} finally {
	await browser?.close();
	await host.close();
}
