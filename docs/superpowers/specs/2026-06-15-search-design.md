# Search — Design Spec

**Date:** 2026-06-15
**Status:** Approved

---

## Overview

Add full-text search to the blog homepage using Pagefind. Search results replace the existing post list inline — no separate route, no modal. The index is built at deploy time; there is no runtime server.

---

## Architecture

Pagefind is a static search tool that runs as a post-build CLI step. After `astro build` produces `dist/`, `pagefind --site dist` crawls the rendered HTML and writes a search index into `dist/pagefind/`. At runtime, Pagefind's own JS bundle (loaded lazily from `dist/pagefind/`) handles querying entirely in the browser.

```
npm run build
  └─ astro build           → dist/  (HTML pages)
  └─ pagefind --site dist  → dist/pagefind/  (index + JS bundle)
```

The Pagefind JS is never bundled through Astro — it is loaded from the generated `dist/pagefind/pagefind.js` at runtime, which keeps the Astro build fast and the bundle clean.

---

## Build change

**Package:** `pagefind` added as a dev dependency.

**Script change in `package.json`:**

```json
"build": "astro build && pagefind --site dist"
```

No other build or CI changes required — GitHub Actions runs `npm run build`, so Pagefind runs automatically on every deploy.

---

## UI

### Placement

A search input appears on `src/pages/index.astro`, between the page header (`<h1>Writing</h1>`) and the Series section. It is always visible — not hidden behind a button.

### Behaviour

- **Empty query:** The full post/series list renders as today (no change).
- **Active query:** The Series and Posts sections are hidden; a results list rendered by Pagefind replaces them. Results include title, excerpt, and a link to the post.
- **No results:** A short "No posts found for …" message replaces the list.
- **Clear input:** Full list reappears immediately.

### Styling

The search input uses existing design tokens to match the site:

| Property | Token |
|----------|-------|
| Background | `bg-background` |
| Border | `border-border` |
| Text | `text-foreground` |
| Placeholder | `text-muted-foreground` |
| Focus ring | `ring-primary/40` |

Pagefind's default UI CSS is **not** loaded. Results are rendered using the Pagefind JS API (`pagefind.search(query)`) so the output is styled with Tailwind classes consistent with `BlogCard.astro`.

### Result card

Each result card renders:
- Post title (linked)
- Excerpt (first matching snippet from Pagefind)
- Date + reading time (from Pagefind metadata, if available; omitted if not)

---

## Indexing scope

Pagefind crawls all pages in `dist/`. That includes:

- All blog post pages (`/blog/[slug]`)
- Series landing pages (`/series/[slug]`)
- The homepage (`/`)

The homepage itself will appear in results; this is acceptable given its short content.

Pages that should **not** appear in results can be excluded with a `data-pagefind-ignore` attribute — not needed for the current page count.

---

## Out of scope

- Dedicated `/search` route
- Search-as-you-type dropdown or modal
- Highlighted matched terms within result cards
- Tag or series filtering via search

---

## Open questions / future work

- If post count grows significantly, consider adding `data-pagefind-body` attributes to scope indexing to article body only (currently indexes full page HTML).
- Fuzzy/typo-tolerant matching is not configurable in Pagefind's default mode; acceptable for now.
