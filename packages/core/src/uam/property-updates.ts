import type { UamDisplayNode } from './model.js';
import type { UamDisplayNodePropsUpdate } from './transaction-contracts.js';
import { TEXT_DISPLAY_NODE_KINDS } from './transaction-shared.js';

type UamTextLikeDisplayNode = Extract<UamDisplayNode, { kind: 'text' | 'richText' | 'textInput' }>;

function isTextLikeDisplayNode(node: UamDisplayNode): node is UamTextLikeDisplayNode {
	return TEXT_DISPLAY_NODE_KINDS.has(node.kind);
}

export function applyDisplayNodePropsUpdate(node: UamDisplayNode, props: UamDisplayNodePropsUpdate): void {
	if (props.position !== undefined) node.position = { ...props.position };
	if (props.size !== undefined) node.size = { ...props.size };
	if (props.locked !== undefined) node.locked = props.locked;
	if (props.aspect !== undefined) node.aspect = props.aspect;
	if (props.minSize !== undefined) node.minSize = { ...props.minSize };
	if (props.maxSize !== undefined) node.maxSize = { ...props.maxSize };
	if (props.pivot !== undefined) node.pivot = { ...props.pivot };
	if (props.pivotAsAnchor !== undefined) node.pivotAsAnchor = props.pivotAsAnchor;
	if (props.scale !== undefined) node.scale = { ...props.scale };
	if (props.skew !== undefined) node.skew = { ...props.skew };
	if (props.visible !== undefined) node.visible = props.visible;
	if (props.touchable !== undefined) node.touchable = props.touchable;
	if (props.grayed !== undefined) node.grayed = props.grayed;
	if (props.alpha !== undefined) node.alpha = props.alpha;
	if (props.rotation !== undefined) node.rotation = props.rotation;
	if (props.tooltips !== undefined) node.tooltips = props.tooltips;
	if (props.blendMode !== undefined) node.blendMode = props.blendMode;
	if (props.filter !== undefined) node.filter = props.filter;
	if (props.filterData !== undefined) node.filterData = props.filterData;
	if (props.customData !== undefined) node.customData = props.customData;
	if (props.group !== undefined) {
		if (!('group' in node)) {
			throw new Error(`Group references are not supported on display node kind "${node.kind}".`);
		}
		node.group = props.group;
	}

	if (props.textProperties !== undefined) {
		if (!isTextLikeDisplayNode(node)) {
			throw new Error(`Text display props are not supported on display node kind "${node.kind}".`);
		}
		Object.assign(node, structuredClone(props.textProperties));
	}
	const hasTextProps =
		props.text !== undefined ||
		props.font !== undefined ||
		props.fontSize !== undefined ||
		props.color !== undefined;
	if (hasTextProps) {
		if (!isTextLikeDisplayNode(node)) {
			throw new Error(`Text display props are not supported on display node kind "${node.kind}".`);
		}
		if (props.text !== undefined) node.text = props.text;
		if (props.font !== undefined) node.font = props.font;
		if (props.fontSize !== undefined) node.fontSize = props.fontSize;
		if (props.color !== undefined) node.color = props.color;
	}
	if (props.graphProperties !== undefined) {
		if (node.kind !== 'graph') {
			throw new Error(`Graph display props are not supported on display node kind "${node.kind}".`);
		}
		Object.assign(node, structuredClone(props.graphProperties));
	}
	if (props.groupProperties !== undefined) {
		if (node.kind !== 'group') {
			throw new Error(`Group display props are not supported on display node kind "${node.kind}".`);
		}
		Object.assign(node, structuredClone(props.groupProperties));
	}
	if (props.imageProperties !== undefined) {
		if (node.kind !== 'image') {
			throw new Error(`Image display props are not supported on display node kind "${node.kind}".`);
		}
		Object.assign(node, structuredClone(props.imageProperties));
	}
	if (props.movieClipProperties !== undefined) {
		if (node.kind !== 'movieClip') {
			throw new Error(`MovieClip display props are not supported on display node kind "${node.kind}".`);
		}
		Object.assign(node, structuredClone(props.movieClipProperties));
	}
	if (props.loaderProperties !== undefined) {
		if (node.kind !== 'loader') {
			throw new Error(`Loader display props are not supported on display node kind "${node.kind}".`);
		}
		Object.assign(node, structuredClone(props.loaderProperties));
	}
	if (props.listProperties !== undefined) {
		if (node.kind !== 'list' && node.kind !== 'tree') {
			throw new Error(`List display props are not supported on display node kind "${node.kind}".`);
		}
		Object.assign(node, structuredClone(props.listProperties));
	}
	if (props.loader3DProperties !== undefined) {
		if (node.kind !== 'loader3D') {
			throw new Error(`Loader3D display props are not supported on display node kind "${node.kind}".`);
		}
		const properties = props.loader3DProperties;
		Object.assign(node, {
			url: properties.url,
			fill: properties.fill,
			shrinkOnly: properties.shrinkOnly,
			autoSize: properties.autoSize,
			align: properties.align,
			vAlign: properties.vAlign,
			animationName: properties.animationName,
			skinName: properties.skinName,
			playing: properties.playing,
			frame: properties.frame,
			loop: properties.loop,
			color: properties.color,
			clearOnPublish: properties.clearOnPublish,
		});
	}
	if (props.componentInstanceProperties !== undefined) {
		if (node.kind !== 'component') {
			throw new Error(`Component instance props are not supported on display node kind "${node.kind}".`);
		}
		if (props.componentInstanceProperties === null) {
			delete node.instanceProperties;
		} else {
			node.instanceProperties = structuredClone(props.componentInstanceProperties);
		}
	}
}
