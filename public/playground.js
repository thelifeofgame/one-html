// OneHTML Playground & Live Sandbox Preview Module
export const PLAYGROUND_TEMPLATES = {
  particles: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Particle Constellation</title>
<style>
  html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#0f172a; font-family:-apple-system,BlinkMacSystemFont,sans-serif; }
  canvas { display:block; width:100%; height:100%; }
  #info { position:absolute; bottom:16px; left:16px; color:#94a3b8; font-size:12px; pointer-events:none; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="info">✨ Move mouse or touch to interact with particles</div>
<script>
const c = document.getElementById('c'), ctx = c.getContext('2d');
let w, h, pts = [], mouse = { x: -1000, y: -1000 };
function resize() { w = c.width = window.innerWidth; h = c.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();
const colors = ['#38bdf8','#818cf8','#c084fc','#f472b6'];
for(let i=0; i<70; i++) {
  pts.push({
    x: Math.random()*w, y: Math.random()*h,
    vx: (Math.random()-0.5)*1.5, vy: (Math.random()-0.5)*1.5,
    r: Math.random()*2+1.5,
    color: colors[Math.floor(Math.random()*colors.length)]
  });
}
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('touchmove', e => { if(e.touches[0]){ mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }});
function loop() {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
  ctx.fillRect(0,0,w,h);
  for(let i=0; i<pts.length; i++) {
    let p = pts[i];
    p.x += p.vx; p.y += p.vy;
    if(p.x<0||p.x>w) p.vx*=-1;
    if(p.y<0||p.y>h) p.vy*=-1;
    let dx = mouse.x - p.x, dy = mouse.y - p.y, dist = Math.hypot(dx, dy);
    if(dist < 140) { p.x += dx*0.03; p.y += dy*0.03; }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fillStyle = p.color;
    ctx.fill();
    for(let j=i+1; j<pts.length; j++) {
      let p2 = pts[j], d = Math.hypot(p.x-p2.x, p.y-p2.y);
      if(d < 110) {
        ctx.strokeStyle = 'rgba(148, 163, 184, ' + (1 - d/110)*0.35 + ')';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
  }
  requestAnimationFrame(loop);
}
loop();
</script>
</body>
</html>`,

  clock: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Neon Cyber Clock</title>
<style>
  html, body {
    margin:0; padding:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center;
    background: radial-gradient(circle at center, #1e293b, #090d16);
    color: #f8fafc; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; user-select: none;
  }
</style>
</head>
<body>
<div style="text-align:center; padding:32px 40px; background:rgba(30,41,59,0.7); border:1px solid #334155; border-radius:24px; box-shadow:0 20px 50px rgba(0,0,0,0.5); backdrop-filter:blur(10px);">
  <div style="font-size:12px; letter-spacing:3px; color:#38bdf8; margin-bottom:12px; text-transform:uppercase;">OneHTML System Time</div>
  <div id="clock" style="font-size:46px; font-weight:700; color:#e2e8f0; text-shadow:0 0 20px #38bdf888; margin-bottom:20px;">00:00:00</div>
  <div style="border-top:1px dashed #475569; padding-top:18px;">
    <div style="font-size:11px; color:#94a3b8; margin-bottom:8px; letter-spacing:1px;">STOPWATCH</div>
    <div id="timer" style="font-size:30px; color:#f43f5e; text-shadow:0 0 15px #f43f5e88; margin-bottom:16px;">00:00.00</div>
    <div style="display:flex; gap:10px; justify-content:center;">
      <button id="startBtn" onclick="toggleTimer()" style="background:#f43f5e; color:#fff; border:none; padding:8px 20px; border-radius:8px; font-weight:600; cursor:pointer; font-family:inherit;">START</button>
      <button onclick="resetTimer()" style="background:#334155; color:#cbd5e1; border:none; padding:8px 20px; border-radius:8px; font-weight:600; cursor:pointer; font-family:inherit;">RESET</button>
    </div>
  </div>
</div>
<script>
function updateClock(){
  const d = new Date();
  document.getElementById('clock').textContent = d.toTimeString().split(' ')[0];
}
setInterval(updateClock, 1000); updateClock();
let startTime = 0, elapsed = 0, timerId = null;
function toggleTimer(){
  const btn = document.getElementById('startBtn');
  if(!timerId){
    startTime = Date.now() - elapsed;
    timerId = setInterval(()=>{
      elapsed = Date.now() - startTime;
      const m = Math.floor(elapsed/60000), s = Math.floor((elapsed%60000)/1000), ms = Math.floor((elapsed%1000)/10);
      document.getElementById('timer').textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + '.' + String(ms).padStart(2,'0');
    }, 16);
    btn.textContent = 'PAUSE'; btn.style.background = '#eab308';
  } else {
    clearInterval(timerId); timerId = null;
    btn.textContent = 'START'; btn.style.background = '#f43f5e';
  }
}
function resetTimer(){
  clearInterval(timerId); timerId = null; elapsed = 0;
  document.getElementById('timer').textContent = '00:00.00';
  document.getElementById('startBtn').textContent = 'START';
  document.getElementById('startBtn').style.background = '#f43f5e';
}
</script>
</body>
</html>`,

  physics: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Bouncing Physics Balls</title>
<style>
  html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#18181b; font-family:-apple-system,BlinkMacSystemFont,sans-serif; }
  canvas { display:block; width:100%; height:100%; }
  #tip { position:absolute; top:16px; left:16px; color:#a1a1aa; font-size:13px; pointer-events:none; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="tip">⚽ Click or Tap to spawn bouncing physics balls</div>
<script>
const c = document.getElementById('c'), ctx = c.getContext('2d');
let w, h;
function resize(){ w = c.width = window.innerWidth; h = c.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();
const balls = [];
const colors = ['#f43f5e','#ec4899','#d946ef','#a855f7','#6366f1','#3b82f6','#06b6d4','#10b981','#eab308','#f97316'];
function addBall(x, y){
  balls.push({
    x: x || w/2, y: y || 80,
    vx: (Math.random()-0.5)*12, vy: (Math.random()-0.5)*8,
    r: Math.random()*16 + 10,
    color: colors[Math.floor(Math.random()*colors.length)],
    bounce: 0.78
  });
}
for(let i=0; i<6; i++) addBall(w*0.3 + i*45, 60 + i*18);
window.addEventListener('pointerdown', e => addBall(e.clientX, e.clientY));
const gravity = 0.35, friction = 0.99;
function update(){
  ctx.clearRect(0,0,w,h);
  for(let i=0; i<balls.length; i++){
    const b = balls[i];
    b.vy += gravity;
    b.vx *= friction;
    b.x += b.vx;
    b.y += b.vy;
    if(b.y + b.r > h){ b.y = h - b.r; b.vy *= -b.bounce; }
    if(b.x - b.r < 0){ b.x = b.r; b.vx *= -b.bounce; }
    if(b.x + b.r > w){ b.x = w - b.r; b.vx *= -b.bounce; }
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fillStyle = b.color;
    ctx.shadowBlur = 12; ctx.shadowColor = b.color;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  requestAnimationFrame(update);
}
update();
</script>
</body>
</html>`,

  blank: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>New HTML Document</title>
<style>
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    color: #1c1917;
    font-family: system-ui, sans-serif;
  }
  h1 { margin: 0 0 8px 0; font-size: 28px; }
  p { margin: 0; color: #78716c; }
</style>
</head>
<body>
  <h1>Hello, OneHTML!</h1>
  <p>Start editing on the left to see instant updates.</p>
</body>
</html>`
};

const MAX_HTML_BYTES = 2 * 1024 * 1024;
let debounceTimer = null;
let renderTimeout = null;
let currentMessageListener = null;

export function formatByteSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function initPlaygroundState(state) {
  if (!state.playground) {
    state.playground = {
      code: PLAYGROUND_TEMPLATES.particles,
      autoRun: true,
      device: "desktop",
      status: "ready",
      statusText: "",
      errorMsg: "",
    };
  } else if (!state.playground.code) {
    state.playground.code = PLAYGROUND_TEMPLATES.particles;
  }
}

export function createPlaygroundUI({ state, t, icon, toast, openUpload }) {
  initPlaygroundState(state);

  const container = document.getElementById("preview-playground");
  if (!container) return;

  const currentCode = state.playground.code || "";
  const codeBytes = new TextEncoder().encode(currentCode).length;

  container.innerHTML = `
    <div class="playground-hero">
      <div class="playground-hero-copy">
        <span class="eyebrow"><span class="eyebrow-dot"></span>${t("Interactive Sandbox", "交互式演练沙箱")}</span>
        <h2>${t("HTML Live Playground", "HTML 实时预览工作台")}</h2>
        <p>${t("Paste or drop any single-file HTML code on the left and see it run securely in the right-side sandbox.", "左侧直接粘贴、编写或拖入单文件 HTML 代码，右侧独立沙箱即时秒级渲染。")}</p>
      </div>
      <div class="playground-hero-stats">
        <span class="pill-tag">${icon("visual")}${t("Dual-domain Isolation", "双域沙箱安全隔离")}</span>
        <span class="pill-tag">${icon("game")}${t("Zero-install 60FPS", "零安装极速运行")}</span>
      </div>
    </div>

    <div class="playground-layout">
      <!-- Left Pane: Editor -->
      <section class="playground-pane playground-editor-pane" aria-label="${t("Code Editor", "代码编辑区")}">
        <div class="pane-header">
          <div class="pane-title-group">
            <span class="pane-title">${icon("code")}<span>${t("HTML Source", "HTML 源代码")}</span></span>
            <span class="code-size-badge" id="playground-size-badge" title="${currentCode.length} chars · ${formatByteSize(codeBytes)}">${formatByteSize(codeBytes)}</span>
          </div>
          <div class="pane-actions">
            <select class="playground-select" id="playground-template-select" title="${t("Choose template", "选择模板")}">
              <option value="">${t("Templates…", "示例模板…")}</option>
              <option value="particles">${t("Particles (Canvas)", "粒子流光星空")}</option>
              <option value="clock">${t("Neon Cyber Clock", "极客霓虹时钟")}</option>
              <option value="physics">${t("Physics Balls", "弹性重力球物理")}</option>
              <option value="blank">${t("Blank Canvas", "空白画布")}</option>
            </select>
            <label class="playground-icon-btn" title="${t("Import .html file", "导入 .html 文件")}" style="cursor:pointer;">
              ${icon("share")}<span>${t("Import", "导入")}</span>
              <input type="file" id="pg-file-input" accept=".html,.htm,text/html" hidden>
            </label>
            <button class="playground-icon-btn" id="pg-btn-copy" title="${t("Copy code", "复制代码")}">${icon("copy")}<span>${t("Copy", "复制")}</span></button>
            <button class="playground-icon-btn" id="pg-btn-clear" title="${t("Clear", "清空")}">${icon("close")}<span>${t("Clear", "清空")}</span></button>
          </div>
        </div>

        <div class="editor-wrapper" id="pg-editor-dropzone">
          <textarea
            id="playground-textarea"
            class="playground-textarea"
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            placeholder="${t("<!-- Paste single-file HTML code or drag an .html file here (supports inline <style> and <script>) -->", "<!-- 在此粘贴单文件 HTML 代码或拖入 .html 文件（支持内联 <style> 和 <script>） -->")}"
          >${escapeHtml(currentCode)}</textarea>
        </div>

        <div class="pane-footer">
          <label class="auto-run-toggle">
            <input type="checkbox" id="pg-autorun-check" ${state.playground.autoRun ? "checked" : ""}>
            <span>${t("Live Auto-Run (400ms)", "实时自动渲染 (400ms)")}</span>
          </label>
          <div class="pane-footer-right">
            <span class="pg-char-count" id="pg-char-count">${currentCode.length.toLocaleString()} ${t("chars", "字符")}</span>
            <button class="button button-primary" id="pg-btn-run">
              ${icon("play")}<span>${t("Run", "运行预览")}</span>
              <kbd class="shortcut-kbd">Ctrl+Enter</kbd>
            </button>
          </div>
        </div>
      </section>

      <!-- Right Pane: Live Sandbox -->
      <section class="playground-pane playground-preview-pane" aria-label="${t("Preview Sandbox", "沙箱预览区")}">
        <div class="pane-header">
          <div class="pane-title-group">
            <span class="pane-title">${icon("play")}<span>${t("Live Sandbox", "沙箱实时渲染")}</span></span>
            <div class="status-indicator ready" id="pg-status-indicator">
              <span class="status-dot"></span>
              <span class="status-label" id="pg-status-label">${t("Ready", "已就绪")}</span>
            </div>
          </div>
          <div class="pane-actions">
            <div class="device-switch" role="group" aria-label="${t("Device viewport", "视口尺寸")}">
              <button class="device-btn ${state.playground.device === "desktop" ? "active" : ""}" data-device="desktop" title="${t("Desktop (100%)", "桌面端 (100%)")}">${icon("monitor")}</button>
              <button class="device-btn ${state.playground.device === "tablet" ? "active" : ""}" data-device="tablet" title="${t("Tablet (768px)", "平板端 (768px)")}">${icon("grid")}</button>
              <button class="device-btn ${state.playground.device === "mobile" ? "active" : ""}" data-device="mobile" title="${t("Mobile (375px)", "移动端 (375px)")}">${icon("mobile")}</button>
            </div>
            <button class="playground-icon-btn" id="pg-btn-fullscreen" title="${t("Fullscreen", "全屏预览")}">${icon("fullscreen")}</button>
            <button class="playground-icon-btn" id="pg-btn-download" title="${t("Download HTML", "下载 HTML 文件")}">${icon("download")}</button>
            <button class="playground-icon-btn button-accent" id="pg-btn-submit" title="${t("Submit to OneHTML", "一键投稿至画廊")}">${icon("plus")}<span>${t("Submit", "一键投稿")}</span></button>
          </div>
        </div>

        <div class="stage-viewport device-${state.playground.device}" id="pg-stage-viewport">
          <div class="stage-frame-container" id="pg-frame-container"></div>
        </div>
      </section>
    </div>
  `;

  bindPlaygroundEvents({ state, t, icon, toast, openUpload });
  executeRender({ state, t });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function updateSizeBadge(code) {
  const badge = document.getElementById("playground-size-badge");
  const charCount = document.getElementById("pg-char-count");
  const len = (code || "").length;
  const bytes = new TextEncoder().encode(code || "").length;
  if (badge) {
    badge.textContent = formatByteSize(bytes);
    badge.title = `${len} chars · ${formatByteSize(bytes)}`;
    if (bytes > MAX_HTML_BYTES) {
      badge.classList.add("size-overflow");
    } else {
      badge.classList.remove("size-overflow");
    }
  }
  if (charCount) {
    const unit = document.documentElement.lang?.startsWith("zh") ? "字符" : "chars";
    charCount.textContent = `${len.toLocaleString()} ${unit}`;
  }
}

function setStatus(status, text = "") {
  const indicator = document.getElementById("pg-status-indicator");
  const label = document.getElementById("pg-status-label");
  if (!indicator || !label) return;
  indicator.className = `status-indicator ${status}`;
  label.textContent = text;
}

export function executeRender({ state, t }) {
  const container = document.getElementById("pg-frame-container");
  if (!container) return;

  clearTimeout(renderTimeout);
  renderTimeout = null;

  if (currentMessageListener) {
    window.removeEventListener("message", currentMessageListener);
    currentMessageListener = null;
  }

  const code = (state.playground.code || "").trim();
  if (!code) {
    container.innerHTML = `
      <div class="pg-standby-placeholder">
        <span class="placeholder-icon">✳</span>
        <h3>${t("Waiting for HTML code", "等待输入代码…")}</h3>
        <p>${t("Paste single-file HTML or pick a template above.", "在左侧编辑框粘贴单文件 HTML，或从上方选择示例。")}</p>
      </div>
    `;
    setStatus("ready", t("Empty", "空白"));
    return;
  }

  setStatus("rendering", t("Rendering…", "正在渲染…"));
  container.innerHTML = "";

  const frame = document.createElement("iframe");
  frame.id = "pg-live-frame";
  frame.className = "playground-iframe";
  frame.setAttribute("sandbox", "allow-scripts allow-pointer-lock allow-modals allow-downloads");
  frame.setAttribute("allow", "fullscreen; autoplay");
  frame.referrerPolicy = "no-referrer";
  frame.title = "OneHTML Live Sandbox";

  let hasSent = false;

  if (state.sandboxOrigin) {
    renderTimeout = setTimeout(() => {
      if (!hasSent) {
        setStatus("error", t("Sandbox timeout — click Run to retry", "沙箱加载超时，请点击运行重试"));
      }
    }, 10000);

    currentMessageListener = (event) => {
      // Strictly verify the message originates from this exact iframe instance
      if (event.source !== frame.contentWindow) return;
      // Sandboxed iframes without allow-same-origin report opaque origin "null"
      if (
        event.origin !== "null" &&
        event.origin !== state.sandboxOrigin &&
        event.origin !== location.origin
      ) {
        return;
      }

      if (event.data?.type === "onehtml:preview:ready" && !hasSent) {
        hasSent = true;
        try {
          // Opaque sandbox origin requires "*" targetOrigin; event.source check above secures the channel
          frame.contentWindow.postMessage(
            { type: "onehtml:preview:render", html: code },
            "*",
          );
        } catch (err) {
          clearTimeout(renderTimeout);
          setStatus("error", t("Communication error", "通信异常"));
        }
      } else if (event.data?.type === "onehtml:preview:rendered") {
        clearTimeout(renderTimeout);
        const now = new Date();
        const timeStr = now.toTimeString().split(" ")[0];
        setStatus("ready", `${t("Rendered", "已渲染")} ${timeStr}`);
      } else if (event.data?.type === "onehtml:preview:runtime-error") {
        clearTimeout(renderTimeout);
        setStatus("error", `${t("Runtime Error", "报错")}: ${event.data.message || ""}`);
      } else if (event.data?.type === "onehtml:preview:error") {
        clearTimeout(renderTimeout);
        setStatus("error", event.data.message || t("Render failed", "渲染失败"));
      }
    };

    window.addEventListener("message", currentMessageListener);
    frame.src = `${state.sandboxOrigin}/preview?_t=${Date.now()}`;
  } else {
    frame.addEventListener(
      "load",
      () => {
        const now = new Date();
        const timeStr = now.toTimeString().split(" ")[0];
        setStatus("ready", `${t("Rendered", "已渲染")} ${timeStr}`);
      },
      { once: true },
    );
    frame.srcdoc = code;
  }

  container.appendChild(frame);
}

function bindPlaygroundEvents({ state, t, icon, toast, openUpload }) {
  const textarea = document.getElementById("playground-textarea");
  const dropzone = document.getElementById("pg-editor-dropzone");
  const fileInput = document.getElementById("pg-file-input");
  const templateSelect = document.getElementById("playground-template-select");
  const btnRun = document.getElementById("pg-btn-run");
  const btnCopy = document.getElementById("pg-btn-copy");
  const btnClear = document.getElementById("pg-btn-clear");
  const autorunCheck = document.getElementById("pg-autorun-check");
  const btnFullscreen = document.getElementById("pg-btn-fullscreen");
  const btnDownload = document.getElementById("pg-btn-download");
  const btnSubmit = document.getElementById("pg-btn-submit");
  const stageViewport = document.getElementById("pg-stage-viewport");

  if (!textarea) return;

  async function loadHtmlFile(file) {
    if (!file) return;
    if (file.size > MAX_HTML_BYTES) {
      toast(t("Please keep your file under 2 MB.", "文件不能超过 2 MB。"));
      return;
    }
    if (!/\.html?$/i.test(file.name) && file.type !== "text/html") {
      toast(t("Please choose an HTML file.", "请选择 HTML 文件。"));
      return;
    }
    const text = await file.text();
    state.playground.code = text;
    textarea.value = text;
    updateSizeBadge(text);
    executeRender({ state, t });
    toast(t(`Loaded ${file.name}`, `已导入 ${file.name}`));
  }

  fileInput?.addEventListener("change", (e) => {
    loadHtmlFile(e.target.files?.[0]);
    e.target.value = "";
  });

  dropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  });
  dropzone?.addEventListener("dragleave", () => {
    dropzone.classList.remove("drag-over");
  });
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    loadHtmlFile(e.dataTransfer.files?.[0]);
  });

  // Handle Tab key and Ctrl/Cmd+Enter in textarea
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + "  " + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      triggerInput();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      executeRender({ state, t });
    }
  });

  function triggerInput() {
    state.playground.code = textarea.value;
    updateSizeBadge(state.playground.code);

    if (state.playground.autoRun) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        executeRender({ state, t });
      }, 400);
    }
  }

  textarea.addEventListener("input", triggerInput);

  autorunCheck?.addEventListener("change", (e) => {
    state.playground.autoRun = e.target.checked;
    if (state.playground.autoRun) {
      executeRender({ state, t });
    }
  });

  btnRun?.addEventListener("click", () => {
    executeRender({ state, t });
  });

  templateSelect?.addEventListener("change", (e) => {
    const key = e.target.value;
    if (!key) return;
    if (PLAYGROUND_TEMPLATES[key] !== undefined) {
      state.playground.code = PLAYGROUND_TEMPLATES[key];
      textarea.value = state.playground.code;
      updateSizeBadge(state.playground.code);
      executeRender({ state, t });
      toast(t("Preset sample loaded.", "预设示例已载入。"));
    }
    e.target.value = "";
  });

  btnCopy?.addEventListener("click", async () => {
    const code = textarea.value;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast(t("HTML code copied to clipboard.", "HTML 代码已复制到剪贴板。"));
    } catch {
      toast(t("Copy failed, please select and copy manually.", "复制失败，请手动选择复制。"));
    }
  });

  btnClear?.addEventListener("click", () => {
    state.playground.code = "";
    textarea.value = "";
    updateSizeBadge("");
    executeRender({ state, t });
    toast(t("Editor cleared.", "编辑框已清空。"));
  });

  document.querySelectorAll(".device-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".device-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const dev = btn.dataset.device;
      state.playground.device = dev;
      if (stageViewport) {
        stageViewport.className = `stage-viewport device-${dev}`;
      }
    });
  });

  btnFullscreen?.addEventListener("click", () => {
    const target = stageViewport || document.getElementById("pg-frame-container");
    if (!target) return;
    if (!document.fullscreenElement) {
      target.requestFullscreen?.() || target.webkitRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.();
    }
  });

  btnDownload?.addEventListener("click", () => {
    const code = state.playground.code;
    if (!code.trim()) {
      toast(t("Please input HTML code first.", "请先编写或粘贴代码。"));
      return;
    }
    const blob = new Blob([code], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "onehtml-playground.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(t("Downloading onehtml-playground.html…", "正在下载单文件 HTML…"));
  });

  btnSubmit?.addEventListener("click", () => {
    const code = state.playground.code;
    if (!code.trim()) {
      toast(t("Please write or paste code first.", "请先编写或粘贴 HTML 代码。"));
      return;
    }
    if (typeof openUpload === "function") {
      openUpload(null, code);
    }
  });
}
