# Agent Guide

## Project Snapshot

- This is a React + Vite storefront site for The Stock Room NJ.
- Main UI lives in `src/App.jsx`, with global styling in `src/App.css` and `src/index.css`.
- Public static files live in `public/`; bundled React assets live in `src/assets/`.

## Asset Best Practices

- Prefer importing hero and UI-critical images from `src/assets/` so Vite can fingerprint and rewrite URLs during build.
- Use `public/` for files that must be served directly by name, such as `favicon.ico`, logos referenced by URL strings, and gallery files.
- When referencing `public/` assets from React, prefix paths with `import.meta.env.BASE_URL` to respect the deployment base path.
- Preserve exact filename casing. Deploy targets are often case-sensitive even when local macOS development is forgiving.
- Avoid spaces in new asset filenames. If an existing filename has spaces, URL-encode it when used in a string.

## Change Workflow

- Read the relevant component and CSS before editing; keep changes scoped to the reported issue.
- Use `rg` or `rg --files` first when locating references.
- Do not revert unrelated local changes.
- Run `npm run build` after changes that affect React, CSS, imports, or assets.
- Run `npm run lint` when changing JavaScript behavior, hooks, or component structure.

## Frontend Guidelines

- Keep the first screen focused on the real store experience, not a marketing landing page.
- Use real product, store, or brand imagery wherever possible.
- Keep controls and layout stable across mobile and desktop; avoid text overflow in buttons and cards.
- Match existing visual patterns: restrained borders, compact radii, and practical storefront navigation.

## Deployment Notes

- The app uses Vite with a relative base path in `vite.config.js`; avoid hardcoded root-only paths unless the site is guaranteed to deploy at domain root.
- After fixing asset paths, inspect the production build output if a 404 was reported in deployment.
- If a browser reports a missing image, verify both the emitted URL and the file copied into `dist/`.
