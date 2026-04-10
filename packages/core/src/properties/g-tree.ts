import { type Nullable, PropertyType, ListSelectionMode } from '../constants.js';
import { parseURL } from '../utils/id-utils.js';
import { GListBase, type GListItemData, type IListBase } from './g-list.js';
import type { Root } from './root.js';
import type { Component } from './component.js';
import type { Controller } from './controller.js';
import type { GObject } from './g-object.js';
import type { GComponent } from './g-component.js';

export interface IGTree extends IListBase {
	treeView: boolean;
	indent: number;
	clickToExpand: number;
}

export interface GTreeItemTemplateInfo {
	component: Component;
	expandedController: Controller | null;
	leafController: Controller | null;
	titleChild: GObject | null;
	iconChild: GObject | null;
	indentChild: GObject | null;
	expandButtonChild: GComponent | null;
}

export interface GTreeRuntimeNode {
	itemIndex: number;
	level: number;
	sourceLevel: number;
	isFolder: boolean;
	expanded: boolean | null;
	selected: boolean;
	visible: boolean;
	visibleIndex: number | null;
	title: string | null;
	icon: string | null;
	url: string | null;
	name: string | null;
	selectedTitle: string | null;
	selectedIcon: string | null;
	parent: GTreeRuntimeNode | null;
	children: GTreeRuntimeNode[];
}

export interface GTreeInteractionState {
	expandedItemIndices: number[];
	selectedItemIndices: number[];
	lastSelectedItemIndex: number;
}

export type GTreeNavigationDirection = 'up' | 'right' | 'down' | 'left';

/**
 * A tree display object that uses the editor's list XML tag plus `treeView=true`,
 * but maps to the dedicated runtime tree type.
 * @category Properties
 */
export class GTree extends GListBase<IGTree, PropertyType.G_TREE> {
	public declare propertyType: PropertyType.G_TREE;

	protected init(): void {
		this.propertyType = PropertyType.G_TREE;
	}

	protected getDefaults(): Nullable<IGTree> {
		return Object.assign(super.getDefaults(), {
			treeView: true,
			indent: 30,
			clickToExpand: 0,
		});
	}

	public getTreeView(): boolean { return this.get('treeView'); }
	public setTreeView(v: boolean): this { return this.set('treeView', v); }

	public getIndent(): number { return this.get('indent'); }
	public setIndent(v: number): this { return this.set('indent', v); }

	public getClickToExpand(): number { return this.get('clickToExpand'); }
	public setClickToExpand(v: number): this { return this.set('clickToExpand', v); }

	public getDefaultItemComponent(root: Root): Component | null {
		const parsed = parseURL(this.getDefaultItem());
		if (!parsed) return null;
		const pkg = root.getPackageById(parsed.packageId);
		if (!pkg) return null;
		const resource = pkg.getResourceById(parsed.resourceId);
		return resource?.propertyType === PropertyType.COMPONENT ? resource as Component : null;
	}

	public inspectDefaultItemTemplate(root: Root): GTreeItemTemplateInfo | null {
		const component = this.getDefaultItemComponent(root);
		if (!component) return null;
		const expandButton = component.getChild('expandButton');
		return {
			component,
			expandedController: component.getController('expanded'),
			leafController: component.getController('leaf'),
			titleChild: component.getChild('title'),
			iconChild: component.getChild('icon'),
			indentChild: component.getChild('indent'),
			expandButtonChild: expandButton?.propertyType === PropertyType.G_COMPONENT ? expandButton as GComponent : null,
		};
	}

	public createInteractionState(state: Partial<GTreeInteractionState> = {}): GTreeInteractionState {
		const items = this.getListItems();
		const folderIndices = new Set(
			items
				.map((item, index) => ((item.isFolder ?? false) ? index : -1))
				.filter((index) => index >= 0),
		);
		const expandedItemIndices = state.expandedItemIndices
			? state.expandedItemIndices.filter((index) => folderIndices.has(index))
			: Array.from(folderIndices);
		const validNodeIndices = new Set(items.map((_, index) => index));
		const selectedItemIndices = (state.selectedItemIndices ?? []).filter((index) => validNodeIndices.has(index));
		const lastSelectedItemIndex = validNodeIndices.has(state.lastSelectedItemIndex ?? -1)
			? (state.lastSelectedItemIndex as number)
			: (selectedItemIndices.length > 0 ? selectedItemIndices[selectedItemIndices.length - 1]! : -1);
		return {
			expandedItemIndices: Array.from(new Set(expandedItemIndices)),
			selectedItemIndices: Array.from(new Set(selectedItemIndices)),
			lastSelectedItemIndex,
		};
	}

	public buildRuntimeTree(state: Partial<GTreeInteractionState> = {}): GTreeRuntimeNode {
		const interaction = this.createInteractionState(state);
		const expanded = new Set(interaction.expandedItemIndices);
		const selected = new Set(interaction.selectedItemIndices);
		const root: GTreeRuntimeNode = {
			itemIndex: -1,
			level: 0,
			sourceLevel: -1,
			isFolder: true,
			expanded: true,
			selected: false,
			visible: true,
			visibleIndex: null,
			title: null,
			icon: null,
			url: null,
			name: null,
			selectedTitle: null,
			selectedIcon: null,
			parent: null,
			children: [],
		};
		const folderStack: GTreeRuntimeNode[] = [root];
		for (const [index, item] of this.getListItems().entries()) {
			const sourceLevel = Math.max(0, item.level ?? 0);
			while (folderStack.length - 1 > sourceLevel) {
				folderStack.pop();
			}
			const parent = folderStack[folderStack.length - 1] ?? root;
			const node = this._createRuntimeNode(item, index, sourceLevel, parent, expanded, selected);
			parent.children.push(node);
			if (node.isFolder) {
				folderStack[sourceLevel + 1] = node;
				folderStack.length = sourceLevel + 2;
			}
		}
		let visibleIndex = 0;
		const assignVisibleIndex = (node: GTreeRuntimeNode) => {
			for (const child of node.children) {
				if (child.visible) {
					child.visibleIndex = visibleIndex;
					visibleIndex += 1;
				}
				assignVisibleIndex(child);
			}
		};
		assignVisibleIndex(root);
		return root;
	}

	public listRuntimeNodes(state: Partial<GTreeInteractionState> = {}): GTreeRuntimeNode[] {
		const result: GTreeRuntimeNode[] = [];
		const visit = (node: GTreeRuntimeNode) => {
			for (const child of node.children) {
				result.push(child);
				visit(child);
			}
		};
		visit(this.buildRuntimeTree(state));
		return result;
	}

	public listVisibleRuntimeNodes(state: Partial<GTreeInteractionState> = {}): GTreeRuntimeNode[] {
		return this.listRuntimeNodes(state).filter((node) => node.visible);
	}

	public getRuntimeNode(itemIndex: number, state: Partial<GTreeInteractionState> = {}): GTreeRuntimeNode | null {
		return this.listRuntimeNodes(state).find((node) => node.itemIndex === itemIndex) ?? null;
	}

	public getSelectedRuntimeNode(state: Partial<GTreeInteractionState> = {}): GTreeRuntimeNode | null {
		return this.listRuntimeNodes(state).find((node) => node.selected) ?? null;
	}

	public getSelectedRuntimeNodes(state: Partial<GTreeInteractionState> = {}): GTreeRuntimeNode[] {
		return this.listRuntimeNodes(state).filter((node) => node.selected);
	}

	public setRuntimeNodeExpanded(
		state: Partial<GTreeInteractionState>,
		itemIndex: number,
		expanded: boolean,
	): GTreeInteractionState {
		const interaction = this.createInteractionState(state);
		const node = this.getRuntimeNode(itemIndex, interaction);
		if (!node?.isFolder) return interaction;
		const nextExpanded = new Set(interaction.expandedItemIndices);
		if (expanded) {
			nextExpanded.add(itemIndex);
		} else {
			nextExpanded.delete(itemIndex);
		}
		return {
			expandedItemIndices: Array.from(nextExpanded),
			selectedItemIndices: interaction.selectedItemIndices.slice(),
			lastSelectedItemIndex: interaction.lastSelectedItemIndex,
		};
	}

	public toggleRuntimeNodeExpanded(
		state: Partial<GTreeInteractionState>,
		itemIndex: number,
	): GTreeInteractionState {
		const interaction = this.createInteractionState(state);
		const node = this.getRuntimeNode(itemIndex, interaction);
		if (!node?.isFolder) return interaction;
		return this.setRuntimeNodeExpanded(interaction, itemIndex, !node.expanded);
	}

	public expandAll(state: Partial<GTreeInteractionState> = {}): GTreeInteractionState {
		const interaction = this.createInteractionState(state);
		return {
			expandedItemIndices: this.listRuntimeNodes(interaction).filter((node) => node.isFolder).map((node) => node.itemIndex),
			selectedItemIndices: interaction.selectedItemIndices.slice(),
			lastSelectedItemIndex: interaction.lastSelectedItemIndex,
		};
	}

	public collapseAll(state: Partial<GTreeInteractionState> = {}): GTreeInteractionState {
		const interaction = this.createInteractionState(state);
		return {
			expandedItemIndices: [],
			selectedItemIndices: interaction.selectedItemIndices.slice(),
			lastSelectedItemIndex: interaction.lastSelectedItemIndex,
		};
	}

	public selectRuntimeNode(
		state: Partial<GTreeInteractionState>,
		itemIndex: number,
		append = false,
	): GTreeInteractionState {
		const interaction = this.createInteractionState(state);
		const node = this.getRuntimeNode(itemIndex, interaction);
		if (!node) return interaction;

		const expanded = new Set(interaction.expandedItemIndices);
		let cursor = node.parent;
		while (cursor && cursor.itemIndex >= 0) {
			if (cursor.isFolder) expanded.add(cursor.itemIndex);
			cursor = cursor.parent;
		}

		let selectedItemIndices: number[] = [];
		if (this.getSelectionMode() !== ListSelectionMode.None) {
			if (append && (
				this.getSelectionMode() === ListSelectionMode.Multiple
				|| this.getSelectionMode() === ListSelectionMode.MultipleSingleClick
			)) {
				selectedItemIndices = Array.from(new Set([...interaction.selectedItemIndices, itemIndex]));
			} else {
				selectedItemIndices = [itemIndex];
			}
		}

		return {
			expandedItemIndices: Array.from(expanded),
			selectedItemIndices,
			lastSelectedItemIndex: itemIndex,
		};
	}

	public unselectRuntimeNode(
		state: Partial<GTreeInteractionState>,
		itemIndex: number,
	): GTreeInteractionState {
		const interaction = this.createInteractionState(state);
		return {
			expandedItemIndices: interaction.expandedItemIndices.slice(),
			selectedItemIndices: interaction.selectedItemIndices.filter((index) => index !== itemIndex),
			lastSelectedItemIndex: interaction.lastSelectedItemIndex,
		};
	}

	public clearRuntimeSelection(state: Partial<GTreeInteractionState> = {}): GTreeInteractionState {
		const interaction = this.createInteractionState(state);
		return {
			expandedItemIndices: interaction.expandedItemIndices.slice(),
			selectedItemIndices: [],
			lastSelectedItemIndex: interaction.lastSelectedItemIndex,
		};
	}

	public selectAllVisibleRuntimeNodes(state: Partial<GTreeInteractionState> = {}): GTreeInteractionState {
		const interaction = this.createInteractionState(state);
		if (
			this.getSelectionMode() === ListSelectionMode.None
			|| this.getSelectionMode() === ListSelectionMode.Single
		) {
			return interaction;
		}
		const visibleNodes = this.listVisibleRuntimeNodes(interaction);
		return {
			expandedItemIndices: interaction.expandedItemIndices.slice(),
			selectedItemIndices: visibleNodes.map((node) => node.itemIndex),
			lastSelectedItemIndex: visibleNodes.length > 0 ? visibleNodes[visibleNodes.length - 1]!.itemIndex : interaction.lastSelectedItemIndex,
		};
	}

	public selectReverseVisibleRuntimeNodes(state: Partial<GTreeInteractionState> = {}): GTreeInteractionState {
		const interaction = this.createInteractionState(state);
		if (
			this.getSelectionMode() === ListSelectionMode.None
			|| this.getSelectionMode() === ListSelectionMode.Single
		) {
			return interaction;
		}
		const selected = new Set(interaction.selectedItemIndices);
		const visibleNodes = this.listVisibleRuntimeNodes(interaction);
		const selectedItemIndices = visibleNodes
			.filter((node) => !selected.has(node.itemIndex))
			.map((node) => node.itemIndex);
		return {
			expandedItemIndices: interaction.expandedItemIndices.slice(),
			selectedItemIndices,
			lastSelectedItemIndex: selectedItemIndices.length > 0
				? selectedItemIndices[selectedItemIndices.length - 1]!
				: interaction.lastSelectedItemIndex,
		};
	}

	public selectRuntimeRange(
		state: Partial<GTreeInteractionState>,
		itemIndex: number,
		anchorItemIndex?: number,
		append = true,
	): GTreeInteractionState {
		const interaction = this.createInteractionState(state);
		if (
			this.getSelectionMode() === ListSelectionMode.None
			|| this.getSelectionMode() === ListSelectionMode.Single
		) {
			return this.selectRuntimeNode(interaction, itemIndex);
		}
		const range = this._collectSelectionRange(interaction, anchorItemIndex ?? interaction.lastSelectedItemIndex, itemIndex);
		if (range.length === 0) {
			return this.selectRuntimeNode(interaction, itemIndex, append);
		}
		const selected = append ? new Set(interaction.selectedItemIndices) : new Set<number>();
		for (const index of range) selected.add(index);
		return {
			expandedItemIndices: interaction.expandedItemIndices.slice(),
			selectedItemIndices: Array.from(selected),
			lastSelectedItemIndex: interaction.lastSelectedItemIndex,
		};
	}

	public setSelectionOnRuntimeNode(
		state: Partial<GTreeInteractionState>,
		itemIndex: number,
		options: { shiftKey?: boolean; ctrlKey?: boolean } = {},
	): GTreeInteractionState {
		const interaction = this.createInteractionState(state);
		const node = this.getRuntimeNode(itemIndex, interaction);
		if (!node || this.getSelectionMode() === ListSelectionMode.None) return interaction;

		if (this.getSelectionMode() === ListSelectionMode.Single) {
			return this.selectRuntimeNode(interaction, itemIndex);
		}

		if (options.shiftKey) {
			if (!node.selected && interaction.lastSelectedItemIndex !== -1) {
				return this.selectRuntimeRange(interaction, itemIndex, interaction.lastSelectedItemIndex, true);
			}
			if (!node.selected) {
				return this.selectRuntimeNode(interaction, itemIndex);
			}
			return interaction;
		}

		if (options.ctrlKey || this.getSelectionMode() === ListSelectionMode.MultipleSingleClick) {
			const selected = new Set(interaction.selectedItemIndices);
			if (selected.has(itemIndex)) selected.delete(itemIndex);
			else selected.add(itemIndex);
			return {
				expandedItemIndices: interaction.expandedItemIndices.slice(),
				selectedItemIndices: Array.from(selected),
				lastSelectedItemIndex: itemIndex,
			};
		}

		return {
			expandedItemIndices: interaction.expandedItemIndices.slice(),
			selectedItemIndices: [itemIndex],
			lastSelectedItemIndex: itemIndex,
		};
	}

	public navigateRuntimeSelection(
		state: Partial<GTreeInteractionState>,
		direction: GTreeNavigationDirection,
	): GTreeInteractionState {
		const interaction = this.createInteractionState(state);
		const current = this._getNavigationAnchorNode(interaction);
		if (!current) return interaction;

		switch (direction) {
			case 'up':
			case 'down': {
				const visibleNodes = this.listVisibleRuntimeNodes(interaction);
				const currentVisibleIndex = visibleNodes.findIndex((node) => node.itemIndex === current.itemIndex);
				if (currentVisibleIndex < 0) return interaction;
				const nextVisibleIndex = direction === 'up' ? currentVisibleIndex - 1 : currentVisibleIndex + 1;
				const nextNode = visibleNodes[nextVisibleIndex];
				if (!nextNode) return interaction;
				return this.selectRuntimeNode(interaction, nextNode.itemIndex);
			}
			case 'right': {
				if (current.isFolder) {
					if (!current.expanded) {
						return this.setRuntimeNodeExpanded(interaction, current.itemIndex, true);
					}
					const firstVisibleChild = current.children.find((child) => child.visible);
					if (firstVisibleChild) {
						return this.selectRuntimeNode(interaction, firstVisibleChild.itemIndex);
					}
				}
				return interaction;
			}
			case 'left': {
				if (current.isFolder && current.expanded) {
					return this.setRuntimeNodeExpanded(interaction, current.itemIndex, false);
				}
				if (current.parent && current.parent.itemIndex >= 0) {
					return this.selectRuntimeNode(interaction, current.parent.itemIndex);
				}
				return interaction;
			}
			default:
				return interaction;
		}
	}

	private _createRuntimeNode(
		item: GListItemData,
		index: number,
		sourceLevel: number,
		parent: GTreeRuntimeNode,
		expanded: Set<number>,
		selected: Set<number>,
	): GTreeRuntimeNode {
		const isFolder = item.isFolder ?? false;
		return {
			itemIndex: index,
			level: parent.level + 1,
			sourceLevel,
			isFolder,
			expanded: isFolder ? expanded.has(index) : null,
			selected: selected.has(index),
			visible: parent.visible && (parent.itemIndex < 0 || parent.expanded === true),
			visibleIndex: null,
			title: item.title ?? null,
			icon: item.icon ?? null,
			url: item.url ?? null,
			name: item.name ?? null,
			selectedTitle: item.selectedTitle ?? null,
			selectedIcon: item.selectedIcon ?? null,
			parent,
			children: [],
		};
	}

	private _collectSelectionRange(
		state: GTreeInteractionState,
		anchorItemIndex: number,
		targetItemIndex: number,
	): number[] {
		const visibleNodes = this.listVisibleRuntimeNodes(state);
		const visibleIndices = new Map(visibleNodes.map((node, index) => [node.itemIndex, index]));
		const anchorVisibleIndex = visibleIndices.get(anchorItemIndex);
		const targetVisibleIndex = visibleIndices.get(targetItemIndex);
		if (anchorVisibleIndex !== undefined && targetVisibleIndex !== undefined) {
			const min = Math.min(anchorVisibleIndex, targetVisibleIndex);
			const max = Math.max(anchorVisibleIndex, targetVisibleIndex);
			return visibleNodes.slice(min, max + 1).map((node) => node.itemIndex);
		}

		const allNodes = this.listRuntimeNodes(state);
		const allIndices = new Map(allNodes.map((node, index) => [node.itemIndex, index]));
		const anchorIndex = allIndices.get(anchorItemIndex);
		const targetIndex = allIndices.get(targetItemIndex);
		if (anchorIndex === undefined || targetIndex === undefined) return [];
		const min = Math.min(anchorIndex, targetIndex);
		const max = Math.max(anchorIndex, targetIndex);
		return allNodes.slice(min, max + 1).map((node) => node.itemIndex);
	}

	private _getNavigationAnchorNode(state: GTreeInteractionState): GTreeRuntimeNode | null {
		if (state.lastSelectedItemIndex >= 0) {
			const lastSelected = this.getRuntimeNode(state.lastSelectedItemIndex, state);
			if (lastSelected) return lastSelected;
		}
		return this.getSelectedRuntimeNode(state);
	}

}
