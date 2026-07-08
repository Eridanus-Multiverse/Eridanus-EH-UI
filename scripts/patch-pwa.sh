#!/bin/bash
# Run AFTER `npx expo export --platform web`.
# Copies public/ assets into dist/ and patches index.html with PWA tags.
set -e
DIST="${1:-dist}"
PUB="public"
BUILD_VERSION="${BUILD_VERSION:-$(date +%Y%m%d%H%M%S)}"

# 1. Copy static PWA assets. Remove the old icon directory first so repeated
# runs don't create dist/icons/icons/... nesting.
rm -rf "$DIST/icons"
cp -R "$PUB/icons" "$DIST/icons"
cp "$PUB/manifest.webmanifest" "$DIST/manifest.webmanifest"
cp "$PUB/sw.js" "$DIST/sw.js"

python3 - <<PY
import json
from pathlib import Path
manifest_path = Path("$DIST/manifest.webmanifest")
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["id"] = "/eh-demo/"
manifest["start_url"] = f"/eh-demo/?v=$BUILD_VERSION"
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

# 2. Patch index.html — inject manifest link, iOS meta tags, SW registration
INDEX="$DIST/index.html"

# Inject right before </head>: manifest, theme color, iOS standalone, apple-touch-icon
python3 - <<PY
import re
from pathlib import Path
p = Path("$INDEX")
html = p.read_text(encoding="utf-8")

viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no" />'
if 'name="viewport"' in html:
    html = re.sub(r'<meta\s+name="viewport"\s+content="[^"]*"\s*/?>', viewport, html, count=1)
else:
    html = html.replace("<head>", "<head>\n    " + viewport, 1)

inject_head = """    <link rel="manifest" href="/eh-demo/manifest.webmanifest?v=$BUILD_VERSION" />
    <meta name="theme-color" content="#000000" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black" />
    <meta name="apple-mobile-web-app-title" content="Event Horizon" />
    <link rel="apple-touch-icon" href="/eh-demo/icons/icon-180.png?v=2" />
    <link rel="icon" type="image/png" sizes="192x192" href="/eh-demo/icons/icon-192.png?v=2" />
    <link rel="icon" type="image/png" sizes="512x512" href="/eh-demo/icons/icon-512.png?v=2" />
"""

if "manifest.webmanifest" not in html:
    html = html.replace("</head>", inject_head + "  </head>")
else:
    html = re.sub(r'<meta\s+name="theme-color"\s+content="[^"]*"\s*/?>', '<meta name="theme-color" content="#000000" />', html, count=1)
    html = re.sub(r'<meta\s+name="apple-mobile-web-app-status-bar-style"\s+content="[^"]*"\s*/?>', '<meta name="apple-mobile-web-app-status-bar-style" content="black" />', html, count=1)

global_bg = """    <style id="eridanus-app-shell-bg">
      html, body, #root {
        background: #000;
      }
      body {
        margin: 0;
        overscroll-behavior-y: none;
      }
    </style>
"""

if "eridanus-app-shell-bg" in html:
    html = re.sub(r'\s*<style id="eridanus-app-shell-bg">.*?</style>', "\n" + global_bg.rstrip(), html, count=1, flags=re.S)
else:
    html = html.replace("</head>", global_bg + "  </head>")

# Inject SW registration right before </body>
inject_body = """    <script>
      if ("serviceWorker" in navigator) {
        window.addEventListener("load", function () {
          navigator.serviceWorker
            .register("/eh-demo/sw.js?v=$BUILD_VERSION", { scope: "/eh-demo/" })
            .catch(function (err) { console.warn("SW register failed:", err); });
        });
      }
    </script>
"""

if "serviceWorker.register" not in html:
    html = html.replace("</body>", inject_body + "  </body>")

p.write_text(html, encoding="utf-8")
print("patched", p)
PY

echo "PWA patches applied to $DIST"
