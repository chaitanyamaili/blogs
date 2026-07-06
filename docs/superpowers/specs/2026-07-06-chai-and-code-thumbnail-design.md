# Chai & Code — Brand Thumbnail Design Spec

**Date:** 2026-07-06  
**Status:** Approved  

## Purpose

A reusable general brand asset for the "Chai & Code" blog by Chaitanya Maili. Delivered as SVG source + PNG export. Used across social profiles, OG images, and the blog itself.

## Canvas

- **Dimensions:** 1200×1200px (square)
- **Formats:** SVG (source, scalable) + PNG (raster export)
- **Output location:** `public/brand/chai-and-code-thumbnail.svg` and `.png`

## Background

Radial gradient matching the existing favicon palette:
- Center: `#353664` (deep indigo)
- Edges: `#211c36` (near-black indigo)

## Center Illustration — Chai Glass

A cartoon Indian cutting-chai glass, centered in the upper half of the canvas.

- **Shape:** Cylindrical, slightly tapered (wider at top)
- **Glass stroke:** White, semi-transparent, 2–3px
- **Liquid fill:** Warm amber `#f59e0b` with darker base `#d97706`
- **Steam:** Three gentle curvy wisps in soft cream/white rising from the rim
- **Highlight:** Small circular shine on the glass for a glassy feel

## Floating Code Glyphs

8–10 code symbols in a loose elliptical cloud orbiting the glass. Each glyph slightly rotated for playfulness. Mix of sizes for depth (larger near the glass, smaller farther out).

| Glyph | Color | Notes |
|-------|-------|-------|
| `{}` | `#fcfb9b` | yellow-green, matches favicon accent |
| `</>` | `#a8dc9f` | mint green, from favicon stroke |
| `const` | `rgba(255,255,255,0.70)` | keyword |
| `=>` | `#fcfb9b` | |
| `//` | `rgba(255,255,255,0.50)` | comment feel |
| `[]` | `#a8dc9f` | |
| `async` | `rgba(255,255,255,0.60)` | |
| `fn` | `#fcfb9b` | |
| `AI` | `#ffffff` | slightly larger, prominent |

Small sparkle dots (`·`, `✦`) scattered between glyphs for extra energy.

## Typography

- **Wordmark:** "Chai & Code" — Inter Bold, ~120px, white. The `&` character in `#fcfb9b` (yellow-green accent).
- **Tagline:** "Engineering thoughts, one sip at a time" — Inter Regular, ~42px, `#a8dc9f` (mint green).
- **Layout:** Both lines centered, below the chai glass illustration.

## Layout Structure (top → bottom)

```
[ padding ]
[ chai glass + steam ]
[ glyph cloud orbiting the glass ]
[ "Chai & Code" wordmark ]
[ tagline ]
[ padding ]
```

## Color Palette Summary

| Role | Value |
|------|-------|
| Background (dark) | `#211c36` |
| Background (light) | `#353664` |
| Chai liquid | `#f59e0b` / `#d97706` |
| Primary glyph accent | `#fcfb9b` |
| Secondary glyph accent | `#a8dc9f` |
| Wordmark text | `#ffffff` |
| Tagline text | `#a8dc9f` |
