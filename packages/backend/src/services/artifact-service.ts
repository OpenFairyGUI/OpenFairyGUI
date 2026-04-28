import type { BackendCapabilities } from '../runtime.js';

export function createArtifactCapabilities(): BackendCapabilities['artifact'] {
	const bridge = {
		available: false,
		requiredHost: 'node',
		executionBoundary: 'external-bridge',
		bridgeEntrypoint: '@openfairygui/backend/node',
		reason: 'publish/restore require explicit Node-hosted filesystem and artifact execution.',
	} as const;

	return {
		publish: false,
		restore: false,
		status: 'bridge-required',
		publishBridge: bridge,
		restoreBridge: bridge,
	};
}
