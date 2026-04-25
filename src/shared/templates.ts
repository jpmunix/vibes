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
 * Currently only React is active — other scaffolds exist on disk but
 * are not cached or used until explicitly enabled.
 */
export const SCAFFOLD_TEMPLATE_IDS: Record<string, string> = {
  react: "scaffold",
  "react-beta": "scaffold-react-beta",
  // vue: "scaffold-vue",       // Available but not active
  // astro: "scaffold-astro",   // Available but not active
  // svelte: "scaffold-svelte", // Available but not active
};

/**
 * Maps template IDs to their technology stack description,
 * required files checklist, and start/verify commands.
 * Used by the AI agent to generate scaffolds dynamically via Context7 MCP.
 */
export interface TemplateTechStack {
  title: string;
  stack: string;
  context7Libs: string[];
  /** Framework-specific files that MUST be created for the app to work */
  requiredFiles: string[];
  /** Command to verify the project compiles (run after npm install) */
  verifyCommand: string;
  /** Non-interactive CLI command to scaffold the project base.
   *  NOT currently used — scaffold is copied from local directory instead.
   *  Kept for reference in case CLI-based scaffolding is needed in the future. */
  scaffoldCommand: string;
}

export const TEMPLATE_TECH_STACKS: Record<string, TemplateTechStack> = {
  react: {
    title: "React.js",
    stack: "React 19, Vite, TypeScript, Tailwind CSS 4, Shadcn/ui, React Router DOM",
    context7Libs: ["vitejs/vite", "tailwindlabs/tailwindcss"],
    scaffoldCommand: "npx -y create-vite@latest . --template react-ts",
    requiredFiles: [
      "package.json — dependencias + devDependencies + scripts (dev, build, preview)",
      "vite.config.ts — con plugin React",
      "tsconfig.json, tsconfig.app.json, tsconfig.node.json",
      "eslint.config.js",
      "postcss.config.js",
      "tailwind.config.ts (o .js)",
      "index.html — con div#root, script type=module apuntando a src/main.tsx",
      "src/main.tsx — entry point con ReactDOM.createRoot",
      "src/App.tsx — componente raíz con contenido mínimo visible",
      "src/index.css — con @tailwind base/components/utilities",
      "src/vite-env.d.ts — con /// <reference types=\"vite/client\" />",
      "vercel.json — rewrites para SPA: [{\"source\":\"/(.*)\",\"destination\":\"/index.html\"}]",
    ],
    verifyCommand: "npx tsc --noEmit",
  },
  "react-beta": {
    title: "React.js (beta)",
    stack: "React 19, Vite 6, TypeScript, Tailwind CSS 4 (plugin Vite), Shadcn/ui, React Router DOM 7",
    context7Libs: ["vitejs/vite", "tailwindlabs/tailwindcss"],
    scaffoldCommand: "npx -y create-vite@latest . --template react-ts",
    requiredFiles: [
      "package.json — dependencias + devDependencies + scripts (dev, build, preview)",
      "vite.config.ts — con plugins: react() y tailwindcss() de @tailwindcss/vite",
      "tsconfig.json, tsconfig.app.json, tsconfig.node.json",
      "index.html — con div#root, script type=module apuntando a src/main.tsx",
      "src/main.tsx — entry point con ReactDOM.createRoot + BrowserRouter",
      "src/App.tsx — componente raíz con Outlet de react-router-dom",
      "src/globals.css — con @import 'tailwindcss' + @theme block (NO @tailwind directives)",
      "src/vite-env.d.ts — con /// <reference types=\"vite/client\" />",
      "components.json — configuración de Shadcn/ui",
    ],
    verifyCommand: "npx tsc --noEmit",
  },
  next: {
    title: "Next.js",
    stack: "Next.js (App Router), React, TypeScript, Tailwind CSS 4, Shadcn/ui",
    context7Libs: ["vercel/next.js", "tailwindlabs/tailwindcss"],
    scaffoldCommand: "npx -y create-next-app@latest . --ts --tailwind --eslint --app --src-dir --no-import-alias --yes",
    requiredFiles: [
      "package.json — dependencias + scripts (dev, build, start, lint)",
      "next.config.ts (o next.config.mjs)",
      "tsconfig.json",
      "eslint.config.mjs (o .eslintrc.json)",
      "postcss.config.mjs",
      "tailwind.config.ts",
      "app/layout.tsx — root layout con html, body, metadata export",
      "app/page.tsx — página principal con contenido mínimo visible",
      "app/globals.css — con @tailwind base/components/utilities",
      "public/ — directorio (puede estar vacío)",
      "next-env.d.ts — con /// <reference types=\"next\" />",
    ],
    verifyCommand: "npx next lint",
  },
  vue: {
    title: "Vue.js",
    stack: "Vue 3, Vite, TypeScript, Tailwind CSS 4, Pinia, Vue Router, VueUse",
    context7Libs: ["vuejs/vue", "tailwindlabs/tailwindcss"],
    scaffoldCommand: "npx -y create-vite@latest . --template vue-ts",
    requiredFiles: [
      "package.json — dependencias + devDependencies + scripts (dev, build, preview)",
      "vite.config.ts — con plugin Vue (@vitejs/plugin-vue)",
      "tsconfig.json, tsconfig.app.json, tsconfig.node.json",
      "env.d.ts — con /// <reference types=\"vite/client\" />",
      "eslint.config.js",
      "postcss.config.js",
      "tailwind.config.ts (o .js)",
      "index.html — con div#app, script type=module apuntando a src/main.ts",
      "src/main.ts — createApp + mount con Pinia y Vue Router",
      "src/App.vue — componente raíz con <script setup lang=\"ts\">, <template>, <style>",
      "src/router/index.ts — configuración de Vue Router",
      "src/stores/ — al menos un store Pinia de ejemplo",
      "src/assets/main.css — con @tailwind base/components/utilities",
      "vercel.json — rewrites para SPA",
    ],
    verifyCommand: "npx vue-tsc --noEmit",
  },
  astro: {
    title: "Astro",
    stack: "Astro, React integración (@astrojs/react), TypeScript, Tailwind CSS 4",
    context7Libs: ["withastro/astro", "tailwindlabs/tailwindcss"],
    scaffoldCommand: "npx -y create-astro@latest . --template minimal --yes --typescript strict --no-install --no-git",
    requiredFiles: [
      "package.json — dependencias + scripts (dev, build, preview)",
      "astro.config.mjs — con integración React (@astrojs/react) y Tailwind (@astrojs/tailwind)",
      "tsconfig.json — con extends: \"astro/tsconfigs/strict\"",
      "tailwind.config.mjs",
      "src/layouts/Layout.astro — layout base con <html>, <head>, <body>, <slot />",
      "src/pages/index.astro — página principal con contenido mínimo visible",
      "src/styles/global.css — con @tailwind base/components/utilities",
      "src/components/ — directorio para componentes (puede incluir un ejemplo .tsx)",
      "public/ — directorio para assets estáticos",
    ],
    verifyCommand: "npx astro check",
  },
  svelte: {
    title: "SvelteKit",
    stack: "SvelteKit 2, Svelte 5, TypeScript, Tailwind CSS 4, Vite",
    context7Libs: ["sveltejs/svelte", "tailwindlabs/tailwindcss"],
    scaffoldCommand: "npx -y sv create . --template minimal --types ts --no-add-ons --no-install",
    requiredFiles: [
      "package.json — dependencias + devDependencies + scripts (dev, build, preview)",
      "vite.config.ts — con plugin SvelteKit (@sveltejs/kit/vite)",
      "svelte.config.js — con adapter-auto y preprocessor",
      "tsconfig.json — con extends: \"./.svelte-kit/tsconfig.json\"",
      "postcss.config.js",
      "tailwind.config.ts (o .js)",
      "src/app.html — template HTML con %sveltekit.head% y %sveltekit.body%",
      "src/app.css — con @tailwind base/components/utilities",
      "src/routes/+layout.svelte — importa app.css",
      "src/routes/+page.svelte — página principal con contenido mínimo visible",
      "static/ — directorio para assets estáticos",
    ],
    verifyCommand: "npx svelte-check --tsconfig ./tsconfig.json",
  },
};

export const localTemplatesData: Template[] = [
  DEFAULT_TEMPLATE,
  {
    id: "react-beta",
    title: "React.js (beta)",
    description: "React 19, Vite 6, Tailwind CSS 4, Shadcn/ui. Última tecnología.",
    isOfficial: true,
    tags: ["SPA", "Frontend", "Beta"],
  },
  {
    id: "next",
    title: "Next.js",
    description: "Next.js, React, Shadcn, Tailwind y TypeScript.",
    githubUrl: "https://github.com/<vibes-sh/nextjs-template",
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
    githubUrl: "https://github.com/<vibes-sh/portal-mini-store-template",
    isOfficial: true,
    isExperimental: true,
    requiresNeon: true,
    tags: ["Full-Stack", "E-Commerce"],
  },
];
