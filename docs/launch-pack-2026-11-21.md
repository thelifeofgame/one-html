# OneHTML Day 3 Saturday Multi-Channel Launch Pack (2026-11-21)

> **Official Live Site**: `https://onehtmlapp.com`  
> **SSR Category Hubs**:  
> - **Games**: `https://onehtmlapp.com/games`  
> - **Interactive Experiments**: `https://onehtmlapp.com/experiments`  
> - **Developer & Creative Tools**: `https://onehtmlapp.com/tools`  
> **Live HTML Sandbox Workbench**: `https://onehtmlapp.com/preview`  
> **GitHub**: `https://github.com/thelifeofgame/one-html`

---

## Today's Core Highlights (Saturday 2026-11-21)

1. **Three Dedicated SSR Category Hubs (`/games`, `/experiments`, `/tools`)**:
   - Server-side rendered directory landing pages with full OpenGraph/Twitter cards and structured JSON-LD (`CollectionPage` + `ItemList`) for instant social previews and organic search/LLM discovery:
     - `https://onehtmlapp.com/games` (Single-File HTML5 & WebGL Games)
     - `https://onehtmlapp.com/experiments` (Physics, Shaders, Audio & Cellular Automata)
     - `https://onehtmlapp.com/tools` (Zero-Dependency Single-File Developer Utilities)
2. **Canonical Shareable Direct Links (`/work/:id`) with Rich OG Cards**:
   - Every published creation now has a clean, SSR-rendered canonical page (`https://onehtmlapp.com/work/:id`) featuring rich OpenGraph/Twitter visual cards, visible Play & Recommendation social proof counters, and one-click **"Open in Preview"** (`https://onehtmlapp.com/preview?work=:id`).
3. **6 Featured Single-File Creations for Saturday Communities**:
   - **Gravity (by 孙猛 / Community Creation)**: `https://onehtmlapp.com/work/7ff64f93-a1a6-4f4c-9618-23763484e1f2` — Interactive orbital gravity and particle physics playground inside a single HTML file.
   - **Cellular Automata Sandbox**: `https://onehtmlapp.com/work/cellular-automata-sandbox` — Multi-rule life simulator (Conway's Life, HighLife, Brian's Brain, Day & Night) with pattern brushes and real-time FPS telemetry.
   - **Web Audio Synth Studio**: `https://onehtmlapp.com/work/web-audio-synth-studio` — Polyphonic Web Audio API synthesizer with ADSR envelope, low-pass filter resonance, arpeggiator, and real-time FFT oscilloscope.
   - **SVG Path & Cubic Bezier Editor**: `https://onehtmlapp.com/work/svg-path-bezier-editor` — Zero-dependency vector path visualizer with draggable control handles, snap-to-grid, and live SVG `<path d="...">` code generation.
   - **Saltline (Claude Artifact 3D FPS)**: `https://onehtmlapp.com/work/saltline` — Full 3D first-person tactical retro shooter packed into a single standalone HTML file.
   - **MarkFlow Mindmap**: `https://onehtmlapp.com/work/markflow-mindmap` — Live Markdown outline to interactive SVG/PNG mindmap generator (< 27KB, zero external CDNs).

---

## 1. Hacker News — Show HN

- **Title (78 chars)**:
  `Show HN: OneHTML – Zero-trust dual-origin sandbox and hub for single-file HTML`
- **URL**: `https://onehtmlapp.com`
- **First Comment (Technical Deep-Dive)**:

```text
Hey HN,

I built OneHTML (https://onehtmlapp.com, source at https://github.com/thelifeofgame/one-html) as an open-source, zero-trust sandbox runner and directory for standalone single-file HTML5 creations—ranging from 13KB retro games and Web Audio synths to the 3D simulations and micro-tools people are building with Claude Artifacts, ChatGPT, and Cursor.

Why build a dedicated host instead of serving user HTML from a static bucket or same-origin iframe?
Executing arbitrary user-submitted HTML/JS on your main origin gives any script access to session cookies, localStorage, and same-origin APIs. OneHTML separates the catalog and execution across two distinct origins:

1. Dual-Origin Zero-Trust Isolation (`onehtmlapp.com` + `sandbox.onehtmlapp.com`):
   - `https://onehtmlapp.com` handles SSR metadata, JSON-LD, authentication, voting, and the code inspector.
   - Untrusted HTML executes strictly on `https://sandbox.onehtmlapp.com` via short-lived HMAC-SHA256 signed Play Tickets inside an isolated iframe (`sandbox="allow-scripts allow-pointer-lock"`).
   - Every response from the sandbox origin enforces a locked-down CSP (`default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none';`) so scripts run at full 60fps Canvas/WebGL/WebAudio speed with zero ability to phone home or exfiltrate data.

2. Zero-Login Live Workbench (`/preview`) & One-Click Remixing:
   - Paste or drag-and-drop any `.html` file at https://onehtmlapp.com/preview to test it immediately inside the isolated runner.
   - Every work page (`https://onehtmlapp.com/work/:id`) has an "Open in Preview" action (`https://onehtmlapp.com/preview?work=:id`) that pulls the immutable SHA-256 archived source into the editor with local draft overwrite protection.

3. Today's Update — SSR Category Hubs & Pure Single-File Showcases:
   We just launched three dedicated SSR directory pages with zero-CDN single-file showcases:
   - Games (https://onehtmlapp.com/games) — e.g., Saltline 3D FPS (https://onehtmlapp.com/work/saltline)
   - Experiments (https://onehtmlapp.com/experiments) — e.g., Community orbital physics sim "Gravity" (https://onehtmlapp.com/work/7ff64f93-a1a6-4f4c-9618-23763484e1f2), Cellular Automata Sandbox (https://onehtmlapp.com/work/cellular-automata-sandbox), and Web Audio Synth Studio (https://onehtmlapp.com/work/web-audio-synth-studio)
   - Tools (https://onehtmlapp.com/tools) — e.g., SVG Path & Bezier Editor (https://onehtmlapp.com/work/svg-path-bezier-editor) and MarkFlow Mindmap (https://onehtmlapp.com/work/markflow-mindmap)

We'd love feedback on our dual-origin CSP boundaries, the `/preview` workbench UX, and any gnarly single-file HTML demos you want to throw at it!
```

---

## 2. Reddit Saturday Matrix (4 Subreddits)

### A. `r/webdev` — [Showoff Saturday]
**Title**: `[Showoff Saturday] OneHTML: A dual-origin zero-trust arcade & live sandbox for single-file HTML5 games, Web Audio synths, and zero-CDN dev tools`

```markdown
Happy Showoff Saturday r/webdev!

Over the past week I've been building **OneHTML** (https://onehtmlapp.com), an open-source showcase and zero-trust sandbox workbench for creations that fit entirely inside a single `.html` file (zero external CDNs, zero build step required to run).

### How the Dual-Origin Sandbox Works
Hosting user-submitted HTML/JS safely is tricky. We split the architecture across two domains:
- **Catalog & SSR Hub (`https://onehtmlapp.com`)**: Serves SSR canonical pages (`https://onehtmlapp.com/work/:id`) with dynamic OpenGraph cards, JSON-LD, play/recommendation counters, and the split-screen code workbench.
- **Isolated Runner (`https://sandbox.onehtmlapp.com`)**: Runs the actual HTML payload using short-lived HMAC-signed play tickets and a strict `connect-src 'none'` CSP so untrusted scripts can render WebGL/Canvas/WebAudio freely without network exfiltration or cookie access.

### What's New This Saturday
We just rolled out 3 dedicated SSR category hubs and several new zero-dependency single-file builds (<30KB each):

1. **Experiments (`https://onehtmlapp.com/experiments`)**
   - **Gravity (by 孙猛)**: https://onehtmlapp.com/work/7ff64f93-a1a6-4f4c-9618-23763484e1f2 — Interactive multi-body orbital physics simulation.
   - **Cellular Automata Sandbox**: https://onehtmlapp.com/work/cellular-automata-sandbox — Multi-rule life simulator (Conway, HighLife, Brian's Brain, Day & Night).
   - **Web Audio Synth Studio**: https://onehtmlapp.com/work/web-audio-synth-studio — Polyphonic Web Audio synthesizer with ADSR, filter resonance, arpeggiator & live FFT scope.
2. **Tools (`https://onehtmlapp.com/tools`)**
   - **SVG Path & Bezier Editor**: https://onehtmlapp.com/work/svg-path-bezier-editor — Visual cubic/quadratic Bezier curve editor with live `<path d="...">` export.
   - **MarkFlow Mindmap**: https://onehtmlapp.com/work/markflow-mindmap — Markdown outline to interactive SVG/PNG mindmap.
3. **Games (`https://onehtmlapp.com/games`)**
   - **Saltline**: https://onehtmlapp.com/work/saltline — 3D retro FPS packed into one HTML file.

You can paste and test your own single-file HTML without logging in at **https://onehtmlapp.com/preview**, or click **"Open in Preview"** on any work page to inspect and tweak its code live.

GitHub: https://github.com/thelifeofgame/one-html  
Would love feedback on the CSP architecture and the single-file tools!
```

---

### B. `r/ClaudeAI`
**Title**: `Turn your Claude Artifacts into permanent shareable links with rich OG previews — plus new single-file Physics, Synth & SVG tools on OneHTML`

```markdown
Whenever I generate a cool single-file HTML simulation, 3D game, or utility with Claude Artifacts, sharing it with friends or on X/Reddit usually means either pasting a wall of code or spinning up a static deploy.

We built **OneHTML** (https://onehtmlapp.com) as a home specifically for single-file HTML creations:

- **Zero-Login Instant Sandbox (`https://onehtmlapp.com/preview`)**: Paste any Claude-generated HTML file and run it immediately on an isolated sandbox domain (`sandbox.onehtmlapp.com`) with desktop/tablet/mobile viewport toggles.
- **Canonical Share Links with OG Cards (`https://onehtmlapp.com/work/:id`)**: Published works get a clean canonical URL that renders proper social preview cards, tracks plays & recommendations, and lets anyone click **"Open in Preview"** to inspect or remix the HTML source.
- **3 New Curated Hubs & Featured Single-File Builds**:
  - **Games (`https://onehtmlapp.com/games`)**: Check out *Saltline* (`https://onehtmlapp.com/work/saltline`), the viral 1.4MB 3D FPS built with Claude.
  - **Experiments (`https://onehtmlapp.com/experiments`)**: Try community creator 孙猛's orbital simulation *Gravity* (`https://onehtmlapp.com/work/7ff64f93-a1a6-4f4c-9618-23763484e1f2`), *Cellular Automata Sandbox* (`https://onehtmlapp.com/work/cellular-automata-sandbox`), and *Web Audio Synth Studio* (`https://onehtmlapp.com/work/web-audio-synth-studio`).
  - **Tools (`https://onehtmlapp.com/tools`)**: *SVG Path & Bezier Editor* (`https://onehtmlapp.com/work/svg-path-bezier-editor`) and *MarkFlow Mindmap* (`https://onehtmlapp.com/work/markflow-mindmap`).

If you've built a single-file Claude Artifact you're proud of, test it in `https://onehtmlapp.com/preview` or drop your link in the comments so we can feature it in the Featured Creator Spotlight!
```

---

### C. `r/ChatGPTCoding`
**Title**: `I built a zero-login sandbox (/preview) and category hubs to test, remix, and share single-file HTML5 apps generated by ChatGPT, Claude & Cursor`

```markdown
One of my favorite ways to prototype with ChatGPT / o1 / Claude / Cursor is asking for a **100% self-contained single-file `.html` app** (inline CSS + JS, zero npm packages, zero build step).

To make testing and sharing those files frictionless, I built **OneHTML** (https://onehtmlapp.com):

1. **Paste & Run Instantly (`https://onehtmlapp.com/preview`)**: No signup required. Paste the HTML block from your LLM chat, test it in a strict zero-trust sandbox (`sandbox.onehtmlapp.com` with `connect-src 'none'`), and toggle mobile/desktop viewports.
2. **Inspect & Remix Real Examples**: Every work has an **"Open in Preview"** button (`https://onehtmlapp.com/preview?work=:id`) so you can inspect clean, working single-file code and remix it in your browser.
3. **Explore by Category (New Today)**:
   - **Experiments (`https://onehtmlapp.com/experiments`)**:
     - *Gravity* (Community orbital physics sim by 孙猛): https://onehtmlapp.com/work/7ff64f93-a1a6-4f4c-9618-23763484e1f2
     - *Cellular Automata Sandbox* (4 life rules + pattern brushes): https://onehtmlapp.com/work/cellular-automata-sandbox
     - *Web Audio Synth Studio* (Polyphonic synth + live FFT): https://onehtmlapp.com/work/web-audio-synth-studio
   - **Tools (`https://onehtmlapp.com/tools`)**:
     - *SVG Path & Bezier Editor*: https://onehtmlapp.com/work/svg-path-bezier-editor
     - *MarkFlow Mindmap* (Markdown to SVG/PNG): https://onehtmlapp.com/work/markflow-mindmap
   - **Games (`https://onehtmlapp.com/games`)**:
     - *Saltline* (3D retro shooter in one HTML file): https://onehtmlapp.com/work/saltline

What's the most complex single-file HTML app you've managed to one-shot or iterate on with AI?
```

---

### D. `r/SideProject`
**Title**: `Day 3 of OneHTML: Shipped SSR category hubs (/games, /experiments, /tools), shareable /work/:id OG cards, and 6 featured single-file HTML creations`

```markdown
Hey r/SideProject! I'm building **OneHTML** (https://onehtmlapp.com), an open-source playground and curated directory for apps, games, and experiments built in a single `.html` file.

### What we shipped for Saturday:
- **3 Dedicated SSR Category Landing Pages**:
  - Games: https://onehtmlapp.com/games
  - Interactive Experiments: https://onehtmlapp.com/experiments
  - Developer & Creative Tools: https://onehtmlapp.com/tools
- **Canonical Share Links (`https://onehtmlapp.com/work/:id`)**: Every published creation now renders rich OpenGraph social preview cards, visible Play & Recommendation counters, and a one-click **"Open in Preview"** remix workflow.
- **6 Featured Single-File Showcases Live Right Now**:
  - 🪐 **Gravity** (Community orbital physics by 孙猛): https://onehtmlapp.com/work/7ff64f93-a1a6-4f4c-9618-23763484e1f2
  - 🧬 **Cellular Automata Sandbox**: https://onehtmlapp.com/work/cellular-automata-sandbox
  - 🎹 **Web Audio Synth Studio**: https://onehtmlapp.com/work/web-audio-synth-studio
  - ✒️ **SVG Path & Bezier Editor**: https://onehtmlapp.com/work/svg-path-bezier-editor
  - 🎮 **Saltline (3D FPS)**: https://onehtmlapp.com/work/saltline
  - 🗺️ **MarkFlow Mindmap**: https://onehtmlapp.com/work/markflow-mindmap

Try pasting your own single-file HTML at **https://onehtmlapp.com/preview** (zero login required). We're also opening early **Featured Creator & Sponsor Spotlight** slots on work pages—feedback on the new category hubs is super welcome!
```

---

## 3. X / Twitter — High-Engagement Visual Thread (6 Tweets)

**Tweet 1/6 (Hook + Visual OG Card & Category Hubs)**
> What can you actually fit inside a *single* `.html` file with zero external dependencies?
>
> A 3D tactical FPS, a polyphonic Web Audio synthesizer, an orbital gravity engine, and a vector Bezier editor.
>
> Today on **OneHTML**, we launched 3 dedicated SSR hubs + rich `/work/:id` cards:
> 🎮 https://onehtmlapp.com/games
> 🧪 https://onehtmlapp.com/experiments
> 🛠️ https://onehtmlapp.com/tools
>
> 6 wild single-file HTML builds you can play & inspect right now 🧵👇
>
> *[Visual: 4-panel video/GIF collage showing Gravity orbital trails, Web Audio Synth FFT visualizer, SVG Bezier control handles, and Saltline 3D FPS]*

**Tweet 2/6 (Community Creation + Physics & Automata)**
> 1️⃣ **Gravity** (by community creator 孙猛) & **Cellular Automata Sandbox**
>
> Multi-body orbital mechanics and a 60fps multi-rule life engine (Conway, HighLife, Brian's Brain, Day & Night)—all inline Canvas + JS.
>
> Every canonical `/work/:id` link now renders a clean OpenGraph preview card:
> 🪐 https://onehtmlapp.com/work/7ff64f93-a1a6-4f4c-9618-23763484e1f2
> 🧬 https://onehtmlapp.com/work/cellular-automata-sandbox
>
> *[Visual: Native X OpenGraph preview card render of `/work/cellular-automata-sandbox` alongside live gameplay clip]*

**Tweet 3/6 (Web Audio Synth & SVG Path Editor)**
> 2️⃣ **Web Audio Synth Studio** & **SVG Path Bezier Editor**
>
> Zero npm packages. Zero external CDNs. Under 30KB each:
> 🎹 Polyphonic Web Audio API synth with ADSR, filter resonance, arpeggiator & live FFT scope:
> https://onehtmlapp.com/work/web-audio-synth-studio
>
> ✒️ Interactive cubic/quadratic SVG path editor with live `<path d="...">` export:
> https://onehtmlapp.com/work/svg-path-bezier-editor

**Tweet 4/6 (Saltline 3D FPS & MarkFlow Mindmap)**
> 3️⃣ **Saltline (3D FPS)** & **MarkFlow Mindmap**
>
> From @felixrieseberg's 1.4MB Claude-generated 3D shooter to a 26KB Markdown-to-SVG mindmap studio:
> 🎮 https://onehtmlapp.com/work/saltline
> 🗺️ https://onehtmlapp.com/work/markflow-mindmap
>
> Click **"Open in Preview"** on any page to load its immutable SHA-256 archived source straight into the editor.

**Tweet 5/6 (Zero-Login `/preview` Sandbox + Dual-Origin Security)**
> Built a single-file HTML app with Claude Artifacts, ChatGPT, or Cursor?
>
> Paste or drop it at 👉 https://onehtmlapp.com/preview
>
> No login required. Your code executes on an isolated sandbox domain (`sandbox.onehtmlapp.com`) with strict `connect-src 'none'` CSP and instant desktop/tablet/mobile viewport toggles.
>
> *[Visual: Screenshot of `https://onehtmlapp.com/preview?work=svg-path-bezier-editor` split-screen code + live sandbox runner]*

**Tweet 6/6 (Creator Inclusion & Sponsor Spotlight Hook)**
> We're curating the best single-file HTML5 games, shaders, and micro-tools on the web—and opening our first **Featured Creator & Sponsor Spotlight** slots across work detail pages.
>
> 🚀 Submit your single-file HTML creation or test it live at https://onehtmlapp.com/preview
> 💬 Reply with your `.html` project link—we're hand-picking 10 community builds for next week's front-page spotlight!
