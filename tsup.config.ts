import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  // Shared chunks keep one copy of the device classes, so instanceof works across both entries in CJS too
  splitting: true,
  clean: true,
  shims: true,
});

