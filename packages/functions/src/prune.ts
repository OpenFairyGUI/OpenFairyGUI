import type { Document, Transform } from '@openfairygui/core';
import { createTransform } from './utils.js';

export interface PruneOptions {
	/** Remove components with no children. Default: false. */
	emptyComponents?: boolean;
	/** Remove unreferenced resources (images, sounds, fonts, movieclips not used in any component). Default: true. */
	unusedResources?: boolean;
}

const PRUNE_DEFAULTS: Required<PruneOptions> = {
	emptyComponents: false,
	unusedResources: true,
};

/**
 * Removes unreferenced resources from the project.
 *
 * By default, removes image/sound/font/movieclip resources that are not
 * referenced by any component's display objects via `src` or `ui://` URLs.
 *
 * ```ts
 * await doc.transform(prune());
 * await doc.transform(prune({ emptyComponents: true }));
 * ```
 */
export function prune(_options: PruneOptions = {}): Transform {
	const options = { ...PRUNE_DEFAULTS, ..._options };

	return createTransform('prune', (doc: Document): void => {
		const root = doc.getRoot();
		const logger = doc.getLogger();
		let pruned = 0;

		if (options.unusedResources) {
			// Collect all src references from all component display objects
			const referencedIds = new Set<string>();

			for (const pkg of root.listPackages()) {
				for (const comp of pkg.listComponents()) {
					for (const child of comp.listChildren()) {
						const src = (child as any).getSrc?.() as string | undefined;
						if (!src) continue;
						if (src.startsWith('ui://')) {
							// Extract resourceId part (after 8-char packageId)
							const idPart = src.slice(5);
							if (idPart.length > 8) {
								referencedIds.add(idPart.slice(8));
							} else {
								referencedIds.add(idPart);
							}
						} else {
							referencedIds.add(src);
						}
					}
				}
			}

			// Remove unreferenced non-component resources
			for (const pkg of root.listPackages()) {
				const resources = pkg.listResources();
				for (const res of resources) {
					if (res.propertyType === 'Component') continue; // skip components
					const resId = (res as any).getId?.() ?? '';
					if (resId && !referencedIds.has(resId) && !(res as any).getExported?.()) {
						res.dispose();
						pruned++;
					}
				}
			}
		}

		if (options.emptyComponents) {
			for (const pkg of root.listPackages()) {
				for (const comp of pkg.listComponents()) {
					if (comp.listChildren().length === 0 && !(comp as any).getExported?.()) {
						comp.dispose();
						pruned++;
					}
				}
			}
		}

		logger.info(`prune: Removed ${pruned} unused resource(s).`);
	});
}
