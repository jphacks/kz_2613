"""Check local links, anchors and diagrams in public Markdown without dependencies."""
from collections import Counter
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


def prose(text):
    return re.sub(r"^(`{3,}|~{3,}).*?^\1\s*$", "", text, flags=re.M | re.S)


def slug(text):
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text).lower().replace("`", "")
    return re.sub(r"[^\w\- ]", "", text).replace(" ", "-")


class Attributes(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"])
        for name in ("href", "src"):
            if values.get(name):
                self.links.append(values[name])


def anchors(path):
    text = prose(path.read_text(encoding="utf-8"))
    html = Attributes()
    html.feed(text)
    found = set(html.ids)
    seen = Counter()
    for heading in re.findall(r"^#{1,6}\s+(.+?)\s*#*\s*$", text, re.M):
        key = slug(heading)
        found.add(key if not seen[key] else f"{key}-{seen[key]}")
        seen[key] += 1
    return found


def check(paths):
    errors = []
    refs = diagrams = sequences = 0
    for path in paths:
        text = path.read_text(encoding="utf-8")
        clean = prose(text)
        html = Attributes()
        html.feed(clean)
        links = html.links + re.findall(r"\]\(<?([^\s)>]+)>?(?:\s+\"[^\"]*\")?\)", clean)
        for link in links:
            url = urlsplit(unescape(link))
            if url.scheme or url.netloc:
                continue
            target = (path.parent / unquote(url.path)).resolve() if url.path else path
            refs += 1
            if not target.exists():
                errors.append(f"{path.relative_to(ROOT)}: missing {link}")
            elif url.fragment and target.suffix == ".md" and unquote(url.fragment) not in anchors(target):
                errors.append(f"{path.relative_to(ROOT)}: missing anchor {link}")
        for diagram in re.findall(r"^```mermaid\n(.*?)^```", text, re.M | re.S):
            diagrams += 1
            kind = diagram.strip().splitlines()[0]
            sequences += kind == "sequenceDiagram"
            if kind not in ("flowchart LR", "flowchart TB", "stateDiagram-v2", "sequenceDiagram"):
                errors.append(f"{path.relative_to(ROOT)}: unexpected Mermaid type {kind}")
        fences = re.findall(r"^```[^\n]*$", text, re.M)
        if len(fences) % 2:
            errors.append(f"{path.relative_to(ROOT)}: unclosed code fence")
    return errors, refs, diagrams, sequences


if __name__ == "__main__":
    paths = [ROOT / "README.md", *sorted((ROOT / "docs").glob("*.md")),
             ROOT / "docs/develop/README.md", ROOT / "docs/develop/document-migration.md",
             ROOT / "assets/README.md", ROOT / "assets/images/README.md"]
    if "--all" in sys.argv:
        paths = sorted(set(paths) | set((ROOT / "docs/develop").rglob("*.md")))
    errors, refs, diagrams, sequences = check(paths)
    if diagrams < 12 or sequences < 6:
        errors.append(f"Missing diagrams: {diagrams} Mermaid, {sequences} sequence diagrams")
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"PASS: {len(paths)} Markdown files, {refs} local references, {diagrams} Mermaid / {sequences} sequences")
