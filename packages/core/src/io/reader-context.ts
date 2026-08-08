import type { Document } from '../document.js';
import type { Package } from '../properties/package.js';
import type { Property } from '../properties/property.js';
import type { Controller } from '../properties/controller.js';
import type { ProjectSettings } from '../types/settings.js';
import type { ILogger } from '../utils/logger.js';
import type { ProjectDiagnostic } from '../validation.js';

export class ReaderContext {
	public readonly document: Document;
	public readonly logger: ILogger;
	public readonly basePath: string;
	public readonly settings: ProjectSettings = {};
	public readonly diagnostics: ProjectDiagnostic[];

	/** packageId → Package */
	public readonly packageMap = new Map<string, Package>();

	/** packageId+resourceId → Property (ImageResource, Component, etc.) */
	public readonly resourceMap = new Map<string, Property>();

	/** packageId+controllerName → Controller (for gear resolution within a component) */
	public readonly controllerMap = new Map<string, Controller>();

	constructor(document: Document, basePath: string, diagnostics: ProjectDiagnostic[] = []) {
		this.document = document;
		this.logger = document.getLogger();
		this.basePath = basePath;
		this.diagnostics = diagnostics;
	}

	public addDiagnostic(diagnostic: ProjectDiagnostic): void {
		this.diagnostics.push(diagnostic);
	}

	public registerResource(packageId: string, resourceId: string, property: Property): void {
		this.resourceMap.set(packageId + resourceId, property);
	}

	public resolveResource(packageId: string, resourceId: string): Property | null {
		return this.resourceMap.get(packageId + resourceId) || null;
	}

	public resolveURL(url: string): Property | null {
		if (!url || !url.startsWith('ui://')) return null;
		const body = url.substring(5);
		if (body.length < 8) return null;
		const packageId = body.substring(0, 8);
		const resourceId = body.substring(8);
		return this.resolveResource(packageId, resourceId);
	}
}
