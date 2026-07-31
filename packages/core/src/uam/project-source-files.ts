import type { ProjectSourceFile } from '../io/project-io-contracts.js';
import type { UamAssetResource, UamProject } from './model.js';

export function defaultAssetSourcePath(resource: UamAssetResource): string {
	const fileName = resource.fileName ?? (resource.kind === 'image' ? '' : resource.file) ?? '';
	const path = resource.path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
	return `/${[path, fileName].filter(Boolean).join('/')}`;
}

function sourceFileReference(packageName: string, resource: UamAssetResource): ProjectSourceFile | null {
	const fileName = resource.fileName ?? (resource.kind === 'image' ? '' : resource.file) ?? '';
	if (!fileName) return null;
	return {
		packageName,
		branch: resource.branch,
		path: resource.path,
		fileName,
	};
}

function sourceFileKey(source: ProjectSourceFile): string {
	return [source.branch, source.packageName, source.path, source.fileName].join('\0');
}

function projectSourceFiles(project: UamProject): Map<string, ProjectSourceFile> {
	const sources = new Map<string, ProjectSourceFile>();
	for (const pkg of project.packages) {
		sources.set(`${pkg.id}/package.xml`, {
			packageName: pkg.name,
			branch: '',
			path: '',
			fileName: 'package.xml',
		});
		const branches = new Set<string>();
		for (const resource of pkg.resources) {
			if (resource.branch) branches.add(resource.branch);
			const source = resource.kind === 'component'
				? {
					packageName: pkg.name,
					branch: resource.branch,
					path: resource.path,
					fileName: `${resource.name}.xml`,
				}
				: sourceFileReference(pkg.name, resource);
			if (source) sources.set(`${pkg.id}/${resource.id}`, source);
		}
		for (const branch of branches) {
			sources.set(`${pkg.id}/branch/${branch}`, {
				packageName: pkg.name,
				branch,
				path: '',
				fileName: 'package_branch.xml',
			});
		}
	}
	return sources;
}

export function staleSourceFiles(previousProject: UamProject, nextProject: UamProject): ProjectSourceFile[] {
	const previous = projectSourceFiles(previousProject);
	const nextKeys = new Set([...projectSourceFiles(nextProject).values()].map(sourceFileKey));
	return [...previous.values()].filter((source) => !nextKeys.has(sourceFileKey(source)));
}

/** Marks hydrated resource bytes as committed at their current package-relative paths. */
export function commitUamProjectSourcePaths(project: UamProject): void {
	for (const pkg of project.packages) {
		for (const resource of pkg.resources) {
			if (resource.kind === 'component' || !(resource.sourceBytes instanceof Uint8Array)) continue;
			resource.sourcePath = defaultAssetSourcePath(resource);
		}
	}
}
