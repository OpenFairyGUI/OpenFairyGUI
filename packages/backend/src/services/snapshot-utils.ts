import type {
	BackendCacheEntry,
	BackendCapabilities,
	BackendEvent,
	BackendJobSnapshot,
} from '../runtime.js';

function cloneJsonValue<T>(value: T): T {
	if (value === undefined || value === null) return value;
	return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneEventSnapshot(event: BackendEvent): BackendEvent {
	return {
		...event,
		diagnostics: event.diagnostics.map((diagnostic) => ({ ...diagnostic })),
		payload: cloneJsonValue(event.payload),
	};
}

export function cloneJobSnapshot(job: BackendJobSnapshot): BackendJobSnapshot {
	return {
		...job,
		diagnostics: job.diagnostics.map((diagnostic) => ({ ...diagnostic })),
		progress: job.progress ? { ...job.progress } : undefined,
		result: cloneJsonValue(job.result),
		error: cloneJsonValue(job.error),
	};
}

export function cloneCacheEntrySnapshot(entry: BackendCacheEntry): BackendCacheEntry {
	return {
		...entry,
		summary: {
			...entry.summary,
			diagnostics: entry.summary.diagnostics.map((diagnostic) => ({ ...diagnostic })),
		},
	};
}

export function cloneCapabilitiesSnapshot(capabilities: BackendCapabilities): BackendCapabilities {
	return cloneJsonValue(capabilities);
}
