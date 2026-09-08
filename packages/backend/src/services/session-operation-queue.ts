/** Serializes lifecycle and authoring operations for one session, without blocking other sessions. */
export class SessionOperationQueue {
	private readonly operations = new Map<string, Promise<void>>();

	public async run<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
		const previous = this.operations.get(sessionId) ?? Promise.resolve();
		let release = (): void => undefined;
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		const tail = previous.then(() => current);
		this.operations.set(sessionId, tail);
		await previous;
		try {
			return await operation();
		} finally {
			release();
			if (this.operations.get(sessionId) === tail) this.operations.delete(sessionId);
		}
	}
}
