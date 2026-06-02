import type { Document } from '@openfairygui/core';
import type { PublishCodeGenerationOptions } from '../codegen.js';
import type { PublishOptions } from '../publish.js';
import type { CliCodeGenerationSettings } from '../shared-types.js';

export type MaybePromise<T> = T | Promise<T>;

export interface PluginManifest {
	name: string;
	displayName?: string;
	description?: string;
	version?: string;
	author?: {
		name?: string;
	};
	icon?: string;
	main: string;
}

export interface ICodeWriterConfig {
	blockStart?: string;
	blockEnd?: string;
	blockFromNewLine?: boolean;
	usingTabs?: boolean;
	endOfLine?: string;
	fileMark?: string;
}

export interface CodeWriter {
	writeMark(): void;
	writeln(fmt?: string, ...args: any[]): CodeWriter;
	startBlock(): CodeWriter;
	endBlock(): CodeWriter;
	incIndent(): CodeWriter;
	decIndent(): CodeWriter;
	reset(): void;
	toString(): string;
	save(filePath: string): void;
}

export interface Plugin {
	genCode?: (doc: Document, settings: Required<CliCodeGenerationSettings>, options: PublishCodeGenerationOptions) => MaybePromise<void>;
	onPublishStart?: (doc: Document, options: PublishOptions) => MaybePromise<void>;
	onPublishEnd?: (doc: Document, options: PublishOptions) => MaybePromise<void>;
}

export type PluginModule = Plugin & { default?: Plugin };
