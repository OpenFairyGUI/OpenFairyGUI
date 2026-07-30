import type { ProjectSettings } from '../types/settings.js';
import type {
	UamEdgeInsets,
	UamListItemData,
	UamRelation,
} from './model.js';
import { UAM_SUPPORTED_MATERIALIZATION_SCOPE } from './model.js';

export function cloneSettings(settings: ProjectSettings): ProjectSettings {
	return {
		publish: { ...(settings.publish ?? {}) },
		common: { ...(settings.common ?? {}) },
		adaptation: { ...(settings.adaptation ?? {}) },
	};
}

export function ensureSupportedResourceKind(kind: string): void {
	if (!UAM_SUPPORTED_MATERIALIZATION_SCOPE.resourceKinds.includes(kind as never)) {
		throw new Error(`UAM materialization does not support resource kind "${kind}" in Gate A.`);
	}
}

export function ensureSupportedNodeKind(kind: string): void {
	if (!UAM_SUPPORTED_MATERIALIZATION_SCOPE.nodeKinds.includes(kind as never)) {
		throw new Error(`UAM materialization does not support display node kind "${kind}" in Gate A.`);
	}
}

export function ensureSupportedGearKind(kind: string): void {
	if (!UAM_SUPPORTED_MATERIALIZATION_SCOPE.gearKinds.includes(kind as never)) {
		throw new Error(`UAM materialization does not support gear kind "${kind}" in Gate A.`);
	}
}

export function materializeRelations(relations: UamRelation[]): Array<{ target: string; type: number; usePercent: boolean }> {
	return relations.map((relation) => ({
		target: relation.targetNodeId,
		type: relation.type,
		usePercent: relation.usePercent,
	}));
}

export function liftRelations(relations: Array<{ target: string; type: number; usePercent: boolean }>): UamRelation[] {
	return relations.map((relation) => ({
		targetNodeId: relation.target,
		type: relation.type,
		usePercent: relation.usePercent,
	}));
}

export function materializeEdgeInsets(edgeInsets: UamEdgeInsets): [number, number, number, number] {
	return [edgeInsets.top, edgeInsets.bottom, edgeInsets.left, edgeInsets.right];
}

export function liftEdgeInsets(edgeInsets: UamEdgeInsets): UamEdgeInsets {
	return {
		top: edgeInsets.top,
		bottom: edgeInsets.bottom,
		left: edgeInsets.left,
		right: edgeInsets.right,
	};
}

export function cloneListItems(items: UamListItemData[]): UamListItemData[] {
	return items.map((item) => ({ ...item }));
}
