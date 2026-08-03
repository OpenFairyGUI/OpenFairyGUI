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
	try {
		const pkg = require('../../package.json') as { version?: unknown };
		if (typeof pkg.version === 'string' && pkg.version.length > 0) {
			return pkg.version;
		}
	} catch {
		// Keep the CLI usable when executed from a bundled artifact missing package.json.
	}
	return '0.0.0-dev';
}
