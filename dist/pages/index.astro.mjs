import { c as createAstro, a as createComponent, m as maybeRenderHead, d as addAttribute, r as renderComponent, F as Fragment, b as renderTemplate } from '../chunks/astro/server_BqdyGBq5.mjs';
import 'kleur/colors';
import { g as getCollection, $ as $$BaseLayout } from '../chunks/BaseLayout_DSfo2NmX.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro("https://chaitanyamaili.in");
const $$BlogCard = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$BlogCard;
  const { post } = Astro2.props;
  const { title, description, pubDate, tags, readingTime } = post.data;
  const base = "/blogs";
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(pubDate);
  return renderTemplate`${maybeRenderHead()}<a${addAttribute(`${base}blog/${post.slug}`, "href")} class="group block p-6 rounded-lg border border-border bg-card shadow-md hover:shadow-lg transition-shadow duration-300"> <div class="flex items-start justify-between gap-4 mb-2"> <h2 class="text-xl font-semibold text-foreground group-hover:underline underline-offset-4 decoration-muted-foreground leading-snug"> ${title} </h2> <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0 mt-1.5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"> <path d="M7 7h10v10"></path><path d="M7 17 17 7"></path> </svg> </div> <p class="text-sm text-muted-foreground leading-relaxed mb-4">${description}</p> <div class="flex flex-wrap items-center gap-3"> <div class="flex items-center gap-2 text-xs text-muted-foreground"> <time${addAttribute(pubDate.toISOString(), "datetime")}>${formattedDate}</time> ${readingTime && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate` <span aria-hidden="true">·</span> <span>${readingTime} min read</span> ` })}`} </div> ${tags && tags.length > 0 && renderTemplate`<div class="flex flex-wrap gap-1.5 ml-auto"> ${tags.map((tag) => renderTemplate`<span class="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border"> ${tag} </span>`)} </div>`} </div> </a>`;
}, "/sessions/dazzling-funny-darwin/mnt/blogs/src/components/BlogCard.astro", void 0);

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Chaitanya Maili \u2014 Writing" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="space-y-10"> <div> <h1 class="text-2xl font-bold tracking-tight mb-2">Writing</h1> <p class="text-muted-foreground">
Thoughts on cloud-native engineering, platform infrastructure, and what it takes to grow as an engineer.
</p> </div> ${posts.length === 0 ? renderTemplate`<p class="text-muted-foreground text-sm">No posts yet. Check back soon.</p>` : renderTemplate`<div class="space-y-4"> ${posts.map((post) => renderTemplate`${renderComponent($$result2, "BlogCard", $$BlogCard, { "post": post })}`)} </div>`} </div> ` })}`;
}, "/sessions/dazzling-funny-darwin/mnt/blogs/src/pages/index.astro", void 0);

const $$file = "/sessions/dazzling-funny-darwin/mnt/blogs/src/pages/index.astro";
const $$url = "/blogs";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
