import { readFileSync, statSync } from 'node:fs';

/**
 * Smoke-checks the single-file demo build.
 *
 * The inliner splices a minified bundle into HTML, and it has silently
 * produced a syntax-error page before (`String.replace` interpreting `$&`
 * sequences in the payload). A zero exit code from the build proves nothing
 * about the artifact, so check the output itself.
 */
const OUTPUTS = ['dist/assistant-demo.html', 'dist/assistant-demo.artifact.html'];
const MIN_BYTES = 100 * 1024;

/**
 * The demo must never ship wearing a real organisation's identity again: that
 * shape is a phishing page, and this repository publishes GitHub Pages.
 *
 * This lists emblems and organisation names only. Naming a real system inside
 * the assistant's *guidance copy* is correct — that is what the product is for
 * — so a step titled «ورود به سامانه ثنا» is expected and must not fail here.
 * The line is between what the page claims to be and what the assistant says.
 */
const ORGANISATIONAL_BRANDING = ['قوه قضاییه', 'دادگستری جمهوری اسلامی'];

let failures = 0;
const fail = (message) => {
  console.error(`✗ ${message}`);
  failures++;
};

for (const file of OUTPUTS) {
  const failuresBefore = failures;
  let html;
  try {
    html = readFileSync(file, 'utf8');
  } catch {
    fail(`${file} was not produced`);
    continue;
  }

  const size = statSync(file).size;
  if (size < MIN_BYTES) {
    fail(`${file} is ${size} bytes — the runtime bundle is missing`);
    continue;
  }

  // Every inline script must parse. A corrupted splice shows up here and
  // nowhere else until a human opens the page.
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (scripts.length < 2) {
    fail(`${file} has ${scripts.length} inline scripts — expected the runtime and the portal`);
    continue;
  }
  for (const [index, source] of scripts.entries()) {
    try {
      new Function(source);
    } catch (error) {
      fail(`${file} inline script #${index + 1} does not parse: ${error.message}`);
    }
  }

  // The engine and the portal's own wiring both have to be in there.
  for (const marker of ['__ASSISTANT_LOCAL_HANDLER__', 'AssistantSDK.init', 'astan-launcher']) {
    if (!html.includes(marker)) fail(`${file} is missing "${marker}"`);
  }

  for (const marker of ORGANISATIONAL_BRANDING) {
    if (html.includes(marker)) fail(`${file} contains organisational branding: "${marker}"`);
  }

  if (!html.includes('نمایش آموزشی')) fail(`${file} is missing the demonstration disclosure banner`);

  if (failures === failuresBefore) {
    console.log(`✓ ${file} — ${(size / 1024).toFixed(0)} KB, ${scripts.length} scripts parsed`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nOffline demo build verified.');
