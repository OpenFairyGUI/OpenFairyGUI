import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
declare const __OPENFAIRYGUI_PACKAGE_VERSION__: string | undefined;

function getInjectedPackageVersion(): string | null {
	const version = typeof __OPENFAIRYGUI_PACKAGE_VERSION__ === 'string' ? __OPENFAIRYGUI_PACKAGE_VERSION__ : null;
	return typeof version === 'string' && version.length > 0 ? version : null;
}

export function readPackageVersion(): string {
	const injectedVersion = getInjectedPackageVersion();
	if (injectedVersion) return injectedVersion;
	for (const candidate of ['../package.json', '../../package.json']) {
		try {
			const pkg = require(candidate) as { name?: unknown; version?: unknown };
			if (pkg.name === '@openfairygui/cli' && typeof pkg.version === 'string' && pkg.version.length > 0) {
				return pkg.version;
			}
		} catch {
			// Try next fallback candidate when executed from dist/ vs src/.
		}
	}
	return '0.0.0-dev';
}
