import type { UamPackage, UamProject, UamValidationIssue } from './model.js';

type ResourceKind = UamPackage['resources'][number]['kind'];

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
	if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(collectUiReferences);
	if (typeof value !== 'string') return [];
	return [...value.matchAll(/ui:\/\/[^\s"'<>()[\]{}]+/g)].map((match) => match[0]);
}

export function validateUamReferences(project: UamProject): UamValidationIssue[] {
	const issues: UamValidationIssue[] = [];
	const findResource = (packageId: string, resourceId: string) => (
		project.packages.find((pkg) => pkg.id === packageId)?.resources.find((resource) => resource.id === resourceId)
	);
	const pushMissing = (
		path: string,
		packageId: string,
		resourceId: string,
		expectedKinds: readonly ResourceKind[],
		owner: { packageId: string; resourceId: string; nodeId?: string },
	) => {
		const target = findResource(packageId, resourceId);
		if (target && expectedKinds.includes(target.kind)) return;
		issues.push({
			severity: 'error',
			code: 'dangling_resource_reference',
			path,
			message: `Resource reference "${packageId}/${resourceId}" must target ${expectedKinds.join(' or ')}.`,
			...owner,
		});
	};
	const pushMissingUi = (
		path: string,
		value: string,
		expectedKinds: readonly ResourceKind[],
		owner: { packageId: string; resourceId: string; nodeId?: string },
	) => {
		if (!value.startsWith('ui://')) return;
		const target = findUiResource(project, value);
		if (target && expectedKinds.includes(target.kind)) return;
		issues.push({
			severity: 'error',
			code: 'dangling_resource_reference',
			path,
			message: `Resource reference "${value}" must target ${expectedKinds.join(' or ')}.`,
			...owner,
		});
	};
	const componentKinds = ['component'] as const;
	const visualKinds = ['image', 'movieClip', 'component', 'spine', 'dragonBones'] as const;
	const binaryKinds = ['image', 'sound', 'misc', 'swf', 'font', 'movieClip', 'spine', 'dragonBones'] as const;
	const resourceKinds = [...binaryKinds, 'component'] as const;

	for (const [packageIndex, pkg] of project.packages.entries()) {
		for (const [resourceIndex, resource] of pkg.resources.entries()) {
			const resourcePath = `packages[${packageIndex}].resources[${resourceIndex}]`;
			const owner = { packageId: pkg.id, resourceId: resource.id };
			if (resource.kind === 'font') {
				const textureId = `${resource.metadata?.textureId ?? ''}`;
				if (textureId) pushMissing(`${resourcePath}.metadata.textureId`, pkg.id, textureId, ['image'], owner);
			}
			if (resource.kind === 'spine' || resource.kind === 'dragonBones') {
				const requireIds = Array.isArray(resource.metadata?.requireIds)
					? resource.metadata.requireIds.filter((value): value is string => typeof value === 'string')
					: [];
				for (const [requireIndex, requireId] of requireIds.entries()) {
					pushMissing(`${resourcePath}.metadata.requireIds[${requireIndex}]`, pkg.id, requireId, binaryKinds, owner);
				}
			}
			if (resource.kind !== 'component') continue;

			const componentPath = `${resourcePath}.component`;
			for (const [field, value] of [
				['vtScrollBarRes', resource.component.properties.vtScrollBarRes],
				['hzScrollBarRes', resource.component.properties.hzScrollBarRes],
				['headerRes', resource.component.properties.headerRes],
				['footerRes', resource.component.properties.footerRes],
				['dropdown', resource.component.properties.dropdown],
			] as const) {
				pushMissingUi(`${componentPath}.properties.${field}`, value, componentKinds, owner);
			}
			pushMissingUi(`${componentPath}.properties.sound`, resource.component.properties.sound, ['sound'], owner);
			pushMissingUi(`${componentPath}.properties.designImage`, resource.component.properties.designImage, ['image'], owner);
			for (const field of ['showSound', 'hideSound'] as const) {
				pushMissingUi(`${componentPath}.properties.${field}`, resource.component.properties[field], ['sound'], owner);
			}

			for (const [nodeIndex, node] of resource.component.displayList.entries()) {
				const nodePath = `${componentPath}.displayList[${nodeIndex}]`;
				const nodeOwner = { ...owner, nodeId: node.id };
				if (node.kind === 'image' && node.resource.resourceId) {
					pushMissing(`${nodePath}.resource`, node.resource.packageId || pkg.id, node.resource.resourceId, ['image'], nodeOwner);
				} else if (node.kind === 'movieClip' && node.resource.resourceId) {
					pushMissing(`${nodePath}.resource`, node.resource.packageId || pkg.id, node.resource.resourceId, ['movieClip'], nodeOwner);
				} else if (node.kind === 'component' && node.resource.resourceId) {
					pushMissing(`${nodePath}.resource`, node.resource.packageId || pkg.id, node.resource.resourceId, componentKinds, nodeOwner);
				} else if ('packageId' in node && 'src' in node && node.src) {
					pushMissing(`${nodePath}.src`, node.packageId || pkg.id, node.src, componentKinds, nodeOwner);
				}
				if (node.kind === 'text' || node.kind === 'richText' || node.kind === 'textInput') {
					pushMissingUi(`${nodePath}.font`, node.font, ['font'], nodeOwner);
					for (const [index, reference] of collectUiReferences(node.text).entries()) {
						pushMissingUi(`${nodePath}.text[${index}]`, reference, resourceKinds, nodeOwner);
					}
				}
				if (node.kind === 'loader' || node.kind === 'loader3D') {
					pushMissingUi(`${nodePath}.url`, node.url, visualKinds, nodeOwner);
				}
				if (node.kind === 'list' || node.kind === 'tree') {
					for (const [field, value] of [
						['defaultItem', node.defaultItem],
						['src', node.src],
						['vtScrollBarRes', node.vtScrollBarRes],
						['hzScrollBarRes', node.hzScrollBarRes],
						['headerRes', node.headerRes],
						['footerRes', node.footerRes],
					] as const) {
						pushMissingUi(`${nodePath}.${field}`, value, componentKinds, nodeOwner);
					}
					for (const [itemIndex, item] of node.listItems.entries()) {
						pushMissingUi(`${nodePath}.listItems[${itemIndex}].url`, item.url ?? '', componentKinds, nodeOwner);
						pushMissingUi(`${nodePath}.listItems[${itemIndex}].icon`, item.icon ?? '', visualKinds, nodeOwner);
						pushMissingUi(`${nodePath}.listItems[${itemIndex}].selectedIcon`, item.selectedIcon ?? '', visualKinds, nodeOwner);
					}
				}
				if (node.kind === 'component' && node.instanceProperties) {
					const instance = node.instanceProperties;
					if ('icon' in instance) pushMissingUi(`${nodePath}.instanceProperties.icon`, instance.icon, visualKinds, nodeOwner);
					if (instance.extensionType === 'Button') {
						pushMissingUi(`${nodePath}.instanceProperties.selectedIcon`, instance.selectedIcon, visualKinds, nodeOwner);
					}
					if (instance.extensionType === 'Button'
						|| instance.extensionType === 'Label'
						|| instance.extensionType === 'ComboBox'
						|| instance.extensionType === 'ProgressBar') {
						pushMissingUi(`${nodePath}.instanceProperties.sound`, instance.sound, ['sound'], nodeOwner);
					}
					if (instance.extensionType === 'ComboBox') {
						for (const [itemIndex, item] of instance.items.entries()) {
							pushMissingUi(`${nodePath}.instanceProperties.items[${itemIndex}].icon`, item.icon ?? '', visualKinds, nodeOwner);
						}
					}
				}
				if ('icon' in node) pushMissingUi(`${nodePath}.icon`, node.icon, visualKinds, nodeOwner);
				if ('selectedIcon' in node) pushMissingUi(`${nodePath}.selectedIcon`, node.selectedIcon, visualKinds, nodeOwner);
				if ('icons' in node) {
					for (const [iconIndex, icon] of node.icons.entries()) {
						pushMissingUi(`${nodePath}.icons[${iconIndex}]`, icon, visualKinds, nodeOwner);
					}
				}
				if ('sound' in node) pushMissingUi(`${nodePath}.sound`, node.sound, ['sound'], nodeOwner);
				for (const [gearIndex, gear] of node.gears.entries()) {
					for (const [index, reference] of collectUiReferences(gear).entries()) {
						pushMissingUi(`${nodePath}.gears[${gearIndex}][${index}]`, reference, resourceKinds, nodeOwner);
					}
				}
			}
			for (const [transitionIndex, transition] of resource.component.transitions.entries()) {
				for (const [itemIndex, item] of transition.items.entries()) {
					for (const [field, value] of [['startValue', item.startValue], ['endValue', item.endValue]] as const) {
						for (const [index, reference] of collectUiReferences(value).entries()) {
							pushMissingUi(`${componentPath}.transitions[${transitionIndex}].items[${itemIndex}].${field}[${index}]`, reference, resourceKinds, owner);
						}
					}
				}
			}
		}
	}
	return issues;
}
