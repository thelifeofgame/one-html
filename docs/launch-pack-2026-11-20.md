# OneHTML Day 2 Multi-Channel Launch Pack (2026-11-20)

> **Official Live Site**: `https://onehtmlapp.com`  
> **Live HTML Sandbox Workbench**: `https://onehtmlapp.com/preview`  
> **Backup Edge Mirror**: `https://onehtml.onehtml.workers.dev`  
> **GitHub**: `https://github.com/thelifeofgame/one-html`

---

## Today's 3 Core Highlights

1. **Zero-Dependency Single-File Developer Tools Collection (`tool` category)**:
   - **MarkFlow Mindmap** (`https://onehtmlapp.com/work/markflow-mindmap`): Real-time Markdown outline to interactive SVG mindmap with collapse/expand, zoom/pan, themes, and SVG/PNG export.
   - **JSON & Regex Lab** (`https://onehtmlapp.com/work/json-regex-lab`): Portable JSON formatter/validator/JSONPath tree inspector + live Regex matcher & capture group debugger.
   - **CSS Gradient Studio** (`https://onehtmlapp.com/work/css-gradient-studio`): Multi-stop Linear/Radial/Conic gradient builder with real-time WCAG AA/AAA text contrast auditing and CSS variable/PNG/SVG export.
2. **Dedicated Live HTML Preview & AI Artifact Sandbox (`/preview`)**:
   - Paste or drop any single-file HTML5, Claude Artifact, or GPT-generated HTML at `https://onehtmlapp.com/preview` and execute it instantly on an isolated sandbox origin (`sandbox.onehtmlapp.com`) with strict CSP.
3. **One-Click "Open in Preview" Debugging (`/preview?work=:id`)**:
   - Inspect, modify, and live-test any published community game, shader, or tool directly in the sandbox workbench with local draft overwrite protection.

---

## 1. Hacker News — Show HN

- **Title (79 chars)**:
  `Show HN: OneHTML – Isolated sandbox runner & hub for single-file AI HTML apps`
- **URL**: `https://onehtmlapp.com/preview`
- **First Comment (Technical Deep-Dive)**:

```text
Hey HN,

I built OneHTML (https://onehtmlapp.com, open source at https://github.com/thelifeofgame/one-html) as a zero-trust sandbox runner and archive for standalone, single-file HTML5 apps—especially the wave of 3D games, shaders, and micro-tools people are generating with Claude Artifacts, GPT/Codex, and Cursor.

Why not just drop an HTML file on a static host or an ordinary iframe?
Running untrusted user-submitted HTML/JS on the same origin exposes cookies, localStorage, and session state to XSS. On OneHTML, we separate responsibilities across two domains:

1. Dual-Origin Zero-Trust Sandbox:
   - Auth, metadata, comments, and voting live on `onehtmlapp.com`.
   - User-uploaded HTML executes exclusively on `sandbox.onehtmlapp.com` inside a strict CSP (`default-src 'none'; connect-src 'none'; frame-ancestors ...`) with short-lived, HMAC-SHA256 signed Play Tickets.

2. Live HTML Preview Workbench (`/preview`):
   - You can paste or drag-and-drop any standalone HTML file at https://onehtmlapp.com/preview to test it immediately in the isolated runner without creating an account, or click "Open in Preview" on any community work (`/preview?work=<id>`) to inspect and remix its source.

3. Immutable Content-Addressable Versioning:
   - Every submitted HTML revision is hashed (SHA-256) and stored immutably so community adaptations never overwrite original releases.

Today we also shipped three zero-dependency, offline-safe single-file utilities in the Tools section (a Markdown-to-SVG mindmap generator, a JSON & Regex debugger with JSONPath copy, and a CSS gradient + WCAG contrast studio), all ~25KB each with zero external network calls.

Would love feedback on the sandbox CSP boundaries, the preview workbench UX, and what edge cases you'd test!
```

---

## 2. Reddit Matrix (Value-First Posts)

### A. `r/ClaudeAI`
**Title**: `I built a free zero-trust sandbox (/preview) to instantly run & share standalone Claude Artifacts HTML files — plus 3 zero-dependency single-file dev tools`

```markdown
If you build single-file HTML5 apps or games with Claude Artifacts, sharing them outside Claude usually means either pasting code in a chat or setting up Vercel/GitHub Pages just to send a playable link.

I put together **OneHTML** (https://onehtmlapp.com) specifically for single-file HTML creations:

- **Instant Runner (`/preview`)**: Paste or drag any Claude-generated `.html` file at https://onehtmlapp.com/preview — it executes immediately on an isolated sandbox domain (`sandbox.onehtmlapp.com`) with `connect-src 'none'` so you can safely test untrusted code.
- **Open in Preview (`?work=:id`)**: Every published demo on the site (from Felix Rieseberg's 1.4MB Claude FPS *Saltline* to WebGL fluid sims) now has an **Open in Preview** button so you can pull the full HTML source into the editor, tweak prompts/code live, and see changes in real time.
- **New Single-File Utilities**: Added 3 self-contained tools (< 27KB each, zero CDNs):
  - MarkFlow Mindmap (`https://onehtmlapp.com/work/markflow-mindmap`)
  - JSON & Regex Lab (`https://onehtmlapp.com/work/json-regex-lab`)
  - CSS Gradient + WCAG Contrast Studio (`https://onehtmlapp.com/work/css-gradient-studio`)

No signup needed to use the `/preview` workbench. Curious what kinds of single-file Artifacts you'd like to host or inspect next!
```

### B. `r/webdev`
**Title**: `How we built a dual-origin zero-trust HTML5 playground (/preview) and 25KB single-file dev tools with strict CSP`

```markdown
One tricky problem with building a browser-based HTML playground or community arcade is safely executing arbitrary HTML/CSS/JS without risking session hijacking or outbound data exfiltration.

In **OneHTML** (open source: https://github.com/thelifeofgame/one-html), we split the app into two origins:
- Main app (`https://onehtmlapp.com`): SSR metadata/JSON-LD, auth, D1/SQLite catalog, and the code editor UI.
- Isolated sandbox (`https://sandbox.onehtmlapp.com`): Serves the preview runner and signed play tickets under `sandbox allow-scripts allow-pointer-lock`, `default-src 'none'`, `connect-src 'none'`, and `X-Robots-Tag: noindex, nofollow`.

Today we shipped two updates:
1. **Dedicated `/preview` Workbench + `?work=:id` Deep-Linking**: Any published work can be opened in `/preview?work=<id>` via our immutable version source API, with local `localStorage` draft conflict detection so you never silently overwrite unsaved edits.
2. **Three Zero-Dependency Utilities (<27KB each)**: We built a Markdown-to-SVG mindmap tool, a JSON/Regex debugger, and a CSS gradient + WCAG contrast auditor—all running 100% client-side inside that strict `connect-src 'none'` CSP.

Live playground: https://onehtmlapp.com/preview
Would love critique from fellow webdevs on our CSP headers and iframe `postMessage` handshake!
```

### C. `r/SideProject`
**Title**: `Launched Day 2 of OneHTML: an isolated playground & curated hub for single-file HTML5 games and micro-tools`

```markdown
I've been building **OneHTML** (https://onehtmlapp.com), a home for single-file HTML5 creations—games, WebGL experiments, and tiny utilities that fit in a single `.html` file with zero build step.

Today's update focuses on turning it from a passive gallery into a maker workbench:
- **Live HTML Preview (`/preview`)**: Paste any single-file HTML (from Claude, ChatGPT, or your own editor) and run it side-by-side in an isolated sandbox with mobile/tablet/desktop viewport toggles.
- **Remix / Debug Any Work**: Click "Open in Preview" on any piece in the gallery to load its archived HTML source into the editor and experiment live.
- **Filled our Tools category**: Shipped 3 lightweight, offline-ready utilities—MarkFlow Mindmap, JSON & Regex Lab, and CSS Gradient Studio (each under 27KB, single file, no tracking).

Try the live workbench here: https://onehtmlapp.com/preview
Feedback on the UX and tool ideas is very welcome!
```

---

## 3. X (Twitter) 5-Tweet Launch Thread

**Tweet 1/5 (Hook + Live Workbench)**
> Every day people generate wild 3D games and tools in a *single HTML file* with Claude & GPT—but safely running and sharing them is still clunky.
>
> Today we shipped OneHTML's standalone `/preview` sandbox + 3 zero-dependency single-file dev tools.
>
> Try it live (no login): https://onehtmlapp.com/preview 🧵👇
>
> *[Screenshot placeholder: Split-screen `/preview` workbench running a single-file HTML app with desktop/mobile viewport toggles]*

**Tweet 2/5 (Zero-Trust Dual-Domain Security)**
> Running arbitrary HTML in an iframe on your main domain is an XSS nightmare.
>
> OneHTML isolates execution onto a separate sandbox domain (`sandbox.onehtmlapp.com`) with `connect-src 'none'`, strict CSP, and signed short-lived play tickets—while keeping immutable SHA-256 versions of every file.

**Tweet 3/5 (3 New Single-File Tools < 27KB)**
> To kick off our Tools category, we built 3 ultra-lightweight utilities—each a single `.html` file under 27KB with ZERO external CDNs:
>
> 🗺️ MarkFlow Mindmap (Markdown → SVG/PNG)
> 🧩 JSON & Regex Lab (Tree JSONPath + Capture Groups)
> 🎨 CSS Gradient Studio (Multi-stop + WCAG AA/AAA check)
>
> *[Screenshot placeholder: 3-card collage of MarkFlow Mindmap, JSON & Regex Lab, and CSS Gradient Studio covers]*

**Tweet 4/5 (Open in Preview Remix Loop)**
> My favorite workflow from today's release:
>
> See a cool WebGL fluid sim, 13KB shooter, or tool in the gallery? Click **"Open in Preview"** to load its archived source straight into `/preview?work=<id>`, tweak the code live, and re-download or submit a remix.
>
> (With local draft protection so your unsaved edits never get wiped!)

**Tweet 5/5 (CTA)**
> Single-file HTML is having a renaissance in the AI era.
>
> Test your own Artifacts or explore the collection:
> 👉 Sandbox Workbench: https://onehtmlapp.com/preview
> 👉 Gallery: https://onehtmlapp.com
> 👉 Open Source: https://github.com/thelifeofgame/one-html
>
> What single-file tool or game should we add next?
