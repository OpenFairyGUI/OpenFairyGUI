import { RefSet } from 'property-graph';
import { type Nullable, PropertyType } from '../constants.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { Component } from './component.js';
import type { ImageResource } from './image-resource.js';
import type { SoundResource } from './sound-resource.js';
import type { FontResource } from './font-resource.js';
import type { MovieClipResource } from './movie-clip-resource.js';
import type { Atlas } from './atlas.js';
import type { Property } from './property.js';

type PackageResource = Component | ImageResource | SoundResource | FontResource | MovieClipResource;

interface IPackage extends IExtensibleProperty {
	id: string;
	publishName: string;
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
			publishName: '',
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

	public getPublishName(): string {
		return this.get('publishName');
	}

	public setPublishName(name: string): this {
		return this.set('publishName', name);
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
