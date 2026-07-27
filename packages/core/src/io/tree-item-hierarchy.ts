interface TreeItemHierarchyLike {
	level?: number;
	isFolder?: boolean | null;
}

/**
 * Resolves a tree item's folder state using the editor's flat hierarchy rules.
 *
 * Explicit values take precedence. An unspecified item is a folder only when
 * the following item is nested more deeply; trailing items are leaves.
 */
export function resolveTreeItemIsFolder(
	items: readonly TreeItemHierarchyLike[],
	index: number,
): boolean {
	const item = items[index];
	if (!item) return false;
	if (item.isFolder !== undefined && item.isFolder !== null) return item.isFolder;

	const next = items[index + 1];
	return next !== undefined && (next.level ?? 0) > (item.level ?? 0);
}
