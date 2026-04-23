import type { BackendCapabilities } from '../runtime.js';

export function createArtifactCapabilities(): BackendCapabilities['artifact'] {
	return {
		publish: false,
		restore: false,
		status: 'deferred',
	};
}
