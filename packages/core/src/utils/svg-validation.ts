import { XMLParser, XMLValidator } from 'fast-xml-parser';

const MAX_SVG_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_SVG_NODES = 50_000;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
const UNSAFE_SVG_ELEMENTS = new Set([
	'a',
	'animate',
	'animatecolor',
	'animatemotion',
	'animatetransform',
	'audio',
	'canvas',
	'discard',
	'embed',
	'feimage',
	'foreignobject',
	'iframe',
	'image',
	'object',
	'script',
	'set',
	'style',
	'video',
]);

type ParsedSvgEntry = Record<string, unknown> & { ':@'?: Record<string, unknown> };

function invalidSvg(message: string): never {
	throw new Error(`Invalid or unsafe SVG source (${message}).`);
}

function validateAttribute(name: string, value: unknown): void {
	const normalizedName = name.toLowerCase();
	if (normalizedName === 'xmlns') {
		if (value !== SVG_NAMESPACE) invalidSvg('the default namespace must be SVG');
		return;
	}
	if (normalizedName === 'xmlns:xlink') {
		if (value !== XLINK_NAMESPACE) invalidSvg('the xlink namespace is invalid');
		return;
	}
	if (normalizedName.includes(':') && normalizedName !== 'xlink:href' && normalizedName !== 'xml:space') {
		invalidSvg(`qualified attribute "${name}" is not allowed`);
	}
	const localName = normalizedName.split(':').at(-1)!;
	const text = String(value);
	if (localName.startsWith('on')) invalidSvg(`event attribute "${name}" is not allowed`);
	if (localName === 'style' || localName === 'src') invalidSvg(`attribute "${name}" is not allowed`);
	if (localName === 'href' && !/^#[A-Za-z_][\w:.-]*$/u.test(text)) {
		invalidSvg(`external reference in "${name}" is not allowed`);
	}
	if (/(?:^|[\s("'=])(?:https?:|file:|javascript:|data:|\/\/)/iu.test(text)) {
		invalidSvg(`external URL in "${name}" is not allowed`);
	}
	for (const match of text.matchAll(/url\s*\(([^)]*)\)/giu)) {
		const reference = (match[1] ?? '').trim().replace(/^(['"])(.*)\1$/u, '$2');
		if (!/^#[A-Za-z_][\w:.-]*$/u.test(reference)) invalidSvg(`external url() in "${name}" is not allowed`);
	}
}

/** Validate SVG bytes before handing them to a host image decoder. */
export function validateSafeSvgSource(bytes: Uint8Array): string {
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_SVG_SOURCE_BYTES) invalidSvg('source size is unsupported');
	let source: string;
	try {
		source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		invalidSvg('source is not valid UTF-8');
	}
	if (/<!\s*(?:doctype|entity)\b|<\?xml-stylesheet\b/iu.test(source)) {
		invalidSvg('DTD, entities, and stylesheets are not allowed');
	}
	if (XMLValidator.validate(source, { allowBooleanAttributes: false }) !== true) invalidSvg('source is not well-formed XML');

	const parsed = new XMLParser({
		preserveOrder: true,
		ignoreAttributes: false,
		attributeNamePrefix: '',
		parseAttributeValue: false,
		parseTagValue: false,
		processEntities: false,
		trimValues: false,
	}).parse(source) as ParsedSvgEntry[];
	const roots = parsed.flatMap((entry) => Object.keys(entry)
		.filter((name) => name !== ':@' && !name.startsWith('#') && !name.startsWith('?'))
		.map((name) => ({ entry, name })));
	if (roots.length !== 1 || roots[0]!.name !== 'svg') invalidSvg('a single unqualified <svg> root is required');
	if (roots[0]!.entry[':@']?.xmlns !== SVG_NAMESPACE) invalidSvg('the SVG namespace is required');

	const pending = [roots[0]!.entry];
	let nodeCount = 0;
	while (pending.length > 0) {
		const current = pending.pop()!;
		for (const [name, value] of Object.entries(current)) {
			if (name === ':@' || name.startsWith('#') || name.startsWith('?')) continue;
			if (++nodeCount > MAX_SVG_NODES) invalidSvg('node count exceeds the supported limit');
			if (name.includes(':')) invalidSvg(`qualified element <${name}> is not allowed`);
			if (UNSAFE_SVG_ELEMENTS.has(name.toLowerCase())) invalidSvg(`element <${name}> is not allowed`);
			for (const [attributeName, attributeValue] of Object.entries(current[':@'] ?? {})) {
				validateAttribute(attributeName, attributeValue);
			}
			if (Array.isArray(value)) {
				for (const child of value) {
					if (child && typeof child === 'object' && !Array.isArray(child)) pending.push(child as ParsedSvgEntry);
				}
			}
		}
	}
	return source;
}
