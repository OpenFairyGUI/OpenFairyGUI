import { bindLookGear, composeController, composeTransition } from '../authoring.js';
import { GearType, PropertyType } from '../constants.js';
import { Document } from '../document.js';
import type { PlatformIO } from '../io/platform-io.js';
import type { GObject } from '../properties/g-object.js';
import type { ProjectSettings } from '../types/settings.js';
import type {
	UamAnimationGearBinding,
	UamAssetResource,
	UamButtonNode,
	UamColorGearBinding,
	UamComboBoxNode,
	UamComponentRefNode,
	UamComponentModel,
	UamComponentResource,
	UamControllerModel,
	UamDisplay2GearBinding,
	UamDisplayGearBinding,
	UamDisplayNode,
	UamEdgeInsets,
	UamFontSizeGearBinding,
	UamGearBinding,
	UamGraphNode,
	UamGroupNode,
	UamIconGearBinding,
	UamImageNode,
	UamLabelNode,
	UamListItemData,
	UamListNode,
	UamLoader3DNode,
	UamLoaderNode,
	UamLookGearBinding,
	UamMovieClipNode,
	UamProject,
	UamProgressBarNode,
	UamRelation,
	UamRichTextNode,
	UamScrollBarNode,
	UamSizeGearBinding,
	UamSliderNode,
	UamTextGearBinding,
	UamTextInputNode,
	UamTextNode,
	UamTreeNode,
	UamXYGearBinding,
} from './model.js';
import { UAM_SUPPORTED_MATERIALIZATION_SCOPE } from './model.js';
import { assertValidUamProject } from './validate.js';

function cloneSettings(settings: ProjectSettings): ProjectSettings {
	return {
		publish: { ...(settings.publish ?? {}) },
		common: { ...(settings.common ?? {}) },
		adaptation: { ...(settings.adaptation ?? {}) },
	};
}

function ensureSupportedResourceKind(kind: string): void {
	if (!UAM_SUPPORTED_MATERIALIZATION_SCOPE.resourceKinds.includes(kind as never)) {
		throw new Error(`UAM materialization does not support resource kind "${kind}" in Gate A.`);
	}
}

function ensureSupportedNodeKind(kind: string): void {
	if (!UAM_SUPPORTED_MATERIALIZATION_SCOPE.nodeKinds.includes(kind as never)) {
		throw new Error(`UAM materialization does not support display node kind "${kind}" in Gate A.`);
	}
}

function ensureSupportedGearKind(kind: string): void {
	if (!UAM_SUPPORTED_MATERIALIZATION_SCOPE.gearKinds.includes(kind as never)) {
		throw new Error(`UAM materialization does not support gear kind "${kind}" in Gate A.`);
	}
}

function materializeRelations(relations: UamRelation[]): Array<{ target: string; type: number; usePercent: boolean }> {
	return relations.map((relation) => ({
		target: relation.targetNodeId,
		type: relation.type,
		usePercent: relation.usePercent,
	}));
}

function liftRelations(relations: Array<{ target: string; type: number; usePercent: boolean }>): UamRelation[] {
	return relations.map((relation) => ({
		targetNodeId: relation.target,
		type: relation.type,
		usePercent: relation.usePercent,
	}));
}

function materializeEdgeInsets(edgeInsets: UamEdgeInsets): [number, number, number, number] {
	return [edgeInsets.top, edgeInsets.bottom, edgeInsets.left, edgeInsets.right];
}

function liftEdgeInsets(edgeInsets: UamEdgeInsets): UamEdgeInsets {
	return {
		top: edgeInsets.top,
		bottom: edgeInsets.bottom,
		left: edgeInsets.left,
		right: edgeInsets.right,
	};
}

function cloneListItems(items: UamListItemData[]): UamListItemData[] {
	return items.map((item) => ({ ...item }));
}

type MaterializedDisplayNodeBase = {
	setId(id: string): MaterializedDisplayNodeBase;
	setXY(x: number, y: number): MaterializedDisplayNodeBase;
	setSize(width: number, height: number): MaterializedDisplayNodeBase;
	setVisible(visible: boolean): MaterializedDisplayNodeBase;
	setTouchable(touchable: boolean): MaterializedDisplayNodeBase;
	setGrayed(grayed: boolean): MaterializedDisplayNodeBase;
	setAlpha(alpha: number): MaterializedDisplayNodeBase;
	setRotation(rotation: number): MaterializedDisplayNodeBase;
	setCustomData(customData: string): MaterializedDisplayNodeBase;
	setRelations(relations: Array<{ target: string; type: number; usePercent: boolean }>): MaterializedDisplayNodeBase;
};

type MaterializedComponentDerivedControl = MaterializedDisplayNodeBase & {
	setSrc(src: string): MaterializedComponentDerivedControl;
	setPackageId(packageId: string): MaterializedComponentDerivedControl;
};

type MaterializedTitleControl = MaterializedComponentDerivedControl & {
	setTitle(title: string): MaterializedTitleControl;
	setIcon(icon: string): MaterializedTitleControl;
	setTitleColor(color: string): MaterializedTitleControl;
	setTitleFontSize(fontSize: number): MaterializedTitleControl;
	setSound(sound: string): MaterializedTitleControl;
	setSoundVolumeScale(scale: number): MaterializedTitleControl;
};

type UamComponentDerivedControlNode =
	| UamButtonNode
	| UamLabelNode
	| UamComboBoxNode
	| UamProgressBarNode
	| UamSliderNode
	| UamScrollBarNode;

type UamTitleControlNode = UamButtonNode | UamLabelNode | UamComboBoxNode;

type LiftableDisplayNodeBase = {
	getId(): string;
	getName(): string;
	getX(): number;
	getY(): number;
	getWidth(): number;
	getHeight(): number;
	getVisible(): boolean;
	getTouchable(): boolean;
	getGrayed(): boolean;
	getAlpha(): number;
	getRotation(): number;
	getCustomData(): string;
	getRelations(): ReturnType<GObject['getRelations']>;
	listGears(): ReturnType<GObject['listGears']>;
};

type LiftableComponentDerivedControl = LiftableDisplayNodeBase & {
	getSrc(): string;
	getPackageId(): string;
};

type LiftableTitleControl = LiftableComponentDerivedControl & {
	getTitle(): string;
	getIcon(): string;
	getTitleColor(): string;
	getTitleFontSize(): number;
	getSound(): string;
	getSoundVolumeScale(): number;
};

type LiftedDisplayNodeBase = Pick<
	UamButtonNode,
	'id' | 'name' | 'position' | 'size' | 'visible' | 'touchable' | 'grayed' | 'alpha' | 'rotation' | 'customData' | 'relations' | 'gears'
>;

type LiftedComponentDerivedControlBase = LiftedDisplayNodeBase & Pick<UamButtonNode, 'src' | 'packageId'>;
type LiftedTitleControlBase = LiftedComponentDerivedControlBase &
	Pick<UamButtonNode, 'title' | 'icon' | 'titleColor' | 'titleFontSize' | 'sound' | 'soundVolumeScale'>;

function materializeDisplayNodeBase<TNode extends UamDisplayNode, TTarget extends MaterializedDisplayNodeBase>(
	target: TTarget,
	node: TNode,
): TTarget {
	target
		.setId(node.id)
		.setXY(node.position.x, node.position.y)
		.setSize(node.size.width, node.size.height)
		.setVisible(node.visible)
		.setTouchable(node.touchable)
		.setGrayed(node.grayed)
		.setAlpha(node.alpha)
		.setRotation(node.rotation)
		.setCustomData(node.customData)
		.setRelations(materializeRelations(node.relations));
	return target;
}

function materializeComponentDerivedControlBase<TTarget extends MaterializedComponentDerivedControl>(
	target: TTarget,
	node: UamComponentDerivedControlNode,
): TTarget {
	materializeDisplayNodeBase(target, node)
		.setSrc(node.src)
		.setPackageId(node.packageId);
	return target;
}

function materializeTitleControlBase<TTarget extends MaterializedTitleControl>(
	target: TTarget,
	node: UamTitleControlNode,
): TTarget {
	materializeComponentDerivedControlBase(target, node)
		.setTitle(node.title)
		.setIcon(node.icon)
		.setTitleColor(node.titleColor)
		.setTitleFontSize(node.titleFontSize)
		.setSound(node.sound)
		.setSoundVolumeScale(node.soundVolumeScale);
	return target;
}

function liftDisplayNodeBase(child: LiftableDisplayNodeBase): LiftedDisplayNodeBase {
	return {
		id: child.getId(),
		name: child.getName(),
		position: { x: child.getX(), y: child.getY() },
		size: { width: child.getWidth(), height: child.getHeight() },
		visible: child.getVisible(),
		touchable: child.getTouchable(),
		grayed: child.getGrayed(),
		alpha: child.getAlpha(),
		rotation: child.getRotation(),
		customData: child.getCustomData(),
		relations: liftRelations(child.getRelations()),
		gears: liftGears(child.listGears()),
	};
}

function liftComponentDerivedControlBase(child: LiftableComponentDerivedControl): LiftedComponentDerivedControlBase {
	return {
		...liftDisplayNodeBase(child),
		src: child.getSrc(),
		packageId: child.getPackageId(),
	};
}

function liftTitleControlBase(child: LiftableTitleControl): LiftedTitleControlBase {
	return {
		...liftComponentDerivedControlBase(child),
		title: child.getTitle(),
		icon: child.getIcon(),
		titleColor: child.getTitleColor(),
		titleFontSize: child.getTitleFontSize(),
		sound: child.getSound(),
		soundVolumeScale: child.getSoundVolumeScale(),
	};
}

type MaterializedAssetBase = {
	setId(id: string): MaterializedAssetBase;
	setPath(path: string): MaterializedAssetBase;
	setBranch(branch: string): MaterializedAssetBase;
	setBranchItemIds(ids: string[]): MaterializedAssetBase;
	setExported(exported: boolean): MaterializedAssetBase;
};

function materializeAssetBase<TResource extends MaterializedAssetBase>(asset: TResource, resource: UamAssetResource): TResource {
	asset
		.setId(resource.id)
		.setPath(resource.path)
		.setBranch(resource.branch)
		.setBranchItemIds(resource.branchItemIds)
		.setExported(resource.exported);
	return asset;
}

function metadataNumber(resource: UamAssetResource, key: string, fallback: number): number {
	const value = resource.metadata?.[key];
	return typeof value === 'number' ? value : fallback;
}

function metadataBoolean(resource: UamAssetResource, key: string, fallback: boolean): boolean {
	const value = resource.metadata?.[key];
	return typeof value === 'boolean' ? value : fallback;
}

function metadataStringArray(resource: UamAssetResource, key: string): string[] {
	const value = resource.metadata?.[key];
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function materializeAssetResource(doc: Document, resource: UamAssetResource) {
	ensureSupportedResourceKind(resource.kind);
	if (resource.kind === 'image') {
		const image = materializeAssetBase(doc.createImageResource(resource.name), resource)
			.setWidth(resource.dimensions?.width ?? 0)
			.setHeight(resource.dimensions?.height ?? 0);
		if (resource.fileName) image.setFileName(resource.fileName);
		return image;
	}
	if (resource.kind === 'movieClip') {
		const movieClip = materializeAssetBase(doc.createMovieClipResource(resource.name), resource)
			.setWidth(resource.dimensions?.width ?? 0)
			.setHeight(resource.dimensions?.height ?? 0)
			.setInterval(metadataNumber(resource, 'interval', 0))
			.setSwing(metadataBoolean(resource, 'swing', false))
			.setRepeatDelay(metadataNumber(resource, 'repeatDelay', 0))
			.setSmoothing(metadataBoolean(resource, 'smoothing', true));
		if (resource.fileName) movieClip.setFileName(resource.fileName);
		return movieClip;
	}
	if (resource.kind === 'sound') {
		return materializeAssetBase(doc.createSoundResource(resource.name), resource).setFile(resource.file ?? '');
	}
	if (resource.kind === 'misc') {
		return materializeAssetBase(doc.createMiscResource(resource.name), resource).setFile(resource.file ?? '');
	}
	if (resource.kind === 'font') {
		const font = materializeAssetBase(doc.createFontResource(resource.name), resource);
		if (resource.fileName) font.setFileName(resource.fileName);
		return font
			.setTextureId(`${resource.metadata?.textureId ?? ''}`)
			.setRenderMode(`${resource.metadata?.renderMode ?? ''}`)
			.setSamplePointSize(metadataNumber(resource, 'samplePointSize', 0))
			.setTtf(metadataBoolean(resource, 'ttf', false))
			.setTint(metadataBoolean(resource, 'tint', false))
			.setAutoScale(metadataBoolean(resource, 'autoScale', false))
			.setHasChannel(metadataBoolean(resource, 'hasChannel', false))
			.setFontSize(metadataNumber(resource, 'fontSize', 0))
			.setXAdvance(metadataNumber(resource, 'xAdvance', 0))
			.setLineHeight(metadataNumber(resource, 'lineHeight', 0));
	}
	const skeleton = resource.kind === 'spine'
		? doc.createSpineResource(resource.name)
		: doc.createDragonBonesResource(resource.name);
	return materializeAssetBase(skeleton, resource)
		.setFile(resource.file ?? '')
		.setWidth(resource.dimensions?.width ?? 0)
		.setHeight(resource.dimensions?.height ?? 0)
		.setRequireIds(metadataStringArray(resource, 'requireIds'))
		.setAtlasNames(metadataStringArray(resource, 'atlasNames'))
		.setAnchor(metadataNumber(resource, 'anchorX', 0), metadataNumber(resource, 'anchorY', 0));
}

function materializeDisplayNode(
	doc: Document,
	node: UamDisplayNode,
): GObject {
	ensureSupportedNodeKind(node.kind);

	if (node.kind === 'image') {
		const imageNode = node as UamImageNode;
		const image = doc.createGImage(node.name)
			.setId(node.id)
			.setXY(node.position.x, node.position.y)
			.setSize(node.size.width, node.size.height)
			.setVisible(node.visible)
			.setTouchable(node.touchable)
			.setGrayed(node.grayed)
			.setAlpha(node.alpha)
			.setRotation(node.rotation)
			.setCustomData(node.customData)
			.setSrc(imageNode.resource.resourceId);
		image.setRelations(materializeRelations(node.relations));
		return image;
	}

	if (node.kind === 'text' || node.kind === 'richText' || node.kind === 'textInput') {
		const textNode = node as UamTextNode | UamRichTextNode | UamTextInputNode;
		const text = node.kind === 'richText'
			? doc.createGRichTextField(node.name)
			: node.kind === 'textInput'
				? doc.createGTextInput(node.name)
				: doc.createGTextField(node.name);
		text
			.setId(node.id)
			.setXY(node.position.x, node.position.y)
			.setSize(node.size.width, node.size.height)
			.setVisible(node.visible)
			.setTouchable(node.touchable)
			.setGrayed(node.grayed)
			.setAlpha(node.alpha)
			.setRotation(node.rotation)
			.setCustomData(node.customData)
			.setText(textNode.text)
			.setFont(textNode.font)
			.setFontSize(textNode.fontSize)
			.setColor(textNode.color);
		if (node.kind === 'textInput') {
			const inputNode = node as UamTextInputNode;
			(text as ReturnType<Document['createGTextInput']>)
				.setPromptText(inputNode.promptText)
				.setMaxLength(inputNode.maxLength)
				.setRestrict(inputNode.restrict)
				.setPassword(inputNode.password)
				.setKeyboardType(inputNode.keyboardType);
		}
		text.setRelations(materializeRelations(node.relations));
		return text;
	}

	if (node.kind === 'component') {
		const componentNode = node as UamComponentRefNode;
		const component = doc.createGComponent(node.name)
			.setId(node.id)
			.setXY(node.position.x, node.position.y)
			.setSize(node.size.width, node.size.height)
			.setVisible(node.visible)
			.setTouchable(node.touchable)
			.setGrayed(node.grayed)
			.setAlpha(node.alpha)
			.setRotation(node.rotation)
			.setCustomData(node.customData)
			.setSrc(componentNode.resource.resourceId)
			.setPackageId(componentNode.resource.packageId ?? '');
		component.setRelations(materializeRelations(node.relations));
		return component;
	}

	if (node.kind === 'list' || node.kind === 'tree') {
		const listNode = node as UamListNode | UamTreeNode;
		const list = node.kind === 'tree' ? doc.createGTree(node.name) : doc.createGList(node.name);
		list
			.setId(node.id)
			.setXY(node.position.x, node.position.y)
			.setSize(node.size.width, node.size.height)
			.setVisible(node.visible)
			.setTouchable(node.touchable)
			.setGrayed(node.grayed)
			.setAlpha(node.alpha)
			.setRotation(node.rotation)
			.setGroup(listNode.group)
			.setLayout(listNode.layout)
			.setAlign(listNode.align)
			.setVAlign(listNode.vAlign)
			.setLineGap(listNode.lineGap)
			.setColumnGap(listNode.columnGap)
			.setLineCount(listNode.lineCount)
			.setColumnCount(listNode.columnCount)
			.setSelectionMode(listNode.selectionMode)
			.setDefaultItem(listNode.defaultItem)
			.setAutoResizeItem(listNode.autoResizeItem)
			.setChildrenRenderOrder(listNode.childrenRenderOrder)
			.setApexIndex(listNode.apexIndex)
			.setSrc(listNode.src)
			.setOverflow(listNode.overflow)
			.setScrollType(listNode.scrollType)
			.setScrollBarFlags(listNode.scrollBarFlags)
			.setScrollBarMargin(materializeEdgeInsets(listNode.scrollBarMargin))
			.setVtScrollBarRes(listNode.vtScrollBarRes)
			.setHzScrollBarRes(listNode.hzScrollBarRes)
			.setHeaderRes(listNode.headerRes)
			.setFooterRes(listNode.footerRes)
			.setMargin(materializeEdgeInsets(listNode.margin))
			.setClipSoftness(listNode.clipSoftness)
			.setScrollItemToViewOnClick(listNode.scrollItemToViewOnClick)
			.setFoldInvisibleItems(listNode.foldInvisibleItems)
			.setListItems(cloneListItems(listNode.listItems))
			.setPageController(listNode.pageController)
			.setControllerOverrides(listNode.controllerOverrides)
			.setSelectionController(listNode.selectionController);
		if (node.kind === 'tree') {
			const treeNode = node as UamTreeNode;
			(list as ReturnType<Document['createGTree']>)
				.setTreeView(treeNode.treeView)
				.setIndent(treeNode.indent)
				.setClickToExpand(treeNode.clickToExpand);
		}
		list.setRelations(materializeRelations(node.relations));
		return list;
	}

	if (node.kind === 'graph') {
		const graphNode = node as UamGraphNode;
		const graph = doc.createGGraph(node.name)
			.setId(node.id)
			.setXY(node.position.x, node.position.y)
			.setSize(node.size.width, node.size.height)
			.setLocked(graphNode.locked)
			.setMinWidth(graphNode.minWidth)
			.setMaxWidth(graphNode.maxWidth)
			.setMinHeight(graphNode.minHeight)
			.setMaxHeight(graphNode.maxHeight)
			.setPivot(graphNode.pivot.x, graphNode.pivot.y, graphNode.pivotAsAnchor)
			.setGroup(graphNode.group)
			.setSkew(graphNode.skew.x, graphNode.skew.y)
			.setVisible(node.visible)
			.setTouchable(node.touchable)
			.setGrayed(node.grayed)
			.setAlpha(node.alpha)
			.setRotation(node.rotation)
			.setGraphType(graphNode.graphType)
			.setLineSize(graphNode.lineSize)
			.setLineColor(graphNode.lineColor)
			.setFillColor(graphNode.fillColor)
			.setCornerRadius(graphNode.cornerRadius)
			.setPoints(graphNode.points)
			.setSides(graphNode.sides)
			.setStartAngle(graphNode.startAngle)
			.setDistances(graphNode.distances);
		graph.setRelations(materializeRelations(node.relations));
		return graph;
	}

	if (node.kind === 'group') {
		const groupNode = node as UamGroupNode;
		const group = doc.createGGroup(node.name)
			.setId(node.id)
			.setXY(node.position.x, node.position.y)
			.setSize(node.size.width, node.size.height)
			.setLocked(groupNode.locked)
			.setVisible(node.visible)
			.setTouchable(node.touchable)
			.setGrayed(node.grayed)
			.setAlpha(node.alpha)
			.setRotation(node.rotation)
			.setGroup(groupNode.group)
			.setLayout(groupNode.layout)
			.setLineGap(groupNode.lineGap)
			.setColumnGap(groupNode.columnGap)
			.setAdvanced(groupNode.advanced)
			.setExcludeInvisibles(groupNode.excludeInvisibles)
			.setAutoSizeDisabled(groupNode.autoSizeDisabled)
			.setMainGridIndex(groupNode.mainGridIndex);
		group.setRelations(materializeRelations(node.relations));
		return group;
	}

	if (node.kind === 'loader') {
		const loaderNode = node as UamLoaderNode;
		const loader = doc.createGLoader(node.name)
			.setId(node.id)
			.setXY(node.position.x, node.position.y)
			.setSize(node.size.width, node.size.height)
			.setPivot(loaderNode.pivot.x, loaderNode.pivot.y)
			.setScale(loaderNode.scale.x, loaderNode.scale.y)
			.setVisible(node.visible)
			.setTouchable(node.touchable)
			.setGrayed(node.grayed)
			.setAlpha(node.alpha)
			.setRotation(node.rotation)
			.setUrl(loaderNode.url)
			.setFilter(loaderNode.filter)
			.setFilterData(loaderNode.filterData)
			.setFill(loaderNode.fill)
			.setShrinkOnly(loaderNode.shrinkOnly)
			.setAutoSize(loaderNode.autoSize)
			.setUseResize(loaderNode.useResize)
			.setAlign(loaderNode.align)
			.setVAlign(loaderNode.vAlign)
			.setFrame(loaderNode.frame)
			.setPlaying(loaderNode.playing)
			.setColor(loaderNode.color)
			.setFillMethod(loaderNode.fillMethod)
			.setFillOrigin(loaderNode.fillOrigin)
			.setFillClockwise(loaderNode.fillClockwise)
			.setFillAmount(loaderNode.fillAmount)
			.setClearOnPublish(loaderNode.clearOnPublish);
		loader.setRelations(materializeRelations(node.relations));
		return loader;
	}

	if (node.kind === 'loader3D') {
		const loaderNode = node as UamLoader3DNode;
		const loader = doc.createGLoader3D(node.name)
			.setId(node.id)
			.setXY(node.position.x, node.position.y)
			.setSize(node.size.width, node.size.height)
			.setVisible(node.visible)
			.setTouchable(node.touchable)
			.setGrayed(node.grayed)
			.setAlpha(node.alpha)
			.setRotation(node.rotation)
			.setUrl(loaderNode.url)
			.setFill(loaderNode.fill)
			.setShrinkOnly(loaderNode.shrinkOnly)
			.setAutoSize(loaderNode.autoSize)
			.setAlign(loaderNode.align)
			.setVAlign(loaderNode.vAlign)
			.setAnimationName(loaderNode.animationName)
			.setSkinName(loaderNode.skinName)
			.setPlaying(loaderNode.playing)
			.setFrame(loaderNode.frame)
			.setLoop(loaderNode.loop)
			.setColor(loaderNode.color);
		loader.setRelations(materializeRelations(node.relations));
		return loader;
	}

	if (node.kind === 'button') {
		const buttonNode = node as UamButtonNode;
		const button = materializeTitleControlBase(doc.createGButton(node.name), buttonNode)
			.setSelectedTitle(buttonNode.selectedTitle)
			.setSelectedIcon(buttonNode.selectedIcon)
			.setMode(buttonNode.mode)
			.setDownEffect(buttonNode.downEffect)
			.setDownEffectValue(buttonNode.downEffectValue);
		return button;
	}

	if (node.kind === 'label') {
		const labelNode = node as UamLabelNode;
		return materializeTitleControlBase(doc.createGLabel(node.name), labelNode);
	}

	if (node.kind === 'comboBox') {
		const comboBoxNode = node as UamComboBoxNode;
		const comboBox = materializeTitleControlBase(doc.createGComboBox(node.name), comboBoxNode)
			.setItems(comboBoxNode.items)
			.setIcons(comboBoxNode.icons)
			.setValues(comboBoxNode.values)
			.setSelectedIndex(comboBoxNode.selectedIndex)
			.setVisibleItemCount(comboBoxNode.visibleItemCount)
			.setPopupDirection(comboBoxNode.popupDirection);
		return comboBox;
	}

	if (node.kind === 'progressBar') {
		const progressBarNode = node as UamProgressBarNode;
		const progressBar = materializeComponentDerivedControlBase(doc.createGProgressBar(node.name), progressBarNode)
			.setTitleType(progressBarNode.titleType)
			.setMin(progressBarNode.min)
			.setMax(progressBarNode.max)
			.setValue(progressBarNode.value)
			.setReverse(progressBarNode.reverse)
			.setSound(progressBarNode.sound)
			.setSoundVolumeScale(progressBarNode.soundVolumeScale);
		return progressBar;
	}

	if (node.kind === 'slider') {
		const sliderNode = node as UamSliderNode;
		const slider = materializeComponentDerivedControlBase(doc.createGSlider(node.name), sliderNode)
			.setTitleType(sliderNode.titleType)
			.setMin(sliderNode.min)
			.setMax(sliderNode.max)
			.setValue(sliderNode.value)
			.setWholeNumbers(sliderNode.wholeNumbers);
		return slider;
	}

	if (node.kind === 'scrollBar') {
		const scrollBarNode = node as UamScrollBarNode;
		return materializeComponentDerivedControlBase(doc.createGScrollBar(node.name), scrollBarNode)
			.setFixedGripSize(scrollBarNode.fixedGripSize);
	}

	const movieClipNode = node as UamMovieClipNode;
	const movieClip = doc.createGMovieClip(node.name)
		.setId(node.id)
		.setXY(node.position.x, node.position.y)
		.setSize(node.size.width, node.size.height)
		.setVisible(node.visible)
		.setTouchable(node.touchable)
		.setGrayed(node.grayed)
		.setAlpha(node.alpha)
		.setRotation(node.rotation)
		.setSrc(movieClipNode.resource.resourceId)
		.setPackageId(movieClipNode.resource.packageId ?? '')
		.setFileName(movieClipNode.fileName)
		.setFilter(movieClipNode.filter)
		.setFilterData(movieClipNode.filterData)
		.setPlaying(movieClipNode.playing)
		.setFrame(movieClipNode.frame)
		.setColor(movieClipNode.color);
	movieClip.setRelations(materializeRelations(node.relations));
	return movieClip;
}

function composeControllers(doc: Document, component: ReturnType<Document['createComponent']>, controllers: UamControllerModel[]): void {
	for (const controller of controllers) {
		composeController(doc, component, {
			name: controller.name,
			selectedIndex: controller.selectedIndex,
			autoRadioGroupDepth: controller.autoRadioGroupDepth,
			pages: controller.pages.map((page) => ({ id: page.id, name: page.name })),
			actions: controller.actions.map((action) => ({
				name: action.name,
				actionType: action.actionType,
				fromPage: action.fromPageIds,
				toPage: action.toPageIds,
				transitionName: action.transitionName,
				playTimes: action.playTimes,
				delay: action.delay,
				stopOnExit: action.stopOnExit,
				object: action.targetNodeId || null,
				controllerName: action.controllerName,
				targetPage: action.targetPage,
			})),
		});
	}
}

function composeTransitions(doc: Document, component: ReturnType<Document['createComponent']>, transitions: UamComponentModel['transitions']): void {
	for (const transition of transitions) {
		composeTransition(doc, component, {
			name: transition.name,
			autoPlay: transition.autoPlay,
			autoPlayTimes: transition.autoPlayTimes,
			autoPlayDelay: transition.autoPlayDelay,
			options: transition.options,
			fps: transition.fps,
			items: transition.items.map((item) => ({
				name: item.name,
				time: item.time,
				target: item.targetNodeId || null,
				actionType: item.actionType,
				tween: item.tween,
				duration: item.duration,
				startValue: item.startValue,
				endValue: item.endValue,
				easeType: item.easeType,
				repeat: item.repeat,
				yoyo: item.yoyo,
				label: item.label,
				endLabel: item.endLabel,
				path: item.path,
				customEasePath: item.customEasePath,
			})),
		});
	}
}

type UamGenericValueGearBinding =
	| UamXYGearBinding
	| UamSizeGearBinding
	| UamColorGearBinding
	| UamAnimationGearBinding
	| UamTextGearBinding
	| UamIconGearBinding
	| UamFontSizeGearBinding;

function parseNumber(raw: string | undefined, fallback: number): number {
	if (raw === undefined || raw === '') return fallback;
	const value = Number(raw);
	return Number.isFinite(value) ? value : fallback;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
	if (raw === undefined || raw === '') return fallback;
	const normalized = raw.toLowerCase();
	if (normalized === '1' || normalized === 'true' || normalized === 'p') return true;
	if (normalized === '0' || normalized === 'false' || normalized === 's') return false;
	return fallback;
}

function parseLookGearValue(value: string | null) {
	if (!value || value === '-') return null;
	const parts = value.split(',');
	return {
		alpha: parseNumber(parts[0], 1),
		rotation: parseNumber(parts[1], 0),
		grayed: parseBool(parts[2], false),
		touchable: parseBool(parts[3], true),
	};
}

function parseGenericGearValue(kind: UamGenericValueGearBinding['kind'], value: string | null) {
	if (!value || value === '-') return null;
	const parts = value.split(',');
	switch (kind) {
		case 'xy':
			return { x: parseNumber(parts[0], 0), y: parseNumber(parts[1], 0) };
		case 'size':
			return {
				width: parseNumber(parts[0], 0),
				height: parseNumber(parts[1], 0),
				scaleX: parseNumber(parts[2], 1),
				scaleY: parseNumber(parts[3], 1),
			};
		case 'color':
			return {
				color: parts[0] || '#ffffff',
				outlineColor: parts[1] || null,
			};
		case 'animation':
			return {
				frame: parseNumber(parts[0], 0),
				playing: parseBool(parts[1], true),
				animationName: parts[2] ?? '',
				skinName: parts[3] ?? '',
			};
		case 'text':
			return { text: value };
		case 'icon':
			return { icon: value };
		case 'fontSize':
			return { fontSize: parseNumber(parts[0], 12) };
	}
}

function defaultGenericGearValue(kind: UamGenericValueGearBinding['kind']) {
	switch (kind) {
		case 'xy':
			return { x: 0, y: 0 };
		case 'size':
			return { width: 0, height: 0, scaleX: 1, scaleY: 1 };
		case 'color':
			return { color: '#ffffff', outlineColor: null };
		case 'animation':
			return { frame: 0, playing: true, animationName: '', skinName: '' };
		case 'text':
			return { text: '' };
		case 'icon':
			return { icon: '' };
		case 'fontSize':
			return { fontSize: 12 };
	}
}

function genericGearKindToType(kind: UamGenericValueGearBinding['kind']): GearType {
	switch (kind) {
		case 'xy':
			return GearType.XY;
		case 'size':
			return GearType.Size;
		case 'color':
			return GearType.Color;
		case 'animation':
			return GearType.Animation;
		case 'text':
			return GearType.Text;
		case 'icon':
			return GearType.Icon;
		case 'fontSize':
			return GearType.FontSize;
	}
}

function serializeGenericGearValue(kind: UamGenericValueGearBinding['kind'], value: unknown): string {
	if (kind === 'text') return `${(value as { text?: string } | null)?.text ?? ''}`;
	if (kind === 'icon') return `${(value as { icon?: string } | null)?.icon ?? ''}`;
	if (!value) return '-';
	switch (kind) {
		case 'xy': {
			const xy = value as { x?: number; y?: number };
			return `${xy.x ?? 0},${xy.y ?? 0}`;
		}
		case 'size': {
			const size = value as { width?: number; height?: number; scaleX?: number; scaleY?: number };
			return `${size.width ?? 0},${size.height ?? 0},${size.scaleX ?? 1},${size.scaleY ?? 1}`;
		}
		case 'color': {
			const color = value as { color?: string; outlineColor?: string | null };
			return `${color.color ?? '#ffffff'},${color.outlineColor ?? ''}`;
		}
		case 'animation': {
			const animation = value as { frame?: number; playing?: boolean; animationName?: string; skinName?: string };
			return `${animation.frame ?? 0},${animation.playing ?? true ? 'p' : 's'},${animation.animationName ?? ''},${animation.skinName ?? ''}`;
		}
		case 'fontSize': {
			const fontSize = value as { fontSize?: number };
			return `${fontSize.fontSize ?? 12}`;
		}
	}
}

function materializeLookGear(
	doc: Document,
	component: ReturnType<Document['createComponent']>,
	target: GObject,
	gear: UamLookGearBinding,
): void {
	const controller = component.getController(gear.controllerName);
	if (!controller) {
		throw new Error(`UAM materialization expected controller "${gear.controllerName}" to exist on component "${component.getName()}".`);
	}

	bindLookGear(doc, component, target, {
		name: gear.name,
		controller,
		states: gear.states.map((state) => ({
			pageId: state.pageId,
			value: state.value,
		})),
		defaultValue: gear.defaultValue,
		condition: gear.condition,
		positionsInPercent: gear.positionsInPercent,
		tween: gear.tween,
		tweenDuration: gear.tweenDuration,
		tweenDelay: gear.tweenDelay,
		easeType: gear.easeType,
		customEasePath: gear.customEasePath,
	});
}

function materializeDisplayGear(
	doc: Document,
	component: ReturnType<Document['createComponent']>,
	target: GObject,
	gear: UamDisplayGearBinding | UamDisplay2GearBinding,
): void {
	const controller = component.getController(gear.controllerName);
	if (!controller) {
		throw new Error(`UAM materialization expected controller "${gear.controllerName}" to exist on component "${component.getName()}".`);
	}
	const materialized = doc.createGear(gear.name)
		.setGearType(gear.kind === 'display2' ? GearType.Display2 : GearType.Display)
		.setController(controller)
		.setPages(gear.visibleOnPageIds.join(','));
	if (gear.kind === 'display2') materialized.setCondition(gear.condition);
	target.addGear(materialized);
}

function materializeGenericValueGear(
	doc: Document,
	component: ReturnType<Document['createComponent']>,
	target: GObject,
	gear: UamGenericValueGearBinding,
): void {
	const controller = component.getController(gear.controllerName);
	if (!controller) {
		throw new Error(`UAM materialization expected controller "${gear.controllerName}" to exist on component "${component.getName()}".`);
	}
	const materialized = doc.createGear(gear.name)
		.setGearType(genericGearKindToType(gear.kind))
		.setController(controller)
		.setPages(gear.states.map((state) => state.pageId).join(','))
		.setValues(gear.states.map((state) => serializeGenericGearValue(gear.kind, state.value)).join('|'))
		.setDefaultValue(serializeGenericGearValue(gear.kind, gear.defaultValue))
		.setCondition(gear.condition)
		.setPositionsInPercent(gear.positionsInPercent)
		.setTween(gear.tween)
		.setTweenDuration(gear.tweenDuration)
		.setTweenDelay(gear.tweenDelay)
		.setEaseType(gear.easeType)
		.setCustomEasePath(gear.customEasePath);
	target.addGear(materialized);
}

function materializeGears(
	doc: Document,
	component: ReturnType<Document['createComponent']>,
	target: GObject,
	gears: UamGearBinding[],
): void {
	for (const gear of gears) {
		ensureSupportedGearKind(gear.kind);
		if (gear.kind === 'display' || gear.kind === 'display2') {
			materializeDisplayGear(doc, component, target, gear);
		} else if (gear.kind === 'look') {
			materializeLookGear(doc, component, target, gear);
		} else {
			materializeGenericValueGear(doc, component, target, gear);
		}
	}
}

function materializeComponentResource(doc: Document, resource: UamComponentResource): ReturnType<Document['createComponent']> {
	const component = doc.createComponent(resource.name)
		.setId(resource.id)
		.setPath(resource.path)
		.setBranch(resource.branch)
		.setBranchItemIds(resource.branchItemIds)
		.setExported(resource.exported)
		.setSize(resource.component.size.width, resource.component.size.height)
		.setCustomData(resource.component.customData);

	for (const node of resource.component.displayList) {
		component.addChild(materializeDisplayNode(doc, node));
	}
	composeControllers(doc, component, resource.component.controllers);
	composeTransitions(doc, component, resource.component.transitions);
	for (const node of resource.component.displayList) {
		const target = component.getChildById(node.id);
		if (target) {
			materializeGears(doc, component, target, node.gears);
		}
	}

	return component;
}

export function materializeUamProject(project: UamProject): Document {
	assertValidUamProject(project);
	const doc = new Document();
	doc.getRoot()
		.setProjectId(project.projectId)
		.setProjectType(project.projectType)
		.setVersion(project.version)
		.setBranches(project.branches)
		.setSettings(cloneSettings(project.settings));

	for (const pkgSpec of project.packages) {
		const pkg = doc.createPackage(pkgSpec.name).setId(pkgSpec.id);
		if (pkgSpec.publish) {
			pkg
				.setPublishName(pkgSpec.publish.name)
				.setPublishPath(pkgSpec.publish.path)
				.setPublishBranchPath(pkgSpec.publish.branchPath)
				.setPublishPackageCount(pkgSpec.publish.packageCount)
				.setGenCode(pkgSpec.publish.genCode)
				.setCodePath(pkgSpec.publish.codePath);
		}
		for (const resource of pkgSpec.resources) {
			if (resource.kind === 'component') {
				pkg.addResource(materializeComponentResource(doc, resource));
			} else {
				pkg.addResource(materializeAssetResource(doc, resource));
			}
		}
	}

	return doc;
}

type LiftableAssetResource = {
	propertyType: string;
	getId(): string;
	getName(): string;
	getPath(): string;
	getExported(): boolean;
	getBranch(): string;
	getBranchItemIds(): string[];
};

function baseAssetResource(kind: UamAssetResource['kind'], resource: LiftableAssetResource): UamAssetResource {
	return {
		kind,
		id: resource.getId(),
		name: resource.getName(),
		path: resource.getPath(),
		exported: resource.getExported(),
		branch: resource.getBranch(),
		branchItemIds: resource.getBranchItemIds(),
		metadata: null,
	};
}

function liftAssetResource(resource: LiftableAssetResource): UamAssetResource {
	if (resource.propertyType === PropertyType.IMAGE_RESOURCE) {
		const image = resource as ReturnType<Document['createImageResource']>;
		return {
			...baseAssetResource('image', image),
			fileName: image.getFileName(),
			dimensions: {
				width: image.getWidth(),
				height: image.getHeight(),
			},
			metadata: {
				textureSetMode: image.getTextureSetMode(),
			},
		};
	}
	if (resource.propertyType === PropertyType.MOVIE_CLIP_RESOURCE) {
		const movieClip = resource as ReturnType<Document['createMovieClipResource']>;
		return {
			...baseAssetResource('movieClip', movieClip),
			fileName: movieClip.getFileName(),
			dimensions: {
				width: movieClip.getWidth(),
				height: movieClip.getHeight(),
			},
			metadata: {
				interval: movieClip.getInterval(),
				swing: movieClip.getSwing(),
				repeatDelay: movieClip.getRepeatDelay(),
				smoothing: movieClip.getSmoothing(),
			},
		};
	}
	if (resource.propertyType === PropertyType.SOUND_RESOURCE) {
		const sound = resource as ReturnType<Document['createSoundResource']>;
		return {
			...baseAssetResource('sound', sound),
			file: sound.getFile(),
		};
	}
	if (resource.propertyType === PropertyType.MISC_RESOURCE) {
		const misc = resource as ReturnType<Document['createMiscResource']>;
		return {
			...baseAssetResource('misc', misc),
			file: misc.getFile(),
		};
	}
	if (resource.propertyType === PropertyType.FONT_RESOURCE) {
		const font = resource as ReturnType<Document['createFontResource']>;
		return {
			...baseAssetResource('font', font),
			fileName: font.getFileName(),
			metadata: {
				textureId: font.getTextureId(),
				renderMode: font.getRenderMode(),
				samplePointSize: font.getSamplePointSize(),
				ttf: font.getTtf(),
				tint: font.getTint(),
				autoScale: font.getAutoScale(),
				hasChannel: font.getHasChannel(),
				fontSize: font.getFontSize(),
				xAdvance: font.getXAdvance(),
				lineHeight: font.getLineHeight(),
			},
		};
	}
	if (resource.propertyType === PropertyType.SPINE_RESOURCE || resource.propertyType === PropertyType.DRAGON_BONES_RESOURCE) {
		const skeleton = resource as ReturnType<Document['createSpineResource']>;
		return {
			...baseAssetResource(resource.propertyType === PropertyType.SPINE_RESOURCE ? 'spine' : 'dragonBones', skeleton),
			file: skeleton.getFile(),
			dimensions: {
				width: skeleton.getWidth(),
				height: skeleton.getHeight(),
			},
			metadata: {
				requireIds: skeleton.getRequireIds(),
				atlasNames: skeleton.getAtlasNames(),
				anchorX: skeleton.getAnchorX(),
				anchorY: skeleton.getAnchorY(),
			},
		};
	}
	throw new Error(`UAM lift does not support resource type "${resource.propertyType}" in Gate A.`);
}

function liftGears(gears: ReturnType<GObject['listGears']>): UamGearBinding[] {
	return gears.map((gear) => {
		const pages = gear.getPages() ? gear.getPages().split(',') : [];
		if (gear.getGearType() === GearType.Display) {
			return {
				kind: 'display',
				name: gear.getName(),
				controllerName: gear.getController()?.getName() ?? '',
				visibleOnPageIds: pages,
			} satisfies UamDisplayGearBinding;
		}
		if (gear.getGearType() === GearType.Display2) {
			return {
				kind: 'display2',
				name: gear.getName(),
				controllerName: gear.getController()?.getName() ?? '',
				visibleOnPageIds: pages,
				condition: gear.getCondition(),
			} satisfies UamDisplay2GearBinding;
		}
		if (gear.getGearType() !== GearType.Look) {
			const gearKinds = new Map<number, UamGenericValueGearBinding['kind']>([
				[GearType.XY, 'xy'],
				[GearType.Size, 'size'],
				[GearType.Color, 'color'],
				[GearType.Animation, 'animation'],
				[GearType.Text, 'text'],
				[GearType.Icon, 'icon'],
				[GearType.FontSize, 'fontSize'],
			]);
			const kind = gearKinds.get(gear.getGearType());
			if (!kind) {
				throw new Error(`UAM lift does not support gear type "${gear.getGearType()}" in Gate A.`);
			}
			const values = gear.getValues() ? gear.getValues().split('|') : [];
			const defaultValue = `${gear.getDefaultValue() ?? ''}`;
			const base = {
				name: gear.getName(),
				controllerName: gear.getController()?.getName() ?? '',
				states: pages.map((pageId, index) => ({
					pageId,
					value: parseGenericGearValue(kind, values[index] ?? null),
				})),
				defaultValue: parseGenericGearValue(kind, defaultValue) ?? defaultGenericGearValue(kind),
				condition: gear.getCondition(),
				positionsInPercent: gear.getPositionsInPercent(),
				tween: gear.getTween(),
				tweenDuration: gear.getTweenDuration(),
				tweenDelay: gear.getTweenDelay(),
				easeType: gear.getEaseType(),
				customEasePath: gear.getCustomEasePath(),
			};
			switch (kind) {
				case 'xy':
					return { kind, ...base } as UamXYGearBinding;
				case 'size':
					return { kind, ...base } as UamSizeGearBinding;
				case 'color':
					return { kind, ...base } as UamColorGearBinding;
				case 'animation':
					return { kind, ...base } as UamAnimationGearBinding;
				case 'text':
					return { kind, ...base } as UamTextGearBinding;
				case 'icon':
					return { kind, ...base } as UamIconGearBinding;
				case 'fontSize':
					return { kind, ...base } as UamFontSizeGearBinding;
			}
		}
		const values = gear.getValues() ? gear.getValues().split('|') : [];
		const defaultValue = `${gear.getDefaultValue() ?? ''}`;

		return {
			kind: 'look',
			name: gear.getName(),
			controllerName: gear.getController()?.getName() ?? '',
			states: pages.map((pageId, index) => ({
				pageId,
				value: parseLookGearValue(values[index] ?? null),
			})),
			defaultValue: parseLookGearValue(defaultValue) ?? { alpha: 1, rotation: 0, grayed: false, touchable: true },
			condition: gear.getCondition(),
			positionsInPercent: gear.getPositionsInPercent(),
			tween: gear.getTween(),
			tweenDuration: gear.getTweenDuration(),
			tweenDelay: gear.getTweenDelay(),
			easeType: gear.getEaseType(),
			customEasePath: gear.getCustomEasePath(),
		} satisfies UamLookGearBinding;
	});
}

function liftDisplayNode(child: GObject): UamDisplayNode {
	if (child.propertyType === PropertyType.G_IMAGE) {
		const image = child as ReturnType<Document['createGImage']>;
		return {
			kind: 'image',
			id: image.getId(),
			name: image.getName(),
			position: { x: image.getX(), y: image.getY() },
			size: { width: image.getWidth(), height: image.getHeight() },
			visible: image.getVisible(),
			touchable: image.getTouchable(),
			grayed: image.getGrayed(),
			alpha: image.getAlpha(),
			rotation: image.getRotation(),
			customData: image.getCustomData(),
			relations: liftRelations(image.getRelations()),
			gears: liftGears(image.listGears()),
			resource: { resourceId: image.getSrc() },
		};
	}
	if (
		child.propertyType === PropertyType.G_TEXT_FIELD
		|| child.propertyType === PropertyType.G_RICH_TEXT_FIELD
		|| child.propertyType === PropertyType.G_TEXT_INPUT
	) {
		const text = child as ReturnType<Document['createGTextField']>;
		const base = {
			id: text.getId(),
			name: text.getName(),
			position: { x: text.getX(), y: text.getY() },
			size: { width: text.getWidth(), height: text.getHeight() },
			visible: text.getVisible(),
			touchable: text.getTouchable(),
			grayed: text.getGrayed(),
			alpha: text.getAlpha(),
			rotation: text.getRotation(),
			customData: text.getCustomData(),
			relations: liftRelations(text.getRelations()),
			gears: liftGears(text.listGears()),
			text: text.getText(),
			font: text.getFont(),
			fontSize: text.getFontSize(),
			color: text.getColor(),
		};
		if (child.propertyType === PropertyType.G_RICH_TEXT_FIELD) {
			return { kind: 'richText', ...base } satisfies UamRichTextNode;
		}
		if (child.propertyType === PropertyType.G_TEXT_INPUT) {
			const input = child as ReturnType<Document['createGTextInput']>;
			return {
				kind: 'textInput',
				...base,
				promptText: input.getPromptText(),
				maxLength: input.getMaxLength(),
				restrict: input.getRestrict(),
				password: input.getPassword(),
				keyboardType: input.getKeyboardType(),
			} satisfies UamTextInputNode;
		}
		return { kind: 'text', ...base } satisfies UamTextNode;
	}
	if (child.propertyType === PropertyType.G_COMPONENT) {
		const component = child as ReturnType<Document['createGComponent']>;
		return {
			kind: 'component',
			id: component.getId(),
			name: component.getName(),
			position: { x: component.getX(), y: component.getY() },
			size: { width: component.getWidth(), height: component.getHeight() },
			visible: component.getVisible(),
			touchable: component.getTouchable(),
			grayed: component.getGrayed(),
			alpha: component.getAlpha(),
			rotation: component.getRotation(),
			customData: component.getCustomData(),
			relations: liftRelations(component.getRelations()),
			gears: liftGears(component.listGears()),
			resource: { packageId: component.getPackageId(), resourceId: component.getSrc() },
		};
	}
	if (child.propertyType === PropertyType.G_LIST || child.propertyType === PropertyType.G_TREE) {
		const list = child as ReturnType<Document['createGList']>;
		const base = {
			id: list.getId(),
			name: list.getName(),
			position: { x: list.getX(), y: list.getY() },
			size: { width: list.getWidth(), height: list.getHeight() },
			visible: list.getVisible(),
			touchable: list.getTouchable(),
			grayed: list.getGrayed(),
			alpha: list.getAlpha(),
			rotation: list.getRotation(),
			customData: '',
			relations: liftRelations(list.getRelations()),
			gears: liftGears(list.listGears()),
			group: list.getGroup(),
			layout: list.getLayout(),
			align: list.getAlign(),
			vAlign: list.getVAlign(),
			lineGap: list.getLineGap(),
			columnGap: list.getColumnGap(),
			lineCount: list.getLineCount(),
			columnCount: list.getColumnCount(),
			selectionMode: list.getSelectionMode(),
			defaultItem: list.getDefaultItem(),
			autoResizeItem: list.getAutoResizeItem(),
			childrenRenderOrder: list.getChildrenRenderOrder(),
			apexIndex: list.getApexIndex(),
			src: list.getSrc(),
			overflow: list.getOverflow(),
			scrollType: list.getScrollType(),
			scrollBarFlags: list.getScrollBarFlags(),
			scrollBarMargin: liftEdgeInsets(list.getScrollBarMargin()),
			vtScrollBarRes: list.getVtScrollBarRes(),
			hzScrollBarRes: list.getHzScrollBarRes(),
			headerRes: list.getHeaderRes(),
			footerRes: list.getFooterRes(),
			margin: liftEdgeInsets(list.getMargin()),
			clipSoftness: list.getClipSoftness(),
			scrollItemToViewOnClick: list.getScrollItemToViewOnClick(),
			foldInvisibleItems: list.getFoldInvisibleItems(),
			listItems: cloneListItems(list.getListItems()),
			pageController: list.getPageController(),
			controllerOverrides: list.getControllerOverrides(),
			selectionController: list.getSelectionController(),
		};
		if (child.propertyType === PropertyType.G_TREE) {
			const tree = child as ReturnType<Document['createGTree']>;
			return {
				kind: 'tree',
				...base,
				treeView: tree.getTreeView(),
				indent: tree.getIndent(),
				clickToExpand: tree.getClickToExpand(),
			};
		}
		return { kind: 'list', ...base };
	}
	if (child.propertyType === PropertyType.G_GRAPH) {
		const graph = child as ReturnType<Document['createGGraph']>;
		return {
			kind: 'graph',
			id: graph.getId(),
			name: graph.getName(),
			position: { x: graph.getX(), y: graph.getY() },
			size: { width: graph.getWidth(), height: graph.getHeight() },
			visible: graph.getVisible(),
			touchable: graph.getTouchable(),
			grayed: graph.getGrayed(),
			alpha: graph.getAlpha(),
			rotation: graph.getRotation(),
			customData: '',
			relations: liftRelations(graph.getRelations()),
			gears: liftGears(graph.listGears()),
			locked: graph.getLocked(),
			minWidth: graph.getMinWidth(),
			maxWidth: graph.getMaxWidth(),
			minHeight: graph.getMinHeight(),
			maxHeight: graph.getMaxHeight(),
			pivot: { x: graph.getPivotX(), y: graph.getPivotY() },
			pivotAsAnchor: graph.getPivotAsAnchor(),
			group: graph.getGroup(),
			skew: { x: graph.getSkewX(), y: graph.getSkewY() },
			graphType: graph.getGraphType(),
			lineSize: graph.getLineSize(),
			lineColor: graph.getLineColor(),
			fillColor: graph.getFillColor(),
			cornerRadius: graph.getCornerRadius(),
			points: graph.getPoints(),
			sides: graph.getSides(),
			startAngle: graph.getStartAngle(),
			distances: graph.getDistances(),
		};
	}
	if (child.propertyType === PropertyType.G_GROUP) {
		const group = child as ReturnType<Document['createGGroup']>;
		return {
			kind: 'group',
			id: group.getId(),
			name: group.getName(),
			position: { x: group.getX(), y: group.getY() },
			size: { width: group.getWidth(), height: group.getHeight() },
			visible: group.getVisible(),
			touchable: group.getTouchable(),
			grayed: group.getGrayed(),
			alpha: group.getAlpha(),
			rotation: group.getRotation(),
			customData: '',
			relations: liftRelations(group.getRelations()),
			gears: liftGears(group.listGears()),
			locked: group.getLocked(),
			group: group.getGroup(),
			layout: group.getLayout(),
			lineGap: group.getLineGap(),
			columnGap: group.getColumnGap(),
			advanced: group.getAdvanced(),
			excludeInvisibles: group.getExcludeInvisibles(),
			autoSizeDisabled: group.getAutoSizeDisabled(),
			mainGridIndex: group.getMainGridIndex(),
		};
	}
	if (child.propertyType === PropertyType.G_LOADER) {
		const loader = child as ReturnType<Document['createGLoader']>;
		return {
			kind: 'loader',
			id: loader.getId(),
			name: loader.getName(),
			position: { x: loader.getX(), y: loader.getY() },
			size: { width: loader.getWidth(), height: loader.getHeight() },
			visible: loader.getVisible(),
			touchable: loader.getTouchable(),
			grayed: loader.getGrayed(),
			alpha: loader.getAlpha(),
			rotation: loader.getRotation(),
			customData: '',
			relations: liftRelations(loader.getRelations()),
			gears: liftGears(loader.listGears()),
			pivot: { x: loader.getPivotX(), y: loader.getPivotY() },
			scale: { x: loader.getScaleX(), y: loader.getScaleY() },
			url: loader.getUrl(),
			filter: loader.getFilter(),
			filterData: loader.getFilterData(),
			fill: loader.getFill(),
			shrinkOnly: loader.getShrinkOnly(),
			autoSize: loader.getAutoSize(),
			useResize: loader.getUseResize(),
			align: loader.getAlign(),
			vAlign: loader.getVAlign(),
			frame: loader.getFrame(),
			playing: loader.getPlaying(),
			color: loader.getColor(),
			fillMethod: loader.getFillMethod(),
			fillOrigin: loader.getFillOrigin(),
			fillClockwise: loader.getFillClockwise(),
			fillAmount: loader.getFillAmount(),
			clearOnPublish: loader.getClearOnPublish(),
		};
	}
	if (child.propertyType === PropertyType.G_LOADER_3D) {
		const loader = child as ReturnType<Document['createGLoader3D']>;
		return {
			kind: 'loader3D',
			id: loader.getId(),
			name: loader.getName(),
			position: { x: loader.getX(), y: loader.getY() },
			size: { width: loader.getWidth(), height: loader.getHeight() },
			visible: loader.getVisible(),
			touchable: loader.getTouchable(),
			grayed: loader.getGrayed(),
			alpha: loader.getAlpha(),
			rotation: loader.getRotation(),
			customData: '',
			relations: liftRelations(loader.getRelations()),
			gears: liftGears(loader.listGears()),
			url: loader.getUrl(),
			fill: loader.getFill(),
			shrinkOnly: loader.getShrinkOnly(),
			autoSize: loader.getAutoSize(),
			align: loader.getAlign(),
			vAlign: loader.getVAlign(),
			animationName: loader.getAnimationName(),
			skinName: loader.getSkinName(),
			playing: loader.getPlaying(),
			frame: loader.getFrame(),
			loop: loader.getLoop(),
			color: loader.getColor(),
		};
	}
	if (child.propertyType === PropertyType.G_BUTTON) {
		const button = child as ReturnType<Document['createGButton']>;
		return {
			kind: 'button',
			...liftTitleControlBase(button),
			selectedTitle: button.getSelectedTitle(),
			selectedIcon: button.getSelectedIcon(),
			mode: button.getMode(),
			downEffect: button.getDownEffect(),
			downEffectValue: button.getDownEffectValue(),
		} satisfies UamButtonNode;
	}
	if (child.propertyType === PropertyType.G_LABEL) {
		const label = child as ReturnType<Document['createGLabel']>;
		return {
			kind: 'label',
			...liftTitleControlBase(label),
		} satisfies UamLabelNode;
	}
	if (child.propertyType === PropertyType.G_COMBO_BOX) {
		const comboBox = child as ReturnType<Document['createGComboBox']>;
		return {
			kind: 'comboBox',
			...liftTitleControlBase(comboBox),
			items: comboBox.getItems(),
			icons: comboBox.getIcons(),
			values: comboBox.getValues(),
			selectedIndex: comboBox.getSelectedIndex(),
			visibleItemCount: comboBox.getVisibleItemCount(),
			popupDirection: comboBox.getPopupDirection(),
		} satisfies UamComboBoxNode;
	}
	if (child.propertyType === PropertyType.G_PROGRESS_BAR) {
		const progressBar = child as ReturnType<Document['createGProgressBar']>;
		return {
			kind: 'progressBar',
			...liftComponentDerivedControlBase(progressBar),
			titleType: progressBar.getTitleType(),
			min: progressBar.getMin(),
			max: progressBar.getMax(),
			value: progressBar.getValue(),
			reverse: progressBar.getReverse(),
			sound: progressBar.getSound(),
			soundVolumeScale: progressBar.getSoundVolumeScale(),
		} satisfies UamProgressBarNode;
	}
	if (child.propertyType === PropertyType.G_SLIDER) {
		const slider = child as ReturnType<Document['createGSlider']>;
		return {
			kind: 'slider',
			...liftComponentDerivedControlBase(slider),
			titleType: slider.getTitleType(),
			min: slider.getMin(),
			max: slider.getMax(),
			value: slider.getValue(),
			wholeNumbers: slider.getWholeNumbers(),
		} satisfies UamSliderNode;
	}
	if (child.propertyType === PropertyType.G_SCROLL_BAR) {
		const scrollBar = child as ReturnType<Document['createGScrollBar']>;
		return {
			kind: 'scrollBar',
			...liftComponentDerivedControlBase(scrollBar),
			fixedGripSize: scrollBar.getFixedGripSize(),
		} satisfies UamScrollBarNode;
	}
	if (child.propertyType === PropertyType.G_MOVIE_CLIP) {
		const movieClip = child as ReturnType<Document['createGMovieClip']>;
		return {
			kind: 'movieClip',
			id: movieClip.getId(),
			name: movieClip.getName(),
			position: { x: movieClip.getX(), y: movieClip.getY() },
			size: { width: movieClip.getWidth(), height: movieClip.getHeight() },
			visible: movieClip.getVisible(),
			touchable: movieClip.getTouchable(),
			grayed: movieClip.getGrayed(),
			alpha: movieClip.getAlpha(),
			rotation: movieClip.getRotation(),
			customData: '',
			relations: liftRelations(movieClip.getRelations()),
			gears: liftGears(movieClip.listGears()),
			resource: { packageId: movieClip.getPackageId(), resourceId: movieClip.getSrc() },
			fileName: movieClip.getFileName(),
			filter: movieClip.getFilter(),
			filterData: movieClip.getFilterData(),
			playing: movieClip.getPlaying(),
			frame: movieClip.getFrame(),
			color: movieClip.getColor(),
		} satisfies UamMovieClipNode;
	}

	throw new Error(`UAM lift does not support display node type "${child.propertyType}" in Gate A.`);
}

function liftControllers(component: ReturnType<Document['createComponent']>): UamControllerModel[] {
	return component.listControllers().map((controller) => ({
		name: controller.getName(),
		selectedIndex: controller.getSelectedIndex(),
		autoRadioGroupDepth: controller.getAutoRadioGroupDepth(),
		pages: controller.listPages().map((page) => ({
			id: page.getId(),
			name: page.getName(),
		})),
		actions: controller.listActions().map((action) => ({
			name: action.getName(),
			actionType: action.getActionType(),
			fromPageIds: action.getFromPage(),
			toPageIds: action.getToPage(),
			transitionName: action.getTransitionName(),
			playTimes: action.getPlayTimes(),
			delay: action.getDelay(),
			stopOnExit: action.getStopOnExit(),
			targetNodeId: action.getObjectId(),
			controllerName: action.getControllerName(),
			targetPage: action.getTargetPage(),
		})),
	}));
}

function liftTransitions(component: ReturnType<Document['createComponent']>): UamComponentModel['transitions'] {
	return component.listTransitions().map((transition) => ({
		name: transition.getName(),
		autoPlay: transition.getAutoPlay(),
		autoPlayTimes: transition.getAutoPlayTimes(),
		autoPlayDelay: transition.getAutoPlayDelay(),
		options: transition.getOptions(),
		fps: transition.getFps(),
		items: transition.listItems().map((item) => ({
			name: item.getName(),
			time: item.getTime(),
			actionType: item.getActionType(),
			targetNodeId: item.getTargetId(),
			tween: item.getTween(),
			duration: item.getDuration(),
			startValue: item.getStartValue(),
			endValue: item.getEndValue(),
			easeType: item.getEaseType(),
			repeat: item.getRepeat(),
			yoyo: item.getYoyo(),
			label: item.getLabel(),
			endLabel: item.getEndLabel(),
			path: item.getPath(),
			customEasePath: item.getCustomEasePath(),
		})),
	}));
}

function liftComponentResource(resource: ReturnType<Document['createComponent']>): UamComponentResource {
	return {
		kind: 'component',
		id: resource.getId(),
		name: resource.getName(),
		path: resource.getPath(),
		exported: resource.getExported(),
		branch: resource.getBranch(),
		branchItemIds: resource.getBranchItemIds(),
		component: {
			size: { width: resource.getWidth(), height: resource.getHeight() },
			customData: resource.getCustomData(),
			displayList: resource.listChildren().map((child) => liftDisplayNode(child)),
			controllers: liftControllers(resource),
			transitions: liftTransitions(resource),
		},
	};
}

export function liftDocumentToUamProject(doc: Document): UamProject {
	const root = doc.getRoot();
	return {
		projectId: root.getProjectId(),
		projectType: root.getProjectType(),
		version: root.getVersion(),
		branches: root.listBranches(),
		settings: cloneSettings(root.getSettings()),
		packages: root.listPackages().map((pkg) => ({
			id: pkg.getId(),
			name: pkg.getName(),
			publish: {
				name: pkg.getPublishName(),
				path: pkg.getPublishPath(),
				branchPath: pkg.getPublishBranchPath(),
				packageCount: pkg.getPublishPackageCount(),
				genCode: pkg.getGenCode(),
				codePath: pkg.getCodePath(),
			},
			resources: pkg.listResources().map((resource) => {
				if (resource.propertyType === 'Component') {
					return liftComponentResource(resource as ReturnType<Document['createComponent']>);
				}
				return liftAssetResource(resource as LiftableAssetResource);
			}),
		})),
	};
}

export async function writeProjectFromUam(
	io: Pick<PlatformIO, 'writeProject'>,
	project: UamProject,
	projectPath: string,
): Promise<void> {
	await io.writeProject(materializeUamProject(project), projectPath);
}

export async function readProjectAsUam(
	io: Pick<PlatformIO, 'readProject'>,
	projectPath: string,
): Promise<UamProject> {
	return liftDocumentToUamProject(await io.readProject(projectPath));
}
