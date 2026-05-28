# Security Policy

mdread is a fully client-side, local-first app: there's no backend, no accounts,
and no data leaves the browser. That removes most of the usual attack surface, but
a few areas still matter — chiefly **rendering untrusted Markdown safely**.

## Supported versions

The latest release on `main` (and the deployed [mdread.app](https://mdread.app))
is the only supported version. Fixes land there.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for
anything exploitable.

- Preferred: open a [GitHub security advisory](https://github.com/techjewel/mdread/security/advisories/new).
- Or email **cep.jewel@gmail.com** with steps to reproduce.

Please include what you did, what happened, and the browser/OS. We'll acknowledge
within a few days and keep you posted on the fix.

## In scope

- **XSS / HTML injection** through rendered Markdown. All Markdown is parsed with
  `marked` and sanitized with `DOMPurify` before it touches the DOM
  (`src/modules/markdown.js`); a bypass of that sanitization is the highest-value
  report.
- Anything that causes data to leave the device (an unexpected network request),
  which would break the local-first/privacy guarantee.
- Service worker / cache-poisoning issues that could serve tampered assets.

## Out of scope

- Attacks requiring a malicious browser extension or a compromised local machine.
- The contents of a Markdown file the user themselves opened (it's their own data,
  shown only to them).
- Reports against the bundled libraries that aren't reproducible in mdread —
  please report those upstream.
