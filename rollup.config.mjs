// @ts-check
import { globby } from "globby";
import { defineConfig } from "rollup";
import path from 'node:path';
import { fileURLToPath } from "node:url";

import rollupPlugin from './src/index.mjs';

const files = await globby('./fixtures/*.tsx');

export default defineConfig({
  input: Object.fromEntries(files.map(file => [
    path.relative('./fixtures', file.slice(0, file.length - path.extname(file).length)),
    fileURLToPath(new URL(file, import.meta.url))
  ])),
  output: {
    format: 'esm',
    dir: 'dist',
  },
  jsx: 'preserve',
  plugins: [rollupPlugin()]
})
