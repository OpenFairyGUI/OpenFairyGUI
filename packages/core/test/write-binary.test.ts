import test from 'ava';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASICS_FUI = path.resolve(
	__dirname,
	'../../../referer/Release/FairyGUI-Unity-Examples/Basics_fui.bytes',
);

function readUtfString(bytes: Uint8Array, state: { pos: number }): string {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const len = view.getUint16(state.pos, false);
	state.pos += 2;
	const value = Buffer.from(bytes.subarray(state.pos, state.pos + len)).toString('utf8');
	state.pos += len;
	return value;
}

function readPackageItems(bytes: Uint8Array): Array<{
	type: number;
	id: string | null;
	file: string | null;
	width: number;
	height: number;
	ext: number | null;
}> {
	const state = { pos: 0 };

	state.pos += 4; // magic
	state.pos += 4; // version
	state.pos += 1; // compressed
	readUtfString(bytes, state); // packageId
	readUtfString(bytes, state); // packageName
	state.pos += 20; // reserved

	const data = bytes.subarray(state.pos);
	const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const offsets = [];
	let pos = 2; // segCount + useShort
	for (let i = 0; i < 6; i++) {
		offsets.push(dataView.getInt32(pos, false));
		pos += 4;
	}

	const block1Offset = offsets[1];
	pos = block1Offset;
	const stringTableOffset = offsets[4];
	const stringTablePos = stringTableOffset;
	const stringCount = dataView.getInt32(stringTablePos, false);
	let stringPos = stringTablePos + 4;
	const strings: string[] = [];
	for (let i = 0; i < stringCount; i++) {
		const len = dataView.getUint16(stringPos, false);
		stringPos += 2;
		strings.push(Buffer.from(data.subarray(stringPos, stringPos + len)).toString('utf8'));
		stringPos += len;
	}

	const itemCount = dataView.getInt16(pos, false);
	pos += 2;
	const items: Array<{
		type: number;
		id: string | null;
		file: string | null;
		width: number;
		height: number;
		ext: number | null;
	}> = [];
	for (let i = 0; i < itemCount; i++) {
		const nextOffset = dataView.getInt32(pos, false);
		pos += 4;
		const nextPos = nextOffset + pos;
		const type = dataView.getUint8(pos++);
		const id = strings[dataView.getUint16(pos, false)] ?? null;
		pos += 2;
		pos += 2; // name
		pos += 2; // path
		const file = strings[dataView.getUint16(pos, false)] ?? null;
		pos += 2;
		pos += 1; // exported
		const width = dataView.getInt32(pos, false);
		pos += 4;
		const height = dataView.getInt32(pos, false);
		pos += 4;
		const ext = type === 3 ? dataView.getUint8(pos) : null;
		items.push({ type, id, file, width, height, ext });
		pos = nextPos;
	}
	return items;
}

function readSpriteEntries(bytes: Uint8Array): Array<{
	itemId: string | null;
	rotated: boolean;
	extra: { ox: number; oy: number; ow: number; oh: number } | null;
}> {
	const state = { pos: 0 };

	state.pos += 4; // magic
	state.pos += 4; // version
	state.pos += 1; // compressed
	readUtfString(bytes, state); // packageId
	readUtfString(bytes, state); // packageName
	state.pos += 20; // reserved

	const data = bytes.subarray(state.pos);
	const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const offsets = [];
	let pos = 2; // segCount + useShort
	for (let i = 0; i < 6; i++) {
		offsets.push(dataView.getInt32(pos, false));
		pos += 4;
	}

	const stringTableOffset = offsets[4];
	const stringCount = dataView.getInt32(stringTableOffset, false);
	let stringPos = stringTableOffset + 4;
	const strings: string[] = [];
	for (let i = 0; i < stringCount; i++) {
		const len = dataView.getUint16(stringPos, false);
		stringPos += 2;
		strings.push(Buffer.from(data.subarray(stringPos, stringPos + len)).toString('utf8'));
		stringPos += len;
	}

	pos = offsets[2];
	const spriteCount = dataView.getInt16(pos, false);
	pos += 2;

	const sprites: Array<{
		itemId: string | null;
		rotated: boolean;
		extra: { ox: number; oy: number; ow: number; oh: number } | null;
	}> = [];

	for (let i = 0; i < spriteCount; i++) {
		const nextOffset = dataView.getUint16(pos, false);
		pos += 2;
		const nextPos = nextOffset + pos;
		const itemId = strings[dataView.getUint16(pos, false)] ?? null;
		pos += 2; // itemId
		pos += 2; // atlasId
		pos += 4; // x
		pos += 4; // y
		pos += 4; // w
		pos += 4; // h
		const rotated = dataView.getUint8(pos++) !== 0;
		let extra: { ox: number; oy: number; ow: number; oh: number } | null = null;
		if (dataView.getUint8(pos++) !== 0) {
			extra = {
				ox: dataView.getInt32(pos, false),
				oy: dataView.getInt32(pos + 4, false),
				ow: dataView.getInt32(pos + 8, false),
				oh: dataView.getInt32(pos + 12, false),
			};
			pos += 16;
		}
		sprites.push({ itemId, rotated, extra });
		pos = nextPos;
	}

	return sprites;
}

function readComponentChildState(bytes: Uint8Array, componentId: string, childId: string): {
	anchor: boolean;
	flip: number;
} | null {
	const state = { pos: 0 };

	state.pos += 4; // magic
	const version = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(state.pos, false);
	state.pos += 4; // version
	state.pos += 1; // compressed
	readUtfString(bytes, state); // packageId
	readUtfString(bytes, state); // packageName
	state.pos += 20; // reserved

	const data = bytes.subarray(state.pos);
	const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const offsets = [];
	let pos = 2; // segCount + useShort
	for (let i = 0; i < 6; i++) {
		offsets.push(dataView.getInt32(pos, false));
		pos += 4;
	}

	const stringTableOffset = offsets[4];
	const stringCount = dataView.getInt32(stringTableOffset, false);
	let stringPos = stringTableOffset + 4;
	const strings: string[] = [];
	for (let i = 0; i < stringCount; i++) {
		const len = dataView.getUint16(stringPos, false);
		stringPos += 2;
		strings.push(Buffer.from(data.subarray(stringPos, stringPos + len)).toString('utf8'));
		stringPos += len;
	}

	pos = offsets[1];
	const itemCount = dataView.getInt16(pos, false);
	pos += 2;

	let rawComponentData: Uint8Array | null = null;
	for (let i = 0; i < itemCount; i++) {
		const nextOffset = dataView.getInt32(pos, false);
		pos += 4;
		const nextPos = nextOffset + pos;
		const type = dataView.getUint8(pos++);
		const id = strings[dataView.getUint16(pos, false)] ?? null;
		pos += 2; // id
		pos += 2; // name
		pos += 2; // path
		pos += 2; // file
		pos += 1; // exported
		pos += 4; // width
		pos += 4; // height

		if (type === 3) {
			pos += 1; // ext
			const rawLen = dataView.getInt32(pos, false);
			pos += 4;
			if (id === componentId) {
				rawComponentData = data.subarray(pos, pos + rawLen);
				break;
			}
			pos += rawLen;
		}

		pos = nextPos;
	}

	if (!rawComponentData) return null;

	const compView = new DataView(rawComponentData.buffer, rawComponentData.byteOffset, rawComponentData.byteLength);
	const childBlockOffset = compView.getInt32(2 + 4 * 2, false); // block 2
	let childPos = childBlockOffset;
	const childCount = compView.getInt16(childPos, false);
	childPos += 2;

	for (let i = 0; i < childCount; i++) {
		const childLen = compView.getInt16(childPos, false);
		childPos += 2;
		const childStart = childPos;
		const childEnd = childPos + childLen;

		const childView = new DataView(
			rawComponentData.buffer,
			rawComponentData.byteOffset + childStart,
			childLen,
		);
		const childBlock0Offset = childView.getInt16(2, false); // block 0 offset in child table
		const childBlock5Offset = childView.getInt16(2 + 2 * 5, false); // block 5 offset

		let childStatePos = childBlock0Offset;
		childStatePos += 1; // object type
		childStatePos += 2; // src
		childStatePos += 2; // pkgId
		const currentChildId = strings[childView.getUint16(childStatePos, false)] ?? null;
		childStatePos += 2;
		if (currentChildId !== childId) {
			childPos = childEnd;
			continue;
		}

		childStatePos += 2; // name
		childStatePos += 4; // x
		childStatePos += 4; // y
		const hasSize = childView.getUint8(childStatePos++) !== 0;
		if (hasSize) childStatePos += 8;
		const hasRestrict = childView.getUint8(childStatePos++) !== 0;
		if (hasRestrict) childStatePos += 16;
		const hasScale = childView.getUint8(childStatePos++) !== 0;
		if (hasScale) childStatePos += 8;
		const hasSkew = childView.getUint8(childStatePos++) !== 0;
		if (hasSkew) childStatePos += 8;
		const hasPivot = childView.getUint8(childStatePos++) !== 0;
		let anchor = false;
		if (hasPivot) {
			childStatePos += 8; // pivot x/y
			anchor = childView.getUint8(childStatePos++) !== 0;
		}

		let flip = 0;
		if (childBlock5Offset > 0) {
			let block5Pos = childBlock5Offset;
			const hasColor = childView.getUint8(block5Pos++) !== 0;
			if (hasColor) block5Pos += 4;
			flip = childView.getUint8(block5Pos++);
		}

		return { anchor, flip };
	}

	return null;
}

function readLoader3DChildState(bytes: Uint8Array, componentId: string, childId: string): {
	objectType: number;
	url: string | null;
	align: number;
	vAlign: number;
	fill: number;
	shrinkOnly: boolean;
	autoSize: boolean;
	animationName: string | null;
	skinName: string | null;
	playing: boolean;
	frame: number;
	loop: boolean;
	color: string | null;
} | null {
	const state = { pos: 0 };
	state.pos += 4; // magic
	state.pos += 4; // version
	state.pos += 1; // compressed
	readUtfString(bytes, state); // packageId
	readUtfString(bytes, state); // packageName
	state.pos += 20; // reserved

	const data = bytes.subarray(state.pos);
	const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const offsets = [];
	let pos = 2;
	for (let i = 0; i < 6; i++) {
		offsets.push(dataView.getInt32(pos, false));
		pos += 4;
	}

	const stringTableOffset = offsets[4];
	const stringCount = dataView.getInt32(stringTableOffset, false);
	let stringPos = stringTableOffset + 4;
	const strings: string[] = [];
	for (let i = 0; i < stringCount; i++) {
		const len = dataView.getUint16(stringPos, false);
		stringPos += 2;
		strings.push(Buffer.from(data.subarray(stringPos, stringPos + len)).toString('utf8'));
		stringPos += len;
	}

	pos = offsets[1];
	const itemCount = dataView.getInt16(pos, false);
	pos += 2;

	let rawComponentData: Uint8Array | null = null;
	for (let i = 0; i < itemCount; i++) {
		const nextOffset = dataView.getInt32(pos, false);
		pos += 4;
		const nextPos = nextOffset + pos;
		const type = dataView.getUint8(pos++);
		const id = strings[dataView.getUint16(pos, false)] ?? null;
		pos += 2; // id
		pos += 2; // name
		pos += 2; // path
		pos += 2; // file
		pos += 1; // exported
		pos += 4; // width
		pos += 4; // height

		if (type === 3) {
			pos += 1; // ext
			const rawLen = dataView.getInt32(pos, false);
			pos += 4;
			if (id === componentId) {
				rawComponentData = data.subarray(pos, pos + rawLen);
				break;
			}
			pos += rawLen;
		}

		pos = nextPos;
	}

	if (!rawComponentData) return null;

	const compView = new DataView(rawComponentData.buffer, rawComponentData.byteOffset, rawComponentData.byteLength);
	const childBlockOffset = compView.getInt32(2 + 4 * 2, false);
	let childPos = childBlockOffset;
	const childCount = compView.getInt16(childPos, false);
	childPos += 2;

	for (let i = 0; i < childCount; i++) {
		const childLen = compView.getInt16(childPos, false);
		childPos += 2;
		const childStart = childPos;
		const childEnd = childPos + childLen;

		const childView = new DataView(
			rawComponentData.buffer,
			rawComponentData.byteOffset + childStart,
			childLen,
		);

		let childStatePos = childView.getInt16(2, false);
		const objectType = childView.getUint8(childStatePos++);
		childStatePos += 2; // src
		childStatePos += 2; // pkgId
		const currentChildId = strings[childView.getUint16(childStatePos, false)] ?? null;
		childStatePos += 2;
		if (currentChildId !== childId) {
			childPos = childEnd;
			continue;
		}

		const block5Offset = childView.getInt16(2 + 2 * 5, false);
		let block5Pos = block5Offset;
		const urlIndex = childView.getUint16(block5Pos, false);
		const url = urlIndex >= strings.length ? null : strings[urlIndex] ?? null;
		block5Pos += 2;
		const align = childView.getUint8(block5Pos++);
		const vAlign = childView.getUint8(block5Pos++);
		const fill = childView.getUint8(block5Pos++);
		const shrinkOnly = childView.getUint8(block5Pos++) !== 0;
		const autoSize = childView.getUint8(block5Pos++) !== 0;
		const animationNameIndex = childView.getUint16(block5Pos, false);
		const animationName = animationNameIndex >= strings.length ? null : strings[animationNameIndex] ?? null;
		block5Pos += 2;
		const skinNameIndex = childView.getUint16(block5Pos, false);
		const skinName = skinNameIndex >= strings.length ? null : strings[skinNameIndex] ?? null;
		block5Pos += 2;
		const playing = childView.getUint8(block5Pos++) !== 0;
		const frame = childView.getInt32(block5Pos, false);
		block5Pos += 4;
		const loop = childView.getUint8(block5Pos++) !== 0;
		const hasColor = childView.getUint8(block5Pos++) !== 0;
		let color: string | null = null;
		if (hasColor) {
			const r = childView.getUint8(block5Pos++).toString(16).padStart(2, '0');
			const g = childView.getUint8(block5Pos++).toString(16).padStart(2, '0');
			const b = childView.getUint8(block5Pos++).toString(16).padStart(2, '0');
			const a = childView.getUint8(block5Pos++).toString(16).padStart(2, '0');
			color = `#${r}${g}${b}${a}`.toUpperCase();
		}

		return { objectType, url, align, vAlign, fill, shrinkOnly, autoSize, animationName, skinName, playing, frame, loop, color };
	}

	return null;
}

function readTreeChildState(bytes: Uint8Array, componentId: string, childId: string): {
	objectType: number;
	segmentCount: number;
	items: Array<{ isFolder: boolean; level: number; title: string | null }>;
	indent: number;
	clickToExpand: number;
} | null {
	const state = { pos: 0 };
	const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	state.pos += 4; // magic
	state.pos += 4; // version
	state.pos += 1; // compressed
	readUtfString(bytes, state); // packageId
	readUtfString(bytes, state); // packageName
	state.pos += 20; // reserved

	const data = bytes.subarray(state.pos);
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const offsets = [];
	let pos = 2;
	for (let i = 0; i < 6; i++) {
		offsets.push(view.getInt32(pos, false));
		pos += 4;
	}

	const stringTableOffset = offsets[4];
	const stringCount = view.getInt32(stringTableOffset, false);
	let stringPos = stringTableOffset + 4;
	const strings: string[] = [];
	for (let i = 0; i < stringCount; i++) {
		const len = view.getUint16(stringPos, false);
		stringPos += 2;
		strings.push(Buffer.from(data.subarray(stringPos, stringPos + len)).toString('utf8'));
		stringPos += len;
	}

	pos = offsets[1];
	const itemCount = view.getInt16(pos, false);
	pos += 2;

	let rawComponentData: Uint8Array | null = null;
	for (let i = 0; i < itemCount; i++) {
		const nextOffset = view.getInt32(pos, false);
		pos += 4;
		const nextPos = nextOffset + pos;
		const type = view.getUint8(pos++);
		const id = strings[view.getUint16(pos, false)] ?? null;
		pos += 2; // id
		pos += 2; // name
		pos += 2; // path
		pos += 2; // file
		pos += 1; // exported
		pos += 4; // width
		pos += 4; // height
		if (type === 3) {
			pos += 1; // ext
			const rawLen = view.getInt32(pos, false);
			pos += 4;
			if (id === componentId) {
				rawComponentData = data.subarray(pos, pos + rawLen);
				break;
			}
			pos += rawLen;
		}
		pos = nextPos;
	}

	if (!rawComponentData) return null;

	const compView = new DataView(rawComponentData.buffer, rawComponentData.byteOffset, rawComponentData.byteLength);
	const childBlockOffset = compView.getInt32(2 + 4 * 2, false);
	let childPos = childBlockOffset;
	const childCount = compView.getInt16(childPos, false);
	childPos += 2;

	for (let i = 0; i < childCount; i++) {
		const childLen = compView.getInt16(childPos, false);
		childPos += 2;
		const childStart = childPos;
		const childEnd = childPos + childLen;
		const childView = new DataView(rawComponentData.buffer, rawComponentData.byteOffset + childStart, childLen);
		const segmentCount = childView.getUint8(0);
		const block0Offset = childView.getUint16(2, false);
		let childStatePos = block0Offset;
		const objectType = childView.getUint8(childStatePos++);
		childStatePos += 2; // src
		childStatePos += 2; // pkgId
		const currentChildId = strings[childView.getUint16(childStatePos, false)] ?? null;
		if (currentChildId !== childId) {
			childPos = childEnd;
			continue;
		}

		const block8Offset = childView.getUint16(2 + 2 * 8, false);
		const block9Offset = segmentCount > 9 ? childView.getUint16(2 + 2 * 9, false) : 0;
		const items: Array<{ isFolder: boolean; level: number; title: string | null }> = [];
		if (block8Offset > 0) {
			let block8Pos = block8Offset;
			block8Pos += 2; // default item
			const listItemCount = childView.getInt16(block8Pos, false);
			block8Pos += 2;
			for (let li = 0; li < listItemCount; li++) {
				const itemLen = childView.getInt16(block8Pos, false);
				block8Pos += 2;
				const itemStart = block8Pos;
				block8Pos += 2; // url
				const isFolder = childView.getUint8(block8Pos++) !== 0;
				const level = childView.getUint8(block8Pos++);
				const title = strings[childView.getUint16(block8Pos, false)] ?? null;
				items.push({ isFolder, level, title });
				block8Pos = itemStart + itemLen;
			}
		}

		let indent = 0;
		let clickToExpand = 0;
		if (block9Offset > 0) {
			let block9Pos = block9Offset;
			indent = childView.getInt32(block9Pos, false);
			block9Pos += 4;
			clickToExpand = childView.getUint8(block9Pos);
		}

		return { objectType, segmentCount, items, indent, clickToExpand };
	}

	return null;
}

function readTransitionItemTypes(bytes: Uint8Array, componentId: string): number[] {
	const state = { pos: 0 };
	const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	state.pos += 4; // magic
	state.pos += 4; // version
	state.pos += 1; // compressed
	readUtfString(bytes, state); // packageId
	readUtfString(bytes, state); // packageName
	state.pos += 20; // reserved

	const data = bytes.subarray(state.pos);
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const offsets = [];
	let pos = 2;
	for (let i = 0; i < 6; i++) {
		offsets.push(view.getInt32(pos, false));
		pos += 4;
	}

	const stringTableOffset = offsets[4];
	const stringCount = view.getInt32(stringTableOffset, false);
	let stringPos = stringTableOffset + 4;
	const strings: string[] = [];
	for (let i = 0; i < stringCount; i++) {
		const len = view.getUint16(stringPos, false);
		stringPos += 2;
		strings.push(Buffer.from(data.subarray(stringPos, stringPos + len)).toString('utf8'));
		stringPos += len;
	}

	pos = offsets[1];
	const itemCount = view.getInt16(pos, false);
	pos += 2;

	let rawComponentData: Uint8Array | null = null;
	for (let i = 0; i < itemCount; i++) {
		const nextOffset = view.getInt32(pos, false);
		pos += 4;
		const nextPos = nextOffset + pos;
		const type = view.getUint8(pos++);
		const id = strings[view.getUint16(pos, false)] ?? null;
		pos += 2; // id
		pos += 2; // name
		pos += 2; // path
		pos += 2; // file
		pos += 1; // exported
		pos += 4; // width
		pos += 4; // height

		if (type === 3) {
			pos += 1; // ext
			const rawLen = view.getInt32(pos, false);
			pos += 4;
			if (id === componentId) {
				rawComponentData = data.subarray(pos, pos + rawLen);
				break;
			}
			pos += rawLen;
		}

		pos = nextPos;
	}

	if (!rawComponentData) return [];

	const compView = new DataView(rawComponentData.buffer, rawComponentData.byteOffset, rawComponentData.byteLength);
	const transitionBlockOffset = compView.getInt32(2 + 4 * 5, false);
	let transitionPos = transitionBlockOffset;
	const transitionCount = compView.getInt16(transitionPos, false);
	transitionPos += 2;
	if (transitionCount === 0) return [];

	transitionPos += 2; // transition dataLen
	transitionPos += 2; // transition name
	transitionPos += 4; // options
	transitionPos += 1; // autoPlay
	transitionPos += 4; // autoPlayTimes
	transitionPos += 4; // autoPlayDelay
	const itemCount2 = compView.getInt16(transitionPos, false);
	transitionPos += 2;

	const itemTypes: number[] = [];
	for (let i = 0; i < itemCount2; i++) {
		const itemLen = compView.getInt16(transitionPos, false);
		transitionPos += 2;
		const itemStart = transitionPos;
		transitionPos += 2; // blockCount/useShort
		const block0Offset = compView.getUint16(transitionPos, false);
		transitionPos = itemStart + block0Offset;
		itemTypes.push(compView.getUint8(transitionPos));
		transitionPos = itemStart + itemLen;
	}

	return itemTypes;
}

// ─── Round-trip: readBinary → writeBinary → readBinary ────────────────

test('binary round-trip: written file has valid magic and package info', async (t) => {
	const io = new NodeIO();
	const doc = await io.readBinary(BASICS_FUI);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'out_fui.bytes');

	try {
		await io.writeBinary(doc, outPath);

		// Read it back
		const doc2 = await io.readBinary(outPath);
		const pkg2 = doc2.getRoot().listPackages()[0];
		const pkg1 = doc.getRoot().listPackages()[0];

		t.is(pkg2.getId(), pkg1.getId(), 'package ID preserved');
		t.is(pkg2.getName(), pkg1.getName(), 'package name preserved');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary round-trip: resource count is preserved', async (t) => {
	const io = new NodeIO();
	const doc = await io.readBinary(BASICS_FUI);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'out_fui.bytes');

	try {
		await io.writeBinary(doc, outPath);

		const doc2 = await io.readBinary(outPath);
		const pkg1 = doc.getRoot().listPackages()[0];
		const pkg2 = doc2.getRoot().listPackages()[0];

		t.is(
			pkg2.listResources().length,
			pkg1.listResources().length,
			'same resource count after round-trip',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary round-trip: sprite atlas mapping is preserved', async (t) => {
	const io = new NodeIO();
	const doc = await io.readBinary(BASICS_FUI);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'out_fui.bytes');

	try {
		await io.writeBinary(doc, outPath);

		const doc2 = await io.readBinary(outPath);
		const pkg1 = doc.getRoot().listPackages()[0];
		const pkg2 = doc2.getRoot().listPackages()[0];

		const sprites1 = (pkg1.getExtras() as any)?.sprites ?? [];
		const sprites2 = (pkg2.getExtras() as any)?.sprites ?? [];
		t.is(sprites2.length, sprites1.length, 'same sprite count after round-trip');

		if (sprites1.length > 0) {
			t.is(sprites2[0].itemId, sprites1[0].itemId, 'first sprite itemId matches');
			t.is(sprites2[0].atlasId, sprites1[0].atlasId, 'first sprite atlasId matches');
		}
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary round-trip: compressed output works', async (t) => {
	const io = new NodeIO();
	const doc = await io.readBinary(BASICS_FUI);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'compressed_fui.bytes');

	try {
		await io.writeBinary(doc, outPath, { compressed: true });

		const doc2 = await io.readBinary(outPath);
		const pkg1 = doc.getRoot().listPackages()[0];
		const pkg2 = doc2.getRoot().listPackages()[0];

		t.is(pkg2.getId(), pkg1.getId(), 'package ID preserved with compression');
		t.is(
			pkg2.listResources().length,
			pkg1.listResources().length,
			'resource count preserved with compression',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary round-trip: image resources preserve properties', async (t) => {
	const io = new NodeIO();
	const doc = await io.readBinary(BASICS_FUI);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'out_fui.bytes');

	try {
		await io.writeBinary(doc, outPath);

		const doc2 = await io.readBinary(outPath);
		const pkg1 = doc.getRoot().listPackages()[0];
		const pkg2 = doc2.getRoot().listPackages()[0];

		const images1 = pkg1.listResources().filter((r) => r.propertyType === 'ImageResource');
		const images2 = pkg2.listResources().filter((r) => r.propertyType === 'ImageResource');
		t.is(images2.length, images1.length, 'same image count');

		if (images1.length > 0) {
			const img1 = images1[0] as any;
			const img2 = images2[0] as any;
			t.is(img2.getName(), img1.getName(), 'image name preserved');
			t.is(img2.getId(), img1.getId(), 'image id preserved');
		}
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: atlas package item file uses runtime-relative atlas name', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('AtlasPkg');
	pkg.setId('atlaspkg01');
	const atlas = doc.createAtlas('atlas0');
	atlas.setIndex(0).setFile('AtlasPkg_atlas0.png').setWidth(256).setHeight(128);
	pkg.addAtlas(atlas);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'out_fui.bytes');

	try {
		const io = new NodeIO();
		await io.writeBinary(doc, outPath);
		const bytes = await fs.readFile(outPath);
		const items = readPackageItems(bytes);
		const atlasItem = items.find((item) => item.type === 4);
		t.truthy(atlasItem, 'atlas item exists');
		t.is(atlasItem?.file, 'atlas0.png', 'atlas file in binary should not repeat package name prefix');
		t.is(atlasItem?.width, 256, 'atlas width should be written into the package item');
		t.is(atlasItem?.height, 128, 'atlas height should be written into the package item');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: component extension type is read from the formal component property', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('ExtPkg');
	pkg.setId('extpkg01');

	const component = doc.createComponent('ButtonComp');
	component.setId('btn001');
	component.setSize(120, 48);
	component.setExtensionType('Button');
	pkg.addResource(component);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'ext_fui.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const bytes = await fs.readFile(outPath);
		const items = readPackageItems(bytes);
		const componentItem = items.find((item) => item.id === 'btn001');
		t.truthy(componentItem, 'component item exists');
		t.is(componentItem?.ext, 12, 'Button extension type is serialized as 12');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: sprite originalSize is only emitted for rotated, trimmed, or zero-sized package sprites', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('SpritePkg');
	pkg.setId('spritepkg01');

	const plain = doc.createImageResource('plain.png');
	plain.setId('plain01').setWidth(32).setHeight(16);
	pkg.addResource(plain);

	const rotated = doc.createImageResource('rotated.png');
	rotated.setId('rot01').setWidth(40).setHeight(20);
	pkg.addResource(rotated);

	const zero = doc.createImageResource('zero.png');
	zero.setId('zero01').setWidth(66).setHeight(44);
	pkg.addResource(zero);

	const atlas = doc.createAtlas('atlas0');
	atlas.setFile('atlas0.png').setIndex(0);
	pkg.addAtlas(atlas);

	const plainSprite = doc.createSprite('plain01');
	plainSprite.setItemId('plain01');
	plainSprite.setAtlas(atlas);
	plainSprite.setRectX(0).setRectY(0).setRectWidth(32).setRectHeight(16);
	plainSprite.setOriginalWidth(32).setOriginalHeight(16);
	atlas.addSprite(plainSprite);

	const rotatedSprite = doc.createSprite('rot01');
	rotatedSprite.setItemId('rot01');
	rotatedSprite.setAtlas(atlas);
	rotatedSprite.setRectX(32).setRectY(0).setRectWidth(20).setRectHeight(40);
	rotatedSprite.setRotated(true);
	rotatedSprite.setOriginalWidth(40).setOriginalHeight(20);
	atlas.addSprite(rotatedSprite);

	const zeroSprite = doc.createSprite('zero01');
	zeroSprite.setItemId('zero01');
	zeroSprite.setAtlas(atlas);
	zeroSprite.setRectX(52).setRectY(0).setRectWidth(0).setRectHeight(0);
	zeroSprite.setOriginalWidth(66).setOriginalHeight(44);
	atlas.addSprite(zeroSprite);

	const frameSprite = doc.createSprite('plain01_0');
	frameSprite.setItemId('plain01_0');
	frameSprite.setAtlas(atlas);
	frameSprite.setRectX(52).setRectY(44).setRectWidth(16).setRectHeight(32);
	frameSprite.setRotated(true);
	frameSprite.setOriginalWidth(32).setOriginalHeight(16);
	atlas.addSprite(frameSprite);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'sprite_rules.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const bytes = await fs.readFile(outPath);
		const sprites = readSpriteEntries(bytes);
		const byId = new Map(sprites.map((sprite) => [sprite.itemId, sprite]));

		t.is(byId.get('plain01')?.extra, null, 'plain untrimmed sprite omits originalSize payload');
		t.deepEqual(byId.get('rot01')?.extra, { ox: 0, oy: 0, ow: 40, oh: 20 }, 'rotated sprite keeps originalSize payload');
		t.deepEqual(byId.get('zero01')?.extra, { ox: 0, oy: 0, ow: 66, oh: 44 }, 'zero-sized package sprite keeps originalSize payload');
		t.is(byId.get('plain01_0')?.extra, null, 'generated rotated frame sprite omits originalSize payload without trim offsets');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: child anchor and image flip are preserved in component raw-data', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('ChildStatePkg');
	pkg.setId('childstate01');

	const imageRes = doc.createImageResource('icon.png');
	imageRes.setId('img001').setWidth(64).setHeight(64);
	pkg.addResource(imageRes);

	const comp = doc.createComponent('Demo');
	comp.setId('comp001');
	comp.setSize(200, 200);

	const image = doc.createGImage('n1');
	image.setId('n1');
	image.setSrc('img001');
	image.setPivot(0.5, 0.5, true);
	image.setFlip(3);
	comp.addChild(image);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'child_state.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const bytes = await fs.readFile(outPath);
		const childState = readComponentChildState(bytes, 'comp001', 'n1');
		t.deepEqual(childState, { anchor: true, flip: 3 });
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: GLoader3D uses loader3d object type and persists runtime fields', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('Loader3DPkg');
	pkg.setId('loader3dpkg01');

	const comp = doc.createComponent('Loader3DHost');
	comp.setId('loader3dhost01');
	comp.setSize(320, 180);

	const loader3D = doc.createGLoader3D('model');
	loader3D.setId('model01');
	loader3D.setUrl('ui://loader3dpkg01/hero');
	loader3D.setAlign(2);
	loader3D.setVAlign(1);
	loader3D.setFill(5);
	loader3D.setShrinkOnly(true);
	loader3D.setAutoSize(true);
	loader3D.setAnimationName('run');
	loader3D.setSkinName('default');
	loader3D.setPlaying(false);
	loader3D.setFrame(7);
	loader3D.setLoop(false);
	loader3D.setColor('#112233');
	comp.addChild(loader3D);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'loader3d_state.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const bytes = await fs.readFile(outPath);
		const loader3DState = readLoader3DChildState(bytes, 'loader3dhost01', 'model01');
		t.truthy(loader3DState, 'loader3d child is encoded');
		t.deepEqual(loader3DState, {
			objectType: 18,
			url: 'ui://loader3dpkg01/hero',
			align: 2,
			vAlign: 1,
			fill: 5,
			shrinkOnly: true,
			autoSize: true,
			animationName: 'run',
			skinName: 'default',
			playing: false,
			frame: 7,
			loop: false,
			color: '#112233FF',
		});
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: tree lists use tree object type and persist hierarchy metadata', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('TreePkg');
	pkg.setId('treepkg01');

	const comp = doc.createComponent('TreeHost');
	comp.setId('treehost01');
	comp.setSize(400, 300);

	const list = doc.createGList('tree');
	list.setId('treechild01');
	list.setDefaultItem('ui://treepkg01/item');
	list.setTreeView(true);
	list.setIndent(15);
	list.setClickToExpand(1);
	list.setListItems([
		{
			title: 'Folder 1',
			icon: null,
			url: null,
			name: null,
			selectedTitle: null,
			selectedIcon: null,
			level: 0,
			isFolder: null,
		},
		{
			title: 'Leaf 1',
			icon: 'ui://treepkg01/leaf',
			url: null,
			name: null,
			selectedTitle: null,
			selectedIcon: null,
			level: 1,
			isFolder: false,
		},
	]);

	comp.addChild(list);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'tree_state.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const bytes = await fs.readFile(outPath);
		const treeState = readTreeChildState(bytes, 'treehost01', 'treechild01');
		t.truthy(treeState, 'tree child is encoded');
		t.is(treeState?.objectType, 17, 'tree list uses object type 17');
		t.is(treeState?.segmentCount, 10, 'tree list includes tree settings block');
		t.deepEqual(treeState?.items, [
			{ isFolder: true, level: 0, title: 'Folder 1' },
			{ isFolder: false, level: 1, title: 'Leaf 1' },
		]);
		t.is(treeState?.indent, 15);
		t.is(treeState?.clickToExpand, 1);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: transition items targeting missing children are filtered out', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('TransitionPkg');
	pkg.setId('transpkg01');

	const comp = doc.createComponent('BossLike');
	comp.setId('boss001');
	comp.setSize(300, 200);

	const image = doc.createGImage('n4');
	image.setId('n4');
	image.setSrc('img001');
	comp.addChild(image);

	const trans = doc.createTransition('t0');

	const soundItem = doc.createTransitionItem();
	soundItem.setActionType(9);
	soundItem.setStartValue(['ui://pkg/sound']);
	trans.addItem(soundItem);

	const validItem = doc.createTransitionItem();
	validItem.setActionType(0);
	validItem.setTargetId('n4');
	validItem.setTween(true);
	validItem.setStartValue(['0', '0']);
	validItem.setEndValue(['10', '10']);
	trans.addItem(validItem);

	const invalidItem = doc.createTransitionItem();
	invalidItem.setActionType(5);
	invalidItem.setTargetId('missing-child');
	invalidItem.setTween(true);
	invalidItem.setStartValue(['0']);
	invalidItem.setEndValue(['90']);
	trans.addItem(invalidItem);

	comp.addTransition(trans);
	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'transition_filter_fui.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const bytes = await fs.readFile(outPath);
		const itemTypes = readTransitionItemTypes(bytes, 'boss001');
		t.deepEqual(itemTypes, [9, 0], 'sound item and valid XY item remain, missing-target rotation item is filtered');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
