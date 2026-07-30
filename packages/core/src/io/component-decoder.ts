/**
 * Internal component binary decode facade used exclusively by BinaryReader.
 */
import type { Document } from '../document.js';
import { ByteBuffer } from './byte-buffer.js';
import {
	decodeComponentAdvancedProps,
	decodeComponentControllers,
	decodeComponentExtensionDef,
	decodeComponentHeader,
	decodeComponentRelations,
	decodeComponentScrollPane,
} from './component-decoder-behavior.js';
import { decodeComponentDisplayList } from './component-decoder-child.js';
import { decodeComponentTransitions } from './component-decoder-transition-gear.js';
import { COMPONENT_EXTENSION_TYPE_NAMES } from './component-decoder-shared.js';

export function decodeComponentDefinition(
	resource: ReturnType<Document['createComponent']>,
	rawData: ByteBuffer,
	extensionTypeCode: number,
	doc: Document,
): void {
	const extensionType = COMPONENT_EXTENSION_TYPE_NAMES[extensionTypeCode] ?? '';
	resource.setExtensionType(extensionType);
	if (rawData.byteLength === 0) return;

	const componentBuf = new ByteBuffer(rawData.buffer, rawData.byteOffset, rawData.byteLength);
	componentBuf.stringTable = rawData.stringTable;
	componentBuf.version = rawData.version;

	decodeComponentHeader(resource, componentBuf);
	decodeComponentControllers(doc, resource, componentBuf);
	decodeComponentDisplayList(doc, resource, componentBuf);
	decodeComponentRelations(resource, componentBuf);
	decodeComponentAdvancedProps(resource, componentBuf);
	decodeComponentTransitions(doc, resource, componentBuf);
	decodeComponentExtensionDef(resource, componentBuf, extensionType);
	decodeComponentScrollPane(resource, componentBuf);
}
