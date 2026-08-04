import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/ui/react/index.ts',
    vue: 'src/ui/vue/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: true,
  treeshake: true,
  external: ['react', 'vue'],
});
