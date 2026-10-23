#!/usr/bin/env python3
"""
⚽ Commit Futebol Clube
======================

Gera um SVG animado de uma partida de futebol jogada em cima do gráfico de
contribuições do GitHub: o craque conduz a bola por todos os dias em que houve
commit (cada quadrado vira dourado), dribla os BUGS FC, chuta e... GOOOOL!

Uso:
    python scripts/futebol.py --user RFontes13RF --name "Ryan Fontes" --out dist/futebol.svg

Fonte dos dados, em ordem de preferência:
    1. GraphQL API do GitHub (se a variável GITHUB_TOKEN existir)
    2. Página pública de contribuições (github.com/users/<user>/contributions)
    3. Dados de demonstração (--demo, ou se tudo acima falhar)

Sem dependências externas — só a biblioteca padrão.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import random
import re
import sys
import urllib.request
from dataclasses import dataclass
from html import escape

# ─── Canvas & linha do tempo ───────────────────────────────────────────────

W, H = 900, 350
D = 20.0  # duração do loop completo, em segundos

PX0, PX1, PY0, PY1 = 50, 850, 102, 296  # gramado
MIDY = (PY0 + PY1) / 2
CS, STEP = 11, 14  # tamanho do quadrado / passo da grade
COLS, ROWS = 53, 7
GW = COLS * STEP - (STEP - CS)
GH = ROWS * STEP - (STEP - CS)
GX = (W - GW) / 2
GY = MIDY - GH / 2

KICK = 0.7         # apito inicial
PASS_END = 1.6     # lançamento chega no craque
DRIB_END = 13.0    # fim do drible pela grade
PRESHOT = 13.7     # posição de chute
GOAL = 14.1        # bola na rede
GOL_OUT = 17.4     # letreiro "GOL" some
FADE0, FADE1 = 18.4, 19.2           # bola/jogador somem
REVERT0, REVERT1 = 18.5, 19.3       # quadrados voltam à cor original
LAG = 0.15         # atraso do jogador em relação à bola

FONT = "'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif"
HEAVY = "'Arial Black', 'Segoe UI Black', Impact, sans-serif"

YELLOW, GREEN, BLUE = "#FFDF00", "#009C3B", "#002776"
CELL_COLORS = ["rgba(0,0,0,0.22)", "#1f8a4c", "#2fbf62", "#5ee08a", "#b8f7c9"]
LEVELS = {"NONE": 0, "FIRST_QUARTILE": 1, "SECOND_QUARTILE": 2,
          "THIRD_QUARTILE": 3, "FOURTH_QUARTILE": 4}
MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
          "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


@dataclass
class Day:
    date: dt.date
    count: int
    level: int
    week: int = 0
    weekday: int = 0


# ─── Dados ─────────────────────────────────────────────────────────────────

def _request(url: str, data: bytes | None = None, headers: dict | None = None) -> bytes:
    req = urllib.request.Request(url, data=data, headers={
        "User-Agent": "commit-futebol-clube", **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def fetch_graphql(user: str, token: str) -> list[Day]:
    query = """query($login: String!) { user(login: $login) { contributionsCollection {
      contributionCalendar { weeks { contributionDays {
        date contributionCount contributionLevel weekday } } } } } }"""
    body = json.dumps({"query": query, "variables": {"login": user}}).encode()
    payload = json.loads(_request("https://api.github.com/graphql", body, {
        "Authorization": f"bearer {token}", "Content-Type": "application/json"}))
    weeks = payload["data"]["user"]["contributionsCollection"]["contributionCalendar"]["weeks"]
    return [Day(dt.date.fromisoformat(d["date"]), d["contributionCount"],
                LEVELS[d["contributionLevel"]], wi, d["weekday"])
            for wi, w in enumerate(weeks) for d in w["contributionDays"]]


def fetch_public(user: str) -> list[Day]:
    html = _request(f"https://github.com/users/{user}/contributions").decode("utf-8", "replace")
    tips = dict(re.findall(r'<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)</tool-tip>', html))
    days = []
    for tag in re.findall(r"<td\b[^>]*>", html):
        attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', tag))
        if "data-date" not in attrs:
            continue
        level = int(attrs.get("data-level", 0))
        m = re.match(r"\s*(\d+)", tips.get(attrs.get("id", ""), ""))
        count = int(m.group(1)) if m else (0 if level == 0 else level)
        days.append(Day(dt.date.fromisoformat(attrs["data-date"]), count, level))
    if not days:
        raise ValueError("nenhum dia encontrado na página de contribuições")
    return _assign_weeks(days)


def demo_days(seed: int) -> list[Day]:
    rng = random.Random(seed)
    today = dt.date.today()
    days = []
    for i in range(370, -1, -1):
        date = today - dt.timedelta(days=i)
        busy = 0.55 if date.weekday() < 5 else 0.25
        count = rng.choice([1, 1, 2, 3, 4, 6, 9, 14]) if rng.random() < busy else 0
        level = 0 if count == 0 else 1 if count < 3 else 2 if count < 5 else 3 if count < 9 else 4
        days.append(Day(date, count, level))
    return _assign_weeks(days)


def _assign_weeks(days: list[Day]) -> list[Day]:
    first = min(d.date for d in days)
    sunday0 = first - dt.timedelta(days=(first.weekday() + 1) % 7)
    for d in days:
        d.weekday = (d.date.weekday() + 1) % 7
        d.week = (d.date - sunday0).days // 7
    return days


def load_days(user: str, demo: bool, seed: int) -> tuple[list[Day], str]:
    if not demo:
        token = os.environ.get("GITHUB_TOKEN")
        if token:
            try:
                return fetch_graphql(user, token), "graphql"
            except Exception as exc:  # noqa: BLE001 — cai para a próxima fonte
                print(f"[aviso] GraphQL falhou: {exc}", file=sys.stderr)
        try:
            return fetch_public(user), "public"
        except Exception as exc:  # noqa: BLE001
            print(f"[aviso] página pública falhou: {exc}", file=sys.stderr)
    return demo_days(seed), "demo"


def last_53_weeks(days: list[Day]) -> list[Day]:
    last = max(d.week for d in days)
    kept = [d for d in days if d.week > last - COLS]
    for d in kept:
        d.week -= last - COLS + 1
    return kept


def stats(days: list[Day]) -> dict:
    days = sorted(days, key=lambda d: d.date)
    longest = run = 0
    for d in days:
        run = run + 1 if d.count else 0
        longest = max(longest, run)
    current, i = 0, len(days) - 1
    if i >= 0 and days[i].count == 0:  # hoje ainda não conta como quebra
        i -= 1
    while i >= 0 and days[i].count:
        current += 1
        i -= 1
    best = max(days, key=lambda d: d.count)
    return {"total": sum(d.count for d in days), "longest": longest, "current": current,
            "best": best.count, "best_date": best.date,
            "active": sum(1 for d in days if d.count)}


# ─── Helpers de SVG / CSS ──────────────────────────────────────────────────

def pct(t: float) -> str:
    return f"{max(0.0, min(100.0, t / D * 100)):.3f}".rstrip("0").rstrip(".") + "%"


def keyframes(name: str, frames: list[tuple[float, str]]) -> str:
    body = "".join(f"{pct(t)}{{{css}}}" for t, css in frames)
    return f"@keyframes {name}{{{body}}}"


def tr(x: float, y: float, extra: str = "") -> str:
    return f"transform:translate({x:.1f}px,{y:.1f}px){(' ' + extra) if extra else ''}"


def pixels(rows: list[str], pal: dict, px: int = 2) -> str:
    out = []
    for r, row in enumerate(rows):
        c = 0
        while c < len(row):
            ch = row[c]
            if ch == ".":
                c += 1
                continue
            e = c
            while e < len(row) and row[e] == ch:
                e += 1
            out.append(f'<rect x="{c * px}" y="{r * px}" width="{(e - c) * px}" '
                       f'height="{px}" fill="{pal[ch]}"/>')
            c = e
    return "".join(out)


def pos_at(t: float, frames: list[tuple[float, tuple[float, float]]]) -> tuple[float, float]:
    if t <= frames[0][0]:
        return frames[0][1]
    for (t0, p0), (t1, p1) in zip(frames, frames[1:]):
        if t0 <= t <= t1:
            k = 0 if t1 == t0 else (t - t0) / (t1 - t0)
            return p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k
    return frames[-1][1]


def cell_center(week: int, weekday: int) -> tuple[float, float]:
    return GX + week * STEP + CS / 2, GY + weekday * STEP + CS / 2


# ─── Sprites (pixel art) ───────────────────────────────────────────────────

PLAYER_BODY = [
    "...hhhh...",
    "..hhhhhh..",
    "..hhssss..",
    "..hsssss..",
    "...ssss...",
    "..gyyyyg..",
    ".syyyyyys.",
    ".syyggyys.",
    "..yyyyyy..",
    "..bbbbbb..",
    "..bbbbbb..",
]
KEEPER_BODY = [r.replace(".s", ".G").replace("s.", "G.") if i in (6, 7) else r
               for i, r in enumerate(PLAYER_BODY)]
LEGS_A = [".ss....ss.", ".ww....ww.", ".kk....kkk"]
LEGS_B = ["...ssss...", "...wwww...", "...kkkkk.."]
PLAYER_PAL = {"h": "#2b1a10", "s": "#c98a5a", "y": YELLOW, "g": GREEN,
              "b": "#1f4fbf", "w": "#f5f5f5", "k": "#111111"}
KEEPER_PAL = {**PLAYER_PAL, "y": "#ff6b35", "g": "#1b1b1b", "b": "#1b1b1b",
              "G": "#f5f5f5", "h": "#111111"}
BUG = [
    ".k...k.",
    "..hhh..",
    "lrrrrrl",
    ".rrkrr.",
    "lrrkrrl",
    ".rrkrr.",
    "l.rrr.l",
]
BUG_PAL = {"k": "#222", "h": "#222", "l": "#222", "r": "#e63946"}


def runner(body: list[str], pal: dict) -> str:
    """Sprite com duas poses de perna que se alternam (corrida)."""
    return (f'<g class="fa">{pixels(body + LEGS_A, pal)}</g>'
            f'<g class="fb">{pixels(body + LEGS_B, pal)}</g>')


# ─── Montagem do SVG ───────────────────────────────────────────────────────

def build_svg(days: list[Day], user: str, name: str, seed: int) -> str:
    rng = random.Random(seed)
    st = stats(days)
    css: list[str] = []
    svg: list[str] = []
    anim = lambda cls, kf, extra="": css.append(  # noqa: E731
        f".{cls}{{animation:{kf} {D}s linear infinite both;{extra}}}")
    box = "transform-box:fill-box;transform-origin:center;"

    # ── Percurso da bola: zigue-zague coluna a coluna pelos dias com commit ──
    by_week: dict[int, list[Day]] = {}
    for d in days:
        if d.level > 0:
            by_week.setdefault(d.week, []).append(d)
    route: list[tuple[tuple[float, float], Day | None]] = []
    for w in sorted(by_week):
        col = sorted(by_week[w], key=lambda d: d.weekday, reverse=w % 2 == 1)
        route += [(cell_center(d.week, d.weekday), d) for d in col]
    if len(route) < 6:  # perfil quase vazio: o craque desfila mesmo assim
        route += [((GX + c * STEP + CS / 2, MIDY + (14 if (c // 6) % 2 else -14)), None)
                  for c in range(4, COLS, 6)]
        route.sort(key=lambda r: r[0][0])

    C = (W / 2, MIDY)
    S = (GX - 12, MIDY)
    P = (GX + GW - 30, MIDY - 8)
    G = (PX1 + 11, MIDY + 16)

    pts = [S] + [p for p, _ in route]
    weights = [math.dist(a, b) + 8 for a, b in zip(pts, pts[1:])]
    total_w = sum(weights) or 1
    t, visit_times = PASS_END, []
    for wgt in weights:
        t += (DRIB_END - PASS_END) * wgt / total_w
        visit_times.append(t)

    ball = [(0.0, C), (KICK, C), (PASS_END, S)]
    ball += [(vt, p) for vt, (p, _) in zip(visit_times, route)]
    ball += [(PRESHOT, P), (GOAL, G), (D, G)]

    # ── Fundo, defs ──
    svg.append(f"""<defs>
<linearGradient id="hdr" x1="0" x2="1"><stop offset="0" stop-color="#14203a"/><stop offset=".5" stop-color="#0f172a"/><stop offset="1" stop-color="#2a1420"/></linearGradient>
<radialGradient id="spot" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="band" x1="0" x2="1"><stop offset="0" stop-color="#001a4d" stop-opacity="0"/><stop offset=".15" stop-color="#001a4d" stop-opacity=".82"/><stop offset=".85" stop-color="#001a4d" stop-opacity=".82"/><stop offset="1" stop-color="#001a4d" stop-opacity="0"/></linearGradient>
<pattern id="net" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0L4 4M4 0L0 4" stroke="#fff" stroke-opacity=".45" stroke-width=".6"/></pattern>
<clipPath id="pitch"><rect x="{PX0}" y="{PY0}" width="{PX1 - PX0}" height="{PY1 - PY0}" rx="4"/></clipPath>
<clipPath id="tick"><rect x="122" y="306" width="764" height="34"/></clipPath>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="{W}" height="{H}" rx="14" fill="#0b1220"/>
<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="14" fill="none" stroke="#1f2a3a"/>""")

    # ── Placar ──
    team = escape(f"{user.upper()} FC")
    svg.append(f"""<rect x="12" y="10" width="{W - 24}" height="44" rx="10" fill="url(#hdr)" stroke="#24314a"/>
<circle cx="38" cy="32" r="15" fill="{GREEN}" stroke="{YELLOW}" stroke-width="2"/>
<text x="38" y="36.5" text-anchor="middle" font-family="{HEAVY}" font-size="11" fill="{YELLOW}">{escape(user[:2].upper())}</text>
<text x="62" y="37" font-family="{FONT}" font-weight="800" font-size="15" letter-spacing="1" fill="#fff">{team}</text>
<rect x="326" y="24" width="60" height="16" rx="8" fill="#1b2538" stroke="#33415c"/>
<text x="356" y="35.5" text-anchor="middle" font-family="{FONT}" font-weight="700" font-size="9" fill="#9fb0cc">2º TEMPO</text>
<rect x="396" y="16" width="108" height="32" rx="6" fill="#05080f" stroke="{YELLOW}" stroke-opacity=".7"/>
<g font-family="{HEAVY}" font-size="21" text-anchor="middle">
<text class="s0" x="426" y="40" fill="{YELLOW}">0</text><text class="s1" x="426" y="40" fill="{YELLOW}">1</text>
<text x="450" y="39" fill="#556">:</text><text x="474" y="40" fill="#fff">0</text></g>
<rect x="514" y="24" width="62" height="16" rx="8" fill="#2a0f16" stroke="#e63946"/>
<circle class="live" cx="525" cy="32" r="3" fill="#ff4d5e"/>
<text x="532" y="35.5" font-family="{FONT}" font-weight="800" font-size="9" fill="#ff8090">AO VIVO</text>
<text x="{W - 62}" y="37" text-anchor="end" font-family="{FONT}" font-weight="800" font-size="15" letter-spacing="1" fill="#fff">BUGS FC</text>
<circle cx="{W - 38}" cy="32" r="15" fill="#e63946" stroke="#fff" stroke-width="2"/>
<g transform="translate({W - 45},25)" shape-rendering="crispEdges">{pixels(BUG, {**BUG_PAL, "r": "#fff"})}</g>""")
    css.append(".live{animation:live 1s ease-in-out infinite}"
               "@keyframes live{50%{opacity:.2}}")
    anim("s0", "s0")
    css.append(keyframes("s0", [(0, "opacity:1"), (GOAL + .3, "opacity:1"),
                                (GOAL + .35, "opacity:0"), (D - .2, "opacity:0"),
                                (D, "opacity:1")]))
    anim("s1", "s1", box)
    css.append(keyframes("s1", [(0, "opacity:0;transform:scale(.2)"),
                                (GOAL + .3, "opacity:0;transform:scale(.2)"),
                                (GOAL + .5, "opacity:1;transform:scale(1.7)"),
                                (GOAL + .75, "opacity:1;transform:scale(1)"),
                                (D - .2, "opacity:1;transform:scale(1)"),
                                (D, "opacity:0;transform:scale(.2)")]))

    # ── Arquibancada: torcida fazendo a ola ──
    skins = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3a21"]
    shirts = [YELLOW, YELLOW, GREEN, GREEN, "#1f4fbf", "#ffffff"]
    fans = []
    for row, y in enumerate((68, 78, 88)):
        x, col = 18 + (row % 2) * 4.5, 0
        while x < W - 16:
            fans.append(f'<g class="w{col % 32}"><rect x="{x - 3:.1f}" y="{y + 2}" width="6" height="7" '
                        f'rx="2" fill="{rng.choice(shirts)}"/><circle cx="{x:.1f}" cy="{y}" r="2.6" '
                        f'fill="{rng.choice(skins)}"/></g>')
            x += 9
            col += 1
    flags = "".join(
        f'<g transform="translate({fx},60)"><line x1="0" y1="0" x2="0" y2="22" stroke="#ccd" stroke-width="1.2"/>'
        f'<g class="flag"><rect x="0" y="0" width="18" height="12" fill="{GREEN}"/>'
        f'<path d="M9 1.5L16.5 6L9 10.5L1.5 6Z" fill="{YELLOW}"/><circle cx="9" cy="6" r="2.6" fill="{BLUE}"/></g></g>'
        for fx in (140, 330, 560, 760))
    flashes = ""  # flashes de câmera na torcida na hora do gol
    for _ in range(26):
        fx, fy = rng.uniform(24, W - 24), rng.uniform(66, 92)
        flashes += (f'<g class="fl" style="animation-delay:{rng.uniform(0, .9):.2f}s">'
                    f'<circle cx="{fx:.0f}" cy="{fy:.0f}" r="6" fill="#fff" opacity=".35"/>'
                    f'<circle cx="{fx:.0f}" cy="{fy:.0f}" r="2.2" fill="#fff"/></g>')
    svg.append(f'<rect x="12" y="58" width="{W - 24}" height="40" rx="6" fill="#121a2b"/>'
               f'<g class="crowd">{"".join(fans)}{flags}</g>{flashes}')
    for i in range(32):
        css.append(f".w{i}{{animation:wave 2.4s ease-in-out {-(31 - i) * 2.4 / 32:.3f}s infinite}}")
    css.append("@keyframes wave{0%,45%,100%{transform:translateY(0)}20%{transform:translateY(-6px)}}")
    css.append(".flag{animation:flag .8s ease-in-out infinite alternate;transform-origin:0 6px}"
               "@keyframes flag{from{transform:skewY(-6deg) scaleX(.9)}to{transform:skewY(6deg) scaleX(1)}}")
    jump = [(0, "transform:translateY(0)"), (GOAL + .1, "transform:translateY(0)")]
    for k in range(12):
        jump.append((GOAL + .25 + k * .25, f"transform:translateY({-5 if k % 2 == 0 else 0}px)"))
    jump.append((D, "transform:translateY(0)"))
    anim("crowd", "jump")
    css.append(keyframes("jump", jump))
    anim("fl", "fl")
    css.append(keyframes("fl", [(0, "opacity:0"), (GOAL + .2, "opacity:0"), (GOAL + .25, "opacity:1"),
                                (GOAL + .4, "opacity:0"), (GOAL + 1.2, "opacity:0"),
                                (GOAL + 1.25, "opacity:1"), (GOAL + 1.4, "opacity:0"),
                                (GOAL + 2.3, "opacity:0"), (GOAL + 2.35, "opacity:1"),
                                (GOAL + 2.5, "opacity:0"), (D, "opacity:0")]))

    # ── Gramado ──
    stripes = "".join(
        f'<rect x="{PX0 + i * 80}" y="{PY0}" width="80" height="{PY1 - PY0}" '
        f'fill="{"#14532d" if i % 2 else "#166534"}"/>' for i in range(10))
    gy0, gy1 = MIDY - 30, MIDY + 30
    lines = (f'<g fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.6">'
             f'<rect x="{PX0 + 4}" y="{PY0 + 4}" width="{PX1 - PX0 - 8}" height="{PY1 - PY0 - 8}"/>'
             f'<line x1="{W / 2}" y1="{PY0 + 4}" x2="{W / 2}" y2="{PY1 - 4}"/>'
             f'<circle cx="{W / 2}" cy="{MIDY}" r="34"/>'
             f'<rect x="{PX0 + 4}" y="{MIDY - 62}" width="78" height="124"/>'
             f'<rect x="{PX0 + 4}" y="{MIDY - 32}" width="28" height="64"/>'
             f'<rect x="{PX1 - 82}" y="{MIDY - 62}" width="78" height="124"/>'
             f'<rect x="{PX1 - 32}" y="{MIDY - 32}" width="28" height="64"/>'
             f'<path d="M{PX0 + 82} {MIDY - 20}A26 26 0 0 1 {PX0 + 82} {MIDY + 20}"/>'
             f'<path d="M{PX1 - 82} {MIDY - 20}A26 26 0 0 0 {PX1 - 82} {MIDY + 20}"/></g>'
             f'<circle cx="{W / 2}" cy="{MIDY}" r="2.5" fill="#fff" fill-opacity=".6"/>')
    svg.append(f'<g clip-path="url(#pitch)">{stripes}<rect x="{PX0}" y="{PY0}" width="{PX1 - PX0}" '
               f'height="{PY1 - PY0}" fill="url(#spot)"/>{lines}</g>')
    svg.append(f'<rect x="{PX0 - 20}" y="{gy0}" width="20" height="60" fill="url(#net)" '
               f'stroke="#fff" stroke-width="2"/>')

    # ── Meses + grade de contribuições ──
    seen = set()
    for d in sorted(days, key=lambda d: d.date):
        if d.date.day <= 7 and d.weekday == 0 and d.date.month not in seen and d.week < COLS - 2:
            seen.add(d.date.month)
            svg.append(f'<text x="{GX + d.week * STEP:.1f}" y="{GY - 5:.1f}" font-family="{FONT}" '
                       f'font-size="8" font-weight="600" fill="#fff" fill-opacity=".55">'
                       f'{MONTHS[d.date.month - 1]}</text>')
    visit_at = {id(d): vt for vt, (_, d) in zip(visit_times, route) if d is not None}
    cells = []
    for d in days:
        x, y = GX + d.week * STEP, GY + d.weekday * STEP
        attrs = f'x="{x:.1f}" y="{y:.1f}" width="{CS}" height="{CS}" rx="2.5" fill="{CELL_COLORS[d.level]}"'
        if id(d) in visit_at:
            i, vt, base = len(css), visit_at[id(d)], CELL_COLORS[d.level]
            cells.append(f'<rect class="c{i}" {attrs}/>')
            anim(f"c{i}", f"k{i}", box)
            css.append(keyframes(f"k{i}", [
                (0, f"fill:{base}"), (vt - .02, f"fill:{base};transform:scale(1)"),
                (vt, "fill:#fff;transform:scale(1.7)"), (vt + .35, f"fill:{YELLOW};transform:scale(1)"),
                (REVERT0, f"fill:{YELLOW}"), (REVERT1, f"fill:{base}"), (D, f"fill:{base}")]))
        else:
            cells.append(f"<rect {attrs}/>")
    svg.append(f'<g>{"".join(cells)}</g>')

    # ── Zagueiros do BUGS FC patrulhando ──
    for i, (bx, dur) in enumerate(((250, 2.6), (440, 3.3), (625, 2.9))):
        svg.append(f'<g transform="translate({bx},{GY - 2:.1f})"><g class="bug" style="animation-duration:{dur}s;'
                   f'animation-delay:{-i * .9:.1f}s"><g class="wob" shape-rendering="crispEdges">'
                   f'{pixels(BUG, BUG_PAL)}</g></g></g>')
    css.append(f".bug{{animation:patrol 3s ease-in-out infinite alternate}}"
               f"@keyframes patrol{{to{{transform:translateY({GH - 12:.0f}px)}}}}"
               f".wob{{animation:wob .25s steps(1) infinite;{box}}}"
               f"@keyframes wob{{50%{{transform:rotate(12deg)}}}}")

    # ── Goleiro (acompanha a bola e pula pro lado errado) ──
    keeper = []
    t = 0.0
    while t < PRESHOT:
        _, by = pos_at(t, ball)
        keeper.append((t + .3, tr(0, max(-22, min(22, (by - MIDY) * .9)))))
        t += .35
    keeper = [(0, tr(0, 0))] + keeper
    keeper += [(GOAL - .12, tr(0, -4)), (GOAL + .05, tr(2, -26, "rotate(-40deg)")),
               (GOAL + .4, tr(4, -20, "rotate(-90deg)")), (REVERT0, tr(4, -20, "rotate(-90deg)")),
               (REVERT1, tr(0, 0, "rotate(0deg)")), (D, tr(0, 0, "rotate(0deg)"))]
    svg.append(f'<g transform="translate({PX1 - 26},{MIDY - 16})"><g class="kp">'
               f'<g transform="translate(20,0) scale(-1,1)" shape-rendering="crispEdges">'
               f'{runner(KEEPER_BODY, KEEPER_PAL)}</g></g></g>')
    anim("kp", "kp", box)
    css.append(keyframes("kp", keeper))

    # ── Craque ──
    off = (-24, -24)
    cel = (PX1 - 150, PY0 + 4)
    player = [(0, tr(S[0] + off[0], S[1] + off[1])), (PASS_END + .1, tr(S[0] + off[0], S[1] + off[1]))]
    player += [(vt + LAG, tr(p[0] + off[0], p[1] + off[1])) for vt, (p, _) in zip(visit_times, route)]
    player += [(PRESHOT + LAG, tr(P[0] + off[0], P[1] + off[1])),
               (GOAL + .25, tr(P[0] + off[0], P[1] + off[1])),
               (GOAL + 1.5, tr(*cel)), (D, tr(*cel))]
    tag = escape(name.split()[0].upper())
    svg.append(f'<g class="fade"><g class="pl"><g class="hop">'
               f'<rect x="-6" y="-14" width="32" height="10" rx="3" fill="{BLUE}" stroke="{YELLOW}" stroke-width=".8"/>'
               f'<text x="10" y="-6.5" text-anchor="middle" font-family="{FONT}" font-weight="800" '
               f'font-size="7" fill="{YELLOW}">{tag} 10</text>'
               f'<g shape-rendering="crispEdges">{runner(PLAYER_BODY, PLAYER_PAL)}</g></g></g></g>')
    anim("pl", "pl")
    css.append(keyframes("pl", player))
    hop = [(0, "transform:translateY(0)"), (GOAL + 1.5, "transform:translateY(0)")]
    for k in range(8):
        hop.append((GOAL + 1.7 + k * .2, f"transform:translateY({-9 if k % 2 == 0 else 0}px)"))
    hop.append((D, "transform:translateY(0)"))
    anim("hop", "hop")
    css.append(keyframes("hop", hop))
    css.append(".fa{animation:fa .3s steps(1) infinite}.fb{animation:fa .3s steps(1) -.15s infinite}"
               "@keyframes fa{50%{opacity:0}}")

    # ── Bola (com rastro) ──
    ball_kf = [(t, tr(*p)) for t, p in ball]
    lift = [(0, "transform:translateY(0)"), (KICK, "transform:translateY(0)"),
            ((KICK + PASS_END) / 2, "transform:translateY(-30px)"), (PASS_END, "transform:translateY(0)"),
            (PRESHOT, "transform:translateY(0)"), ((PRESHOT + GOAL) / 2, "transform:translateY(-12px)"),
            (GOAL, "transform:translateY(0)"), (D, "transform:translateY(0)")]
    trail = "".join(
        f'<g class="fade"><g class="bm" style="animation-delay:{dly}s"><g class="bl" style="animation-delay:{dly}s">'
        f'<circle r="{r}" fill="{YELLOW}" opacity="{op}"/></g></g></g>'
        for dly, r, op in ((.12, 2.4, .15), (.08, 3.2, .25), (.04, 4, .38)))
    pent = " ".join(f"{1.9 * math.cos(math.radians(a - 90)):.2f},{1.9 * math.sin(math.radians(a - 90)):.2f}"
                    for a in range(0, 360, 72))
    dots = "".join(f'<circle cx="{4 * math.cos(math.radians(a + 90)):.2f}" cy="{4 * math.sin(math.radians(a + 90)):.2f}" '
                   f'r="1.1" fill="#1a1a1a"/>' for a in range(0, 360, 72))
    svg.append(f'{trail}<g class="fade"><g class="bm"><ellipse cx="1.5" cy="5.5" rx="5" ry="1.8" fill="#000" opacity=".35"/>'
               f'<g class="bl"><g class="spin"><circle r="5" fill="#fff" stroke="#1a1a1a" stroke-width=".8"/>'
               f'<polygon points="{pent}" fill="#1a1a1a"/>{dots}</g></g></g></g>')
    anim("bm", "bm")
    css.append(keyframes("bm", ball_kf))
    anim("bl", "bl")
    css.append(keyframes("bl", lift))
    css.append(f".spin{{animation:spin .45s linear infinite;{box}}}@keyframes spin{{to{{transform:rotate(360deg)}}}}")
    anim("fade", "fade")
    css.append(keyframes("fade", [(0, "opacity:0"), (.5, "opacity:1"), (FADE0, "opacity:1"),
                                  (FADE1, "opacity:0"), (D, "opacity:0")]))

    # ── Rede do gol da direita (na frente da bola) ──
    svg.append(f'<g class="net"><rect x="{PX1}" y="{gy0}" width="20" height="60" fill="url(#net)" '
               f'stroke="#fff" stroke-width="2"/></g>')
    shake = [(0, tr(0, 0)), (GOAL, tr(0, 0)), (GOAL + .05, tr(4, 0)), (GOAL + .12, tr(-2, 1)),
             (GOAL + .2, tr(3, -1)), (GOAL + .3, tr(-1, 0)), (GOAL + .45, tr(0, 0)), (D, tr(0, 0))]
    anim("net", "net")
    css.append(keyframes("net", shake))

    # ── GOOOOOL! ──
    svg.append(f'<rect class="flash" x="{PX0}" y="{PY0}" width="{PX1 - PX0}" height="{PY1 - PY0}" fill="#fff"/>')
    anim("flash", "flash")
    css.append(keyframes("flash", [(0, "opacity:0"), (GOAL, "opacity:0"), (GOAL + .06, "opacity:.55"),
                                   (GOAL + .5, "opacity:0"), (D, "opacity:0")]))
    word = "GOOOOOL!"
    widths = [{"G": 52, "O": 50, "L": 42, "!": 26}[ch] for ch in word]
    x0 = W / 2 - sum(widths) / 2
    letters = []
    for i, ch in enumerate(word):
        x = x0 + sum(widths[:i]) + widths[i] / 2
        letters.append(f'<g class="lt" style="animation-delay:{-i * .09:.2f}s">'
                       f'<text x="{x + 3:.1f}" y="{MIDY + 19 + 4}" fill="{GREEN}">{ch}</text>'
                       f'<text x="{x:.1f}" y="{MIDY + 19}" fill="{YELLOW}" stroke="{BLUE}" stroke-width="5" '
                       f'paint-order="stroke" stroke-linejoin="round">{ch}</text></g>')
    sub = escape(f"{name.upper()} MARCA!  ⚽  {st['total']} contribuições no último ano")
    svg.append(f'<g class="band"><rect x="{PX0}" y="{MIDY - 46}" width="{PX1 - PX0}" height="92" fill="url(#band)"/>'
               f'<rect x="{PX0 + 60}" y="{MIDY - 46}" width="{PX1 - PX0 - 120}" height="2" fill="{YELLOW}"/>'
               f'<rect x="{PX0 + 60}" y="{MIDY + 44}" width="{PX1 - PX0 - 120}" height="2" fill="{GREEN}"/></g>'
               f'<g class="gol" font-family="{HEAVY}" font-size="60" text-anchor="middle" filter="url(#glow)">'
               f'{"".join(letters)}</g>'
               f'<text class="sub" x="{W / 2}" y="{MIDY + 39}" text-anchor="middle" font-family="{FONT}" '
               f'font-weight="800" font-size="12.5" letter-spacing=".5" fill="#fff">{sub}</text>')
    anim("band", "band", box)
    css.append(keyframes("band", [(0, "opacity:0;transform:scaleX(0)"), (GOAL, "opacity:0;transform:scaleX(0)"),
                                  (GOAL + .25, "opacity:1;transform:scaleX(1)"),
                                  (GOL_OUT - .5, "opacity:1;transform:scaleX(1)"),
                                  (GOL_OUT, "opacity:0;transform:scaleX(1)"), (D, "opacity:0")]))
    anim("gol", "gol", box)
    css.append(keyframes("gol", [(0, "opacity:0;transform:scale(.2)"), (GOAL + .1, "opacity:0;transform:scale(.2)"),
                                 (GOAL + .32, "opacity:1;transform:scale(1.25)"),
                                 (GOAL + .55, "opacity:1;transform:scale(1)"),
                                 (GOL_OUT - .5, "opacity:1;transform:scale(1)"),
                                 (GOL_OUT - .1, "opacity:0;transform:scale(1.5)"), (D, "opacity:0")]))
    css.append(".lt{animation:lt .7s ease-in-out infinite}"
               "@keyframes lt{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}")
    anim("sub", "sub")
    css.append(keyframes("sub", [(0, "opacity:0"), (GOAL + .6, "opacity:0;transform:translateY(8px)"),
                                 (GOAL + .9, "opacity:1;transform:translateY(0)"),
                                 (GOL_OUT - .5, "opacity:1"), (GOL_OUT - .1, "opacity:0"), (D, "opacity:0")]))

    # ── Confete ──
    variants = [(-30, 540), (25, -720), (-10, 360), (40, -480)]
    for v, (dx, rot) in enumerate(variants):
        anim(f"cf{v}", f"cf{v}", box)
        css.append(keyframes(f"cf{v}", [
            (0, "opacity:0;transform:translate(0,0) rotate(0)"), (GOAL, "opacity:0;transform:translate(0,0) rotate(0)"),
            (GOAL + .05, "opacity:1"),
            (GOAL + 2.8, f"opacity:1;transform:translate({dx}px,190px) rotate({rot}deg)"),
            (GOAL + 3.2, f"opacity:0;transform:translate({dx * 1.1:.0f}px,215px) rotate({rot * 1.1:.0f}deg)"),
            (D, "opacity:0")]))
    conf = []
    for _ in range(80):
        cx, cy = rng.uniform(PX0 + 10, PX1 - 10), rng.uniform(58, 100)
        color = rng.choice([YELLOW, YELLOW, GREEN, "#3b82f6", "#fff", "#ff6b35"])
        w, h = rng.choice([(4, 7), (5, 5), (3, 8), (6, 3)])
        conf.append(f'<rect class="cf{rng.randrange(4)}" style="animation-delay:{rng.uniform(0, .6):.2f}s" '
                    f'x="{cx:.0f}" y="{cy:.0f}" width="{w}" height="{h}" rx="1" fill="{color}"/>')
    svg.append(f'<g>{"".join(conf)}</g>')

    # ── Letreiro de TV com a súmula ──
    dias = lambda n: f"{n} dia" + ("" if n == 1 else "s")  # noqa: E731
    best_date = f"{st['best_date'].day:02d}/{st['best_date'].month:02d}/{st['best_date'].year}"
    today = dt.date.today()
    ticker = escape(
        f"⚽ {st['total']} contribuições no último ano   •   📅 {dias(st['active'])} em campo   •   "
        f"🔥 Maior sequência: {dias(st['longest'])}   •   ⚡ Sequência atual: {dias(st['current'])}   •   "
        f"🏆 Melhor dia: {st['best']} contribuições em {best_date}   •   "
        f"🟨 Cada quadrado dourado é um dia de código   •   "
        f"🔄 Atualizado em {today.day:02d}/{today.month:02d}/{today.year}   •   ")
    tlen = len(ticker) * 6.15
    tdur = tlen / 45
    tx = (f'<text y="327" font-family="{FONT}" font-weight="600" font-size="12" fill="#d7e0ee" '
          f'textLength="{tlen:.0f}" lengthAdjust="spacingAndGlyphs"')
    svg.append(f'<rect x="12" y="306" width="{W - 24}" height="34" rx="8" fill="#0f172a" stroke="#24314a"/>'
               f'<g clip-path="url(#tick)"><g class="tk">{tx} x="130">{ticker}</text>'
               f'{tx} x="{130 + tlen:.0f}">{ticker}</text></g></g>'
               f'<path d="M20 306h102v34H20a8 8 0 0 1-8-8v-18a8 8 0 0 1 8-8z" fill="{GREEN}"/>'
               f'<text x="67" y="327.5" text-anchor="middle" font-family="{HEAVY}" font-size="11" '
               f'letter-spacing="1" fill="{YELLOW}">SÚMULA</text>')
    css.append(f".tk{{animation:tk {tdur:.1f}s linear infinite}}"
               f"@keyframes tk{{to{{transform:translateX(-{tlen:.0f}px)}}}}")

    title = escape(f"Commit Futebol Clube — {user}")
    desc = escape(f"Partida animada no gráfico de contribuições de {user}: "
                  f"{st['total']} contribuições no último ano.")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
            f'role="img" aria-labelledby="t d"><title id="t">{title}</title><desc id="d">{desc}</desc>'
            f'<style>{"".join(css)}</style>{"".join(svg)}</svg>')


def main() -> None:
    ap = argparse.ArgumentParser(description="⚽ Commit Futebol Clube — SVG animado para o perfil do GitHub")
    ap.add_argument("--user", required=True, help="usuário do GitHub")
    ap.add_argument("--name", help="nome do craque (padrão: o usuário)")
    ap.add_argument("--out", default="dist/futebol.svg")
    ap.add_argument("--demo", action="store_true", help="usa dados fictícios")
    ap.add_argument("--seed", type=int, default=13)
    args = ap.parse_args()

    days, source = load_days(args.user, args.demo, args.seed)
    days = last_53_weeks(days)
    svg = build_svg(days, args.user, args.name or args.user, args.seed)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"[ok] {args.out} gerado ({len(svg) / 1024:.0f} KB, fonte: {source})")


if __name__ == "__main__":
    main()
