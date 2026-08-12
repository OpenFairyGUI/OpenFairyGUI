import type { Graph } from 'property-graph';
import { RefSet } from 'property-graph';
import { type Nullable, PropertyType, VERSION } from '../constants.js';
import type { Extension } from '../extension.js';
import { ExtensibleProperty, type IExtensibleProperty } from './extensible-property.js';
import type { ExtensionProperty } from './extension-property.js';
import type { Package } from './package.js';
import { COPY_IDENTITY, type Property } from './property.js';
import type { ProjectSettings } from '../types/settings.js';

interface IRoot extends IExtensibleProperty {
	projectId: string;
	projectType: number;
	version: string;
	branches: string[];
	settings: ProjectSettings;
	packages: RefSet<Package>;
}

/**
 * Root property of a FairyGUI project.
 *
 * Any properties to be exported must be referenced (directly or indirectly) by the root.
 * Properties are added to the root via factory methods on its {@link Document}, and
 * removed by calling {@link Property.dispose}().
 *
 * @category Properties
 */
export class Root extends ExtensibleProperty<IRoot> {
	public declare propertyType: PropertyType.ROOT;

	private readonly _extensions: Set<Extension> = new Set();

	protected init(): void {
		this.propertyType = PropertyType.ROOT;
	}

	protected getDefaults(): Nullable<IRoot> {
		return Object.assign(super.getDefaults(), {
			projectId: '',
			projectType: 0,
			version: VERSION,
			branches: [],
			settings: {},
			packages: new RefSet<Package>(),
		});
	}

	/** @internal */
	constructor(graph: Graph<Property>) {
		super(graph);
		graph.addEventListener('node:create', (event) => {
			this._addChildOfRoot(event.target as Property);
		});
	}

	public clone(): this {
		throw new Error('Root cannot be cloned.');
	}

	public copy(other: this, resolve: typeof COPY_IDENTITY = COPY_IDENTITY): this {
		if (resolve === COPY_IDENTITY) throw new Error('Root cannot be copied.');

		this.set('projectId', other.get('projectId'));
		this.set('projectType', other.get('projectType'));
		this.set('version', other.get('version'));
		this.set('branches', other.get('branches'));
		this.set('settings', other.get('settings'));
		this.setName(other.getName());
		this.setExtras({ ...other.getExtras() });

		for (const extensionName of other.listRefMapKeys('extensions')) {
			const otherExtension = other.getExtension(extensionName) as ExtensionProperty;
			this.setExtension(extensionName, resolve(otherExtension));
		}

		return this;
	}

	private _addChildOfRoot(child: Property): this {
		// Package is the only top-level property tracked directly by Root.
		// Other properties are tracked by their parent Package or Component.
		if (child.propertyType === PropertyType.PACKAGE) {
			this.addRef('packages', child as unknown as Package);
		}
		return this;
	}

	/****** Project metadata ******/

	public getProjectId(): string {
		return this.get('projectId');
	}

	public setProjectId(id: string): this {
		return this.set('projectId', id);
	}

	public getProjectType(): number {
		return this.get('projectType');
	}

	public setProjectType(type: number): this {
		return this.set('projectType', type);
	}

	public getVersion(): string {
		return this.get('version');
	}

	public setVersion(version: string): this {
		return this.set('version', version);
	}

	public listBranches(): string[] {
		return [...this.get('branches')];
	}

	public setBranches(branches: string[]): this {
		return this.set('branches', [...new Set(branches)].sort((left, right) => left.localeCompare(right)));
	}

	public addBranch(branch: string): this {
		if (!branch) return this;
		return this.setBranches([...this.listBranches(), branch]);
	}

	public getSettings(): ProjectSettings {
		return structuredClone(this.get('settings'));
	}

	public setSettings(settings: ProjectSettings): this {
		return this.set('settings', structuredClone(settings));
	}

	/****** Extensions ******/

	public listExtensionsUsed(): Extension[] {
		return Array.from(this._extensions);
	}

	public listExtensionsRequired(): Extension[] {
		return this.listExtensionsUsed().filter((extension) => extension.isRequired());
	}

	/** @internal */
	public _enableExtension(extension: Extension): this {
		this._extensions.add(extension);
		return this;
	}

	/** @internal */
	public _disableExtension(extension: Extension): this {
		this._extensions.delete(extension);
		return this;
	}

	/****** Packages ******/

	public listPackages(): Package[] {
		return this.listRefs('packages');
	}

	public getPackage(name: string): Package | null {
		return this.listPackages().find((p) => p.getName() === name) || null;
	}

	public getPackageById(id: string): Package | null {
		return this.listPackages().find((p) => p.getId() === id) || null;
	}
}
