import { build } from 'esbuild';

/**
 * The SDK ships as one self-contained IIFE that exposes `window.AssistantSDK`.
 * A host page adds one <script> tag and nothing else — no bundler, no module
 * loader, no framework assumption about the portal it is embedded in.
 */
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'AssistantSDK',
  footer: { js: 'window.AssistantSDK = AssistantSDK.default || AssistantSDK;' },
  target: ['es2019'],
  outfile: 'dist/assistant-sdk.js',
  minify: false,
  sourcemap: true,
  charset: 'utf8',
  logLevel: 'info',
});
