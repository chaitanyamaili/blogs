# Chaitanya's Blog

A personal blog built with [Astro](https://astro.build) and Tailwind CSS, covering engineering, AI, Kubernetes, and career topics.

**Live site:** [chaitanyamaili.in/blogs](https://chaitanyamaili.in/blogs)

## Topics

- Generative AI & LLMs
- Kubernetes design patterns
- Engineering career (Staff → Principal)
- Open source vs. closed-source AI landscape

## Tech Stack

| Layer | Tool |
|-------|------|
| Framework | Astro 4 |
| Styling | Tailwind CSS + Typography plugin |
| Language | TypeScript |
| Deploy | GitHub Actions → static hosting |

## Local Development

```bash
npm install
npm run dev       # starts dev server at http://localhost:4321/blogs
npm run build     # production build → dist/
npm run preview   # preview the production build locally
```

## Project Structure

```
src/
├── content/blog/   # Markdown blog posts
├── components/     # Astro components (Header, Footer, BlogCard, …)
├── layouts/        # Base and BlogPost layouts
├── pages/          # Route pages (index, blog/[slug], series/…)
└── styles/         # Global CSS
public/             # Static assets (favicon, …)
```

## Writing a New Post

1. Create a `.md` file in `src/content/blog/`.
2. Add frontmatter:

```yaml
---
title: "Your Post Title"
description: "A short description"
pubDate: 2026-01-01
tags: ["tag1", "tag2"]
readingTime: 5
---
```

3. Write your post in Markdown below the frontmatter.

## License

Content (articles) is licensed under [CC BY 4.0](LICENSE-CONTENT). Code is licensed under the [MIT License](LICENSE).
