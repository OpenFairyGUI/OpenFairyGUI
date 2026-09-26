#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const entry = path.resolve(__dirname, '../dist/cli.mjs');

import(pathToFileURL(entry).href)
	.then((module) => module.runCli(process.argv))
	.catch((error) => {
		console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
		process.exitCode = 1;
	});
