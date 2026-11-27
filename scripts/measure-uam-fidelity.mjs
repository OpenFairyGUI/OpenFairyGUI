import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { inspectReferences } from './repo-doctor.mjs';
import { isMain, readJson, ROOT } from './repo-utils.mjs';

const TRACKED_FIXTURE_RELATIVE_PATH =
	'packages/test-utils/test/fixtures/FairyGUI-Experiments/FairyGUI-Experiments.fairy';

function parseXmlTagAndAttrs(line) {
	if (typeof line !== 'string') return null;
	const trimmed = line.trim();
	const tagMatch = /^<([A-Za-z_][\w:.-]*)\b([^>]*)>/.exec(trimmed);
	if (!tagMatch) return null;
	const attrs = new Map();
	for (const match of tagMatch[2].matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
		attrs.set(match[1], match[2]);
	}
	return { tag: tagMatch[1], attrs };
}

export function classifyDiffSignature(entry) {
	if (!entry || typeof entry !== 'object') return 'unknown';
	if (entry.kind === 'directory') return `directory:${entry.change}`;
	if (entry.change !== 'modified') return `file:${entry.change}`;
	const src = parseXmlTagAndAttrs(entry.sourceExcerpt);
	const mat = parseXmlTagAndAttrs(entry.materializedExcerpt);
	if (!src && !mat) return 'file:modified';
	if (src && mat && src.tag === mat.tag) {
		const changedAttrs = [...new Set([...src.attrs.keys(), ...mat.attrs.keys()])]
			.filter((attr) => src.attrs.get(attr) !== mat.attrs.get(attr))
			.sort((left, right) => left.localeCompare(right));
		if (changedAttrs.length > 0) {
			return `xml:<${src.tag}>:${changedAttrs.join(',')}`;
		}
		return `xml:<${src.tag}>`;
	}
	if (src && !mat) return `xml:missing-tag:<${src.tag}>`;
	if (!src && mat) return `xml:extra-tag:<${mat.tag}>`;
	return `xml:tag-mismatch:<${src.tag}>-><${mat.tag}>`;
}

function ratioStats(results) {
	const totalProjects = results.length;
	const fullProjects = results.filter((item) => item.uamFidelity === 'full').length;
	const unsupportedProjects = totalProjects - fullProjects;
	const fullRatio = totalProjects === 0 ? 0 : fullProjects / totalProjects;
	return {
		totalProjects,
		fullProjects,
		unsupportedProjects,
		fullRatio,
		fullPercent: `${(fullRatio * 100).toFixed(1)}%`,
	};
}

export function summarizeFidelityResults(results) {
	const buckets = new Map();
	let totalDiffCount = 0;

	const record = (signature, sample) => {
		const existing = buckets.get(signature) ?? { signature, count: 0, samples: [] };
		existing.count += 1;
		if (existing.samples.length < 5) existing.samples.push(sample);
		buckets.set(signature, existing);
	};

	for (const result of results) {
		if (result.uamFidelity !== 'unsupported') continue;
		const report = result.report;
		if (!report) {
			record('reason:unknown', { project: result.name });
			continue;
		}
		totalDiffCount += report.totalDiffCount;
		if (report.reason !== 'round_trip_mismatch' || report.diffs.length === 0) {
			record(`reason:${report.reason}`, {
				project: result.name,
				...(report.errorMessage ? { errorMessage: report.errorMessage } : {}),
			});
			continue;
		}
		for (const diff of report.diffs) {
			record(classifyDiffSignature(diff), {
				project: result.name,
				path: diff.path,
				kind: diff.kind,
				change: diff.change,
				...(diff.line !== undefined ? { line: diff.line } : {}),
				...(diff.sourceExcerpt !== undefined ? { sourceExcerpt: diff.sourceExcerpt } : {}),
				...(diff.materializedExcerpt !== undefined ? { materializedExcerpt: diff.materializedExcerpt } : {}),
			});
		}
	}

	const differenceInventory = [...buckets.values()].sort(
		(left, right) => right.count - left.count || left.signature.localeCompare(right.signature),
	);
	const referenceSubmoduleResults = results.filter((item) => item.source === 'reference-submodule');
	return {
		summary: {
			...ratioStats(results),
			...(referenceSubmoduleResults.length > 0
				? { referenceSubmodules: ratioStats(referenceSubmoduleResults) }
				: {}),
			totalPackages: results.reduce((sum, item) => sum + item.packages, 0),
			totalComponents: results.reduce((sum, item) => sum + item.components, 0),
			totalResources: results.reduce((sum, item) => sum + item.resources, 0),
			totalDiffCount,
		},
		projects: results,
		differenceInventory,
	};
}

export function resolveDefaultCorpus(root = ROOT) {
	const referenceStatus = inspectReferences(root);
	if (!referenceStatus.ok) {
		const broken = referenceStatus.submodules
			.filter((entry) => entry.status !== 'ready')
			.map((entry) => `${entry.path} (${entry.status})`)
			.join(', ');
		throw new Error(`Required reference fixtures are not ready: ${broken}. Run pnpm refs:sync first.`);
	}
	const manifest = readJson(path.join(root, 'references.json'));
	const targets = manifest.submodules.map((entry) => ({
		name: path.basename(entry.path),
		source: 'reference-submodule',
		projectPath: path.join(root, entry.path, entry.probe),
	}));
	const trackedPath = path.join(root, TRACKED_FIXTURE_RELATIVE_PATH);
	if (existsSync(trackedPath)) {
		targets.push({
			name: 'FairyGUI-Experiments',
			source: 'tracked-fixture',
			projectPath: trackedPath,
		});
	}
	return targets;
}

async function loadBackendModules(root = ROOT) {
	const indexPath = path.join(root, 'packages/backend/dist/index.mjs');
	const nodePath = path.join(root, 'packages/backend/dist/node.mjs');
	if (!existsSync(indexPath) || !existsSync(nodePath)) {
		throw new Error('Backend build outputs are missing. Run pnpm build before pnpm fidelity:measure.');
	}
	const [backend, backendNode] = await Promise.all([
		import(pathToFileURL(indexPath).href),
		import(pathToFileURL(nodePath).href),
	]);
	return {
		BackendRuntime: backend.BackendRuntime,
		createNodeBackendFileSystem: backendNode.createNodeBackendFileSystem,
	};
}

export async function measureCorpusFidelity(targets, options = {}) {
	const root = options.root ?? ROOT;
	const { BackendRuntime, createNodeBackendFileSystem } = options.backend ?? (await loadBackendModules(root));
	const baseFs = createNodeBackendFileSystem();
	const lockDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ofgui-fidelity-measure-locks-'));
	try {
		const fileSystem = {
			...baseFs,
			getSessionLockPath: (canonicalProjectPath) => {
				const hash = crypto.createHash('sha256').update(canonicalProjectPath).digest('hex').slice(0, 16);
				return path.join(lockDir, `${hash}.lock`);
			},
		};
		const runtime = new BackendRuntime({ fileSystem });
		const results = [];
		for (const target of targets) {
			const projectPath = path.resolve(root, target.projectPath);
			const opened = await runtime.openSession({ projectPath });
			if (!opened.ok) {
				results.push({
					name: target.name,
					source: target.source,
					projectPath: path.relative(root, projectPath).replace(/\\/g, '/') || projectPath,
					uamFidelity: 'unsupported',
					packages: 0,
					components: 0,
					resources: 0,
					openError: { code: opened.error.code, message: opened.error.message },
					report: {
						reason: 'incomplete_read',
						errorMessage: `${opened.error.code}: ${opened.error.message}`,
						totalDiffCount: 0,
						diffs: [],
						truncated: false,
					},
				});
				continue;
			}
			const sessionId = opened.data.sessionId;
			try {
				const outline = runtime.getProjectOutline({ sessionId });
				const packages = outline.ok ? outline.data.packages.length : 0;
				const resources = outline.ok
					? outline.data.packages.reduce((sum, pkg) => sum + pkg.resources.length, 0)
					: 0;
				const components = outline.ok
					? outline.data.packages.reduce(
							(sum, pkg) => sum + pkg.resources.filter((res) => res.kind === 'component').length,
							0,
						)
					: 0;
				results.push({
					name: target.name,
					source: target.source,
					projectPath: path.relative(root, projectPath).replace(/\\/g, '/') || projectPath,
					uamFidelity: opened.data.uamFidelity,
					packages,
					components,
					resources,
					report: opened.data.uamFidelityReport ?? null,
				});
			} finally {
				await runtime.closeSession({ sessionId });
			}
		}
		return summarizeFidelityResults(results);
	} finally {
		await fs.rm(lockDir, { recursive: true, force: true });
	}
}

export function formatHumanReport(report) {
	const lines = [
		`UAM Fidelity Summary: ${report.summary.fullProjects}/${report.summary.totalProjects} full (${report.summary.fullPercent})`,
	];
	if (report.summary.referenceSubmodules) {
		const ref = report.summary.referenceSubmodules;
		lines.push(
			`  Reference submodules (references.json): ${ref.fullProjects}/${ref.totalProjects} full (${ref.fullPercent})`,
		);
	}
	lines.push(
		`  Totals: ${report.summary.totalPackages} packages, ${report.summary.totalComponents} components, ${report.summary.totalResources} resources, ${report.summary.totalDiffCount} diff(s)`,
		'',
		'Projects:',
	);
	for (const project of report.projects) {
		const detail =
			project.uamFidelity === 'full'
				? 'full'
				: `unsupported (${project.report?.reason ?? 'unknown'}, diffs=${project.report?.totalDiffCount ?? 0})`;
		lines.push(
			`  - ${project.name} [${project.source}]: ${detail} (${project.packages} pkgs, ${project.components} comps, ${project.resources} resources)`,
		);
	}
	lines.push('');
	if (report.differenceInventory.length === 0) {
		lines.push('Difference Inventory: none');
	} else {
		lines.push('Difference Inventory (ranked by frequency):');
		for (const item of report.differenceInventory) {
			const samplePaths = item.samples
				.map((sample) =>
					sample.path
						? `${sample.project}:${sample.path}${sample.line ? `:${sample.line}` : ''}`
						: sample.project,
				)
				.join(', ');
			lines.push(`  ${String(item.count).padStart(4)}  ${item.signature}  (${samplePaths})`);
		}
	}
	return `${lines.join('\n')}\n`;
}

export function parseCliArgs(argv) {
	const { values, positionals } = parseArgs({
		args: argv,
		options: {
			json: { type: 'boolean', default: false },
			'fail-on-unsupported': { type: 'boolean', default: false },
			project: { type: 'string', multiple: true, default: [] },
			help: { type: 'boolean', short: 'h', default: false },
		},
		allowPositionals: false,
	});
	if (positionals.length > 0) {
		throw new Error(`Unexpected positional argument: ${positionals[0]}`);
	}
	return {
		json: values.json,
		failOnUnsupported: values['fail-on-unsupported'],
		projects: values.project,
		help: values.help,
	};
}

async function main() {
	let options;
	try {
		options = parseCliArgs(process.argv.slice(2));
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(2);
	}
	if (options.help) {
		process.stdout.write('Usage: pnpm fidelity:measure [--json] [--fail-on-unsupported] [--project <path>]...\n');
		return;
	}
	let targets;
	try {
		targets =
			options.projects.length > 0
				? options.projects.map((projectPath) => ({
						name: path.basename(projectPath, '.fairy') || projectPath,
						source: 'custom',
						projectPath,
					}))
				: resolveDefaultCorpus(ROOT);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(2);
	}
	let report;
	try {
		report = await measureCorpusFidelity(targets, { root: ROOT });
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(2);
	}
	process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatHumanReport(report));
	if (options.failOnUnsupported && report.summary.unsupportedProjects > 0) {
		process.exit(1);
	}
}

if (isMain(import.meta.url)) {
	await main();
}
