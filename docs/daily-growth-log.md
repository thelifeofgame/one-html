# OneHTML 每日增长与优化迭代台账 (Daily Growth & Optimization Log)

> 机制目标：每天从内容优化、功能扩展、SEO、导量增长与商业化转化中筛选 1~3 项高 ROI 动作，报 `@香港老大` 审批后落地开发上线。
> 主站：`https://onehtmlapp.com` ｜ 备用节点：`https://onehtml.onehtml.workers.dev`

---

## 2026-11-19 (Day 1)
- **基线巡检数据**：
  - 已发布作品总数：12 款（`game`: 6, `visual`: 6, `tool`: **0**）
  - 今日全站访问：24h `127` / 总访问 `20,127`
  - 已完成基建：双域沙箱隔离（`onehtmlapp.com` + `sandbox.onehtmlapp.com`）、首页与 `/work/:id` Technical SEO、`/preview` HTML 实时预览工作台上线、导航顺序与排版修复。
- **今日报批提案（待 `@香港老大` 审批）**：
  1. **[内容补齐 · P0]** 消除 `tool`（实用工具）分类零库存：策展/构建并上线 2~3 款高实用性单文件工具（如 Markdown 思维导图生成器、JSON/正则/配色便携工作台），配齐封面图与防 Thin Content 中英文深度说明，接入 `collections/catalog.json` 并发布上线。
  2. **[SEO 增量 · P0]** 独立化 `/preview` 落地页 TDK 与 Sitemap 收录：为 `/preview` 增加专属 `renderPreview()`（独立 Title/Description、`canonical: https://onehtmlapp.com/preview`、`WebApplication` JSON-LD，承接 "Online HTML Preview / Claude Artifacts Runner" 搜索流量），并将 `/preview` 加入 `sitemap.xml`。
  3. **[功能与导量闭环 · P1]** 作品「在预览台打开调试 / Open in Preview」入口 + 外推文案域名规范化：支持从作品展示页/弹窗一键带源码跳入 `/preview` 进行二次编辑与试玩（安全沙箱内运行），同时将冷启动推广手册中遗留的 `onehtml.dev` 统一修正为 `https://onehtmlapp.com` 并产出今日可发的 Show HN / Reddit / X 物料包。

---

## 2026-11-20 (Day 2)
- **巡检快照与审批状态**：
  - 巡检基线：24h 访问 `83` / 累计访问 `20,195`；主站已发布 13 款（含社区投稿 `Gravity`），`tool` 分类为 0。
  - 审批人：`@香港老大` 批准执行 Day 2 全部 3 项提案。
  - 执行备注：巡检调度初始拉起子任务因系统会话超时（`Session/new timed out`）未产生实质改动，由 OneHTML 项目总负责人接管并全量闭环交付。
- **已落地交付项**：
  1. **消除 `tool` 分类零库存（上线 3 款零外部依赖单文件工具）**：
     - `markflow-mindmap`（MarkFlow · 思维导图生成器，26,955 bytes）：Markdown 缩进大纲实时转交互式 SVG 思维导图，支持折叠、缩放平移、主题切换与 SVG/PNG 导出。
     - `json-regex-lab`（JSON & 正则便携调试台，26,933 bytes）：JSON 格式化/压缩/报错定位/JSONPath 树形浏览 + 正则表达式实时高亮、捕获组拆解与替换预览。
     - `css-gradient-studio`（CSS 渐变与调色板生成器，23,584 bytes）：线性/径向/角向多色标调试、WCAG AA/AAA 文字对比度实时检测与 CSS/Tailwind/PNG/SVG 导出。
     - 配套补齐 3 张 `1200×630` 封面图及防 Thin Content 深度 SEO 元数据，写入 `collections/catalog.json`、`src/seo-meta.js`，同步导入本地 SQLite（已发布 16 款：`game`: 6, `visual`: 7, `tool`: 3）与 Cloudflare 生产 D1/KV（已发布 15 款：`game`: 6, `visual`: 6, `tool`: 3）。
  2. **Technical SEO 与分享图兜底**：
     - 新增独立 `renderPreview()` SSR 逻辑：`/preview` 拥有独立 Title/Description、`canonical`、OG/Twitter 卡片、`WebApplication` JSON-LD 与 `<noscript>` 引导；同步纳入 `/sitemap.xml`（`priority: 0.9`）。
     - 新增 `1200×630` 品牌默认分享图 `/covers/default-og.png`，替换 `resolveCoverUrl()` 与首页原本的 `/favicon.svg` 兜底（已验证无自定义封面的作品如 `Gravity` 已输出 `default-og.png`）。
  3. **「在预览台打开调试 / Open in Preview」与增长物料包**：
     - `/work/:id` SSR 与前端详情页均新增 `Open in Preview / 在预览台打开调试`（`/preview?work=:id`），`public/playground.js` 自动从归档源码 API 拉取代码载入编辑器，并内置 `localStorage` 本地草稿覆盖保护弹窗确认。
     - 彻底清理 `docs/GROWTH_AND_MONETIZATION_PLAYBOOK.md` 中的历史 `onehtml.dev` 与 `/w/:id` 残留引用，并生成今日可发的多渠道冷启动物料包 `docs/launch-pack-2026-11-20.md`（Show HN、`r/ClaudeAI`、`r/webdev`、`r/SideProject` 与 X 5-Tweet Thread）。
- **验证与发布**：
  - `npm run check`、`npm test`（46/46 全部通过）、`npm run cf:check` 均通过。
  - 主站 `https://onehtmlapp.com`（tmux `onehtml`）与 Cloudflare 生产边缘节点 `https://onehtml.onehtml.workers.dev`（含沙箱 `https://onehtml-play.onehtml.workers.dev`）均已上线并通过实测验证。

---

## 2026-11-21 (Day 3)
- **巡检快照与审批状态**：
  - 巡检基线：累计访问 `20,299` / 24h 访问 `107`；主站已发布 16 款（含社区投稿 `Gravity`，缺双语说明与专属封面且未同步至 Cloudflare 节点），Cloudflare 节点为 15 款；`openWork` 仍使用 `#work/:id` 分享链接且详情页相关推荐藏于 `<noscript>`；尚无 `/games`、`/experiments`、`/tools` 分类 SSR 页与 `/llms.txt`。
  - 审批人：`@香港老大` 批准执行 Day 3 全部 3 项提案（1+2 并行优先、3 同步闭环，暂缓 `plays` 表结构变更以保持零数据库迁移风险）。
- **已落地交付项**：
  1. **提案 1：`/work/:id` 规范分享链接与可见相关作品推荐（P0）**：
     - `public/app.js` 改造 `openWork` 与关闭弹窗逻辑为规范路径 `/work/:id`（完整保留 `#work/:id` 向下兼容与 `previousPath` 平滑回退），Share 按钮固定复制 `https://onehtmlapp.com/work/:id`。
     - `src/worker.js`（`renderWorkDetail`）移除 `<noscript>` 包裹，按同分类优先 SQL 渲染可见的 6 款「Related Creations」推荐卡片；前端弹窗底部同步渲染 6 款同分类优先推荐卡片并支持弹窗内无缝切换；修复 `#showcase-player-stage` 与弹窗 `#player-stage` ID 冲突。
  2. **提案 2：分类 SSR 落地页 + `/llms.txt` + Sitemap 扩容（P0）**：
     - 新增 `/games`（`game`）、`/experiments`（`visual`）、`/tools`（`tool`）三大分类 SSR 落地页，输出专属 TDK、Canonical、OG/Twitter 卡片、`CollectionPage` + `ItemList` JSON-LD 与可见作品列表，并与前端 `parseCategoryFromPathname` 及分类 Tab 路由联动；`wrangler.json` 的 `run_worker_first` 同步纳入上述路由。
     - 新增 `GET /llms.txt` 动态输出站点定位、核心入口与全部已发布作品直链；`/sitemap.xml` 扩展至 24 条 URL（首页 + `/preview` + 3 个分类页 + 19 款作品）；沙盒域访问 `/games`、`/experiments`、`/tools`、`/llms.txt` 均返回 `404` + `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`。
  3. **提案 3：3 款零依赖新作品 + 社区投稿 `Gravity` 归档优化 + 周六外推包（P1）**：
     - 新增上线 3 款零外部依赖单文件作品：`cellular-automata-sandbox`（`visual`，36,566 bytes）、`web-audio-synth-studio`（`tool`，36,915 bytes）、`svg-path-bezier-editor`（`tool`，29,322 bytes）及 3 张 `1200×630` PNG 封面图。
     - 升级 `scripts/import-collection.mjs` 支持 `preserve_author` 与已有 `work_versions` SHA-256 复用，原样归档社区投稿 `Gravity`（`7ff64f93-a1a6-4f4c-9618-23763484e1f2`），完整保留原作者 `author_id` 与署名 `credit: "孙猛"` 及现有版本 ID，补齐中英双语标题/深度介绍与 `1200×630` 封面图 `/covers/gravity.png`，并同步至 Cloudflare D1/KV。
     - 产出周六 Showoff Saturday 多渠道推广文案包 `docs/launch-pack-2026-11-21.md`（Show HN、Reddit 4 板块、X 6-Tweet Thread）。
- **验证与发布**：
  - `npm run check`、`npm test`（50/50 全部通过）、`npm run cf:check` 均通过。
  - 本地主站（`https://onehtmlapp.com`，tmux `onehtml`）与 Cloudflare 生产节点（`https://onehtml.onehtml.workers.dev` / `https://onehtml-play.onehtml.workers.dev`）均已同步上线并实测通过：双端均返回 **19 款**作品（`game: 6, visual: 8, tool: 5`）、`/sitemap.xml` **24 条** URL、`/llms.txt` 正常返回且沙盒试玩正常，真机无头浏览器实测 `/games`、`/tools`、`/work/:id` 与弹窗沙盒加载均无异常。
