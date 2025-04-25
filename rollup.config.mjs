// @ts-check
import { defineConfig } from 'rollup';
import { fileURLToPath } from 'node:url';
import { globby } from 'globby';
import path from 'path';

import rollupPlugin from './src/index.mjs';

// Find all fixture files
const fixtureFiles = await globby('./fixtures/*.jsx');

// Create a config for each fixture file
export default fixtureFiles.map((fixturePath) => {
  // Get the basename without extension to use as output name
  const baseName = path.basename(fixturePath, path.extname(fixturePath));

  return defineConfig({
    input: fixturePath,
    output: {
      format: 'esm',
      dir: 'dist',
      // Preserve directory structure relative to fixtures
      entryFileNames: `[name].js`,
    },
    jsx: 'preserve',
    plugins: [rollupPlugin()],
    // Add fixture name as a property for better logging
    onwarn(warning, warn) {
      // Customize warning handling if needed
      warn(warning);
    },
  });
});
