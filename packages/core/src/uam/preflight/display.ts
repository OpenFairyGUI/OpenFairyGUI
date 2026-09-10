import type {
	UamDisplayNode,
	UamGraphProperties,
	UamGroupProperties,
	UamListItemData,
	UamListProperties,
	UamLoader3DProperties,
	UamLoaderProperties,
	UamProject,
	UamTreeProperties,
} from '../model.js';
import { isFiniteUamPoint, isUamColor as isColor } from '../property-rules/values.js';
import { isValidUamTextProperties } from '../property-rules/text.js';
import { isValidUamImageProperties, isValidUamMovieClipProperties } from '../property-rules/image.js';
import { isValidUamComponentInstanceProperties, isValidUamComponentPropertyOverride } from '../property-rules/component-instance.js';
import type {
	UamDisplayNodePropsUpdate,
	SetDisplayNodePropsOperation,
	UamTransactionSupportIssue,
} from '../transaction-contracts.js';
import { findDisplayNodeSpec, GROUPABLE_DISPLAY_NODE_KINDS, TEXT_DISPLAY_NODE_KINDS } from '../transaction-shared.js';
import { applyDisplayNodePropsUpdate } from '../property-updates.js';
import { pushSupportIssue } from './support.js';
import { hasExactKeys, isFiniteNumber, stableJson, isIntegerBetween } from './values.js';

const COMMON_DISPLAY_PROP_KEYS = new Set<keyof UamDisplayNodePropsUpdate>([
	'position',
	'size',
	'locked',
	'aspect',
	'minSize',
	'maxSize',
	'scale',
	'skew',
	'visible',
	'touchable',
	'grayed',
	'alpha',
	'rotation',
	'tooltips',
	'blendMode',
	'filter',
	'filterData',
	'customData',
]);

const TEXT_DISPLAY_PROP_KEYS = new Set<keyof UamDisplayNodePropsUpdate>([
	'text',
	'font',
	'fontSize',
	'color',
]);

const LOADER_3D_PROPERTY_KEYS = new Set<keyof UamLoader3DProperties>([
	'url',
	'fill',
	'shrinkOnly',
	'autoSize',
	'align',
	'vAlign',
	'animationName',
	'skinName',
	'playing',
	'frame',
	'loop',
	'color',
	'clearOnPublish',
]);

const GRAPH_PROPERTY_KEYS = [
	'graphType',
	'lineSize',
	'lineColor',
	'fillColor',
	'cornerRadius',
	'points',
	'sides',
	'startAngle',
	'distances',
] as const satisfies readonly (keyof UamGraphProperties)[];

const LOADER_PROPERTY_KEYS = [
	'url',
	'fill',
	'shrinkOnly',
	'autoSize',
	'useResize',
	'showErrorSign',
	'align',
	'vAlign',
	'frame',
	'playing',
	'color',
	'fillMethod',
	'fillOrigin',
	'fillClockwise',
	'fillAmount',
	'clearOnPublish',
] as const satisfies readonly (keyof UamLoaderProperties)[];

const GROUP_PROPERTY_KEYS = [
	'layout',
	'lineGap',
	'columnGap',
	'advanced',
	'excludeInvisibles',
	'autoSizeDisabled',
	'mainGridIndex',
] as const satisfies readonly (keyof UamGroupProperties)[];

const LIST_PROPERTY_KEYS = [
	'layout',
	'align',
	'vAlign',
	'lineGap',
	'columnGap',
	'lineCount',
	'columnCount',
	'selectionMode',
	'defaultItem',
	'autoResizeItem',
	'childrenRenderOrder',
	'apexIndex',
	'src',
	'overflow',
	'scrollType',
	'scrollBarDisplay',
	'scrollBarFlags',
	'scrollBarMargin',
	'vtScrollBarRes',
	'hzScrollBarRes',
	'headerRes',
	'footerRes',
	'margin',
	'clipSoftness',
	'scrollItemToViewOnClick',
	'foldInvisibleItems',
	'autoClearItems',
	'listItems',
	'pageController',
	'controllerOverrides',
	'selectionController',
] as const satisfies readonly (keyof UamListProperties)[];

const TREE_PROPERTY_KEYS = [
	...LIST_PROPERTY_KEYS,
	'treeView',
	'indent',
	'clickToExpand',
] as const satisfies readonly (keyof UamTreeProperties)[];

function isFiniteNumberArrayOrNull(value: unknown, length?: number): value is number[] | null {
	return value === null || (
		Array.isArray(value)
		&& (length === undefined || value.length === length)
		&& value.every(isFiniteNumber)
	);
}

function isFiniteEdgeInsets(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;
	const insets = value as { top?: unknown; bottom?: unknown; left?: unknown; right?: unknown };
	return [insets.top, insets.bottom, insets.left, insets.right].every(isFiniteNumber);
}

function isFiniteSize(value: unknown): value is { width: number; height: number } {
	if (!value || typeof value !== 'object') return false;
	const size = value as { width?: unknown; height?: unknown };
	return isFiniteNumber(size.width) && isFiniteNumber(size.height);
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isValidListItem(value: unknown): value is UamListItemData {
	if (!value || typeof value !== 'object') return false;
	const item = value as UamListItemData;
	const keys = Object.keys(item);
	if (keys.length < 8 || keys.length > 10 || keys.some((key) => ![
		'title',
		'icon',
		'url',
		'name',
		'selectedTitle',
		'selectedIcon',
		'level',
		'isFolder',
		'controllers',
		'propertyOverrides',
	].includes(key))) return false;
	return [
		item.title,
		item.icon,
		item.url,
		item.name,
		item.selectedTitle,
		item.selectedIcon,
	].every(isNullableString)
		&& Number.isInteger(item.level)
		&& item.level >= 0
		&& (item.isFolder === null || typeof item.isFolder === 'boolean')
		&& (item.controllers === undefined || isNullableString(item.controllers))
		&& (item.propertyOverrides === undefined
			|| (Array.isArray(item.propertyOverrides)
				&& item.propertyOverrides.every(isValidUamComponentPropertyOverride)));
}

function isValidGraphProperties(value: unknown): value is UamGraphProperties {
	if (!value || typeof value !== 'object' || !hasExactKeys(value, GRAPH_PROPERTY_KEYS)) return false;
	const properties = value as UamGraphProperties;
	return [properties.lineSize, properties.startAngle].every(isFiniteNumber)
		&& isIntegerBetween(properties.graphType, 0, 4)
		&& isColor(properties.lineColor)
		&& isColor(properties.fillColor)
		&& isFiniteNumberArrayOrNull(properties.cornerRadius, 4)
		&& isFiniteNumberArrayOrNull(properties.points)
		&& Number.isInteger(properties.sides)
		&& properties.sides >= 0
		&& isFiniteNumberArrayOrNull(properties.distances)
		&& (properties.sides > 0 || (properties.startAngle === 0 && properties.distances === null));
}

function isValidLoaderProperties(value: unknown): value is UamLoaderProperties {
	if (!value || typeof value !== 'object' || !hasExactKeys(value, LOADER_PROPERTY_KEYS)) return false;
	const properties = value as UamLoaderProperties;
	return typeof properties.url === 'string'
		&& isIntegerBetween(properties.fill, 0, 5)
		&& [properties.shrinkOnly, properties.autoSize, properties.useResize, properties.showErrorSign, properties.playing,
			properties.fillClockwise, properties.clearOnPublish].every((item) => typeof item === 'boolean')
		&& isIntegerBetween(properties.align, 0, 2)
		&& isIntegerBetween(properties.vAlign, 0, 2)
		&& Number.isInteger(properties.frame)
		&& properties.frame >= 0
		&& isColor(properties.color)
		&& isIntegerBetween(properties.fillMethod, 0, 5)
		&& isIntegerBetween(properties.fillOrigin, 0, 3)
		&& isFiniteNumber(properties.fillAmount)
		&& (properties.fillMethod !== 0 || (
			properties.fillOrigin === 0
			&& properties.fillClockwise
			&& properties.fillAmount === 100
		));
}

function isValidGroupProperties(value: unknown): value is UamGroupProperties {
	if (!value || typeof value !== 'object' || !hasExactKeys(value, GROUP_PROPERTY_KEYS)) return false;
	const properties = value as UamGroupProperties;
	if (!isIntegerBetween(properties.layout, 0, 2)
		|| ![properties.lineGap, properties.columnGap].every(isFiniteNumber)
		|| ![properties.advanced, properties.excludeInvisibles, properties.autoSizeDisabled]
			.every((item) => typeof item === 'boolean')
		|| !Number.isInteger(properties.mainGridIndex)
		|| properties.mainGridIndex < -1
	) return false;
	if (!properties.advanced) {
		return properties.layout === 0
			&& properties.lineGap === 0
			&& properties.columnGap === 0
			&& !properties.excludeInvisibles
			&& !properties.autoSizeDisabled
			&& properties.mainGridIndex === -1;
	}
	if (properties.layout === 0) {
		return properties.lineGap === 0
			&& properties.columnGap === 0
			&& !properties.excludeInvisibles
			&& !properties.autoSizeDisabled
			&& properties.mainGridIndex === -1;
	}
	return true;
}

function isValidListProperties(
	value: unknown,
	nodeKind: UamDisplayNode['kind'] | undefined,
): value is UamListProperties | UamTreeProperties {
	const keys = nodeKind === 'tree' ? TREE_PROPERTY_KEYS : LIST_PROPERTY_KEYS;
	if (!value || typeof value !== 'object' || !hasExactKeys(value, keys)) return false;
	const properties = value as UamTreeProperties;
	const validCounts = (
		(properties.layout === 0 || properties.layout === 1)
			? properties.lineCount === 0 && properties.columnCount === 0
			: properties.layout === 2
				? properties.lineCount === 0
				: properties.layout === 3
					? properties.columnCount === 0
					: true
	);
	const validListProperties = [
		properties.defaultItem,
		properties.src,
		properties.vtScrollBarRes,
		properties.hzScrollBarRes,
		properties.headerRes,
		properties.footerRes,
		properties.pageController,
		properties.controllerOverrides,
		properties.selectionController,
	].every((item) => typeof item === 'string')
		&& isIntegerBetween(properties.layout, 0, 4)
		&& isIntegerBetween(properties.align, 0, 2)
		&& isIntegerBetween(properties.vAlign, 0, 2)
		&& [properties.lineGap, properties.columnGap].every(isFiniteNumber)
		&& [properties.lineCount, properties.columnCount].every((item) => Number.isInteger(item) && item >= 0)
		&& validCounts
		&& isIntegerBetween(properties.selectionMode, 0, 3)
		&& [properties.autoResizeItem, properties.scrollItemToViewOnClick, properties.foldInvisibleItems, properties.autoClearItems]
			.every((item) => typeof item === 'boolean')
		&& isIntegerBetween(properties.childrenRenderOrder, 0, 2)
		&& Number.isInteger(properties.apexIndex)
		&& (properties.childrenRenderOrder === 2 || properties.apexIndex === 0)
		&& isIntegerBetween(properties.overflow, 0, 2)
		&& isIntegerBetween(properties.scrollType, 0, 2)
		&& isIntegerBetween(properties.scrollBarDisplay, 0, 3)
		&& Number.isInteger(properties.scrollBarFlags)
		&& properties.scrollBarFlags >= 0
		&& isFiniteEdgeInsets(properties.scrollBarMargin)
		&& isFiniteEdgeInsets(properties.margin)
		&& isFiniteUamPoint(properties.clipSoftness)
		&& Array.isArray(properties.listItems)
		&& properties.listItems.every(isValidListItem);
	if (!validListProperties || nodeKind !== 'tree') return validListProperties;
	return properties.treeView === true
		&& isFiniteNumber(properties.indent)
		&& properties.indent >= 0
		&& isIntegerBetween(properties.clickToExpand, 0, 2)
		&& properties.listItems.every((item) => typeof item.isFolder === 'boolean');
}

function isValidLoader3DProperties(value: unknown): value is UamLoader3DProperties {
	if (!value || typeof value !== 'object') return false;
	const properties = value as UamLoader3DProperties;
	const keys = Object.keys(properties);
	return keys.length === LOADER_3D_PROPERTY_KEYS.size
		&& keys.every((key) => LOADER_3D_PROPERTY_KEYS.has(key as keyof UamLoader3DProperties))
		&& [properties.url, properties.animationName, properties.skinName].every((candidate) => typeof candidate === 'string')
		&& Number.isInteger(properties.fill) && properties.fill >= 0 && properties.fill <= 5
		&& [properties.shrinkOnly, properties.autoSize, properties.playing, properties.loop, properties.clearOnPublish]
			.every((candidate) => typeof candidate === 'boolean')
		&& Number.isInteger(properties.align) && properties.align >= 0 && properties.align <= 2
		&& Number.isInteger(properties.vAlign) && properties.vAlign >= 0 && properties.vAlign <= 2
		&& Number.isInteger(properties.frame) && properties.frame >= 0
		&& isColor(properties.color);
}

export function validateDisplayPropsPayload(
	op: SetDisplayNodePropsOperation,
	project: UamProject,
	path: string,
	issues: UamTransactionSupportIssue[],
): void {
	const initialIssueCount = issues.length;
	const node = findDisplayNodeSpec(project, op.selector);
	const nodeKind = node?.kind;
	const hasTextProperties = op.props.textProperties !== undefined;
	const hasTextOverrides = [...TEXT_DISPLAY_PROP_KEYS].some((key) => op.props[key] !== undefined);
	if (hasTextProperties && hasTextOverrides) {
		pushSupportIssue(
			issues,
			'invalid_display_node_payload',
			`${path}.props`,
			'textProperties cannot be combined with individual text property overrides.',
			{ operationKind: op.kind, nodeKind },
		);
	}
	const commonValueIssue = (field: keyof UamDisplayNodePropsUpdate, message: string) => pushSupportIssue(
		issues,
		'invalid_display_node_payload',
		`${path}.props.${String(field)}`,
		message,
		{ operationKind: op.kind, nodeKind, field: String(field) },
	);
	if (op.props.position !== undefined && !isFiniteUamPoint(op.props.position)) {
		commonValueIssue('position', 'Display node position must contain finite x and y numbers.');
	}
	if (op.props.size !== undefined && (!isFiniteSize(op.props.size) || op.props.size.width < 0 || op.props.size.height < 0)) {
		commonValueIssue('size', 'Display node size must contain finite non-negative width and height values.');
	}
	for (const field of ['locked', 'aspect', 'visible', 'touchable', 'grayed'] as const) {
		if (op.props[field] !== undefined && typeof op.props[field] !== 'boolean') {
			commonValueIssue(field, `Display node ${field} must be boolean.`);
		}
	}
	for (const field of ['scale', 'skew'] as const) {
		if (op.props[field] !== undefined && !isFiniteUamPoint(op.props[field])) {
			commonValueIssue(field, `Display node ${field} must contain finite x and y numbers.`);
		}
	}
	const minSize = op.props.minSize ?? node?.minSize;
	const maxSize = op.props.maxSize ?? node?.maxSize;
	for (const [field, value] of [['minSize', op.props.minSize], ['maxSize', op.props.maxSize]] as const) {
		if (value !== undefined && (!isFiniteSize(value) || value.width < 0 || value.height < 0)) {
			commonValueIssue(field, `Display node ${field} must contain finite non-negative width and height values.`);
		}
	}
	if (isFiniteSize(minSize) && isFiniteSize(maxSize)) {
		if (maxSize.width > 0 && maxSize.width < minSize.width) {
			commonValueIssue('maxSize', 'Display node maxSize.width must be zero or at least minSize.width.');
		}
		if (maxSize.height > 0 && maxSize.height < minSize.height) {
			commonValueIssue('maxSize', 'Display node maxSize.height must be zero or at least minSize.height.');
		}
	}
	if (op.props.alpha !== undefined && (!isFiniteNumber(op.props.alpha) || op.props.alpha < 0 || op.props.alpha > 1)) {
		commonValueIssue('alpha', 'Display node alpha must be a finite number between 0 and 1.');
	}
	if (op.props.rotation !== undefined && !isFiniteNumber(op.props.rotation)) {
		commonValueIssue('rotation', 'Display node rotation must be finite.');
	}
	for (const field of ['tooltips', 'filter', 'filterData', 'customData'] as const) {
		if (op.props[field] !== undefined && typeof op.props[field] !== 'string') {
			commonValueIssue(field, `Display node ${field} must be a string.`);
		}
	}
	if (op.props.blendMode !== undefined
		&& !['normal', 'none', 'add', 'multiply', 'screen', 'erase'].includes(op.props.blendMode)
	) {
		commonValueIssue('blendMode', `Unsupported display node blendMode "${op.props.blendMode}".`);
	}
	const filter = op.props.filter ?? node?.filter ?? '';
	const filterData = op.props.filterData ?? node?.filterData ?? '';
	if (filter !== '' && filter !== 'color') {
		commonValueIssue('filter', `Unsupported display node filter "${filter}".`);
	} else if (filter === 'color') {
		const values = filterData.split(',').map((part) => Number(part.trim()));
		if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
			commonValueIssue('filterData', 'Color filterData must contain four finite comma-separated numbers.');
		}
	} else if (filterData !== '') {
		commonValueIssue('filterData', 'filterData must be empty when filter is empty.');
	}
	for (const key of Object.keys(op.props) as Array<keyof UamDisplayNodePropsUpdate>) {
		if (key === 'pivot') {
			if (!isFiniteUamPoint(op.props.pivot)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.pivot`,
					'Display node pivot must contain finite x and y numbers.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'pivotAsAnchor') {
			if (typeof op.props.pivotAsAnchor !== 'boolean') {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.pivotAsAnchor`,
					'Display node pivotAsAnchor must be boolean.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'group') {
			if (nodeKind && !GROUPABLE_DISPLAY_NODE_KINDS.has(nodeKind)) {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.group`,
					'Group references are not supported on loader or loader3D display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (typeof op.props.group !== 'string') {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.group`,
					'Display node group must be a string.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'graphProperties') {
			if (nodeKind && nodeKind !== 'graph') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.graphProperties`,
					'Graph properties are only supported on graph display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (!isValidGraphProperties(op.props.graphProperties)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.graphProperties`,
					'Graph properties must be a complete valid graph property snapshot.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'groupProperties') {
			if (nodeKind && nodeKind !== 'group') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.groupProperties`,
					'Group properties are only supported on group display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (!isValidGroupProperties(op.props.groupProperties)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.groupProperties`,
					'Group properties must be a complete valid group property snapshot.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'imageProperties') {
			if (nodeKind && nodeKind !== 'image') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.imageProperties`,
					'Image properties are only supported on image display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (!isValidUamImageProperties(op.props.imageProperties)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.imageProperties`,
					'Image properties must be a complete valid image property snapshot.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'movieClipProperties') {
			if (nodeKind && nodeKind !== 'movieClip') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.movieClipProperties`,
					'MovieClip properties are only supported on movieClip display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (!isValidUamMovieClipProperties(op.props.movieClipProperties)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.movieClipProperties`,
					'MovieClip properties must be a complete valid MovieClip property snapshot.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'loaderProperties') {
			if (nodeKind && nodeKind !== 'loader') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.loaderProperties`,
					'Loader properties are only supported on loader display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (!isValidLoaderProperties(op.props.loaderProperties)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.loaderProperties`,
					'Loader properties must be a complete valid loader property snapshot.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'listProperties') {
			if (nodeKind && nodeKind !== 'list' && nodeKind !== 'tree') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.listProperties`,
					'List properties are only supported on list or tree display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (!isValidListProperties(op.props.listProperties, nodeKind)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.listProperties`,
					'List properties must be a complete snapshot matching the target list or tree node.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'loader3DProperties') {
			if (nodeKind && nodeKind !== 'loader3D') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.loader3DProperties`,
					'Loader3D properties are only supported on loader3D display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (!isValidLoader3DProperties(op.props.loader3DProperties)) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.loader3DProperties`,
					'Loader3D properties must be a complete valid Loader3D property snapshot.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'componentInstanceProperties') {
			if (nodeKind && nodeKind !== 'component') {
				pushSupportIssue(
					issues,
					'unsupported_display_node_field',
					`${path}.props.componentInstanceProperties`,
					'Component instance properties are only supported on component reference nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (op.props.componentInstanceProperties !== null
				&& !isValidUamComponentInstanceProperties(op.props.componentInstanceProperties)
			) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.componentInstanceProperties`,
					'Component instance properties must be null or a complete valid extension snapshot.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (key === 'textProperties') {
			if (nodeKind && !TEXT_DISPLAY_NODE_KINDS.has(nodeKind)) {
				pushSupportIssue(
					issues,
					'unsupported_text_field_target',
					`${path}.props.textProperties`,
					'Text properties are only supported on text, richText, or textInput display nodes.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			} else if (
				nodeKind
				&& TEXT_DISPLAY_NODE_KINDS.has(nodeKind)
				&& !isValidUamTextProperties(
					op.props.textProperties,
					nodeKind as 'text' | 'richText' | 'textInput',
				)
			) {
				pushSupportIssue(
					issues,
					'invalid_display_node_payload',
					`${path}.props.textProperties`,
					'Text properties must be a complete valid snapshot matching the target text node kind.',
					{ operationKind: op.kind, nodeKind, field: key },
				);
			}
			continue;
		}
		if (COMMON_DISPLAY_PROP_KEYS.has(key)) continue;
		if (TEXT_DISPLAY_PROP_KEYS.has(key)) {
			if (nodeKind && !TEXT_DISPLAY_NODE_KINDS.has(nodeKind)) {
				pushSupportIssue(
					issues,
					'unsupported_text_field_target',
					`${path}.props.${String(key)}`,
					`Field "${String(key)}" is only supported on text, richText, or textInput display nodes.`,
					{ operationKind: op.kind, nodeKind, field: String(key) },
				);
			}
			continue;
		}
		pushSupportIssue(
			issues,
			'unsupported_display_node_field',
			`${path}.props.${String(key)}`,
			`Field "${String(key)}" is not supported by setDisplayNodeProps in Phase A.`,
			{ operationKind: op.kind, nodeKind, field: String(key) },
		);
	}
	if (node && issues.length === initialIssueCount) {
		const projected = structuredClone(node);
		applyDisplayNodePropsUpdate(projected, op.props);
		if (stableJson(projected) === stableJson(node)) {
			pushSupportIssue(
				issues,
				'display_node_props_unchanged',
				`${path}.props`,
				'setDisplayNodeProps must change at least one display node property.',
				{ operationKind: op.kind, nodeKind },
			);
		}
	}
}
