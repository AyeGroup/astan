import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/**
 * Produces `dist/assistant-demo.html`: one self-contained file — portal,
 * assistant engine, widget and styles — that runs by double-clicking it.
 */
const bundle = await build({
  entryPoints: ['demo/offline/entry.ts'],
  bundle: true,
  format: 'iife',
  target: ['es2019'],
  write: false,
  minify: true,
  charset: 'utf8',
  define: { 'process.env.LOG_LEVEL': '"warn"', 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});

const runtime = bundle.outputFiles[0].text;
const css = readFileSync('demo/styles.css', 'utf8');
const portal = readFileSync('demo/app.js', 'utf8');
const html = readFileSync('demo/index.html', 'utf8');

/**
 * Replace with a function, never a replacement string: minified JS is full of
 * `$&`-style sequences that String.replace would interpret, silently
 * corrupting the bundle into a syntax error.
 */
const inject = (source, marker, payload) => {
  if (!source.includes(marker)) throw new Error(`marker not found: ${marker}`);
  return source.replace(marker, () => payload);
};

/** A literal `</script>` inside injected JS would close the tag early. */
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

const inlined = [
  ['<link rel="stylesheet" href="/styles.css" />', `<style>\n${css}\n</style>`],
  ['<script src="/sdk/assistant-sdk.js"></script>', `<script>\n${safe(runtime)}\n</script>`],
  ['<script src="/app.js"></script>', `<script>\n${safe(portal)}\n</script>`],
  [
    '<title>درگاه خدمات الکترونیک قضایی — نمونه آزمایشی</title>',
    '<title>نمونه آزمایشی دستیار هوشمند خدمات قضایی</title>',
  ],
].reduce((acc, [marker, payload]) => inject(acc, marker, payload), html);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/assistant-demo.html', inlined, 'utf8');
console.log(`dist/assistant-demo.html — ${(Buffer.byteLength(inlined) / 1024).toFixed(0)} KB`);
