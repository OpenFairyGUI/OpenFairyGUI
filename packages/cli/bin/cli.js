#!/usr/bin/env node
// Delegate to the CommonJS launcher for wider Node compatibility.
import { createRequire } from 'node:module';

createRequire(import.meta.url)('./cli.cjs');
