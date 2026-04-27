#!/usr/bin/env node
'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

const entry = path.resolve(__dirname, '../dist/stdio.mjs');

import(pathToFileURL(entry).href)
	.then((module) => module.connectOpenFairyGuiMcpStdio())
	.catch((error) => {
		console.error(error instanceof Error ? error.stack ?? error.message : String(error));
		process.exitCode = 1;
	});
