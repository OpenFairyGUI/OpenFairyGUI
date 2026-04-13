import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PlatformIO } from './platform-io.js';
import type { FileSystem } from './project-reader.js';
import {
	PublishedProjectRestorer,
	type RestoreImageCropper,
	type RestoreImageExtractor,
	type RestorePublishedProjectResult,
} from './published-project-restorer.js';

export interface NodeRestorePublishedProjectOptions {
	packages?: string[];
	force?: boolean;
	cropImage?: RestoreImageCropper;
	extractImage?: RestoreImageExtractor;
}

function isPublishedBinaryFile(fileName: string): boolean {
	return /_fui\.bytes$/i.test(fileName) || /\.fui$/i.test(fileName);
}

function inferPackageName(fileName: string): string {
	if (/_fui\.bytes$/i.test(fileName)) return fileName.replace(/_fui\.bytes$/i, '');
	return fileName.replace(/\.fui$/i, '');
}

/**
 * Node.js I/O implementation for reading and writing FairyGUI projects.
 *
 * Usage:
 *
 * ```ts
 * import { NodeIO } from '@openfairygui/core';
 *
 * const io = new NodeIO();
 * const doc = await io.readProject('./path/to/project.fairy');
 * await io.writeProject(doc, './path/to/output.fairy');
 * const doc2 = await io.readBinary('./path/to/package_fui.bytes');
 * ```
 *
 * @category I/O
 */
export class NodeIO extends PlatformIO {
	public async restorePublishedProject(
		inputDir: string,
		output: string,
		options: NodeRestorePublishedProjectOptions = {},
	): Promise<RestorePublishedProjectResult> {
		const sourceDir = path.resolve(inputDir);
		const outputPath = path.resolve(output);
		const outputProjectPath = outputPath.toLowerCase().endsWith('.fairy')
			? outputPath
			: path.join(outputPath, `${path.basename(outputPath)}.fairy`);
		const outputDir = path.dirname(outputProjectPath);

		await this._prepareRestoreOutputDir(sourceDir, outputDir, options.force === true);

		const packageFilter = options.packages?.length ? new Set(options.packages) : null;
		const entries = await fs.readdir(sourceDir, { withFileTypes: true });
		const binaryPaths = entries
			.filter((entry) => entry.isFile() && isPublishedBinaryFile(entry.name))
			.filter((entry) => !packageFilter || packageFilter.has(inferPackageName(entry.name)))
			.map((entry) => path.join(sourceDir, entry.name))
			.sort((a, b) => a.localeCompare(b));

		if (binaryPaths.length === 0) {
			throw new Error(`No FairyGUI published binary files found in ${sourceDir}.`);
		}

		const restorer = new PublishedProjectRestorer(this.createFileSystem());
		return restorer.restore({
			binaryPaths,
			sourceDir,
			outputProjectPath,
			cropImage: options.cropImage,
			extractImage: options.extractImage,
		});
	}

	protected createFileSystem(): FileSystem {
		return {
			async readFile(filePath: string): Promise<string> {
				return fs.readFile(filePath, 'utf-8');
			},
			async readFileRaw(filePath: string): Promise<Uint8Array> {
				const buf = await fs.readFile(filePath);
				return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
			},
			async writeFile(filePath: string, content: string): Promise<void> {
				await fs.writeFile(filePath, content, 'utf-8');
			},
			async writeFileRaw(filePath: string, data: Uint8Array): Promise<void> {
				await fs.writeFile(filePath, data);
			},
			async mkdir(dirPath: string): Promise<void> {
				await fs.mkdir(dirPath, { recursive: true });
			},
			async readdir(dirPath: string): Promise<string[]> {
				const entries = await fs.readdir(dirPath, { withFileTypes: true });
				return entries.filter((e) => e.isDirectory()).map((e) => e.name);
			},
			async exists(filePath: string): Promise<boolean> {
				try {
					await fs.access(filePath);
					return true;
				} catch {
					return false;
				}
			},
			join(...paths: string[]): string {
				return path.join(...paths);
			},
			dirname(filePath: string): string {
				return path.dirname(filePath);
			},
		};
	}

	private async _prepareRestoreOutputDir(sourceDir: string, outputDir: string, force: boolean): Promise<void> {
		if (path.resolve(sourceDir) === path.resolve(outputDir)) {
			throw new Error('Restore output directory must be different from the published input directory.');
		}

		const stat = await fs.stat(outputDir).catch(() => null);
		if (stat?.isFile()) {
			throw new Error(`Restore output path is a file: ${outputDir}`);
		}

		if (stat?.isDirectory()) {
			const entries = await fs.readdir(outputDir);
			if (entries.length > 0) {
				if (!force) {
					throw new Error(`Restore output directory is not empty: ${outputDir}. Use --force to overwrite it.`);
				}
				await fs.rm(outputDir, { recursive: true, force: true });
			}
		}

		await fs.mkdir(outputDir, { recursive: true });
	}
}
