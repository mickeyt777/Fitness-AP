# Fitness AP — Web

The Next.js Progressive Web App for Fitness AP.

## First-time setup

1. Install **Node.js LTS** from https://nodejs.org (the green "LTS" button — that's the stable version).
2. Open the `Fitness AP v1` folder in **VS Code** (File → Open Folder).
3. Open a terminal inside VS Code: `View → Terminal` (or Ctrl+`).
4. Move into this folder and install dependencies:

   ```
   cd web
   npm install
   ```

   This downloads ~200 MB of code libraries into a `node_modules` folder. Takes 1–3 minutes the first time. You'll only do this once (and again after we add new libraries).

5. Start the development server:

   ```
   npm run dev
   ```

6. Open your browser to **http://localhost:3000** — you should see the Fitness AP starter page.

Leave the terminal running while you work. Press `Ctrl+C` to stop the server when you're done.

## Project structure

```
web/
├── package.json           ← list of libraries this project uses
├── tsconfig.json          ← TypeScript configuration
├── next.config.mjs        ← Next.js configuration (mostly empty for now)
├── postcss.config.mjs     ← wires up Tailwind CSS
├── .gitignore             ← files Git should ignore (node_modules, etc.)
├── README.md              ← this file
└── src/
    └── app/
        ├── layout.tsx     ← wraps every page (sets <html>, <body>, page title)
        ├── page.tsx       ← the homepage (the file you'll edit most often)
        └── globals.css    ← global styles + Tailwind import
```

## What's where

- **The homepage** is in `src/app/page.tsx`. Change the text or styling there and save — the browser reloads instantly.
- **Tailwind classes** like `text-teal-400`, `bg-slate-900`, `px-6` style elements without writing CSS. See https://tailwindcss.com for the full list.
- **New pages** go in `src/app/<route>/page.tsx`. For example, `src/app/dashboard/page.tsx` would be reachable at `/dashboard`.

## Next steps after this works

- Set up Supabase (database + auth)
- Build the GLP-aware intake flow
- Connect the Anthropic Claude API for chat-style workout logging
