import test from 'ava';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO, TransitionActionType } from '../src/index.js';

const NULL_STRING_INDEX = 0xfffe;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_PATH = path.resolve(
	__dirname,
	'../../../referer/UIProject/FairyGUI-Unity-Examples/FairyGUI-Unity-Examples.fairy',
);

function readUtfString(view: DataView, state: { pos: number }): string {
	const len = view.getUint16(state.pos, false);
	state.pos += 2;
	const bytes = new Uint8Array(view.buffer, view.byteOffset + state.pos, len);
	state.pos += len;
	return new TextDecoder('utf-8').decode(bytes);
}

function readBlockOffsets(bytes: Uint8Array): number[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const state = { pos: 0 };

	state.pos += 4; // magic
	state.pos += 4; // version
	state.pos += 1; // compressed
	readUtfString(view, state); // packageId
	readUtfString(view, state); // packageName
	state.pos += 20; // reserved

	const indexTablePos = state.pos;
	const segCount = view.getUint8(state.pos++);
	const useShort = view.getUint8(state.pos++);
	const offsets: number[] = [];
	for (let i = 0; i < segCount; i++) {
		offsets.push(
			useShort === 1
				? view.getUint16(state.pos + i * 2, false)
				: view.getUint32(state.pos + i * 4, false),
		);
	}

	return offsets.map((offset) => (offset > 0 ? indexTablePos + offset : 0));
}

function readStringTable(bytes: Uint8Array, block4Offset: number): string[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const values: string[] = [];
	let pos = block4Offset;
	const count = view.getInt32(pos, false);
	pos += 4;
	for (let i = 0; i < count; i++) {
		const byteLength = view.getUint16(pos, false);
		pos += 2;
		const raw = new Uint8Array(bytes.buffer, bytes.byteOffset + pos, byteLength);
		values.push(new TextDecoder('utf-8').decode(raw));
		pos += byteLength;
	}
	return values;
}

function readBlock5(bytes: Uint8Array, block5Offset: number): Array<{ index: number; value: string }> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const values: Array<{ index: number; value: string }> = [];
	let pos = block5Offset;
	const count = view.getInt32(pos, false);
	pos += 4;
	for (let i = 0; i < count; i++) {
		const index = view.getUint16(pos, false);
		pos += 2;
		const byteLength = view.getInt32(pos, false);
		pos += 4;
		const raw = new Uint8Array(bytes.buffer, bytes.byteOffset + pos, byteLength);
		values.push({ index, value: new TextDecoder('utf-8').decode(raw) });
		pos += byteLength;
	}
	return values;
}

function getComponentRawBinary(doc: Document, packageName: string, componentName: string): Uint8Array {
	const pkg = doc.getRoot().listPackages().find((item) => item.getName() === packageName);
	if (!pkg) throw new Error(`Package not found: ${packageName}`);
	const comp = pkg.listResources().find((item) => item.propertyType === 'Component' && item.getName() === componentName);
	if (!comp) throw new Error(`Component not found: ${componentName}`);
	const raw = (comp.getExtras() as { _rawBinary?: { buffer: ArrayBufferLike; byteOffset: number; byteLength: number } })._rawBinary;
	if (!raw) throw new Error(`Component raw binary missing: ${componentName}`);
	return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
}

function readStringIndex(view: DataView, state: { pos: number }): number {
	const value = view.getUint16(state.pos, false);
	state.pos += 2;
	return value;
}

function readVersion(bytes: Uint8Array): number {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return view.getInt32(4, false);
}

function readListItemLengths(raw: Uint8Array, childIndex: number): number[] {
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
	const block2Offset = view.getUint32(2 + 4 * 2, false);
	let pos = block2Offset;
	const childCount = view.getInt16(pos, false);
	pos += 2;

	for (let i = 0; i < childCount; i++) {
		const dataLen = view.getUint16(pos, false);
		pos += 2;
		const childPos = pos;
		if (i === childIndex) {
			const block8Offset = view.getUint16(childPos + 2 + 2 * 8, false);
			const state = { pos: childPos + block8Offset };
			readStringIndex(view, state); // defaultItem
			const itemCount = view.getInt16(state.pos, false);
			state.pos += 2;
			const lengths: number[] = [];
			for (let j = 0; j < itemCount; j++) {
				const itemLen = view.getUint16(state.pos, false);
				state.pos += 2 + itemLen;
				lengths.push(itemLen);
			}
			return lengths;
		}
		pos = childPos + dataLen;
	}

	throw new Error(`Child index out of range: ${childIndex}`);
}

function readTextChildLayouts(raw: Uint8Array): Array<{ type: number; dataLen: number; block5Len: number }> {
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
	const block2Offset = view.getUint32(2 + 4 * 2, false);
	let pos = block2Offset;
	const childCount = view.getInt16(pos, false);
	pos += 2;

	const layouts: Array<{ type: number; dataLen: number; block5Len: number }> = [];
	for (let i = 0; i < childCount; i++) {
		const dataLen = view.getUint16(pos, false);
		pos += 2;
		const childPos = pos;
		const block0Offset = view.getUint16(childPos + 2, false);
		const block5Offset = view.getUint16(childPos + 2 + 2 * 5, false);
		const objectType = view.getUint8(childPos + block0Offset);

		if (objectType === 6 || objectType === 7 || objectType === 8) {
			layouts.push({
				type: objectType,
				dataLen,
				block5Len: block5Offset > 0 ? dataLen - block5Offset : 0,
			});
		}

		pos = childPos + dataLen;
	}

	return layouts;
}

function readListScrollPaneResourceIndexes(
	raw: Uint8Array,
	stringTable: string[],
	childName: string,
): {
	vtIndex: number;
	hzIndex: number;
	headerIndex: number;
	footerIndex: number;
} {
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
	const block2Offset = view.getUint32(2 + 4 * 2, false);
	let pos = block2Offset;
	const childCount = view.getInt16(pos, false);
	pos += 2;

	for (let i = 0; i < childCount; i++) {
		const dataLen = view.getUint16(pos, false);
		pos += 2;
		const childPos = pos;

		const block0Offset = view.getUint16(childPos + 2, false);
		const block7Offset = view.getUint16(childPos + 2 + 2 * 7, false);
		if (block7Offset === 0) {
			pos = childPos + dataLen;
			continue;
		}

		const block0State = { pos: childPos + block0Offset };
		block0State.pos += 1; // objectType
		readStringIndex(view, block0State); // src
		readStringIndex(view, block0State); // pkgId
		readStringIndex(view, block0State); // id
		const nameIndex = readStringIndex(view, block0State);
		const currentName = stringTable[nameIndex];
		if (currentName !== childName) {
			pos = childPos + dataLen;
			continue;
		}

		const state = { pos: childPos + block7Offset };
		state.pos += 1; // scrollType
		state.pos += 1; // scrollBarDisplay
		state.pos += 4; // scrollBarFlags
		const hasMargin = view.getUint8(state.pos++) !== 0;
		if (hasMargin) state.pos += 16;

		return {
			vtIndex: readStringIndex(view, state),
			hzIndex: readStringIndex(view, state),
			headerIndex: readStringIndex(view, state),
			footerIndex: readStringIndex(view, state),
		};
	}

	throw new Error(`List child not found: ${childName}`);
}

function readTextInputBlock4(
	raw: Uint8Array,
	stringTable: string[],
	childName: string,
): {
	promptIndex: number;
	restrictIndex: number;
	maxLength: number;
	keyboardType: number;
	password: boolean;
} {
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
	const block2Offset = view.getUint32(2 + 4 * 2, false);
	let pos = block2Offset;
	const childCount = view.getInt16(pos, false);
	pos += 2;

	for (let i = 0; i < childCount; i++) {
		const dataLen = view.getUint16(pos, false);
		pos += 2;
		const childPos = pos;

		const block0Offset = view.getUint16(childPos + 2, false);
		const block4Offset = view.getUint16(childPos + 2 + 2 * 4, false);
		if (block4Offset === 0) {
			pos = childPos + dataLen;
			continue;
		}

		const block0State = { pos: childPos + block0Offset };
		block0State.pos += 1; // objectType
		readStringIndex(view, block0State); // src
		readStringIndex(view, block0State); // pkgId
		readStringIndex(view, block0State); // id
		const nameIndex = readStringIndex(view, block0State);
		if (stringTable[nameIndex] !== childName) {
			pos = childPos + dataLen;
			continue;
		}

		const state = { pos: childPos + block4Offset };
		return {
			promptIndex: readStringIndex(view, state),
			restrictIndex: readStringIndex(view, state),
			maxLength: view.getInt32(state.pos, false),
			keyboardType: view.getInt32(state.pos + 4, false),
			password: view.getUint8(state.pos + 8) !== 0,
		};
	}

	throw new Error(`Text input child not found: ${childName}`);
}

function readChildRelationTargets(
	raw: Uint8Array,
	stringTable: string[],
	childId: string,
): number[] {
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
	const block2Offset = view.getUint32(2 + 4 * 2, false);
	let pos = block2Offset;
	const childCount = view.getInt16(pos, false);
	pos += 2;

	for (let i = 0; i < childCount; i++) {
		const dataLen = view.getUint16(pos, false);
		pos += 2;
		const childPos = pos;
		const block0Offset = view.getUint16(childPos + 2, false);
		const block3Offset = view.getUint16(childPos + 2 + 2 * 3, false);

		const block0State = { pos: childPos + block0Offset };
		block0State.pos += 1;
		readStringIndex(view, block0State);
		readStringIndex(view, block0State);
		const idIndex = readStringIndex(view, block0State);
		readStringIndex(view, block0State);
		if (stringTable[idIndex] !== childId) {
			pos = childPos + dataLen;
			continue;
		}

		const relationTargets: number[] = [];
		const state = { pos: childPos + block3Offset };
		const relationCount = view.getUint8(state.pos++);
		for (let j = 0; j < relationCount; j++) {
			const targetIndex = view.getInt16(state.pos, false);
			state.pos += 2;
			relationTargets.push(targetIndex);
			const pairCount = view.getUint8(state.pos++);
			state.pos += pairCount * 2;
		}
		return relationTargets;
	}

	throw new Error(`Relation child not found: ${childId}`);
}

function readComponentRelationTargets(raw: Uint8Array): number[] {
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
	const block3Offset = view.getUint32(2 + 4 * 3, false);
	const state = { pos: block3Offset };
	const relationTargets: number[] = [];
	const relationCount = view.getUint8(state.pos++);
	for (let i = 0; i < relationCount; i++) {
		const targetIndex = view.getInt16(state.pos, false);
		state.pos += 2;
		relationTargets.push(targetIndex);
		const pairCount = view.getUint8(state.pos++);
		state.pos += pairCount * 2;
	}
	return relationTargets;
}

function readComponentRawLengths(bytes: Uint8Array): Array<{ id: string | null; name: string | null; rawLen: number }> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const state = { pos: 0 };
	state.pos += 4; // magic
	state.pos += 4; // version
	state.pos += 1; // compressed
	readUtfString(view, state); // packageId
	readUtfString(view, state); // packageName
	state.pos += 20; // reserved

	const indexTablePos = state.pos;
	state.pos += 2; // segCount + useShort
	const offsets: number[] = [];
	for (let i = 0; i < 6; i++) offsets.push(view.getUint32(state.pos + i * 4, false));

	const stringTable = readStringTable(bytes, indexTablePos + offsets[4]);
	let pos = indexTablePos + offsets[1];
	const itemCount = view.getUint16(pos, false);
	pos += 2;

	const items: Array<{ id: string | null; name: string | null; rawLen: number }> = [];
	for (let i = 0; i < itemCount; i++) {
		const chunkLen = view.getInt32(pos, false);
		pos += 4;
		const itemEnd = pos + chunkLen;
		const type = view.getUint8(pos++);
		const idIndex = view.getUint16(pos, false);
		pos += 2;
		const nameIndex = view.getUint16(pos, false);
		pos += 2;
		pos += 2; // path
		pos += 2; // file
		pos += 1; // exported
		pos += 4; // width
		pos += 4; // height

		if (type === 3) {
			pos += 1; // ext
			const rawLen = view.getInt32(pos, false);
			pos += 4;
			items.push({
				id: stringTable[idIndex] ?? null,
				name: stringTable[nameIndex] ?? null,
				rawLen,
			});
		}

		pos = itemEnd;
	}

	return items;
}

function readChildSummaries(raw: Uint8Array): Array<{ type: number; dataLen: number; groupId: number }> {
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
	const block2Offset = view.getUint32(2 + 4 * 2, false);
	let pos = block2Offset;
	const childCount = view.getInt16(pos, false);
	pos += 2;

	const children: Array<{ type: number; dataLen: number; groupId: number }> = [];
	for (let i = 0; i < childCount; i++) {
		const dataLen = view.getUint16(pos, false);
		pos += 2;
		const childPos = pos;
		const block0Offset = view.getUint16(childPos + 2, false);
		const block1Offset = view.getUint16(childPos + 4, false);
		const objectType = view.getUint8(childPos + block0Offset);
		const groupId = view.getInt16(childPos + block1Offset + 2, false);
		children.push({ type: objectType, dataLen, groupId });
		pos = childPos + dataLen;
	}

	return children;
}

function readPathData(view: DataView, state: { pos: number }): Array<{ curveType: number; values: number[] }> {
	const count = view.getInt32(state.pos, false);
	state.pos += 4;
	const points: Array<{ curveType: number; values: number[] }> = [];
	for (let i = 0; i < count; i++) {
		const curveType = view.getUint8(state.pos++);
		const valueCount = curveType === 1 ? 4 : curveType === 2 ? 6 : 2;
		const values: number[] = [];
		for (let j = 0; j < valueCount; j++) {
			values.push(view.getFloat32(state.pos, false));
			state.pos += 4;
		}
		points.push({ curveType, values });
	}
	return points;
}

test('binary writer: writes no-cache UI strings into the main string table', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-custom').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('CustomStringsPkg');
	pkg.setId('pkgcustom');

	const comp = doc.createComponent('Host');
	comp.setId('comp001');
	comp.setPath('/');
	comp.setSize(200, 100);
	comp.setCustomData('host-custom-data');

	const text = doc.createGTextField('label');
	text.setId('n0');
	text.setText('same text');
	text.setTooltips('same text');

	comp.addChild(text);
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-custom-strings-'));
	const outPath = path.join(tmpDir, 'out.fui');

	try {
		const io = new NodeIO();
		await io.writeBinary(doc, outPath, { compressed: false });

		const bytes = await fs.readFile(outPath);
		t.is(readVersion(bytes), 7, 'default binary header version is 7');
		const offsets = readBlockOffsets(bytes);
		t.is(offsets[5], 0, 'block 5 custom strings remains empty');
		const stringTable = readStringTable(bytes, offsets[4]);
		t.true(stringTable.includes('host-custom-data'), 'component customData is emitted into block 4');
		t.true(stringTable.includes('same text'), 'no-cache child text is emitted into block 4');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: writes overflow strings into block 5 patches', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-long').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('LongStringsPkg');
	pkg.setId('pkglong');

	const comp = doc.createComponent('Host');
	comp.setId('comp001');
	comp.setPath('/');
	comp.setSize(200, 100);
	comp.setCustomData('a'.repeat(70000));
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-long-strings-'));
	const outPath = path.join(tmpDir, 'out.fui');

	try {
		const io = new NodeIO();
		await io.writeBinary(doc, outPath, { compressed: false });

		const bytes = await fs.readFile(outPath);
		t.is(readVersion(bytes), 7, 'default binary header version is 7');
		const offsets = readBlockOffsets(bytes);
		t.true(offsets[5] > 0, 'block 5 is emitted when a string exceeds uint16 UTF length');

		const stringTable = readStringTable(bytes, offsets[4]);
		const block5Entries = readBlock5(bytes, offsets[5]);
		t.true(block5Entries.length > 0, 'block 5 contains long string patches');

		const patch = block5Entries.find((entry) => entry.value.length === 70000);
		t.truthy(patch, 'the long customData string is stored in block 5');
		t.is(stringTable[patch!.index], '', 'block 4 keeps an empty placeholder for the patched string');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: emits editor-aligned child object types for text input components', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject('E:/Coding/OpenFairyGUI/referer/UIProject/FairyGUI-Unity-Examples/FairyGUI-Unity-Examples.fairy');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-input-object-type-'));
	const outPath = path.join(tmpDir, 'Basics_fui.bytes');

	try {
		await io.writeBinary(doc, outPath, { compressed: false, packageIndex: 1 });
		const written = await io.readBinary(outPath);
		const raw = getComponentRawBinary(written, 'Basics', 'Demo_Text');
		const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

		const segCount = view.getUint8(0);
		t.is(segCount, 8);
		const useShort = view.getUint8(1);
		t.is(useShort, 0);
		const block2Offset = view.getUint32(2 + 4 * 2, false);
		let pos = block2Offset;
		const childCount = view.getInt16(pos, false);
		pos += 2;

		let foundInput = false;
		for (let i = 0; i < childCount; i++) {
			const dataLen = view.getUint16(pos, false);
			pos += 2;
			const childPos = pos;
			const childSegCount = view.getUint8(childPos);
			const childUseShort = view.getUint8(childPos + 1);
			t.is(childUseShort, 1);
			const childBlock0Offset = view.getUint16(childPos + 2, false);
			const childBlock4Offset = view.getUint16(childPos + 2 + 2 * 4, false);

			const state = { pos: childPos + childBlock0Offset };
			const objectType = view.getUint8(state.pos++);
			readStringIndex(view, state); // src
			readStringIndex(view, state); // pkgId
			const _idIndex = readStringIndex(view, state);
			const nameIndex = readStringIndex(view, state);

			const bytes = await fs.readFile(outPath);
			const stringTable = readStringTable(bytes, readBlockOffsets(bytes)[4]);
			const name = stringTable[nameIndex];
			if (name === 'n22') {
				foundInput = true;
				t.is(objectType, 8, 'GTextInput must use Unity InputText object type');
				t.true(childSegCount >= 7);
				t.true(childBlock4Offset > 0, 'GTextInput must have block 4 data for prompt/restrict');
				const block4State = { pos: childPos + childBlock4Offset };
				const promptIndex = readStringIndex(view, block4State);
				t.true(promptIndex >= 0 && promptIndex < stringTable.length);
				t.is(stringTable[promptIndex], '[i][color=#999999]Your Name Here[/color][/i]');
			}

			pos = childPos + dataLen;
		}

		t.true(foundInput, 'should find Demo_Text input child n22');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: emits version 7 list item property override placeholders', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject('E:/Coding/OpenFairyGUI/referer/UIProject/FairyGUI-Unity-Examples/FairyGUI-Unity-Examples.fairy');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-list-items-'));
	const outPath = path.join(tmpDir, 'Basics_fui.bytes');

	try {
		await io.writeBinary(doc, outPath, { compressed: false, packageIndex: 1 });
		const written = await io.readBinary(outPath);
		const demoListRaw = getComponentRawBinary(written, 'Basics', 'Demo_List');
		const demoGridRaw = getComponentRawBinary(written, 'Basics', 'Demo_Grid');

		t.deepEqual(readListItemLengths(demoListRaw, 0), [16, 16, 16, 16, 16, 16]);
		t.deepEqual(readListItemLengths(demoGridRaw, 2), [16, 16, 16, 16]);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: matches Basics text child layouts from editor baseline', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject('E:/Coding/OpenFairyGUI/referer/UIProject/FairyGUI-Unity-Examples/FairyGUI-Unity-Examples.fairy');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-text-layouts-'));
	const outPath = path.join(tmpDir, 'Basics_fui.bytes');

	try {
		await io.writeBinary(doc, outPath, { compressed: false, packageIndex: 1 });
		const written = await io.readBinary(outPath);

		t.deepEqual(readTextChildLayouts(getComponentRawBinary(written, 'Basics', 'Button')), [
			{ type: 6, dataLen: 113, block5Len: 38 },
		]);
		t.deepEqual(readTextChildLayouts(getComponentRawBinary(written, 'Basics', 'Button10')), [
			{ type: 6, dataLen: 121, block5Len: 46 },
		]);
		t.deepEqual(readTextChildLayouts(getComponentRawBinary(written, 'Basics', 'Demo_Text')), [
			{ type: 6, dataLen: 106, block5Len: 38 },
			{ type: 6, dataLen: 106, block5Len: 38 },
			{ type: 6, dataLen: 106, block5Len: 38 },
			{ type: 6, dataLen: 114, block5Len: 46 },
			{ type: 6, dataLen: 106, block5Len: 38 },
			{ type: 6, dataLen: 106, block5Len: 38 },
			{ type: 6, dataLen: 106, block5Len: 38 },
			{ type: 6, dataLen: 106, block5Len: 38 },
			{ type: 6, dataLen: 106, block5Len: 38 },
			{ type: 7, dataLen: 106, block5Len: 38 },
			{ type: 6, dataLen: 106, block5Len: 38 },
			{ type: 6, dataLen: 106, block5Len: 38 },
			{ type: 6, dataLen: 114, block5Len: 46 },
			{ type: 6, dataLen: 106, block5Len: 38 },
			{ type: 8, dataLen: 119, block5Len: 38 },
			{ type: 6, dataLen: 106, block5Len: 38 },
			{ type: 6, dataLen: 106, block5Len: 38 },
			{ type: 6, dataLen: 114, block5Len: 46 },
			{ type: 6, dataLen: 114, block5Len: 46 },
			{ type: 6, dataLen: 126, block5Len: 58 },
		]);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: exports only advanced groups and preserves child group ids', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-groups').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('GroupPkg');
	pkg.setId('pkggroup');

	const comp = doc.createComponent('Host');
	comp.setId('comp001');
	comp.setPath('/');
	comp.setSize(300, 200);

	const hiddenGroup = doc.createGGroup('hidden');
	hiddenGroup.setId('g0');

	const advancedGroup = doc.createGGroup('advanced');
	advancedGroup.setId('g1');
	advancedGroup.setAdvanced(true);

	const hiddenText = doc.createGTextField('hiddenText');
	hiddenText.setId('n0');
	hiddenText.setText('hidden');
	hiddenText.setGroup('g0');

	const advancedText = doc.createGTextField('advancedText');
	advancedText.setId('n1');
	advancedText.setText('advanced');
	advancedText.setGroup('g1');

	comp.addChild(hiddenGroup);
	comp.addChild(hiddenText);
	comp.addChild(advancedGroup);
	comp.addChild(advancedText);
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-groups-'));
	const outPath = path.join(tmpDir, 'out.fui');

	try {
		const io = new NodeIO();
		await io.writeBinary(doc, outPath, { compressed: false, version: 7 });
		const written = await io.readBinary(outPath);
		const children = readChildSummaries(getComponentRawBinary(written, 'GroupPkg', 'Host'));

		t.deepEqual(children, [
			{ type: 6, dataLen: 98, groupId: -1 },
			{ type: 5, dataLen: 73, groupId: -1 },
			{ type: 6, dataLen: 98, groupId: 1 },
		]);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: emits version 7 text and loader extension fields', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-v7').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Version7Pkg');
	pkg.setId('pkgv7');

	const comp = doc.createComponent('Host');
	comp.setId('comp001');
	comp.setPath('/');
	comp.setSize(200, 100);

	const text = doc.createGTextField('plain');
	text.setId('n0');
	text.setText('hello');
	text.setStrikethrough(true);
	text.setStrokeColor('');
	text.setShadowColor('');

	const loader = doc.createGLoader('loader');
	loader.setId('n1');
	loader.setUrl('ui://pkgv7/demo');
	loader.setUseResize(true);

	comp.addChild(text);
	comp.addChild(loader);
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-version7-'));
	const outPath = path.join(tmpDir, 'out.fui');

	try {
		const io = new NodeIO();
		await io.writeBinary(doc, outPath, { compressed: false, version: 7 });

		const bytes = await fs.readFile(outPath);
		t.is(readVersion(bytes), 7, 'binary header version is 7');

		const written = await io.readBinary(outPath);
		const raw = getComponentRawBinary(written, 'Version7Pkg', 'Host');
		const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
		const stringTable = readStringTable(bytes, readBlockOffsets(bytes)[4]);

		const block2Offset = view.getUint32(2 + 4 * 2, false);
		let pos = block2Offset;
		const childCount = view.getInt16(pos, false);
		pos += 2;

		let sawText = false;
		let sawLoader = false;

		for (let i = 0; i < childCount; i++) {
			const dataLen = view.getUint16(pos, false);
			pos += 2;
			const childPos = pos;
			const block0Offset = view.getUint16(childPos + 2, false);
			const block5Offset = view.getUint16(childPos + 2 + 2 * 5, false);
			const block0State = { pos: childPos + block0Offset };

			block0State.pos += 1; // objectType
			readStringIndex(view, block0State); // src
			readStringIndex(view, block0State); // pkgId
			const idIndex = readStringIndex(view, block0State);
			readStringIndex(view, block0State); // name
			const id = stringTable[idIndex];

			if (id === 'n0') {
				sawText = true;
				const state = { pos: childPos + block5Offset };
				state.pos += 2; // font
				state.pos += 2; // fontSize
				state.pos += 4; // color
				state.pos += 1; // align
				state.pos += 1; // vAlign
				state.pos += 2; // leading
				state.pos += 2; // letterSpacing
				state.pos += 1; // ubb
				state.pos += 1; // autoSize
				state.pos += 1; // underline
				state.pos += 1; // italic
				state.pos += 1; // bold
				state.pos += 1; // singleLine
				t.false(view.getUint8(state.pos++) !== 0, 'text has no stroke payload in test fixture');
				t.false(view.getUint8(state.pos++) !== 0, 'text has no shadow payload in test fixture');
				t.false(view.getUint8(state.pos++) !== 0, 'text has no template vars in test fixture');
				t.true(view.getUint8(state.pos++) !== 0, 'version 7 text block writes strikethrough');
				t.is(view.getFloat32(state.pos, false), 0, 'TMP placeholder 1 is zero');
				state.pos += 4;
				t.is(view.getFloat32(state.pos, false), 0, 'TMP placeholder 2 is zero');
				state.pos += 4;
				t.is(view.getFloat32(state.pos, false), 0, 'TMP placeholder 3 is zero');
			}

			if (id === 'n1') {
				sawLoader = true;
				const state = { pos: childPos + block5Offset };
				readStringIndex(view, state); // url
				state.pos += 1; // align
				state.pos += 1; // vAlign
				state.pos += 1; // fill
				state.pos += 1; // shrinkOnly
				state.pos += 1; // autoSize
				state.pos += 1; // showErrorSign
				state.pos += 1; // playing
				state.pos += 4; // frame
				t.false(view.getUint8(state.pos++) !== 0, 'loader has no color payload in test fixture');
				t.is(view.getUint8(state.pos++), 0, 'loader fillMethod is none in test fixture');
				t.true(view.getUint8(state.pos++) !== 0, 'version 7 loader block writes useResize');
			}

			pos = childPos + dataLen;
		}

		t.true(sawText, 'should find text child');
		t.true(sawLoader, 'should find loader child');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: emits editor-aligned empty graph payloads', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-graph').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('GraphPkg');
	pkg.setId('pkggraph');

	const comp = doc.createComponent('Host');
	comp.setId('comp001');
	comp.setPath('/');
	comp.setSize(200, 100);

	const graph = doc.createGGraph('placeholder');
	graph.setId('n0');
	graph.setLineSize(1);
	graph.setLineColor('#000000');
	graph.setFillColor('#ffffff');

	comp.addChild(graph);
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-empty-graph-'));
	const outPath = path.join(tmpDir, 'out.fui');

	try {
		const io = new NodeIO();
		await io.writeBinary(doc, outPath, { compressed: false, version: 7 });

		const written = await io.readBinary(outPath);
		const raw = getComponentRawBinary(written, 'GraphPkg', 'Host');
		const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
		const block2Offset = view.getUint32(2 + 4 * 2, false);
		let pos = block2Offset + 2;
		const dataLen = view.getUint16(pos, false);
		pos += 2;
		const childPos = pos;
		const block5Offset = view.getUint16(childPos + 2 + 2 * 5, false);
		const block6Offset = view.getUint16(childPos + 2 + 2 * 6, false);

		t.is(dataLen, block6Offset, 'empty graph has no afterAdd block');
		t.is(block6Offset - block5Offset, 13, 'empty graph emits 13-byte editor-aligned payload');

		const state = { pos: childPos + block5Offset };
		t.is(view.getInt32(state.pos, false), 1, 'payload starts with default lineSize');
		state.pos += 4;
		t.deepEqual(
			[
				view.getUint8(state.pos),
				view.getUint8(state.pos + 1),
				view.getUint8(state.pos + 2),
				view.getUint8(state.pos + 3),
			],
			[0, 0, 0, 255],
			'payload carries default lineColor',
		);
		state.pos += 4;
		t.deepEqual(
			[
				view.getUint8(state.pos),
				view.getUint8(state.pos + 1),
				view.getUint8(state.pos + 2),
				view.getUint8(state.pos + 3),
			],
			[255, 255, 255, 255],
			'payload carries default fillColor',
		);
		state.pos += 4;
		t.false(view.getUint8(state.pos) !== 0, 'payload keeps roundedRect=false');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: emits version 5 component and extension sound fields', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-v5').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Version5Pkg');
	pkg.setId('pkgv5');

	const comp = doc.createComponent('Host');
	comp.setId('comp001');
	comp.setPath('/');
	comp.setSize(320, 200);
	comp.setAddedToStageSound('ui://pkgv5/add');
	comp.setRemovedFromStageSound('ui://pkgv5/remove');

	const label = doc.createGLabel('label');
	label.setId('n0');
	label.setTitle('Label');
	label.setSound('ui://pkgv5/label');
	label.setSoundVolumeScale(0.25);

	const combo = doc.createGComboBox('combo');
	combo.setId('n1');
	combo.setItems(['A']);
	combo.setValues(['1']);
	combo.setTitle('A');
	combo.setVisibleItemCount(7);
	combo.setSound('ui://pkgv5/combo');
	combo.setSoundVolumeScale(0.5);

	const progress = doc.createGProgressBar('progress');
	progress.setId('n2');
	progress.setValue(10);
	progress.setMax(100);
	progress.setMin(1);
	progress.setSound('ui://pkgv5/progress');
	progress.setSoundVolumeScale(0.75);

	comp.addChild(label);
	comp.addChild(combo);
	comp.addChild(progress);
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-version5-'));
	const outPath = path.join(tmpDir, 'out.fui');

	try {
		const io = new NodeIO();
		await io.writeBinary(doc, outPath, { compressed: false, version: 5 });

		const bytes = await fs.readFile(outPath);
		t.is(readVersion(bytes), 5, 'binary header version is 5');

		const stringTable = readStringTable(bytes, readBlockOffsets(bytes)[4]);
		const written = await io.readBinary(outPath);
		const raw = getComponentRawBinary(written, 'Version5Pkg', 'Host');
		const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

		const block4Offset = view.getUint32(2 + 4 * 4, false);
		let block4Pos = block4Offset;
		readStringIndex(view, { pos: block4Pos }); // customData
		block4Pos += 2;
		block4Pos += 1; // opaque
		block4Pos += 2; // mask
		block4Pos += 2 + 4 + 4; // hitTest
		const addSoundIndex = view.getUint16(block4Pos, false);
		block4Pos += 2;
		const removeSoundIndex = view.getUint16(block4Pos, false);
		t.is(stringTable[addSoundIndex], 'ui://pkgv5/add');
		t.is(stringTable[removeSoundIndex], 'ui://pkgv5/remove');

		const block2Offset = view.getUint32(2 + 4 * 2, false);
		let pos = block2Offset;
		const childCount = view.getInt16(pos, false);
		pos += 2;

		const seen = new Set<string>();
		for (let i = 0; i < childCount; i++) {
			const dataLen = view.getUint16(pos, false);
			pos += 2;
			const childPos = pos;
			const block0Offset = view.getUint16(childPos + 2, false);
			const block6Offset = view.getUint16(childPos + 2 + 2 * 6, false);
			const state = { pos: childPos + block0Offset };
			state.pos += 1;
			readStringIndex(view, state);
			readStringIndex(view, state);
			const idIndex = readStringIndex(view, state);
			readStringIndex(view, state);
			const id = stringTable[idIndex];

			if (id === 'n0') {
				seen.add(id);
				const block6State = { pos: childPos + block6Offset };
				t.is(view.getUint8(block6State.pos++), 11);
				readStringIndex(view, block6State);
				readStringIndex(view, block6State);
				const hasColor = view.getUint8(block6State.pos++) !== 0;
				if (hasColor) block6State.pos += 4;
				block6State.pos += 4; // titleFontSize
				block6State.pos += 1; // input settings flag
				const soundIndex = readStringIndex(view, block6State);
				t.is(stringTable[soundIndex], 'ui://pkgv5/label');
				t.is(view.getFloat32(block6State.pos, false), 0.25);
			}

			if (id === 'n1') {
				seen.add(id);
				const block6State = { pos: childPos + block6Offset };
				t.is(view.getUint8(block6State.pos++), 13);
				const itemCount = view.getInt16(block6State.pos, false);
				block6State.pos += 2;
				t.is(itemCount, 1);
				const itemChunk = view.getInt16(block6State.pos, false);
				block6State.pos += 2;
				t.is(itemChunk, 6, 'combo item writes title/value/icon strings');
				readStringIndex(view, block6State);
				readStringIndex(view, block6State);
				const itemIconIndex = readStringIndex(view, block6State);
				t.is(itemIconIndex, NULL_STRING_INDEX, 'empty combo item icon is encoded as null string');
				readStringIndex(view, block6State); // title
				readStringIndex(view, block6State); // icon
				const hasColor = view.getUint8(block6State.pos++) !== 0;
				if (hasColor) block6State.pos += 4;
				block6State.pos += 4; // visibleItemCount
				block6State.pos += 1; // popupDirection
				block6State.pos += 2; // selectionController
				const soundIndex = readStringIndex(view, block6State);
				t.is(stringTable[soundIndex], 'ui://pkgv5/combo');
				t.is(view.getFloat32(block6State.pos, false), 0.5);
			}

			if (id === 'n2') {
				seen.add(id);
				const block6State = { pos: childPos + block6Offset };
				t.is(view.getUint8(block6State.pos++), 14);
				block6State.pos += 4; // value
				block6State.pos += 4; // max
				block6State.pos += 4; // min
				const soundIndex = readStringIndex(view, block6State);
				t.is(stringTable[soundIndex], 'ui://pkgv5/progress');
				t.is(view.getFloat32(block6State.pos, false), 0.75);
			}

			pos = childPos + dataLen;
		}

		t.deepEqual([...seen].sort(), ['n0', 'n1', 'n2']);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: emits combo box instance items with null icon placeholders', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-combo-instance').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('ComboInstancePkg');
	pkg.setId('pkgcombo');

	const comp = doc.createComponent('Host');
	comp.setId('comp001');
	comp.setPath('/');
	comp.setSize(320, 200);

	const comboInst = doc.createGComponent('comboInst');
	comboInst.setId('n0');
	comboInst.setInstanceExtType('ComboBox');
	comboInst.setInstanceComboItems([{ title: 'A', value: '1', icon: null }]);
	comp.addChild(comboInst);
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-combo-instance-'));
	const outPath = path.join(tmpDir, 'out.fui');

	try {
		const io = new NodeIO();
		await io.writeBinary(doc, outPath, { compressed: false, version: 5 });

		const bytes = await fs.readFile(outPath);
		const stringTable = readStringTable(bytes, readBlockOffsets(bytes)[4]);
		const written = await io.readBinary(outPath);
		const raw = getComponentRawBinary(written, 'ComboInstancePkg', 'Host');
		const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

		const block2Offset = view.getUint32(2 + 4 * 2, false);
		let pos = block2Offset;
		const childCount = view.getInt16(pos, false);
		pos += 2;
		t.is(childCount, 1);

		const dataLen = view.getUint16(pos, false);
		pos += 2;
		const childPos = pos;
		const block0Offset = view.getUint16(childPos + 2, false);
		const block6Offset = view.getUint16(childPos + 2 + 2 * 6, false);
		const state = { pos: childPos + block0Offset };
		state.pos += 1;
		readStringIndex(view, state);
		readStringIndex(view, state);
		const idIndex = readStringIndex(view, state);
		t.is(stringTable[idIndex], 'n0');

		const block6State = { pos: childPos + block6Offset };
		t.is(view.getUint8(block6State.pos++), 13);
		const itemCount = view.getInt16(block6State.pos, false);
		block6State.pos += 2;
		t.is(itemCount, 1);
		const itemChunk = view.getInt16(block6State.pos, false);
		block6State.pos += 2;
		t.is(itemChunk, 6, 'combo instance item writes title/value/icon strings');
		const titleIndex = readStringIndex(view, block6State);
		const valueIndex = readStringIndex(view, block6State);
		const iconIndex = readStringIndex(view, block6State);
		t.is(stringTable[titleIndex], 'A');
		t.is(stringTable[valueIndex], '1');
		t.is(iconIndex, NULL_STRING_INDEX, 'empty combo instance icon is encoded as null string');
		t.true(dataLen > 0);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: emits version 6 transition and gear animation names', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-v6').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Version6Pkg');
	pkg.setId('pkgv6');

	const comp = doc.createComponent('Host');
	comp.setId('comp001');
	comp.setPath('/');
	comp.setSize(320, 200);

	const ctrl = doc.createController('c1');
	ctrl.setName('c1');
	comp.addController(ctrl);

	const movieClip = doc.createGMovieClip('clip');
	movieClip.setId('n0');
	movieClip.setPlaying(true);
	movieClip.setFrame(0);

	const gear = doc.createGear('gearAni');
	gear.setGearType(5);
	gear.setController(ctrl);
	gear.setPages('p1');
	gear.setValues('3,p,walk,skinA');
	gear.setDefaultValue('7,s,idle,skinB');
	movieClip.addGear(gear);

	const trans = doc.createTransition('animTrans');
	const item = doc.createTransitionItem('animItem');
	item.setTargetId('n0');
	item.setActionType(7);
	item.setTween(true);
	item.setDuration(1);
	item.setStartValue(['12', 'p', 'walk', 'skinA']);
	item.setEndValue(['24', 's', 'run', 'skinB']);
	trans.addItem(item);

	comp.addChild(movieClip);
	comp.addTransition(trans);
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-version6-'));
	const outPath = path.join(tmpDir, 'out.fui');

	try {
		const io = new NodeIO();
		await io.writeBinary(doc, outPath, { compressed: false, version: 6 });

		const bytes = await fs.readFile(outPath);
		t.is(readVersion(bytes), 6, 'binary header version is 6');

		const stringTable = readStringTable(bytes, readBlockOffsets(bytes)[4]);
		const written = await io.readBinary(outPath);
		const raw = getComponentRawBinary(written, 'Version6Pkg', 'Host');
		const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

		const transitionBlockOffset = view.getUint32(2 + 4 * 5, false);
		let transitionPos = transitionBlockOffset;
		const transitionCount = view.getInt16(transitionPos, false);
		transitionPos += 2;
		t.is(transitionCount, 1);

		transitionPos += 2; // transition dataLen
		const itemCountPos = { pos: transitionPos };
		readStringIndex(view, itemCountPos); // transition name
		itemCountPos.pos += 4; // options
		itemCountPos.pos += 1; // autoPlay
		itemCountPos.pos += 4; // autoPlayTimes
		itemCountPos.pos += 4; // autoPlayDelay
		const transitionItemCount = view.getInt16(itemCountPos.pos, false);
		itemCountPos.pos += 2;
		t.is(transitionItemCount, 1);

		const itemDataLen = view.getInt16(itemCountPos.pos, false);
		itemCountPos.pos += 2;
		const transitionItemPos = itemCountPos.pos;
		t.true(itemDataLen > 0);
		t.is(view.getUint8(transitionItemPos), 4);
		const startValueOffset = view.getUint16(transitionItemPos + 2 + 2 * 2, false);
		const endValueOffset = view.getUint16(transitionItemPos + 2 + 2 * 3, false);

		const startState = { pos: transitionItemPos + startValueOffset };
		t.true(view.getUint8(startState.pos++) !== 0, 'transition start playing');
		t.is(view.getInt32(startState.pos, false), 12);
		startState.pos += 4;
		const startAnimationNameIndex = readStringIndex(view, startState);
		const startSkinNameIndex = readStringIndex(view, startState);
		t.is(stringTable[startAnimationNameIndex], 'walk');
		t.is(stringTable[startSkinNameIndex], 'skinA');

		const endState = { pos: transitionItemPos + endValueOffset };
		t.false(view.getUint8(endState.pos++) !== 0, 'transition end stopped');
		t.is(view.getInt32(endState.pos, false), 24);
		endState.pos += 4;
		const endAnimationNameIndex = readStringIndex(view, endState);
		const endSkinNameIndex = readStringIndex(view, endState);
		t.is(stringTable[endAnimationNameIndex], 'run');
		t.is(stringTable[endSkinNameIndex], 'skinB');

		const block2Offset = view.getUint32(2 + 4 * 2, false);
		let childPos = block2Offset;
		const childCount = view.getInt16(childPos, false);
		childPos += 2;
		t.is(childCount, 1);

		const childDataLen = view.getUint16(childPos, false);
		childPos += 2;
		t.true(childDataLen > 0);
		const encodedChildPos = childPos;
		const childGearBlockOffset = view.getUint16(encodedChildPos + 2 + 2 * 2, false);
		const gearState = { pos: encodedChildPos + childGearBlockOffset };
		const gearCount = view.getInt16(gearState.pos, false);
		gearState.pos += 2;
		t.is(gearCount, 1);

		gearState.pos += 2; // gear dataLen
		t.is(view.getUint8(gearState.pos++), 5, 'gear type is GearAnimation');
		gearState.pos += 2; // controller index
		const statusCount = view.getInt16(gearState.pos, false);
		gearState.pos += 2;
		t.is(statusCount, 1);

		const pageIndex = readStringIndex(view, gearState);
		t.is(stringTable[pageIndex], 'p1');
		t.true(view.getUint8(gearState.pos++) !== 0, 'gear page status playing');
		t.is(view.getInt32(gearState.pos, false), 3);
		gearState.pos += 4;

		t.true(view.getUint8(gearState.pos++) !== 0, 'gear has default status');
		t.false(view.getUint8(gearState.pos++) !== 0, 'gear default status stopped');
		t.is(view.getInt32(gearState.pos, false), 7);
		gearState.pos += 4;
		t.false(view.getUint8(gearState.pos++) !== 0, 'gear animation tween footer is disabled');

		const extPageIndex = readStringIndex(view, gearState);
		t.is(stringTable[extPageIndex], 'p1');
		const extAnimationNameIndex = readStringIndex(view, gearState);
		const extSkinNameIndex = readStringIndex(view, gearState);
		t.is(stringTable[extAnimationNameIndex], 'walk');
		t.is(stringTable[extSkinNameIndex], 'skinA');

		t.true(view.getUint8(gearState.pos++) !== 0, 'gear has default ext status');
		const defaultAnimationNameIndex = readStringIndex(view, gearState);
		const defaultSkinNameIndex = readStringIndex(view, gearState);
		t.is(stringTable[defaultAnimationNameIndex], 'idle');
		t.is(stringTable[defaultSkinNameIndex], 'skinB');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: emits version 4 transition and gear custom ease paths', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-v4').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Version4Pkg');
	pkg.setId('pkgv4');

	const comp = doc.createComponent('Host');
	comp.setId('comp001');
	comp.setPath('/');
	comp.setSize(320, 200);

	const ctrl = doc.createController('c1');
	ctrl.setName('c1');
	comp.addController(ctrl);

	const movieClip = doc.createGMovieClip('clip');
	movieClip.setId('n0');

	const gear = doc.createGear('gearLook');
	gear.setGearType(3);
	gear.setController(ctrl);
	gear.setPages('p1');
	gear.setValues('1,0,true,true');
	gear.setDefaultValue('1,0,false,true');
	gear.setTween(true);
	gear.setEaseType(31);
	gear.setCustomEasePath('0,0.25,0.75');
	movieClip.addGear(gear);

	const trans = doc.createTransition('easeTrans');
	const item = doc.createTransitionItem('xyItem');
	item.setTargetId('n0');
	item.setActionType(0);
	item.setTween(true);
	item.setDuration(1);
	item.setEaseType(31);
	item.setStartValue(['0', '0']);
	item.setEndValue(['100', '50']);
	item.setPath('0,1,2');
	item.setCustomEasePath('0,0.5,0.9');
	trans.addItem(item);

	comp.addChild(movieClip);
	comp.addTransition(trans);
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-version4-'));
	const outPath = path.join(tmpDir, 'out.fui');

	try {
		const io = new NodeIO();
		await io.writeBinary(doc, outPath, { compressed: false, version: 4 });

		const bytes = await fs.readFile(outPath);
		t.is(readVersion(bytes), 4, 'binary header version is 4');

		const written = await io.readBinary(outPath);
		const raw = getComponentRawBinary(written, 'Version4Pkg', 'Host');
		const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

		const transitionBlockOffset = view.getUint32(2 + 4 * 5, false);
		let transitionPos = transitionBlockOffset;
		const transitionCount = view.getInt16(transitionPos, false);
		transitionPos += 2;
		t.is(transitionCount, 1);

		transitionPos += 2; // transition dataLen
		transitionPos += 2; // name
		transitionPos += 4; // options
		transitionPos += 1; // autoPlay
		transitionPos += 4; // autoPlayTimes
		transitionPos += 4; // autoPlayDelay
		const transitionItemCount = view.getInt16(transitionPos, false);
		transitionPos += 2;
		t.is(transitionItemCount, 1);

		const itemDataLen = view.getInt16(transitionPos, false);
		transitionPos += 2;
		const transitionItemPos = transitionPos;
		t.true(itemDataLen > 0);
		const tweenValueEndOffset = view.getUint16(transitionItemPos + 2 + 2 * 3, false);
		const endState = { pos: transitionItemPos + tweenValueEndOffset };
		endState.pos += 2; // bool x/y
		endState.pos += 8; // x,y
		endState.pos += 1; // percent flag
		const motionPath = readPathData(view, endState);
		const customEasePath = readPathData(view, endState);
		t.deepEqual(motionPath, [{ curveType: 0, values: [1, 2] }]);
		t.deepEqual(customEasePath, [{ curveType: 0, values: [0.5, 0.8999999761581421] }]);

		const block2Offset = view.getUint32(2 + 4 * 2, false);
		let childPos = block2Offset;
		const childCount = view.getInt16(childPos, false);
		childPos += 2;
		t.is(childCount, 1);

		const childDataLen = view.getUint16(childPos, false);
		childPos += 2;
		t.true(childDataLen > 0);
		const encodedChildPos = childPos;
		const childGearBlockOffset = view.getUint16(encodedChildPos + 2 + 2 * 2, false);
		const gearState = { pos: encodedChildPos + childGearBlockOffset };
		const gearCount = view.getInt16(gearState.pos, false);
		gearState.pos += 2;
		t.is(gearCount, 1);

		gearState.pos += 2; // gear dataLen
		t.is(view.getUint8(gearState.pos++), 3, 'gear type is GearLook');
		gearState.pos += 2; // controller index
		const statusCount = view.getInt16(gearState.pos, false);
		gearState.pos += 2;
		t.is(statusCount, 1);

		gearState.pos += 2; // page id
		gearState.pos += 4 + 4 + 1 + 1; // look status
		t.true(view.getUint8(gearState.pos++) !== 0, 'gear has default status');
		gearState.pos += 4 + 4 + 1 + 1; // default look status
		t.true(view.getUint8(gearState.pos++) !== 0, 'gear has tween');
		t.is(view.getUint8(gearState.pos++), 31, 'gear ease type is custom');
		gearState.pos += 4; // duration
		gearState.pos += 4; // delay
		const gearCustomEasePath = readPathData(view, gearState);
		t.deepEqual(gearCustomEasePath, [{ curveType: 0, values: [0.25, 0.75] }]);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: emits version 7 gear xy percent footer', async (t) => {
	const doc = new Document();
	doc.getRoot().setProjectId('proj-v7-gearxy').setProjectType(0).setVersion('3.0');

	const pkg = doc.createPackage('Version7GearPkg');
	pkg.setId('pkgv7gear');

	const comp = doc.createComponent('Host');
	comp.setId('comp001');
	comp.setPath('/');
	comp.setSize(320, 200);

	const ctrl = doc.createController('c1');
	ctrl.setName('c1');
	comp.addController(ctrl);

	const child = doc.createGGraph('graph');
	child.setId('n0');
	child.setXY(10, 20);

	const gear = doc.createGear('gearXY');
	gear.setGearType(1);
	gear.setController(ctrl);
	gear.setPages('p1,p2');
	gear.setValues('10,20|30,40');
	gear.setDefaultValue('50,60');
	gear.setTween(true);
	child.addGear(gear);

	comp.addChild(child);
	pkg.addResource(comp);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-version7-gearxy-'));
	const outPath = path.join(tmpDir, 'out.fui');

	try {
		const io = new NodeIO();
		await io.writeBinary(doc, outPath, { compressed: false, version: 7 });

		const written = await io.readBinary(outPath);
		const raw = getComponentRawBinary(written, 'Version7GearPkg', 'Host');
		const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

		const block2Offset = view.getUint32(2 + 4 * 2, false);
		let childPos = block2Offset;
		const childCount = view.getInt16(childPos, false);
		childPos += 2;
		t.is(childCount, 1);

		const childDataLen = view.getUint16(childPos, false);
		childPos += 2;
		t.true(childDataLen > 0);
		const encodedChildPos = childPos;
		const childGearBlockOffset = view.getUint16(encodedChildPos + 2 + 2 * 2, false);
		const gearState = { pos: encodedChildPos + childGearBlockOffset };
		const gearCount = view.getInt16(gearState.pos, false);
		gearState.pos += 2;
		t.is(gearCount, 1);

		gearState.pos += 2; // gear dataLen
		t.is(view.getUint8(gearState.pos++), 1, 'gear type is GearXY');
		gearState.pos += 2; // controller index
		const statusCount = view.getInt16(gearState.pos, false);
		gearState.pos += 2;
		t.is(statusCount, 2);

		for (let i = 0; i < statusCount; i++) {
			gearState.pos += 2; // page id
			gearState.pos += 8; // x,y
		}

		t.true(view.getUint8(gearState.pos++) !== 0, 'gear has default status');
		gearState.pos += 8; // default x,y
		t.true(view.getUint8(gearState.pos++) !== 0, 'gear has tween');
		gearState.pos += 1; // ease
		gearState.pos += 4; // duration
		gearState.pos += 4; // delay
		t.false(view.getUint8(gearState.pos++) !== 0, 'gear xy percent footer defaults to false');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: emits null scrollpane ptrRes slots for missing header/footer', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);
	const pkgIndex = doc.getRoot().listPackages().findIndex((item) => item.getName() === 'PullToRefresh');
	t.true(pkgIndex >= 0, 'PullToRefresh package exists');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-scrollpane-ptrres-'));
	const outPath = path.join(tmpDir, 'PullToRefresh_fui.bytes');

	try {
		await io.writeBinary(doc, outPath, { compressed: false, version: 2, packageIndex: pkgIndex });

		const bytes = await fs.readFile(outPath);
		const binaryBytes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const stringTable = readStringTable(binaryBytes, readBlockOffsets(binaryBytes)[4]);

		const written = await io.readBinary(outPath);
		const raw = getComponentRawBinary(written, 'PullToRefresh', 'Main');

		const list1 = readListScrollPaneResourceIndexes(raw, stringTable, 'list1');
		t.is(stringTable[list1.headerIndex], 'ui://3u9795n0n3qdr');
		t.is(list1.footerIndex, NULL_STRING_INDEX, 'missing list footer is encoded as null');

		const list2 = readListScrollPaneResourceIndexes(raw, stringTable, 'list2');
		t.is(list2.headerIndex, NULL_STRING_INDEX, 'missing list header is encoded as null');
		t.is(stringTable[list2.footerIndex], 'ui://3u9795n09sflu');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: emits null restrict for Basics text input when unset', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);
	const pkgIndex = doc.getRoot().listPackages().findIndex((item) => item.getName() === 'Basics');
	t.true(pkgIndex >= 0, 'Basics package exists');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-textinput-restrict-'));
	const outPath = path.join(tmpDir, 'Basics_fui.bytes');

	try {
		await io.writeBinary(doc, outPath, { compressed: false, version: 2, packageIndex: pkgIndex });

		const bytes = await fs.readFile(outPath);
		const binaryBytes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const stringTable = readStringTable(binaryBytes, readBlockOffsets(binaryBytes)[4]);

		const written = await io.readBinary(outPath);
		const raw = getComponentRawBinary(written, 'Basics', 'Demo_Text');
		const input = readTextInputBlock4(raw, stringTable, 'n22');

		t.is(stringTable[input.promptIndex], '[i][color=#999999]Your Name Here[/color][/i]');
		t.is(input.restrictIndex, NULL_STRING_INDEX, 'unset restrict is encoded as null');
		t.is(input.maxLength, 0);
		t.is(input.keyboardType, 0);
		t.false(input.password);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: converts transition frame time and duration using fps', async (t) => {
	const doc = new Document();
	const pkg = doc.createPackage('TransitionFps');
	pkg.setId('trfps001');

	const comp = doc.createComponent('Main');
	comp.setId('cmp_fps');
	comp.setExported(true);
	comp.setSize(100, 100);
	pkg.addResource(comp);

	const trans = doc.createTransition('fpsTrans');
	trans.setFps(12);
	const item = doc.createTransitionItem('fpsItem');
	item.setActionType(TransitionActionType.Alpha);
	item.setTween(true);
	item.setTime(12);
	item.setDuration(6);
	item.setStartValue(['1']);
	item.setEndValue(['0']);
	trans.addItem(item);
	comp.addTransition(trans);

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-transition-fps-'));
	const outPath = path.join(tmpDir, 'fps.fui');

	try {
		const io = new NodeIO();
		await io.writeBinary(doc, outPath, { compressed: false, version: 2, packageIndex: 0 });
		const written = await io.readBinary(outPath);
		const raw = getComponentRawBinary(written, 'TransitionFps', 'Main');
		const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

		const transitionBlockOffset = view.getUint32(2 + 4 * 5, false);
		let transitionPos = transitionBlockOffset;
		t.is(view.getInt16(transitionPos, false), 1);
		transitionPos += 2;
		transitionPos += 2; // transition dataLen
		transitionPos += 2; // transition name
		transitionPos += 4; // options
		transitionPos += 1; // autoPlay
		transitionPos += 4; // autoPlayTimes
		transitionPos += 4; // autoPlayDelay
		t.is(view.getInt16(transitionPos, false), 1);
		transitionPos += 2;

		transitionPos += 2; // item dataLen
		const itemPos = transitionPos;
		const headerOffset = view.getUint16(itemPos + 2, false);
		const tweenOffset = view.getUint16(itemPos + 4, false);
		const headerPos = itemPos + headerOffset;
		const tweenPos = itemPos + tweenOffset;

		t.is(view.getUint8(headerPos), TransitionActionType.Alpha);
		t.is(view.getFloat32(headerPos + 1, false), 1, '12 frames at 12 fps should encode as 1 second');
		t.is(view.getFloat32(tweenPos, false), 0.5, '6 frames at 12 fps should encode as 0.5 seconds');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: maps relation targets from child ids to display-list indexes', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);
	const pkgIndex = doc.getRoot().listPackages().findIndex((item) => item.getName() === 'Emoji');
	t.true(pkgIndex >= 0, 'Emoji package exists');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-emoji-relations-'));
	const outPath = path.join(tmpDir, 'Emoji_fui.bytes');

	try {
		await io.writeBinary(doc, outPath, { compressed: false, version: 2, packageIndex: pkgIndex });
		const bytes = await fs.readFile(outPath);
		const binaryBytes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const stringTable = readStringTable(binaryBytes, readBlockOffsets(binaryBytes)[4]);

		const written = await io.readBinary(outPath);

		const chatLeftRaw = getComponentRawBinary(written, 'Emoji', 'chatLeft');
		t.deepEqual(
			readChildRelationTargets(chatLeftRaw, stringTable, 'n0'),
			[3],
			'chatLeft child n0 should target sibling index 3 (msg)',
		);
		const chatRightRaw = getComponentRawBinary(written, 'Emoji', 'chatRight');
		t.deepEqual(
			readChildRelationTargets(chatRightRaw, stringTable, 'n9'),
			[3, -1],
			'chatRight child n9 should target sibling index 3 and parent',
		);
		t.deepEqual(
			readChildRelationTargets(chatRightRaw, stringTable, 'n11'),
			[-1],
			'chatRight child n11 should target parent for right-right relation',
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('binary writer: matches Transition component raw lengths from editor baseline', async (t) => {
	const io = new NodeIO();
	const doc = await io.readProject(PROJECT_PATH);
	const pkgIndex = doc.getRoot().listPackages().findIndex((item) => item.getName() === 'Transition');
	t.true(pkgIndex >= 0, 'Transition package exists');

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfairygui-transition-raw-'));
	const outPath = path.join(tmpDir, 'Transition_fui.bytes');

	try {
		await io.writeBinary(doc, outPath, { compressed: false, version: 2, packageIndex: pkgIndex });

		const actualBytes = new Uint8Array(await fs.readFile(outPath));
		const expectedBytes = new Uint8Array(await fs.readFile(path.resolve(__dirname, '../../../referer/Release/FairyGUI-Unity-Examples/Transition_fui.bytes')));

		const actualMap = new Map(readComponentRawLengths(actualBytes).map((item) => [item.id, item]));
		const expectedMap = new Map(readComponentRawLengths(expectedBytes).map((item) => [item.id, item]));

		for (const id of ['gkq00', 'gkq04', 'gkq07', 'nra413', 'nra4c', 'ujnc1h']) {
			const actual = actualMap.get(id);
			const expected = expectedMap.get(id);
			t.truthy(actual, `actual component exists: ${id}`);
			t.truthy(expected, `expected component exists: ${id}`);
			t.is(actual!.rawLen, expected!.rawLen, `${actual!.name} raw component length matches editor baseline`);
		}
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
