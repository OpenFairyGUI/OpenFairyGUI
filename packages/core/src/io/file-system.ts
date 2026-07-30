/**
 * Platform-neutral project filesystem contract shared by project and binary I/O.
 *
 * Host-specific adapters live in node-io.ts and web-io.ts.
 */
export interface FileSystem {
	readFile(path: string): Promise<string>;
	readFileRaw(path: string): Promise<Uint8Array>;
	writeFile(path: string, content: string): Promise<void>;
	writeFileRaw(path: string, data: Uint8Array): Promise<void>;
	mkdir(path: string): Promise<void>;
	readdir(path: string): Promise<string[]>;
	exists(path: string): Promise<boolean>;
	join(...paths: string[]): string;
	dirname(path: string): string;
	/** Removes a file when the adapter supports project-source cleanup. */
	unlink?(path: string): Promise<void>;
}
