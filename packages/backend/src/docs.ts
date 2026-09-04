import { getBackendDiagnosticCatalog, getBackendDiagnosticGuide, type BackendDiagnosticGuide } from './diagnostics.js';
import { CONTRACT_SNAPSHOT } from './generated/contracts.js';
import { INSTALLED_DOCS } from './generated/docs.js';

/** JSON Schema data, not another validator or operation grammar. */
export interface ContractSchema { $ref?: string; [keyword: string]: unknown }
export interface ContractSnapshot {
	digest: string;
	schemaVersion: number;
	versions: { BACKEND_CONTRACT_VERSION: string; BACKEND_CAPABILITY_SCHEMA_VERSION: number };
	operations: Record<string, ContractSchema>;
	tools: Record<string, { input: ContractSchema; output: ContractSchema; bytePaths: string[][]; [metadata: string]: unknown }>;
	$defs: Record<string, ContractSchema>;
	diagnostics: BackendDiagnosticGuide[];
}

export const OPENFAIRYGUI_DOCS_INDEX_URI = 'openfairygui://docs/index';
export const OPENFAIRYGUI_OPERATION_CATALOG_URI = 'openfairygui://contracts/operations';
export const OPENFAIRYGUI_OPERATION_SCHEMA_TEMPLATE = `${OPENFAIRYGUI_OPERATION_CATALOG_URI}/{kind}`;

/** Detached copy for wire adapters; documentation and adapters share one generated snapshot. */
export function getInstalledContractSnapshot(): ContractSnapshot { return structuredClone(CONTRACT_SNAPSHOT); }

export function getInstalledDocumentationVersion() {
	return { ...INSTALLED_DOCS.version, ...CONTRACT_SNAPSHOT.versions, contractDigest: CONTRACT_SNAPSHOT.digest };
}

export function getOpenFairyGuiOperationCatalog() {
	return {
		digest: CONTRACT_SNAPSHOT.digest, schemaVersion: CONTRACT_SNAPSHOT.schemaVersion,
		...CONTRACT_SNAPSHOT.versions,
		operations: Object.keys(CONTRACT_SNAPSHOT.operations).map((kind) => ({ kind, schemaUri: `${OPENFAIRYGUI_OPERATION_CATALOG_URI}/${kind}` })),
	};
}

/** Include only reachable definitions, so an individual schema works fully offline. */
function standaloneSchema(schema: ContractSchema): ContractSchema {
	const definitions: Record<string, ContractSchema> = {};
	function visit(value: unknown): void {
		if (!value || typeof value !== 'object') return;
		const ref = (value as ContractSchema).$ref;
		if (ref) {
			const key = ref.slice('#/$defs/'.length);
			if (Object.hasOwn(definitions, key)) return;
			definitions[key] = CONTRACT_SNAPSHOT.$defs[key];
			visit(definitions[key]);
		} else for (const child of Object.values(value)) visit(child);
	}
	visit(schema);
	return structuredClone({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...schema, $defs: definitions });
}

export function getOpenFairyGuiOperationSchema(kind: string): ContractSchema {
	if (!Object.hasOwn(CONTRACT_SNAPSHOT.operations, kind)) throw new RangeError(`Unknown UAM operation: ${kind}`);
	return standaloneSchema(CONTRACT_SNAPSHOT.operations[kind]);
}

export function getInstalledDocumentationIndex() {
	return {
		...getInstalledDocumentationVersion(),
		documents: [
			{ id: 'workflow', title: 'Safe editing workflow and installation checks', uri: 'openfairygui://docs/workflow' },
			{ id: 'skill', title: 'Thin installed-version navigation skill', uri: 'openfairygui://docs/skill' },
			{ id: 'contracts', title: 'Operation catalog and Backend/MCP method mapping', uri: 'openfairygui://docs/contracts' },
			...Object.keys(CONTRACT_SNAPSHOT.operations).map((kind) => ({ id: `operations/${kind}`, title: `UAM operation: ${kind}`, uri: `${OPENFAIRYGUI_OPERATION_CATALOG_URI}/${kind}` })),
			...Object.keys(CONTRACT_SNAPSHOT.tools).map((method) => ({ id: `methods/${method}`, title: `Backend/MCP wire method: ${method}`, uri: `openfairygui://docs/methods/${method}` })),
			...getBackendDiagnosticCatalog().map((guide) => ({ id: `diagnostics/${guide.code}`, title: `Recovery: ${guide.code}`, uri: guide.docsUri })),
		],
	};
}

/** IDs come from the index, never filesystem paths or remote URLs. */
export function readInstalledDocumentation(id: string) {
	const entry = getInstalledDocumentationIndex().documents.find((document) => document.id === id);
	if (!entry) throw new RangeError(`Unknown installed documentation ID: ${id}`);
	let content: unknown;
	if (id === 'workflow') content = INSTALLED_DOCS.workflow;
	else if (id === 'skill') content = INSTALLED_DOCS.skill;
	else if (id === 'contracts') content = {
		...getOpenFairyGuiOperationCatalog(),
		methods: Object.entries(CONTRACT_SNAPSHOT.tools).map(([method, { input, output, bytePaths, ...metadata }]) => ({ method, ...metadata, docsUri: `openfairygui://docs/methods/${method}` })),
	};
	else if (id.startsWith('operations/')) content = getOpenFairyGuiOperationSchema(id.slice('operations/'.length));
	else if (id.startsWith('diagnostics/')) content = getBackendDiagnosticGuide(id.slice('diagnostics/'.length));
	else {
		const tool = CONTRACT_SNAPSHOT.tools[id.slice('methods/'.length)];
		content = { ...tool, input: standaloneSchema(tool.input), output: standaloneSchema(tool.output) };
	}
	return {
		...getInstalledDocumentationVersion(), ...entry,
		mimeType: id === 'workflow' || id === 'skill' ? 'text/markdown' : 'application/json',
		text: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
	};
}

export function findInstalledDocumentation(query: string) {
	const term = query.trim().toLowerCase();
	if (!term) throw new RangeError('Documentation search must not be empty');
	const index = getInstalledDocumentationIndex();
	// ponytail: linear search is sufficient for this small installed corpus; index only if it grows materially.
	return { ...index, documents: index.documents.filter((entry) =>
		`${entry.id}\n${entry.title}\n${readInstalledDocumentation(entry.id).text}`.toLowerCase().includes(term)) };
}
