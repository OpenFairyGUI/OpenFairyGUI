import type {
	UamAssetResource,
	UamControllerAction,
	UamControllerModel,
	UamDisplayNode,
	UamGearBinding,
	UamProject,
	UamValidationIssue,
} from './model.js';

function pushIssue(issues: UamValidationIssue[], path: string, message: string): void {
	issues.push({ path, message });
}

export function isFiniteUamPoint(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false;
	const point = value as { x?: unknown; y?: unknown };
	return typeof point.x === 'number'
		&& Number.isFinite(point.x)
		&& typeof point.y === 'number'
		&& Number.isFinite(point.y);
}

function validateControllerAction(
	action: UamControllerAction,
	knownPageIds: Set<string>,
	knownChildIds: Set<string>,
	path: string,
	issues: UamValidationIssue[],
): void {
	for (const pageId of action.fromPageIds) {
		if (!knownPageIds.has(pageId)) {
			pushIssue(issues, `${path}.fromPageIds`, `Unknown controller page id "${pageId}".`);
		}
	}
	for (const pageId of action.toPageIds) {
		if (!knownPageIds.has(pageId)) {
			pushIssue(issues, `${path}.toPageIds`, `Unknown controller page id "${pageId}".`);
		}
	}
	if (action.targetNodeId && !knownChildIds.has(action.targetNodeId)) {
		pushIssue(issues, `${path}.targetNodeId`, `Unknown target node id "${action.targetNodeId}".`);
	}
}

function validateGearBinding(
	gear: UamGearBinding,
	controllerMap: Map<string, UamControllerModel>,
	path: string,
	issues: UamValidationIssue[],
): void {
	const controller = controllerMap.get(gear.controllerName);
	if (!controller) {
		pushIssue(issues, `${path}.controllerName`, `Unknown gear controller "${gear.controllerName}".`);
		return;
	}

	const pageIds = new Set(controller.pages.map((page) => page.id));
	if (gear.kind === 'display' || gear.kind === 'display2') {
		const seen = new Set<string>();
		for (const pageId of gear.visibleOnPageIds) {
			if (seen.has(pageId)) pushIssue(issues, `${path}.visibleOnPageIds`, `Duplicate gear page id "${pageId}".`);
			seen.add(pageId);
		}
		return;
	}

	const seen = new Set<string>();
	for (const state of gear.states) {
		if (!pageIds.has(state.pageId)) pushIssue(issues, `${path}.states`, `Unknown gear state page id "${state.pageId}".`);
		if (seen.has(state.pageId)) pushIssue(issues, `${path}.states`, `Duplicate gear state page id "${state.pageId}".`);
		seen.add(state.pageId);
	}
}

function isSafePathSegment(value: string): boolean {
	return value.length > 0 && value !== '.' && value !== '..' && !/[\\/:]/.test(value);
}

function normalizedResourceTarget(path: string, fileName: string): string | null {
	if (!isSafePathSegment(fileName)) return null;
	const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
	if (segments.some((segment) => !isSafePathSegment(segment))) return null;
	return [...segments, fileName].join('/');
}

function isSafeRelativePath(value: string): boolean {
	const segments = value.replace(/\\/g, '/').split('/').filter(Boolean);
	return segments.length > 0 && segments.every(isSafePathSegment);
}

function assetFileName(resource: UamAssetResource): string {
	return resource.fileName || resource.file || resource.name;
}

function validatePackageOutputTargets(
	pkg: UamProject['packages'][number],
	pkgPath: string,
	issues: UamValidationIssue[],
): void {
	if (!isSafePathSegment(pkg.name)) {
		pushIssue(issues, `${pkgPath}.name`, `Invalid package output name "${pkg.name}".`);
	}
	const outputs = new Map<string, string>();
	for (const [resourceIndex, resource] of pkg.resources.entries()) {
		const resourcePath = `${pkgPath}.resources[${resourceIndex}]`;
		if (resource.branch && !isSafePathSegment(resource.branch)) {
			pushIssue(issues, `${resourcePath}.branch`, `Invalid package branch name "${resource.branch}".`);
		}
		const fileName = resource.kind === 'component' ? `${resource.name}.xml` : assetFileName(resource);
		const target = normalizedResourceTarget(resource.path, fileName);
		if (!target) {
			pushIssue(issues, `${resourcePath}.path`, 'Resource output path must be package-relative and traversal-free.');
			continue;
		}
		const descriptor = resource.branch ? 'package_branch.xml' : 'package.xml';
		if (target === descriptor) {
			pushIssue(issues, `${resourcePath}.path`, `Resource output "${target}" conflicts with the package descriptor.`);
		}
		const key = `${resource.branch}\0${target}`;
		const previous = outputs.get(key);
		if (previous) {
			pushIssue(issues, `${resourcePath}.path`, `Resource output "${target}" conflicts with ${previous}.`);
		} else {
			outputs.set(key, resourcePath);
		}
		if (resource.kind !== 'component' && resource.sourcePath && !isSafeRelativePath(resource.sourcePath)) {
			pushIssue(issues, `${resourcePath}.sourcePath`, 'Resource sourcePath must be package-relative and traversal-free.');
		}
	}
}

function validateDisplayNode(
	node: UamDisplayNode,
	controllerMap: Map<string, UamControllerModel>,
	knownChildIds: Set<string>,
	path: string,
	issues: UamValidationIssue[],
): void {
	if (node.pivot !== undefined) {
		if (!isFiniteUamPoint(node.pivot)) {
			pushIssue(issues, `${path}.pivot`, 'Display node pivot must contain finite x and y numbers.');
		}
	}
	if (node.pivotAsAnchor !== undefined) {
		if (typeof node.pivotAsAnchor !== 'boolean') {
			pushIssue(issues, `${path}.pivotAsAnchor`, 'Display node pivotAsAnchor must be boolean.');
		}
	}
	for (const [gearIndex, gear] of node.gears.entries()) {
		validateGearBinding(gear, controllerMap, `${path}.gears[${gearIndex}]`, issues);
	}
	for (const [relationIndex, relation] of node.relations.entries()) {
		if (relation.targetNodeId && !knownChildIds.has(relation.targetNodeId)) {
			pushIssue(issues, `${path}.relations[${relationIndex}]`, `Unknown relation target node id "${relation.targetNodeId}".`);
		}
	}
}

export function validateUamProject(project: UamProject): UamValidationIssue[] {
	const issues: UamValidationIssue[] = [];
	const packageIds = new Set<string>();
	const packageNames = new Set<string>();

	for (const [pkgIndex, pkg] of project.packages.entries()) {
		const pkgPath = `packages[${pkgIndex}]`;
		if (packageIds.has(pkg.id)) pushIssue(issues, `${pkgPath}.id`, `Duplicate package id "${pkg.id}".`);
		if (packageNames.has(pkg.name)) pushIssue(issues, `${pkgPath}.name`, `Duplicate package name "${pkg.name}".`);
		packageIds.add(pkg.id);
		packageNames.add(pkg.name);
		validatePackageOutputTargets(pkg, pkgPath, issues);

		const resourceIds = new Set<string>();
		for (const [resourceIndex, resource] of pkg.resources.entries()) {
			const resourcePath = `${pkgPath}.resources[${resourceIndex}]`;
			if (resourceIds.has(resource.id)) pushIssue(issues, `${resourcePath}.id`, `Duplicate resource id "${resource.id}".`);
			resourceIds.add(resource.id);
			if (typeof resource.favorite !== 'boolean') {
				pushIssue(issues, `${resourcePath}.favorite`, 'Resource favorite must be boolean.');
			}

			if (resource.kind !== 'component') continue;

			const component = resource.component;
			const childIds = new Set<string>();
			for (const [childIndex, child] of component.displayList.entries()) {
				const childPath = `${resourcePath}.component.displayList[${childIndex}]`;
				if (childIds.has(child.id)) pushIssue(issues, `${childPath}.id`, `Duplicate child id "${child.id}".`);
				childIds.add(child.id);
			}

			const controllerMap = new Map<string, UamControllerModel>();
			for (const [controllerIndex, controller] of component.controllers.entries()) {
				const controllerPath = `${resourcePath}.component.controllers[${controllerIndex}]`;
				if (controllerMap.has(controller.name)) pushIssue(issues, `${controllerPath}.name`, `Duplicate controller name "${controller.name}".`);
				controllerMap.set(controller.name, controller);

				const pageIds = new Set<string>();
				for (const [pageIndex, page] of controller.pages.entries()) {
					const pagePath = `${controllerPath}.pages[${pageIndex}]`;
					if (pageIds.has(page.id)) pushIssue(issues, `${pagePath}.id`, `Duplicate controller page id "${page.id}".`);
					pageIds.add(page.id);
				}

				for (const [actionIndex, action] of controller.actions.entries()) {
					validateControllerAction(action, pageIds, childIds, `${controllerPath}.actions[${actionIndex}]`, issues);
				}
			}

			for (const [childIndex, child] of component.displayList.entries()) {
				validateDisplayNode(child, controllerMap, childIds, `${resourcePath}.component.displayList[${childIndex}]`, issues);
			}
		}
	}

	return issues;
}

export function assertValidUamProject(project: UamProject): void {
	const issues = validateUamProject(project);
	if (issues.length === 0) return;
	throw new Error(`UAM validation failed:\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`);
}
