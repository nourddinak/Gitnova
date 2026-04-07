#!/usr/bin/env node

import { main } from '../src/index.js';

// Entry point execution
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
