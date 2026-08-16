"""Global concept rename across all node files (body + beats frontmatter)."""
import os
import re

from . import project_store as ps
from .node_parser import parse_node


def _build_pattern(terms):
    """Build a regex alternation matching any term, longest first.

    Longest-first ordering matters: when one term is a prefix/substring of
    another (e.g. alias 「西比尔」 of name 「西比尔·杰拉德」, or alias 「熏儿」 of name
    「萧熏儿」), the longer term must win at that position so it isn't corrupted
    by the shorter one.
    """
    terms = sorted({t for t in terms if t and t.strip()}, key=len, reverse=True)
    if not terms:
        return None
    return "|".join(re.escape(t) for t in terms)


def _apply_rename(text, old_term, new_term, terms):
    """Replace ``old_term`` with ``new_term``, leaving every other term untouched."""
    pattern = _build_pattern(terms)
    if not pattern:
        return text

    def repl(m):
        return new_term if m.group(0) == old_term else m.group(0)

    return re.sub(pattern, repl, text)


def rename_term(concept, old_term, new_term, apply):
    """Rename one term (the primary name or any alias) across all node files.

    The full term set (name + aliases) is used as the match pattern, so sibling
    terms — including a primary name that contains the renamed alias as a
    substring — are left untouched. Returns a summary of affected nodes. When
    ``apply`` is True the files are rewritten; otherwise this is a dry run.
    """
    terms = [concept.get("name", "")] + (concept.get("aliases", []) or [])
    nodes_dir = os.path.join(ps.get_current_path(), ps.NODES_DIR)
    affected = []
    if not old_term or old_term == new_term:
        return {"affected": affected, "total": 0, "oldName": old_term, "newName": new_term}

    pattern = _build_pattern(terms)
    if not pattern:
        return {"affected": affected, "total": 0, "oldName": old_term, "newName": new_term}

    if os.path.isdir(nodes_dir):
        for fn in sorted(os.listdir(nodes_dir)):
            if not fn.endswith(".md"):
                continue
            fp = os.path.join(nodes_dir, fn)
            with open(fp, encoding="utf-8") as f:
                raw = f.read()
            count = sum(1 for m in re.finditer(pattern, raw) if m.group(0) == old_term)
            if count:
                meta, _ = parse_node(raw)
                affected.append({
                    "id": meta.get("id") or fn[:-3],
                    "title": meta.get("title", ""),
                    "count": count,
                })
                if apply:
                    with open(fp, "w", encoding="utf-8") as f:
                        f.write(_apply_rename(raw, old_term, new_term, terms))

    total = sum(a["count"] for a in affected)
    return {"affected": affected, "total": total, "oldName": old_term, "newName": new_term}
