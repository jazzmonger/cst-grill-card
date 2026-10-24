import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
export default {
  input: 'src/cst-grill-card.ts',
  output: { file: 'dist/cst-grill-card.js', format: 'es', inlineDynamicImports: true },
  plugins: [resolve(), typescript(), terser({ format: { comments: false } })],
};
