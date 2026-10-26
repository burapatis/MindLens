#!/usr/bin/env python3
"""Build Phase 3 assets: subset fonts, SVG icons, share tags, OG images.

Reads site.json for the public origin. Re-run after that origin changes.
"""

from __future__ import annotations

import html
import json
import os
import re
import signal
import subprocess
import time
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SITE = json.loads((ROOT / "site.json").read_text(encoding="utf-8"))
ORIGIN = SITE["origin"].rstrip("/")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
FONT_CSS_URL = (
    "https://fonts.googleapis.com/css2?"
    "family=Inter:wght@400..800&family=Noto+Sans+Thai:wght@400..800&display=swap"
)

LUCIDE = {
    "fa-arrow-left": "arrow-left",
    "fa-arrow-right": "arrow-right",
    "fa-arrow-trend-down": "trending-down",
    "fa-arrow-trend-up": "trending-up",
    "fa-arrow-up": "arrow-up",
    "fa-arrow-up-from-bracket": "share",
    "fa-arrows-left-right": "arrow-left-right",
    "fa-ban": "ban",
    "fa-bars": "menu",
    "fa-battery-quarter": "battery-low",
    "fa-bed": "bed",
    "fa-bell": "bell",
    "fa-bolt": "zap",
    "fa-book-open": "book-open",
    "fa-brain": "brain",
    "fa-bullhorn": "megaphone",
    "fa-calendar": "calendar",
    "fa-chart-line": "chart-line",
    "fa-chart-simple": "chart-column",
    "fa-check": "check",
    "fa-chevron-right": "chevron-right",
    "fa-circle-check": "circle-check",
    "fa-circle-exclamation": "circle-alert",
    "fa-circle-info": "info",
    "fa-circle-question": "circle-question-mark",
    "fa-clipboard-check": "clipboard-check",
    "fa-clock": "clock",
    "fa-clock-rotate-left": "history",
    "fa-cloud-rain": "cloud-rain",
    "fa-clover": "clover",
    "fa-comment-dots": "message-circle",
    "fa-comment-slash": "message-square-off",
    "fa-comments": "messages-square",
    "fa-compass": "compass",
    "fa-dice": "dice-5",
    "fa-dove": "bird",
    "fa-dumbbell": "dumbbell",
    "fa-ear-listen": "ear",
    "fa-envelope": "mail",
    "fa-envelope-open-text": "mail-open",
    "fa-equals": "equal",
    "fa-eye": "eye",
    "fa-filter": "filter",
    "fa-fire-flame-curved": "flame",
    "fa-fish-fins": "fish",
    "fa-flag": "flag",
    "fa-flask": "flask-conical",
    "fa-floppy-disk": "save",
    "fa-folder-open": "folder-open",
    "fa-gavel": "gavel",
    "fa-hand": "hand",
    "fa-hand-holding-heart": "hand-heart",
    "fa-heart": "heart",
    "fa-heart-crack": "heart-crack",
    "fa-hourglass-half": "hourglass",
    "fa-house": "house",
    "fa-laptop": "laptop",
    "fa-lightbulb": "lightbulb",
    "fa-list-check": "list-checks",
    "fa-lock": "lock",
    "fa-magnifying-glass-chart": "chart-no-axes-combined",
    "fa-masks-theater": "drama",
    "fa-microchip": "cpu",
    "fa-microscope": "microscope",
    "fa-mobile-screen": "smartphone",
    "fa-moon": "moon",
    "fa-mug-hot": "coffee",
    "fa-paper-plane": "send",
    "fa-people-arrows": "heart-handshake",
    "fa-people-group": "users",
    "fa-play": "play",
    "fa-power-off": "power",
    "fa-rotate-right": "rotate-cw",
    "fa-route": "route",
    "fa-scale-balanced": "scale",
    "fa-seedling": "sprout",
    "fa-shield-halved": "shield",
    "fa-shuffle": "shuffle",
    "fa-sun": "sun",
    "fa-tower-broadcast": "radio-tower",
    "fa-trash-can": "trash-2",
    "fa-triangle-exclamation": "triangle-alert",
    "fa-user": "user",
    "fa-user-pen": "user-pen",
    "fa-user-secret": "hat-glasses",
    "fa-user-tag": "tag",
    "fa-users": "users",
    "fa-volume-xmark": "volume-x",
    "fa-xmark": "x",
}

TOPICS = {
    "doomscrolling": ("#6366f1", "#ec4899"),
    "cancel-culture": ("#f43f5e", "#8b5cf6"),
    "echo-chamber": ("#0ea5e9", "#6366f1"),
    "imposter": ("#8b5cf6", "#ec4899"),
    "hustle-culture": ("#f59e0b", "#ef4444"),
    "empathy": ("#10b981", "#06b6d4"),
    "toxic-positivity": ("#f97316", "#ec4899"),
    "later-life": ("#0d9488", "#d97706"),
    "kreng-jai": ("#a21caf", "#4f46e5"),
    "emerging-adulthood": ("#2563eb", "#14b8a6"),
    "alone-together": ("#6d28d9", "#ea580c"),
    "feed-comparison": ("#be185d", "#0284c7"),
    "unread-share": ("#4d7c0f", "#7c3aed"),
    "online-disinhibition": ("#c2410c", "#155e75"),
    "ai-intimacy": ("#9d174d", "#0f766e"),
    "home-scarcity": ("#7f1d1d", "#d97706"),
}

ASSET_RE = re.compile(
    r"(?:^[ \t]*<!-- Tailwind CSS \(Play CDN\) -->\n)?"
    r"[ \t]*<script src=\"https://cdn\.tailwindcss\.com\"></script>\s*"
    r"<script>\s*tailwind\.config\s*=\s*\{.*?\};\s*</script>\s*"
    r"(?:<!-- Fonts & Icons -->\s*)?"
    r"(?:<link rel=\"preconnect\"[^>]*>\s*)*"
    r"<link href=\"https://fonts\.googleapis\.com/[^\"]+\"[^>]*>\s*"
    r"<link rel=\"stylesheet\" href=\"https://cdnjs\.cloudflare\.com/ajax/libs/font-awesome/[^\"]+\"[^>]*>\s*"
    r"<link rel=\"stylesheet\" href=\"css/style\.css\">",
    re.S | re.M,
)
SHARE_RE = re.compile(r"\n  <!-- share -->.*?<!-- /share -->", re.S)
LD_RE = re.compile(
    r"\n  <script type=\"application/ld\+json\">.*?</script>",
    re.S,
)
FACE_RE = re.compile(r"/\*([^*]+)\*/\s*@font-face\s*\{([^}]+)\}", re.S)


def fetch(url: str) -> bytes:
    result = subprocess.run(
        ["curl", "-fsSL", "-A", UA, url],
        check=True,
        capture_output=True,
        timeout=60,
    )
    return result.stdout


def parse_ranges(raw: str) -> list[tuple[int, int]]:
    spans = []
    for token in raw.split(","):
        token = token.strip()
        if not token.startswith("U+"):
            continue
        body = token[2:]
        if "-" in body:
            start, end = body.split("-", 1)
            spans.append((int(start, 16), int(end, 16)))
        else:
            value = int(body, 16)
            spans.append((value, value))
    return spans


def covers(spans: list[tuple[int, int]], codepoint: int) -> bool:
    return any(start <= codepoint <= end for start, end in spans)


def slug(value: str) -> str:
    value = value.strip().lower().replace(" ", "-")
    return re.sub(r"[^a-z0-9-]+", "", value) or "subset"


def source_codepoints() -> set[int]:
    chunks = []
    for path in ROOT.rglob("*"):
        if any(part in {".git", "node_modules", ".cache", "fonts", "images"} for part in path.parts):
            continue
        if path.suffix.lower() not in {".html", ".js", ".css", ".json"}:
            continue
        if path.name == "tailwind.css":
            continue
        chunks.append(path.read_text(encoding="utf-8"))
    points = {ord(char) for char in "".join(chunks)}
    points.update(range(32, 127))
    return points


def build_fonts() -> list[str]:
    css = fetch(FONT_CSS_URL).decode("utf-8")
    faces = []
    for label, block in FACE_RE.findall(css):
        family = re.search(r"font-family:\s*([^;]+);", block).group(1).strip().strip("'\"")
        weight = re.search(r"font-weight:\s*([^;]+);", block).group(1).strip()
        style = re.search(r"font-style:\s*([^;]+);", block)
        display = re.search(r"font-display:\s*([^;]+);", block)
        src = re.search(r"url\(([^)]+)\)", block).group(1).strip("'\"")
        urange = re.search(r"unicode-range:\s*([^;]+);", block).group(1).strip()
        faces.append({
            "label": label.strip(),
            "family": family,
            "weight": weight,
            "style": style.group(1).strip() if style else "normal",
            "display": display.group(1).strip() if display else "swap",
            "src": src,
            "range": urange,
            "spans": parse_ranges(urange),
            "keep": False,
        })

    points = source_codepoints()
    inter = [face for face in faces if face["family"] == "Inter"]
    noto = [face for face in faces if face["family"] != "Inter"]
    uncovered = []
    for point in points:
        if point < 32:
            continue
        pool = inter if any(covers(face["spans"], point) for face in inter) else noto
        matched = False
        for face in pool:
            if covers(face["spans"], point):
                face["keep"] = True
                matched = True
                break
        if not matched and not any(covers(face["spans"], point) for face in faces):
            uncovered.append(point)

    font_dir = ROOT / "fonts"
    font_dir.mkdir(exist_ok=True)
    for stale in font_dir.glob("*.woff2"):
        stale.unlink()

    rules = []
    preload = []
    kept = [face for face in faces if face["keep"]]
    used_names = set()
    for face in kept:
        family_slug = "inter" if face["family"] == "Inter" else "noto-sans-thai"
        name = f"{family_slug}-{slug(face['label'])}.woff2"
        if name in used_names:
            name = f"{family_slug}-{slug(face['label'])}-{slug(face['weight'])}.woff2"
        used_names.add(name)
        data = fetch(face["src"])
        if not data.startswith(b"wOF2"):
            raise SystemExit(f"{name} is not a woff2 file")
        (font_dir / name).write_bytes(data)
        face["file"] = name
        family = "Inter" if face["family"] == "Inter" else '"Noto Sans Thai"'
        rules.append(
            "@font-face {\n"
            f"  font-family: {family};\n"
            f"  font-style: {face['style']};\n"
            f"  font-weight: {face['weight']};\n"
            "  font-display: swap;\n"
            f"  src: url(\"../fonts/{name}\") format(\"woff2\");\n"
            f"  unicode-range: {face['range']};\n"
            "}\n"
        )
        if covers(face["spans"], ord("A")) or covers(face["spans"], ord("ก")):
            preload.append(f"fonts/{name}")

    (ROOT / "css" / "fonts.css").write_text(
        "/* Self-hosted variable fonts. Only the unicode ranges used on the site. */\n\n"
        + "\n".join(rules),
        encoding="utf-8",
    )
    (font_dir / "manifest.json").write_text(
        json.dumps({"preload": preload, "uncovered": uncovered[:40]}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"fonts: {len(kept)} files, preload {preload}")
    if uncovered:
        sample = "".join(chr(point) for point in uncovered[:20])
        print(f"glyphs left to the system font: {sample!r}")
    return preload


def normalize_svg(raw: str, extra: str = "") -> str:
    raw = re.sub(r"<!--.*?-->", "", raw, flags=re.S)
    raw = re.sub(r'\sclass="[^"]*"', "", raw)
    raw = raw.replace('stroke="currentColor"', 'stroke="#000"')
    raw = raw.replace('fill="currentColor"', 'fill="#000"')
    if extra:
        raw = raw.replace("</svg>", extra + "</svg>")
    raw = re.sub(r">\s+<", "><", raw)
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw


def icon_svg(name: str) -> str:
    icon_dir = ROOT / "node_modules" / "lucide-static" / "icons"
    if name == "fa-flag-checkered":
        return (
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" "
            "stroke=\"#000\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">"
            "<path d=\"M4 21V4\"/><path d=\"M4 4h11l-1.6 3.2L15 10.5H4\"/>"
            "<path d=\"M8 4v6.5\"/><path d=\"M4 7.2h11\"/></svg>"
        )
    if name == "fa-scale-unbalanced":
        raw = (icon_dir / "scale.svg").read_text(encoding="utf-8")
        raw = raw.replace("<path ", '<g transform="rotate(-14 12 12)"><path ', 1)
        return normalize_svg(raw, "") .replace("</svg>", "</g></svg>")
    if name == "fa-users-slash":
        raw = (icon_dir / "users.svg").read_text(encoding="utf-8")
        return normalize_svg(raw, '<path d="M4 20 20 4"/>')
    lucide = LUCIDE[name]
    return normalize_svg((icon_dir / f"{lucide}.svg").read_text(encoding="utf-8"))


def used_icons() -> list[str]:
    found = set()
    pattern = re.compile(r"\bfa-(?!solid\b|regular\b|brands\b)[a-z0-9-]+")
    for path in list(ROOT.glob("*.html")) + list((ROOT / "js").glob("*.js")) + list((ROOT / "css").glob("*.css")):
        if path.name in {"icons.css", "tailwind.css", "fonts.css"}:
            continue
        found.update(pattern.findall(path.read_text(encoding="utf-8")))
    return sorted(found)


def build_icons() -> None:
    names = used_icons()
    missing = [name for name in names if name not in LUCIDE and name not in {"fa-flag-checkered", "fa-scale-unbalanced", "fa-users-slash"}]
    if missing:
        raise SystemExit("no SVG for " + ", ".join(missing))
    rules = []
    for name in names:
        uri = "url(\"data:image/svg+xml," + quote(icon_svg(name), safe="") + "\")"
        rules.append(f":where(.{name}){{--ml-icon:{uri}}}")
    css = """/*!
 * MindLens icons.
 * Most glyphs are adapted from Lucide (https://lucide.dev).
 * ISC License
 * Copyright (c) Lucide Contributors
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 */
:where(i.fa-solid,i.fa-regular){display:inline-block;width:1em;height:1em;aspect-ratio:1;flex:none;background-color:currentColor;-webkit-mask:var(--ml-icon) center/contain no-repeat;mask:var(--ml-icon) center/contain no-repeat;vertical-align:-0.125em}
""" + "\n".join(rules) + "\n"
    (ROOT / "css" / "icons.css").write_text(css, encoding="utf-8")
    print(f"icons: {len(names)} glyphs, {len(css)} bytes")


def page_kind(name: str) -> str:
    if name.startswith("article-"):
        return "article"
    if name.startswith("quiz-"):
        return "quiz"
    return "home"


def page_url(name: str) -> str:
    return ORIGIN + "/" if name == "index.html" else f"{ORIGIN}/{name}"


def image_file(name: str) -> str:
    stem = "home" if name == "index.html" else name.replace(".html", "")
    return stem + ".jpg"


def topic_colors(name: str) -> tuple[str, str]:
    stem = name.replace("article-", "").replace("quiz-", "").replace(".html", "")
    return TOPICS.get(stem, ("#6366f1", "#8b5cf6"))


def attr(text: str, pattern: str) -> str:
    match = re.search(pattern, text)
    if not match:
        raise SystemExit(f"missing {pattern}")
    return match.group(1)


def asset_block(preload: list[str]) -> str:
    links = "\n".join(
        f'  <link rel="preload" href="{href}" as="font" type="font/woff2" crossorigin>'
        for href in preload
    )
    return (
        "  <!-- assets -->\n"
        f"{links}\n"
        '  <link rel="stylesheet" href="css/fonts.css">\n'
        '  <link rel="stylesheet" href="css/icons.css">\n'
        '  <link rel="stylesheet" href="css/style.css">\n'
        '  <link rel="stylesheet" href="css/tailwind.css">\n'
        "  <!-- /assets -->"
    )


def share_block(page: str, text: str) -> str:
    kind = page_kind(page)
    canonical = page_url(page)
    image = f"{ORIGIN}/images/og/{image_file(page)}"
    title = html.escape(html.unescape(attr(text, r'<meta property="og:title" content="([^"]*)"')), quote=True)
    description = html.escape(html.unescape(attr(text, r'<meta property="og:description" content="([^"]*)"')), quote=True)
    lines = [
        "  <!-- share -->",
        f'  <link rel="canonical" href="{canonical}">',
        f'  <meta property="og:url" content="{canonical}">',
        '  <meta property="og:site_name" content="MindLens">',
        '  <meta property="og:locale" content="th_TH">',
        f'  <meta property="og:image" content="{image}">',
        '  <meta property="og:image:type" content="image/jpeg">',
        '  <meta property="og:image:width" content="1200">',
        '  <meta property="og:image:height" content="630">',
        f'  <meta property="og:image:alt" content="{title}">',
        '  <meta name="twitter:card" content="summary_large_image">',
        f'  <meta name="twitter:title" content="{title}">',
        f'  <meta name="twitter:description" content="{description}">',
        f'  <meta name="twitter:image" content="{image}">',
        f'  <meta name="twitter:image:alt" content="{title}">',
    ]
    if kind == "article":
        published = attr(text, r'<time datetime="([^"]+)"')
        lines.append(f'  <meta property="article:published_time" content="{published}">')
        lines.append('  <meta property="article:author" content="บูรพาทิศ พลอยสุวรรณ์">')
    lines.append("  <!-- /share -->")
    return "\n".join(lines)


def json_ld(page: str, text: str) -> str:
    kind = page_kind(page)
    author = SITE["author"]
    creator_id = ORIGIN + "/#creator"
    canonical = page_url(page)
    image = f"{ORIGIN}/images/og/{image_file(page)}"
    description = html.unescape(attr(text, r'<meta name="description" content="([^"]*)"'))
    headline = html.unescape(attr(text, r'<meta property="og:title" content="([^"]*)"'))
    person = {
        "@type": "Person",
        "@id": creator_id,
        "name": author["name"],
        "alternateName": author["alternateName"],
        "email": author["email"],
        "jobTitle": author["jobTitle"],
    }
    graph: list[dict] = [person]
    if kind == "home":
        graph.append({
            "@type": "WebSite",
            "@id": ORIGIN + "/#website",
            "name": SITE["name"],
            "url": ORIGIN + "/",
            "description": description,
            "inLanguage": "th",
            "image": image,
            "author": {"@id": creator_id},
        })
    elif kind == "article":
        published = attr(text, r'<time datetime="([^"]+)"')
        graph.append({
            "@type": "Article",
            "headline": headline,
            "description": description,
            "image": image,
            "datePublished": published,
            "dateModified": published,
            "inLanguage": "th",
            "mainEntityOfPage": canonical,
            "url": canonical,
            "author": {"@id": creator_id},
            "publisher": {
                "@type": "Organization",
                "name": "MindLens",
                "url": ORIGIN + "/",
                "logo": {"@type": "ImageObject", "url": f"{ORIGIN}/images/og/home.jpg"},
            },
        })
    else:
        graph.append({
            "@type": "Quiz",
            "name": headline,
            "description": description,
            "url": canonical,
            "image": image,
            "inLanguage": "th",
            "isAccessibleForFree": True,
            "learningResourceType": "self-assessment",
            "author": {"@id": creator_id},
        })
    payload = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, indent=2)
    payload = payload.replace("<", "\\u003c")
    return f'\n  <script type="application/ld+json">\n{payload}\n  </script>'


def stamp_pages(preload: list[str]) -> None:
    assets = asset_block(preload)
    pages = sorted(ROOT.glob("*.html"), key=lambda path: (path.name != "index.html", path.name))
    for path in pages:
        text = path.read_text(encoding="utf-8").replace("เว็บท่ารวบรวม", "เว็บที่รวบรวม")
        text = SHARE_RE.sub("", text)
        text = LD_RE.sub("", text)
        if "<!-- assets -->" in text:
            text = re.sub(r"  <!-- assets -->.*?<!-- /assets -->", assets, text, count=1, flags=re.S)
        else:
            updated, count = ASSET_RE.subn(assets, text, count=1)
            if count != 1:
                raise SystemExit(f"could not replace assets in {path.name}")
            text = updated
        text = re.sub(
            r'(<meta property="og:type" content="[^"]+">)',
            lambda match: match.group(1) + "\n" + share_block(path.name, text),
            text,
            count=1,
        )
        text = text.replace("</head>", json_ld(path.name, text) + "\n</head>", 1)
        path.write_text(text, encoding="utf-8")
        print(f"stamped {path.name}")


def write_crawl_files() -> None:
    pages = ["index.html", "dashboard.html", "privacy.html"] + [
        f"{kind}-{slug}.html"
        for slug in TOPICS
        for kind in ("article", "quiz")
    ]
    urls = []
    for name in pages:
        loc = page_url(name)
        lastmod = "2026-10-24"
        urls.append(f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>{lastmod}</lastmod>\n  </url>")
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>\n"
    )
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    (ROOT / "robots.txt").write_text(
        "User-agent: *\nAllow: /\n\nSitemap: " + ORIGIN + "/sitemap.xml\n",
        encoding="utf-8",
    )


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def card_font_css() -> str:
    import base64
    css = (ROOT / "css" / "fonts.css").read_text(encoding="utf-8")

    def embed(match: re.Match[str]) -> str:
        encoded = base64.b64encode((ROOT / "fonts" / match.group(1)).read_bytes()).decode("ascii")
        return f'url("data:font/woff2;base64,{encoded}")'

    css = re.sub(r'url\("\.\./fonts/([^"]+)"\)', embed, css)
    return css.replace("font-display: swap", "font-display: block")


def render_cards(preload: list[str]) -> None:
    out_dir = ROOT / "images" / "og"
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.iterdir():
        if stale.suffix in {".png", ".jpg", ".html"}:
            stale.unlink()
    font_css = card_font_css()
    profile = ROOT / ".cache" / "chrome-og"
    profile.mkdir(parents=True, exist_ok=True)
    pages = sorted(ROOT.glob("*.html"), key=lambda path: (path.name != "index.html", path.name))
    for path in pages:
        text = path.read_text(encoding="utf-8")
        title = html.unescape(attr(text, r'<meta property="og:title" content="([^"]*)"'))
        description = html.unescape(attr(text, r'<meta property="og:description" content="([^"]*)"'))
        kind = page_kind(path.name)
        kicker = {"home": "Psychology & Human Behavior", "article": "บทความ", "quiz": "แบบทดสอบ · 5 ข้อ"}[kind]
        c1, c2 = topic_colors(path.name)
        r1, g1, b1 = hex_rgb(c1)
        r2, g2, b2 = hex_rgb(c2)
        size = 46 if len(title) > 90 else 54 if len(title) > 48 else 64
        card = f"""<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8"><style>
{font_css}
html,body{{margin:0;width:1200px;height:630px;overflow:hidden;background:#07080d;color:#fff;
font-family:Inter,"Noto Sans Thai",sans-serif}}
body{{box-sizing:border-box;padding:68px 76px 56px;display:flex;flex-direction:column;
background:
 radial-gradient(circle at 0% 0%, rgba({r1},{g1},{b1},.55), transparent 46%),
 radial-gradient(circle at 100% 110%, rgba({r2},{g2},{b2},.45), transparent 42%),
 #07080d}}
.brand{{display:flex;align-items:center;gap:16px;font-weight:700;font-size:28px;letter-spacing:-.03em}}
.mark{{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;
background:linear-gradient(135deg,{c1},{c2});font-weight:800}}
.lens{{color:#a5b4fc}}
.kicker{{margin-top:54px;color:{c1};font-weight:700;letter-spacing:.08em;font-size:20px}}
h1{{margin:18px 0 0;font-size:{size}px;line-height:1.28;font-weight:800;letter-spacing:-.03em;max-width:1000px}}
p{{margin:22px 0 0;color:#a8b3c7;font-size:26px;line-height:1.5;max-width:980px;
display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}}
footer{{margin-top:auto;color:#c5cedd;font-size:22px;font-weight:600}}
</style></head><body>
<div class="brand"><span class="mark">M</span><span>Mind<span class="lens">Lens</span></span></div>
<div class="kicker">{html.escape(kicker)}</div>
<h1>{html.escape(title)}</h1>
<p>{html.escape(description)}</p>
<footer>บูรพาทิศ พลอยสุวรรณ์</footer>
</body></html>"""
        card_path = out_dir / "_preview.html"
        card_path.write_text(card, encoding="utf-8")
        png = out_dir / "_shot.png"
        if png.exists():
            png.unlink()
        for lock in profile.glob("Singleton*"):
            lock.unlink()
        proc = subprocess.Popen(
            [
                CHROME,
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--disable-extensions",
                "--disable-background-networking",
                "--force-device-scale-factor=1",
                "--window-size=1200,630",
                f"--screenshot={png}",
                "--virtual-time-budget=4000",
                f"--user-data-dir={profile}",
                "--no-first-run",
                "--no-default-browser-check",
                "--allow-file-access-from-files",
                card_path.as_uri(),
            ],
            start_new_session=True,
        )
        deadline = time.time() + 20
        while time.time() < deadline:
            if png.exists() and png.stat().st_size > 5000:
                time.sleep(0.3)
                break
            if proc.poll() is not None:
                break
            time.sleep(0.15)
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait(timeout=5)
        if not png.exists() or png.stat().st_size < 5000:
            raise SystemExit(f"screenshot failed for {path.name}")
        from PIL import Image
        jpg = out_dir / image_file(path.name)
        with Image.open(png) as shot:
            if shot.size != (1200, 630):
                raise SystemExit(f"{path.name} screenshot is {shot.size}")
            shot.convert("RGB").save(jpg, "JPEG", quality=86, optimize=True)
        png.unlink()
        print(f"og {jpg.name} {jpg.stat().st_size}")
    preview = out_dir / "_preview.html"
    if preview.exists():
        preview.unlink()


def main() -> None:
    preload = build_fonts()
    build_icons()
    render_cards(preload)
    stamp_pages(preload)
    write_crawl_files()


if __name__ == "__main__":
    main()
