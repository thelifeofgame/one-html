# OneHTML Platform (one-html)

> **One HTML, Infinite Worlds.**  
> A high-performance, sandbox-isolated hosting and playback platform for standalone single-file HTML5 games, generative 3D visual showcases, and AI-created interactive artifacts.

---

## 🌟 Overview

**OneHTML** is designed specifically for the modern generative AI era (Claude Artifacts, OpenAI Codex/GPT-5+ single-file demos, v0/Cursor HTML builds). It allows creators to upload, version, review, and execute rich, standalone HTML5 applications within strict, cryptographically verified sandbox origins.

### Core Features

1. **Dual-Origin Security Sandbox**:
   - Primary site origin (`SITE_ORIGIN`) for user authentication, community discovery, search, and work management.
   - Isolated sandbox origin (`SANDBOX_ORIGIN`) for zero-trust client-side HTML execution.
   - Signed, time-bounded Play Tickets (`play-tickets.js`) prevent cross-origin leaks and unauthorized framing.
2. **Immutable Version Archival**:
   - Content-addressable storage for HTML versions with SHA-256 integrity verification.
   - Full version history, rollback, and community fork support.
3. **Multi-Provider & Cloudflare Ready**:
   - Runs locally on Node.js (>=22.5) with native experimental SQLite.
   - Natively deployable to Cloudflare Workers + D1 Database + R2 Object Storage.
4. **Authentication & Community**:
   - Native Google OAuth 2.0 integration + secure session management.
   - Likes, bookmarks, play counts, and category exploration.

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 22.5 (Native SQLite support enabled)

### Local Development
```bash
# Install dependencies
npm install

# Start local dev server with SQLite
npm run dev
# Open http://localhost:4391
```

### Self-Hosted Public Preview
```bash
# Bind to public IP for quick showcase
bash scripts/start-ip.sh <YOUR_SERVER_IP>
```

### Cloudflare Deployment
```bash
# Setup D1 and R2 bindings
npm run cf:setup

# Deploy to Cloudflare Workers
npm run cf:deploy
```

---

## 📁 Repository Structure

```
├── collections/          # Curated standalone demo archives (Saltline, Mosswing, London, OpenAI demos)
├── migrations/           # Database schema migrations (SQLite / Cloudflare D1)
├── public/               # Frontend assets, responsive UI layout, and isolated player frame
├── scripts/              # Dev server runner, Cloudflare manager, and migration scripts
├── src/
│   ├── worker.js         # Unified Cloudflare Worker / Node HTTP entrypoint
│   ├── archive.js        # Content-addressable HTML storage & versioning
│   ├── google-auth.js    # Google OAuth 2.0 authentication flow
│   ├── play-tickets.js   # Cryptographically signed sandbox launch tickets
│   └── security.js       # HTML validation, CSP policies, and sanitization
└── tests/                # Automated test suites for auth, runtime, and platform
```

---

## 📄 License
Private & Proprietary. All rights reserved.
