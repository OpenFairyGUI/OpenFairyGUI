import type {
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

function validateDisplayNode(
	node: UamDisplayNode,
	controllerMap: Map<string, UamControllerModel>,
	knownChildIds: Set<string>,
	path: string,
	issues: UamValidationIssue[],
): void {
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

		const resourceIds = new Set<string>();
		for (const [resourceIndex, resource] of pkg.resources.entries()) {
			const resourcePath = `${pkgPath}.resources[${resourceIndex}]`;
			if (resourceIds.has(resource.id)) pushIssue(issues, `${resourcePath}.id`, `Duplicate resource id "${resource.id}".`);
			resourceIds.add(resource.id);

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
