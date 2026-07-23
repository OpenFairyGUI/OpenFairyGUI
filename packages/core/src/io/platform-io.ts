import type { Document } from '../document.js';
import { ProjectReader, type FileSystem, type ProjectReadOptions } from './project-reader.js';
import { ProjectWriter, type ProjectWriteOptions } from './project-writer.js';
import { BinaryReader } from './binary-reader.js';
import { BinaryWriter, type BinaryWriterOptions } from './binary-writer.js';

/**
 * Abstract I/O base class for reading and writing FairyGUI projects.
 *
 * Platform-specific adapters provide the file system abstraction required by
 * the reader/writer.
 *
 * @category I/O
 */
export abstract class PlatformIO {
	protected abstract createFileSystem(): FileSystem;

	public async readProject(projectPath: string, options?: ProjectReadOptions): Promise<Document> {
		const fs = this.createFileSystem();
		const reader = new ProjectReader(fs);
		return reader.read(projectPath, options);
	}

	public async writeProject(doc: Document, projectPath: string, options?: ProjectWriteOptions): Promise<void> {
		const fs = this.createFileSystem();
		const writer = new ProjectWriter(fs);
		return writer.write(doc, projectPath, options);
	}

	public async readBinary(filePath: string): Promise<Document> {
		const fs = this.createFileSystem();
		const reader = new BinaryReader(fs);
		return reader.read(filePath);
	}

	public async writeBinary(doc: Document, filePath: string, options?: BinaryWriterOptions): Promise<void> {
		const fs = this.createFileSystem();
		const writer = new BinaryWriter(fs);
		return writer.write(doc, filePath, options);
	}
}
