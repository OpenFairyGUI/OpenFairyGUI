import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PlatformIO } from './platform-io.js';
import type { FileSystem } from './file-system.js';

/**
 * Node.js I/O implementation for reading and writing FairyGUI projects.
 *
 * Usage:
 *
 * ```ts
 * import { NodeIO } from '@openfairygui/core/node';
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
				const directoryEntries = await Promise.all(entries.map(async (entry) => {
					if (entry.isDirectory()) return entry.name;
					if (!entry.isSymbolicLink()) return null;

					try {
						const stats = await fs.stat(path.join(dirPath, entry.name));
						return stats.isDirectory() ? entry.name : null;
					} catch {
						return null;
					}
				}));
				return directoryEntries.filter((entry): entry is string => entry !== null);
			},
			async exists(filePath: string): Promise<boolean> {
				try {
					await fs.access(filePath);
					return true;
				} catch {
					return false;
				}
			},
			async unlink(filePath: string): Promise<void> {
				await fs.unlink(filePath);
			},
			async rmdir(dirPath: string): Promise<void> {
				await fs.rmdir(dirPath);
			},
			join(...paths: string[]): string {
				return path.join(...paths);
			},
			dirname(filePath: string): string {
				return path.dirname(filePath);
			},
		};
	}
}
