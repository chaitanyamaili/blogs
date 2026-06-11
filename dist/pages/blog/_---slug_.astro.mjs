import { c as createAstro, a as createComponent, r as renderComponent, b as renderTemplate, m as maybeRenderHead, d as addAttribute, F as Fragment, e as renderSlot } from '../../chunks/astro/server_BqdyGBq5.mjs';
import 'kleur/colors';
import { $ as $$BaseLayout, g as getCollection } from '../../chunks/BaseLayout_DSfo2NmX.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro$1 = createAstro("https://chaitanyamaili.in");
const $$BlogPost = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$BlogPost;
  const { post } = Astro2.props;
  const { title, description, pubDate, tags, readingTime } = post.data;
  const base = "/blogs";
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(pubDate);
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": `${title} — Chaitanya Maili`, "description": description }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<article> <header class="mb-10"> <a${addAttribute(base, "href")} class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 group"> <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-hover:-translate-x-0.5 transition-transform"> <path d="m15 18-6-6 6-6"></path> </svg>
All posts
</a> <h1 class="text-3xl font-bold tracking-tight mb-4">${title}</h1> <div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"> <time${addAttribute(pubDate.toISOString(), "datetime")}>${formattedDate}</time> ${readingTime && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": ($$result3) => renderTemplate` <span aria-hidden="true">·</span> <span>${readingTime} min read</span> ` })}`} </div> ${tags && tags.length > 0 && renderTemplate`<div class="flex flex-wrap gap-2 mt-4"> ${tags.map((tag) => renderTemplate`<span class="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border"> ${tag} </span>`)} </div>`} </header> <div class="prose prose-neutral dark:prose-invert max-w-none"> ${renderSlot($$result2, $$slots["default"])} </div> </article> ` })}`;
}, "/sessions/dazzling-funny-darwin/mnt/blogs/src/layouts/BlogPost.astro", void 0);

const $$Astro = createAstro("https://chaitanyamaili.in");
async function getStaticPaths() {
  const posts = await getCollection("blog", ({ data }) => !data.draft);
  return posts.map((post) => ({
    params: { slug: post.slug },
    props: { post }
  }));
}
const $$ = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$;
  const { post } = Astro2.props;
  const { Content } = await post.render();
  return renderTemplate`${renderComponent($$result, "BlogPost", $$BlogPost, { "post": post }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Content", Content, {})} ` })}`;
}, "/sessions/dazzling-funny-darwin/mnt/blogs/src/pages/blog/[...slug].astro", void 0);

const $$file = "/sessions/dazzling-funny-darwin/mnt/blogs/src/pages/blog/[...slug].astro";
const $$url = "/blogs/blog/[...slug]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$,
  file: $$file,
  getStaticPaths,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
