import { type Document, type ILogger, ProjectType } from '@openfairygui/core';
import type { AtlasOptions } from '../../atlas.js';
import { publish } from '../../publish.js';
import type {
	PublishFileSystem,
	PublishOutputFileSystem,
	PublishSourceFileSystem,
} from '../../publish/contracts.js';
import { assertBrowserImageSupport, createBrowserImageEncoder } from './raster.js';

export type BrowserPublishProjectType = 'layabox';

export type BrowserPublishAtlasOptions = Pick<
	AtlasOptions,
	| 'maxSize'
	| 'fast'
	| 'allowRotation'
	| 'padding'
	| 'powerOfTwo'
	| 'square'
	| 'multiPage'
	| 'trimImage'
	| 'extractAlpha'
>;

export type BrowserPublishSourceFileSystem = PublishSourceFileSystem;

export type BrowserPublishOutputFileSystem = PublishOutputFileSystem;

export interface BrowserPublishOptions {
	document: Document;
	sourceFileSystem: BrowserPublishSourceFileSystem;
	outputFileSystem: BrowserPublishOutputFileSystem;
	projectType: BrowserPublishProjectType;
	output: string;
	compressed?: boolean;
	packages?: string[];
	branch?: string;
	atlas?: BrowserPublishAtlasOptions;
}

export interface BrowserPublishDiagnostic {
	level: 'debug' | 'info' | 'warning' | 'error';
	message: string;
}

export interface BrowserPublishedFile {
	path: string;
	size: number;
}

export interface BrowserPublishResult {
	success: boolean;
	files: BrowserPublishedFile[];
	diagnostics: BrowserPublishDiagnostic[];
}

function createTrackingFileSystem(
	fileSystem: BrowserPublishOutputFileSystem,
	files: Map<string, number>,
): PublishFileSystem {
	const tracked: PublishFileSystem = {
		join: (...paths) => fileSystem.join(...paths),
		mkdir: (path) => fileSystem.mkdir(path),
		writeFileRaw: async (path, data) => {
			await fileSystem.writeFileRaw(path, data);
			files.set(path, data.byteLength);
		},
	};
	return tracked;
}

function createDiagnosticLogger(logger: ILogger, diagnostics: BrowserPublishDiagnostic[]): ILogger {
	return {
		debug(message) {
			diagnostics.push({ level: 'debug', message });
			logger.debug(message);
		},
		info(message) {
			diagnostics.push({ level: 'info', message });
			logger.info(message);
		},
		warn(message) {
			diagnostics.push({ level: 'warning', message });
			logger.warn(message);
		},
		error(message) {
			diagnostics.push({ level: 'error', message });
			logger.error(message);
		},
	};
}

function toResult(
	success: boolean,
	files: Map<string, number>,
	diagnostics: BrowserPublishDiagnostic[],
): BrowserPublishResult {
	return {
		success,
		files: [...files].map(([path, size]) => ({ path, size })),
		diagnostics,
	};
}

/**
 * Publish a loaded FairyGUI project to browser-provided storage.
 *
 * The adapter uses browser Canvas APIs for atlas composition, writes only through
 * the supplied output filesystem, and intentionally skips Node publish plugins.
 */
export async function publishBrowser(options: BrowserPublishOptions): Promise<BrowserPublishResult> {
	const files = new Map<string, number>();
	const diagnostics: BrowserPublishDiagnostic[] = [];
	const root = options.document.getRoot();
	const previousProjectType = root.getProjectType();
	const previousLogger = options.document.getLogger();
	options.document.setLogger(createDiagnosticLogger(previousLogger, diagnostics));

	try {
		if (options.projectType !== 'layabox') {
			throw new Error(`publishBrowser: unsupported project type "${String(options.projectType)}".`);
		}
		assertBrowserImageSupport();
		root.setProjectType(ProjectType.LayaBox);
		const outputFileSystem = createTrackingFileSystem(options.outputFileSystem, files);
		const sourceAssetsPath = options.sourceFileSystem.join(options.document.getProjectDir(), 'assets');

		await options.document.transform(
			publish({
				output: options.output,
				compressed: options.compressed,
				fileExtension: 'fui',
				packages: options.packages,
				branch: options.branch,
				basePath: sourceAssetsPath,
				encoder: createBrowserImageEncoder(options.sourceFileSystem, outputFileSystem),
				atlas: {
					...options.atlas,
					readFileRaw: (path) => options.sourceFileSystem.readFileRaw(path),
				},
				fs: outputFileSystem,
				plugins: [],
				codeGeneration: false,
			}),
		);

		return toResult(true, files, diagnostics);
	} catch (error) {
		diagnostics.push({
			level: 'error',
			message: error instanceof Error ? error.message : String(error),
		});
		return toResult(false, files, diagnostics);
	} finally {
		root.setProjectType(previousProjectType);
		options.document.setLogger(previousLogger);
	}
}
