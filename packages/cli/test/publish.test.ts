import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ProjectType } from '@openfairygui/core';
import { NodeIO } from '@openfairygui/core/node';
import test from 'ava';
import { Command } from 'commander';
import { registerPublishCommand } from '../src/commands/publish.js';

const UNITY_EDITOR_PROJECT = path.resolve('packages/test-utils/test/fixtures/FairyGUI-Editor/ui/FairyGUI-Editor.fairy');

test('publish --project-type layabox applies the Layabox output profile', async (t) => {
	const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-cli-layabox-'));

	try {
		const io = new NodeIO();
		const source = await io.readProject(UNITY_EDITOR_PROJECT);
		const sourcePublishSettings = source.getRoot().getSettings().publish;
		t.is(source.getRoot().getProjectType(), ProjectType.Unity);
		t.is(sourcePublishSettings?.fileExtension, 'bytes');
		t.is(sourcePublishSettings?.includeHighResolution, 5);
		t.true(sourcePublishSettings?.atlasSetting?.allowRotation);

		const program = new Command();
		program.exitOverride();
		registerPublishCommand(program);
		await program.parseAsync([
			'node',
			'ofgui',
			'publish',
			UNITY_EDITOR_PROJECT,
			'--output',
			outputDir,
			'--project-type',
			'layabox',
			'--packages',
			'Basic',
		]);

		const outputNames = await fs.readdir(outputDir);
		t.true(outputNames.includes('Basic.fui'));
		t.false(outputNames.includes('Basic_fui.bytes'));

		const published = await io.readBinary(path.join(outputDir, 'Basic.fui'));
		const pkg = published.getRoot().getPackage('Basic');
		t.truthy(pkg);
		t.is(
			pkg!
				.listAtlases()
				.flatMap((atlas) => atlas.listSprites())
				.filter((sprite) => sprite.getRotated()).length,
			0,
		);
		t.true(
			pkg!.listResources().some((resource) => {
				const getter = (resource as { getHighResolutionItemIds?: () => Array<string | null> })
					.getHighResolutionItemIds;
				return getter?.call(resource).some(Boolean) ?? false;
			}),
			'Layabox target rules keep configured high-resolution resources',
		);
	} finally {
		await fs.rm(outputDir, { recursive: true, force: true });
	}
});
