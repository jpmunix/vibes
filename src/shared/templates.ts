export interface Template {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  githubUrl?: string;
  isOfficial: boolean;
  isExperimental?: boolean;
  requiresNeon?: boolean;
  tags?: string[];
}

// API Template interface from the external API
export interface ApiTemplate {
  githubOrg: string;
  githubRepo: string;
  title: string;
  description: string;
  imageUrl: string;
}

export const DEFAULT_TEMPLATE_ID = "react";
export const DEFAULT_TEMPLATE = {
  id: "react",
  title: "React.js",
  description: "React.js, Vite, Shadcn, Tailwind y TypeScript.",
  isOfficial: true,
  tags: ["SPA", "Frontend"],
};

const PORTAL_MINI_STORE_ID = "portal-mini-store";
export const NEON_TEMPLATE_IDS = new Set<string>([PORTAL_MINI_STORE_ID]);

/**
 * Maps template IDs to their local scaffold directory name.
 * Templates in this map use a local scaffold copy instead of git clone.
 */
export const SCAFFOLD_TEMPLATE_IDS: Record<string, string> = {
  react: "scaffold",
  vue: "scaffold-vue",
  astro: "scaffold-astro",
  svelte: "scaffold-svelte",
};

export const localTemplatesData: Template[] = [
  DEFAULT_TEMPLATE,
  {
    id: "next",
    title: "Next.js",
    description: "Next.js, React, Shadcn, Tailwind y TypeScript.",
    githubUrl: "https://github.com/dyad-sh/nextjs-template",
    isOfficial: true,
    tags: ["Full-Stack", "SSR"],
  },
  {
    id: "vue",
    title: "Vue.js",
    description: "Vue 3, Vite, Tailwind y TypeScript con Composition API.",
    isOfficial: true,
    tags: ["SPA", "Frontend"],
  },
  {
    id: "astro",
    title: "Astro",
    description: "Astro, Tailwind y TypeScript. Ideal para sitios de contenido.",
    isOfficial: true,
    tags: ["Static Site", "SSG"],
  },
  {
    id: "svelte",
    title: "SvelteKit",
    description: "SvelteKit 2, Svelte 5, Tailwind y TypeScript.",
    isOfficial: true,
    tags: ["Full-Stack", "SSR"],
  },
  {
    id: PORTAL_MINI_STORE_ID,
    title: "Portal: Mini Store",
    description: "Neon DB, Payload CMS, Next.js",
    githubUrl: "https://github.com/dyad-sh/portal-mini-store-template",
    isOfficial: true,
    isExperimental: true,
    requiresNeon: true,
    tags: ["Full-Stack", "E-Commerce"],
  },
];
