#!/usr/bin/env node
'use strict';

const fs      = require('fs');
const path    = require('path');
const cheerio = require('cheerio');

// ── CLI ───────────────────────────────────────────────────────────────────────

function usage() {
  console.error([
    'Usage: node generator.js <template.html> [options]',
    '',
    'Options:',
    '  --base-url <url>      Rewrite local ./asset paths to this URL',
    '  --output, -o <file>   Output path (default: dist/onload.js)',
    '',
    'Example:',
    '  node generator.js src/template.html --base-url https://cdn.example.com/adfs/ -o dist/onload.js',
  ].join('\n'));
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { input: null, output: 'dist/onload.js', baseUrl: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--output' || a === '-o') && argv[i + 1]) {
      opts.output = argv[++i];
    } else if (a === '--base-url' && argv[i + 1]) {
      opts.baseUrl = argv[++i];
      if (!opts.baseUrl.endsWith('/')) opts.baseUrl += '/';
    } else if (!a.startsWith('-')) {
      opts.input = a;
    }
  }
  if (!opts.input) usage();
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Escape a string for safe embedding inside a JS template literal. */
function esc(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

/**
 * Rewrite ./relative asset paths in HTML attributes and CSS url() references
 * to the given base URL. Leaves http(s):// URLs untouched.
 */
function rewriteUrls(content, baseUrl) {
  if (!baseUrl) return content;
  return content
    .replace(/\bsrc="\.\/([^"]*)"/g,   `src="${baseUrl}$1"`)
    .replace(/\bsrc='\.\/([^']*)'/g,   `src='${baseUrl}$1'`)
    .replace(/\bhref="\.\/([^"]*)"/g,  `href="${baseUrl}$1"`)
    .replace(/\bhref='\.\/([^']*)'/g,  `href='${baseUrl}$1'`)
    .replace(/url\("\.\/([^"]*)"\)/g,  `url("${baseUrl}$1")`)
    .replace(/url\('\.\/([^']*)'\)/g,  `url('${baseUrl}$1')`)
    .replace(/url\(\.\/([^)]*)\)/g,    `url(${baseUrl}$1)`);
}

/** Read a file relative to the template directory. Exits on missing file. */
function readAsset(rel, dir) {
  const abs = path.resolve(dir, rel);
  if (!fs.existsSync(abs)) {
    console.error(`ERROR: Asset not found: ${abs}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, 'utf8');
}

/** Format a labelled section divider for the generated JS. */
function divider(label) {
  const pad = Math.max(0, 66 - label.length);
  return `\n  // ── ${label} ${'─'.repeat(pad)}`;
}

// ── Parse template ────────────────────────────────────────────────────────────

const templatePath = path.resolve(opts.input);
const dir          = path.dirname(templatePath);
const $            = cheerio.load(fs.readFileSync(templatePath, 'utf8'), { decodeEntities: false });

const lines = []; // Lines of JS that go inside the IIFE

// ── 1. CSS ────────────────────────────────────────────────────────────────────

const cssChunks = [];

$('link[rel="stylesheet"]').each((_, el) => {
  const href = $(el).attr('href');
  if (!href || /^https?:\/\//.test(href)) return; // skip external
  let css = readAsset(href, dir);
  css = rewriteUrls(css, opts.baseUrl);
  cssChunks.push(`/* ${href} */\n${css.trim()}`);
});

$('style').each((_, el) => {
  let css = $(el).html() || '';
  css = rewriteUrls(css.trim(), opts.baseUrl);
  if (css) cssChunks.push(`/* inline <style> */\n${css}`);
});

if (cssChunks.length) {
  lines.push(divider('CSS'));
  lines.push(`  var _s = document.createElement('style');`);
  lines.push(`  _s.textContent = \`${esc(cssChunks.join('\n\n'))}\`;`);
  lines.push(`  document.head.appendChild(_s);`);
}

// ── 2. DOM actions ────────────────────────────────────────────────────────────

// Supported actions and their data-adfs-* attribute names.
const ACTIONS = [
  'replace',
  'append-to',
  'prepend-to',
  'remove',
  'set-text',
  'set-html',
  'set-attr',
];

const actionSelector = ACTIONS.map(a => `[data-adfs-${a}]`).join(',');

$(actionSelector).each((_, el) => {
  const $el    = $(el);
  const action = ACTIONS.find(a => $el.attr(`data-adfs-${a}`) !== undefined);
  if (!action) return;

  const target = $el.attr(`data-adfs-${action}`);

  // Clone element and strip all data-adfs-* attributes so generated HTML is clean.
  const $c = $el.clone();
  Object.keys($c.attr() || {})
    .filter(k => k.startsWith('data-adfs-'))
    .forEach(k => $c.removeAttr(k));

  const outerHtml    = rewriteUrls($.html($c), opts.baseUrl);
  const innerHtml    = rewriteUrls($c.html() || '', opts.baseUrl);
  const textContent  = $c.text().trim();

  lines.push(divider(`${action}: ${target}`));
  lines.push(`  (function () {`);

  if (action === 'remove') {
    lines.push(`    var _t = document.querySelector(${JSON.stringify(target)});`);
    lines.push(`    if (_t) _t.parentNode.removeChild(_t);`);
  } else {
    lines.push(`    var _t = document.querySelector(${JSON.stringify(target)});`);
    lines.push(`    if (!_t) return;`);

    switch (action) {
      case 'replace':
        // The annotated element (minus data-adfs-* attrs) replaces the target.
        lines.push(`    var _el = document.createElement('div');`);
        lines.push(`    _el.innerHTML = \`${esc(outerHtml)}\`;`);
        lines.push(`    _t.parentNode.insertBefore(_el.firstElementChild, _t);`);
        lines.push(`    _t.parentNode.removeChild(_t);`);
        break;

      case 'append-to':
        // The annotated element is appended as the last child of target.
        lines.push(`    var _el = document.createElement('div');`);
        lines.push(`    _el.innerHTML = \`${esc(outerHtml)}\`;`);
        lines.push(`    _t.appendChild(_el.firstElementChild);`);
        break;

      case 'prepend-to':
        // The annotated element is inserted as the first child of target.
        lines.push(`    var _el = document.createElement('div');`);
        lines.push(`    _el.innerHTML = \`${esc(outerHtml)}\`;`);
        lines.push(`    _t.insertBefore(_el.firstElementChild, _t.firstChild);`);
        break;

      case 'set-text':
        // Swap Swedish (or any) text to English — good for i18n/language fixes.
        lines.push(`    _t.textContent = \`${esc(textContent)}\`;`);
        break;

      case 'set-html':
        lines.push(`    _t.innerHTML = \`${esc(innerHtml)}\`;`);
        break;

      case 'set-attr': {
        const attrName  = $el.attr('data-adfs-attr')  || '';
        const attrValue = $el.attr('data-adfs-value') || '';
        lines.push(`    _t.setAttribute(${JSON.stringify(attrName)}, ${JSON.stringify(attrValue)});`);
        break;
      }
    }
  }

  lines.push(`  }());`);
});

// ── 3. Scripts ────────────────────────────────────────────────────────────────

$('script').each((_, el) => {
  const $el = $(el);
  const src = $el.attr('src');

  if (src) {
    if (/^https?:\/\//.test(src)) return; // skip external
    const content = readAsset(src, dir).trim();
    lines.push(divider(`script: ${src}`));
    lines.push('  ' + content.replace(/\n/g, '\n  '));
  } else {
    const content = ($el.html() || '').trim();
    if (!content) return;
    lines.push(divider('inline script'));
    lines.push('  ' + content.replace(/\n/g, '\n  '));
  }
});

// ── Write output ──────────────────────────────────────────────────────────────

const banner = [
  `// Generated by adfs-login-generator — DO NOT EDIT`,
  `// Source:    ${path.relative(process.cwd(), templatePath)}`,
  `// Generated: ${new Date().toISOString()}`,
  ``,
  `(function () {`,
].join('\n');

const output = banner + '\n' + lines.join('\n') + '\n\n}());\n';

const outPath = path.resolve(opts.output);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, output, 'utf8');

console.log(`Generated: ${path.relative(process.cwd(), outPath)}`);
