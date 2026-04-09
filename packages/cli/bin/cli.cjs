#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const entry = path.resolve(__dirname, '../dist/cli.mjs');

try {
	execFileSync(process.execPath, [entry, ...process.argv.slice(2)], {
		stdio: 'inherit',
		env: process.env,
	});
} catch (e) {
	process.exit(e && e.status ? e.status : 1);
}
