export type { FileSystem } from './io/file-system.js';
export type {
	ProjectBranchDirectory,
	ProjectImageWriteHints,
	ProjectReadOptions,
	ProjectResourceFolder,
	ProjectSourceFile,
	ProjectWriteOptions,
} from './io/project-io-contracts.js';
export { ProjectReader } from './io/project-reader.js';
export { ProjectWriter } from './io/project-writer.js';

export { BinaryReader, type BinaryReadLimits, type BinaryReaderOptions } from './io/binary-reader.js';
export { BinaryWriter, type BinaryWriterOptions, type BinaryPackageEncodingContext } from './io/binary-writer.js';
export { ProjectIOError, BinaryFormatError } from './io/errors.js';
