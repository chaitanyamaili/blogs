import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://chaitanyamaili.in',
  base: '/blogs',
  integrations: [
    tailwind({ applyBaseStyles: false }),
  ],
});
