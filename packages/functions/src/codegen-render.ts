import { type Document, ProjectType } from '@openfairygui/core';
import {
	AUTO_GENERATED_CODE_MARK, FGUI_TYPESCRIPT_BINDER_TEMPLATE, FGUI_TYPESCRIPT_COMPONENT_TEMPLATE,
	UNITY_BINDER_TEMPLATE, UNITY_COMPONENT_TEMPLATE,
} from './codegen-templates.js';
import type { CodegenClass, CodegenMember } from './codegen-model.js';
import type { ResolvedPackageCodegenPlan } from './codegen-settings.js';

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

export function resolveFguiTypescriptVariant(doc: Document): FguiTypescriptVariant | null {
	const projectType = doc.getRoot().getProjectType();
	if (projectType === ProjectType.LayaBox) return LAYABOX_TYPESCRIPT_VARIANT;
	if (projectType === ProjectType.CocosCreator) return COCOS_CREATOR_TYPESCRIPT_VARIANT;
	return null;
}

export function* renderCodegenFiles(
	classes: CodegenClass[], plan: ResolvedPackageCodegenPlan, variant: FguiTypescriptVariant | null,
): Generator<{ name: string; content: string }> {
	const extension = variant ? '.ts' : '.cs';
	for (const classInfo of classes) {
		yield {
			name: classInfo.encodedClassName + extension,
			content: variant ? renderFguiTypescriptComponentClass(classInfo, plan, variant) : renderUnityComponentClass(classInfo, plan),
		};
	}
	yield {
		name: plan.binderClassName + extension,
		content: variant ? renderFguiTypescriptBinder(classes, plan, variant) : renderUnityBinder(classes, plan),
	};
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

