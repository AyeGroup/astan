import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/**
 * Two self-contained outputs from one source:
 *
 *   dist/assistant-demo.html           full document — open by double-clicking
 *   dist/assistant-demo.artifact.html  body-only fragment for hosts that
 *                                      supply their own document skeleton
 *
 * Both embed the real assistant: the same workflow engine, policy engine,
 * knowledge base and orchestrator the server runs. Only the LLM is swapped
 * for an engine that reports itself disabled — production's degraded path.
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

const title = (html.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1];
if (!title) throw new Error('demo/index.html has no <title>');

const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
if (!bodyMatch) throw new Error('demo/index.html has no <body>');

const scripts = `<script>\n${safe(runtime)}\n</script>\n<script>\n${safe(portal)}\n</script>`;

const bodyContent = inject(
  inject(bodyMatch[1], '<script src="/sdk/assistant-sdk.js"></script>', ''),
  '<script src="/app.js"></script>',
  '',
).trim();

mkdirSync('dist', { recursive: true });

// 1) Standalone document.
const standalone = inject(
  inject(
    inject(html, '<link rel="stylesheet" href="/styles.css" />', `<style>\n${css}\n</style>`),
    '<script src="/sdk/assistant-sdk.js"></script>',
    `<script>\n${safe(runtime)}\n</script>`,
  ),
  '<script src="/app.js"></script>',
  `<script>\n${safe(portal)}\n</script>`,
);
writeFileSync('dist/assistant-demo.html', standalone, 'utf8');

// 2) Fragment. The host owns <html>, so direction and language are set from
//    script rather than assumed from a document we do not write.
const fragment = `<title>${title}</title>
<style>
${css}
</style>
<script>
  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'fa');
</script>
${bodyContent}
${scripts}
`;
writeFileSync('dist/assistant-demo.artifact.html', fragment, 'utf8');

for (const file of ['dist/assistant-demo.html', 'dist/assistant-demo.artifact.html']) {
  console.log(`${file} — ${(Buffer.byteLength(readFileSync(file, 'utf8')) / 1024).toFixed(0)} KB`);
}
