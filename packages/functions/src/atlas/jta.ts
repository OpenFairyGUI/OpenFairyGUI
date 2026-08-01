import { deriveMovieClipModel, parseJta } from '@openfairygui/core';

export interface JtaFrameMeta {
	addDelay: number;
	offsetX: number;
	offsetY: number;
	width: number;
	height: number;
	textureIndex: number;
}

export interface JtaMeta {
	interval: number;
	repeatDelay: number;
	swing: boolean;
	width: number;
	height: number;
	frames: JtaFrameMeta[];
}

export interface ExtractedJtaData {
	frames: Uint8Array[];
	meta: JtaMeta;
}

export function extractJtaFrames(data: Uint8Array): ExtractedJtaData {
	const parsed = parseJta(data);
	const derived = deriveMovieClipModel(parsed);
	return {
		frames: parsed.textures.map((texture) => texture.raw),
		meta: {
			interval: derived.interval,
			repeatDelay: derived.repeatDelay,
			swing: derived.swing,
			width: derived.dimensions.width,
			height: derived.dimensions.height,
			frames: derived.frames.map((frame) => ({
				addDelay: frame.addDelay,
				offsetX: frame.rectX,
				offsetY: frame.rectY,
				width: frame.rectWidth,
				height: frame.rectHeight,
				textureIndex: frame.textureIndex,
			})),
		},
	};
}
