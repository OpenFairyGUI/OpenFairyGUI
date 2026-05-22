import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFixturePath } from '@openfairygui/test-utils';
import { Document, PropertyType } from '../src/index.js';
import { NodeIO } from '../src/node.js';

const BASICS_FUI = getFixturePath(
	'FairyGUI-unity',
	'Assets',
	'Examples',
	'Resources',
	'UI',
	'Basics_fui.bytes',
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

test('binary writer: package dependencies round-trip as formal package relations', async (t) => {
	const doc = new Document();
	const mainPkg = doc.createPackage('MainPkg');
	mainPkg.setId('mainpkg1');
	const depPkg = doc.createPackage('SharedPkg');
	depPkg.setId('sharedp1');
	mainPkg.addDependency(depPkg);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'package_dependencies.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const doc2 = await io.readBinary(outPath);
		const roundTripMainPkg = doc2
			.getRoot()
			.listPackages()
			.find((pkg) => pkg.getId() === 'mainpkg1');
		t.truthy(roundTripMainPkg, 'main package exists after round-trip');

		const deps = roundTripMainPkg!.listDependencies();
		t.is(deps.length, 1, 'one dependency relation is restored');
		t.is(deps[0]?.getId(), 'sharedp1', 'dependency package id is preserved');
		t.is(deps[0]?.getName(), 'SharedPkg', 'dependency package name is preserved');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: movie clip frames round-trip as formal properties', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('MovieClipPkg');
	pkg.setId('moviepkg1');

	const movieClip = doc.createMovieClipResource('Explosion');
	movieClip
		.setId('mc001')
		.setWidth(64)
		.setHeight(48)
		.setInterval(120)
		.setSwing(true)
		.setRepeatDelay(17)
		.setSmoothing(false);

	const frame0 = doc.createMovieFrame('mc001_0');
	frame0.setRectX(1).setRectY(2).setRectWidth(30).setRectHeight(40).setAddDelay(3).setSpriteId('mc001_0');
	movieClip.addFrame(frame0);

	const frame1 = doc.createMovieFrame('mc001_1');
	frame1.setRectX(4).setRectY(5).setRectWidth(31).setRectHeight(41).setAddDelay(6).setSpriteId('mc001_1');
	movieClip.addFrame(frame1);

	pkg.addResource(movieClip);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'movieclip_roundtrip.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const doc2 = await io.readBinary(outPath);
		const pkg2 = doc2.getRoot().listPackages().find((item) => item.getId() === 'moviepkg1');
		t.truthy(pkg2, 'movie clip package exists after round-trip');
		const movieClip2 = pkg2?.listResources().find((item) => item.propertyType === 'MovieClipResource');
		t.truthy(movieClip2, 'movie clip resource exists after round-trip');

		const roundTripClip = movieClip2 as ReturnType<Document['createMovieClipResource']>;
		t.is(roundTripClip.getWidth(), 64);
		t.is(roundTripClip.getHeight(), 48);
		t.is(roundTripClip.getInterval(), 120);
		t.true(roundTripClip.getSwing());
		t.is(roundTripClip.getRepeatDelay(), 17);
		t.false(roundTripClip.getSmoothing());
		t.is(roundTripClip.listFrames().length, 2, 'movie clip frames are restored');
		t.deepEqual(
			roundTripClip.listFrames().map((frame) => ({
				x: frame.getRectX(),
				y: frame.getRectY(),
				width: frame.getRectWidth(),
				height: frame.getRectHeight(),
				addDelay: frame.getAddDelay(),
				spriteId: frame.getSpriteId(),
			})),
			[
				{ x: 1, y: 2, width: 30, height: 40, addDelay: 3, spriteId: 'mc001_0' },
				{ x: 4, y: 5, width: 31, height: 41, addDelay: 6, spriteId: 'mc001_1' },
			],
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: font glyphs round-trip as formal properties', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('FontPkg');
	pkg.setId('fontpkg1');

	const font = doc.createFontResource('BattleFont');
	font
		.setId('font001')
		.setTtf(true)
		.setTint(true)
		.setAutoScale(false)
		.setHasChannel(true)
		.setFontSize(24)
		.setXAdvance(16)
		.setLineHeight(28);

	const glyphA = doc.createFontGlyph('font001_65');
	glyphA
		.setCharId(65)
		.setChar('A')
		.setImg('glyph_a')
		.setX(1)
		.setY(2)
		.setXOffset(3)
		.setYOffset(4)
		.setWidth(20)
		.setHeight(21)
		.setAdvance(22)
		.setChannel(1);
	font.addGlyph(glyphA);

	const glyphB = doc.createFontGlyph('font001_66');
	glyphB
		.setCharId(66)
		.setChar('B')
		.setImg('')
		.setX(5)
		.setY(6)
		.setXOffset(7)
		.setYOffset(8)
		.setWidth(23)
		.setHeight(24)
		.setAdvance(25)
		.setChannel(15);
	font.addGlyph(glyphB);

	pkg.addResource(font);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'font_roundtrip.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const doc2 = await io.readBinary(outPath);
		const pkg2 = doc2.getRoot().listPackages().find((item) => item.getId() === 'fontpkg1');
		t.truthy(pkg2, 'font package exists after round-trip');
		const font2 = pkg2?.listResources().find((item) => item.propertyType === 'FontResource');
		t.truthy(font2, 'font resource exists after round-trip');

		const roundTripFont = font2 as ReturnType<Document['createFontResource']>;
		t.true(roundTripFont.getTtf());
		t.true(roundTripFont.getTint());
		t.false(roundTripFont.getAutoScale());
		t.true(roundTripFont.getHasChannel());
		t.is(roundTripFont.getFontSize(), 24);
		t.is(roundTripFont.getXAdvance(), 16);
		t.is(roundTripFont.getLineHeight(), 28);
		t.deepEqual(
			roundTripFont.listGlyphs().map((glyph) => ({
				charId: glyph.getCharId(),
				char: glyph.getChar(),
				img: glyph.getImg(),
				x: glyph.getX(),
				y: glyph.getY(),
				xOffset: glyph.getXOffset(),
				yOffset: glyph.getYOffset(),
				width: glyph.getWidth(),
				height: glyph.getHeight(),
				advance: glyph.getAdvance(),
				channel: glyph.getChannel(),
			})),
			[
				{ charId: 65, char: 'A', img: 'glyph_a', x: 1, y: 2, xOffset: 3, yOffset: 4, width: 20, height: 21, advance: 22, channel: 1 },
				{ charId: 66, char: 'B', img: '', x: 5, y: 6, xOffset: 7, yOffset: 8, width: 23, height: 24, advance: 25, channel: 15 },
			],
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: misc/spine/dragonbones resources round-trip as formal package resources', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('LoaderPkg');
	pkg.setId('loader001');

	const misc = doc.createMiscResource('alien-pma');
	misc.setId('misc001').setPath('/images/').setFile('alien-pma.atlas').setExported(true);
	pkg.addResource(misc);

	const spine = doc.createSpineResource('alien-pro');
	spine
		.setId('spine001')
		.setPath('/images/')
		.setFile('alien-pro.skel')
		.setExported(true)
		.setWidth(368)
		.setHeight(384)
		.setRequireIds(['misc001', 'img001'])
		.setAtlasNames(['alien-pma'])
		.setAnchor(176, 380);
	pkg.addResource(spine);

	const dragon = doc.createDragonBonesResource('dragon_ske');
	dragon
		.setId('dragon001')
		.setPath('/images/')
		.setFile('dragon_ske.json')
		.setExported(true)
		.setWidth(0)
		.setHeight(0)
		.setRequireIds(['misc002', 'img002'])
		.setAtlasNames([])
		.setAnchor(0, 0);
	pkg.addResource(dragon);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'skeleton_resources.bytes');

	try {
		await io.writeBinary(doc, outPath);

		const bytes = await fs.readFile(outPath);
		const items = readPackageItems(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
		t.deepEqual(
			items
				.filter((item) => item.id === 'misc001' || item.id === 'spine001' || item.id === 'dragon001')
				.sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))
				.map((item) => ({ type: item.type, id: item.id, file: item.file })),
			[
				{ type: 9, id: 'dragon001', file: 'dragon_ske.json' },
				{ type: 7, id: 'misc001', file: 'alien-pma.atlas' },
				{ type: 8, id: 'spine001', file: 'alien-pro.skel' },
			],
		);

		const roundTripped = await io.readBinary(outPath);
		const pkg2 = roundTripped.getRoot().getPackage('LoaderPkg');
		t.truthy(pkg2, 'LoaderPkg exists after round-trip');

		const misc2 = pkg2!.listResources().find((resource) => resource.getId?.() === 'misc001') as any;
		t.truthy(misc2, 'misc resource exists');
		t.is(misc2.propertyType, PropertyType.MISC_RESOURCE);
		t.is(misc2.getFile?.(), 'alien-pma.atlas');

		const spine2 = pkg2!.listResources().find((resource) => resource.getId?.() === 'spine001') as any;
		t.truthy(spine2, 'spine resource exists');
		t.is(spine2.propertyType, PropertyType.SPINE_RESOURCE);
		t.is(spine2.getFile?.(), 'alien-pro.skel');
		t.is(spine2.getWidth?.(), 368);
		t.is(spine2.getHeight?.(), 384);
		t.is(spine2.getAnchorX?.(), 176);
		t.is(spine2.getAnchorY?.(), 380);

		const dragon2 = pkg2!.listResources().find((resource) => resource.getId?.() === 'dragon001') as any;
		t.truthy(dragon2, 'dragonbones resource exists');
		t.is(dragon2.propertyType, PropertyType.DRAGON_BONES_RESOURCE);
		t.is(dragon2.getFile?.(), 'dragon_ske.json');
		t.is(dragon2.getAnchorX?.(), 0);
		t.is(dragon2.getAnchorY?.(), 0);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: branch metadata round-trips as package-level branches and item mappings', async (t) => {
	const doc = new Document();
	doc.getRoot().setBranches(['dev']);

	const pkg = doc.createPackage('BranchPkg');
	pkg.setId('branch001');

	const mainComponent = doc.createComponent('Main');
	mainComponent
		.setId('mainComp')
		.setPath('/')
		.setExported(true)
		.setSize(200, 120)
		.setBranchItemIds(['devComp']);
	pkg.addResource(mainComponent);

	const mainImage = doc.createImageResource('face.png');
	mainImage
		.setId('mainFace')
		.setPath('/')
		.setExported(true)
		.setBranchItemIds(['devFace']);
	pkg.addResource(mainImage);

	const devImage = doc.createImageResource('face.png');
	devImage
		.setId('devFace')
		.setPath('/')
		.setExported(true)
		.setBranch('dev');
	pkg.addResource(devImage);

	const devComponent = doc.createComponent('Main');
	devComponent
		.setId('devComp')
		.setPath('/')
		.setExported(true)
		.setSize(320, 180)
		.setBranch('dev');
	pkg.addResource(devComponent);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'branch_resources.bytes');

	try {
		await io.writeBinary(doc, outPath);

		const roundTripped = await io.readBinary(outPath);
		t.deepEqual(roundTripped.getRoot().listBranches(), ['dev']);

		const pkg2 = roundTripped.getRoot().getPackage('BranchPkg');
		t.truthy(pkg2, 'BranchPkg exists after round-trip');

		const mainComponent2 = pkg2!.listResources().find((resource) => resource.getId?.() === 'mainComp') as any;
		const devComponent2 = pkg2!.listResources().find((resource) => resource.getId?.() === 'devComp') as any;
		const mainImage2 = pkg2!.listResources().find((resource) => resource.getId?.() === 'mainFace') as any;
		const devImage2 = pkg2!.listResources().find((resource) => resource.getId?.() === 'devFace') as any;
		t.truthy(mainComponent2, 'main component exists after round-trip');
		t.truthy(devComponent2, 'branch component exists after round-trip');
		t.truthy(mainImage2, 'main image exists after round-trip');
		t.truthy(devImage2, 'branch image exists after round-trip');
		t.is(mainComponent2.getBranch?.(), '');
		t.deepEqual(mainComponent2.getBranchItemIds?.(), ['devComp']);
		t.is(devComponent2.getBranch?.(), 'dev');
		t.deepEqual(devComponent2.getBranchItemIds?.(), []);
		t.is(mainImage2.getBranch?.(), '');
		t.deepEqual(mainImage2.getBranchItemIds?.(), ['devFace']);
		t.is(devImage2.getBranch?.(), 'dev');
		t.deepEqual(devImage2.getBranchItemIds?.(), []);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: image high-resolution item ids round-trip as formal properties', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('HiResPkg');
	pkg.setId('hirespkg');

	const image = doc.createImageResource('icon.png');
	image.setId('icon01').setWidth(16).setHeight(16).setHighResolutionItemIds(['icon2x', null, 'icon4x']);
	pkg.addResource(image);

	const image2x = doc.createImageResource('icon@2x.png');
	image2x.setId('icon2x').setWidth(32).setHeight(32);
	pkg.addResource(image2x);

	const image4x = doc.createImageResource('icon@4x.png');
	image4x.setId('icon4x').setWidth(64).setHeight(64);
	pkg.addResource(image4x);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'high_resolution.bytes');

	try {
		await io.writeBinary(doc, outPath);

		const roundTripped = await io.readBinary(outPath);
		const decodedImage = roundTripped
			.getRoot()
			.getPackage('HiResPkg')
			?.listResources()
			.find((resource) => resource.getId?.() === 'icon01') as any;

		t.truthy(decodedImage, 'base image exists after round-trip');
		t.deepEqual(decodedImage?.getHighResolutionItemIds?.(), ['icon2x', null, 'icon4x']);
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

test('binary writer: image and sound resource names keep dotted resource bases on readback', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('DottedNamesPkg');
	pkg.setId('dotted001');

	const imageRes = doc.createImageResource('hero.png');
	imageRes
		.setId('img001')
		.setPath('/images/')
		.setFileName('hero.png.jpg')
		.setWidth(64)
		.setHeight(32)
		.setExported(true);
	pkg.addResource(imageRes);

	const soundRes = doc.createSoundResource('voice.wav');
	soundRes
		.setId('snd001')
		.setPath('/sound/')
		.setFile('voice.wav.mp3')
		.setExported(true);
	pkg.addResource(soundRes);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'dotted_names.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const roundTripped = await io.readBinary(outPath);
		const roundTripPkg = roundTripped.getRoot().getPackage('DottedNamesPkg');
		t.truthy(roundTripPkg, 'round-tripped package exists');

		const roundTripImage = roundTripPkg?.getResourceById('img001') as ReturnType<Document['createImageResource']>;
		t.truthy(roundTripImage, 'round-tripped image exists');
		t.is(roundTripImage.getName(), 'hero.png', 'binary item name keeps the dotted resource base');
		t.is(roundTripImage.getFileName(), 'hero.png.png', 'binary image restore always appends png to the resource name');

		const roundTripSound = roundTripPkg?.getResourceById('snd001') as ReturnType<Document['createSoundResource']>;
		t.truthy(roundTripSound, 'round-tripped sound exists');
		t.is(roundTripSound.getName(), 'voice.wav', 'binary item name keeps the dotted sound resource base');
		t.is(roundTripSound.getFile(), 'voice.wav.mp3', 'binary sound restore appends the published sound suffix to the resource name');
		t.is(
			(roundTripSound.getExtras() as Record<string, unknown>)._publishedFile,
			'snd001.mp3',
			'binary sound restore still tracks the published file name for source lookup',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: cross-package display-list refs preserve package ids on readback', async (t) => {
	const doc = new Document();
	const hostPkg = doc.createPackage('HostPkg');
	hostPkg.setId('hostpkg01');
	const sharedPkg = doc.createPackage('SharedPkg');
	sharedPkg.setId('shared01');

	const sharedImage = doc.createImageResource('SharedImage');
	sharedImage.setId('imgB').setPath('/images/').setFileName('SharedImage.png').setWidth(32).setHeight(24);
	sharedPkg.addResource(sharedImage);

	const sharedComponent = doc.createComponent('SharedCard');
	sharedComponent.setId('cmpB').setPath('/widgets/').setSize(120, 80);
	sharedPkg.addResource(sharedComponent);

	const sharedMovieClip = doc.createMovieClipResource('SharedFx');
	sharedMovieClip.setId('mcB').setPath('/fx/').setFileName('SharedFx.jta').setWidth(64).setHeight(32);
	sharedPkg.addResource(sharedMovieClip);

	const hostComponent = doc.createComponent('Host');
	hostComponent.setId('host001').setSize(400, 300);

	const imageChild = doc.createGImage('sharedImage');
	imageChild.setId('n0').setSrc('imgB').setPackageId('shared01');
	hostComponent.addChild(imageChild);

	const componentChild = doc.createGComponent('sharedComponent');
	componentChild.setId('n1').setSrc('cmpB').setPackageId('shared01');
	hostComponent.addChild(componentChild);

	const movieClipChild = doc.createGMovieClip('sharedMovieClip');
	movieClipChild.setId('n2').setSrc('mcB').setPackageId('shared01');
	hostComponent.addChild(movieClipChild);

	hostPkg.addResource(hostComponent);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'host_package.bytes');

	try {
		await io.writeBinary(doc, outPath, { packageIndex: 0 });
		const roundTripped = await io.readBinary(outPath);
		const roundTripPkg = roundTripped.getRoot().getPackage('HostPkg');
		t.truthy(roundTripPkg, 'round-tripped host package exists');

		const decodedHost = roundTripPkg?.getComponent('Host');
		t.truthy(decodedHost, 'round-tripped host component exists');
		const byId = new Map(decodedHost?.listChildren().map((child) => [child.getId(), child as any]));

		t.is(byId.get('n0')?.getSrc?.(), 'imgB');
		t.is(byId.get('n0')?.getPackageId?.(), 'shared01', 'cross-package image keeps package id');
		t.is(byId.get('n1')?.getSrc?.(), 'cmpB');
		t.is(byId.get('n1')?.getPackageId?.(), 'shared01', 'cross-package component keeps package id');
		t.is(byId.get('n2')?.getSrc?.(), 'mcB');
		t.is(byId.get('n2')?.getPackageId?.(), 'shared01', 'cross-package movieclip keeps package id');
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

	const tree = doc.createGTree('tree');
	tree.setId('treechild01');
	tree.setDefaultItem('ui://treepkg01/item');
	tree.setIndent(15);
	tree.setClickToExpand(1);
	tree.setListItems([
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

	comp.addChild(tree);
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

test('binary writer: component top-level fields round-trip into formal properties', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('ComponentPkg');
	pkg.setId('comppkg1');

	const scrollComp = doc.createComponent('ScrollHost');
	scrollComp
		.setId('scroll001')
		.setExported(true)
		.setSize(480, 320)
		.setMinWidth(120)
		.setMaxWidth(960)
		.setMinHeight(90)
		.setMaxHeight(640)
		.setPivotX(0.25)
		.setPivotY(0.75)
		.setPivotAsAnchor(true)
		.setMargin([5, 6, 7, 8])
		.setOverflow(2)
		.setClipSoftness([9, 10])
		.setCustomData('component-meta')
		.setOpaque(false)
		.setAddedToStageSound('ui://comppkg1/add')
		.setRemovedFromStageSound('ui://comppkg1/remove')
		.setScrollType(2)
		.setScrollBarDisplay(2)
		.setScrollBarFlags(17)
		.setScrollBarMargin([11, 12, 13, 14])
		.setVtScrollBarRes('ui://comppkg1/vbar')
		.setHzScrollBarRes('ui://comppkg1/hbar')
		.setHeaderRes('ui://comppkg1/header')
		.setFooterRes('ui://comppkg1/footer');
	pkg.addResource(scrollComp);

	const buttonComp = doc.createComponent('ButtonHost');
	buttonComp
		.setId('button001')
		.setExported(true)
		.setSize(180, 64)
		.setExtensionType('Button')
		.setButtonMode(2)
		.setSound('ui://comppkg1/click')
		.setSoundVolumeScale(0.5)
		.setDownEffect(1)
		.setDownEffectValue(0.65);
	pkg.addResource(buttonComp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'component_top_level.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const roundTripped = await io.readBinary(outPath);
		const roundTripPkg = roundTripped.getRoot().getPackage('ComponentPkg');
		t.truthy(roundTripPkg, 'round-tripped package exists');

		const decodedScroll = roundTripPkg?.getComponent('ScrollHost');
		t.truthy(decodedScroll, 'scroll component is decoded');
		t.is(decodedScroll?.getWidth(), 480);
		t.is(decodedScroll?.getHeight(), 320);
		t.is(decodedScroll?.getMinWidth(), 120);
		t.is(decodedScroll?.getMaxWidth(), 960);
		t.is(decodedScroll?.getMinHeight(), 90);
		t.is(decodedScroll?.getMaxHeight(), 640);
		t.is(decodedScroll?.getPivotX(), 0.25);
		t.is(decodedScroll?.getPivotY(), 0.75);
		t.true(decodedScroll?.getPivotAsAnchor() ?? false);
		t.deepEqual(decodedScroll?.getMargin(), { top: 5, bottom: 6, left: 7, right: 8 });
		t.is(decodedScroll?.getOverflow(), 2);
		t.deepEqual(decodedScroll?.getClipSoftness(), { x: 9, y: 10 });
		t.is(decodedScroll?.getCustomData(), 'component-meta');
		t.false(decodedScroll?.getOpaque() ?? true);
		t.is(decodedScroll?.getAddedToStageSound(), 'ui://comppkg1/add');
		t.is(decodedScroll?.getRemovedFromStageSound(), 'ui://comppkg1/remove');
		t.is(decodedScroll?.getScrollType(), 2);
		t.is(decodedScroll?.getScrollBarDisplay(), 2);
		t.is(decodedScroll?.getScrollBarFlags(), 17);
		t.deepEqual(decodedScroll?.getScrollBarMargin(), { top: 11, bottom: 12, left: 13, right: 14 });
		t.is(decodedScroll?.getVtScrollBarRes(), 'ui://comppkg1/vbar');
		t.is(decodedScroll?.getHzScrollBarRes(), 'ui://comppkg1/hbar');
		t.is(decodedScroll?.getHeaderRes(), 'ui://comppkg1/header');
		t.is(decodedScroll?.getFooterRes(), 'ui://comppkg1/footer');
		t.truthy((decodedScroll?.getExtras() as Record<string, unknown> | undefined)?._rawBinary, '_rawBinary is still retained for write-back');

		const decodedButton = roundTripPkg?.getComponent('ButtonHost');
		t.truthy(decodedButton, 'button component is decoded');
		t.is(decodedButton?.getExtensionType(), 'Button');
		t.is(decodedButton?.getButtonMode(), 2);
		t.is(decodedButton?.getSound(), 'ui://comppkg1/click');
		t.is(decodedButton?.getSoundVolumeScale(), 0.5);
		t.is(decodedButton?.getDownEffect(), 1);
		t.true(Math.abs((decodedButton?.getDownEffectValue() ?? 0) - 0.65) < 1e-6);
		t.truthy((decodedButton?.getExtras() as Record<string, unknown> | undefined)?._rawBinary, '_rawBinary is retained for extended components');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: component child blocks round-trip into formal child properties', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('ChildPkg');
	pkg.setId('childpkg');

	const comp = doc.createComponent('ChildHost');
	comp.setId('childhost');
	comp.setSize(640, 360);

	const group = doc.createGGroup('group');
	group
		.setId('group01')
		.setXY(12, 18)
		.setAdvanced(true)
		.setLayout(1)
		.setLineGap(6)
		.setColumnGap(8);
	comp.addChild(group);

	const image = doc.createGImage('hero');
	image
		.setId('img01')
		.setSrc('ui://childpkg/hero')
		.setXY(30, 40)
		.setSize(120, 90)
		.setScale(1.5, 0.75)
		.setSkew(2, -3)
		.setPivot(0.25, 0.5, true)
		.setAlpha(0.6)
		.setVisible(false)
		.setTouchable(false)
		.setGrayed(true)
		.setCustomData('hero-meta')
		.setTooltips('hero-tip')
		.setGroup(group.getId())
		.setColor('#336699')
		.setFlip(2)
		.setFillMethod(1)
		.setFillOrigin(0)
		.setFillClockwise(false)
		.setFillAmount(0.25);
	comp.addChild(image);

	const input = doc.createGTextInput('input');
	input
		.setId('input01')
		.setXY(80, 120)
		.setSize(200, 36)
		.setText('hello')
		.setFont('ui://childpkg/font')
		.setFontSize(18)
		.setColor('#224466')
		.setPromptText('enter name')
		.setRestrict('A-Za-z')
		.setMaxLength(12)
		.setKeyboardType(4)
		.setPassword(true);
	comp.addChild(input);

	const loader3d = doc.createGLoader3D('loader3d');
	loader3d
		.setId('ldr3d01')
		.setXY(320, 90)
		.setSize(140, 140)
		.setUrl('ui://childpkg/model')
		.setAlign(1)
		.setVAlign(2)
		.setFill(5)
		.setShrinkOnly(true)
		.setAutoSize(true)
		.setAnimationName('idle')
		.setSkinName('skinA')
		.setPlaying(false)
		.setFrame(7)
		.setLoop(false)
		.setColor('#445566');
	comp.addChild(loader3d);

	const button = doc.createGButton('action');
	button
		.setId('btn01')
		.setSrc('ui://childpkg/button')
		.setXY(480, 40)
		.setSize(120, 50)
		.setTitle('确认')
		.setSelectedTitle('已确认')
		.setIcon('ui://childpkg/iconA')
		.setSelectedIcon('ui://childpkg/iconB')
		.setTitleColor('#AA5500')
		.setTitleFontSize(22);
	comp.addChild(button);

	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'component_child_blocks.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const roundTripped = await io.readBinary(outPath);
		const roundTripComp = roundTripped.getRoot().getPackage('ChildPkg')?.getComponent('ChildHost');
		t.truthy(roundTripComp, 'round-tripped component exists');
		t.is(roundTripComp?.listChildren().length, 5);

		const rtGroup = roundTripComp?.listChildren().find((child) => child.getId() === 'group01');
		t.truthy(rtGroup, 'group child exists');
		t.is(rtGroup?.propertyType, PropertyType.G_GROUP);

		const rtImage = roundTripComp?.listChildren().find((child) => child.getId() === 'img01');
		t.truthy(rtImage, 'image child exists');
		t.is(rtImage?.propertyType, PropertyType.G_IMAGE);
		const typedImage = rtImage as any;
		t.is(typedImage.getSrc(), 'ui://childpkg/hero');
		t.is(typedImage.getX(), 30);
		t.is(typedImage.getY(), 40);
		t.is(typedImage.getWidth(), 120);
		t.is(typedImage.getHeight(), 90);
		t.is(typedImage.getScaleX(), 1.5);
		t.is(typedImage.getScaleY(), 0.75);
		t.is(typedImage.getSkewX(), 2);
		t.is(typedImage.getSkewY(), -3);
		t.is(typedImage.getPivotX(), 0.25);
		t.is(typedImage.getPivotY(), 0.5);
		t.true(typedImage.getPivotAsAnchor());
		t.true(Math.abs(typedImage.getAlpha() - 0.6) < 1e-6);
		t.false(typedImage.getVisible());
		t.false(typedImage.getTouchable());
		t.true(typedImage.getGrayed());
		t.is(typedImage.getCustomData(), 'hero-meta');
		t.is(typedImage.getTooltips(), 'hero-tip');
		t.is(typedImage.getGroup(), 'group01');
		t.is(typedImage.getColor(), '#336699');
		t.is(typedImage.getFlip(), 2);
		t.is(typedImage.getFillMethod(), 1);
		t.is(typedImage.getFillOrigin(), 0);
		t.false(typedImage.getFillClockwise());
		t.true(Math.abs(typedImage.getFillAmount() - 0.25) < 1e-6);

		const rtInput = roundTripComp?.listChildren().find((child) => child.getId() === 'input01');
		t.truthy(rtInput, 'text input child exists');
		t.is(rtInput?.propertyType, PropertyType.G_TEXT_INPUT);
		const typedInput = rtInput as any;
		t.is(typedInput.getText(), 'hello');
		t.is(typedInput.getFont(), 'ui://childpkg/font');
		t.is(typedInput.getFontSize(), 18);
		t.is(typedInput.getColor(), '#224466');
		t.is(typedInput.getPromptText(), 'enter name');
		t.is(typedInput.getRestrict(), 'A-Za-z');
		t.is(typedInput.getMaxLength(), 12);
		t.is(typedInput.getKeyboardType(), 4);
		t.true(typedInput.getPassword());

		const rtLoader3d = roundTripComp?.listChildren().find((child) => child.getId() === 'ldr3d01');
		t.truthy(rtLoader3d, 'loader3d child exists');
		t.is(rtLoader3d?.propertyType, PropertyType.G_LOADER_3D);
		const typedLoader3d = rtLoader3d as any;
		t.is(typedLoader3d.getUrl(), 'ui://childpkg/model');
		t.is(typedLoader3d.getAlign(), 1);
		t.is(typedLoader3d.getVAlign(), 2);
		t.is(typedLoader3d.getFill(), 5);
		t.true(typedLoader3d.getShrinkOnly());
		t.true(typedLoader3d.getAutoSize());
		t.is(typedLoader3d.getAnimationName(), 'idle');
		t.is(typedLoader3d.getSkinName(), 'skinA');
		t.false(typedLoader3d.getPlaying());
		t.is(typedLoader3d.getFrame(), 7);
		t.false(typedLoader3d.getLoop());
		t.is(typedLoader3d.getColor(), '#445566');

		const rtButton = roundTripComp?.listChildren().find((child) => child.getId() === 'btn01');
		t.truthy(rtButton, 'button child exists');
		t.is(rtButton?.propertyType, PropertyType.G_BUTTON);
		const typedButton = rtButton as any;
		t.is(typedButton.getSrc(), 'ui://childpkg/button');
		t.is(typedButton.getTitle(), '确认');
		t.is(typedButton.getSelectedTitle(), '已确认');
		t.is(typedButton.getIcon(), 'ui://childpkg/iconA');
		t.is(typedButton.getSelectedIcon(), 'ui://childpkg/iconB');
		t.is(typedButton.getTitleColor(), '#AA5500');
		t.is(typedButton.getTitleFontSize(), 22);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: list and tree child blocks round-trip into formal list properties', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('ListPkg');
	pkg.setId('listpkg');

	const comp = doc.createComponent('ListHost');
	comp.setId('listhost');
	comp.setSize(640, 480);

	const ctrl = doc.createController('state');
	const page0 = doc.createControllerPage('idle');
	page0.setId('0');
	const page1 = doc.createControllerPage('active');
	page1.setId('1');
	ctrl.addPage(page0);
	ctrl.addPage(page1);
	comp.addController(ctrl);

	const list = doc.createGList('mainList');
	list
		.setId('list01')
		.setCustomData('list-custom')
		.setSrc('ui://listpkg/list')
		.setLayout(4)
		.setSelectionMode(1)
		.setAlign(2)
		.setVAlign(1)
		.setLineGap(6)
		.setColumnGap(8)
		.setLineCount(2)
		.setColumnCount(3)
		.setAutoResizeItem(false)
		.setChildrenRenderOrder(2)
		.setApexIndex(1)
		.setMargin([1, 2, 3, 4])
		.setOverflow(2)
		.setScrollType(2)
		.setScrollBarFlags(19)
		.setScrollBarMargin([5, 6, 7, 8])
		.setVtScrollBarRes('ui://listpkg/vbar')
		.setHzScrollBarRes('ui://listpkg/hbar')
		.setHeaderRes('ui://listpkg/header')
		.setFooterRes('ui://listpkg/footer')
		.setClipSoftness([9, 10])
		.setScrollItemToViewOnClick(false)
		.setFoldInvisibleItems(true)
		.setDefaultItem('ui://listpkg/defaultItem')
		.setSelectionController('state')
		.setListItems([
			{
				title: 'A',
				selectedTitle: 'A*',
				icon: 'ui://listpkg/iconA',
				selectedIcon: 'ui://listpkg/iconASelected',
				url: 'ui://listpkg/itemA',
				name: 'itemA',
				level: 0,
				isFolder: null,
			},
			{
				title: 'B',
				selectedTitle: null,
				icon: null,
				selectedIcon: null,
				url: null,
				name: 'itemB',
				level: 0,
				isFolder: null,
			},
		]);
	comp.addChild(list);

	const tree = doc.createGTree('tree');
	tree
		.setId('tree01')
		.setCustomData('tree-custom')
		.setSrc('ui://listpkg/tree')
		.setLayout(0)
		.setLineGap(4)
		.setColumnGap(0)
		.setOverflow(2)
		.setScrollType(1)
		.setScrollBarFlags(7)
		.setScrollBarMargin([2, 3, 4, 5])
		.setVtScrollBarRes('ui://listpkg/treeVBar')
		.setHeaderRes('ui://listpkg/treeHeader')
		.setClipSoftness([11, 12])
		.setScrollItemToViewOnClick(true)
		.setFoldInvisibleItems(false)
		.setDefaultItem('ui://listpkg/treeItem')
		.setIndent(15)
		.setClickToExpand(2)
		.setListItems([
			{
				title: 'Folder 1',
				selectedTitle: null,
				icon: null,
				selectedIcon: null,
				url: null,
				name: 'folder1',
				level: 0,
				isFolder: true,
			},
			{
				title: 'Leaf 1',
				selectedTitle: null,
				icon: 'ui://listpkg/leaf',
				selectedIcon: null,
				url: 'ui://listpkg/treeLeaf',
				name: 'leaf1',
				level: 1,
				isFolder: false,
			},
		]);
	comp.addChild(tree);

	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'list_tree_blocks.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const roundTripped = await io.readBinary(outPath);
		const decodedComp = roundTripped.getRoot().getPackage('ListPkg')?.getComponent('ListHost');
		t.truthy(decodedComp, 'round-tripped component exists');

		const decodedList = decodedComp?.listChildren().find((child) => child.getId() === 'list01') as ReturnType<Document['createGList']>;
		t.truthy(decodedList, 'list child exists');
		t.is(decodedList.getCustomData(), 'list-custom');
		t.is(decodedList.getLayout(), 4);
		t.is(decodedList.getSelectionMode(), 1);
		t.is(decodedList.getAlign(), 2);
		t.is(decodedList.getVAlign(), 1);
		t.is(decodedList.getLineGap(), 6);
		t.is(decodedList.getColumnGap(), 8);
		t.is(decodedList.getLineCount(), 2);
		t.is(decodedList.getColumnCount(), 3);
		t.false(decodedList.getAutoResizeItem());
		t.is(decodedList.getChildrenRenderOrder(), 2);
		t.is(decodedList.getApexIndex(), 1);
		t.deepEqual(decodedList.getMargin(), { top: 1, bottom: 2, left: 3, right: 4 });
		t.is(decodedList.getOverflow(), 2);
		t.is(decodedList.getScrollType(), 2);
		t.is(decodedList.getScrollBarFlags(), 19);
		t.deepEqual(decodedList.getScrollBarMargin(), { top: 5, bottom: 6, left: 7, right: 8 });
		t.is(decodedList.getVtScrollBarRes(), 'ui://listpkg/vbar');
		t.is(decodedList.getHzScrollBarRes(), 'ui://listpkg/hbar');
		t.is(decodedList.getHeaderRes(), 'ui://listpkg/header');
		t.is(decodedList.getFooterRes(), 'ui://listpkg/footer');
		t.deepEqual(decodedList.getClipSoftness(), { x: 9, y: 10 });
		t.false(decodedList.getScrollItemToViewOnClick());
		t.true(decodedList.getFoldInvisibleItems());
		t.is(decodedList.getDefaultItem(), 'ui://listpkg/defaultItem');
		t.is(decodedList.getSelectionController(), 'state');
		t.deepEqual(decodedList.getListItems(), [
			{
				title: 'A',
				selectedTitle: 'A*',
				icon: 'ui://listpkg/iconA',
				selectedIcon: 'ui://listpkg/iconASelected',
				url: 'ui://listpkg/itemA',
				name: 'itemA',
				level: 0,
				isFolder: null,
			},
			{
				title: 'B',
				selectedTitle: null,
				icon: null,
				selectedIcon: null,
				url: null,
				name: 'itemB',
				level: 0,
				isFolder: null,
			},
		]);

		const decodedTree = decodedComp?.listChildren().find((child) => child.getId() === 'tree01') as ReturnType<Document['createGTree']>;
		t.truthy(decodedTree, 'tree child exists');
		t.is(decodedTree.getCustomData(), 'tree-custom');
		t.is(decodedTree.getDefaultItem(), 'ui://listpkg/treeItem');
		t.is(decodedTree.getOverflow(), 2);
		t.is(decodedTree.getScrollType(), 1);
		t.is(decodedTree.getScrollBarFlags(), 7);
		t.deepEqual(decodedTree.getScrollBarMargin(), { top: 2, bottom: 3, left: 4, right: 5 });
		t.is(decodedTree.getVtScrollBarRes(), 'ui://listpkg/treeVBar');
		t.is(decodedTree.getHeaderRes(), 'ui://listpkg/treeHeader');
		t.deepEqual(decodedTree.getClipSoftness(), { x: 11, y: 12 });
		t.true(decodedTree.getScrollItemToViewOnClick());
		t.false(decodedTree.getFoldInvisibleItems());
		t.is(decodedTree.getIndent(), 15);
		t.is(decodedTree.getClickToExpand(), 2);
		t.deepEqual(decodedTree.getListItems(), [
			{
				title: 'Folder 1',
				selectedTitle: null,
				icon: null,
				selectedIcon: null,
				url: null,
				name: 'folder1',
				level: 0,
				isFolder: true,
			},
			{
				title: 'Leaf 1',
				selectedTitle: null,
				icon: 'ui://listpkg/leaf',
				selectedIcon: null,
				url: 'ui://listpkg/treeLeaf',
				name: 'leaf1',
				level: 1,
				isFolder: false,
			},
		]);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: component structured objects round-trip into formal models', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('StructuredPkg');
	pkg.setId('structpkg');

	const comp = doc.createComponent('StructuredHost');
	comp
		.setId('structured01')
		.setSize(400, 240);

	const state = doc.createController('state');
	state
		.setAutoRadioGroupDepth(true);

	const pageIdle = doc.createControllerPage('Idle');
	pageIdle.setId('p_idle');
	const pageActive = doc.createControllerPage('Active');
	pageActive.setId('p_active');
	state.addPage(pageIdle);
	state.addPage(pageActive);

	const action = doc.createControllerAction('stateAction');
	action
		.setActionType(1)
		.setFromPage(['p_idle'])
		.setToPage(['p_active'])
		.setObjectId('bg01')
		.setControllerName('state')
		.setTargetPage('p_idle');
	state.addAction(action);

	const playAction = doc.createControllerAction('playAppear');
	playAction
		.setActionType(0)
		.setFromPage(['p_active'])
		.setToPage(['p_idle'])
		.setTransitionName('appear')
		.setPlayTimes(3)
		.setDelay(0.5)
		.setStopOnExit(true);
	state.addAction(playAction);
	comp.addController(state);

	const bg = doc.createGImage('bg');
	bg
		.setId('bg01')
		.setSrc('ui://structpkg/bg')
		.setXY(20, 30)
		.setSize(160, 90);
	comp.addChild(bg);

	const title = doc.createGTextField('title');
	title
		.setId('title01')
		.setXY(48, 64)
		.setText('Ready');
	comp.addChild(title);

	comp.addRelation({ target: 'title01', type: 0, usePercent: false });
	bg.addRelation({ target: 'title01', type: 14, usePercent: true });

	const gear = doc.createGear('bgXY');
	gear
		.setGearType(1)
		.setController(state)
		.setPages('p_idle,p_active')
		.setValues('10,20,0.1,0.2|30,40,0.3,0.4')
		.setDefaultValue('0,0,0.5,0.6')
		.setTween(true)
		.setEaseType(6)
		.setTweenDuration(0.8)
		.setTweenDelay(0.1)
		.setPositionsInPercent(true);
	bg.addGear(gear);

	const transition = doc.createTransition('appear');
	transition
		.setAutoPlay(true)
		.setAutoPlayTimes(2)
		.setAutoPlayDelay(0.25);

	const move = doc.createTransitionItem('move');
	move
		.setActionType(0)
		.setTime(12)
		.setTargetId('bg01')
		.setLabel('start')
		.setTween(true)
		.setDuration(24)
		.setEaseType(5)
		.setRepeat(1)
		.setYoyo(false)
		.setEndLabel('finish')
		.setStartValue(['0', '0'])
		.setEndValue(['100', '50'])
		.setPath('0,10,20');
	transition.addItem(move);

	const sound = doc.createTransitionItem('sound');
	sound
		.setActionType(9)
		.setTime(6)
		.setTween(false)
		.setStartValue(['ui://structpkg/click', '80']);
	transition.addItem(sound);
	comp.addTransition(transition);

	pkg.addResource(comp);

	const io = new NodeIO();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-bw-'));
	const outPath = path.join(tmpDir, 'component_structured_objects.bytes');

	try {
		await io.writeBinary(doc, outPath);
		const roundTripped = await io.readBinary(outPath);
		const decoded = roundTripped.getRoot().getPackage('StructuredPkg')?.getComponent('StructuredHost');
		t.truthy(decoded, 'round-tripped component exists');

		const controllers = decoded?.listControllers() ?? [];
		t.is(controllers.length, 1);
		t.is(controllers[0]?.getName(), 'state');
		t.true(controllers[0]?.getAutoRadioGroupDepth() ?? false);
		t.deepEqual(
			controllers[0]?.listPages().map((page) => ({ id: page.getId(), name: page.getName() })),
			[
				{ id: 'p_idle', name: 'Idle' },
				{ id: 'p_active', name: 'Active' },
			],
		);
		t.deepEqual(
			controllers[0]?.listActions().map((item) => ({
				actionType: item.getActionType(),
				fromPage: item.getFromPage(),
				toPage: item.getToPage(),
				objectId: item.getObjectId(),
				controllerName: item.getControllerName(),
				targetPage: item.getTargetPage(),
				transitionName: item.getTransitionName(),
				playTimes: item.getPlayTimes(),
				delay: item.getDelay(),
				stopOnExit: item.getStopOnExit(),
			})),
			[
				{
					actionType: 1,
					fromPage: ['p_idle'],
					toPage: ['p_active'],
					objectId: 'bg01',
					controllerName: 'state',
					targetPage: 'p_idle',
					transitionName: '',
					playTimes: 1,
					delay: 0,
					stopOnExit: false,
				},
				{
					actionType: 0,
					fromPage: ['p_active'],
					toPage: ['p_idle'],
					objectId: '',
					controllerName: '',
					targetPage: '',
					transitionName: 'appear',
					playTimes: 3,
					delay: 0.5,
					stopOnExit: true,
				},
			],
		);

		t.deepEqual(decoded?.getRelations(), [{ target: 'title01', type: 0, usePercent: false }]);

		const decodedBg = decoded?.listChildren().find((child) => child.getId() === 'bg01') as any;
		t.truthy(decodedBg, 'child image exists');
		t.deepEqual(decodedBg.getRelations(), [{ target: 'title01', type: 14, usePercent: true }]);
		t.is(decodedBg.listGears().length, 1);
		const decodedGear = decodedBg.listGears()[0];
		t.is(decodedGear.getGearType(), 1);
		t.is(decodedGear.getController()?.getName(), 'state');
		t.is(decodedGear.getPages(), 'p_idle,p_active');
		t.is(decodedGear.getValues(), '10,20,0.1,0.2|30,40,0.3,0.4');
		t.is(decodedGear.getDefaultValue(), '0,0,0.5,0.6');
		t.true(decodedGear.getTween());
		t.is(decodedGear.getEaseType(), 6);
		t.true(decodedGear.getPositionsInPercent());

		const transitions = decoded?.listTransitions() ?? [];
		t.is(transitions.length, 1);
		t.is(transitions[0]?.getName(), 'appear');
		t.true(transitions[0]?.getAutoPlay() ?? false);
		t.is(transitions[0]?.getAutoPlayTimes(), 2);
		t.true(Math.abs((transitions[0]?.getAutoPlayDelay() ?? 0) - 0.25) < 1e-6);
		t.is(transitions[0]?.listItems().length, 2);
		t.deepEqual(
			transitions[0]?.listItems().map((item) => ({
				actionType: item.getActionType(),
				targetId: item.getTargetId(),
				tween: item.getTween(),
				startValue: item.getStartValue(),
				endValue: item.getEndValue(),
				label: item.getLabel(),
			})),
			[
				{
					actionType: 0,
					targetId: 'bg01',
					tween: true,
					startValue: ['0', '0'],
					endValue: ['100', '50'],
					label: 'start',
				},
				{
					actionType: 9,
					targetId: '',
					tween: false,
					startValue: ['ui://structpkg/click', '80'],
					endValue: [],
					label: '',
				},
			],
		);
		t.is(transitions[0]?.listItems()[0]?.getEndLabel(), 'finish');
		t.is(transitions[0]?.listItems()[0]?.getPath(), '0,10,20');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
