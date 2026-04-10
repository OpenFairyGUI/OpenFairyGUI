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
	displayObject: {
		attrs: {
			id: { canonical: 'id' },
			name: { canonical: 'name' },
			xy: { canonical: 'xy' },
			size: { canonical: 'size' },
			pivot: { canonical: 'pivot' },
			anchor: { canonical: 'anchor' },
			scale: { canonical: 'scale' },
			skew: { canonical: 'skew' },
			rotation: { canonical: 'rotation' },
			alpha: { canonical: 'alpha' },
			visible: { canonical: 'visible' },
			touchable: { canonical: 'touchable' },
			grayed: { canonical: 'grayed' },
			tooltips: { canonical: 'tooltips' },
			customData: { canonical: 'customData' },
			group: { canonical: 'group' },
			relation: { canonical: 'relation' },
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
			bgColor: { canonical: 'bgColor', implemented: false },
			bgColorEnabled: { canonical: 'bgColorEnabled', implemented: false },
			designImageAlpha: { canonical: 'designImageAlpha', implemented: false },
			designImageLayer: { canonical: 'designImageLayer', implemented: false },
			designImageOffsetX: { canonical: 'designImageOffsetX', implemented: false },
			designImageOffsetY: { canonical: 'designImageOffsetY', implemented: false },
			idnum: { canonical: 'idnum', implemented: false },
			initName: { canonical: 'initName', implemented: false },
		},
	},
	componentInstance: {
		attrs: {
			src: { canonical: 'src' },
			controllerOverrides: { canonical: 'controller' },
			pageController: { canonical: 'pageController' },
			aspect: { canonical: 'aspect', implemented: false },
			count: { canonical: 'count', implemented: false },
			fileName: { canonical: 'fileName', implemented: false },
			filter: { canonical: 'filter', implemented: false },
			filterData: { canonical: 'filterData', implemented: false },
			locked: { canonical: 'locked', implemented: false },
			pkg: { canonical: 'pkg', implemented: false },
			restrictSize: { canonical: 'restrictSize', implemented: false },
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
			color: { canonical: 'color', implemented: false },
			prompt: { canonical: 'prompt', implemented: false },
		},
	},
	comboBoxExtension: {
		attrs: {
			dropdown: { canonical: 'dropdown' },
			title: { canonical: 'title' },
			icon: { canonical: 'icon' },
			visibleItemCount: { canonical: 'visibleItemCount' },
			selectionController: { canonical: 'selectionController', implemented: false },
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
	loader: {
		attrs: {
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
			clearOnPublish: { canonical: 'clearOnPublish', implemented: false },
		},
	},
	loader3D: {
		attrs: {
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
			autoClearText: { canonical: 'autoClearText', implemented: false },
			c1: { canonical: 'c1', implemented: false },
			count: { canonical: 'count', implemented: false },
			demoText: { canonical: 'demoText', implemented: false },
			faceDilate: { canonical: 'faceDilate', implemented: false },
			file_count: { canonical: 'file_count', implemented: false },
			index: { canonical: 'index', implemented: false },
			restrictSize: { canonical: 'restrictSize', implemented: false },
			underlaySoftness: { canonical: 'underlaySoftness', implemented: false },
			vars: { canonical: 'vars', implemented: false },
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
			href: { canonical: 'href', implemented: false },
			restrictSize: { canonical: 'restrictSize', implemented: false },
			src: { canonical: 'src', implemented: false },
			url: { canonical: 'url', implemented: false },
			underlaySoftness: { canonical: 'underlaySoftness', implemented: false },
		},
	},
	group: {
		attrs: {
			layout: { canonical: 'layout' },
			lineGap: { canonical: 'lineGap' },
			columnGap: { canonical: 'colGap', aliases: ['columnGap'] },
			advanced: { canonical: 'advanced' },
			excludeInvisibles: { canonical: 'excludeInvisibles' },
			autoSizeDisabled: { canonical: 'autoSizeDisabled' },
			mainGridIndex: { canonical: 'mainGridIndex' },
			locked: { canonical: 'locked', implemented: false },
		},
	},
	list: {
		attrs: {
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
