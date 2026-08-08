import {
	type Component,
	type Document,
	type GComponent,
	type GObject,
	type Package,
	ProjectType,
} from '@openfairygui/core';
import {
	FGUI_TYPESCRIPT_BINDER_TEMPLATE,
	FGUI_TYPESCRIPT_COMPONENT_TEMPLATE,
	UNITY_BINDER_TEMPLATE,
	UNITY_COMPONENT_TEMPLATE,
} from './codegen-templates.js';
import { formatPluginError, type LoadedPlugin } from './plugins/types.js';
import { dirname, isAbsolutePathLike, trimTrailingSlashes } from './path-utils.js';
import type { PublishFileSystem } from './publish/contracts.js';
import type { CliCodeGenerationSettings, RootProjectSettings } from './shared-types.js';

export const AUTO_GENERATED_CODE_MARK = '/** This is an automatically generated class by FairyGUI. Please do not modify it. **/';
const DEFAULT_CLASS_NAME_PREFIX = 'UI_';
const DEFAULT_MEMBER_NAME_PREFIX = 'm_';

export interface PublishCodeGenerationOptions {
	basePath?: string;
	fs: PublishFileSystem;
	packages: Package[];
	plugins?: LoadedPlugin[];
}

export interface ResolvedPackageCodegenPlan {
	outputDir: string;
	packageFolderName: string;
	packageNamespace: string;
	binderClassName: string;
	settings: Required<CliCodeGenerationSettings>;
}

interface FguiTypescriptVariant {
	binderMethod: 'setExtension';
	runtimeNamespace: 'fgui';
	runtimeImport: string;
}

const FGUI_TYPESCRIPT_RUNTIME_TYPES = new Set([
	'Controller',
	'GButton',
	'GComboBox',
	'GComponent',
	'GGraph',
	'GGroup',
	'GImage',
	'GLabel',
	'GList',
	'GLoader',
	'GLoader3D',
	'GMovieClip',
	'GProgressBar',
	'GRichTextField',
	'GScrollBar',
	'GSlider',
	'GSwfObject',
	'GTextField',
	'GTextInput',
	'GTree',
	'Transition',
]);

const LAYABOX_TYPESCRIPT_VARIANT: FguiTypescriptVariant = {
	binderMethod: 'setExtension',
	runtimeNamespace: 'fgui',
	runtimeImport: '',
};

const COCOS_CREATOR_TYPESCRIPT_VARIANT: FguiTypescriptVariant = {
	...LAYABOX_TYPESCRIPT_VARIANT,
	runtimeImport: 'import * as fgui from "fairygui-cc";',
};

export interface CodegenMember {
	index: number;
	kind: 'child' | 'controller' | 'transition';
	name: string;
	originalName: string;
	type: string;
	ignored: boolean;
	referencedComponent?: CodegenReferencedComponent;
}

export interface CodegenReferencedComponent {
	component: Component;
	package: Package;
}

export interface CodegenClass {
	classId: string;
	className: string;
	encodedClassName: string;
	componentType: string;
	componentName: string;
	packageName: string;
	url: string;
	members: CodegenMember[];
}

export async function publishCodeGeneration(doc: Document, options: PublishCodeGenerationOptions): Promise<void> {
	const logger = doc.getLogger();
	const settings = resolveCodeGenerationSettings(doc);
	if (!settings.allowGenCode) return;

	const plugins = options.plugins ?? [];
	if (plugins.length > 0) {
		let handled = false;
		for (const plugin of plugins) {
			const genCode = plugin.plugin.genCode;
			if (!genCode) continue;
			try {
				await genCode(doc, settings, options);
				handled = true;
				logger.info(`publish: Generated code using plugin "${plugin.name}"`);
			} catch (error) {
				logger.warn(`publish: Code generation plugin "${plugin.name}" failed: ${formatPluginError(error)}`);
			}
		}
		if (handled) {
			return;
		}
	}

	for (const pkg of options.packages) {
		if (!pkg.getGenCode()) continue;

		const plan = resolvePackageCodegenPlan(pkg, settings, options);
		if (!plan) {
			logger.warn(`publish: Code generation skipped for package "${pkg.getName()}" because no codePath was resolved.`);
			continue;
		}

		if (!supportsCodeGenerationLane(doc, settings.codeType)) {
			logger.warn(`publish: Code generation skipped for package "${pkg.getName()}" because project/codeType is not supported yet.`);
			continue;
		}

		const fguiTypescriptVariant = resolveFguiTypescriptVariant(doc);
		if (fguiTypescriptVariant) {
			await generateFguiTypescriptCode(doc, pkg, plan, options.fs, fguiTypescriptVariant);
		} else {
			await generateUnityCode(doc, pkg, plan, options.fs);
		}
		logger.info(`publish: Generated code for package "${pkg.getName()}" into ${plan.outputDir}`);
	}
}

export function resolveCodeGenerationSettings(doc: Document): Required<CliCodeGenerationSettings> {
	const settings = (doc.getRoot().getSettings?.() ?? {}) as RootProjectSettings;
	const publish = settings.publish ?? {};
	const codeGeneration = publish.codeGeneration as CliCodeGenerationSettings | undefined;

	if (!codeGeneration) {
		return {
			allowGenCode: true,
			classNamePrefix: 'UI_',
			memberNamePrefix: 'm_',
			packageName: '',
			ignoreNoname: false,
			getMemberByName: false,
			codePath: '',
			codeType: '',
		};
	}

	return {
		allowGenCode: codeGeneration.allowGenCode ?? true,
		classNamePrefix: codeGeneration.classNamePrefix ?? DEFAULT_CLASS_NAME_PREFIX,
		memberNamePrefix: codeGeneration.memberNamePrefix ?? DEFAULT_MEMBER_NAME_PREFIX,
		packageName: codeGeneration.packageName ?? '',
		ignoreNoname: codeGeneration.ignoreNoname ?? false,
		getMemberByName: Boolean(codeGeneration.getMemberByName),
		codePath: codeGeneration.codePath ?? '',
		codeType: codeGeneration.codeType?.trim() ?? '',
	};
}

export function resolvePackageCodegenPlan(pkg: Package, settings: Required<CliCodeGenerationSettings>, options: PublishCodeGenerationOptions): ResolvedPackageCodegenPlan | null {
	const rawCodePath = (pkg.getCodePath() || settings.codePath || '').trim();
	if (!rawCodePath) return null;

	const packageFolderName = normalizeTypeName(pkg.getName()) || 'Package';
	const outputDir = resolveCodePath(rawCodePath, options.basePath, options.fs);
	const packageNamespace = settings.packageName
		? `${settings.packageName}.${packageFolderName}`
		: packageFolderName;

	return {
		outputDir,
		packageFolderName,
		packageNamespace,
		binderClassName: `${packageFolderName}Binder`,
		settings,
	};
}

function supportsCodeGenerationLane(doc: Document, codeType: string): boolean {
	const projectType = doc.getRoot().getProjectType();
	if (projectType === ProjectType.Unity) return codeType === '';
	if (projectType === ProjectType.LayaBox || projectType === ProjectType.CocosCreator) return true;
	return false;
}

function resolveFguiTypescriptVariant(doc: Document): FguiTypescriptVariant | null {
	const projectType = doc.getRoot().getProjectType();
	if (projectType === ProjectType.LayaBox) return LAYABOX_TYPESCRIPT_VARIANT;
	if (projectType === ProjectType.CocosCreator) return COCOS_CREATOR_TYPESCRIPT_VARIANT;
	return null;
}

async function generateUnityCode(
	doc: Document,
	pkg: Package,
	plan: ResolvedPackageCodegenPlan,
	fs: PublishFileSystem,
): Promise<void> {
	const packageDir = fs.join(plan.outputDir, plan.packageFolderName);
	await fs.mkdir(plan.outputDir);
	await fs.mkdir(packageDir);
	await cleanupGeneratedFiles(packageDir, fs);

	const classes = buildCodegenClasses(doc, pkg, plan);
	for (const classInfo of classes) {
		await writeTextFile(
			fs,
			fs.join(packageDir, `${classInfo.encodedClassName}.cs`),
			renderUnityComponentClass(classInfo, plan),
		);
	}

	await writeTextFile(
		fs,
		fs.join(packageDir, `${plan.binderClassName}.cs`),
		renderUnityBinder(classes, plan),
	);
}

async function generateFguiTypescriptCode(
	doc: Document,
	pkg: Package,
	plan: ResolvedPackageCodegenPlan,
	fs: PublishFileSystem,
	variant: FguiTypescriptVariant,
): Promise<void> {
	const packageDir = fs.join(plan.outputDir, plan.packageFolderName);
	await fs.mkdir(plan.outputDir);
	await fs.mkdir(packageDir);
	await cleanupGeneratedFiles(packageDir, fs, '.ts');

	const classes = buildCodegenClasses(doc, pkg, plan);
	for (const classInfo of classes) {
		await writeTextFile(
			fs,
			fs.join(packageDir, `${classInfo.encodedClassName}.ts`),
			renderFguiTypescriptComponentClass(classInfo, plan, variant),
		);
	}

	await writeTextFile(
		fs,
		fs.join(packageDir, `${plan.binderClassName}.ts`),
		renderFguiTypescriptBinder(classes, plan, variant),
	);
}

async function cleanupGeneratedFiles(directory: string, fs: PublishFileSystem, extension = '.cs'): Promise<void> {
	if (!fs.readdir || !fs.readFileRaw || !fs.deleteFile) return;

	let entries: string[];
	try {
		entries = await fs.readdir(directory);
	} catch {
		return;
	}

	for (const entry of entries) {
		if (!entry.toLowerCase().endsWith(extension)) continue;
		const filePath = fs.join(directory, entry);
		try {
			const bytes = await fs.readFileRaw(filePath);
			const content = decodeText(bytes);
			if (content.startsWith(AUTO_GENERATED_CODE_MARK)) {
				await fs.deleteFile(filePath);
			}
		} catch {
			// Skip unreadable entries and nested paths; cleanup is best-effort and package-scoped.
		}
	}
}

export function buildCodegenClasses(doc: Document, pkg: Package, plan: ResolvedPackageCodegenPlan): CodegenClass[] {
	const codegenComponents = pkg.listComponents().sort((left, right) => left.getId().localeCompare(right.getId()));
	const generatedById = new Map<string, CodegenClass>();

	for (const component of codegenComponents) {
		const encodedClassName = `${plan.settings.classNamePrefix}${normalizeTypeName(component.getName()) || 'Component'}`;
		generatedById.set(component.getId(), {
			classId: component.getId(),
			className: component.getName(),
			encodedClassName,
			componentType: resolveComponentBaseType(component),
			componentName: component.getName(),
			packageName: pkg.getName(),
			url: `ui://${pkg.getId()}${component.getId()}`,
			members: [],
		});
	}

	for (const component of codegenComponents) {
		const classInfo = generatedById.get(component.getId());
		if (!classInfo) continue;
		classInfo.members = buildCodegenMembers(doc, pkg, component, plan, generatedById);
	}

	for (const [componentId, classInfo] of generatedById) {
		if (classInfo.members.every((member) => member.ignored)) {
			generatedById.delete(componentId);
		}
	}

	for (const component of codegenComponents) {
		const classInfo = generatedById.get(component.getId());
		if (!classInfo) continue;
		classInfo.members = buildCodegenMembers(doc, pkg, component, plan, generatedById);
	}

	return [...generatedById.values()];
}

function buildCodegenMembers(
	doc: Document,
	pkg: Package,
	component: Component,
	plan: ResolvedPackageCodegenPlan,
	generatedById: Map<string, CodegenClass>,
): CodegenMember[] {
	const members: CodegenMember[] = [];
	const ownerType = resolveComponentBaseType(component);
	let controllerIndex = 0;
	let childIndex = 0;
	let transitionIndex = 0;

	for (const controller of component.listControllers()) {
		members.push(createMember(ownerType, 'controller', 'Controller', controller.getName(), controllerIndex++, plan));
	}

	for (const child of component.listChildren()) {
		if (!isRuntimeChild(child)) continue;
		const index = childIndex++;
		const resolvedChild = resolveChildType(doc, pkg, child, generatedById);
		members.push(createMember(
			ownerType,
			'child',
			resolvedChild.type,
			child.getName(),
			index,
			plan,
			resolvedChild.referencedComponent,
		));
	}

	for (const transition of component.listTransitions()) {
		members.push(createMember(ownerType, 'transition', 'Transition', transition.getName(), transitionIndex++, plan));
	}

	const usedNames = new Map<string, number>();
	for (const member of members) {
		if (member.ignored) continue;
		const key = applyMemberNamePrefix(member.originalName, plan.settings.memberNamePrefix);
		const current = usedNames.get(key) ?? 0;
		if (current > 0) {
			member.name = `${key}_${current + 1}`;
		}
		usedNames.set(key, current + 1);
	}

	return members;
}

function isRuntimeChild(child: GObject): boolean {
	return child.propertyType !== 'GGroup' || (child as GObject & { getAdvanced?(): boolean }).getAdvanced?.() === true;
}

function createMember(
	ownerType: string,
	kind: CodegenMember['kind'],
	type: string,
	originalName: string,
	index: number,
	plan: ResolvedPackageCodegenPlan,
	referencedComponent?: CodegenReferencedComponent,
): CodegenMember {
	const ignored = plan.settings.ignoreNoname && isDefaultMemberName(ownerType, kind, originalName);
	return {
		index,
		kind,
		name: applyMemberNamePrefix(originalName, plan.settings.memberNamePrefix),
		originalName,
		type,
		ignored,
		referencedComponent,
	};
}

interface ResolvedChildCodegenType {
	type: string;
	referencedComponent?: CodegenReferencedComponent;
}

function resolveChildType(
	doc: Document,
	pkg: Package,
	child: GObject,
	generatedById: Map<string, CodegenClass>,
): ResolvedChildCodegenType {
	const src = (child as GObject & { getSrc?(): string }).getSrc?.();
	if (src) {
		let referencedComponent: CodegenReferencedComponent | null = null;
		if (src.startsWith('ui://')) {
			const rest = src.slice(5);
			const pkgId = rest.slice(0, 8);
			const resourceId = rest.slice(8);
			const targetPackage = doc.getRoot().listPackages().find((candidate) => candidate.getId() === pkgId);
			const targetResource = targetPackage?.getResourceById(resourceId);
			if (targetPackage && targetResource?.propertyType === 'Component') {
				referencedComponent = { component: targetResource, package: targetPackage };
			}
		} else {
			const packageId = (child as GComponent & { getPackageId?(): string }).getPackageId?.();
			const targetPackage = packageId
				? doc.getRoot().listPackages().find((candidate) => candidate.getId() === packageId)
				: pkg;
			const targetResource = targetPackage?.getResourceById(src);
			if (targetPackage && targetResource?.propertyType === 'Component') {
				referencedComponent = { component: targetResource, package: targetPackage };
			}
		}

		if (referencedComponent) {
			const localGeneratedClass = referencedComponent.package === pkg
				? generatedById.get(referencedComponent.component.getId())
				: undefined;
			return {
				type: localGeneratedClass?.encodedClassName ?? resolveComponentBaseType(referencedComponent.component),
				referencedComponent,
			};
		}
	}

	const instanceExtType = (child as GComponent & { getInstanceExtType?(): string }).getInstanceExtType?.();
	if (instanceExtType) return { type: `G${instanceExtType}` };

	return { type: child.propertyType };
}

function resolveComponentBaseType(component: Component): string {
	const extensionType = component.getExtensionType();
	return extensionType ? `G${extensionType}` : 'GComponent';
}

function renderUnityComponentClass(classInfo: CodegenClass, plan: ResolvedPackageCodegenPlan): string {
	const variableLines = classInfo.members
		.filter((member) => !member.ignored)
		.map((member) => `\t\tpublic ${member.type} ${member.name};`)
		.join('\n');
	const contentLines = classInfo.members
		.map((member) => renderMemberAssignment(member, plan.settings.getMemberByName))
		.filter((line): line is string => Boolean(line))
		.join('\n');

	return renderTemplate(UNITY_COMPONENT_TEMPLATE, {
		assignmentLines: contentLines ? `${contentLines}\n` : '',
		className: classInfo.encodedClassName,
		componentName: escapeCSharpString(classInfo.className),
		componentType: classInfo.componentType,
		generatedMark: AUTO_GENERATED_CODE_MARK,
		namespaceName: plan.packageNamespace,
		packageName: escapeCSharpString(classInfo.packageName),
		url: escapeCSharpString(classInfo.url),
		variableLines: variableLines ? `${variableLines}\n` : '',
	});
}

function renderUnityBinder(classes: CodegenClass[], plan: ResolvedPackageCodegenPlan): string {
	const bindLines = classes
		.map((classInfo) => `\t\t\tUIObjectFactory.SetPackageItemExtension(${classInfo.encodedClassName}.URL, typeof(${classInfo.encodedClassName}));`)
		.join('\n');

	return renderTemplate(UNITY_BINDER_TEMPLATE, {
		binderClassName: plan.binderClassName,
		bindLines: bindLines ? `${bindLines}\n` : '',
		generatedMark: AUTO_GENERATED_CODE_MARK,
		namespaceName: plan.packageNamespace,
	});
}

function renderFguiTypescriptComponentClass(
	classInfo: CodegenClass,
	plan: ResolvedPackageCodegenPlan,
	variant: FguiTypescriptVariant,
): string {
	const variableLines = classInfo.members
		.filter((member) => !member.ignored)
		.map((member) => `\tpublic ${member.name}:${translateFguiTypescriptType(member.type, variant)};`)
		.join('\n');
	const assignmentLines = classInfo.members
		.map((member) => renderFguiTypescriptMemberAssignment(member, plan.settings.getMemberByName, variant))
		.filter((line): line is string => Boolean(line))
		.join('\n');
	const importLines = collectFguiTypescriptImports(classInfo, variant);

	return renderTemplate(FGUI_TYPESCRIPT_COMPONENT_TEMPLATE, {
		assignmentLines: assignmentLines ? `${assignmentLines}\n` : '',
		className: classInfo.encodedClassName,
		componentName: escapeTypeScriptString(classInfo.className),
		componentType: translateFguiTypescriptType(classInfo.componentType, variant),
		generatedMark: AUTO_GENERATED_CODE_MARK,
		importLines,
		packageName: escapeTypeScriptString(classInfo.packageName),
		runtimeNamespace: variant.runtimeNamespace,
		url: escapeTypeScriptString(classInfo.url),
		variableLines: variableLines ? `${variableLines}\n` : '',
	});
}

function renderFguiTypescriptBinder(
	classes: CodegenClass[],
	plan: ResolvedPackageCodegenPlan,
	variant: FguiTypescriptVariant,
): string {
	const bindLines = classes
		.map((classInfo) => `\t\t${variant.runtimeNamespace}.UIObjectFactory.${variant.binderMethod}(${classInfo.encodedClassName}.URL, ${classInfo.encodedClassName});`)
		.join('\n');
	const classImports = classes
		.map((classInfo) => `import ${classInfo.encodedClassName} from "./${classInfo.encodedClassName}";`)
		.join('\n');
	const importLines = [variant.runtimeImport, classImports].filter(Boolean).join('\n');

	return renderTemplate(FGUI_TYPESCRIPT_BINDER_TEMPLATE, {
		binderClassName: plan.binderClassName,
		bindLines: bindLines ? `${bindLines}\n` : '',
		generatedMark: AUTO_GENERATED_CODE_MARK,
		importLines: importLines ? `${importLines}\n\n` : '',
	});
}

function renderMemberAssignment(member: CodegenMember, getMemberByName: boolean): string | null {
	if (member.ignored) return null;
	if (member.type === 'Controller') {
		return getMemberByName
			? `\t\t\t${member.name} = this.GetController("${escapeCSharpString(member.originalName)}");`
			: `\t\t\t${member.name} = this.GetControllerAt(${member.index});`;
	}
	if (member.type === 'Transition') {
		return getMemberByName
			? `\t\t\t${member.name} = this.GetTransition("${escapeCSharpString(member.originalName)}");`
			: `\t\t\t${member.name} = this.GetTransitionAt(${member.index});`;
	}
	return getMemberByName
		? `\t\t\t${member.name} = (${member.type})this.GetChild("${escapeCSharpString(member.originalName)}");`
		: `\t\t\t${member.name} = (${member.type})this.GetChildAt(${member.index});`;
}

function renderFguiTypescriptMemberAssignment(
	member: CodegenMember,
	getMemberByName: boolean,
	variant: FguiTypescriptVariant,
): string | null {
	if (member.ignored) return null;
	if (member.type === 'Controller') {
		return getMemberByName
			? `\t\tthis.${member.name} = this.getController("${escapeTypeScriptString(member.originalName)}");`
			: `\t\tthis.${member.name} = this.getControllerAt(${member.index});`;
	}
	if (member.type === 'Transition') {
		return getMemberByName
			? `\t\tthis.${member.name} = this.getTransition("${escapeTypeScriptString(member.originalName)}");`
			: `\t\tthis.${member.name} = this.getTransitionAt(${member.index});`;
	}
	const translatedType = translateFguiTypescriptType(member.type, variant);
	return getMemberByName
		? `\t\tthis.${member.name} = <${translatedType}><any>(this.getChild("${escapeTypeScriptString(member.originalName)}"));`
		: `\t\tthis.${member.name} = <${translatedType}><any>(this.getChildAt(${member.index}));`;
}

function resolveCodePath(
	codePath: string,
	basePath: string | undefined,
	fs: Pick<PublishFileSystem, 'join'>,
): string {
	if (isAbsolutePathLike(codePath)) return trimTrailingSlashes(codePath);
	const projectBasePath = resolveProjectBasePath(basePath);
	return projectBasePath ? trimTrailingSlashes(fs.join(projectBasePath, codePath)) : trimTrailingSlashes(codePath);
}

export function resolveProjectBasePath(basePath: string | undefined): string {
	if (!basePath) return '';
	const normalized = trimTrailingSlashes(basePath);
	const assetsMatch = normalized.match(/^(.*)[/\\]assets(?:_[^/\\]+)?$/i);
	if (assetsMatch?.[1]) return assetsMatch[1];
	return dirname(normalized);
}

function isDefaultMemberName(ownerType: string, kind: CodegenMember['kind'], name: string): boolean {
	if (kind === 'controller') {
		return (ownerType === 'GButton' || ownerType === 'GComboBox') && name === 'button';
	}
	if (kind === 'transition') return false;

	if (ownerType === 'GButton' || ownerType === 'GLabel' || ownerType === 'GComboBox') {
		if (name === 'title' || name === 'icon') return true;
	}
	if (ownerType === 'GProgressBar') {
		if (name === 'bar' || name === 'bar_v' || name === 'title' || name === 'ani') return true;
	}
	if (ownerType === 'GSlider') {
		if (name === 'bar' || name === 'bar_v' || name === 'grip' || name === 'title' || name === 'ani') return true;
	}
	return /^n\d+(?:_.*)?$/i.test(name);
}

function applyMemberNamePrefix(name: string, prefix: string): string {
	const normalized = normalizeMemberName(name) || 'member';
	return prefix ? `${prefix}${normalized}` : normalized;
}

function normalizeMemberName(value: string): string {
	const cleaned = value.replace(/[^0-9A-Za-z_]+/g, '_').replace(/^_+|_+$/g, '');
	if (!cleaned) return '';
	return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

function normalizeTypeName(value: string): string {
	const cleaned = value.replace(/[^0-9A-Za-z_]+/g, '_').replace(/^_+|_+$/g, '');
	if (!cleaned) return '';
	const parts = cleaned.split(/_+/).filter(Boolean);
	const normalized = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
	return /^[0-9]/.test(normalized) ? `_${normalized}` : normalized;
}

function collectFguiTypescriptImports(classInfo: CodegenClass, variant: FguiTypescriptVariant): string {
	const imports = new Set<string>();
	if (variant.runtimeImport) imports.add(variant.runtimeImport);
	for (const member of classInfo.members) {
		if (member.ignored) continue;
		const translated = translateFguiTypescriptType(member.type, variant);
		if (!translated.includes('.')) {
			imports.add(`import ${translated} from "./${translated}";`);
		}
	}
	return imports.size > 0 ? `${[...imports].sort().join('\n')}\n\n` : '';
}

function translateFguiTypescriptType(typeName: string, variant: FguiTypescriptVariant): string {
	if (FGUI_TYPESCRIPT_RUNTIME_TYPES.has(typeName)) {
		return `${variant.runtimeNamespace}.${typeName}`;
	}
	return typeName;
}

function renderTemplate(template: string, data: Record<string, string>): string {
	let output = template;
	for (const [key, value] of Object.entries(data)) {
		output = output.replaceAll(`{{${key}}}`, value);
	}
	return output;
}

function escapeCSharpString(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeTypeScriptString(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function writeTextFile(fs: PublishFileSystem, filePath: string, content: string): Promise<void> {
	await fs.writeFileRaw(filePath, encodeText(content));
}

export function encodeText(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

export function decodeText(value: Uint8Array): string {
	return new TextDecoder().decode(value);
}
