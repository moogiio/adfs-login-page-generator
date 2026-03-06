# ADFS Login Generator

Generates a single `onload.js` from an annotated HTML template. Author your ADFS
login page customizations as a normal HTML file — open it in a browser to preview,
then run the generator to produce the file you deploy to ADFS.

## How it works

ADFS lets you inject a custom `onload.js` into the login page. This tool reads
an HTML template you write, finds every `data-adfs-*` annotation, and compiles
them into a self-contained IIFE that rewrites the ADFS DOM at runtime.

The key principle: **ADFS owns the form mechanics, you own the visuals.** The
generator never recreates ADFS elements — it moves them into your layout so
event handlers, hidden inputs, and form POST continue to work.

## Installation

```bash
npm install
```

## Usage

```bash
node generator.js <template.html> [options]
```

| Option | Description |
|---|---|
| `<template.html>` | Path to your annotated HTML template (required) |
| `--base-url <url>` | Rewrite local `./asset` paths to this URL |
| `--output`, `-o <file>` | Output path (default: `dist/onload.js`) |
| `--empty-body` | Empty `document.body` before adding elements |

```bash
node generator.js src/template.html --base-url https://cdn.example.com/adfs/ -o dist/onload.js
```

Or via npm:

```bash
npm run generate
```

### Validate

After generating, validate the output before deploying:

```bash
node validate.js <template.html> <onload.js>
```

```bash
npm run validate
```

The validator checks that `onload.js` is valid JavaScript, then builds a mock
DOM from your template's target selectors, runs the script against it, and
confirms each action had its expected effect. Non-zero exit code on failure.

## Project structure

```
generator.js              The compiler
validate.js               Post-build validator
src/
  template.html           Your authored page — open in browser to preview
  styles/                 CSS files referenced in template.html
  scripts/                JS files referenced in template.html
  images/                 Images referenced in template.html
dist/
  onload.js               Generated output — deploy this to ADFS
examples/
  login/                  Username/password login page (move pattern)
  hrd/                    Home Realm Discovery with federated providers
```

## Authoring the template

`src/template.html` is a full HTML page. Annotate elements with `data-adfs-*`
attributes to tell the generator what to do on the real ADFS page.

### CSS

Link CSS files normally. They are read from disk and inlined into `onload.js`.

```html
<link rel="stylesheet" href="./styles/main.css">
```

External URLs (e.g. Google Fonts) are skipped.

### Images

Reference images with relative `./` paths. The generator rewrites them to
`--base-url` + the relative path in the output.

```html
<img src="./images/logo.png" alt="Logo">
```

### JavaScript

Script files are read from disk and inlined. Inline `<script>` blocks are
included as-is. External URLs are skipped.

```html
<script src="./scripts/custom.js"></script>
<script>
  document.title = 'Acme Corp – Sign in';
</script>
```

## DOM actions

Each `data-adfs-*` attribute is an instruction to the generator. Actions are
processed in document order.

### `data-adfs-replace="#selector"`

Replace the target element with this one. The element is created with its
original tag name and attributes.

```html
<header data-adfs-replace="#loginHeader" class="company-header">
  <img src="./images/logo.png" alt="Acme Corp">
</header>
```

### `data-adfs-append-to="#selector"`

Append this element as the last child of the target.

```html
<div data-adfs-append-to="body" class="shell" id="customShell">
  <div class="login-card">...</div>
</div>
```

When the target is `body` or `head`, the generated code uses `document.body` /
`document.head` directly.

### `data-adfs-prepend-to="#selector"`

Insert this element as the first child of the target.

```html
<div data-adfs-prepend-to="#loginArea" class="notice-banner">
  <p>Scheduled maintenance Saturday 22:00–24:00</p>
</div>
```

### `data-adfs-remove="#selector"`

Remove the target element from the DOM entirely.

```html
<span data-adfs-remove="#forgotPasswordLink"></span>
```

### `data-adfs-hide="#selector"`

Hide the target element (`display: none`) while keeping it in the DOM. Use this
for elements ADFS needs functionally but that shouldn't be visible — like
`#loginForm` when you've moved its inputs into a custom shell.

```html
<div data-adfs-hide="#loginForm"></div>
```

### `data-adfs-move-to="#source"` + `data-adfs-into="#destination"`

Move an existing DOM element into a new container. The element is moved, not
cloned — event handlers, hidden inputs, and ADFS bindings are preserved.

```html
<div data-adfs-move-to="#userNameInput" data-adfs-into="#slot-username"></div>
<div data-adfs-move-to="#passwordInput" data-adfs-into="#slot-password"></div>
<div data-adfs-move-to="#submitButton"  data-adfs-into="#slot-submit"></div>
<div data-adfs-move-to="#errorText"     data-adfs-into="#slot-error"></div>
```

### `data-adfs-set-text="#selector"`

Replace the target's text content. Useful for language fixes.

```html
<span data-adfs-set-text="#userNameLabel">Email address</span>
<span data-adfs-set-text="#submitButton">Sign in</span>
```

### `data-adfs-set-html="#selector"`

Replace the target's innerHTML.

```html
<span data-adfs-set-html="#loginDescription">
  Sign in with your <strong>company account</strong>.
</span>
```

### `data-adfs-set-attr="#selector"` + `data-adfs-attr` + `data-adfs-value`

Set an attribute on the target element.

```html
<meta data-adfs-set-attr="#userNameInput" data-adfs-attr="placeholder" data-adfs-value="your@email.com">
```

Using `<meta>` keeps these invisible in the browser preview.

### `data-adfs-if="#selector"` (conditional modifier)

Add to any action element to make it conditional. The action only runs if the
selector matches an element in the DOM. Useful for HRD vs password page detection.

```html
<!-- Only runs on the HRD page -->
<div data-adfs-move-to="#hrdArea" data-adfs-into="#slot-hrd" data-adfs-if="#hrdArea"></div>

<!-- Only runs on the password page -->
<div data-adfs-move-to="#userNameInput" data-adfs-into="#slot-username" data-adfs-if="#loginArea"></div>
```

## ADFS elements that matter

These are the critical DOM elements ADFS depends on. Never remove or recreate
them — use `move-to` and `hide` instead.

| Element | Why it matters |
|---|---|
| `#loginForm` | The actual POST form — hide it, don't remove it |
| `input[type="hidden"]` | CSRF token, AuthenticationMethod, client-request-id |
| `#userNameInput` | Username field |
| `#passwordInput` | Password field — ADFS may change its type dynamically |
| `#submitButton` | ADFS attaches its own click handler |
| `#errorText` | Server-side error messages (bad password, locked account) |
| `#kmsiInput` | "Keep me signed in" checkbox |
| `#hrdArea` | Home Realm Discovery provider list (federated setups) |
| `#loginArea` | The login area wrapper (absent on HRD-only pages) |

## Examples

### Username/password login

[`examples/login/`](examples/login/) — Builds a custom card shell, moves ADFS
inputs into styled slots, hides the original form.

```bash
node generator.js examples/login/template.html -o examples/login/dist/onload.js
```

### Home Realm Discovery

[`examples/hrd/`](examples/hrd/) — Branded provider picker for federated
identity setups. Moves `#hrdArea` into a styled card.

```bash
node generator.js examples/hrd/template.html -o examples/hrd/dist/onload.js
```

## Generated output

The generator wraps everything in an IIFE:

```js
// Generated by adfs-login-generator — DO NOT EDIT
(function () {

  // ── CSS ──────────────────────────────────────────────────────
  var _s = document.createElement('style');
  _s.textContent = `...`;
  document.head.appendChild(_s);

  // ── append-to: body ──────────────────────────────────────────
  (function () {
    var _t = document.body;
    if (!_t) return;
    var _el = document.createElement("div");
    _el.setAttribute("class", "shell");
    _el.setAttribute("id", "customShell");
    _el.innerHTML = `...`;
    _t.appendChild(_el);
  }());

  // ── move-to: #userNameInput ──────────────────────────────────
  (function () {
    var _src = document.querySelector("#userNameInput");
    var _dst = document.querySelector("#slot-username");
    if (_src && _dst) _dst.appendChild(_src);
  }());

  // ── hide: #loginForm ─────────────────────────────────────────
  (function () {
    var _t = document.querySelector("#loginForm");
    if (_t) _t.style.display = 'none';
  }());

}());
```
