/** A malformed or unsupported source project or project I/O operation. */
export class ProjectIOError extends Error {
	readonly code = 'project_io_error';
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'ProjectIOError';
	}
}

/** A malformed or unsupported binary package or binary encoding operation. */
export class BinaryFormatError extends Error {
	readonly code = 'binary_format_error';
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'BinaryFormatError';
	}
}
