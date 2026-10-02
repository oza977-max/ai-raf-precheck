"""Faithful Markdown -> HTML twin for test-cases/test-cases-NNN.md.

Usage (from the repo root):
    python3 scripts/test-cases-html.py test-cases-023 [test-cases-024 ...]
Writes test-cases/<name>.html next to each test-cases/<name>.md. The page
<head> (the Tufte/Few style block) is copied from test-cases/test-cases-022.html
unless --template <path> is given first.

Deterministic: every word of the Markdown is carried over, in order. Uses the
<head> (Tufte/Few style block) of an existing twin as the template. Supports
exactly the constructs these files use: # / ## / ### headings, paragraphs,
"- " bullet lists (with indented continuation lines), | tables |, --- rules,
and inline `code`, **bold**, *italic*, [text](url).
"""
import html
import re
import sys
from datetime import date

ENTITIES = {
    "—": "&mdash;", "–": "&ndash;", "’": "&rsquo;", "‘": "&lsquo;",
    "“": "&ldquo;", "”": "&rdquo;", "…": "&hellip;", "§": "&sect;",
    "×": "&times;", "→": "&rarr;", "←": "&larr;", "·": "&middot;",
    "≥": "&ge;", "≤": "&le;", "≠": "&ne;",
}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December"]


def ent(s: str) -> str:
    return "".join(ENTITIES.get(ch, ch) for ch in s)


def inline(text: str) -> str:
    # Protect code spans first so their contents are not treated as emphasis.
    codes: list[str] = []

    def keep_code(m: re.Match) -> str:
        codes.append(m.group(1))
        return f"\x00{len(codes) - 1}\x00"

    text = re.sub(r"`([^`]+)`", keep_code, text)
    links: list[tuple[str, str]] = []

    def keep_link(m: re.Match) -> str:
        links.append((m.group(1), m.group(2)))
        return f"\x01{len(links) - 1}\x01"

    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", keep_link, text)
    text = html.escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", text)
    text = re.sub(r"(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])", r"<em>\1</em>", text)
    text = re.sub(r"\x01(\d+)\x01", lambda m: f'<a href="{html.escape(links[int(m.group(1))][1])}">'
                  f"{inline(links[int(m.group(1))][0])}</a>", text)
    text = re.sub(r"\x00(\d+)\x00", lambda m: f"<code>{html.escape(codes[int(m.group(1))], quote=False)}</code>", text)
    return ent(text)


def slug(s: str, used: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:48] or "section"
    out, i = base, 2
    while out in used:
        out, i = f"{base}-{i}", i + 1
    used.add(out)
    return out


def split_row(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|") and not line.endswith("\\|"):
        line = line[:-1]
    # Split on unescaped pipes OUTSIDE code spans: a pipe inside `...` (e.g.
    # a regex like /a|b/) belongs to the cell, which is what the author meant.
    cells, cur, in_code, k = [], "", False, 0
    while k < len(line):
        ch = line[k]
        if ch == "\\" and k + 1 < len(line) and line[k + 1] == "|":
            cur += "|"
            k += 2
            continue
        if ch == "`":
            in_code = not in_code
        if ch == "|" and not in_code:
            cells.append(cur)
            cur = ""
        else:
            cur += ch
        k += 1
    cells.append(cur)
    return [c.strip() for c in cells]


def convert(md: str, head: str, md_name: str) -> str:
    lines = md.splitlines()
    title_idx = next((k for k, l in enumerate(lines) if l.startswith("# ")), None)
    title_line = lines[title_idx] if title_idx is not None else "# Test Cases"
    h1 = title_line[2:].strip()
    m = re.search(r"Round\s+(.+)$", h1)
    page_title = f"Round {ent(html.escape(m.group(1)))} &middot; Counterpoise &mdash; Test Cases" if m else ent(html.escape(h1))
    written = re.search(r"Written (\d{4})-(\d{2})-(\d{2})", md)
    meta_date = (f"{int(written.group(3))} {MONTHS[int(written.group(2)) - 1]} {written.group(1)} &middot; "
                 if written else "")

    out: list[str] = []
    toc: list[tuple[str, str]] = []
    used: set[str] = set()
    in_section = False
    footer = ""
    i = 0
    n = len(lines)
    para: list[str] = []

    def flush_para():
        nonlocal para
        if para:
            out.append(f"<p>{inline(' '.join(s.strip() for s in para))}</p>")
            para = []

    while i < n:
        line = lines[i]
        s = line.strip()
        if i == title_idx:
            i += 1
            continue
        if not s:
            flush_para()
            i += 1
            continue
        if s.startswith("## "):
            flush_para()
            if in_section:
                out.append("</section>")
            text = s[3:].strip()
            sid = slug(text, used)
            toc.append((sid, text))
            out.append(f'\n<section id="{sid}">\n<h2>{inline(text)}</h2>')
            in_section = True
            i += 1
            continue
        if s.startswith("### ") or s.startswith("#### "):
            flush_para()
            level = 3 if s.startswith("### ") else 4
            out.append(f"<h{level}>{inline(s[level + 1:].strip())}</h{level}>")
            i += 1
            continue
        if re.fullmatch(r"-{3,}", s):
            flush_para()
            # A rule that only precedes the closing attribution line is dropped
            # (the template renders that line as its footer).
            j = i + 1
            while j < n and not lines[j].strip():
                j += 1
            rest = [l for l in lines[j:] if l.strip()]
            if len(rest) == 1 and "Grounded Vibe Methodology" in rest[0]:
                i += 1
                continue
            out.append("<hr>")
            i += 1
            continue
        if s.startswith("|"):
            flush_para()
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(lines[i])
                i += 1
            header = split_row(rows[0])
            body_rows = [r for r in rows[1:] if not re.fullmatch(r"\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?", r.strip())]
            out.append("<table>")
            out.append("<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in header) + "</tr></thead>")
            out.append("<tbody>")
            for r in body_rows:
                cells = split_row(r)
                out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells) + "</tr>")
            out.append("</tbody>\n</table>")
            continue
        if re.match(r"^\s*[-*] ", line):
            flush_para()
            items: list[str] = []
            while i < n:
                l = lines[i]
                if re.match(r"^\s*[-*] ", l):
                    items.append(re.sub(r"^\s*[-*] ", "", l).strip())
                elif l.strip() and (l.startswith("  ") or l.startswith("\t")) and items:
                    items[-1] += " " + l.strip()
                else:
                    break
                i += 1
            out.append("<ul>\n" + "\n".join(f"<li>{inline(t)}</li>" for t in items) + "\n</ul>")
            continue
        if "Grounded Vibe Methodology" in s and all(not l.strip() for l in lines[i + 1:]):
            flush_para()
            footer = s
            i += 1
            continue
        para.append(line)
        i += 1
    flush_para()
    if in_section:
        out.append("</section>")

    nav = "\n".join(f'                <li><a href="#{sid}">{inline(t)}</a></li>' for sid, t in toc)
    foot = (f'<footer class="gvm-attribution"><p>{inline(footer)}</p></footer>\n' if footer else "")
    head = re.sub(r"<title>.*?</title>", f"<title>{page_title}</title>", head, flags=re.S)
    return (f"{head}\n<body>\n<div class=\"container\">\n<nav class=\"toc-nav\"><h3>Contents</h3><ul>\n{nav}\n</ul></nav>\n"
            f"<main class=\"main-content\">\n<header>\n<h1>{inline(h1)}</h1>\n"
            f"<p class=\"metadata\">{meta_date}Generated from {md_name} &mdash; do not hand-edit</p>\n</header>\n"
            + "\n".join(out) + f"\n{foot}</main>\n</div>\n</body>\n</html>\n")


if __name__ == "__main__":
    args = sys.argv[1:]
    template_path = "test-cases/test-cases-022.html"
    if args[:1] == ["--template"]:
        template_path, args = args[1], args[2:]
    names = [a.removesuffix(".md").removeprefix("test-cases/") for a in args]
    template = open(template_path, encoding="utf-8").read()
    head = template.split("<body>", 1)[0].rstrip()
    for name in names:
        md_path = f"test-cases/{name}.md"
        md = open(md_path, encoding="utf-8").read()
        open(f"test-cases/{name}.html", "w", encoding="utf-8").write(convert(md, head, f"{name}.md"))
        print("wrote", f"test-cases/{name}.html")
