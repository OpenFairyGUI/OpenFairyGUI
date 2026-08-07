import type { Document, ILogger, Package } from '@openfairygui/core';
import type { AtlasOptions } from '../atlas.js';
import { COMPAT_NODE_RECT_FLAGS, type CompatNodeRect, type CompatPage } from '../max-rects-compat.js';
import { MaxRectsPackerCompat } from '../max-rects-packer-compat.js';
import type { AtlasRasterBackend } from '../publish/contracts.js';
import {
	extname,
	isFontResource,
	isImageResource,
	resolveImageFileName,
	resolveImagePath,
} from '../publish/package-context.js';
import { parseTextureSetMode, type TextureSetMode } from '../utils.js';
import {
	getPublishedItemId,
	type FontResourceExtras,
	type InputItem,
	type PackageResource,
	type PackInputResource,
	type PagedAtlasGroup,
	type StandaloneAtlasGroup,
} from './inputs.js';

interface BranchAtlasGroup {
	branchName: string;
	branchOrdinal: number;
	inputs: InputItem[];
}

export async function emitAtlasInputs(input: {
	doc: Document;
	pkg: Package;
	allResources: PackageResource[];
	inputs: InputItem[];
	options: AtlasOptions;
	encoder: AtlasRasterBackend | undefined;
	logger: ILogger;
}): Promise<void> {
	const { doc, pkg, allResources, inputs, options, encoder, logger } = input;
	let totalPageCount = 0;
	let usedDirectOutput = false;
	const { autoInputs, fixedPageGroups, standaloneGroups, reservedPageIndexes } = groupStandaloneInputs(
		doc,
		inputs,
		options,
	);
	const branchGroups = buildBranchAtlasGroups(doc, autoInputs, options);
	const branchPageOffsets = new Map<number, number>();

	for (const group of branchGroups) {
		const directOutput =
			fixedPageGroups.length === 0 && standaloneGroups.length === 0
				? resolveDirectImageOutput(group.inputs, options)
				: null;
		if (directOutput) {
			await emitDirectImageOutput(
				doc,
				pkg,
				directOutput,
				encoder,
				options,
				logger,
				group.branchName,
				group.branchOrdinal,
			);
			usedDirectOutput = true;
			totalPageCount += 1;
			continue;
		}
		const pageStart = reserveAutoPageStart(branchPageOffsets, group.branchOrdinal, reservedPageIndexes);
		const emittedPageCount = await emitPagedAtlasGroup(doc, pkg, allResources, group.inputs, {
			branchName: group.branchName,
			branchOrdinal: group.branchOrdinal,
			pageStart,
			fileNameAt: (pageIndex) => resolveAtlasOutputFileName(pkg, pageIndex, group.branchName),
			options,
			encoder,
			logger,
		});
		totalPageCount += emittedPageCount;
		branchPageOffsets.set(group.branchOrdinal, pageStart + emittedPageCount);
	}

	for (const group of fixedPageGroups) {
		const emittedPageCount = await emitPagedAtlasGroup(doc, pkg, allResources, group.inputs, {
			branchName: group.branchName,
			branchOrdinal: group.branchOrdinal,
			pageStart: group.pageIndex,
			forceSinglePage: true,
			fileNameAt: () => resolveAtlasOutputFileName(pkg, group.pageIndex, group.branchName),
			options,
			encoder,
			logger,
		});
		totalPageCount += emittedPageCount;
	}

	const standalonePageOffsets = new Map(branchPageOffsets);
	for (const group of fixedPageGroups) {
		const nextPageIndex = group.pageIndex + 1;
		const current = standalonePageOffsets.get(group.branchOrdinal) ?? 0;
		if (nextPageIndex > current) standalonePageOffsets.set(group.branchOrdinal, nextPageIndex);
	}

	for (const group of standaloneGroups) {
		const emittedPageCount = await emitStandaloneAtlasGroup(doc, pkg, group, {
			atlasIndexStart: standalonePageOffsets.get(group.branchOrdinal) ?? 0,
			options,
			encoder,
			logger,
		});
		totalPageCount += emittedPageCount;
		standalonePageOffsets.set(
			group.branchOrdinal,
			(standalonePageOffsets.get(group.branchOrdinal) ?? 0) + emittedPageCount,
		);
	}

	if (usedDirectOutput) {
		logger.info(`atlas: Direct output for single image package "${pkg.getName()}".`);
	}
	logger.info(
		`atlas: Packed ${inputs.length} images into ${totalPageCount} atlas(es) for package "${pkg.getName()}".`,
	);
}


function buildBranchAtlasGroups(doc: Document, inputs: InputItem[], options: AtlasOptions): BranchAtlasGroup[] {
	if (!options.separatedAtlasForBranch) {
		return [{ branchName: '', branchOrdinal: 0, inputs }];
	}

	const discoveredBranchNames = [
		...new Set(inputs.map((input) => getInputBranchName(input)).filter((branchName) => !!branchName)),
	];
	if (discoveredBranchNames.length === 0) {
		return [{ branchName: '', branchOrdinal: 0, inputs }];
	}

	const orderedBranchNames = doc
		.getRoot()
		.listBranches()
		.filter((branchName) => discoveredBranchNames.includes(branchName));
	for (const branchName of discoveredBranchNames) {
		if (!orderedBranchNames.includes(branchName)) orderedBranchNames.push(branchName);
	}

	const groups = new Map<string, InputItem[]>();
	groups.set('', []);
	for (const branchName of orderedBranchNames) {
		groups.set(branchName, []);
	}

	for (const input of inputs) {
		const branchName = getInputBranchName(input);
		const key = groups.has(branchName) ? branchName : '';
		groups.get(key)!.push(input);
	}

	const orderedKeys = [''];
	for (const branchName of orderedBranchNames) {
		if ((groups.get(branchName)?.length ?? 0) > 0) orderedKeys.push(branchName);
	}

	return orderedKeys
		.filter((branchName) => (groups.get(branchName)?.length ?? 0) > 0)
		.map((branchName, index) => ({
			branchName,
			branchOrdinal: index,
			inputs: groups.get(branchName) ?? [],
		}));
}

function reserveAutoPageStart(
	branchPageOffsets: Map<number, number>,
	branchOrdinal: number,
	reservedPageIndexes: Set<number>,
): number {
	let pageIndex = branchPageOffsets.get(branchOrdinal) ?? 0;
	while (branchOrdinal === 0 && reservedPageIndexes.has(pageIndex)) {
		pageIndex += 1;
	}
	return pageIndex;
}

async function emitPagedAtlasGroup(
	doc: Document,
	pkg: Package,
	allResources: PackageResource[],
	inputs: InputItem[],
	context: {
		branchName: string;
		branchOrdinal: number;
		pageStart: number;
		fileNameAt: (pageIndex: number) => string;
		options: AtlasOptions;
		encoder: AtlasRasterBackend | undefined;
		logger: ILogger;
		forceSinglePage?: boolean;
	},
): Promise<number> {
	if (inputs.length === 0) return 0;
	const pages = packAtlasPages(inputs, context.options, context.forceSinglePage === true);
	assertPackedInputCoverage(pages, inputs.length, `package "${pkg.getName()}"`);

	for (let pageOffset = 0; pageOffset < pages.length; pageOffset += 1) {
		const page = pages[pageOffset];
		const pageIndex = context.pageStart + pageOffset;
		const atlasNode = doc.createAtlas(`atlas${resolveAtlasIndex(context.branchOrdinal, pageIndex)}`);
		atlasNode.setIndex(resolveAtlasIndex(context.branchOrdinal, pageIndex));
		atlasNode.setFile(context.fileNameAt(pageIndex));
		atlasNode.setWidth(page.width);
		atlasNode.setHeight(page.height);
		pkg.addAtlas(atlasNode);

		attachSpritesToAtlas(doc, allResources, inputs, page.outputRects, atlasNode);
		await writeAtlasPageImage(
			pkg,
			inputs,
			page,
			atlasNode.getFile(),
			context.encoder,
			context.options,
			context.logger,
		);
	}

	return pages.length;
}

async function emitStandaloneAtlasGroup(
	doc: Document,
	pkg: Package,
	group: StandaloneAtlasGroup,
	context: {
		atlasIndexStart: number;
		options: AtlasOptions;
		encoder: AtlasRasterBackend | undefined;
		logger: ILogger;
	},
): Promise<number> {
	if (group.inputs.length === 0) return 0;
	const pages = packAtlasPages(
		group.inputs,
		context.options,
		true,
		group.sizeMode === 'npot'
			? { powerOfTwo: false, multipleOfFour: false, square: false }
			: group.sizeMode === 'multipleOf4'
				? { powerOfTwo: false, multipleOfFour: true, square: false }
			: undefined,
	);
	assertPackedInputCoverage(pages, group.inputs.length, `standalone texture in package "${pkg.getName()}"`);

	for (let pageOffset = 0; pageOffset < pages.length; pageOffset += 1) {
		const page = pages[pageOffset];
		const baseFileName = resolveStandaloneAtlasOutputFileName(pkg, group.resource, group.branchName);
		const atlasFileName = pages.length <= 1 ? baseFileName : insertFileNameSuffix(baseFileName, `_${pageOffset}`);
		const atlasIndex = context.atlasIndexStart + pageOffset;
		const atlasNode = doc.createAtlas(`atlas${resolveAtlasIndex(group.branchOrdinal, atlasIndex)}`);
		atlasNode.setIndex(resolveAtlasIndex(group.branchOrdinal, atlasIndex));
		atlasNode.setFile(atlasFileName);
		const standaloneSize = resolveStandaloneAtlasSize(page.width, page.height, group.sizeMode, context.options);
		atlasNode.setWidth(standaloneSize.width);
		atlasNode.setHeight(standaloneSize.height);
		pkg.addAtlas(atlasNode);

		attachSpritesToAtlas(doc, [], group.inputs, page.outputRects, atlasNode);
		await writeAtlasPageImage(
			pkg,
			group.inputs,
			{ ...page, width: standaloneSize.width, height: standaloneSize.height },
			atlasFileName,
			context.encoder,
			context.options,
			context.logger,
		);
	}

	return pages.length;
}

function packAtlasPages(
	inputs: InputItem[],
	options: AtlasOptions,
	forceSinglePage: boolean,
	sizeOverrides?: {
		powerOfTwo: boolean;
		multipleOfFour: boolean;
		square: boolean;
	},
): CompatPage[] {
	const hasDuplicatePadding = inputs.some((input) => {
		return isImageResource(input.resource) && input.resource.getDuplicatePadding?.() === true;
	});
	const packer = new MaxRectsPackerCompat({
		pot: sizeOverrides?.powerOfTwo ?? options.powerOfTwo,
		mof: sizeOverrides?.multipleOfFour ?? options.multipleOfFour,
		padding: options.padding,
		rotation: options.allowRotation,
		minWidth: 16,
		minHeight: 16,
		maxWidth: options.maxSize,
		maxHeight: options.maxSize,
		square: sizeOverrides?.square ?? options.square,
		fast: options.fast,
		edgePadding: false,
		duplicatePadding: hasDuplicatePadding,
		multiPage: forceSinglePage ? false : options.multiPage,
		preserveInputOrderOnTie: options.preserveInputOrderOnTie,
	});
	return packer.pack(inputs.map((input, index) => inputToCompatRect(input, index))) ?? [];
}

function assertPackedInputCoverage(
	pages: Array<{ outputRects: Array<{ index: number }> }>,
	inputCount: number,
	label: string,
): void {
	const packedIndexes = new Set<number>();
	for (const page of pages) {
		for (const outputRect of page.outputRects) packedIndexes.add(outputRect.index);
	}
	const hasEveryInput = Array.from({ length: inputCount }, (_, index) => packedIndexes.has(index)).every(Boolean);
	if (packedIndexes.size !== inputCount || !hasEveryInput) {
		throw new Error(`atlas: Could not pack every input for ${label}.`);
	}
}

function attachSpritesToAtlas(
	doc: Document,
	allResources: PackageResource[],
	inputs: InputItem[],
	outputRects: Array<{ index: number; x: number; y: number; width: number; height: number; rotated: boolean }>,
	atlasNode: ReturnType<Document['createAtlas']>,
): void {
	for (const packedRect of outputRects) {
		const input = inputs[packedRect.index];
		if (!input) continue;
		const packedSize = resolvePackedRectSize(input, packedRect.width, packedRect.height, packedRect.rotated);
		const sprite = doc.createSprite();
		sprite.setItemId(input.id);
		sprite.setRectX(packedRect.x);
		sprite.setRectY(packedRect.y);
		sprite.setRectWidth(packedSize.width);
		sprite.setRectHeight(packedSize.height);
		sprite.setRotated(packedRect.rotated);
		sprite.setOffsetX(input.offsetX);
		sprite.setOffsetY(input.offsetY);
		sprite.setOriginalWidth(input.originalWidth);
		sprite.setOriginalHeight(input.originalHeight);
		sprite.setAtlas(atlasNode);
		atlasNode.addSprite(sprite);
	}

	for (const resource of allResources) {
		if (!isFontResource(resource)) continue;
		const extras = resource.getExtras() as FontResourceExtras;
		const alias = extras?._fontSpriteAlias;
		if (!alias) continue;
		const imageSprite = outputRects.find((result) => inputs[result.index]?.id === alias.textureId);
		if (!imageSprite) continue;
		const imageInput = inputs[imageSprite.index];
		const fontSprite = doc.createSprite();
		fontSprite.setItemId(alias.fontId);
		fontSprite.setRectX(imageSprite.x);
		fontSprite.setRectY(imageSprite.y);
		fontSprite.setRectWidth(imageSprite.width);
		fontSprite.setRectHeight(imageSprite.height);
		fontSprite.setRotated(imageSprite.rotated);
		if (imageInput) {
			fontSprite.setOffsetX(imageInput.offsetX);
			fontSprite.setOffsetY(imageInput.offsetY);
			fontSprite.setOriginalWidth(imageInput.originalWidth);
			fontSprite.setOriginalHeight(imageInput.originalHeight);
		}
		fontSprite.setAtlas(atlasNode);
		atlasNode.addSprite(fontSprite);
	}
}

async function writeAtlasPageImage(
	pkg: Package,
	inputs: InputItem[],
	page: {
		width: number;
		height: number;
		outputRects: Array<{ index: number; x: number; y: number; width: number; height: number; rotated: boolean }>;
	},
	atlasFileName: string,
	encoder: AtlasRasterBackend | undefined,
	options: AtlasOptions,
	logger: ILogger,
): Promise<void> {
	if (!encoder || !options.outputPath) return;
	if (options.mkdir) {
		await options.mkdir(options.outputPath);
	}

	const compositeInputs: Array<{ input: Uint8Array; left: number; top: number }> = [];
	for (const packedRect of page.outputRects) {
		const input = inputs[packedRect.index];
		if (!input) continue;
		if (packedRect.width <= 0 || packedRect.height <= 0 || input.width <= 0 || input.height <= 0) continue;
		try {
			let imageBuffer: Uint8Array;
			if (input.trimBuffer) {
				imageBuffer = input.trimBuffer;
				if (imageBuffer.length === 0) continue;
			} else if (input.rasterizedBuffer) {
				imageBuffer = input.rasterizedBuffer;
			} else {
				if (!isImageResource(input.resource)) {
					const message = `atlas: Non-image input "${input.id}" is missing inline buffer.`;
					if (options.strictOutput) throw new Error(message);
					logger.warn(`${message} Skipping compositing.`);
					continue;
				}
				const filePath = resolveImagePath(input.resource, pkg, options.basePath!);
				imageBuffer = await encoder(filePath).toBuffer();
			}
			if (packedRect.rotated) imageBuffer = await encoder(imageBuffer).rotate(270).toBuffer();
			compositeInputs.push({
				input: imageBuffer,
				left: packedRect.x,
				top: packedRect.y,
			});
		} catch {
			const message = `atlas: Could not read image "${input.id}" for compositing.`;
			if (options.strictOutput) throw new Error(message);
			logger.warn(message);
		}
	}

	const outputFile = `${options.outputPath}/${atlasFileName}`;
	const atlasPipeline = encoder({
		create: {
			width: page.width,
			height: page.height,
			channels: 4 as const,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		},
	}).composite(compositeInputs);
	if (options.extractAlpha) {
		const atlasBuffer = await atlasPipeline.png().toBuffer();
		await encoder(atlasBuffer).removeAlpha().png().toFile(outputFile);
		const alphaBuffer = await encoder(atlasBuffer).extractChannel('alpha').png().toBuffer();
		await encoder(alphaBuffer)
			.joinChannel([alphaBuffer, alphaBuffer])
			.png()
			.toFile(`${options.outputPath}/${insertFileNameSuffix(atlasFileName, '!a')}`);
	} else {
		await atlasPipeline.toFile(outputFile);
	}

	logger.info(`atlas: Generated ${atlasFileName} (${page.width}x${page.height}, ${page.outputRects.length} sprites)`);
}

function inputToCompatRect(input: InputItem, index: number): CompatNodeRect {
	const duplicatePadding = isImageResource(input.resource) && input.resource.getDuplicatePadding?.() === true;
	return {
		x: 0,
		y: 0,
		width: input.width,
		height: input.height,
		rotated: false,
		index,
		subIndex: -1,
		flags: duplicatePadding ? COMPAT_NODE_RECT_FLAGS.DUPLICATE_PADDING : 0,
		score1: 0,
		score2: 0,
		sourceKind: input.sourceKind,
	};
}

function resolvePackedRectSize(
	input: InputItem,
	width: number,
	height: number,
	rectRotated: boolean,
): { width: number; height: number } {
	if (!rectRotated) return { width, height };
	return {
		width: input.height,
		height: input.width,
	};
}

function resolveDirectImageOutput(inputs: InputItem[], options: AtlasOptions): InputItem | null {
	if (!options.directSingleImageOutput || options.extractAlpha) return null;
	if (inputs.length !== 1) return null;
	const [input] = inputs;
	if (!input || input.sourceKind !== 'image' || !isImageResource(input.resource)) return null;
	if (input.resource.getDuplicatePadding?.() === true) return null;
	if (input.width !== input.originalWidth || input.height !== input.originalHeight) return null;
	const fileName = resolveImageFileName(input.resource).toLowerCase();
	if (!fileName.endsWith('.png')) return null;
	return input;
}

function resolveDirectOutputAtlasSize(
	width: number,
	height: number,
	options: AtlasOptions,
): { width: number; height: number } {
	let resolvedWidth = width;
	let resolvedHeight = height;
	if (options.square) {
		const side = Math.max(resolvedWidth, resolvedHeight);
		resolvedWidth = side;
		resolvedHeight = side;
	}
	if (options.powerOfTwo) {
		resolvedWidth = nextPow2(resolvedWidth);
		resolvedHeight = nextPow2(resolvedHeight);
	} else if (options.multipleOfFour) {
		resolvedWidth = roundUpToMultiple(resolvedWidth, 4);
		resolvedHeight = roundUpToMultiple(resolvedHeight, 4);
	}
	return { width: resolvedWidth, height: resolvedHeight };
}

async function emitDirectImageOutput(
	doc: Document,
	pkg: Package,
	input: InputItem,
	encoder: AtlasRasterBackend | undefined,
	options: AtlasOptions,
	logger: ILogger,
	branchName: string = '',
	branchOrdinal: number = 0,
): Promise<void> {
	const atlasFileName = resolveAtlasOutputFileName(pkg, 0, branchName);
	const atlasSize = resolveDirectOutputAtlasSize(input.originalWidth, input.originalHeight, options);
	const atlasNode = doc.createAtlas(`atlas${resolveAtlasIndex(branchOrdinal, 0)}`);
	atlasNode.setIndex(resolveAtlasIndex(branchOrdinal, 0));
	atlasNode.setFile(atlasFileName);
	atlasNode.setWidth(atlasSize.width);
	atlasNode.setHeight(atlasSize.height);
	pkg.addAtlas(atlasNode);

	const sprite = doc.createSprite();
	sprite.setItemId(input.id);
	sprite.setRectX(0);
	sprite.setRectY(0);
	sprite.setRectWidth(input.originalWidth);
	sprite.setRectHeight(input.originalHeight);
	sprite.setRotated(false);
	sprite.setOffsetX(0);
	sprite.setOffsetY(0);
	sprite.setOriginalWidth(input.originalWidth);
	sprite.setOriginalHeight(input.originalHeight);
	sprite.setAtlas(atlasNode);
	atlasNode.addSprite(sprite);

	if (!encoder || !options.outputPath || !isImageResource(input.resource) || !options.basePath) return;
	if (options.mkdir) {
		await options.mkdir(options.outputPath);
	}

	const outputFile = `${options.outputPath}/${atlasFileName}`;
	const filePath = resolveImagePath(input.resource, pkg, options.basePath);

	try {
		if (atlasSize.width === input.originalWidth && atlasSize.height === input.originalHeight) {
			await encoder(filePath).png().toFile(outputFile);
		} else {
			const imageBuffer = await encoder(filePath).png().toBuffer();
			await encoder({
				create: {
					width: atlasSize.width,
					height: atlasSize.height,
					channels: 4 as const,
					background: { r: 0, g: 0, b: 0, alpha: 0 },
				},
			})
				.composite([{ input: imageBuffer, left: 0, top: 0 }])
				.png()
				.toFile(outputFile);
		}
	} catch {
		const message = `atlas: Could not write direct-output atlas "${atlasFileName}".`;
		if (options.strictOutput) throw new Error(message);
		logger.warn(message);
	}
}

function getInputBranchName(input: InputItem): string {
	return (input.resource as { getBranch?(): string }).getBranch?.() ?? '';
}

function resolveAtlasIndex(branchOrdinal: number, pageIndex: number): number {
	if (branchOrdinal <= 0) return pageIndex;
	return branchOrdinal * 100 + pageIndex;
}

function resolveAtlasOutputFileName(pkg: Package, pageIndex: number, branchName: string): string {
	const suffix = branchName ? `_${branchName}` : '';
	return `${pkg.getPublishName() || pkg.getName()}_atlas${pageIndex}${suffix}.png`;
}

function resolveStandaloneAtlasOutputFileName(pkg: Package, resource: PackInputResource, branchName: string): string {
	const baseName = `${pkg.getPublishName() || pkg.getName()}_atlas_${getPublishedItemId(resource)}`;
	const suffix = branchName ? `_${branchName}` : '';
	if (isImageResource(resource)) {
		const ext = extname(resolveImageFileName(resource)) || '.png';
		return `${baseName}${suffix}${ext}`;
	}
	return `${baseName}${suffix}.png`;
}

function resolveStandaloneAtlasSize(
	width: number,
	height: number,
	sizeMode: StandaloneAtlasGroup['sizeMode'],
	options: AtlasOptions,
): { width: number; height: number } {
	if (sizeMode === 'npot') {
		return { width, height };
	}
	if (sizeMode === 'multipleOf4') {
		return {
			width: roundUpToMultiple(width, 4),
			height: roundUpToMultiple(height, 4),
		};
	}
	return resolveDirectOutputAtlasSize(width, height, options);
}

function insertFileNameSuffix(fileName: string, suffix: string): string {
	const extension = extname(fileName);
	if (!extension) return `${fileName}${suffix}`;
	return `${fileName.slice(0, -extension.length)}${suffix}${extension}`;
}

function nextPow2(value: number): number {
	if (value <= 1) return 1;
	return 2 ** Math.ceil(Math.log2(value));
}

function roundUpToMultiple(value: number, base: number): number {
	if (value <= 0) return 0;
	return Math.ceil(value / base) * base;
}

export function sortResourcesByOrder(
	resources: PackageResource[],
	orderMap: Map<string, number>,
	inputOrderMap: Map<string, number>,
): PackageResource[] {
	const ordered = [...resources];
	ordered.sort((left, right) => {
		const leftId = left.getId();
		const rightId = right.getId();
		const leftOrder =
			leftId && orderMap.has(leftId)
				? (orderMap.get(leftId) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		const rightOrder =
			rightId && orderMap.has(rightId)
				? (orderMap.get(rightId) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		if (leftOrder !== rightOrder) return leftOrder - rightOrder;
		const leftInputOrder =
			leftId && inputOrderMap.has(leftId)
				? (inputOrderMap.get(leftId) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		const rightInputOrder =
			rightId && inputOrderMap.has(rightId)
				? (inputOrderMap.get(rightId) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		if (leftInputOrder !== rightInputOrder) return leftInputOrder - rightInputOrder;
		return (leftId ?? '').localeCompare(rightId ?? '');
	});
	return ordered;
}

function getResourceTextureSetMode(resource: PackInputResource, maxAtlasIndex: number): TextureSetMode {
	return parseTextureSetMode(resource.getTextureSetMode?.(), maxAtlasIndex);
}

function groupStandaloneInputs(
	doc: Document,
	inputs: InputItem[],
	options: AtlasOptions,
): {
	autoInputs: InputItem[];
	fixedPageGroups: PagedAtlasGroup[];
	standaloneGroups: StandaloneAtlasGroup[];
	reservedPageIndexes: Set<number>;
} {
	const autoInputs: InputItem[] = [];
	const fixedInputsByPage = new Map<string, PagedAtlasGroup>();
	const standaloneGroups = new Map<string, StandaloneAtlasGroup>();
	const reservedPageIndexes = new Set<number>();
	const discoveredBranchNames = [
		...new Set(inputs.map((input) => getInputBranchName(input)).filter((branchName) => !!branchName)),
	];
	const orderedBranchNames = doc
		.getRoot()
		.listBranches()
		.filter((branchName) => discoveredBranchNames.includes(branchName));
	for (const branchName of discoveredBranchNames) {
		if (!orderedBranchNames.includes(branchName)) orderedBranchNames.push(branchName);
	}
	const branchOrdinalByName = new Map<string, number>();
	branchOrdinalByName.set('', 0);
	if (options.separatedAtlasForBranch) {
		let ordinal = 1;
		for (const branchName of orderedBranchNames) {
			branchOrdinalByName.set(branchName, ordinal++);
		}
	} else {
		for (const branchName of orderedBranchNames) {
			branchOrdinalByName.set(branchName, 0);
		}
	}

	for (const input of inputs) {
		const branchName = getInputBranchName(input);
		const branchOrdinal = branchOrdinalByName.get(branchName) ?? 0;
		const mode = getResourceTextureSetMode(input.resource, options.maxAtlasIndex ?? 10);
		if (mode.kind === 'standalone') {
			const resourceId = getPublishedItemId(input.resource);
			const key = `${branchName}\u0000${resourceId}`;
			const existing = standaloneGroups.get(key);
			if (existing) {
				existing.inputs.push(input);
			} else {
				standaloneGroups.set(key, {
					resource: input.resource,
					branchName,
					branchOrdinal,
					sizeMode: mode.sizeMode,
					inputs: [input],
				});
			}
			continue;
		}
		if (mode.kind === 'page') {
			reservedPageIndexes.add(mode.pageIndex);
			const key = `${branchName}\u0000${mode.pageIndex}`;
			const existing = fixedInputsByPage.get(key);
			if (existing) {
				existing.inputs.push(input);
			} else {
				fixedInputsByPage.set(key, {
					pageIndex: mode.pageIndex,
					branchName,
					branchOrdinal,
					inputs: [input],
				});
			}
			continue;
		}
		autoInputs.push(input);
	}

	return {
		autoInputs,
		fixedPageGroups: [...fixedInputsByPage.values()].sort(
			(left, right) => left.branchOrdinal - right.branchOrdinal || left.pageIndex - right.pageIndex,
		),
		standaloneGroups: [...standaloneGroups.values()].sort(
			(left, right) =>
				left.branchOrdinal - right.branchOrdinal ||
				getPublishedItemId(left.resource).localeCompare(getPublishedItemId(right.resource)),
		),
		reservedPageIndexes,
	};
}
