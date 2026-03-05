# ADFS Login Generator

Generates a single `onload.js` from an annotated HTML template. Author your ADFS
login page customizations as a normal HTML file — open it in a browser to preview,
then run the generator to produce the file you deploy to ADFS.

## Installation

```bash
npm install
```

## Usage

```bash
node generator.js <template.html> --base-url <url> [--output|-o <file>]
```

| Argument | Required | Description |
|---|---|---|
| `<template.html>` | Yes | Path to your HTML template |
| `--base-url <url>` | No | Base URL for local `./asset` paths in the output |
| `--output`, `-o` | No | Output path (default: `dist/onload.js`) |

**Example:**
```bash
node generator.js src/template.html --base-url https://cdn.example.com/adfs/ -o dist/onload.js
```

Or via npm:
```bash
npm run generate
```
(Edit the `generate` script in `package.json` to match your base URL and paths.)

### Validate

After generating, validate the output before deploying to ADFS:

```bash
node validate.js <template.html> <onload.js>
```

**Example:**
```bash
node validate.js src/template.html dist/onload.js
```

Or via npm:
```bash
npm run validate
```

The validator runs two checks:

1. **Syntax** — verifies `onload.js` is valid JavaScript
2. **DOM actions** — builds a mock DOM from the target selectors in your template, runs `onload.js` against it, and confirms each action had its expected effect (elements replaced/removed, targets found, etc.)

Example output:
```
Syntax
  [PASS]  Valid JavaScript

DOM actions
  [PASS]  replace: #loginHeader
  [PASS]  set-text: #userNameLabel
  [PASS]  set-text: #passwordLabel
  [PASS]  set-attr: #userNameInput
  [PASS]  append-to: #loginArea
  [PASS]  remove: #forgotPasswordLink

6 checks — 6 passed, 0 failed
```

A non-zero exit code is returned on any failure, making it safe to use in a CI pipeline.

---

## Project structure

```
src/
  template.html       Your authored page — open in browser for a live preview
  styles/             CSS files referenced in template.html
  scripts/            JS files referenced in template.html
  images/             Images referenced in template.html
dist/
  onload.js           Generated output — deploy this to ADFS
generator.js
```

---

## Authoring the template

`src/template.html` is a full HTML page. Start by pasting the source of your ADFS
login page into it, then make your changes. Annotate each change with a
`data-adfs-*` attribute so the generator knows what to do on the real ADFS page.

### CSS

Link CSS files normally. They are read from disk and inlined into `onload.js`.

```html
<link rel="stylesheet" href="./styles/main.css">
<link rel="stylesheet" href="./styles/theme.css">
```

External URLs (e.g. Google Fonts) are left as-is and skipped.

### Images

Reference images with relative `./` paths. The generator rewrites them to
`--base-url + relative path` in the output.

```html
<img src="./images/logo.png" alt="Logo">
```

### DOM actions

Each `data-adfs-*` attribute is an instruction to the generator:

---

#### `data-adfs-replace="#selector"`
Replace the matched ADFS element with this element (minus the annotation attributes).

```html
<div data-adfs-replace="#loginHeader" class="company-header">
  <img src="./images/logo.png" alt="Acme Corp">
</div>
```

---

#### `data-adfs-append-to="#selector"`
Append this element as the last child of the target.

```html
<div data-adfs-append-to="#loginArea" class="support-footer">
  <p>Need help? <a href="mailto:it@acme.com">Contact IT</a></p>
</div>
```

---

#### `data-adfs-prepend-to="#selector"`
Insert this element as the first child of the target.

```html
<div data-adfs-prepend-to="#loginArea" class="notice-banner">
  <p>Scheduled maintenance Saturday 22:00–24:00</p>
</div>
```

---

#### `data-adfs-remove="#selector"`
Remove the matched ADFS element entirely. Use a hidden placeholder in the template.

```html
<span data-adfs-remove="#forgotPasswordLink" style="display:none"></span>
```

---

#### `data-adfs-set-text="#selector"`
Replace the target's text content. Useful for language/i18n fixes.

```html
<span data-adfs-set-text="#userNameLabel">Email address</span>
<span data-adfs-set-text="#passwordLabel">Password</span>
```

---

#### `data-adfs-set-html="#selector"`
Replace the target's innerHTML. Use when you need formatted content, not just text.

```html
<span data-adfs-set-html="#loginDescription">
  Sign in with your <strong>company account</strong>.
</span>
```

---

#### `data-adfs-set-attr="#selector"` + `data-adfs-attr` + `data-adfs-value`
Set an attribute on the matched ADFS element. Good for placeholder text, ARIA
labels, input types, etc.

```html
<meta data-adfs-set-attr="#userNameInput" data-adfs-attr="placeholder" data-adfs-value="your@email.com">
<meta data-adfs-set-attr="#passwordInput" data-adfs-attr="placeholder" data-adfs-value="Password">
```

Using `<meta>` keeps these invisible in the browser preview. One tag per attribute.

---

### JavaScript

External JS files are read from disk and inlined:

```html
<script src="./scripts/custom.js"></script>
```

Inline script blocks are included as-is:

```html
<script>
  document.title = 'Acme Corp – Sign in';
</script>
```

External URLs are skipped.

---

## Generated output

The generator wraps everything in an IIFE and writes `dist/onload.js`:

```js
// Generated by adfs-login-generator — DO NOT EDIT
// Source:    src/template.html
// Generated: 2026-03-05T...

(function () {

  // ── CSS ──────────────────────────────────────────────────────────────────
  var _s = document.createElement('style');
  _s.textContent = `/* ./styles/main.css */ ...`;
  document.head.appendChild(_s);

  // ── replace: #loginHeader ────────────────────────────────────────────────
  (function () {
    var _t = document.querySelector("#loginHeader");
    if (!_t) return;
    var _el = document.createElement('div');
    _el.innerHTML = `<div class="company-header">...</div>`;
    _t.parentNode.insertBefore(_el.firstElementChild, _t);
    _t.parentNode.removeChild(_t);
  }());

  // ... etc

}());
```
