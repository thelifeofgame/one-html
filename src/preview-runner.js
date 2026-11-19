export function previewRunnerHtml(siteOrigin = "") {
  const allowedList = Array.from(
    new Set(
      [
        siteOrigin,
        "https://onehtmlapp.com",
        "https://www.onehtmlapp.com",
        "https://onehtml.onehtml.workers.dev",
        "http://127.0.0.1:4391",
        "http://localhost:4391",
        "http://43.161.242.122:4391",
      ].filter(Boolean),
    ),
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>OneHTML Sandbox Runner</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #ffffff;
      color: #252824;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: auto;
    }
    #standby {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 240px;
      color: #777a70;
      text-align: center;
      padding: 24px;
      user-select: none;
    }
    #standby .star {
      font-size: 28px;
      color: #e8613d;
      margin-bottom: 8px;
    }
    #standby h3 {
      margin: 0 0 6px 0;
      font-size: 16px;
      font-weight: 600;
      color: #252824;
    }
    #standby p {
      margin: 0;
      font-size: 13px;
      color: #777a70;
    }
  </style>
</head>
<body>
  <div id="standby">
    <div class="star">✳</div>
    <h3>OneHTML Sandbox Ready</h3>
    <p>Paste code on the left to see live preview</p>
  </div>
  <script>
    (function() {
      var allowedOrigins = ${JSON.stringify(allowedList)};
      var parentOrigin = "*";

      function isAllowedOrigin(origin) {
        if (!allowedOrigins.length || allowedOrigins.indexOf("*") !== -1) return true;
        return allowedOrigins.indexOf(origin) !== -1;
      }

      function reportRuntimeError(event) {
        try {
          window.parent.postMessage({
            type: "onehtml:preview:runtime-error",
            message: event.message || "Script execution error",
            lineno: event.lineno,
            colno: event.colno
          }, parentOrigin);
        } catch (_) {}
      }

      window.addEventListener("error", reportRuntimeError);

      window.addEventListener("message", function(event) {
        if (event.source !== window.parent) return;
        if (!isAllowedOrigin(event.origin)) return;
        if (event.data && event.data.type === "onehtml:preview:render") {
          parentOrigin = event.origin || "*";
          var html = event.data.html || "";
          try {
            document.open();
            document.write(html);
            document.close();
            window.addEventListener("error", reportRuntimeError);
            try {
              window.parent.postMessage({ type: "onehtml:preview:rendered" }, parentOrigin);
            } catch (_) {}
          } catch (err) {
            try {
              window.parent.postMessage({
                type: "onehtml:preview:error",
                message: err.message || "Failed to render document"
              }, parentOrigin);
            } catch (_) {}
          }
        }
      });

      try {
        window.parent.postMessage({ type: "onehtml:preview:ready" }, "*");
      } catch (_) {}
    })();
  </script>
</body>
</html>`;
}
