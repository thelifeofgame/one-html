import { createPlaygroundUI } from "./playground.js?v=20261119b";
import { art } from "./art.js";
import { createPlayer } from "./player.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const icons = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="m9 5 11 7-11 7z"/>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
  chat: '<path d="M21 11a8.5 8.5 0 0 1-9 8 9.8 9.8 0 0 1-4-.8L3 20l1.7-4.7A7.6 7.6 0 0 1 3 11a9 9 0 0 1 18 0Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  game: '<path d="M6 8h12c3 0 5 10 2 11-2 1-4-3-5-3H9c-1 0-3 4-5 3C1 18 3 8 6 8Z"/><path d="M7 10v5m-2.5-2.5h5M16 11h.01M18 14h.01"/>',
  visual:
    '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
  tool: '<path d="m14 6 4 4M3 21l7-7m-3-3 6 6M16 3l5 5-7 7-5-5z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  share: '<path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7"/>',
  leaf: '<path d="M19 3C8 1 0 11 7 17s15-3 12-14ZM5 21l10-11"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  mobile: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.visual}</svg>`;
const state = {
  lang:
    localStorage.getItem("onehtml.lang") ||
    (navigator.language.startsWith("zh") ? "zh" : "en"),
  works: [],
  user: null,
  category: "all",
  search: "",
  view: location.pathname === "/preview" || location.hash === "#preview" ? "preview" : "discover",
  spaceTab: "favorites",
  submissions: [],
  sponsorRequests: [],
  spaceLoadedUser: null,
  modal: null,
  work: null,
  adminTab: "works",
  sandboxOrigin: null,
  authProviders: { google: false },
  visits: { total: 20000, last_24h: 1 },
  playground: {
    code: "",
    autoRun: true,
    device: "desktop",
    status: "ready",
    statusText: "",
    errorMsg: "",
  },
};
let activePlayer = null,
  modalEpoch = 0;

function removeFullscreenExitButton() {
  document.querySelectorAll(".fullscreen-exit-btn").forEach((btn) => btn.remove());
}

function updateFullscreenExitButton(stage) {
  removeFullscreenExitButton();
  if (
    document.fullscreenElement === stage ||
    stage?.classList.contains("player-fallback-fullscreen")
  ) {
    const exitBtn = document.createElement("button");
    exitBtn.className = "fullscreen-exit-btn";
    exitBtn.innerHTML = `${icon("close")}<span>${t("Exit Fullscreen", "退出全屏")}</span>`;
    exitBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      exitFullscreen(stage);
    });
    stage.appendChild(exitBtn);
  }
}

async function requestFullscreen(stage) {
  if (!stage) return;
  if (stage.requestFullscreen) {
    try {
      await stage.requestFullscreen();
    } catch {
      stage.classList.add("player-fallback-fullscreen");
      updateFullscreenExitButton(stage);
    }
  } else {
    stage.classList.add("player-fallback-fullscreen");
    updateFullscreenExitButton(stage);
  }
}

async function exitFullscreen(stage) {
  if (!stage) stage = $("#player-stage");
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {}
  }
  if (stage?.classList.contains("player-fallback-fullscreen")) {
    stage.classList.remove("player-fallback-fullscreen");
  }
  removeFullscreenExitButton();
}

document.addEventListener("fullscreenchange", () => {
  const stage = $("#player-stage");
  if (stage) updateFullscreenExitButton(stage);
});

function releasePlayer() {
  exitFullscreen($("#player-stage"));
  const player = activePlayer;
  activePlayer = null;
  player?.destroy();
}
const t = (en, zh) => (state.lang === "zh" ? zh : en);
const title = (work) =>
  state.lang === "zh" && work.title_zh ? work.title_zh : work.title;
const description = (work) =>
  state.lang === "zh" && work.description_zh
    ? work.description_zh
    : work.description;
const categoryName = (category) =>
  ({
    all: t("Everything", "全部"),
    game: t("Games", "小游戏"),
    visual: t("Experiments", "交互实验"),
    tool: t("Little tools", "小工具"),
  })[category];
const statusName = (value) =>
  ({
    pending: t("In review", "待审核"),
    published: t("Published", "已发布"),
    rejected: t("Not approved", "未通过"),
    archived: t("Archived", "已存档"),
    contacted: t("Spotlight active", "展示中"),
    declined: t("Declined", "未通过"),
  })[value] || value;
const artwork = (work) =>
  `<div class="work-art">${/^\/covers\/[a-z0-9-]+\.(png|webp)$/.test(work.cover) ? `<img src="${esc(work.cover)}" alt="" loading="lazy" decoding="async">` : art[work.cover] || art.custom}</div>`;
const closeButton = () =>
  `<button class="close-button" data-action="close" aria-label="${t("Close", "关闭")}">${icon("close")}</button>`;
let fieldIndex = 0;
function field(label, input, help = "") {
  const existing = input.match(/\bid="([^"]+)"/);
  const inputId = existing ? existing[1] : `field-${++fieldIndex}`;
  const control = existing
    ? input
    : input.replace(/^<(input|select|textarea)/, `<$1 id="${inputId}"`);
  return `<div class="form-field"><label for="${inputId}">${label}</label>${control}${help ? `<small>${help}</small>` : ""}</div>`;
}
const button = (text, action, className = "button-primary", glyph = "") =>
  `<button class="button ${className}" data-action="${action}">${glyph ? icon(glyph) : ""}${text}</button>`;

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const result = await response.json();
  const errors = {
    "This username is already taken.": "这个用户名已被使用，请换一个。",
    "Username or password is incorrect.": "用户名或密码不正确。",
    "Please sign in to continue.": "请先登录，再继续操作。",
    "Too many attempts. Please try again later.": "操作太频繁，请稍后重试。",
    "The HTML file must be smaller than 2 MB.": "HTML 文件不能超过 2 MB。",
    "Please submit a valid HTML document.": "请提交有效的 HTML 文档。",
    "Please complete the title, description, and category.":
      "请填写完整的名称、介绍和分类。",
    "Source links must start with https://.":
      "原始来源链接需要以 https:// 开头。",
    "Source links must be valid http:// or https:// URLs.":
      "来源链接需要是有效的 http:// 或 https:// 地址。",
    "You have already submitted this HTML in the last 24 hours.":
      "这份 HTML 在 24 小时内已经提交过，无需重复收录。",
    "This version is already in the archive.": "这份内容已在版本存档中。",
    "The stored file no longer matches its archived version.":
      "文件与存档版本不一致，已停止加载。",
    "The review session has ended.": "审核登录已失效，请重新登录后打开预览。",
    "The isolated player is not configured yet.": "隔离播放器尚未配置。",
    "Administrator access is required.": "这项操作需要管理员权限。",
    "This work is not available.": "这个作品暂时无法访问。",
    "Something went wrong. Please try again.": "操作暂时未完成，请重试。",
  };
  if (!response.ok)
    throw Object.assign(
      new Error(
        state.lang === "zh" && errors[result.error]
          ? errors[result.error]
          : result.error || t("Please try again.", "请重试。"),
      ),
      { status: response.status },
    );
  return result;
}
let toastTimer;
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 3800);
}
function requireUser() {
  if (state.user) return true;
  openAuth();
  return false;
}
async function refreshSpaceData() {
  if (!state.user) {
    state.submissions = [];
    state.sponsorRequests = [];
    state.spaceLoadedUser = null;
    return;
  }
  const sub = await api("/submissions");
  state.submissions = sub.works || [];
  state.sponsorRequests = sub.sponsors || [];
  state.spaceLoadedUser = state.user.id;
}
async function load() {
  const [account, collection] = await Promise.all([api("/me"), api("/works")]);
  state.user = account.user;
  state.authProviders = account.auth || { google: false };
  state.works = collection.works;
  state.sandboxOrigin = collection.sandbox_origin;
  if (collection.visits) state.visits = collection.visits;
  if (state.user) {
    try {
      await refreshSpaceData();
    } catch {
      state.submissions = [];
      state.sponsorRequests = [];
    }
  } else {
    state.submissions = [];
    state.sponsorRequests = [];
    state.spaceLoadedUser = null;
  }
  render();
}
function render() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  document.title = t(
    "OneHTML — Small files. Big possibilities.",
    "OneHTML — 一个 HTML，一整个新世界",
  );
  $("#main-nav").innerHTML = [
    ["discover", t("Discover", "发现")],
    ["leaderboard", t("Leaderboard", "排行榜")],
    ["preview", t("HTML Preview", "HTML 预览")],
    ["saved", t("My space", "我的空间")],
  ]
    .map(
      ([view, label]) =>
        `<button class="nav-link ${state.view === view ? "active" : ""}" data-view="${view}">${label}</button>`,
    )
    .join("");
  const vTotal = Number(state.visits?.total || 20000).toLocaleString();
  const v24h = Number(state.visits?.last_24h || 1).toLocaleString();
  const visitStatsHtml = `<div class="header-stats" title="${t("Visitors in last 24h / Total visitors", "过去 24 小时访问量 / 总访问量")}"><span class="stats-badge"><span class="stats-dot"></span><span class="stats-label">${t("24h", "24小时")}</span><strong>${v24h}</strong></span><span class="stats-divider">/</span><span class="stats-badge"><span class="stats-label">${t("Total", "总访问")}</span><strong>${vTotal}</strong></span></div>`;
  $("#header-actions").innerHTML =
    `${visitStatsHtml}<button class="language-button" data-action="language" aria-label="${t("Switch to Chinese", "切换到英文")}">${icon("globe")}${t("中文", "EN")}</button>${state.user ? `<details class="profile"><summary><span class="avatar">${esc(state.user.display_name[0].toUpperCase())}</span>${esc(state.user.display_name)}</summary><div class="profile-menu"><button data-space-jump="favorites">${t("Saved works", "我的收藏")}</button><button data-space-jump="submissions">${t("My submissions", "我的投稿")}</button><button data-space-jump="sponsors">${t("Spotlight requests", "赞助申请")}</button>${state.user.role === "admin" ? `<button data-action="admin">${t("Review desk", "审核后台")}</button>` : ""}<button data-action="logout">${t("Sign out", "退出登录")}</button></div></details>` : `<button class="text-button" data-action="login">${t("Sign in", "登录")}</button>`}${button(t("Submit a creation", "投稿作品"), "upload", "button-dark", "plus")}`;
  const isPreview = state.view === "preview";
  if ($("#hero")) $("#hero").hidden = state.view !== "discover";
  if ($("#work-showcase")) $("#work-showcase").hidden = isPreview;
  if ($("#collection")) $("#collection").hidden = isPreview;
  if ($("#closing-note")) $("#closing-note").hidden = isPreview;
  const pgSection = $("#preview-playground");
  if (pgSection) {
    pgSection.hidden = !isPreview;
    if (isPreview && (!pgSection.dataset.ready || pgSection.dataset.lang !== state.lang)) {
      createPlaygroundUI({ state, t, icon, toast, openUpload });
      pgSection.dataset.ready = "1";
      pgSection.dataset.lang = state.lang;
    }
  }
  const featured =
    state.works.find((work) => work.id === "saltline") ||
    state.works.find((work) => work.id === "tiny-sail") ||
    state.works[0];
  if ($("#hero")) $("#hero").innerHTML =
    `<div class="hero-copy"><span class="eyebrow"><span class="eyebrow-dot"></span>${t("A playground for curious minds", "为好奇心留一片游乐场")}</span><h1>${t("Small files.<br><em>Big possibilities.</em>", "一个 HTML，<br><em>一整个新世界。</em>")}</h1><p class="hero-description">${t("Little games, playful experiments, and surprisingly useful tools. Discover what a single HTML can do.", "小游戏、交互实验，还有意想不到的实用工具。<br>看看一个小小的 HTML，能装下多少奇思妙想。")}</p><div class="hero-cta">${button(t("Find your next favorite", "发现有趣的作品"), "explore", "button-primary", "arrow")}<button class="text-button" data-action="about">${t("What is OneHTML?", "认识 OneHTML")}${icon("arrow")}</button></div><div class="hero-small"><span>${t("No installs. Just play.", "无需安装，点开即玩")}</span><span>${t("Made to be shared.", "好作品，值得被看见")}</span></div></div><div class="hero-feature"><button class="featured" data-work="${esc(featured?.id || "tiny-sail")}"><div class="featured-art">${featured ? artwork(featured) : art.sail}</div><div class="featured-caption"><div><strong>${featured?.id === "saltline" ? t("A whole harbor. In 1.4 MB.", "1.4 MB，一个雨夜港口。") : featured ? esc(title(featured)) : t("A little escape, in your browser.", "给自己一场海上的小逃离。")}</strong><small>${featured ? esc(featured.credit) : "OneHTML Lab"}</small></div><span class="round-play">${icon("play")}</span></div><span class="featured-sticker">${icon("visual")}${t("PRESS", "点开")}<br>${t("PLAY", "看看")}</span></button></div>`;
  const savedCount = state.works.filter((work) => work.saved).length;
  const spaceCount = !state.user
    ? 0
    : state.spaceTab === "submissions"
      ? state.submissions.length
      : state.spaceTab === "sponsors"
        ? state.sponsorRequests.length
        : savedCount;
  $("#collection-heading").innerHTML =
    `<div class="section-title"><h2 id="collection-title">${state.view === "saved" ? t("My space", "我的空间") : state.view === "leaderboard" ? t("Community favorites", "大家都喜欢") : t("The good stuff", "有趣的，都在这里")}</h2><span class="count-badge">${state.view === "saved" ? spaceCount : state.works.length}</span></div><span class="section-aside">${icon("leaf")}${state.view === "saved" ? t("Saved works, submissions & spotlight progress.", "收藏作品、投稿审核与赞助进度，一站查看。") : t("Small creations. A little joy.", "小小作品，大大乐趣。")}</span>`;
  const spaceTabs = [
    ["favorites", "bookmark", t("Saved", "我收藏的"), savedCount],
    ["submissions", "code", t("My submissions", "我的投稿"), state.submissions.length],
    ["sponsors", "visual", t("Spotlights", "赞助申请"), state.sponsorRequests.length],
  ];
  $("#toolbar").innerHTML = state.view === "saved"
    ? `<div class="category-tabs">${spaceTabs.map(([tab, glyph, label, count]) => `<button class="category-tab ${state.spaceTab === tab ? "active" : ""}" data-space-tab="${tab}">${icon(glyph)}${label}${state.user ? ` <span class="tab-count">${count}</span>` : ""}</button>`).join("")}</div><div class="search-sort"><label class="search-box">${icon("search")}<input id="search" type="search" placeholder="${t("Filter your space…", "筛选我的空间…")}" aria-label="${t("Filter my space", "筛选我的空间")}" value="${esc(state.search)}"></label></div>`
    : `<div class="category-tabs">${["all", "game", "visual", "tool"].map((category) => `<button class="category-tab ${state.category === category ? "active" : ""}" data-category="${category}">${icon(category === "all" ? "grid" : category)}${categoryName(category)}</button>`).join("")}</div><div class="search-sort"><label class="search-box">${icon("search")}<input id="search" type="search" placeholder="${t("Find something fun…", "搜点有趣的…")}" aria-label="${t("Search creations", "搜索作品")}" value="${esc(state.search)}"></label></div>`;
  $("#sponsor-banner").innerHTML =
    `<aside class="sponsor-banner"><span class="sponsor-icon">✳</span><div><h3>${t("Made something worth a little spotlight?", "你的作品，值得更多人看见。")}</h3><p>${t("Apply for a 7-day sponsored spot, from $5. Reviewed by a human.", "申请 7 天赞助展示，5 美元起，人工审核。")}</p></div>${button(t("Get a little spotlight", "申请展示位置"), "sponsor", "button-outline", "arrow")}</aside>`;
  $("#closing-note").innerHTML =
    `<span class="little-star">✳</span><p>${t("The internet could use a little more play.", "互联网，还可以再有趣一点。")}</p><small>${t("Made something delightful? There’s a little place for it here.", "如果你也做了点有意思的东西，这里给它留了一个位置。")}</small>`;
  $("#footer").innerHTML =
    `<a href="/" class="footer-brand">onehtml<span class="brand-dot">.</span></a><span class="footer-copy">${t("A small corner of the internet, made for discovery.", "互联网的一个小角落，留给发现与创造。")}</span><div class="footer-links"><button data-action="about">${t("About", "关于")}</button><button data-action="guidelines">${t("Submission guide", "投稿指南")}</button><button data-action="sponsor">${t("Sponsor a spot", "赞助展示")}</button><button data-action="contact">${t("Contact Us", "联系我们")}</button></div>`;
  if (!isPreview) {
    renderWorks();
  }
}
function compareWorks(a, b) {
  const sponsorDiff = (b.sponsor_amount_cents || 0) - (a.sponsor_amount_cents || 0);
  if (sponsorDiff !== 0) return sponsorDiff;
  const likesDiff = (b.likes || 0) - (a.likes || 0);
  if (likesDiff !== 0) return likesDiff;
  return (a.created_at || 0) - (b.created_at || 0);
}
function filteredWorks() {
  const query = state.search.trim().toLowerCase();
  return state.works
    .filter(
      (work) =>
        (state.view === "saved" || state.category === "all" || work.category === state.category) &&
        (state.view !== "saved" || work.saved) &&
        (!query ||
          [
            work.title,
            work.title_zh,
            work.description,
            work.description_zh,
            work.credit,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query)),
    )
    .sort(compareWorks);
}
function renderSpaceTab(element) {
  const query = state.search.trim().toLowerCase();
  const locale = state.lang === "zh" ? "zh-CN" : "en-US";
  if (state.spaceTab === "submissions") {
    const items = state.submissions.filter((item) =>
      !query ||
      [item.title, item.title_zh, item.description, item.description_zh, item.credit, item.review_note]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
    if (!items.length) {
      element.innerHTML = `<div class="empty-state">${icon("code")}<h3>${query ? t("No matching submissions.", "没有找到匹配的投稿。") : t("No submissions yet.", "你还没有投稿过作品。")}</h3><p>${query ? t("Try another keyword, or clear the search box.", "换个关键词试试，或清空筛选条件。") : t("Upload a single HTML file to get reviewed and hosted on OneHTML.", "上传单个 HTML 文件即可提交审核，审核通过后将在社区展示。")}</p>${button(t("Submit a creation", "投稿作品"), "upload", "button-primary", "plus")}</div>`;
      return;
    }
    element.innerHTML = `<div class="space-list">${items
      .map((work) => {
        const isPublished = work.status === "published" && state.works.some((w) => w.id === work.id);
        return `<article class="space-card"><div class="space-card-head"><div class="space-card-title-group">${isPublished ? `<button class="space-card-title" data-work="${work.id}">${esc(title(work))}</button>` : `<h3 class="space-card-heading">${esc(title(work))}</h3>`}<span class="status-badge status-${work.status}">${statusName(work.status)}</span>${work.category ? `<span class="space-chip">${categoryName(work.category)}</span>` : ""}${work.pending_versions ? `<span class="status-badge status-pending">${t("Pending version", "待审新版本")} (${work.pending_versions})</span>` : ""}</div><span class="space-card-date">${t("Submitted", "提交于")} ${new Date(work.created_at).toLocaleDateString(locale)}</span></div>${description(work) ? `<p class="space-card-desc">${esc(description(work))}</p>` : ""}${work.review_note ? `<div class="space-feedback"><strong>${t("Review feedback:", "审核反馈：")}</strong>${esc(work.review_note)}</div>` : ""}<div class="review-buttons">${isPublished ? `<button class="button button-outline" data-work="${work.id}">${t("Open", "打开体验")}</button>` : ""}<button class="button button-outline" data-versions="${work.id}">${t("Version history", "版本历史")}</button><button class="button button-primary" data-version-upload="${work.id}">${t("Submit new version", "提交新版本")}</button></div></article>`;
      })
      .join("")}<div class="space-footer-cta">${button(t("Submit another creation", "投稿新作品"), "upload", "button-dark", "plus")}</div></div>`;
    return;
  }
  if (state.spaceTab === "sponsors") {
    const items = state.sponsorRequests.filter((req) =>
      !query ||
      [req.work_title, req.work_title_zh, req.email, req.note]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
    if (!items.length) {
      element.innerHTML = `<div class="empty-state">${icon("visual")}<h3>${query ? t("No matching spotlight requests.", "没有找到匹配的赞助申请。") : t("No spotlight requests yet.", "还没有赞助展示申请。")}</h3><p>${query ? t("Try another keyword, or clear the search box.", "换个关键词试试，或清空筛选条件。") : t("Apply for a 7-day featured spotlight for any of your published works.", "你可以为已发布的作品申请首页与排行榜 7 天置顶展示位置。")}</p>${button(t("Get a little spotlight", "申请展示位置"), "sponsor", "button-primary", "arrow")}</div>`;
      return;
    }
    const hintText = (status) =>
      status === "contacted"
        ? t("Approved — currently featured at the top of Discover & Leaderboard.", "已通过审核，当前正在首页与排行榜置顶展示。")
        : status === "declined"
          ? t("Not approved. Feel free to reach out via Contact Us if you have questions.", "本次申请未通过，如有疑问可通过页面底部联系我们。")
          : t("In human review. No payment has been collected yet.", "等待管理员人工审核，审核前不会扣款。");
    element.innerHTML = `<div class="space-list">${items
      .map((req) => {
        const workTitle = state.lang === "zh" && req.work_title_zh ? req.work_title_zh : req.work_title;
        const canOpen = req.work_status === "published" && state.works.some((w) => w.id === req.work_id);
        return `<article class="space-card"><div class="space-card-head"><div class="space-card-title-group">${canOpen ? `<button class="space-card-title" data-work="${req.work_id}">${esc(workTitle)}</button>` : `<h3 class="space-card-heading">${esc(workTitle)}</h3>`}<span class="status-badge status-${req.status}">${statusName(req.status)}</span><span class="space-chip">${(req.amount_cents / 100).toFixed(2)} / 7 ${t("days", "天")}</span></div><span class="space-card-date">${t("Applied", "申请于")} ${new Date(req.created_at).toLocaleString(locale)}</span></div><p class="space-card-desc">${t("Contact email:", "联系邮箱：")}${esc(req.email)}${req.note ? ` · ${t("Note:", "说明：")}${esc(req.note)}` : ""}</p><div class="space-feedback">${hintText(req.status)}</div></article>`;
      })
      .join("")}<div class="space-footer-cta">${button(t("Apply for another spotlight", "发起新的展示位申请"), "sponsor", "button-outline", "arrow")}</div></div>`;
    return;
  }
}

function renderWorks() {
  const element = $("#works");
  if (state.view === "saved" && !state.user) {
    element.innerHTML = `<div class="empty-state">${icon("bookmark")}<h3>${t("Your personal OneHTML space.", "你的个人作品与收藏空间。")}</h3><p>${t("Sign in to view your saved favorites, submission reviews, and spotlight requests.", "登录后可查看你的收藏作品、投稿审核进度以及赞助展示位申请。")}</p>${button(t("Sign in", "登录"), "login")}</div>`;
    return;
  }
  if (state.view === "saved" && state.spaceTab !== "favorites") {
    return renderSpaceTab(element);
  }
  const works = filteredWorks();
  if (!works.length) {
    element.innerHTML = `<div class="empty-state">${icon("search")}<h3>${t("Nothing here just yet.", "这里还空着。")}</h3><p>${state.view === "saved" ? t("Tap the bookmark on a creation to start your collection.", "点一下作品上的收藏图标，开始收集灵感。") : t("Try another search, or share a creation of your own.", "换个关键词试试，或分享你自己的作品。")}</p>${button(t("Explore everything", "看看全部作品"), "reset", "button-outline")}</div>`;
    return;
  }
  if (state.view === "leaderboard") {
    element.innerHTML = `<div class="leader-list">${works.map((work, index) => `<article class="leader-row${work.sponsored ? " is-sponsored" : ""}"><span class="rank">${String(index + 1).padStart(2, "0")}</span><button class="leader-cover" data-work="${work.id}" aria-label="${esc(title(work))}">${artwork(work)}</button><div class="leader-copy"><div class="leader-title-line"><button class="card-title" data-work="${work.id}">${esc(title(work))}</button>${work.sponsored ? `<span class="leader-sponsored">✳ ${t("Sponsored", "赞助推荐")}</span>` : ""}</div><p>${esc(description(work))}</p></div><button class="mini-button ${work.liked ? "active" : ""}" data-like="${work.id}" aria-label="${t("Like", "点赞")} ${esc(title(work))}" aria-pressed="${Boolean(work.liked)}">${icon("heart")}<span>${work.likes}</span></button></article>`).join("")}</div>`;
    return;
  }
  element.innerHTML = works
    .map(
      (work) =>
        `<article class="work-card${work.sponsored ? " is-sponsored" : ""}"><button class="cover-button" data-work="${work.id}" aria-label="${t("Open", "打开")} ${esc(title(work))}">${artwork(work)}<span class="cover-tag">${icon(work.category)}${categoryName(work.category)}</span>${work.sponsored ? `<span class="cover-sponsored">✳ ${t("Sponsored", "赞助推荐")}</span>` : ""}<span class="cover-play"><span>${icon("play")}</span></span></button><div class="card-content"><div class="card-title-row"><button class="card-title" data-work="${work.id}">${esc(title(work))}</button><button class="bookmark ${work.saved ? "active" : ""}" data-save="${work.id}" aria-label="${work.saved ? t("Unsave", "取消收藏") : t("Save", "收藏")} ${esc(title(work))}" aria-pressed="${Boolean(work.saved)}">${icon("bookmark")}</button></div><p class="card-description">${esc(description(work))}</p><div class="card-footer"><div class="author"><span class="avatar">${work.original ? "✳" : esc(work.credit[0].toUpperCase())}</span><span>${esc(work.credit)}</span></div><div class="card-interactions"><button class="mini-button ${work.liked ? "active" : ""}" data-like="${work.id}" aria-label="${t("Like", "点赞")} ${esc(title(work))}" aria-pressed="${Boolean(work.liked)}">${icon("heart")}<span>${work.likes}</span></button><button class="mini-button" data-work="${work.id}" aria-label="${t("Comments", "评论")} ${esc(title(work))}">${icon("chat")}<span>${work.comment_count}</span></button></div></div></div></article>`,
    )
    .join("");
}
function openModal(html, size = "", kind = "") {
  releasePlayer();
  modalEpoch++;
  state.sourceData = null;
  const dialog = $("#app-modal");
  $("#modal-content").innerHTML = html;
  dialog.className = size;
  state.modal = kind;
  if (!dialog.open) dialog.showModal();
}
function modalForm(heading, subtitle, content, size = "", kind = "") {
  openModal(
    `<div class="modal-body"><div class="modal-header"><div><h2>${heading}</h2><p>${subtitle}</p></div>${closeButton()}</div>${content}</div>`,
    size,
    kind,
  );
}
function closeModal() {
  $("#app-modal").close();
}
$("#app-modal").addEventListener("close", () => {
  releasePlayer();
  modalEpoch++;
  state.sourceData = null;
  $("#modal-content").innerHTML = "";
  state.modal = null;
  state.work = null;
  if (location.hash.startsWith("#work/"))
    history.replaceState(null, "", location.pathname + location.search);
});
$("#app-modal").addEventListener("click", (event) => {
  if (event.target === $("#app-modal")) {
    const rect = event.target.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      closeModal();
  }
});

function openAuth(register = false) {
  modalForm(
    t(
      register ? "Make yourself at home." : "Welcome back.",
      register ? "给好奇心安个家。" : "欢迎回来。",
    ),
    t(
      "A little account for your creations and collections.",
      "收藏喜欢的作品，也分享自己的创造。",
    ),
    `<button class="google-button" data-action="google-login" ${state.authProviders.google ? "" : "disabled"}><img src="/google-g.svg" alt="" width="20" height="20"><span>${t("Continue with Google", "使用 Google 登录")}</span></button>${!state.authProviders.google ? `<p class="auth-provider-note">${t("Google sign-in is not available yet.", "Google 登录暂未开放。")}</p>` : ""}<div class="auth-divider"><span>${t("or use your username", "或使用用户名")}</span></div><form id="auth-form" data-mode="${register ? "register" : "login"}">${register ? field(t("Display name", "显示昵称"), `<input name="display_name" maxlength="40" placeholder="${t("What should we call you?", "怎么称呼你？")}" autocomplete="nickname" required>`) : ""}${field(t("Username", "用户名"), '<input name="handle" pattern="[A-Za-z0-9_]{3,24}" minlength="3" maxlength="24" autocomplete="username" required>', t("3–24 letters, numbers, or underscores.", "3–24 位英文字母、数字或下划线。"))}${field(t("Password", "密码"), `<input name="password" type="password" minlength="12" maxlength="128" autocomplete="${register ? "new-password" : "current-password"}" required>`, t("At least 12 characters. Keep it safe; email recovery is not available yet.", "至少 12 位。请妥善保存，目前暂不支持邮箱找回。"))}<button class="button button-primary form-full" type="submit">${t(register ? "Create account" : "Sign in", register ? "创建账号" : "登录")}${icon("arrow")}</button><div class="form-error" role="alert"></div></form><div class="auth-switch">${t(register ? "Already have an account?" : "New around here?", register ? "已经有账号了？" : "第一次来？")}<button data-action="${register ? "login" : "register"}">${t(register ? "Sign in" : "Create an account", register ? "去登录" : "创建账号")}</button></div>`,
    "",
    "auth",
  );
}
function htmlFields() {
  return `<div class="upload-zone"><p>${t("Choose a single HTML file · up to 2 MB", "选择单个 HTML 文件 · 最大 2 MB")}</p><input id="html-file" type="file" accept=".html,.htm,text/html" aria-label="${t("Choose HTML file", "选择 HTML 文件")}"></div><input name="original_filename" id="source-filename" type="hidden">${field(t("HTML code", "HTML 代码"), '<textarea class="code-input" name="html" id="html-code" spellcheck="false" placeholder="<!doctype html>" required></textarea>', t("Inline scripts, styles, and embedded assets are supported. External resources are blocked by the isolated player.", "支持内联脚本、样式和嵌入素材；隔离播放器会阻止外部资源。"))}`;
}
function sourceFields(work = {}) {
  return `<details class="source-fields"><summary>${t("Source and version · optional", "来源与版本 · 均为可选")}</summary><div class="form-grid">${field(t("Source URL", "来源链接"), `<input name="source_url" type="url" value="${esc(work.source_url || "")}" placeholder="https://" maxlength="500">`)}${field(t("Source version / commit", "来源版本 / 提交号"), '<input name="source_revision" maxlength="120">')}${field(t("License · optional", "许可 · 可留空"), `<input name="license" value="${esc(work.license || "")}" maxlength="120">`)}${field(t("Version type", "版本类型"), `<select name="variant"><option value="original">${t("Original", "原版")}</option><option value="adapted">${t("Adapted", "适配版")}</option></select>`)}</div>${field(t("Source notes", "来源备注"), '<textarea name="source_note" maxlength="600"></textarea>')}${field(t("Adaptation notes · if modified", "适配说明 · 修改过时填写"), '<textarea name="adaptation_note" maxlength="600"></textarea>')}</details>`;
}
function openUpload(work = null, initialCode = "") {
  if (!requireUser()) return;
  modalForm(
    work
      ? t("Submit a new version", "提交新版本")
      : t("Add a creation", "收录一个作品"),
    work
      ? t(
          `Updating ${esc(work.title)}. The current published version stays available during review.`,
          `更新「${esc(work.title)}」。审核期间，当前已发布版本继续可用。`,
        )
      : t(
          "Upload one HTML file or paste code. Source and license details are optional.",
          "上传 HTML 或粘贴代码即可收录，来源和许可信息均可留空。",
        ),
    `<form id="${work ? "version-form" : "upload-form"}" ${work ? `data-work="${work.id}"` : ""}>${work ? "" : `<div class="form-grid">${field(t("Creation name", "作品名称"), '<input name="title" maxlength="80" minlength="2" required>')}${field(t("Category", "作品分类"), `<select name="category">${["game", "visual", "tool"].map((value) => `<option value="${value}">${categoryName(value)}</option>`).join("")}</select>`)}</div>${field(t("What does it do?", "作品介绍"), '<textarea name="description" minlength="10" maxlength="600" required></textarea>')}${field(t("Original creator · optional", "原作者 · 可留空"), '<input name="credit" maxlength="80">')}`}${htmlFields()}${sourceFields(work || {})}<button class="button button-primary form-full" type="submit">${t("Send for review", "提交审核")}${icon("arrow")}</button><p class="form-note">${t("Source files and version records are kept. License information is optional.", "保留源文件和版本记录，许可信息不是收录前提。")}</p><div class="form-error" role="alert"></div></form>`,
    "medium",
    "upload",
  );
  if (initialCode) {
    const codeEl = $("#html-code");
    if (codeEl) codeEl.value = initialCode;
  }
  const zone = $(".upload-zone");
  zone.addEventListener("dragover", (event) => event.preventDefault());
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    readUpload(event.dataTransfer.files[0]);
  });
}
async function readUpload(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024)
    return toast(t("Please keep your file under 2 MB.", "文件不能超过 2 MB。"));
  if (!/\.html?$/i.test(file.name))
    return toast(t("Please choose an HTML file.", "请选择 HTML 文件。"));
  const input = $("#html-code"),
    filename = $("#source-filename");
  const html = await file.text();
  if (!input?.isConnected) return;
  input.value = html;
  filename.value = file.name;
  toast(t("HTML file loaded.", "HTML 文件已读取。"));
}
const WORK_TAGS_MAP = {
  q1k3: ["#WebGL", "#ThreeJS", "#HTML5Game", "#GameDev", "#WebAudio", "#SingleFileHTML"],
  underrun: ["#WebGL", "#Canvas", "#HTML5Game", "#GameDev", "#WebAudio", "#SingleFileHTML"],
  "canvas-tetris": ["#Canvas", "#HTML5Game", "#JavaScript", "#Arcade", "#HTML5", "#SingleFileHTML"],
  saltline: ["#ThreeJS", "#WebGL", "#HTML5Game", "#AIWebApps", "#FPS", "#SingleFileHTML"],
  mosswing: ["#ThreeJS", "#WebGL", "#GenerativeArt", "#AIWebApps", "#Procedural3D", "#SingleFileHTML"],
  "openai-asteroids": ["#Canvas", "#HTML5Game", "#AIWebApps", "#SpaceShooter", "#HTML5", "#SingleFileHTML"],
  "webgl-fluid": ["#WebGL", "#GLSL", "#Canvas", "#FluidSimulation", "#PhysicsEngine", "#SingleFileHTML"],
  "sand-spiel-lite": ["#Canvas", "#PhysicsEngine", "#CellularAutomata", "#Simulation", "#SingleFileHTML"],
  "london-railway": ["#ThreeJS", "#WebGL", "#Simulation", "#3DScene", "#AIWebApps", "#SingleFileHTML"],
  "openai-ocean": ["#ThreeJS", "#WebGL", "#Shader", "#Simulation", "#AIWebApps", "#SingleFileHTML"],
  "openai-solar": ["#ThreeJS", "#WebGL", "#3DAnimation", "#Educational", "#AIWebApps", "#SingleFileHTML"],
  "openai-lights": ["#Canvas", "#WebAudio", "#AudioAPI", "#GenerativeArt", "#AIWebApps", "#SingleFileHTML"],
};

function getWorkTechTags(work) {
  if (WORK_TAGS_MAP[work.id]) return WORK_TAGS_MAP[work.id];
  const text = `${work.title} ${work.description || ""} ${work.credit || ""}`.toLowerCase();
  const tags = new Set();
  if (/three(\.js)?|3d|orbit|scene|glsl/.test(text)) {
    tags.add("#ThreeJS");
    tags.add("#WebGL");
  } else if (/webgl|shader|rasterizer/.test(text)) {
    tags.add("#WebGL");
  }
  if (/canvas|2d|pixel|arcade|tetris/.test(text)) {
    tags.add("#Canvas");
  }
  if (/audio|sound|music|synthesizer|beat/.test(text)) {
    tags.add("#WebAudio");
    tags.add("#AudioAPI");
  }
  if (/gpt|openai|claude|ai|gemini|llm|deepseek/.test(text)) {
    tags.add("#AIWebApps");
  }
  if (work.category === "game") {
    tags.add("#HTML5Game");
    tags.add("#GameDev");
  } else if (work.category === "visual") {
    tags.add("#GenerativeArt");
    tags.add("#Canvas");
  } else {
    tags.add("#WebTool");
    tags.add("#Productivity");
  }
  tags.add("#HTML5");
  tags.add("#SingleFileHTML");
  if (!tags.has("#ThreeJS") && !tags.has("#Canvas") && !tags.has("#WebGL")) {
    tags.add("#Canvas");
  }
  return Array.from(tags);
}

async function openWork(workId) {
  const work = state.works.find((item) => item.id === workId);
  if (!work) return;
  state.work = work;
  history.replaceState(null, "", `#work/${work.id}`);
  const tags = getWorkTechTags(work);
  openModal(
    `<div class="player-header"><div class="player-heading"><span class="player-badge">${artwork(work)}</span><div><h2>${esc(title(work))}</h2><p>${esc(work.credit)} · ${categoryName(work.category)}${work.original ? " · " + t("Original demo", "本站原创示例") : ""}</p></div></div>${closeButton()}</div><div class="player-stage" id="player-stage">${artwork(work)}<div class="launch-overlay">${button(t("Let’s play", "开始体验"), "launch", "button-primary", "play")}<small>${t("Click to start · Sound may be enabled", "点击后运行 · 部分作品带有声音")}</small></div></div><div class="player-actions"><button class="button button-outline ${work.liked ? "active" : ""}" data-like="${work.id}" aria-pressed="${Boolean(work.liked)}">${icon("heart")}<span>${work.likes}</span></button><button class="button button-outline" data-save="${work.id}" aria-pressed="${Boolean(work.saved)}">${icon("bookmark")}<span>${work.saved ? t("Saved", "已收藏") : t("Save", "收藏")}</span></button>${button(t("Share", "分享"), "share", "button-outline", "share")}${button(t("Fullscreen", "全屏"), "fullscreen", "button-outline", "fullscreen")}<button class="report-button" data-action="report">${t("Report an issue", "举报问题")}</button></div><div class="detail-columns"><div><p class="detail-description">${esc(description(work))}</p><div class="work-tech-tags" style="margin-bottom:16px;">${tags.map((t) => `<span class="tech-tag">${esc(t)}</span>`).join(" ")}</div><div class="detail-label">${t("A little conversation", "聊聊这个作品")}</div>${state.user ? `<form id="comment-form" class="comment-form"><textarea name="body" maxlength="2000" placeholder="${t("What do you think?", "你觉得怎么样？")}" aria-label="${t("Your comment", "你的评论")}" required></textarea><button class="button button-dark" type="submit">${t("Post", "发送")}</button></form>` : `<p class="modal-copy"><button class="text-button" data-action="login">${t("Sign in to join the conversation →", "登录，加入讨论 →")}</button></p>`}<div id="comments"><p class="no-comments">${t("Loading comments…", "正在加载评论…")}</p></div></div><aside class="detail-meta"><dl><div><dt>${t("Created by", "创作者")}</dt><dd>${esc(work.credit)}</dd></div><div><dt>${t("License", "作品许可")}</dt><dd>${esc(work.license)}</dd></div><div><dt>${t("Source", "作品来源")}</dt><dd>${work.source_url ? `<a href="${esc(work.source_url)}" target="_blank" rel="noopener noreferrer">${t("Visit original source ↗", "查看原始来源 ↗")}</a>` : work.original ? t("OneHTML original example", "OneHTML 本站原创示例") : t("Submitted by creator", "创作者投稿")}</dd></div><div><dt>${t("Format", "作品格式")}</dt><dd>${t("One HTML · Runs in your browser", "单个 HTML · 浏览器运行")}</dd></div></dl></aside></div>`,
    "wide",
    "work",
  );
  $("#modal-content [data-like]").setAttribute(
    "aria-label",
    `${t("Like", "点赞")} ${title(work)}`,
  );
  $(".player-actions").insertAdjacentHTML(
    "beforeend",
    `<button id="stop-player" class="button button-outline" data-action="stop-player" hidden>${t("End play", "结束试玩")}</button><button class="button button-outline" data-versions="${work.id}">${t("Version history", "版本历史")}</button><span id="player-status" class="player-status" role="status"></span>`,
  );
  const licenseValue = $(".detail-meta dl>div:nth-child(2) dd");
  if (licenseValue && !work.license)
    licenseValue.textContent = t("Not specified", "未填写");
  await renderComments(work.id);
}
async function renderComments(workId) {
  const { comments } = await api(`/works/${workId}/comments`);
  if (state.work?.id !== workId || !$("#comments")) return;
  $("#comments").innerHTML = comments.length
    ? comments
        .map(
          (comment) =>
            `<article class="comment-item"><div class="comment-author"><span class="avatar">${esc(comment.display_name[0].toUpperCase())}</span>${esc(comment.display_name)}<time>${new Date(comment.created_at).toLocaleDateString(state.lang === "zh" ? "zh-CN" : "en-US")}</time></div><p>${esc(comment.body)}</p>${state.user && (state.user.id === comment.user_id || state.user.role === "admin") ? `<button data-delete-comment="${comment.id}">${t("Remove comment", "删除评论")}</button>` : ""}</article>`,
        )
        .join("")
    : `<p class="no-comments">${t("Be the first to leave a little thought.", "还没有评论，来留下第一条想法吧。")}</p>`;
}
async function launch() {
  const work = state.work;
  if (!work) return;
  if (!state.sandboxOrigin)
    return toast(
      t("The isolated player is not configured yet.", "隔离播放器尚未配置。"),
    );
  if (activePlayer?.phase === "loading") return false;
  releasePlayer();
  const stage = $("#player-stage");
  const player = createPlayer({
    container: stage,
    title: title(work),
    playOrigin: state.sandboxOrigin,
    requestTicket: (signal) =>
      api(`/works/${work.id}/play`, { method: "POST", signal }),
    onState: (phase) => {
      if (activePlayer !== player) return;
      if (["idle", "error"].includes(phase))
        stage.innerHTML = `${artwork(work)}<div class="launch-overlay">${button(phase === "error" ? t("Try again", "重新加载") : t("Let’s play", "开始体验"), "launch", "button-primary", "play")}</div>`;
      if (phase === "loading")
        stage.innerHTML = `<div class="launch-overlay"><span class="button button-outline">${t("Loading…", "正在加载…")}</span></div>`;
      const end = $("#stop-player");
      if (end) end.hidden = phase === "idle";
      const status = $("#player-status");
      if (status)
        status.textContent =
          phase === "loading"
            ? t("Opening the player…", "正在打开试玩…")
            : phase === "error"
              ? t("Could not load. Please retry.", "加载未完成，请重试。")
              : "";
    },
    onError: (error) => toast(error.message),
  });
  activePlayer = player;
  return player.start();
}
async function interact(workId, operation) {
  if (!requireUser()) return;
  const work = state.works.find((item) => item.id === workId);
  const property = operation === "like" ? "liked" : "saved";
  const result = await api(`/works/${workId}/${operation}`, {
    method: "POST",
    body: { active: !work[property] },
  });
  work[property] = result.active;
  work.likes = result.likes;
  render();
  document
    .querySelectorAll(`[data-${operation}="${workId}"]`)
    .forEach((element) => {
      element.setAttribute("aria-pressed", result.active);
      element.classList.toggle("active", result.active);
      const label = element.querySelector("span");
      if (label)
        label.textContent =
          operation === "like"
            ? result.likes
            : result.active
              ? t("Saved", "已收藏")
              : t("Save", "收藏");
    });
  if (operation === "save")
    toast(
      result.active
        ? t("Added to your collection.", "已加入收藏。")
        : t("Removed from your collection.", "已取消收藏。"),
    );
}

function openContact() {
  modalForm(
    t("Get in touch.", "联系我们。"),
    t(
      "Have an idea, partnership inquiry, or need help? We’d love to hear from you.",
      "有想法、商务合作或需要帮助？欢迎随时联系我们。",
    ),
    `<div class="modal-copy"><p>${t(
      "You can reach our team directly via email. Whether it's a product suggestion, creator feature, or business collaboration, we’re happy to connect.",
      "你可以直接通过电子邮件与我们取得联系。无论是功能建议、创作者入驻还是商业合作，我们都乐意沟通。",
    )}</p><div class="contact-card"><div class="contact-card-label">${t(
      "Official Contact Email",
      "官方联络邮箱",
    )}</div><div class="contact-email-row"><code class="contact-email-text" id="contact-email-value">www.lukasfemale@gmail.com</code><button type="button" class="contact-copy-btn" id="contact-copy-btn" aria-label="${t(
      "Copy email address",
      "复制邮箱地址",
    )}">${icon("copy")}<span>${t("Copy", "复制")}</span></button></div><a class="button button-primary form-full contact-action" href="mailto:www.lukasfemale@gmail.com?subject=OneHTML%20Inquiry" target="_blank" rel="noopener noreferrer">${icon(
      "mail",
    )}<span>${t("Open Email Client", "打开邮件客户端发送")}</span>${icon("arrow")}</a></div><div class="notice" style="margin-top:14px;margin-bottom:0;">${t(
      "We typically respond within 24 to 48 hours on business days.",
      "我们通常在 24–48 小时内回复邮件。",
    )}</div></div>`,
    "",
    "contact",
  );
  const copyBtn = $("#contact-copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const email = "www.lukasfemale@gmail.com";
      try {
        await navigator.clipboard.writeText(email);
        toast(t("Email address copied to clipboard.", "邮箱地址已复制到剪贴板。"));
      } catch {
        toast(email);
      }
    });
  }
}

function openInfo(guidelines = false) {
  modalForm(
    guidelines
      ? t("A small submission guide.", "投稿前，先看这里。")
      : t("A little more play.", "给互联网，多一点趣味。"),
    t(
      "OneHTML is a home for small, delightful creations.",
      "OneHTML 是一个收集小小创造的地方。",
    ),
    `<div class="modal-copy">${guidelines ? `<h3>${t("One file is enough.", "一个文件，就能收录。")}</h3><p>${t("Upload a single HTML file up to 2 MB, or paste the code. Games, interactive experiments, and small tools are welcome.", "上传不超过 2 MB 的单个 HTML 文件，或直接粘贴代码。欢迎小游戏、交互实验和实用工具。")}</p><h3>${t("Source details are optional.", "来源信息可以稍后补。")}</h3><p>${t("Source URL, original creator, revision, and license are optional. Keep original and adapted versions separate and describe changes when available.", "来源链接、原作者、版本号和许可信息均可留空。有适配修改时，可以另存新版本并补充说明。")}</p><h3>${t("Keep each version.", "每个版本，都留一份。")}</h3><p>${t("Files are archived with a content hash. New versions are reviewed separately while the published version stays available. Repeated submissions of the same HTML within 24 hours are detected.", "源文件会按内容哈希存档。更新版本单独审核，原已发布版本继续可用；24 小时内重复提交相同 HTML 会被识别。")}</p><h3>${t("Run it in the isolated player.", "在隔离播放器里运行。")}</h3><p>${t("Use inline scripts, styles, and embedded assets. Network calls, external dependencies, camera, and microphone are unavailable. Do not include credentials, private data, or phishing content.", "请使用内联脚本、样式和嵌入素材。播放器不开放网络请求、外部依赖、摄像头和麦克风；不要放入密钥、私人信息或钓鱼内容。")}</p>` : `<p>${t("A rain-soaked harbor. A miniature London. An ocean made of code. Explore games and experiments collected from their creators.", "一个雨夜港口，一座迷你伦敦，一片由代码生成的海。我们收录真实创作者发布的游戏与交互实验，点开就能体验。")}</p><p>${t("Discover, play, leave a thought, and save the ones you love. If you’ve made something delightful, there’s room for it here.", "你可以发现、试玩、讨论和收藏。如果你也创造了有趣的东西，这里欢迎你。")}</p><div class="notice">${t("Creator credits and source links identify each collected work. Official OpenAI examples and community projects are labeled individually. Original files and adaptation notes are available in version history. Likes and comments come from actual users.", "每件作品均标注创作者和来源，区分 OpenAI 官方示例与社区作品。版本历史保留原文件和适配说明，点赞与评论来自真实用户操作。")}</div><p>${t("Your account stores your submissions, votes, favorites, and comments. Sponsorship applications also store the contact email you provide. HTML code is delivered to visitors’ browsers and cannot be kept secret.", "账号会保存投稿、点赞、收藏与评论。赞助申请还会保存你填写的联系邮箱。HTML 会发送到访客浏览器，无法保密其中的代码。")}</p>`}</div>${button(t("Share a creation", "分享我的作品"), "upload", "button-primary", "plus")}`,
    "medium",
    "info",
  );
}
function openSponsor() {
  if (!requireUser()) return;
  const owned = state.works.filter((work) => work.author_id === state.user.id);
  const eligible =
    state.user.role === "admin"
      ? [
          ...owned,
          ...state.works.filter((work) => work.author_id !== state.user.id),
        ]
      : owned;
  modalForm(
    t("Give your creation a little spotlight.", "让你的作品，站到聚光灯下。"),
    t("7-day sponsored placement · offers from $5", "7 天赞助展示 · 5 美元起"),
    `<div class="notice">${t("Applications are open. Checkout and live auctions are not enabled. Submitting this form does not charge you or reserve a position. An administrator will review your request first.", "目前接受展示申请，尚未开通在线付款及实时竞拍。提交不会扣款，也不会预留位置；管理员会先审核申请。")}</div>${eligible.length ? `<form id="sponsor-form">${field(t("Your published creation", "你的已发布作品"), `<select name="work_id">${eligible.map((work) => `<option value="${work.id}">${esc(title(work))}</option>`).join("")}</select>`)}<div class="form-grid">${field(t("Contact email", "联系邮箱"), '<input type="email" name="email" maxlength="254" required>')}${field(t("Your offer (USD / 7 days)", "申请报价（美元 / 7 天）"), '<input type="number" name="amount" min="5" max="10000" step="0.01" value="5" required>')}</div>${field(t("Anything we should know?", "补充说明（可选）"), '<textarea name="note" maxlength="1000"></textarea>')}<button class="button button-primary form-full" type="submit">${t("Send application · no payment", "提交申请 · 暂不付款")}${icon("arrow")}</button><div class="form-error" role="alert"></div></form>` : `<p class="modal-copy">${t("You’ll need a published creation before applying for a sponsored spot. Submit your work first, and we’ll take a look.", "先发布一个属于你的作品，再申请展示位置。提交作品后，我们会尽快审核。")}</p>${button(t("Submit your creation", "投稿我的作品"), "upload", "button-primary", "plus")}`}<p class="form-note">${t("Sponsored placements will be labeled and kept separate from the organic likes ranking.", "赞助展示会明确标注，与自然点赞排名分开展示。")}</p>`,
    "",
    "sponsor",
  );
}
async function openSubmissions() {
  if (!requireUser()) return;
  await refreshSpaceData();
  const works = state.submissions;
  const sponsors = state.sponsorRequests;
  modalForm(
    t("Your creations & spotlights.", "你的投稿与展示位申请。"),
    t(
      "Review status and feedback for your submissions and spotlight requests.",
      "查看投稿审核状态、反馈与赞助展示申请进度。",
    ),
    `${works.length ? works.map((work) => `<article class="submission-item"><h3>${esc(work.title)}</h3><span class="status-badge status-${work.status}">${statusName(work.status)}</span>${work.pending_versions ? `<p>${t("Versions awaiting review", "待审核版本")}：${work.pending_versions}</p>` : ""}${work.review_note ? `<p>${esc(work.review_note)}</p>` : ""}<p>${new Date(work.created_at).toLocaleDateString()}</p><div class="review-buttons"><button class="button button-outline" data-versions="${work.id}">${t("Version history", "版本历史")}</button><button class="button button-primary" data-version-upload="${work.id}">${t("Submit new version", "提交新版本")}</button></div></article>`).join("") : `<p class="modal-copy">${t("Your first little creation could go right here.", "你的第一个小作品，就从这里开始。")}</p>`}${sponsors.length ? `<h3 style="margin:20px 0 10px;font-size:15px;">${t("Spotlight requests", "赞助申请进度")}</h3>${sponsors.map((req) => `<article class="submission-item"><h3>${esc(req.work_title)}</h3><span class="status-badge status-${req.status}">${statusName(req.status)}</span><p>${(req.amount_cents / 100).toFixed(2)} / 7 ${t("days", "天")} · ${esc(req.email)}</p>${req.note ? `<p>${esc(req.note)}</p>` : ""}<p>${new Date(req.created_at).toLocaleString()}</p></article>`).join("")}` : ""}${button(t("Submit another creation", "投稿作品"), "upload", "button-primary", "plus")}`,
    "medium",
    "submissions",
  );
}
async function openVersions(workId) {
  const epoch = modalEpoch;
  const data = await api(`/works/${workId}/versions`);
  if (epoch !== modalEpoch) return;
  const cards = data.versions
    .map(
      (version) =>
        `<article class="submission-item"><h3>${version.variant === "adapted" ? t("Adapted version", "适配版") : t("Original version", "原版")} ${version.id === data.current_version_id ? `<span class="status-badge">${t("Current", "当前版本")}</span>` : ""} <span class="status-badge status-${version.status}">${statusName(version.status)}</span></h3><p>${new Date(version.created_at).toLocaleString()} · ${(version.content_bytes / 1024).toFixed(1)} KB</p><p>SHA-256：<code>${esc(version.sha256)}</code></p>${version.source_revision ? `<p>${t("Source version", "来源版本")}：${esc(version.source_revision)}</p>` : ""}${version.source_url ? `<p><a href="${esc(version.source_url)}" target="_blank" rel="noopener noreferrer">${esc(version.source_url)}</a></p>` : ""}${version.source_note ? `<p>${esc(version.source_note)}</p>` : ""}${version.adaptation_note ? `<p>${t("Adaptation notes", "适配说明")}：${esc(version.adaptation_note)}</p>` : ""}${version.review_note ? `<p>${t("Review feedback", "审核反馈")}：${esc(version.review_note)}</p>` : ""}<button class="button button-outline" data-version-source="${version.id}" data-work-id="${workId}">${t("View source / download", "查看源码 / 下载")}</button></article>`,
    )
    .join("");
  modalForm(
    t("Version history", "版本历史"),
    esc(data.title),
    `${cards}${data.can_submit ? `<button class="button button-primary" data-version-upload="${workId}">${t("Submit new version", "提交新版本")}</button>` : ""}`,
    "medium",
    "versions",
  );
}
async function openVersionUpload(workId) {
  if (!requireUser()) return;
  const epoch = modalEpoch,
    data = await api(`/works/${workId}/versions`);
  if (epoch !== modalEpoch) return;
  if (!data.can_submit)
    return toast(
      t(
        "Only the creator or an administrator can update this work.",
        "仅投稿者或管理员可以更新作品。",
      ),
    );
  const current =
    data.versions.find((version) => version.id === data.current_version_id) ||
    {};
  openUpload({
    id: workId,
    title: data.title,
    source_url: current.source_url,
    license: current.license,
  });
}
async function openVersionSource(workId, versionId) {
  const epoch = modalEpoch,
    data = await api(`/works/${workId}/versions/${versionId}/source`);
  if (epoch !== modalEpoch) return;
  modalForm(
    t("Archived HTML", "存档源码"),
    esc(data.filename),
    `<pre class="admin-code">${esc(data.html)}</pre><p class="modal-copy">SHA-256：${esc(data.sha256)}</p>${button(t("Download HTML", "下载 HTML"), "download-source", "button-primary")} <button class="button button-outline" data-versions="${workId}">${t("Back to versions", "返回版本历史")}</button>`,
    "medium",
    "source",
  );
  state.sourceData = data;
}
async function openAdmin() {
  const epoch = modalEpoch;
  const queue = await api("/admin/queue");
  if (epoch !== modalEpoch) return;
  queue.works = queue.works.map((work) => ({
    ...work,
    status: work.review_status || work.status,
    review_note: work.version_review_note ?? work.review_note,
  }));
  state.queue = queue;
  const tabs = [
    ["works", t("Creations", "作品审核")],
    ["reports", t("Reports", "举报处理")],
    ["sponsors", t("Sponsorships", "赞助申请")],
  ];
  let items;
  if (state.adminTab === "works")
    items = queue.works
      .map(
        (work) =>
          `<article class="review-item"><h3>${esc(work.title)} <span class="status-badge status-${work.status}">${statusName(work.status)}</span></h3><p>${esc(work.description)}</p><p>${esc(work.credit)}${work.license ? " · " + esc(work.license) : ""}</p>${work.sha256 ? `<p>SHA-256：${esc(work.sha256.slice(0, 16))}… · ${work.variant === "adapted" ? t("Adapted", "适配版") : t("Original", "原版")}${work.source_revision ? " · " + esc(work.source_revision) : ""}</p>` : ""}${work.adaptation_note ? `<p>${esc(work.adaptation_note)}</p>` : ""}${work.source_url ? `<p><a href="${esc(work.source_url)}" target="_blank" rel="noopener noreferrer">${esc(work.source_url)}</a></p>` : ""}<input class="review-note" data-note="${work.id}:${work.review_version_id || ""}" value="${esc(work.review_note)}" placeholder="${t("Review feedback (optional)", "审核反馈（可选）")}" maxlength="500"><div class="review-buttons"><button class="button button-outline" data-preview="${work.id}" data-version-id="${work.review_version_id || ""}">${t("Preview & code", "预览与代码")}</button>${work.status !== "published" ? `<button class="button button-primary" data-review="${work.id}" data-version-id="${work.review_version_id || ""}" data-status="published">${t("Approve", "通过审核")}</button>` : ""}<button class="button button-outline" data-review="${work.id}" data-version-id="${work.review_version_id || ""}" data-status="rejected">${t(work.status === "published" ? "Unpublish" : "Decline", work.status === "published" ? "下架作品" : "拒绝投稿")}</button></div></article>`,
      )
      .join("");
  else if (state.adminTab === "reports")
    items = queue.reports
      .map(
        (report) =>
          `<article class="review-item"><h3>${esc(report.title)}</h3><p>${esc(report.reason)}</p><button class="button button-outline" data-resolve="${report.id}">${t("Mark resolved", "标记已处理")}</button></article>`,
      )
      .join("");
  else
    items = queue.sponsors
      .map(
        (request) =>
          `<article class="review-item"><h3>${esc(request.title)} <span class="status-badge status-${request.status}">${statusName(request.status)}</span></h3><p>${esc(request.email)} · ${(request.amount_cents / 100).toFixed(2)} / 7 ${t("days", "天")}</p><p>${esc(request.note)}</p>${request.status === "pending" ? `<div class="review-buttons"><button class="button button-primary" data-sponsor-status="${request.id}" data-status="contacted">${t("Approve spotlight", "通过并置顶展示")}</button><button class="button button-outline" data-sponsor-status="${request.id}" data-status="declined">${t("Decline", "不接受")}</button></div>` : request.status === "contacted" ? `<div class="review-buttons"><button class="button button-outline" data-sponsor-status="${request.id}" data-status="declined">${t("End spotlight", "结束展示")}</button></div>` : `<div class="review-buttons"><button class="button button-outline" data-sponsor-status="${request.id}" data-status="contacted">${t("Restore spotlight", "恢复展示")}</button></div>`}</article>`,
      )
      .join("");
  modalForm(
    t("The review desk.", "审核工作台。"),
    t(
      "Review submissions, handle reports, and manage spotlight requests.",
      "审核作品、处理举报、管理赞助申请。",
    ),
    `<div class="admin-tabs">${tabs.map(([value, label]) => `<button data-admin-tab="${value}" class="${state.adminTab === value ? "active" : ""}">${label} (${queue[value].length})</button>`).join("")}</div>${items || `<p class="modal-copy">${t("All caught up.", "暂时没有待处理内容。")}</p>`}`,
    "medium",
    "admin",
  );
}

document.addEventListener("click", async (event) => {
  if (event.target.closest(".brand")) {
    if (state.view === "preview") {
      state.view = "discover";
      if (location.pathname === "/preview") {
        try { history.pushState(null, "", "/"); } catch(_) {}
      }
      render();
    }
  }
  const element = event.target.closest("button,[data-view]");
  if (!element) return;
  try {
    if (element.dataset.work) return await openWork(element.dataset.work);
    if (element.dataset.versions)
      return await openVersions(element.dataset.versions);
    if (element.dataset.versionUpload)
      return await openVersionUpload(element.dataset.versionUpload);
    if (element.dataset.versionSource)
      return await openVersionSource(
        element.dataset.workId,
        element.dataset.versionSource,
      );
    if (element.dataset.like || element.dataset.save) {
      element.disabled = true;
      try {
        await interact(
          element.dataset.like || element.dataset.save,
          element.dataset.like ? "like" : "save",
        );
      } finally {
        element.disabled = false;
      }
      return;
    }
    if (element.dataset.spaceTab) {
      state.spaceTab = element.dataset.spaceTab;
      state.search = "";
      render();
      return;
    }
    if (element.dataset.spaceJump) {
      element.closest("details")?.removeAttribute("open");
      if (!requireUser()) return;
      state.view = "saved";
      state.spaceTab = element.dataset.spaceJump;
      state.search = "";
      await refreshSpaceData();
      render();
      $("#collection")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (element.dataset.category) {
      state.category = element.dataset.category;
      render();
      return;
    }
    if (element.dataset.view) {
      if (element.dataset.view === "saved" && state.user) {
        refreshSpaceData().then(() => render()).catch(() => {});
      }
      state.view = element.dataset.view;
      state.category = "all";
      state.search = "";
      render();
      if (state.view === "preview") {
        if (location.pathname !== "/preview") {
          try { history.pushState(null, "", "/preview"); } catch(_) {}
        }
        $("#preview-playground")?.scrollIntoView({ behavior: "smooth" });
      } else {
        if (location.pathname === "/preview") {
          try { history.pushState(null, "", "/"); } catch(_) {}
        }
        $("#collection")?.scrollIntoView({ behavior: "smooth" });
      }
      return;
    }
    if (element.dataset.deleteComment) {
      await api(`/comments/${element.dataset.deleteComment}`, {
        method: "DELETE",
      });
      state.work.comment_count = Math.max(0, state.work.comment_count - 1);
      await renderComments(state.work.id);
      renderWorks();
      return;
    }
    if (element.dataset.adminTab) {
      state.adminTab = element.dataset.adminTab;
      return await openAdmin();
    }
    if (element.dataset.review) {
      const note = document.querySelector(
        `[data-note="${element.dataset.review}:${element.dataset.versionId || ""}"]`,
      ).value;
      await api(`/admin/works/${element.dataset.review}`, {
        method: "POST",
        body: {
          status: element.dataset.status,
          note,
          version_id: element.dataset.versionId,
        },
      });
      await load();
      await openAdmin();
      return;
    }
    if (element.dataset.preview) {
      const workId = element.dataset.preview,
        versionId = element.dataset.versionId;
      modalForm(
        t("Review preview", "审核预览"),
        t(
          "Check the experience and its source before approving.",
          "确认体验和代码后，再决定是否发布。",
        ),
        `<div class="preview-frame" id="review-stage"></div><div class="review-buttons">${button(t("End preview", "结束预览"), "stop-player", "button-outline")}${button(t("Reload preview", "重新预览"), "retry-player", "button-outline")}</div><details><summary class="text-button">${t("View HTML source", "查看 HTML 源码")}</summary><pre class="admin-code" id="review-source">${t("Loading source…", "正在读取源码…")}</pre></details>${button(t("Back to review desk", "返回审核台"), "admin", "button-outline")}`,
        "medium",
        "review",
      );
      const stage = $("#review-stage");
      const player = createPlayer({
        container: stage,
        title: t("Review preview", "审核预览"),
        playOrigin: state.sandboxOrigin,
        frameId: "review-player",
        requestTicket: (signal) =>
          api(`/admin/works/${workId}/play`, {
            method: "POST",
            body: { version_id: versionId },
            signal,
          }),
        onState: (phase) => {
          if (activePlayer !== player) return;
          if (phase !== "playing")
            stage.textContent =
              phase === "loading"
                ? t("Loading…", "正在加载…")
                : phase === "error"
                  ? t(
                      "Could not load. Retry the preview.",
                      "加载未完成，可以重新预览。",
                    )
                  : t("Preview ended.", "预览已结束。");
        },
        onError: (error) => toast(error.message),
      });
      activePlayer = player;
      player.start();
      const epoch = modalEpoch;
      const result = await api(
        `/admin/preview/${workId}${versionId ? "?version=" + encodeURIComponent(versionId) : ""}`,
      );
      if (epoch === modalEpoch && $("#review-source"))
        $("#review-source").textContent = result.html;
      return;
    }
    if (element.dataset.resolve) {
      await api(`/admin/reports/${element.dataset.resolve}`, {
        method: "POST",
        body: { status: "resolved" },
      });
      return await openAdmin();
    }
    if (element.dataset.sponsorStatus) {
      await api(`/admin/sponsors/${element.dataset.sponsorStatus}`, {
        method: "POST",
        body: { status: element.dataset.status },
      });
      await load();
      return await openAdmin();
    }
    switch (element.dataset.action) {
      case "language":
        state.lang = state.lang === "en" ? "zh" : "en";
        localStorage.setItem("onehtml.lang", state.lang);
        render();
        break;
      case "login":
        openAuth();
        break;
      case "register":
        openAuth(true);
        break;
      case "google-login": {
        const epoch = modalEpoch;
        element.disabled = true;
        try {
          const result = await api("/auth/google/start", { method: "POST" });
          if (epoch !== modalEpoch) break;
          const target = new URL(result.authorization_url);
          if (
            target.origin !== "https://accounts.google.com" ||
            target.pathname !== "/o/oauth2/v2/auth"
          )
            throw new Error(
              t("Could not open Google sign-in.", "无法打开 Google 登录。"),
            );
          location.assign(target.href);
        } finally {
          if (element.isConnected) element.disabled = false;
        }
        break;
      }
      case "logout":
        await api("/auth/logout", { method: "POST", body: {} });
        await load();
        closeModal();
        break;
      case "upload":
        openUpload();
        break;
      case "close":
        closeModal();
        break;
      case "about":
        openInfo();
        break;
      case "guidelines":
        openInfo(true);
        break;
      case "contact":
        openContact();
        break;
      case "explore":
        $("#collection").scrollIntoView({ behavior: "smooth" });
        break;
      case "reset":
        state.view = "discover";
        state.category = "all";
        state.search = "";
        render();
        break;
      case "launch":
        await launch();
        break;
      case "stop-player":
        activePlayer?.stop();
        break;
      case "retry-player":
        await activePlayer?.start();
        break;
      case "download-source": {
        if (!state.sourceData) break;
        const url = URL.createObjectURL(
          new Blob([state.sourceData.html], {
            type: "text/html;charset=utf-8",
          }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = /\.html?$/i.test(state.sourceData.filename)
          ? state.sourceData.filename
          : state.sourceData.filename + ".html";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        break;
      }
      case "fullscreen":
        if (!$("#player")) await launch();
        await requestFullscreen($("#player-stage"));
        break;
      case "share":
        await navigator.clipboard.writeText(location.href);
        toast(
          t("Link copied. Share a little joy.", "链接已复制，把快乐分享出去。"),
        );
        break;
      case "sponsor":
        openSponsor();
        break;
      case "submissions":
        await openSubmissions();
        break;
      case "admin":
        await openAdmin();
        break;
      case "report": {
        if (!requireUser()) break;
        const workId = state.work.id;
        modalForm(
          t("Something not quite right?", "发现了什么问题？"),
          esc(title(state.work)),
          `<form id="report-form" data-work="${workId}">${field(t("Describe the issue", "描述问题"), '<textarea name="reason" minlength="5" maxlength="1000" required></textarea>')}<button class="button button-primary form-full" type="submit">${t("Send report", "提交举报")}</button><div class="form-error" role="alert"></div></form>`,
          "",
          "report",
        );
        break;
      }
    }
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "search") {
    state.search = event.target.value;
    renderWorks();
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "html-file")
    readUpload(event.target.files[0]).catch((error) => toast(error.message));
});
document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('[type="submit"]');
  if (!submit) return;
  submit.disabled = true;
  const errorField = form.querySelector(".form-error");
  if (errorField) errorField.textContent = "";
  try {
    switch (form.id) {
      case "auth-form":
        await api(`/auth/${form.dataset.mode}`, { method: "POST", body: data });
        await load();
        closeModal();
        toast(t("You’re right at home.", "登录成功，欢迎。"));
        break;
      case "upload-form":
        await api("/submissions", {
          method: "POST",
          body: data,
        });
        closeModal();
        await refreshSpaceData();
        state.view = "saved";
        state.spaceTab = "submissions";
        state.search = "";
        render();
        $("#collection")?.scrollIntoView({ behavior: "smooth" });
        toast(
          t(
            "Submitted. A human will take a look.",
            "投稿已保存，等待人工审核。",
          ),
        );
        break;
      case "version-form":
        await api(`/works/${form.dataset.work}/versions`, {
          method: "POST",
          body: data,
        });
        closeModal();
        await refreshSpaceData();
        state.view = "saved";
        state.spaceTab = "submissions";
        state.search = "";
        render();
        $("#collection")?.scrollIntoView({ behavior: "smooth" });
        toast(t("New version saved for review.", "新版本已存档，等待审核。"));
        break;
      case "comment-form":
        await api(`/works/${state.work.id}/comments`, {
          method: "POST",
          body: { body: data.body },
        });
        form.reset();
        state.work.comment_count++;
        await renderComments(state.work.id);
        renderWorks();
        break;
      case "sponsor-form":
        await api("/sponsors", {
          method: "POST",
          body: {
            ...data,
            amount_cents: Math.round(Number(data.amount) * 100),
          },
        });
        closeModal();
        await refreshSpaceData();
        state.view = "saved";
        state.spaceTab = "sponsors";
        state.search = "";
        render();
        $("#collection")?.scrollIntoView({ behavior: "smooth" });
        toast(
          t(
            "Application saved. No payment was collected.",
            "申请已保存，未产生任何扣款。",
          ),
        );
        break;
      case "report-form":
        await api(`/works/${form.dataset.work}/report`, {
          method: "POST",
          body: data,
        });
        closeModal();
        toast(
          t("Report saved. Thank you for helping.", "举报已保存，感谢反馈。"),
        );
        break;
    }
  } catch (error) {
    if (errorField) errorField.textContent = error.message;
    else toast(error.message);
  } finally {
    submit.disabled = false;
  }
});
window.addEventListener("pagehide", () => {
  activePlayer?.stop();
  releasePlayer();
});
document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "hidden" &&
    activePlayer?.phase === "loading"
  )
    activePlayer.stop();
});
window.addEventListener("popstate", () => {
  const nextView = location.pathname === "/preview" || location.hash === "#preview" ? "preview" : "discover";
  if (state.view !== nextView) {
    state.view = nextView;
    render();
  }
});
window.addEventListener("hashchange", () => {
  const match = location.hash.match(/^#work\/([a-z0-9-]+)$/);
  if (match) openWork(match[1]).catch((error) => toast(error.message));
  else if ($("#app-modal").open) closeModal();
});
load()
  .then(() => {
    const url = new URL(location.href);
    const error = url.searchParams.get("auth_error");
    const signedIn = url.searchParams.get("auth") === "google";
    if (error || signedIn) {
      url.searchParams.delete("auth_error");
      url.searchParams.delete("auth");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
      if (error) {
        openAuth();
        const messages = {
          cancelled: t(
            "Google sign-in was cancelled. You can try again.",
            "已取消 Google 登录，可以重新尝试。",
          ),
          expired: t(
            "This sign-in attempt expired. Please start again.",
            "本次登录已过期，请重新发起。",
          ),
          unavailable: t(
            "Google sign-in is temporarily unavailable. Please try again later.",
            "Google 登录暂不可用，请稍后重试。",
          ),
          invalid: t(
            "Google sign-in could not be completed. Please try again.",
            "Google 登录未完成，请重新尝试。",
          ),
        };
        $("#auth-form .form-error").textContent =
          messages[error] || messages.invalid;
      } else if (state.user)
        toast(t("Signed in with Google.", "已使用 Google 登录。"));
    }
    if (location.pathname === "/preview" || location.hash === "#preview") {
      state.view = "preview";
      render();
    }
    const pathMatch = location.pathname.match(/^\/work\/([a-z0-9-]+)$/);
    const match = location.hash.match(/^#work\/([a-z0-9-]+)$/);
    if (match) return openWork(match[1]);
    if (pathMatch && $("#work-showcase") && $("#hero")) {
      $("#hero").innerHTML = "";
    }
  })
  .catch((error) => {
    $("#works").innerHTML =
      `<div class="empty-state"><h3>${t("The gallery is taking a moment.", "画廊暂时没有连接上。")}</h3><p>${esc(error.message)}</p><button class="button button-primary" data-action="reload">${t("Try again", "重新连接")}</button></div>`;
  });
document.addEventListener("click", async (event) => {
  const launchBtn = event.target.closest("[data-launch]");
  if (launchBtn) {
    event.preventDefault();
    return await openWork(launchBtn.dataset.launch);
  }
  if (event.target.closest('[data-action="reload"]')) location.reload();
});
