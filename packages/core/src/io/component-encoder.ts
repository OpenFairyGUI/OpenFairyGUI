/**
 * Encodes a Component property graph into the binary format used inside .fui files.
 *
 * @internal
 */
import type { Document } from '../document.js';
import type { Component } from '../properties/component.js';
import type { Package } from '../properties/package.js';
import {
	_writeAdvancedProps,
	_writeComponentHeader,
	_writeComponentRelations,
	_writeComponentScrollPane,
	_writeControllers,
	_writeExtensionDef,
} from './component-encoder-behavior.js';
import { _writeDisplayList } from './component-encoder-child.js';
import { _writeTransitions } from './component-encoder-transition-gear.js';
import { WriteBuffer } from './write-buffer.js';

const BLOCK_COUNT = 8;

export function encodeComponent(
	comp: Component,
	doc: Document,
	pkg: Package,
	version = 2,
	parentBuf?: WriteBuffer,
): Uint8Array {
	const buf = parentBuf ? new WriteBuffer(4096, parentBuf) : new WriteBuffer(4096);

	// Write index table header: 8 blocks, uint32 offsets (matches editor format)
	const indexTablePos = buf.pos;
	buf.writeUint8(BLOCK_COUNT);
	buf.writeUint8(0); // useShort = false (uint32 offsets, matches editor)

	// Reserve space for 8 x uint32 offsets
	const offsetsPos = buf.pos;
	for (let i = 0; i < BLOCK_COUNT; i++) buf.writeUint32(0);

	// --- Block 0: Component header ---
	const block0Offset = buf.pos - indexTablePos;
	_writeComponentHeader(buf, comp);

	// --- Block 1: Controllers ---
	const block1Offset = buf.pos - indexTablePos;
	_writeControllers(buf, comp);

	// --- Block 2: Display list ---
	const block2Offset = buf.pos - indexTablePos;
	_writeDisplayList(buf, comp, doc, pkg, version);

	// --- Block 3: Component-level relations ---
	const block3Offset = buf.pos - indexTablePos;
	_writeComponentRelations(buf, comp);

	// --- Block 4: Advanced properties ---
	const block4Offset = buf.pos - indexTablePos;
	_writeAdvancedProps(buf, comp, version);

	// --- Block 5: Transitions ---
	const block5Offset = buf.pos - indexTablePos;
	_writeTransitions(buf, comp, version);

	// --- Block 6: Extension definition (Button/Label/ComboBox/etc.) ---
	const block6Start = buf.pos;
	_writeExtensionDef(buf, comp, pkg, version);
	const block6Offset = buf.pos > block6Start ? block6Start - indexTablePos : 0;

	// Block 7: ScrollPane (when component has overflow=scroll)
	let block7Offset = 0;
	const compOverflow = comp.getOverflow?.() ?? 0;
	if (compOverflow === 2) { // scroll
		block7Offset = buf.pos - indexTablePos;
		_writeComponentScrollPane(buf, comp, pkg);
	}

	// Patch offsets (uint32)
	const savedPos = buf.pos;
	buf.pos = offsetsPos;
	buf.writeUint32(block0Offset);
	buf.writeUint32(block1Offset);
	buf.writeUint32(block2Offset);
	buf.writeUint32(block3Offset);
	buf.writeUint32(block4Offset);
	buf.writeUint32(block5Offset);
	buf.writeUint32(block6Offset);
	buf.writeUint32(block7Offset);
	buf.pos = savedPos;

	return buf.toUint8Array();
}
