#!/usr/bin/env node
'use strict';

const fs      = require('fs');
const path    = require('path');
const { JSDOM } = require('jsdom');
const cheerio = require('cheerio');

// ── CLI ───────────────────────────────────────────────────────────────────────

function usage() {
  console.error([
    'Usage: node validate.js <template.html> <onload.js>',
    '',
    'Example:',
    '  node validate.js src/template.html dist/onload.js',
  ].join('\n'));
  process.exit(1);
}

const [templateArg, onloadArg] = process.argv.slice(2);
if (!templateArg || !onloadArg) usage();

const templatePath = path.resolve(templateArg);
const onloadPath   = path.resolve(onloadArg);

const templateHtml = fs.readFileSync(templatePath, 'utf8');
const onloadJs     = fs.readFileSync(onloadPath, 'utf8');

// ── Helpers ───────────────────────────────────────────────────────────────────

const PASS  = '[PASS]';
const FAIL  = '[FAIL]';
const ERROR = '[ERROR]';

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  ${PASS}  ${msg}`); passed++; }
function fail(msg) { console.log(`  ${FAIL}  ${msg}`); failed++; }

// ── Step 1: Syntax check ──────────────────────────────────────────────────────

console.log('\nSyntax');
try {
  new Function(onloadJs); // throws SyntaxError without executing
  pass('Valid JavaScript');
} catch (e) {
  console.log(`  ${ERROR}  ${e.message}`);
  process.exit(1); // no point continuing if syntax is broken
}

// ── Step 2: Extract target selectors from template ────────────────────────────

const ACTIONS = ['replace', 'append-to', 'prepend-to', 'remove', 'set-text', 'set-html', 'set-attr'];
const actionAttrSelector = ACTIONS.map(a => `[data-adfs-${a}]`).join(',');

const $ = cheerio.load(templateHtml, { decodeEntities: false });
const targets = [];

$(actionAttrSelector).each((_, el) => {
  const $el    = $(el);
  const action = ACTIONS.find(a => $el.attr(`data-adfs-${a}`) !== undefined);
  if (!action) return;
  const selector = $el.attr(`data-adfs-${action}`);
  targets.push({ action, selector });
});

// ── Step 3: Build mock ADFS DOM ───────────────────────────────────────────────

// Create a placeholder element in the mock DOM for every targeted selector.
// We only handle simple selectors (#id, tag#id) since ADFS elements use IDs.
function mockElementFor(selector) {
  const idMatch  = selector.match(/#([\w-]+)/);
  const tagMatch = selector.match(/^([a-zA-Z][\w-]*)/);
  if (!idMatch) return null; // skip non-ID selectors for the mock
  const tag = (tagMatch && !tagMatch[1].startsWith('#')) ? tagMatch[1] : 'div';
  return `<${tag} id="${idMatch[1]}">Mock ADFS content</${tag}>`;
}

const mockElements = targets
  .map(({ selector }) => mockElementFor(selector))
  .filter(Boolean)
  .join('\n');

const mockHtml = `<!DOCTYPE html><html><head></head><body>\n${mockElements}\n</body></html>`;

// ── Step 4: Run onload.js against mock DOM ────────────────────────────────────

console.log('\nRuntime');

const dom = new JSDOM(mockHtml, { runScripts: 'dangerously' });

try {
  dom.window.eval(onloadJs);
} catch (e) {
  console.log(`  ${ERROR}  Uncaught exception: ${e.message}`);
  failed++;
}

// ── Step 5: Check each action had its expected effect ─────────────────────────

console.log('\nDOM actions');

for (const { action, selector } of targets) {
  const el = dom.window.document.querySelector(selector);

  switch (action) {
    case 'replace':
    case 'remove':
      // Original element should be gone
      if (!el) {
        pass(`${action}: ${selector}`);
      } else {
        fail(`${action}: ${selector} — original element still in DOM`);
      }
      break;

    case 'set-attr': {
      // Element must still exist; we can't easily check the specific attr value
      // without re-parsing the template, so we just confirm it wasn't removed.
      if (el) {
        pass(`${action}: ${selector}`);
      } else {
        fail(`${action}: ${selector} — target element not found`);
      }
      break;
    }

    default:
      // append-to, prepend-to, set-text, set-html — target must still exist
      if (el) {
        pass(`${action}: ${selector}`);
      } else {
        fail(`${action}: ${selector} — target element not found`);
      }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
