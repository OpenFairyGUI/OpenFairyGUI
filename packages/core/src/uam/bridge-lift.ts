import { GearType, PropertyType } from '../constants.js';
import type { Document } from '../document.js';
import type { GObject } from '../properties/g-object.js';
import type {
	UamAnimationGearBinding,
	UamAssetResource,
	UamButtonNode,
	UamColorGearBinding,
	UamComboBoxNode,
	UamComponentInstanceProperties,
	UamComponentModel,
	UamComponentProperties,
	UamComponentResource,
	UamControllerModel,
	UamDisplay2GearBinding,
	UamDisplayGearBinding,
	UamDisplayNode,
	UamFontSizeGearBinding,
	UamGearBinding,
	UamIconGearBinding,
	UamLabelNode,
	UamLookGearBinding,
	UamMovieClipNode,
	UamProject,
	UamProgressBarNode,
	UamRichTextNode,
	UamScrollBarNode,
	UamSizeGearBinding,
	UamSliderNode,
	UamTextGearBinding,
	UamTextInputNode,
	UamTextNode,
	UamXYGearBinding,
} from './model.js';
import {
	cloneListItems,
	cloneSettings,
	liftEdgeInsets,
	liftRelations,
} from './bridge-shared.js';
import {
	defaultGenericGearValue,
	parseGenericGearValue,
	parseLookGearValue,
} from './bridge-materialize.js';

type LiftableDisplayNodeBase = {
	getId(): string;
	getName(): string;
	getX(): number;
	getY(): number;
	getWidth(): number;
	getHeight(): number;
	getPivotX(): number;
	getPivotY(): number;
	getPivotAsAnchor(): boolean;
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
	'id' | 'name' | 'position' | 'size' | 'pivot' | 'pivotAsAnchor' | 'visible' | 'touchable' | 'grayed' | 'alpha' | 'rotation' | 'customData' | 'relations' | 'gears'
>;

type LiftedComponentDerivedControlBase = LiftedDisplayNodeBase & Pick<UamButtonNode, 'src' | 'packageId'>;
type LiftedTitleControlBase = LiftedComponentDerivedControlBase &
	Pick<UamButtonNode, 'title' | 'icon' | 'titleColor' | 'titleFontSize' | 'sound' | 'soundVolumeScale'>;


function liftDisplayNodeBase(child: LiftableDisplayNodeBase): LiftedDisplayNodeBase {
	return {
		id: child.getId(),
		name: child.getName(),
		position: { x: child.getX(), y: child.getY() },
		size: { width: child.getWidth(), height: child.getHeight() },
		pivot: { x: child.getPivotX(), y: child.getPivotY() },
		pivotAsAnchor: child.getPivotAsAnchor(),
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


type LiftableAssetResource = {
	propertyType: string;
	getId(): string;
	getName(): string;
	getPath(): string;
	getExported(): boolean;
	getFavorite(): boolean;
	getBranch(): string;
	getBranchItemIds(): string[];
	getSourceData?(): {
		getURI(): string;
		getData(): Uint8Array | null;
	} | null;
};

function liftAssetSourceData(resource: LiftableAssetResource): Pick<UamAssetResource, 'sourceBytes' | 'sourcePath'> {
	const buffer = resource.getSourceData?.();
	if (!buffer) return {};
	const sourceBytes = buffer.getData();
	return {
		...(sourceBytes ? { sourceBytes: new Uint8Array(sourceBytes) } : { sourceBytes: null }),
		...(buffer.getURI() ? { sourcePath: buffer.getURI() } : {}),
	};
}

function baseAssetResource<TKind extends UamAssetResource['kind']>(kind: TKind, resource: LiftableAssetResource) {
	return {
		kind,
		id: resource.getId(),
		name: resource.getName(),
		path: resource.getPath(),
		exported: resource.getExported(),
		favorite: resource.getFavorite(),
		branch: resource.getBranch(),
		branchItemIds: resource.getBranchItemIds(),
		...liftAssetSourceData(resource),
	};
}

function liftAssetResource(resource: LiftableAssetResource): UamAssetResource {
	if (resource.propertyType === PropertyType.IMAGE_RESOURCE) {
		const image = resource as ReturnType<Document['createImageResource']>;
		const scale9Grid = image.getScale9Grid();
		return {
			...baseAssetResource('image', image),
			fileName: image.getFileName(),
			dimensions: {
				width: image.getWidth(),
				height: image.getHeight(),
			},
			image: {
				textureSetMode: image.getTextureSetMode(),
				qualityOption: image.getQualityOption(),
				quality: image.getQuality(),
				smoothing: image.getSmoothing(),
				duplicatePadding: image.getDuplicatePadding(),
				scaleOption: image.getScaleOption() as 0 | 1 | 2,
				scale9Grid: scale9Grid ? [...scale9Grid] : null,
				tileGridIndice: image.getTileGridIndice(),
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
			pivot: { x: image.getPivotX(), y: image.getPivotY() },
			pivotAsAnchor: image.getPivotAsAnchor(),
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
			pivot: { x: text.getPivotX(), y: text.getPivotY() },
			pivotAsAnchor: text.getPivotAsAnchor(),
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
		const instanceProperties = liftComponentInstanceProperties(component);
		return {
			kind: 'component',
			id: component.getId(),
			name: component.getName(),
			position: { x: component.getX(), y: component.getY() },
			size: { width: component.getWidth(), height: component.getHeight() },
			pivot: { x: component.getPivotX(), y: component.getPivotY() },
			pivotAsAnchor: component.getPivotAsAnchor(),
			visible: component.getVisible(),
			touchable: component.getTouchable(),
			grayed: component.getGrayed(),
			alpha: component.getAlpha(),
			rotation: component.getRotation(),
			customData: component.getCustomData(),
			relations: liftRelations(component.getRelations()),
			gears: liftGears(component.listGears()),
			resource: { packageId: component.getPackageId(), resourceId: component.getSrc() },
			...(instanceProperties ? { instanceProperties } : {}),
		};
	}
	if (child.propertyType === PropertyType.G_LIST || child.propertyType === PropertyType.G_TREE) {
		const list = child as ReturnType<Document['createGList']>;
		const base = {
			id: list.getId(),
			name: list.getName(),
			position: { x: list.getX(), y: list.getY() },
			size: { width: list.getWidth(), height: list.getHeight() },
			pivot: { x: list.getPivotX(), y: list.getPivotY() },
			pivotAsAnchor: list.getPivotAsAnchor(),
			visible: list.getVisible(),
			touchable: list.getTouchable(),
			grayed: list.getGrayed(),
			alpha: list.getAlpha(),
			rotation: list.getRotation(),
			customData: list.getCustomData(),
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
			customData: graph.getCustomData(),
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
			pivot: { x: group.getPivotX(), y: group.getPivotY() },
			pivotAsAnchor: group.getPivotAsAnchor(),
			visible: group.getVisible(),
			touchable: group.getTouchable(),
			grayed: group.getGrayed(),
			alpha: group.getAlpha(),
			rotation: group.getRotation(),
			customData: group.getCustomData(),
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
			customData: loader.getCustomData(),
			relations: liftRelations(loader.getRelations()),
			gears: liftGears(loader.listGears()),
			pivot: { x: loader.getPivotX(), y: loader.getPivotY() },
			pivotAsAnchor: loader.getPivotAsAnchor(),
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
			pivot: { x: loader.getPivotX(), y: loader.getPivotY() },
			pivotAsAnchor: loader.getPivotAsAnchor(),
			visible: loader.getVisible(),
			touchable: loader.getTouchable(),
			grayed: loader.getGrayed(),
			alpha: loader.getAlpha(),
			rotation: loader.getRotation(),
			customData: loader.getCustomData(),
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
			clearOnPublish: loader.getClearOnPublish(),
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
			pivot: { x: movieClip.getPivotX(), y: movieClip.getPivotY() },
			pivotAsAnchor: movieClip.getPivotAsAnchor(),
			visible: movieClip.getVisible(),
			touchable: movieClip.getTouchable(),
			grayed: movieClip.getGrayed(),
			alpha: movieClip.getAlpha(),
			rotation: movieClip.getRotation(),
			customData: movieClip.getCustomData(),
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

function liftComponentInstanceProperties(
	component: ReturnType<Document['createGComponent']>,
): UamComponentInstanceProperties | undefined {
	switch (component.getInstanceExtType()) {
		case 'Button':
			return {
				extensionType: 'Button',
				title: component.getInstanceTitle(),
				selectedTitle: component.getInstanceSelectedTitle(),
				icon: component.getInstanceIcon(),
				selectedIcon: component.getInstanceSelectedIcon(),
				titleColor: component.getInstanceTitleColor(),
				titleFontSize: component.getInstanceTitleFontSize(),
				controller: component.getInstanceController(),
				page: component.getInstancePage(),
				checked: component.getInstanceChecked(),
				sound: component.getInstanceSound(),
				soundVolumeScale: component.getInstanceSoundVolumeScale(),
			};
		case 'Label':
			return {
				extensionType: 'Label',
				title: component.getInstanceTitle(),
				icon: component.getInstanceIcon(),
				titleColor: component.getInstanceTitleColor(),
				titleFontSize: component.getInstanceTitleFontSize(),
				promptText: component.getInstancePromptText(),
			};
		case 'ComboBox':
			return {
				extensionType: 'ComboBox',
				title: component.getInstanceTitle(),
				icon: component.getInstanceIcon(),
				visibleItemCount: component.getInstanceVisibleItemCount(),
				selectionController: component.getInstanceSelectionController(),
				items: component.getInstanceComboItems().map((item) => ({ ...item })),
			};
		case 'ProgressBar':
		case 'Slider': {
			const extensionType = component.getInstanceExtType() as 'ProgressBar' | 'Slider';
			return {
				extensionType,
				value: component.getInstanceValue(),
				max: component.getInstanceMax(),
				min: component.getInstanceMin(),
			};
		}
		case 'ScrollBar':
			return { extensionType: 'ScrollBar' };
		default:
			return undefined;
	}
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
		favorite: resource.getFavorite(),
		branch: resource.getBranch(),
		branchItemIds: resource.getBranchItemIds(),
		component: {
			size: { width: resource.getWidth(), height: resource.getHeight() },
			properties: liftComponentProperties(resource),
			customData: resource.getCustomData(),
			displayList: resource.listChildren().map((child) => liftDisplayNode(child)),
			controllers: liftControllers(resource),
			transitions: liftTransitions(resource),
		},
	};
}

function liftComponentProperties(
	resource: ReturnType<Document['createComponent']>,
): UamComponentProperties {
	return {
		minSize: { width: resource.getMinWidth(), height: resource.getMinHeight() },
		maxSize: { width: resource.getMaxWidth(), height: resource.getMaxHeight() },
		pivot: { x: resource.getPivotX(), y: resource.getPivotY() },
		pivotAsAnchor: resource.getPivotAsAnchor(),
		overflow: resource.getOverflow(),
		margin: resource.getMargin(),
		clipSoftness: resource.getClipSoftness(),
		hitTest: resource.getHitTest(),
		mask: resource.getMask(),
		reversedMask: resource.getReversedMask(),
		scrollType: resource.getScrollType(),
		scrollBarDisplay: resource.getScrollBarDisplay(),
		scrollBarFlags: resource.getScrollBarFlags(),
		scrollBarMargin: resource.getScrollBarMargin(),
		vtScrollBarRes: resource.getVtScrollBarRes(),
		hzScrollBarRes: resource.getHzScrollBarRes(),
		headerRes: resource.getHeaderRes(),
		footerRes: resource.getFooterRes(),
		bgColor: resource.getBgColor(),
		bgColorEnabled: resource.getBgColorEnabled(),
		designImageAlpha: resource.getDesignImageAlpha(),
		designImageLayer: resource.getDesignImageLayer(),
		designImageOffset: {
			x: resource.getDesignImageOffsetX(),
			y: resource.getDesignImageOffsetY(),
		},
		idNum: resource.getIdNum(),
		initName: resource.getInitName(),
		remark: resource.getRemark(),
		extensionType: resource.getExtensionType(),
		opaque: resource.getOpaque(),
		buttonMode: resource.getButtonMode(),
		sound: resource.getSound(),
		soundVolumeScale: resource.getSoundVolumeScale(),
		downEffect: resource.getDownEffect(),
		downEffectValue: resource.getDownEffectValue(),
		dropdown: resource.getDropdown(),
		promptText: resource.getPromptText(),
		selectionController: resource.getSelectionController(),
		titleType: resource.getTitleType(),
		reverse: resource.getReverse(),
		wholeNumbers: resource.getWholeNumbers(),
		changeOnClick: resource.getChangeOnClick(),
		fixedGripSize: resource.getFixedGripSize(),
		customProperties: resource.getCustomProperties(),
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
