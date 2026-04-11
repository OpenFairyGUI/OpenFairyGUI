export interface XmlAttrSpec {
	canonical: string;
	aliases?: readonly string[];
	implemented?: boolean;
}

export interface XmlNodeProtocol {
	attrs: Record<string, XmlAttrSpec>;
}

type XmlAttrSource = Record<string, unknown>;
type XmlAttrTarget = Record<string, unknown>;

export const PROJECT_XML_PROTOCOL = {
	packageResource: {
		attrs: {
			id: { canonical: 'id' },
			name: { canonical: 'name' },
			path: { canonical: 'path' },
			exported: { canonical: 'exported' },
		},
	},
	packageImageResource: {
		attrs: {
			scale: { canonical: 'scale' },
			scale9grid: { canonical: 'scale9grid' },
			width: { canonical: 'width' },
			height: { canonical: 'height' },
			gridTile: { canonical: 'gridTile' },
			qualityOption: { canonical: 'qualityOption' },
			duplicatePadding: { canonical: 'duplicatePadding' },
			smoothing: { canonical: 'smoothing' },
		},
	},
	packageFontResource: {
		attrs: {
			texture: { canonical: 'texture' },
			renderMode: { canonical: 'renderMode' },
			samplePointSize: { canonical: 'samplePointSize' },
		},
	},
	displayObject: {
		attrs: {
			id: { canonical: 'id' },
			name: { canonical: 'name' },
			relation: { canonical: 'relation' },
		},
	},
	image: {
		attrs: {
			src: { canonical: 'src' },
			xy: { canonical: 'xy' },
			size: { canonical: 'size' },
			locked: { canonical: 'locked' },
			aspect: { canonical: 'aspect' },
			pivot: { canonical: 'pivot' },
			anchor: { canonical: 'anchor' },
			scale: { canonical: 'scale' },
			group: { canonical: 'group' },
			rotation: { canonical: 'rotation' },
			alpha: { canonical: 'alpha' },
			visible: { canonical: 'visible' },
			grayed: { canonical: 'grayed' },
			fileName: { canonical: 'fileName' },
			pkg: { canonical: 'pkg' },
			filter: { canonical: 'filter' },
			filterData: { canonical: 'filterData' },
			color: { canonical: 'color' },
			flip: { canonical: 'flip' },
			fillMethod: { canonical: 'fillMethod' },
			fillOrigin: { canonical: 'fillOrigin' },
			fillClockwise: { canonical: 'fillClockwise' },
			fillAmount: { canonical: 'fillAmount' },
		},
	},
	graph: {
		attrs: {
			xy: { canonical: 'xy' },
			size: { canonical: 'size' },
			locked: { canonical: 'locked' },
			restrictSize: { canonical: 'restrictSize' },
			pivot: { canonical: 'pivot' },
			anchor: { canonical: 'anchor' },
			group: { canonical: 'group' },
			rotation: { canonical: 'rotation' },
			alpha: { canonical: 'alpha' },
			visible: { canonical: 'visible' },
			touchable: { canonical: 'touchable' },
			skew: { canonical: 'skew' },
			type: { canonical: 'type' },
			lineSize: { canonical: 'lineSize' },
			lineColor: { canonical: 'lineColor' },
			fillColor: { canonical: 'fillColor' },
			corner: { canonical: 'corner' },
			points: { canonical: 'points' },
			sides: { canonical: 'sides' },
			startAngle: { canonical: 'startAngle' },
			distances: { canonical: 'distances' },
		},
	},
	movieClip: {
		attrs: {
			src: { canonical: 'src' },
			xy: { canonical: 'xy' },
			size: { canonical: 'size' },
			pivot: { canonical: 'pivot' },
			group: { canonical: 'group' },
			rotation: { canonical: 'rotation' },
			alpha: { canonical: 'alpha' },
			visible: { canonical: 'visible' },
			grayed: { canonical: 'grayed' },
			fileName: { canonical: 'fileName' },
			filter: { canonical: 'filter' },
			filterData: { canonical: 'filterData' },
			playing: { canonical: 'playing' },
			frame: { canonical: 'frame' },
			color: { canonical: 'color' },
		},
	},
	componentRoot: {
		attrs: {
			size: { canonical: 'size' },
			pivot: { canonical: 'pivot' },
			anchor: { canonical: 'anchor' },
			margin: { canonical: 'margin' },
			restrictSize: { canonical: 'restrictSize' },
			overflow: { canonical: 'overflow' },
			clipSoftness: { canonical: 'clipSoftness' },
			opaque: { canonical: 'opaque' },
			mask: { canonical: 'mask' },
			reversedMask: { canonical: 'reversedMask' },
			hitTest: { canonical: 'hitTest' },
			customData: { canonical: 'customData' },
			scroll: { canonical: 'scroll' },
			scrollBar: { canonical: 'scrollBar' },
			scrollBarFlags: { canonical: 'scrollBarFlags' },
			scrollBarMargin: { canonical: 'scrollBarMargin' },
			scrollBarRes: { canonical: 'scrollBarRes' },
			ptrRes: { canonical: 'ptrRes' },
			extention: { canonical: 'extention' },
			bgColor: { canonical: 'bgColor' },
			bgColorEnabled: { canonical: 'bgColorEnabled' },
			designImageAlpha: { canonical: 'designImageAlpha' },
			designImageLayer: { canonical: 'designImageLayer' },
			designImageOffsetX: { canonical: 'designImageOffsetX' },
			designImageOffsetY: { canonical: 'designImageOffsetY' },
			idnum: { canonical: 'idnum' },
			initName: { canonical: 'initName' },
		},
	},
	componentInstance: {
		attrs: {
			src: { canonical: 'src' },
			xy: { canonical: 'xy' },
			size: { canonical: 'size' },
			locked: { canonical: 'locked' },
			restrictSize: { canonical: 'restrictSize' },
			aspect: { canonical: 'aspect' },
			pivot: { canonical: 'pivot' },
			anchor: { canonical: 'anchor' },
			scale: { canonical: 'scale' },
			group: { canonical: 'group' },
			rotation: { canonical: 'rotation' },
			alpha: { canonical: 'alpha' },
			visible: { canonical: 'visible' },
			touchable: { canonical: 'touchable' },
			grayed: { canonical: 'grayed' },
			tooltips: { canonical: 'tooltips' },
			fileName: { canonical: 'fileName' },
			pkg: { canonical: 'pkg' },
			filter: { canonical: 'filter' },
			filterData: { canonical: 'filterData' },
			controllerOverrides: { canonical: 'controller' },
			pageController: { canonical: 'pageController' },
		},
	},
	buttonExtension: {
		attrs: {
			mode: { canonical: 'mode' },
			sound: { canonical: 'sound' },
			soundVolumeScale: { canonical: 'soundVolumeScale' },
			downEffect: { canonical: 'downEffect' },
			downEffectValue: { canonical: 'downEffectValue' },
			title: { canonical: 'title' },
			selectedTitle: { canonical: 'selectedTitle' },
			icon: { canonical: 'icon' },
			selectedIcon: { canonical: 'selectedIcon' },
			titleColor: { canonical: 'titleColor' },
			titleFontSize: { canonical: 'titleFontSize' },
			controller: { canonical: 'controller' },
			page: { canonical: 'page' },
			checked: { canonical: 'checked' },
		},
	},
	labelExtension: {
		attrs: {
			title: { canonical: 'title' },
			icon: { canonical: 'icon' },
			titleColor: { canonical: 'titleColor' },
			titleFontSize: { canonical: 'titleFontSize' },
			prompt: { canonical: 'prompt' },
		},
	},
	comboBoxExtension: {
		attrs: {
			dropdown: { canonical: 'dropdown' },
			title: { canonical: 'title' },
			icon: { canonical: 'icon' },
			visibleItemCount: { canonical: 'visibleItemCount' },
			selectionController: { canonical: 'selectionController' },
		},
	},
	progressBarExtension: {
		attrs: {
			titleType: { canonical: 'titleType' },
			reverse: { canonical: 'reverse' },
			value: { canonical: 'value' },
			max: { canonical: 'max' },
			min: { canonical: 'min' },
		},
	},
	sliderExtension: {
		attrs: {
			titleType: { canonical: 'titleType' },
			reverse: { canonical: 'reverse' },
			wholeNumbers: { canonical: 'wholeNumbers' },
			changeOnClick: { canonical: 'changeOnClick' },
			value: { canonical: 'value' },
			max: { canonical: 'max' },
			min: { canonical: 'min' },
		},
	},
	scrollBarExtension: {
		attrs: {
			fixedGripSize: { canonical: 'fixedGripSize' },
		},
	},
	relation: {
		attrs: {
			target: { canonical: 'target' },
			sidePair: { canonical: 'sidePair' },
		},
	},
	gear: {
		attrs: {
			controller: { canonical: 'controller' },
			pages: { canonical: 'pages' },
			values: { canonical: 'values' },
			default: { canonical: 'default' },
			tween: { canonical: 'tween' },
			condition: { canonical: 'condition' },
			ease: { canonical: 'ease' },
			duration: { canonical: 'duration' },
		},
	},
	controller: {
		attrs: {
			name: { canonical: 'name' },
			pages: { canonical: 'pages' },
			selected: { canonical: 'selected' },
		},
	},
	controllerAction: {
		attrs: {
			type: { canonical: 'type' },
			fromPage: { canonical: 'fromPage' },
			toPage: { canonical: 'toPage' },
			transition: { canonical: 'transition' },
			repeat: { canonical: 'repeat' },
			delay: { canonical: 'delay' },
			stopOnExit: { canonical: 'stopOnExit' },
			objectId: { canonical: 'objectId' },
			controller: { canonical: 'controller' },
			targetPage: { canonical: 'targetPage' },
		},
	},
	transition: {
		attrs: {
			name: { canonical: 'name' },
			autoPlay: { canonical: 'autoPlay' },
			autoPlayTimes: { canonical: 'autoPlayRepeat', aliases: ['autoPlayTimes'] },
			autoPlayDelay: { canonical: 'autoPlayDelay' },
			options: { canonical: 'options' },
			fps: { canonical: 'fps' },
		},
	},
	transitionItem: {
		attrs: {
			time: { canonical: 'time' },
			target: { canonical: 'target' },
			tween: { canonical: 'tween' },
			duration: { canonical: 'duration' },
			repeat: { canonical: 'repeat' },
			yoyo: { canonical: 'yoyo' },
			label: { canonical: 'label' },
			label2: { canonical: 'label2' },
			path: { canonical: 'path' },
			ease: { canonical: 'ease' },
			type: { canonical: 'type' },
			value: { canonical: 'value' },
			startValue: { canonical: 'startValue' },
			endValue: { canonical: 'endValue' },
		},
	},
	loader: {
		attrs: {
			xy: { canonical: 'xy' },
			size: { canonical: 'size' },
			pivot: { canonical: 'pivot' },
			scale: { canonical: 'scale' },
			grayed: { canonical: 'grayed' },
			url: { canonical: 'url' },
			align: { canonical: 'align' },
			vAlign: { canonical: 'vAlign' },
			fill: { canonical: 'fill' },
			shrinkOnly: { canonical: 'shrinkOnly' },
			autoSize: { canonical: 'autoSize' },
			useResize: { canonical: 'useResize' },
			color: { canonical: 'color' },
			playing: { canonical: 'playing' },
			frame: { canonical: 'frame' },
			fillMethod: { canonical: 'fillMethod' },
			fillOrigin: { canonical: 'fillOrigin' },
			fillClockwise: { canonical: 'fillClockwise' },
			fillAmount: { canonical: 'fillAmount' },
			clearOnPublish: { canonical: 'clearOnPublish' },
		},
	},
	loader3D: {
		attrs: {
			xy: { canonical: 'xy' },
			size: { canonical: 'size' },
			url: { canonical: 'url' },
			align: { canonical: 'align' },
			vAlign: { canonical: 'vAlign' },
			fill: { canonical: 'fill' },
			shrinkOnly: { canonical: 'shrinkOnly' },
			autoSize: { canonical: 'autoSize' },
			animation: { canonical: 'animation', aliases: ['animationName'] },
			skinName: { canonical: 'skinName' },
			playing: { canonical: 'playing' },
			frame: { canonical: 'frame' },
			loop: { canonical: 'loop' },
			color: { canonical: 'color' },
		},
	},
	text: {
		attrs: {
			xy: { canonical: 'xy' },
			size: { canonical: 'size' },
			restrictSize: { canonical: 'restrictSize' },
			customData: { canonical: 'customData' },
			group: { canonical: 'group' },
			font: { canonical: 'font' },
			fontSize: { canonical: 'fontSize' },
			color: { canonical: 'color' },
			align: { canonical: 'align' },
			vAlign: { canonical: 'vAlign' },
			autoSize: { canonical: 'autoSize' },
			singleLine: { canonical: 'singleLine' },
			text: { canonical: 'text' },
			input: { canonical: 'input' },
			prompt: { canonical: 'prompt', aliases: ['promptText'] },
			maxLength: { canonical: 'maxLength' },
			restrict: { canonical: 'restrict' },
			password: { canonical: 'password' },
			keyboardType: { canonical: 'keyboardType' },
			ubb: { canonical: 'ubb' },
			leading: { canonical: 'leading' },
			letterSpacing: { canonical: 'letterSpacing' },
			underline: { canonical: 'underline' },
			italic: { canonical: 'italic' },
			bold: { canonical: 'bold' },
			strikethrough: { canonical: 'strikethrough' },
			strokeColor: { canonical: 'strokeColor' },
			strokeSize: { canonical: 'strokeSize' },
			shadowColor: { canonical: 'shadowColor' },
			shadowOffset: { canonical: 'shadowOffset' },
			autoClearText: { canonical: 'autoClearText' },
			demoText: { canonical: 'demoText' },
			faceDilate: { canonical: 'faceDilate' },
			underlaySoftness: { canonical: 'underlaySoftness' },
			vars: { canonical: 'vars' },
		},
	},
	textInput: {
		attrs: {
			prompt: { canonical: 'prompt', aliases: ['promptText'] },
			maxLength: { canonical: 'maxLength' },
			restrict: { canonical: 'restrict' },
			password: { canonical: 'password' },
			keyboardType: { canonical: 'keyboardType' },
		},
	},
	richText: {
		attrs: {
			restrictSize: { canonical: 'restrictSize' },
			underlaySoftness: { canonical: 'underlaySoftness' },
		},
	},
	group: {
		attrs: {
			xy: { canonical: 'xy' },
			size: { canonical: 'size' },
			locked: { canonical: 'locked' },
			group: { canonical: 'group' },
			visible: { canonical: 'visible' },
			layout: { canonical: 'layout' },
			lineGap: { canonical: 'lineGap' },
			columnGap: { canonical: 'colGap', aliases: ['columnGap'] },
			advanced: { canonical: 'advanced' },
			excludeInvisibles: { canonical: 'excludeInvisibles' },
			autoSizeDisabled: { canonical: 'autoSizeDisabled' },
			mainGridIndex: { canonical: 'mainGridIndex' },
		},
	},
	list: {
		attrs: {
			xy: { canonical: 'xy' },
			size: { canonical: 'size' },
			group: { canonical: 'group' },
			touchable: { canonical: 'touchable' },
			src: { canonical: 'src' },
			layout: { canonical: 'layout' },
			align: { canonical: 'align' },
			vAlign: { canonical: 'vAlign' },
			lineGap: { canonical: 'lineGap' },
			columnGap: { canonical: 'colGap', aliases: ['columnGap'] },
			lineCount: { canonical: 'lineItemCount', aliases: ['lineCount'] },
			autoResizeItem: { canonical: 'autoItemSize', aliases: ['autoResizeItem'] },
			selectionMode: { canonical: 'selectionMode' },
			selectionController: { canonical: 'selectionController' },
			defaultItem: { canonical: 'defaultItem' },
			pageController: { canonical: 'pageController' },
			controllerOverrides: { canonical: 'controller' },
			overflow: { canonical: 'overflow' },
			scroll: { canonical: 'scroll' },
			scrollBar: { canonical: 'scrollBar' },
			scrollBarFlags: { canonical: 'scrollBarFlags' },
			scrollBarMargin: { canonical: 'scrollBarMargin' },
			scrollBarRes: { canonical: 'scrollBarRes' },
			ptrRes: { canonical: 'ptrRes' },
			margin: { canonical: 'margin' },
			clipSoftness: { canonical: 'clipSoftness' },
			treeView: { canonical: 'treeView' },
			indent: { canonical: 'indent' },
			clickToExpand: { canonical: 'clickToExpand' },
			autoClearItems: { canonical: 'autoClearItems' },
		},
	},
} satisfies Record<string, XmlNodeProtocol>;

export function readXmlAttr<T = unknown>(
	source: XmlAttrSource,
	spec: XmlAttrSpec,
): T | undefined {
	if (Object.prototype.hasOwnProperty.call(source, spec.canonical)) {
		return source[spec.canonical] as T;
	}

	for (const alias of spec.aliases ?? []) {
		if (Object.prototype.hasOwnProperty.call(source, alias)) {
			return source[alias] as T;
		}
	}

	return undefined;
}

export function hasXmlAttr(source: XmlAttrSource, spec: XmlAttrSpec): boolean {
	return readXmlAttr(source, spec) !== undefined;
}

export function writeXmlAttr(
	target: XmlAttrTarget,
	spec: XmlAttrSpec,
	value: unknown,
): void {
	target[`@_${spec.canonical}`] = value;
}

export function listXmlAttrNames(protocol: XmlNodeProtocol): string[] {
	return Object.values(protocol.attrs)
		.flatMap((spec) => [spec.canonical, ...(spec.aliases ?? [])]);
}
