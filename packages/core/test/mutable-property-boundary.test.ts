import test from 'ava';
import { Document } from '../src/index.js';

test('settings and extras are detached at public getter and setter boundaries', (t) => {
	const document = new Document();
	const root = document.getRoot();
	const settings = { publish: { atlasSetting: { maxSize: 1024 } } };
	const extras = { nested: { value: 1 } };
	root.setSettings(settings).setExtras(extras);

	settings.publish.atlasSetting.maxSize = 2048;
	extras.nested.value = 2;
	t.is(root.getSettings().publish?.atlasSetting?.maxSize, 1024);
	t.deepEqual(root.getExtras(), { nested: { value: 1 } });

	const returnedSettings = root.getSettings();
	const returnedExtras = root.getExtras() as { nested: { value: number } };
	returnedSettings.publish!.atlasSetting!.maxSize = 4096;
	returnedExtras.nested.value = 3;
	t.is(root.getSettings().publish?.atlasSetting?.maxSize, 1024);
	t.deepEqual(root.getExtras(), { nested: { value: 1 } });
});
