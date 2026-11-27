import type { Document, ProjectDiagnostic } from '@openfairygui/core';
import { ProjectWriter } from '@openfairygui/core/project-io';
import { materializeUamProject, type UamProject } from '@openfairygui/core/uam';
import type { BackendDiagnostic } from '../contracts.js';
import type { UamFidelityDiffEntry, UamFidelityReport } from '../runtime/contracts.js';
import { createCaptureFileSystem } from './capture-project.js';

export const MAX_UAM_FIDELITY_DIFFS = 50;
export const MAX_UAM_FIDELITY_EXCERPT_CHARS = 240;
export const MAX_UAM_FIDELITY_ERROR_CHARS = 512;

export type UamFidelityEvaluation = { uamFidelity: 'full' } | { uamFidelity: 'unsupported'; report: UamFidelityReport };

function boundText(value: string, maxChars: number): string {
	const normalized = value.replace(/\r/g, '').trim();
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) return false;
	}
	return true;
}

function firstTextLineDiff(
	source: string,
	materialized: string,
): { line: number; sourceExcerpt: string; materializedExcerpt: string } {
	const sourceLines = source.split('\n');
	const materializedLines = materialized.split('\n');
	const limit = Math.max(sourceLines.length, materializedLines.length);
	for (let index = 0; index < limit; index += 1) {
		const left = sourceLines[index] ?? '';
		const right = materializedLines[index] ?? '';
		if (left !== right) {
			return {
				line: index + 1,
				sourceExcerpt: boundText(left, MAX_UAM_FIDELITY_EXCERPT_CHARS),
				materializedExcerpt: boundText(right, MAX_UAM_FIDELITY_EXCERPT_CHARS),
			};
		}
	}
	return {
		line: 1,
		sourceExcerpt: boundText(sourceLines[0] ?? '', MAX_UAM_FIDELITY_EXCERPT_CHARS),
		materializedExcerpt: boundText(materializedLines[0] ?? '', MAX_UAM_FIDELITY_EXCERPT_CHARS),
	};
}

export function diffCapturedProjects(
	sourceFiles: ReadonlyMap<string, string | Uint8Array>,
	sourceDirectories: ReadonlySet<string>,
	materializedFiles: ReadonlyMap<string, string | Uint8Array>,
	materializedDirectories: ReadonlySet<string>,
	maxDiffs = MAX_UAM_FIDELITY_DIFFS,
): { totalDiffCount: number; diffs: UamFidelityDiffEntry[]; truncated: boolean } {
	const allDiffs: UamFidelityDiffEntry[] = [];

	const filePaths = [...new Set([...sourceFiles.keys(), ...materializedFiles.keys()])].sort((left, right) =>
		left.localeCompare(right),
	);
	for (const filePath of filePaths) {
		const left = sourceFiles.get(filePath);
		const right = materializedFiles.get(filePath);
		if (left === undefined) {
			allDiffs.push({ path: filePath, kind: 'file', change: 'extra' });
			continue;
		}
		if (right === undefined) {
			allDiffs.push({ path: filePath, kind: 'file', change: 'missing' });
			continue;
		}
		if (typeof left === 'string' && typeof right === 'string') {
			if (left !== right) {
				const diff = firstTextLineDiff(left, right);
				allDiffs.push({
					path: filePath,
					kind: 'file',
					change: 'modified',
					line: diff.line,
					sourceExcerpt: diff.sourceExcerpt,
					materializedExcerpt: diff.materializedExcerpt,
				});
			}
			continue;
		}
		if (left instanceof Uint8Array && right instanceof Uint8Array) {
			if (!bytesEqual(left, right)) {
				allDiffs.push({ path: filePath, kind: 'file', change: 'modified' });
			}
			continue;
		}
		allDiffs.push({ path: filePath, kind: 'file', change: 'type_mismatch' });
	}

	const directories = [...new Set([...sourceDirectories, ...materializedDirectories])].sort((left, right) =>
		left.localeCompare(right),
	);
	for (const directory of directories) {
		const inSource = sourceDirectories.has(directory);
		const inMaterialized = materializedDirectories.has(directory);
		if (inSource && !inMaterialized) {
			allDiffs.push({ path: directory, kind: 'directory', change: 'missing' });
		} else if (!inSource && inMaterialized) {
			allDiffs.push({ path: directory, kind: 'directory', change: 'extra' });
		}
	}

	allDiffs.sort((left, right) =>
		left.path === right.path ? left.kind.localeCompare(right.kind) : left.path.localeCompare(right.path),
	);
	const limit = Math.max(0, maxDiffs);
	return {
		totalDiffCount: allDiffs.length,
		diffs: allDiffs.slice(0, limit),
		truncated: allDiffs.length > limit,
	};
}

export async function evaluateUamFidelity(
	document: Document,
	project: UamProject,
	options?: {
		readComplete?: boolean;
		readDiagnostics?: readonly ProjectDiagnostic[];
		fairyFileName?: string;
		maxDiffs?: number;
	},
): Promise<UamFidelityEvaluation> {
	if (options?.readComplete === false) {
		const detail = options.readDiagnostics?.[0]?.message;
		return {
			uamFidelity: 'unsupported',
			report: {
				reason: 'incomplete_read',
				...(detail ? { errorMessage: boundText(detail, MAX_UAM_FIDELITY_ERROR_CHARS) } : {}),
				totalDiffCount: 0,
				diffs: [],
				truncated: false,
			},
		};
	}

	const fairyFileName = options?.fairyFileName || 'Project.fairy';
	const sourceFiles = new Map<string, string | Uint8Array>();
	const materializedFiles = new Map<string, string | Uint8Array>();
	const sourceDirectories = new Set<string>();
	const materializedDirectories = new Set<string>();
	try {
		await Promise.all([
			new ProjectWriter(createCaptureFileSystem(sourceFiles, sourceDirectories)).write(document, fairyFileName),
			new ProjectWriter(createCaptureFileSystem(materializedFiles, materializedDirectories)).write(
				materializeUamProject(project),
				fairyFileName,
			),
		]);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			uamFidelity: 'unsupported',
			report: {
				reason: 'materialize_failed',
				...(message ? { errorMessage: boundText(message, MAX_UAM_FIDELITY_ERROR_CHARS) } : {}),
				totalDiffCount: 0,
				diffs: [],
				truncated: false,
			},
		};
	}

	const comparison = diffCapturedProjects(
		sourceFiles,
		sourceDirectories,
		materializedFiles,
		materializedDirectories,
		options?.maxDiffs,
	);
	if (comparison.totalDiffCount === 0) return { uamFidelity: 'full' };
	return {
		uamFidelity: 'unsupported',
		report: {
			reason: 'round_trip_mismatch',
			totalDiffCount: comparison.totalDiffCount,
			diffs: comparison.diffs,
			truncated: comparison.truncated,
		},
	};
}

export function formatUamFidelityUnsupportedMessage(report?: UamFidelityReport): string {
	if (!report) {
		return 'The source project contains formal properties that the current UAM cannot preserve.';
	}
	if (report.reason === 'incomplete_read') {
		return report.errorMessage
			? `The source project read was incomplete, so UAM fidelity cannot be verified: ${report.errorMessage}`
			: 'The source project read was incomplete, so UAM fidelity cannot be verified.';
	}
	if (report.reason === 'materialize_failed') {
		return report.errorMessage
			? `The source project could not be materialized through the current UAM: ${report.errorMessage}`
			: 'The source project could not be materialized through the current UAM.';
	}
	const first = report.diffs[0];
	const firstLocation = first
		? `, first: ${first.path}${first.line !== undefined ? `:${first.line}` : ''} [${first.change}]`
		: '';
	return `The source project contains formal properties that the current UAM cannot preserve (${report.totalDiffCount} difference(s)${firstLocation}).`;
}

function formatDiffDiagnosticMessage(entry: UamFidelityDiffEntry): string {
	if (entry.kind === 'directory') {
		return `UAM round-trip directory ${entry.change}: ${entry.path}`;
	}
	if (entry.change === 'modified' && entry.line !== undefined) {
		return `UAM round-trip modified ${entry.path} at line ${entry.line} (source: ${entry.sourceExcerpt ?? ''}; materialized: ${entry.materializedExcerpt ?? ''}).`;
	}
	return `UAM round-trip file ${entry.change}: ${entry.path}`;
}

export function createUamFidelityDiagnostics(
	report: UamFidelityReport | undefined,
	fallbackMessage: string,
): BackendDiagnostic[] {
	if (report?.reason === 'round_trip_mismatch' && report.diffs.length > 0) {
		return report.diffs.map((entry) => ({
			code: 'uam_fidelity_unsupported',
			severity: 'error',
			path: entry.path,
			message: formatDiffDiagnosticMessage(entry),
		}));
	}
	return [
		{
			code: 'uam_fidelity_unsupported',
			severity: 'error',
			message: fallbackMessage,
		},
	];
}
