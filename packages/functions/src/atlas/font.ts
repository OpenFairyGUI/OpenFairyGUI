export interface ParsedFontGlyph {
	charId: number;
	img: string | null;
	x: number;
	y: number;
	xoffset: number;
	yoffset: number;
	width: number;
	height: number;
	xadvance: number;
	channel: number;
}

export interface ParsedFont {
	hasFace: boolean;
	colored: boolean;
	resizable: boolean;
	hasChannel: boolean;
	fontSize: number;
	xadvance: number;
	lineHeight: number;
	glyphs: ParsedFontGlyph[];
}

/** Parse a BMFont .fnt text file into structured data for binary encoding. */
export function parseFnt(text: string): ParsedFont {
	const lines = text.split(/\r?\n/);
	let hasFace = false;
	let colored = false;
	let resizable = false;
	let hasChannel = false;
	let fontSize = 0;
	let globalXadvance = 0;
	let lineHeight = 0;
	const glyphs: ParsedFontGlyph[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const parts = trimmed.split(/\s+/);
		const attrs: Record<string, string> = {};
		for (let index = 1; index < parts.length; index += 1) {
			const entry = parts[index]?.split('=') ?? [];
			if (entry.length === 2 && entry[0]) attrs[entry[0]] = entry[1] ?? '';
		}

		switch (parts[0]) {
			case 'info':
				hasFace = attrs.face != null;
				colored = hasFace;
				if (attrs.colored !== undefined) colored = attrs.colored === 'true';
				fontSize = parseInt(attrs.size ?? '', 10) || 0;
				resizable = attrs.resizable === 'true';
				break;
			case 'common':
				lineHeight = parseInt(attrs.lineHeight ?? '', 10) || 0;
				globalXadvance = parseInt(attrs.xadvance ?? '', 10) || 0;
				if (fontSize === 0) fontSize = lineHeight;
				else if (lineHeight === 0) lineHeight = fontSize;
				break;
			case 'char': {
				const charId = parseInt(attrs.id ?? '', 10) || 0;
				if (charId === 0) continue;
				const img = attrs.img || null;
				if (!hasFace && !img) continue;
				const channel = parseInt(attrs.chnl ?? '', 10) || 0;
				if (channel !== 0 && channel !== 15) hasChannel = true;
				glyphs.push({
					charId,
					img,
					x: parseInt(attrs.x ?? '', 10) || 0,
					y: parseInt(attrs.y ?? '', 10) || 0,
					xoffset: parseInt(attrs.xoffset ?? '', 10) || 0,
					yoffset: parseInt(attrs.yoffset ?? '', 10) || 0,
					width: parseInt(attrs.width ?? '', 10) || 0,
					height: parseInt(attrs.height ?? '', 10) || 0,
					xadvance: parseInt(attrs.xadvance ?? '', 10) || 0,
					channel,
				});
				break;
			}
		}
	}

	return {
		hasFace,
		colored,
		resizable: fontSize > 0 ? resizable : false,
		hasChannel,
		fontSize,
		xadvance: globalXadvance,
		lineHeight,
		glyphs,
	};
}
