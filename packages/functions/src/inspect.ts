import type { Document, Package } from '@openfairygui/core';

/**
 * Summary report for a single resource category.
 */
export interface InspectCategoryReport {
	count: number;
	details: Array<{ name: string; id: string; path?: string; exported?: boolean }>;
}

/**
 * Full inspection report for a FairyGUI project.
 */
export interface InspectReport {
	projectId: string;
	projectType: number;
	version: string;
	packages: Array<{
		name: string;
		id: string;
		publishName: string;
		resources: {
			images: InspectCategoryReport;
			sounds: InspectCategoryReport;
			fonts: InspectCategoryReport;
			movieClips: InspectCategoryReport;
			components: InspectCategoryReport;
		};
		componentDetails: Array<{
			name: string;
			id: string;
			childCount: number;
			controllerCount: number;
			transitionCount: number;
		}>;
	}>;
	totals: {
		packages: number;
		images: number;
		sounds: number;
		fonts: number;
		movieClips: number;
		components: number;
		displayObjects: number;
		gears: number;
		controllers: number;
		transitions: number;
	};
}

type PackageResource = ReturnType<Package['listResources']>[number];
type InspectableComponent = ReturnType<Package['listComponents']>[number];

function mapResource(resource: PackageResource): InspectCategoryReport['details'][number] {
	return {
		name: resource.getName(),
		id: resource.getId(),
		path: resource.getPath?.() ?? '/',
		exported: resource.getExported?.() ?? false,
	};
}

function mapComponentDetail(
	component: InspectableComponent,
	totals: InspectReport['totals'],
): InspectReport['packages'][number]['componentDetails'][number] {
	const children = component.listChildren();
	const controllers = component.listControllers();
	const transitions = component.listTransitions();

	totals.displayObjects += children.length;
	totals.controllers += controllers.length;
	totals.transitions += transitions.length;

	for (const child of children) {
		totals.gears += child.listGears().length;
	}

	return {
		name: component.getName(),
		id: component.getId(),
		childCount: children.length,
		controllerCount: controllers.length,
		transitionCount: transitions.length,
	};
}

/**
 * Generates a detailed report of the project contents.
 *
 * Unlike other transforms, `inspect()` does NOT modify the document —
 * it returns a structured report.
 *
 * ```ts
 * const report = inspect(doc);
 * console.log(`${report.totals.packages} packages, ${report.totals.components} components`);
 * ```
 */
export function inspect(doc: Document): InspectReport {
	const root = doc.getRoot();
	const totals = {
		packages: 0, images: 0, sounds: 0, fonts: 0,
		movieClips: 0, components: 0, displayObjects: 0,
		gears: 0, controllers: 0, transitions: 0,
	};

	const packages = root.listPackages().map((pkg) => {
		totals.packages++;
		const resources = pkg.listResources();

		const images = resources.filter((r) => r.propertyType === 'ImageResource');
		const sounds = resources.filter((r) => r.propertyType === 'SoundResource');
		const fonts = resources.filter((r) => r.propertyType === 'FontResource');
		const movieClips = resources.filter((r) => r.propertyType === 'MovieClipResource');
		const components = pkg.listComponents();

		totals.images += images.length;
		totals.sounds += sounds.length;
		totals.fonts += fonts.length;
		totals.movieClips += movieClips.length;
		totals.components += components.length;
		const componentDetails = components.map((component) => mapComponentDetail(component, totals));

		return {
			name: pkg.getName(),
			id: pkg.getId(),
			publishName: pkg.getPublishName() || pkg.getName(),
			resources: {
				images: { count: images.length, details: images.map(mapResource) },
				sounds: { count: sounds.length, details: sounds.map(mapResource) },
				fonts: { count: fonts.length, details: fonts.map(mapResource) },
				movieClips: { count: movieClips.length, details: movieClips.map(mapResource) },
				components: { count: components.length, details: components.map(mapResource) },
			},
			componentDetails,
		};
	});

	return {
		projectId: root.getProjectId(),
		projectType: root.getProjectType(),
		version: root.getVersion(),
		packages,
		totals,
	};
}
