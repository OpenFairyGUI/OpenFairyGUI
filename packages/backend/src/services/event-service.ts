import { failure, success, type BackendContext } from './context.js';
import { createSessionNotFoundError } from './session-utils.js';
import type {
	BackendEvent,
	BackendResult,
	EventCursorInvalidError,
	GetEventsInput,
	GetEventsSnapshot,
	SessionNotFoundError,
} from '../runtime.js';

const DEFAULT_EVENT_RETENTION_LIMIT = 1000;

export class EventService {
	public constructor(private readonly context: BackendContext) {}

	public emit(event: Omit<BackendEvent, 'sequence' | 'timestamp' | 'diagnostics'> & {
		diagnostics?: BackendEvent['diagnostics'];
	}): BackendEvent {
		const emitted: BackendEvent = {
			...event,
			sequence: this.context.nextEventSequence(),
			timestamp: new Date().toISOString(),
			diagnostics: event.diagnostics ?? [],
		};
		const sessionId = event.sessionId;
		if (!sessionId) return emitted;
		const events = this.context.eventsBySession.get(sessionId) ?? [];
		events.push(emitted);
		while (events.length > DEFAULT_EVENT_RETENTION_LIMIT) events.shift();
		this.context.eventsBySession.set(sessionId, events);
		return emitted;
	}

	public getEvents(input: GetEventsInput): BackendResult<GetEventsSnapshot, SessionNotFoundError | EventCursorInvalidError> {
		const startedAt = Date.now();
		const session = this.context.sessions.get(input.sessionId);
		if (!session || session.closed) {
			return failure('runtime', startedAt, createSessionNotFoundError(input.sessionId));
		}
		const events = this.context.eventsBySession.get(input.sessionId) ?? [];
		const oldestSequence = events[0]?.sequence ?? (events.length === 0 ? 1 : 0);
		const currentSequence = events.at(-1)?.sequence ?? 0;
		const after = input.after === undefined ? 0 : Number(input.after);
		if (!Number.isInteger(after) || after < 0) {
			return failure('runtime', startedAt, {
				code: 'event_cursor_invalid',
				message: `Invalid event cursor: ${input.after}`,
				sessionId: input.sessionId,
				after: String(input.after),
			});
		}
		if (events.length > 0 && after !== 0 && after < oldestSequence - 1) {
			return failure('runtime', startedAt, {
				code: 'event_cursor_invalid',
				message: `Event cursor has expired: ${after}`,
				sessionId: input.sessionId,
				after: String(input.after),
			});
		}
		if (after > currentSequence) {
			return failure('runtime', startedAt, {
				code: 'event_cursor_invalid',
				message: `Unknown event cursor: ${after}`,
				sessionId: input.sessionId,
				after: String(input.after),
			});
		}

		const filtered = events.filter((event) => event.sequence > after);
		const limit = input.limit === undefined ? filtered.length : Math.max(0, input.limit);
		return success('runtime', startedAt, {
			events: filtered.slice(0, limit).map((event) => structuredClone(event)),
			oldestSequence,
			currentSequence,
			cursorExpired: false,
		}, { sessionId: session.sessionId, revision: session.revision });
	}

	public removeSession(sessionId: string): void {
		this.context.eventsBySession.delete(sessionId);
	}
}
