import type { Document } from '@openfairygui/core';
import { formatPluginError, shouldAbortPluginFailure } from './plugins/types.js';
import { generatePackageCode } from './codegen-output.js';
import {
	type PublishCodeGenerationOptions, resolveCodeGenerationSettings, resolvePackageCodegenPlan, supportsCodeGenerationLane,
} from './codegen-settings.js';

export { AUTO_GENERATED_CODE_MARK } from './codegen-templates.js';
export { type CodegenMember, type CodegenReferencedComponent, type CodegenClass, buildCodegenClasses } from './codegen-model.js';
export {
	type PublishCodeGenerationOptions, type ResolvedPackageCodegenPlan,
	resolveCodeGenerationSettings, resolvePackageCodegenPlan, resolveProjectBasePath,
} from './codegen-settings.js';
export { encodeText, decodeText } from './codegen-output.js';

export async function publishCodeGeneration(doc: Document, options: PublishCodeGenerationOptions): Promise<void> {
	const logger = doc.getLogger();
	const settings = resolveCodeGenerationSettings(doc);
	if (!settings.allowGenCode) return;

	const plugins = options.plugins ?? [];
	if (plugins.length > 0) {
		let handled = false;
		for (const plugin of plugins) {
			const genCode = plugin.plugin.genCode;
			if (!genCode) continue;
			try {
				await genCode(doc, settings, options);
				handled = true;
				logger.info(`publish: Generated code using plugin "${plugin.name}"`);
			} catch (error) {
				const message = `publish: Code generation plugin "${plugin.name}" failed: ${formatPluginError(error)}`;
				if (shouldAbortPluginFailure(plugin)) throw new Error(message);
				logger.warn(message);
			}
		}
		if (handled) {
			return;
		}
	}

	for (const pkg of options.packages) {
		if (!pkg.getGenCode()) continue;

		const plan = resolvePackageCodegenPlan(pkg, settings, options, doc.getRoot().getSettings().customProperties);
		if (!plan) {
			logger.warn(`publish: Code generation skipped for package "${pkg.getName()}" because no codePath was resolved.`);
			continue;
		}

		if (!supportsCodeGenerationLane(doc, settings.codeType)) {
			logger.warn(`publish: Code generation skipped for package "${pkg.getName()}" because project/codeType is not supported yet.`);
			continue;
		}

		await generatePackageCode(doc, pkg, plan, options.fs);
		logger.info(`publish: Generated code for package "${pkg.getName()}" into ${plan.outputDir}`);
	}
}

