import { type UamPackage, type UamProject, UAM_SUPPORTED_TRANSACTION_SCOPE } from '../model.js';
import { normalizeUamProject } from '../normalize.js';
import { validateUamProject } from '../validate.js';
import type { UamTransactionOperation, UamTransactionSupportIssue } from '../transaction-contracts.js';
import {
	findDisplayNodeSpecWithPath,
	isDisplayListRewriteOperation,
	isLifecycleOperation,
	isResourceLifecycleOperation,
	isUamNativeOperation,
} from '../transaction-shared.js';
import { applyUamNativeOperations } from '../transaction-uam-apply.js';
import { pushSupportIssue } from './support.js';

interface ProjectedResourceReferenceIssue {
	key: string;
	path: string;
	message: string;
}

function findUiResource(project: UamProject, value: string) {
	if (!value.startsWith('ui://')) return null;
	const reference = value.slice(5);
	const slashIndex = reference.indexOf('/');
	if (slashIndex >= 0) {
		const packageKey = reference.slice(0, slashIndex);
		const resourceKey = reference.slice(slashIndex + 1);
		const pkg = project.packages.find((candidate) => candidate.id === packageKey || candidate.name === packageKey);
		return pkg?.resources.find((resource) => (
			resource.id === resourceKey
			|| resource.name === resourceKey
			|| resource.name.replace(/\.[^.]+$/, '') === resourceKey
		)) ?? null;
	}
	const pkg = [...project.packages]
		.sort((left, right) => right.id.length - left.id.length)
		.find((candidate) => reference.startsWith(candidate.id));
	return pkg?.resources.find((resource) => resource.id === reference.slice(pkg.id.length)) ?? null;
}

function collectUiReferences(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(collectUiReferences);
	if (typeof value === 'object' && value !== null) {
		return Object.values(value).flatMap(collectUiReferences);
	}
	if (typeof value !== 'string') return [];
	return [...value.matchAll(/ui:\/\/[^\s"'<>()[\]{}]+/g)].map((match) => match[0]);
}

function collectProjectedResourceReferenceIssues(project: UamProject): ProjectedResourceReferenceIssue[] {
	const issues: ProjectedResourceReferenceIssue[] = [];
	const findResource = (packageId: string, resourceId: string) => (
		project.packages.find((pkg) => pkg.id === packageId)?.resources.find((resource) => resource.id === resourceId)
	);
	const pushMissing = (
		key: string,
		path: string,
		packageId: string,
		resourceId: string,
		expectedKinds: readonly UamPackage['resources'][number]['kind'][],
	) => {
		const target = findResource(packageId, resourceId);
		if (target && expectedKinds.includes(target.kind)) return;
		issues.push({
			key,
			path,
			message: `Resource reference "${packageId}/${resourceId}" must target ${expectedKinds.join(' or ')}.`,
		});
	};
	const pushMissingUi = (
		key: string,
		path: string,
		value: string,
		expectedKinds: readonly UamPackage['resources'][number]['kind'][],
	) => {
		if (!value.startsWith('ui://')) return;
		const target = findUiResource(project, value);
		if (target && expectedKinds.includes(target.kind)) return;
		issues.push({
			key,
			path,
			message: `Resource reference "${value}" must target ${expectedKinds.join(' or ')}.`,
		});
	};
	const componentKinds = ['component'] as const;
	const visualKinds = ['image', 'movieClip', 'component', 'spine', 'dragonBones'] as const;
	const binaryKinds = ['image', 'sound', 'misc', 'swf', 'font', 'movieClip', 'spine', 'dragonBones'] as const;
	const resourceKinds = UAM_SUPPORTED_TRANSACTION_SCOPE.resourceKinds;

	for (const pkg of project.packages) {
		for (const resource of pkg.resources) {
			if (resource.kind === 'font') {
				const textureId = `${resource.metadata?.textureId ?? ''}`;
				if (textureId) {
					pushMissing(
						`${pkg.id}/${resource.id}/metadata.textureId`,
						`packages.${pkg.id}.resources.${resource.id}.metadata.textureId`,
						pkg.id,
						textureId,
						['image'],
					);
				}
			}
			if (resource.kind === 'spine' || resource.kind === 'dragonBones') {
				const requireIds = Array.isArray(resource.metadata?.requireIds)
					? resource.metadata.requireIds.filter((value): value is string => typeof value === 'string')
					: [];
				for (const [requireIndex, requireId] of requireIds.entries()) {
					pushMissing(
						`${pkg.id}/${resource.id}/metadata.requireIds/${requireId}`,
						`packages.${pkg.id}.resources.${resource.id}.metadata.requireIds.${requireIndex}`,
						pkg.id,
						requireId,
						binaryKinds,
					);
				}
			}
			if (resource.kind !== 'component') continue;
			const componentPath = `packages.${pkg.id}.resources.${resource.id}.component`;
			const componentRefs = [
				['vtScrollBarRes', resource.component.properties.vtScrollBarRes],
				['hzScrollBarRes', resource.component.properties.hzScrollBarRes],
				['headerRes', resource.component.properties.headerRes],
				['footerRes', resource.component.properties.footerRes],
				['dropdown', resource.component.properties.dropdown],
			] as const;
			for (const [field, value] of componentRefs) {
				pushMissingUi(
					`${pkg.id}/${resource.id}/properties/${field}`,
					`${componentPath}.properties.${field}`,
					value,
					componentKinds,
				);
			}
			pushMissingUi(
				`${pkg.id}/${resource.id}/properties/sound`,
				`${componentPath}.properties.sound`,
				resource.component.properties.sound,
				['sound'],
			);
			pushMissingUi(
				`${pkg.id}/${resource.id}/properties/designImage`,
				`${componentPath}.properties.designImage`,
				resource.component.properties.designImage,
				['image'],
			);
			for (const field of ['showSound', 'hideSound'] as const) {
				pushMissingUi(
					`${pkg.id}/${resource.id}/properties/${field}`,
					`${componentPath}.properties.${field}`,
					resource.component.properties[field],
					['sound'],
				);
			}
			for (const node of resource.component.displayList) {
				const nodeKey = `${pkg.id}/${resource.id}/${node.id}`;
				const nodePath = `packages.${pkg.id}.resources.${resource.id}.component.displayList.${node.id}`;
				if (node.kind === 'image' && node.resource.resourceId) {
					pushMissing(
						`${nodeKey}/resource`,
						`${nodePath}.resource`,
						node.resource.packageId || pkg.id,
						node.resource.resourceId,
						['image'],
					);
				} else if (node.kind === 'movieClip' && node.resource.resourceId) {
					pushMissing(
						`${nodeKey}/resource`,
						`${nodePath}.resource`,
						node.resource.packageId || pkg.id,
						node.resource.resourceId,
						['movieClip'],
					);
				} else if (node.kind === 'component' && node.resource.resourceId) {
					pushMissing(
						`${nodeKey}/resource`,
						`${nodePath}.resource`,
						node.resource.packageId || pkg.id,
						node.resource.resourceId,
						componentKinds,
					);
				} else if ('packageId' in node && 'src' in node && node.src) {
					pushMissing(
						`${nodeKey}/src`,
						`${nodePath}.src`,
						node.packageId || pkg.id,
						node.src,
						componentKinds,
					);
				}
				if (node.kind === 'text' || node.kind === 'richText' || node.kind === 'textInput') {
					pushMissingUi(`${nodeKey}/font`, `${nodePath}.font`, node.font, ['font']);
					for (const [referenceIndex, reference] of collectUiReferences(node.text).entries()) {
						pushMissingUi(`${nodeKey}/text/${reference}`, `${nodePath}.text.${referenceIndex}`, reference, resourceKinds);
					}
				}
				if (node.kind === 'loader' || node.kind === 'loader3D') {
					pushMissingUi(`${nodeKey}/url`, `${nodePath}.url`, node.url, visualKinds);
				}
				if (node.kind === 'list' || node.kind === 'tree') {
					const listRefs = [
						['defaultItem', node.defaultItem],
						['src', node.src],
						['vtScrollBarRes', node.vtScrollBarRes],
						['hzScrollBarRes', node.hzScrollBarRes],
						['headerRes', node.headerRes],
						['footerRes', node.footerRes],
					] as const;
					for (const [field, value] of listRefs) {
						pushMissingUi(`${nodeKey}/${field}`, `${nodePath}.${field}`, value, componentKinds);
					}
					for (const [itemIndex, item] of node.listItems.entries()) {
						pushMissingUi(`${nodeKey}/items/${itemIndex}/url`, `${nodePath}.listItems.${itemIndex}.url`, item.url ?? '', componentKinds);
						pushMissingUi(`${nodeKey}/items/${itemIndex}/icon`, `${nodePath}.listItems.${itemIndex}.icon`, item.icon ?? '', visualKinds);
						pushMissingUi(`${nodeKey}/items/${itemIndex}/selectedIcon`, `${nodePath}.listItems.${itemIndex}.selectedIcon`, item.selectedIcon ?? '', visualKinds);
					}
				}
				if (node.kind === 'component' && node.instanceProperties) {
					const instance = node.instanceProperties;
					if ('icon' in instance) {
						pushMissingUi(`${nodeKey}/instance/icon`, `${nodePath}.instanceProperties.icon`, instance.icon, visualKinds);
					}
					if (instance.extensionType === 'Button') {
						pushMissingUi(`${nodeKey}/instance/selectedIcon`, `${nodePath}.instanceProperties.selectedIcon`, instance.selectedIcon, visualKinds);
					}
					if (instance.extensionType === 'Button'
						|| instance.extensionType === 'Label'
						|| instance.extensionType === 'ComboBox'
						|| instance.extensionType === 'ProgressBar') {
						pushMissingUi(`${nodeKey}/instance/sound`, `${nodePath}.instanceProperties.sound`, instance.sound, ['sound']);
					}
					if (instance.extensionType === 'ComboBox') {
						for (const [itemIndex, item] of instance.items.entries()) {
							pushMissingUi(`${nodeKey}/instance/items/${itemIndex}/icon`, `${nodePath}.instanceProperties.items.${itemIndex}.icon`, item.icon ?? '', visualKinds);
						}
					}
				}
				if ('icon' in node) {
					pushMissingUi(`${nodeKey}/icon`, `${nodePath}.icon`, node.icon, visualKinds);
				}
				if ('selectedIcon' in node) {
					pushMissingUi(`${nodeKey}/selectedIcon`, `${nodePath}.selectedIcon`, node.selectedIcon, visualKinds);
				}
				if ('icons' in node) {
					for (const [iconIndex, icon] of node.icons.entries()) {
						pushMissingUi(`${nodeKey}/icons/${iconIndex}`, `${nodePath}.icons.${iconIndex}`, icon, visualKinds);
					}
				}
				if ('sound' in node) {
					pushMissingUi(`${nodeKey}/sound`, `${nodePath}.sound`, node.sound, ['sound']);
				}
				for (const [gearIndex, gear] of node.gears.entries()) {
					for (const [referenceIndex, reference] of collectUiReferences(gear).entries()) {
						pushMissingUi(`${nodeKey}/gears/${gearIndex}/${reference}`, `${nodePath}.gears.${gearIndex}.${referenceIndex}`, reference, resourceKinds);
					}
				}
			}
			for (const [transitionIndex, transition] of resource.component.transitions.entries()) {
				for (const [itemIndex, item] of transition.items.entries()) {
					for (const [field, value] of [['startValue', item.startValue], ['endValue', item.endValue]] as const) {
						for (const [referenceIndex, reference] of collectUiReferences(value).entries()) {
							pushMissingUi(
								`${pkg.id}/${resource.id}/transitions/${transitionIndex}/${itemIndex}/${field}/${reference}`,
								`${componentPath}.transitions.${transitionIndex}.items.${itemIndex}.${field}.${referenceIndex}`,
								reference,
								resourceKinds,
							);
						}
					}
				}
			}
		}
	}
	return issues;
}

function collectTouchedGroupPaths(project: UamProject, operations: UamTransactionOperation[]): Set<string> {
	const paths = new Set<string>();
	for (const operation of operations) {
		if (operation.kind !== 'setDisplayNodeProps' || operation.props.group === undefined) continue;
		const found = findDisplayNodeSpecWithPath(project, operation.selector);
		if (found) paths.add(`${found.path}.group`);
	}
	return paths;
}

export function validateProjectedState(
	project: UamProject,
	operations: UamTransactionOperation[],
	issues: UamTransactionSupportIssue[],
): void {
	if (issues.length > 0 || !operations.every(isUamNativeOperation)) return;
	let projected: UamProject;
	try {
		projected = applyUamNativeOperations(project, operations);
	} catch {
		return;
	}
	const baselineValidationIssues = new Set(validateUamProject(normalizeUamProject(project))
		.map((issue) => `${issue.path}\0${issue.message}`));
	const touchedGroupPaths = collectTouchedGroupPaths(projected, operations);
	for (const issue of validateUamProject(projected)) {
		if (
			baselineValidationIssues.has(`${issue.path}\0${issue.message}`)
			&& !touchedGroupPaths.has(issue.path)
		) continue;
		pushSupportIssue(
			issues,
			issue.path.endsWith('.group') ? 'invalid_group_reference' : 'invalid_resource_payload',
			issue.path,
			issue.message,
		);
	}
	if (
		operations.some(isLifecycleOperation)
		|| operations.some(isResourceLifecycleOperation)
		|| operations.some(isDisplayListRewriteOperation)
		|| operations.some((operation) => (
			operation.kind === 'setDisplayNodeProps'
			&& operation.props.componentInstanceProperties !== undefined
		))
		|| operations.some((operation) => (
			operation.kind === 'setComponentProps'
			&& operation.props.properties !== undefined
		))
	) {
		const baselineReferenceKeys = new Set(collectProjectedResourceReferenceIssues(normalizeUamProject(project))
			.map((issue) => issue.key));
		for (const issue of collectProjectedResourceReferenceIssues(projected)) {
			if (baselineReferenceKeys.has(issue.key)) continue;
			pushSupportIssue(issues, 'invalid_resource_reference', issue.path, issue.message);
		}
	}
}

export function validateProjectedGroupState(
	project: UamProject,
	operations: UamTransactionOperation[],
	issues: UamTransactionSupportIssue[],
): void {
	if (issues.length > 0 || operations.every(isUamNativeOperation)) return;
	const relevantOperations = operations.filter((operation) => (
		isLifecycleOperation(operation)
		|| isDisplayListRewriteOperation(operation)
		|| (operation.kind === 'setDisplayNodeProps' && operation.props.group !== undefined)
	));
	let projected: UamProject;
	try {
		projected = relevantOperations.length === 0
			? normalizeUamProject(project)
			: applyUamNativeOperations(project, relevantOperations);
	} catch {
		return;
	}
	for (const issue of validateUamProject(projected)) {
		if (!issue.path.endsWith('.group')) continue;
		pushSupportIssue(issues, 'invalid_group_reference', issue.path, issue.message);
	}
}
