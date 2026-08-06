import { bindLookGear, composeController } from '../authoring.js';
import { GearType, } from '../constants.js';
import { Document } from '../document.js';
import type { GObject } from '../properties/g-object.js';
import { applyDerivedMovieClipModel, deriveMovieClipModelFromJta } from '../utils/jta-parser.js';
import type {
	UamAnimationGearBinding,
	UamAssetResource,
	UamButtonNode,
	UamColorGearBinding,
	UamComboBoxNode,
	UamComponentInstanceProperties,
	UamComponentRefNode,
	UamComponentModel,
	UamComponentProperties,
	UamComponentResource,
	UamControllerModel,
	UamDisplay2GearBinding,
	UamDisplayGearBinding,
	UamDisplayNode,
	UamFontSizeGearBinding,
	UamGearBinding,
	UamGraphNode,
	UamGraphProperties,
	UamGroupNode,
	UamGroupProperties,
	UamIconGearBinding,
	UamImageNode,
	UamImageProperties,
	UamImageResourceProperties,
	UamLabelNode,
	UamListNode,
	UamListProperties,
	UamLoader3DNode,
	UamLoaderNode,
	UamLoaderProperties,
	UamLookGearBinding,
	UamMovieClipNode,
	UamMovieClipProperties,
	UamMovieClipResourceProperties,
	UamPlainTextProperties,
	UamProject,
	UamProgressBarNode,
	UamRichTextNode,
	UamScrollBarNode,
	UamSizeGearBinding,
	UamSliderNode,
	UamTextGearBinding,
	UamTextInputNode,
	UamTextNode,
	UamTextProperties,
	UamTreeNode,
	UamTreeProperties,
	UamXYGearBinding,
} from './model.js';
import { assertValidUamProject } from './validate.js';
import {
	cloneListItems,
	cloneSettings,
	ensureSupportedGearKind,
	ensureSupportedNodeKind,
	ensureSupportedResourceKind,
	materializeEdgeInsets,
	materializeRelations,
} from './bridge-shared.js';
import { defaultAssetSourcePath } from './project-source-files.js';

type MaterializedDisplayNodeBase = {
	setId(id: string): MaterializedDisplayNodeBase;
	setXY(x: number, y: number): MaterializedDisplayNodeBase;
	setSize(width: number, height: number): MaterializedDisplayNodeBase;
	setLocked(locked: boolean): MaterializedDisplayNodeBase;
	setAspect(aspect: boolean): MaterializedDisplayNodeBase;
	setMinWidth(width: number): MaterializedDisplayNodeBase;
	setMaxWidth(width: number): MaterializedDisplayNodeBase;
	setMinHeight(height: number): MaterializedDisplayNodeBase;
	setMaxHeight(height: number): MaterializedDisplayNodeBase;
	setPivot(x: number, y: number, anchor?: boolean): MaterializedDisplayNodeBase;
	setScale(x: number, y: number): MaterializedDisplayNodeBase;
	setSkew(x: number, y: number): MaterializedDisplayNodeBase;
	setVisible(visible: boolean): MaterializedDisplayNodeBase;
	setTouchable(touchable: boolean): MaterializedDisplayNodeBase;
	setGrayed(grayed: boolean): MaterializedDisplayNodeBase;
	setAlpha(alpha: number): MaterializedDisplayNodeBase;
	setRotation(rotation: number): MaterializedDisplayNodeBase;
	setTooltips(tooltips: string): MaterializedDisplayNodeBase;
	setBlendMode(blendMode: string): MaterializedDisplayNodeBase;
	setFilter(filter: string): MaterializedDisplayNodeBase;
	setFilterData(filterData: string): MaterializedDisplayNodeBase;
	setCustomData(customData: string): MaterializedDisplayNodeBase;
	setRelations(relations: Array<{ target: string; type: number; usePercent: boolean }>): MaterializedDisplayNodeBase;
};

export function materializeUamGraphProperties(
	graph: ReturnType<Document['createGGraph']>,
	properties: UamGraphProperties,
): void {
	graph
		.setGraphType(properties.graphType)
		.setLineSize(properties.lineSize)
		.setLineColor(properties.lineColor)
		.setFillColor(properties.fillColor)
		.setCornerRadius(properties.cornerRadius)
		.setPoints(properties.points)
		.setSides(properties.sides)
		.setStartAngle(properties.startAngle)
		.setDistances(properties.distances);
}

export function materializeUamImageProperties(
	image: ReturnType<Document['createGImage']>,
	properties: UamImageProperties,
): void {
	image
		.setColor(properties.color)
		.setFlip(properties.flip)
		.setFillMethod(properties.fillMethod)
		.setFillOrigin(properties.fillOrigin)
		.setFillClockwise(properties.fillClockwise)
		.setFillAmount(properties.fillAmount);
}

export function materializeUamMovieClipProperties(
	movieClip: ReturnType<Document['createGMovieClip']>,
	properties: UamMovieClipProperties,
): void {
	movieClip
		.setPlaying(properties.playing)
		.setFrame(properties.frame)
		.setColor(properties.color);
}

export function materializeUamTextProperties(
	text: ReturnType<Document['createGTextField']>,
	properties: UamTextProperties | UamPlainTextProperties,
): void {
	text
		.setText(properties.text)
		.setFont(properties.font)
		.setFontSize(properties.fontSize)
		.setColor(properties.color)
		.setAlign(properties.align)
		.setVAlign(properties.vAlign)
		.setLeading(properties.leading)
		.setLetterSpacing(properties.letterSpacing)
		.setAutoSize(properties.autoSize)
		.setSingleLine(properties.singleLine)
		.setAutoClearText(properties.autoClearText)
		.setOutlineSoftness(properties.outlineSoftness)
		.setUnderlaySoftness(properties.underlaySoftness)
		.setUbbEnabled(properties.ubbEnabled)
		.setUnderline(properties.underline)
		.setItalic(properties.italic)
		.setBold(properties.bold)
		.setStrikethrough(properties.strikethrough)
		.setStrokeColor(properties.strokeColor)
		.setStrokeSize(properties.strokeSize)
		.setShadowColor(properties.shadowColor)
		.setShadowOffset(properties.shadowOffset);
	if ('demoText' in properties) {
		text
			.setDemoText(properties.demoText)
			.setTemplateVarsEnabled(properties.templateVarsEnabled)
			.setFaceDilate(properties.faceDilate);
	}
}

export function materializeUamLoaderProperties(
	loader: ReturnType<Document['createGLoader']>,
	properties: UamLoaderProperties,
): void {
	loader
		.setUrl(properties.url)
		.setFill(properties.fill)
		.setShrinkOnly(properties.shrinkOnly)
		.setAutoSize(properties.autoSize)
		.setUseResize(properties.useResize)
		.setAlign(properties.align)
		.setVAlign(properties.vAlign)
		.setFrame(properties.frame)
		.setPlaying(properties.playing)
		.setColor(properties.color)
		.setFillMethod(properties.fillMethod)
		.setFillOrigin(properties.fillOrigin)
		.setFillClockwise(properties.fillClockwise)
		.setFillAmount(properties.fillAmount)
		.setClearOnPublish(properties.clearOnPublish);
}

export function materializeUamGroupProperties(
	group: ReturnType<Document['createGGroup']>,
	properties: UamGroupProperties,
): void {
	group
		.setLayout(properties.layout)
		.setLineGap(properties.lineGap)
		.setColumnGap(properties.columnGap)
		.setAdvanced(properties.advanced)
		.setExcludeInvisibles(properties.excludeInvisibles)
		.setAutoSizeDisabled(properties.autoSizeDisabled)
		.setMainGridIndex(properties.mainGridIndex);
}

export function materializeUamListProperties(
	list: ReturnType<Document['createGList']> | ReturnType<Document['createGTree']>,
	properties: UamListProperties | UamTreeProperties,
): void {
	list
		.setLayout(properties.layout)
		.setAlign(properties.align)
		.setVAlign(properties.vAlign)
		.setLineGap(properties.lineGap)
		.setColumnGap(properties.columnGap)
		.setLineCount(properties.lineCount)
		.setColumnCount(properties.columnCount)
		.setSelectionMode(properties.selectionMode)
		.setDefaultItem(properties.defaultItem)
		.setAutoResizeItem(properties.autoResizeItem)
		.setChildrenRenderOrder(properties.childrenRenderOrder)
		.setApexIndex(properties.apexIndex)
		.setSrc(properties.src)
		.setOverflow(properties.overflow)
		.setScrollType(properties.scrollType)
		.setScrollBarDisplay(properties.scrollBarDisplay)
		.setScrollBarFlags(properties.scrollBarFlags)
		.setScrollBarMargin(materializeEdgeInsets(properties.scrollBarMargin))
		.setVtScrollBarRes(properties.vtScrollBarRes)
		.setHzScrollBarRes(properties.hzScrollBarRes)
		.setHeaderRes(properties.headerRes)
		.setFooterRes(properties.footerRes)
		.setMargin(materializeEdgeInsets(properties.margin))
		.setClipSoftness(properties.clipSoftness)
		.setScrollItemToViewOnClick(properties.scrollItemToViewOnClick)
		.setFoldInvisibleItems(properties.foldInvisibleItems)
		.setAutoClearItems(properties.autoClearItems)
		.setListItems(cloneListItems(properties.listItems))
		.setPageController(properties.pageController)
		.setControllerOverrides(properties.controllerOverrides)
		.setSelectionController(properties.selectionController);
	if ('treeView' in properties) {
		(list as ReturnType<Document['createGTree']>)
			.setTreeView(properties.treeView)
			.setIndent(properties.indent)
			.setClickToExpand(properties.clickToExpand);
	}
}

export function materializeUamComponentInstanceProperties(
	component: ReturnType<Document['createGComponent']>,
	properties: UamComponentInstanceProperties | null | undefined,
): void {
	component
		.setInstanceExtType('')
		.setInstanceTitle('')
		.setInstanceSelectedTitle('')
		.setInstanceIcon('')
		.setInstanceSelectedIcon('')
		.setInstanceTitleColor('')
		.setInstanceTitleFontSize(0)
		.setInstanceController('')
		.setInstancePage('')
		.setInstanceChecked(false)
		.setInstanceSound('')
		.setInstanceSoundVolumeScale(1)
		.setInstancePopupDirection(0)
		.setInstancePromptText('')
		.setInstanceSelectionController('')
		.setInstanceVisibleItemCount(0)
		.setInstanceAutoClearItems(false)
		.setInstanceValue(0)
		.setInstanceMax(0)
		.setInstanceMin(0)
		.setInstanceComboItems([]);
	if (!properties) return;

	component.setInstanceExtType(properties.extensionType);
	switch (properties.extensionType) {
		case 'Button':
			component
				.setInstanceTitle(properties.title)
				.setInstanceSelectedTitle(properties.selectedTitle)
				.setInstanceIcon(properties.icon)
				.setInstanceSelectedIcon(properties.selectedIcon)
				.setInstanceTitleColor(properties.titleColor)
				.setInstanceTitleFontSize(properties.titleFontSize)
				.setInstanceController(properties.controller)
				.setInstancePage(properties.page)
				.setInstanceChecked(properties.checked)
				.setInstanceSound(properties.sound)
				.setInstanceSoundVolumeScale(properties.soundVolumeScale);
			return;
		case 'Label':
			component
				.setInstanceTitle(properties.title)
				.setInstanceIcon(properties.icon)
				.setInstanceTitleColor(properties.titleColor)
				.setInstanceTitleFontSize(properties.titleFontSize)
				.setInstancePromptText(properties.promptText)
				.setInstanceSound(properties.sound)
				.setInstanceSoundVolumeScale(properties.soundVolumeScale);
			return;
		case 'ComboBox':
			component
				.setInstanceTitle(properties.title)
				.setInstanceIcon(properties.icon)
				.setInstanceTitleColor(properties.titleColor)
				.setInstancePopupDirection(properties.popupDirection)
				.setInstanceSound(properties.sound)
				.setInstanceSoundVolumeScale(properties.soundVolumeScale)
				.setInstanceVisibleItemCount(properties.visibleItemCount)
				.setInstanceSelectionController(properties.selectionController)
				.setInstanceAutoClearItems(properties.autoClearItems)
				.setInstanceComboItems(properties.items.map((item) => ({ ...item })));
			return;
		case 'ProgressBar':
			component
				.setInstanceValue(properties.value)
				.setInstanceMax(properties.max)
				.setInstanceMin(properties.min)
				.setInstanceSound(properties.sound)
				.setInstanceSoundVolumeScale(properties.soundVolumeScale);
			return;
		case 'Slider':
			component
				.setInstanceValue(properties.value)
				.setInstanceMax(properties.max)
				.setInstanceMin(properties.min);
			return;
		case 'ScrollBar':
			return;
	}
}

export function materializeUamComponentProperties(
	component: ReturnType<Document['createComponent']>,
	properties: UamComponentProperties,
): void {
	component
		.setMinWidth(properties.minSize.width)
		.setMinHeight(properties.minSize.height)
		.setMaxWidth(properties.maxSize.width)
		.setMaxHeight(properties.maxSize.height)
		.setPivotX(properties.pivot.x)
		.setPivotY(properties.pivot.y)
		.setPivotAsAnchor(properties.pivotAsAnchor)
		.setOverflow(properties.overflow)
		.setMargin(properties.margin)
		.setClipSoftness(properties.clipSoftness)
		.setHitTest(properties.hitTest)
		.setMask(properties.mask)
		.setReversedMask(properties.reversedMask)
		.setScrollType(properties.scrollType)
		.setScrollBarDisplay(properties.scrollBarDisplay)
		.setScrollBarFlags(properties.scrollBarFlags)
		.setScrollBarMargin(properties.scrollBarMargin)
		.setVtScrollBarRes(properties.vtScrollBarRes)
		.setHzScrollBarRes(properties.hzScrollBarRes)
		.setHeaderRes(properties.headerRes)
		.setFooterRes(properties.footerRes)
		.setBgColor(properties.bgColor)
		.setBgColorEnabled(properties.bgColorEnabled)
		.setDesignImageAlpha(properties.designImageAlpha)
		.setDesignImageLayer(properties.designImageLayer)
		.setDesignImageOffsetX(properties.designImageOffset.x)
		.setDesignImageOffsetY(properties.designImageOffset.y)
		.setDesignImage(properties.designImage)
		.setDesignImageForTest(properties.designImageForTest)
		.setPageController(properties.pageController)
		.setAddedToStageSound(properties.showSound)
		.setRemovedFromStageSound(properties.hideSound)
		.setIdNum(properties.idNum)
		.setInitName(properties.initName)
		.setRemark(properties.remark)
		.setExtensionType(properties.extensionType)
		.setOpaque(properties.opaque)
		.setButtonMode(properties.buttonMode)
		.setSound(properties.sound)
		.setSoundVolumeScale(properties.soundVolumeScale)
		.setDownEffect(properties.downEffect)
		.setDownEffectValue(properties.downEffectValue)
		.setDropdown(properties.dropdown)
		.setPromptText(properties.promptText)
		.setSelectionController(properties.selectionController)
		.setTitleType(properties.titleType)
		.setReverse(properties.reverse)
		.setWholeNumbers(properties.wholeNumbers)
		.setChangeOnClick(properties.changeOnClick)
		.setFixedGripSize(properties.fixedGripSize)
		.setAutoClearItems(properties.autoClearItems)
		.setCustomProperties(properties.customProperties);
}

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


function materializeDisplayNodeBase<TNode extends UamDisplayNode, TTarget extends MaterializedDisplayNodeBase>(
	target: TTarget,
	node: TNode,
): TTarget {
	target
		.setId(node.id)
		.setXY(node.position.x, node.position.y)
		.setSize(node.size.width, node.size.height)
		.setLocked(node.locked ?? false)
		.setAspect(node.aspect ?? false)
		.setMinWidth(node.minSize?.width ?? 0)
		.setMaxWidth(node.maxSize?.width ?? 0)
		.setMinHeight(node.minSize?.height ?? 0)
		.setMaxHeight(node.maxSize?.height ?? 0)
		.setPivot(node.pivot?.x ?? 0, node.pivot?.y ?? 0, node.pivotAsAnchor ?? false)
		.setScale(node.scale?.x ?? 1, node.scale?.y ?? 1)
		.setSkew(node.skew?.x ?? 0, node.skew?.y ?? 0)
		.setVisible(node.visible)
		.setTouchable(node.touchable)
		.setGrayed(node.grayed)
		.setAlpha(node.alpha)
		.setRotation(node.rotation)
		.setTooltips(node.tooltips ?? '')
		.setBlendMode(node.blendMode ?? 'normal')
		.setFilter(node.filter ?? '')
		.setFilterData(node.filterData ?? '')
		.setCustomData(node.customData)
		.setRelations(materializeRelations(node.relations));
	if ('group' in node) {
		(target as TTarget & { setGroup(group: string): unknown }).setGroup(node.group);
	}
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


type MaterializedAssetBase = {
	setId(id: string): MaterializedAssetBase;
	setPath(path: string): MaterializedAssetBase;
	setBranch(branch: string): MaterializedAssetBase;
	setBranchItemIds(ids: string[]): MaterializedAssetBase;
	setExported(exported: boolean): MaterializedAssetBase;
	setFavorite(favorite: boolean): MaterializedAssetBase;
};

type MaterializedSourceDataResource = MaterializedAssetBase & {
	setSourceData(buffer: ReturnType<Document['createBuffer']> | null): MaterializedSourceDataResource;
};

function materializeAssetBase<TResource extends MaterializedAssetBase>(asset: TResource, resource: UamAssetResource): TResource {
	asset
		.setId(resource.id)
		.setPath(resource.path)
		.setBranch(resource.branch)
		.setBranchItemIds(resource.branchItemIds)
		.setExported(resource.exported)
		.setFavorite(resource.favorite);
	return asset;
}


function attachAssetSourceData<TResource extends MaterializedSourceDataResource>(
	doc: Document,
	asset: TResource,
	resource: UamAssetResource,
): TResource {
	if (resource.sourceBytes === undefined && !resource.sourcePath) return asset;
	const buffer = doc.createBuffer()
		.setURI(resource.sourcePath ?? defaultAssetSourcePath(resource))
		.setData(resource.sourceBytes ? new Uint8Array(resource.sourceBytes) : null);
	asset.setSourceData(buffer);
	return asset;
}

type UamMetadataAssetResource = Exclude<UamAssetResource, { kind: 'image' | 'movieClip' }>;

function metadataNumber(resource: UamMetadataAssetResource, key: string, fallback: number): number {
	const value = resource.metadata?.[key];
	return typeof value === 'number' ? value : fallback;
}

function metadataBoolean(resource: UamMetadataAssetResource, key: string, fallback: boolean): boolean {
	const value = resource.metadata?.[key];
	return typeof value === 'boolean' ? value : fallback;
}

function metadataStringArray(resource: UamMetadataAssetResource, key: string): string[] {
	const value = resource.metadata?.[key];
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

export function materializeUamImageResourceProperties(
	image: ReturnType<Document['createImageResource']>,
	properties: UamImageResourceProperties,
): void {
	image
		.setTextureSetMode(properties.textureSetMode)
		.setQualityOption(properties.qualityOption)
		.setQuality(properties.quality)
		.setSmoothing(properties.smoothing)
		.setDuplicatePadding(properties.duplicatePadding)
		.setScaleOption(properties.scaleOption)
		.setScale9Grid(properties.scale9Grid ? [...properties.scale9Grid] : null)
		.setTileGridIndice(properties.tileGridIndice);
}

export function materializeUamMovieClipResourceProperties(
	doc: Document,
	movieClip: ReturnType<Document['createMovieClipResource']>,
	properties: UamMovieClipResourceProperties,
): void {
	const frames = properties.frames.map((frame, index) => doc.createMovieFrame(`${movieClip.getId()}_${index}`)
		.setRectX(frame.rectX)
		.setRectY(frame.rectY)
		.setRectWidth(frame.rectWidth)
		.setRectHeight(frame.rectHeight)
		.setAddDelay(frame.addDelay)
		.setSpriteId(frame.spriteId));
	movieClip
		.setInterval(properties.interval)
		.setRepeatDelay(properties.repeatDelay)
		.setSwing(properties.swing)
		.setSmoothing(properties.smoothing);
	for (const frame of movieClip.listFrames()) movieClip.removeFrame(frame);
	for (const frame of frames) movieClip.addFrame(frame);
}

export function materializeAssetResource(doc: Document, resource: UamAssetResource) {
	ensureSupportedResourceKind(resource.kind);
	if (resource.kind === 'image') {
		const image = materializeAssetBase(doc.createImageResource(resource.name), resource)
			.setWidth(resource.dimensions?.width ?? 0)
			.setHeight(resource.dimensions?.height ?? 0);
		if (resource.fileName) image.setFileName(resource.fileName);
		materializeUamImageResourceProperties(image, resource.image);
		return attachAssetSourceData(doc, image, resource);
	}
	if (resource.kind === 'movieClip') {
		const movieClip = materializeAssetBase(doc.createMovieClipResource(resource.name), resource)
			.setWidth(resource.dimensions?.width ?? 0)
			.setHeight(resource.dimensions?.height ?? 0);
		if (resource.fileName) movieClip.setFileName(resource.fileName);
		materializeUamMovieClipResourceProperties(doc, movieClip, resource.movieClip);
		if (resource.sourceBytes instanceof Uint8Array) {
			try {
				applyDerivedMovieClipModel(doc, movieClip, deriveMovieClipModelFromJta(resource.sourceBytes));
			} catch {
				// Keep the stored model when source bytes cannot be derived.
			}
		}
		return attachAssetSourceData(doc, movieClip, resource);
	}
	if (resource.kind === 'sound') {
		return attachAssetSourceData(
			doc,
			materializeAssetBase(doc.createSoundResource(resource.name), resource).setFile(resource.file ?? ''),
			resource,
		);
	}
	if (resource.kind === 'misc') {
		return attachAssetSourceData(
			doc,
			materializeAssetBase(doc.createMiscResource(resource.name), resource).setFile(resource.file ?? ''),
			resource,
		);
	}
	if (resource.kind === 'font') {
		const font = materializeAssetBase(doc.createFontResource(resource.name), resource);
		if (resource.fileName) font.setFileName(resource.fileName);
		return attachAssetSourceData(doc, font
			.setTextureId(`${resource.metadata?.textureId ?? ''}`)
			.setRenderMode(`${resource.metadata?.renderMode ?? ''}`)
			.setSamplePointSize(metadataNumber(resource, 'samplePointSize', 0))
			.setTtf(metadataBoolean(resource, 'ttf', false))
			.setTint(metadataBoolean(resource, 'tint', false))
			.setAutoScale(metadataBoolean(resource, 'autoScale', false))
			.setHasChannel(metadataBoolean(resource, 'hasChannel', false))
			.setFontSize(metadataNumber(resource, 'fontSize', 0))
			.setXAdvance(metadataNumber(resource, 'xAdvance', 0))
			.setLineHeight(metadataNumber(resource, 'lineHeight', 0)), resource);
	}
	const skeleton = resource.kind === 'spine'
		? doc.createSpineResource(resource.name)
		: doc.createDragonBonesResource(resource.name);
	return attachAssetSourceData(doc, materializeAssetBase(skeleton, resource)
		.setFile(resource.file ?? '')
		.setWidth(resource.dimensions?.width ?? 0)
		.setHeight(resource.dimensions?.height ?? 0)
		.setRequireIds(metadataStringArray(resource, 'requireIds'))
		.setAtlasNames(metadataStringArray(resource, 'atlasNames'))
		.setAnchor(metadataNumber(resource, 'anchorX', 0), metadataNumber(resource, 'anchorY', 0)), resource);
}

export function materializeDisplayNode(
	doc: Document,
	node: UamDisplayNode,
): GObject {
	ensureSupportedNodeKind(node.kind);

	if (node.kind === 'image') {
		const imageNode = node as UamImageNode;
		const image = materializeDisplayNodeBase(doc.createGImage(node.name), node)
			.setGroup(imageNode.group)
			.setSrc(imageNode.resource.resourceId);
		materializeUamImageProperties(image, imageNode);
		return image;
	}

	if (node.kind === 'text' || node.kind === 'richText' || node.kind === 'textInput') {
		const textNode = node as UamTextNode | UamRichTextNode | UamTextInputNode;
		const text = node.kind === 'richText'
			? doc.createGRichTextField(node.name)
			: node.kind === 'textInput'
				? doc.createGTextInput(node.name)
				: doc.createGTextField(node.name);
		materializeDisplayNodeBase(text, node)
			.setGroup(textNode.group);
		materializeUamTextProperties(text, textNode);
		if (node.kind === 'textInput') {
			const inputNode = node as UamTextInputNode;
			(text as ReturnType<Document['createGTextInput']>)
				.setPromptText(inputNode.promptText)
				.setMaxLength(inputNode.maxLength)
				.setRestrict(inputNode.restrict)
				.setPassword(inputNode.password)
				.setKeyboardType(inputNode.keyboardType);
		}
		return text;
	}

	if (node.kind === 'component') {
		const componentNode = node as UamComponentRefNode;
		const component = materializeDisplayNodeBase(doc.createGComponent(node.name), node)
			.setGroup(componentNode.group)
			.setSrc(componentNode.resource.resourceId)
			.setPackageId(componentNode.resource.packageId ?? '')
			.setPropertyOverrides((componentNode.propertyOverrides ?? []).map((property) => ({ ...property })));
		materializeUamComponentInstanceProperties(component, componentNode.instanceProperties);
		return component;
	}

	if (node.kind === 'list' || node.kind === 'tree') {
		const listNode = node as UamListNode | UamTreeNode;
		const list = node.kind === 'tree' ? doc.createGTree(node.name) : doc.createGList(node.name);
		materializeDisplayNodeBase(list, node)
			.setGroup(listNode.group);
		materializeUamListProperties(list, listNode);
		return list;
	}

	if (node.kind === 'graph') {
		const graphNode = node as UamGraphNode;
		const graph = materializeDisplayNodeBase(doc.createGGraph(node.name), node)
			.setGroup(graphNode.group);
		materializeUamGraphProperties(graph, graphNode);
		return graph;
	}

	if (node.kind === 'group') {
		const groupNode = node as UamGroupNode;
		const group = materializeDisplayNodeBase(doc.createGGroup(node.name), node)
			.setGroup(groupNode.group);
		materializeUamGroupProperties(group, groupNode);
		return group;
	}

	if (node.kind === 'loader') {
		const loaderNode = node as UamLoaderNode;
		const loader = materializeDisplayNodeBase(doc.createGLoader(node.name), node);
		materializeUamLoaderProperties(loader, loaderNode);
		return loader;
	}

	if (node.kind === 'loader3D') {
		const loaderNode = node as UamLoader3DNode;
		const loader = materializeDisplayNodeBase(doc.createGLoader3D(node.name), node)
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
			.setColor(loaderNode.color)
			.setClearOnPublish(loaderNode.clearOnPublish);
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
	const movieClip = materializeDisplayNodeBase(doc.createGMovieClip(node.name), node)
		.setGroup(movieClipNode.group)
		.setSrc(movieClipNode.resource.resourceId)
		.setPackageId(movieClipNode.resource.packageId ?? '')
		.setFileName(movieClipNode.fileName);
	materializeUamMovieClipProperties(movieClip, movieClipNode);
	return movieClip;
}

function composeControllers(doc: Document, component: ReturnType<Document['createComponent']>, controllers: UamControllerModel[]): void {
	for (const controller of controllers) {
		composeController(doc, component, {
			name: controller.name,
			selectedIndex: controller.selectedIndex,
			autoRadioGroupDepth: controller.autoRadioGroupDepth,
			alias: controller.alias,
			exported: controller.exported,
			homePageType: controller.homePageType,
			homePage: controller.homePage,
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
		const materialized = doc.createTransition(transition.name)
			.setAutoPlay(transition.autoPlay)
			.setAutoPlayTimes(transition.autoPlayTimes)
			.setAutoPlayDelay(transition.autoPlayDelay)
			.setOptions(transition.options)
			.setFps(transition.fps);
		for (const item of transition.items) {
			materialized.addItem(doc.createTransitionItem(item.name)
				.setTime(item.time)
				.setTargetId(item.targetNodeId)
				.setActionType(item.actionType)
				.setTween(item.tween)
				.setDuration(item.duration)
				.setStartValue([...item.startValue])
				.setEndValue([...item.endValue])
				.setEaseType(item.easeType)
				.setRepeat(item.repeat)
				.setYoyo(item.yoyo)
				.setLabel(item.label)
				.setEndLabel(item.endLabel)
				.setPath(item.path)
				.setCustomEasePath(item.customEasePath));
		}
		component.addTransition(materialized);
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

export function parseLookGearValue(value: string | null) {
	if (!value || value === '-') return null;
	const parts = value.split(',');
	return {
		alpha: parseNumber(parts[0], 1),
		rotation: parseNumber(parts[1], 0),
		grayed: parseBool(parts[2], false),
		touchable: parseBool(parts[3], true),
	};
}

export function parseGenericGearValue(kind: UamGenericValueGearBinding['kind'], value: string | null) {
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

export function defaultGenericGearValue(kind: UamGenericValueGearBinding['kind']) {
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

export function materializeUamGear(
	doc: Document,
	component: ReturnType<Document['createComponent']>,
	target: GObject,
	gear: UamGearBinding,
): void {
	ensureSupportedGearKind(gear.kind);
	if (gear.kind === 'display' || gear.kind === 'display2') {
		materializeDisplayGear(doc, component, target, gear);
	} else if (gear.kind === 'look') {
		materializeLookGear(doc, component, target, gear);
	} else {
		materializeGenericValueGear(doc, component, target, gear);
	}
}

function materializeGears(
	doc: Document,
	component: ReturnType<Document['createComponent']>,
	target: GObject,
	gears: UamGearBinding[],
): void {
	for (const gear of gears) {
		materializeUamGear(doc, component, target, gear);
	}
}

function materializeComponentResource(doc: Document, resource: UamComponentResource): ReturnType<Document['createComponent']> {
	const component = doc.createComponent(resource.name)
		.setId(resource.id)
		.setPath(resource.path)
		.setBranch(resource.branch)
		.setBranchItemIds(resource.branchItemIds)
		.setExported(resource.exported)
		.setFavorite(resource.favorite)
		.setSize(resource.component.size.width, resource.component.size.height)
		.setCustomData(resource.component.customData);
	materializeUamComponentProperties(component, resource.component.properties);

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
		const pkg = doc.createPackage(pkgSpec.name)
			.setId(pkgSpec.id)
			.setCompressPNG(pkgSpec.compressPNG)
			.setJpegQuality(pkgSpec.jpegQuality)
			.setBranchNames(pkgSpec.branchNames)
			.setResourceFolders(pkgSpec.folders);
		pkg.setExtras({ ...pkg.getExtras(), _preservePackageResourceOrder: true });
		if (pkgSpec.publish) {
			pkg
				.setPublishName(pkgSpec.publish.name)
				.setPublishPath(pkgSpec.publish.path)
				.setPublishBranchPath(pkgSpec.publish.branchPath)
				.setPublishPackageCount(pkgSpec.publish.packageCount)
				.setGenCode(pkgSpec.publish.genCode)
				.setCodePath(pkgSpec.publish.codePath)
				.setSourceAtlasSettings({
					useGlobal: pkgSpec.publish.useGlobalAtlasSettings,
					maxSize: pkgSpec.publish.maxAtlasSize,
					sizeOption: pkgSpec.publish.sizeOption,
					forceSquare: pkgSpec.publish.forceSquare,
					allowRotation: pkgSpec.publish.allowRotation,
					paging: pkgSpec.publish.paging,
					extractAlpha: pkgSpec.publish.extractAlpha,
					maxIndex: pkgSpec.publish.maxAtlasIndex,
					atlases: pkgSpec.publish.atlases,
					excludedResourceIds: pkgSpec.publish.excludedResourceIds,
				});
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
