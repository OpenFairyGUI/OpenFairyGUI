import type { Document, Package } from '@openfairygui/core';
import { AUTO_GENERATED_CODE_MARK } from './codegen-templates.js';
import { buildCodegenClasses } from './codegen-model.js';
import { renderCodegenFiles, resolveFguiTypescriptVariant } from './codegen-render.js';
import type { ResolvedPackageCodegenPlan } from './codegen-settings.js';
import type { PublishFileSystem } from './publish/contracts.js';

export async function generatePackageCode(
	doc: Document, pkg: Package, plan: ResolvedPackageCodegenPlan, fs: PublishFileSystem,
): Promise<void> {
	const variant = resolveFguiTypescriptVariant(doc);
	const packageDir = fs.join(plan.outputDir, plan.packageFolderName);
	await fs.mkdir(plan.outputDir);
	await fs.mkdir(packageDir);
	await cleanupGeneratedFiles(packageDir, fs, variant ? '.ts' : '.cs');
	const classes = buildCodegenClasses(doc, pkg, plan);
	for (const file of renderCodegenFiles(classes, plan, variant)) {
		await fs.writeFileRaw(fs.join(packageDir, file.name), encodeText(file.content));
	}
}

async function cleanupGeneratedFiles(directory: string, fs: PublishFileSystem, extension = '.cs'): Promise<void> {
	if (!fs.readdir || !fs.readFileRaw || !fs.deleteFile) return;

	let entries: string[];
	try {
		entries = await fs.readdir(directory);
	} catch {
		return;
	}

	for (const entry of entries) {
		if (!entry.toLowerCase().endsWith(extension)) continue;
		const filePath = fs.join(directory, entry);
		try {
			const bytes = await fs.readFileRaw(filePath);
			const content = decodeText(bytes);
			if (content.startsWith(AUTO_GENERATED_CODE_MARK)) {
				await fs.deleteFile(filePath);
			}
		} catch {
			// Skip unreadable entries and nested paths; cleanup is best-effort and package-scoped.
		}
	}
}

export function encodeText(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

export function decodeText(value: Uint8Array): string {
	return new TextDecoder().decode(value);
}
