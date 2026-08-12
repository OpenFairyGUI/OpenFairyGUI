import {
	UAM_SUPPORTED_MATERIALIZATION_SCOPE,
	UAM_SUPPORTED_TRANSACTION_SCOPE,
} from '@openfairygui/core/uam';
import {
	BACKEND_CAPABILITY_SCHEMA_VERSION,
	BACKEND_COMPATIBILITY_POLICY,
	BACKEND_CONTRACT_VERSION,
} from '../contracts.js';
import { createRuntimePathPolicy } from '../path-policy.js';
import { createArtifactCapabilities } from '../services/artifact-service.js';
import type { BackendArtifactBridgeCapability, BackendCapabilities } from './contracts.js';

const BACKEND_METHODS = [
	'getCapabilities',
	'openSession',
	'openProjectSession',
	'getSession',
	'getProjectOutline',
	'validateSession',
	'applyTransaction',
	'saveSession',
	'materializeSession',
	'closeSession',
	'getEvents',
	'getJob',
	'listJobs',
	'cancelJob',
	'getCacheSnapshot',
	'refreshCache',
] as const;

const ARTIFACT_BRIDGE_CAPABILITY = {
	available: false,
	requiredHost: 'node',
	executionBoundary: 'external-bridge',
	bridgeEntrypoint: '@openfairygui/backend/node',
	reason: 'publish/restore require explicit Node-hosted filesystem and artifact execution.',
} as const satisfies BackendArtifactBridgeCapability;

export function createCapabilities(atomicSave = false): BackendCapabilities {
	return {
		contractVersion: BACKEND_CONTRACT_VERSION,
		capabilitySchemaVersion: BACKEND_CAPABILITY_SCHEMA_VERSION,
		transactionKernelOwner: '@openfairygui/core',
		appSeamOwner: '@openfairygui/functions',
		runtimeOwner: '@openfairygui/backend',
		methods: BACKEND_METHODS,
		read: {
			capabilitySnapshot: true,
			sessionSnapshot: true,
			projectOutline: true,
			projectValidation: true,
		},
		authoring: {
			applyTransaction: true,
			saveSession: true,
			resourceKinds: [...UAM_SUPPORTED_MATERIALIZATION_SCOPE.resourceKinds],
			nodeKinds: [...UAM_SUPPORTED_MATERIALIZATION_SCOPE.nodeKinds],
			gearKinds: [...UAM_SUPPORTED_MATERIALIZATION_SCOPE.gearKinds],
			transactionScope: {
				resourceKinds: [...UAM_SUPPORTED_TRANSACTION_SCOPE.resourceKinds],
				nodeKinds: [...UAM_SUPPORTED_TRANSACTION_SCOPE.nodeKinds],
				gearKinds: [...UAM_SUPPORTED_TRANSACTION_SCOPE.gearKinds],
			},
			unsupported: ['artifact.publish', 'artifact.restore'],
		},
		artifact: createArtifactCapabilities(),
		manifest: {
			browserSafe: true,
			rootEntrypoint: '@openfairygui/backend',
			nodeEntrypoint: '@openfairygui/backend/node',
			adapters: {
				fileSystem: {
					injected: true,
					requiredFor: ['openSession', 'saveSession', 'materializeSession'],
				},
				projectStorage: {
					injected: true,
					browserSafe: true,
					requiredFor: ['openProjectSession.writeback', 'saveSession', 'materializeSession'],
					adapterFactory: 'createBackendStorageFileSystem',
				},
				host: {
					injected: true,
					requiredFor: ['advisoryLockMetadata'],
				},
			},
			executionBoundaries: {
				projectSession: 'in-process-browser-safe',
				fileBackedSession: 'adapter-backed',
				artifactPublish: ARTIFACT_BRIDGE_CAPABILITY,
				artifactRestore: ARTIFACT_BRIDGE_CAPABILITY,
			},
			diagnostics: {
				stableCodes: true,
				errorDiagnosticMirror: true,
			},
		},
		compatibilityPolicy: BACKEND_COMPATIBILITY_POLICY,
		runtime: {
			sessionRuntime: true,
			advisoryLocking: true,
			coordinatedSave: true,
			atomicSave,
			staleRevisionProtection: true,
			pathPolicy: createRuntimePathPolicy(),
			events: {
				polling: true,
				subscriptions: false,
				retentionLimit: 1000,
				sequenceScope: 'runtime',
			},
			jobs: {
				inMemory: true,
				cooperativeCancel: true,
				persistent: false,
				supportedKinds: ['cache.refresh'],
				artifactJobs: false,
				completedRetentionLimit: 100,
			},
			cache: {
				derivedReadOnly: true,
				keyedBy: 'canonicalPathKey',
				sourceOfTruth: false,
				refreshMethod: 'refreshCache',
			},
		},
	};
}
