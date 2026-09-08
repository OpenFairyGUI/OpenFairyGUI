import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import { NodeIO } from '@openfairygui/core/node';
import { createBackendRuntime } from './helpers.js';

test('editing and reopening source XML preserves gear timing and component controller overrides', async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-xml-fidelity-'));
	t.teardown(() => fs.rm(directory, { recursive: true, force: true }));
	const fairyPath = path.join(directory, 'Project.fairy');
	const assets = path.join(directory, 'assets', 'Main');
	await fs.mkdir(assets, { recursive: true });
	await fs.writeFile(fairyPath, '<projectDescription id="timing" type="Unity" version="3.0"/>');
	await fs.writeFile(path.join(assets, 'package.xml'), '<packageDescription id="pkg001"><resources><component id="host" name="Host.xml" path="/" exported="true"/><component id="page" name="Page.xml" path="/"/></resources></packageDescription>');
	await fs.writeFile(path.join(assets, 'Page.xml'), '<component size="100,100"><controller name="style" pages="0,Idle,1,Active" exported="true"/></component>');
	// Source XML is independent of our writer, including saved timing while tweening is disabled.
	await fs.writeFile(path.join(assets, 'Host.xml'), `<component size="100,100">
		<controller name="state" pages="0,Idle,1,Active"/>
		<displayList>
			<text id="title" name="title" xy="0,0" size="80,30" text="Title">
				<gearLook controller="state" pages="0,1" values="1,0,0,1|0.5,0,0,1" tween="true" delay="0.75"/>
				<gearSize controller="state" pages="0,1" values="80,30,1,1|90,40,1,1" tween="false" ease="Linear" duration="0.6" delay="0.25"/>
			</text>
			<component id="instance" name="instance" src="page" xy="0,0" size="100,100" controller="style,1"/>
		</displayList>
	</component>`);
	const runtime = createBackendRuntime({ allowedProjectRoots: [directory] });
	const opened = await runtime.openSession({ projectPath: fairyPath });
	assert(opened.ok);
	const sessionId = opened.data.sessionId;
	try {
		t.is(opened.data.uamFidelity, 'full');
		const transaction = { sessionId, expectedRevision: 0, operations: [{
			kind: 'setDisplayNodeProps' as const,
			selector: { packageId: 'pkg001', componentResourceId: 'host', displayNodeId: 'title' },
			props: { position: { x: 20, y: 30 } },
		}] };
		t.true((await runtime.preflightTransaction(transaction)).ok);
		t.true((await runtime.applyTransaction(transaction)).ok);
		const saved = await runtime.saveSession({ sessionId, expectedRevision: 1 });
		assert(saved.ok); t.false(saved.data.dirty);
	} finally { await runtime.closeSession({ sessionId }); }
	const doc = await new NodeIO().readProject(fairyPath);
	const host = doc.getRoot().getPackage('Main')!.getComponent('Host')!;
	const title = host.getChildById('title') as ReturnType<typeof doc.createGTextField>;
	t.deepEqual([title.getX(), title.getY()], [20, 30]);
	t.deepEqual(title.listGears().sort((a, b) => a.getGearType() - b.getGearType()).map((gear) => [gear.getTween(), gear.getTweenDelay(), gear.getTweenDuration(), gear.getEaseType()]), [
		[false, 0.25, 0.6, 0], [true, 0.75, 0.3, 5],
	]);
	const instance = host.getChildById('instance');
	assert(instance && 'getControllerOverrides' in instance);
	t.is((instance as ReturnType<typeof doc.createGComponent>).getControllerOverrides(), 'style,1');
	const reopened = await runtime.openSession({ projectPath: fairyPath });
	assert(reopened.ok); t.is(reopened.data.uamFidelity, 'full');
	await runtime.closeSession({ sessionId: reopened.data.sessionId });
});
