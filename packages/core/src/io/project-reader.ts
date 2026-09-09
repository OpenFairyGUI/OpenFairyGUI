import { Document } from '../document.js';
import type { Component } from '../properties/component.js';
import type { ProjectSettings } from '../types/settings.js';
import { assertWellFormedXml, getXmlNode, parseXML } from '../utils/xml-utils.js';
import { ReaderContext } from './reader-context.js';
import type { FileSystem } from './file-system.js';
import { readComponentXml } from './component-xml-reader.js';
import type { ProjectDiagnostic } from '../validation.js';
import type { ProjectReadOptions, ProjectReadResult } from './project-io-contracts.js';
import { readProjectDirectory } from './project-reader-discovery.js';
import { getProjectComponentExtras, linkPackageBranchItems, readPackageDescription } from './project-package-reader.js';
import { hydratePackageImageSizes, hydratePackageResourceBytes } from './project-resource-hydration.js';
import { validateComponentXmlValues } from './project-component-xml-validation.js';

export type { ProjectReadOptions, ProjectReadResult } from './project-io-contracts.js';

type XmlNode = Record<string, unknown>;
type ProjectSettingKey = 'publish' | 'common' | 'adaptation' | 'customProperties' | 'i18n';

interface FairyProjectDescriptionNode extends XmlNode {
	id?: string;
	type?: string;
	version?: string;
}

function assignSetting(
	settings: ProjectSettings,
	key: ProjectSettingKey,
	value: unknown,
): void {
	switch (key) {
		case 'publish':
			settings.publish = value as ProjectSettings['publish'];
			break;
		case 'common':
			settings.common = value as ProjectSettings['common'];
			break;
		case 'adaptation':
			settings.adaptation = value as ProjectSettings['adaptation'];
			break;
		case 'customProperties':
			settings.customProperties = value as ProjectSettings['customProperties'];
			break;
		case 'i18n':
			settings.i18n = value as ProjectSettings['i18n'];
			break;
	}
}

function getProjectBasePath(fs: FileSystem, projectPath: string): string {
	const basePath = fs.dirname(projectPath);
	return basePath === '.' ? '' : basePath;
}

export class ProjectReader {
	private readonly _fs: FileSystem;

	constructor(fs: FileSystem) {
		this._fs = fs;
	}

	async read(projectPath: string, options: ProjectReadOptions = {}): Promise<Document> {
		return this._read(projectPath, options);
	}

	async readDetailed(projectPath: string, options: ProjectReadOptions = {}): Promise<ProjectReadResult> {
		const diagnostics: ProjectDiagnostic[] = [];
		try {
			const document = await this._read(projectPath, options, diagnostics);
			return {
				document,
				diagnostics,
				complete: !diagnostics.some((diagnostic) => [
					'invalid_project_xml',
					'invalid_package_xml',
					'invalid_branch_package_xml',
					'invalid_component_xml',
					'invalid_settings_json',
					'unreadable_source',
					'unsupported_resource_kind',
				].includes(diagnostic.code)),
			};
		} catch (error) {
			diagnostics.push({
				severity: 'error',
				code: 'invalid_project_xml',
				path: 'project',
				message: error instanceof Error ? error.message : String(error),
				sourcePath: projectPath,
			});
			return { document: null, diagnostics, complete: false };
		}
	}

	private async _read(
		projectPath: string,
		options: ProjectReadOptions,
		diagnostics?: ProjectDiagnostic[],
	): Promise<Document> {
		const fs = this._fs;
		const doc = new Document();
		const basePath = getProjectBasePath(fs, projectPath);
		doc.setProjectDir(basePath);
		const ctx = new ReaderContext(doc, basePath, diagnostics);

		// 1. Parse .fairy file
		const fairyContent = await fs.readFile(projectPath);
		if (diagnostics) assertWellFormedXml(fairyContent);
		const fairyXML = parseXML(fairyContent);
		const projDesc = getXmlNode<FairyProjectDescriptionNode>(fairyXML.projectDescription);
		if (projDesc) {
			const root = doc.getRoot();
			root.setProjectId(projDesc.id ?? '');
			root.setProjectType(this._resolveProjectType(projDesc.type ?? ''));
			root.setVersion(projDesc.version ?? '');
		} else {
			ctx.addDiagnostic({
				severity: 'error',
				code: 'invalid_project_xml',
				path: 'projectDescription',
				message: 'Project file must contain a projectDescription root element.',
				sourcePath: projectPath,
			});
		}

		// 2. Read settings
		await this._readSettings(ctx);

		// 3. Scan packages
		const assetsPath = fs.join(basePath, 'assets');
		const packageDirs = await readProjectDirectory(fs, assetsPath, { diagnostics, optional: true }) ?? [];

		for (const dirName of packageDirs) {
			const pkgXmlPath = fs.join(assetsPath, dirName, 'package.xml');
			if (!(await fs.exists(pkgXmlPath))) continue;

			try {
				await this._readPackage(ctx, dirName, pkgXmlPath, '', options, diagnostics !== undefined);
			} catch (error) {
				if (!diagnostics) throw error;
				ctx.addDiagnostic({
					severity: 'error',
					code: 'invalid_package_xml',
					path: `packages.${dirName}`,
					message: error instanceof Error ? error.message : String(error),
					sourcePath: pkgXmlPath,
				});
			}
		}

		const branchNames = await this._readPackageBranches(ctx, options, diagnostics !== undefined);
		if (branchNames.length > 0) {
			doc.getRoot().setBranches(branchNames);
		}
		linkPackageBranchItems(doc);

		// 4. Parse component XMLs (second pass, after all resources registered)
		for (const [_key, resource] of ctx.resourceMap) {
			if (resource.propertyType !== 'Component') continue;
			const comp = resource as Component;
			const compPath = getProjectComponentExtras(comp)._filePath;
			if (!compPath) continue;

			try {
				const compContent = await fs.readFile(compPath);
				if (diagnostics) {
					assertWellFormedXml(compContent);
					const componentNode = getXmlNode<XmlNode>(parseXML(compContent).component);
					if (!componentNode) throw new Error('Component XML must contain a component root element.');
					validateComponentXmlValues(ctx, comp, compPath, componentNode);
				}
				readComponentXml(ctx, comp, compContent);
			} catch (err) {
				ctx.logger.warn(`Failed to parse component: ${compPath} — ${err}`);
				ctx.addDiagnostic({
					severity: 'error',
					code: await fs.exists(compPath) ? 'invalid_component_xml' : 'missing_source',
					path: `components.${comp.getId()}`,
					message: `Failed to read component "${comp.getName()}": ${err instanceof Error ? err.message : String(err)}`,
					resourceId: comp.getId(),
					sourcePath: compPath,
				});
			}
		}

		return doc;
	}

	private async _readPackageBranches(
		ctx: ReaderContext,
		options: ProjectReadOptions,
		collectDiagnostics = false,
	): Promise<string[]> {
		const fs = this._fs;
		const dirNames = await readProjectDirectory(fs, ctx.basePath, { diagnostics: collectDiagnostics ? ctx.diagnostics : undefined }) ?? [];

		const branchNames = dirNames
			.filter((dirName) => dirName.startsWith('assets_') && dirName.length > 'assets_'.length)
			.map((dirName) => dirName.slice('assets_'.length))
			.sort((a, b) => a.localeCompare(b));

		for (const branchName of branchNames) {
			const branchAssetsPath = fs.join(ctx.basePath, `assets_${branchName}`);
			const packageDirs = await readProjectDirectory(fs, branchAssetsPath, { diagnostics: collectDiagnostics ? ctx.diagnostics : undefined }) ?? [];

			for (const dirName of packageDirs) {
				const pkgXmlPath = fs.join(branchAssetsPath, dirName, 'package_branch.xml');
				if (!(await fs.exists(pkgXmlPath))) continue;
				try {
					await this._readPackage(ctx, dirName, pkgXmlPath, branchName, options, collectDiagnostics);
				} catch (error) {
					if (!collectDiagnostics) throw error;
					ctx.addDiagnostic({
						severity: 'error',
						code: 'invalid_branch_package_xml',
						path: `branches.${branchName}.packages.${dirName}`,
						message: error instanceof Error ? error.message : String(error),
						sourcePath: pkgXmlPath,
					});
				}
			}
		}

		return branchNames;
	}

	private async _readSettings(ctx: ReaderContext): Promise<void> {
		const fs = this._fs;
		const settingsPath = fs.join(ctx.basePath, 'settings');

		const settingFiles: Array<{ name: string; key: ProjectSettingKey }> = [
			{ name: 'Publish.json', key: 'publish' },
			{ name: 'Common.json', key: 'common' },
			{ name: 'Adaptation.json', key: 'adaptation' },
			{ name: 'CustomProperties.json', key: 'customProperties' },
			{ name: 'i18n.json', key: 'i18n' },
		];

		for (const { name, key } of settingFiles) {
			const filePath = fs.join(settingsPath, name);
			try {
				if (await fs.exists(filePath)) {
					const content = await fs.readFile(filePath);
					assignSetting(ctx.settings, key, JSON.parse(content));
				}
			} catch (error) {
				ctx.addDiagnostic({
					severity: 'error',
					code: 'invalid_settings_json',
					path: `settings.${name}`,
					message: `Failed to read ${name}: ${error instanceof Error ? error.message : String(error)}`,
					sourcePath: filePath,
				});
			}
		}

		ctx.document.getRoot().setSettings(ctx.settings);
	}

	private async _readPackage(
		ctx: ReaderContext, dirName: string, pkgXmlPath: string, branchName = '',
		options: ProjectReadOptions = {}, validateSyntax = false,
	): Promise<void> {
		const parsed = await readPackageDescription(this._fs, ctx, dirName, pkgXmlPath, branchName, validateSyntax);
		if (!parsed) return;
		const { pkg, packageDir, resources } = parsed;
		await hydratePackageImageSizes(this._fs, resources, packageDir);
		if (options.hydrateResourceBytes) {
			await hydratePackageResourceBytes(this._fs, ctx, resources, packageDir, pkg.getId());
		}
	}

	private _resolveProjectType(typeStr: string): number {
		const map: Record<string, number> = {
			Unity: 0, Flash: 1, Starling: 2, CocosCreator: 3,
			Layabox: 4, LayaBox: 4, Egret: 5, Haxe: 6, Pixi: 7,
			LibGDX: 8, Unreal: 9, CryEngine: 10, MonoGame: 11, Vision: 12,
		};
		return map[typeStr] ?? 0;
	}
}
