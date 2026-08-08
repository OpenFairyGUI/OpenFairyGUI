import { RefSet } from 'property-graph';
import { type Nullable, PropertyType } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { Component } from './component.js';
import type { ImageResource } from './image-resource.js';
import type { MiscResource } from './misc-resource.js';
import type { SoundResource } from './sound-resource.js';
import type { FontResource } from './font-resource.js';
import type { MovieClipResource } from './movie-clip-resource.js';
import type { SwfResource } from './swf-resource.js';
import type { SpineResource } from './spine-resource.js';
import type { DragonBonesResource } from './dragon-bones-resource.js';
import type { Atlas } from './atlas.js';
import type { Property } from './property.js';

type PackageResource =
	| Component
	| ImageResource
	| MiscResource
	| SoundResource
	| FontResource
	| MovieClipResource
	| SwfResource
	| SpineResource
	| DragonBonesResource;

export interface PackageResourceFolder {
	branch: string;
	path: string;
	favorite: boolean;
	atlas: string;
}

export type PackageAtlasSizeOption = 'pot' | 'npot' | 'mof';

export interface PackageSourceAtlas {
	index: number;
	name: string;
	compression: boolean;
}

export interface PackageSourceAtlasSettings {
	useGlobal: boolean;
	maxSize: number;
	sizeOption: PackageAtlasSizeOption;
	forceSquare: boolean;
	allowRotation: boolean;
	paging: boolean;
	extractAlpha: boolean;
	maxIndex: number;
	atlases: PackageSourceAtlas[];
	excludedResourceIds: string[];
}

interface IPackage extends IExtensibleProperty {
	id: string;
	compressPNG: boolean | null;
	jpegQuality: number | null;
	publishName: string;
	publishPath: string;
	publishBranchPath: string;
	publishPackageCount: number;
	genCode: boolean;
	codePath: string;
	sourceAtlasSettings: PackageSourceAtlasSettings;
	branchNames: string[];
	resourceFolders: PackageResourceFolder[];
	resources: RefSet<Property>;
	atlases: RefSet<Atlas>;
	dependencies: RefSet<Property>;
}

/**
 * A FairyGUI package containing a set of related resources.
 *
 * Packages are the primary organizational unit. Each package has a unique 8-character ID,
 * a name, and a set of resources (images, components, fonts, sounds, etc.).
 *
 * @category Properties
 */
export class Package extends ExtensibleProperty<IPackage> {
	public declare propertyType: PropertyType.PACKAGE;

	protected init(): void {
		this.propertyType = PropertyType.PACKAGE;
	}

	protected getDefaults(): Nullable<IPackage> {
		return Object.assign(super.getDefaults(), {
			id: '',
			compressPNG: null,
			jpegQuality: null,
			publishName: '',
			publishPath: '',
			publishBranchPath: '',
			publishPackageCount: 0,
			genCode: false,
			codePath: '',
			sourceAtlasSettings: {
				useGlobal: true,
				maxSize: 2048,
				sizeOption: 'pot',
				forceSquare: false,
				allowRotation: false,
				paging: true,
				extractAlpha: false,
				maxIndex: 10,
				atlases: [],
				excludedResourceIds: [],
			},
			branchNames: [],
			resourceFolders: [],
			resources: new RefSet<Property>(),
			atlases: new RefSet<Atlas>(),
			dependencies: new RefSet<Property>(),
		});
	}

	public getId(): string {
		return this.get('id');
	}

	public setId(id: string): this {
		return this.set('id', id);
	}

	public getCompressPNG(): boolean | null {
		return this.get('compressPNG');
	}

	public setCompressPNG(value: boolean | null): this {
		return this.set('compressPNG', value);
	}

	public getJpegQuality(): number | null {
		return this.get('jpegQuality');
	}

	public setJpegQuality(value: number | null): this {
		return this.set('jpegQuality', value);
	}

	public getPublishName(): string {
		return this.get('publishName');
	}

	public setPublishName(name: string): this {
		return this.set('publishName', name);
	}

	public getPublishPath(): string {
		return this.get('publishPath');
	}

	public setPublishPath(path: string): this {
		return this.set('publishPath', path);
	}

	public getPublishBranchPath(): string {
		return this.get('publishBranchPath');
	}

	public setPublishBranchPath(path: string): this {
		return this.set('publishBranchPath', path);
	}

	public getPublishPackageCount(): number {
		return this.get('publishPackageCount');
	}

	public setPublishPackageCount(count: number): this {
		return this.set('publishPackageCount', count);
	}

	public getGenCode(): boolean {
		return this.get('genCode');
	}

	public setGenCode(value: boolean): this {
		return this.set('genCode', value);
	}

	public getCodePath(): string {
		return this.get('codePath');
	}

	public setCodePath(path: string): this {
		return this.set('codePath', path);
	}

	public getSourceAtlasSettings(): PackageSourceAtlasSettings {
		const settings = this.get('sourceAtlasSettings' as never) as PackageSourceAtlasSettings;
		return {
			...settings,
			atlases: settings.atlases.map((atlas) => ({ ...atlas })),
			excludedResourceIds: [...settings.excludedResourceIds],
		};
	}

	public setSourceAtlasSettings(settings: PackageSourceAtlasSettings): this {
		return this.set('sourceAtlasSettings' as never, {
			...settings,
			atlases: settings.atlases.map((atlas) => ({ ...atlas })),
			excludedResourceIds: [...settings.excludedResourceIds],
		} as never);
	}

	public listBranchNames(): string[] {
		return [...this.get('branchNames')];
	}

	public setBranchNames(names: string[]): this {
		return this.set('branchNames', [...names]);
	}

	public addBranchName(name: string): this {
		if (!this.get('branchNames').includes(name)) this.set('branchNames', [...this.get('branchNames'), name]);
		return this;
	}

	public listResourceFolders(): PackageResourceFolder[] {
		return (this.get('resourceFolders' as never) as PackageResourceFolder[]).map((folder) => ({ ...folder }));
	}

	public setResourceFolders(folders: PackageResourceFolder[]): this {
		return this.set('resourceFolders' as never, folders.map((folder) => ({ ...folder })) as never);
	}

	public addResource(resource: PackageResource): this {
		return this.addRef('resources', resource);
	}

	public removeResource(resource: PackageResource): this {
		return this.removeRef('resources', resource);
	}

	public listResources(): PackageResource[] {
		return this.listRefs('resources') as PackageResource[];
	}

	public getResourceById(id: string): PackageResource | null {
		return this.listResources().find((resource) => resource.getId?.() === id) ?? null;
	}

	public listComponents(): Component[] {
		return this.listResources().filter((r) => r.propertyType === PropertyType.COMPONENT) as Component[];
	}

	public listImageResources(): ImageResource[] {
		return this.listResources().filter((r) => r.propertyType === PropertyType.IMAGE_RESOURCE) as ImageResource[];
	}

	public getComponent(name: string): Component | null {
		return this.listComponents().find((c) => c.getName() === name) || null;
	}

	public addAtlas(atlas: Atlas): this {
		return this.addRef('atlases', atlas);
	}

	public removeAtlas(atlas: Atlas): this {
		return this.removeRef('atlases', atlas);
	}

	public listAtlases(): Atlas[] {
		return this.listRefs('atlases');
	}

	public addDependency(dep: Package): this {
		return this.addRef('dependencies', dep);
	}

	public removeDependency(dep: Package): this {
		return this.removeRef('dependencies', dep);
	}

	public listDependencies(): Package[] {
		return this.listRefs('dependencies') as Package[];
	}
}
