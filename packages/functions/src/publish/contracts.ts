import type { FileSystem } from '@openfairygui/core';

/**
 * Source files required by a publish adapter.
 *
 * The host owns this filesystem: Node adapters use native paths while web
 * adapters can use File System Access, OPFS, IndexedDB, ZIP, or memory.
 */
export type PublishSourceFileSystem = Pick<FileSystem, 'readFileRaw' | 'join'>;

/**
 * Output files required by a publish adapter.
 */
export type PublishOutputFileSystem = Pick<FileSystem, 'writeFileRaw' | 'mkdir' | 'join'>;

/**
 * Full filesystem contract consumed by the capability-injected publish core.
 *
 * Read, enumeration, and delete operations are optional because individual
 * publish lanes only request them when needed.
 */
export type PublishFileSystem = PublishOutputFileSystem & {
	deleteFile?: (path: string) => Promise<void>;
	exists?: FileSystem['exists'];
	readdir?: FileSystem['readdir'];
	readFileRaw?: FileSystem['readFileRaw'];
};

export interface AtlasRasterMetadata {
	width?: number;
	height?: number;
	channels?: number;
	hasAlpha?: boolean;
	trimOffsetLeft?: number;
	trimOffsetTop?: number;
}

export interface AtlasRasterResolvedBuffer {
	data: Uint8Array;
	info: Required<Pick<AtlasRasterMetadata, 'width' | 'height' | 'channels'>> & AtlasRasterMetadata;
}

export interface AtlasRasterCompositeInput {
	input: Uint8Array;
	left: number;
	top: number;
}

export type AtlasRasterInput =
	| string
	| Uint8Array
	| {
			create: {
				width: number;
				height: number;
				channels: 4;
				background: { r: number; g: number; b: number; alpha: number };
			};
	  };

/**
 * Host-provided raster pipeline used by atlas packing.
 *
 * Sharp and the browser Canvas adapter both satisfy this contract.
 */
export interface AtlasRasterPipeline {
	ensureAlpha(): AtlasRasterPipeline;
	removeAlpha(): AtlasRasterPipeline;
	extractChannel(channel: 'alpha'): AtlasRasterPipeline;
	joinChannel(images: Uint8Array[]): AtlasRasterPipeline;
	resize(options: { width: number; height: number; fit?: 'fill' }): AtlasRasterPipeline;
	raw(): AtlasRasterPipeline;
	extract(options: { left: number; top: number; width: number; height: number }): AtlasRasterPipeline;
	png(): AtlasRasterPipeline;
	rotate(angle: number): AtlasRasterPipeline;
	composite(inputs: AtlasRasterCompositeInput[]): AtlasRasterPipeline;
	metadata(): Promise<AtlasRasterMetadata>;
	toBuffer(options: { resolveWithObject: true }): Promise<AtlasRasterResolvedBuffer>;
	toBuffer(options?: { resolveWithObject?: false }): Promise<Uint8Array>;
	toFile(path: string): Promise<unknown>;
}

export type AtlasRasterBackend = (input: AtlasRasterInput) => AtlasRasterPipeline;
