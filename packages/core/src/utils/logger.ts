/** Verbosity levels for the logger. */
export enum Verbosity {
	SILENT = 4,
	ERROR = 3,
	WARN = 2,
	INFO = 1,
	DEBUG = 0,
}

/** Logger interface for SDK operations. */
export interface ILogger {
	debug(text: string): void;
	info(text: string): void;
	warn(text: string): void;
	error(text: string): void;
}

/**
 * Default logger implementation using console output.
 * @category Utilities
 */
export class Logger implements ILogger {
	private verbosity: Verbosity;

	public static readonly Verbosity = Verbosity;
	public static readonly DEFAULT_INSTANCE = new Logger(Verbosity.INFO);

	constructor(verbosity: Verbosity) {
		this.verbosity = verbosity;
	}

	debug(text: string): void {
		if (this.verbosity <= Verbosity.DEBUG) console.debug(text);
	}

	info(text: string): void {
		if (this.verbosity <= Verbosity.INFO) console.info(text);
	}

	warn(text: string): void {
		if (this.verbosity <= Verbosity.WARN) console.warn(text);
	}

	error(text: string): void {
		if (this.verbosity <= Verbosity.ERROR) console.error(text);
	}
}
