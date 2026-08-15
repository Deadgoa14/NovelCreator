"""Global concept rename across all node files (body + beats frontmatter)."""
import os

from . import project_store as ps
from .node_parser import parse_node


def _mask_aliases(text, aliases, old_name):
    """Replace alias occurrences with a sentinel so they are left untouched."""
    aliases = sorted([a for a in aliases if a and a != old_name], key=len, reverse=True)
    placeholders = {}
    for i, a in enumerate(aliases):
        ph = f"<<<__ALIAS_{i}__>>>"
        text = text.replace(a, ph)
        placeholders[ph] = a
    return text, placeholders


def _restore_aliases(text, placeholders):
    for ph, a in placeholders.items():
        text = text.replace(ph, a)
    return text


def rename_concept(concept, new_name, apply):
    """Rename a concept's primary name across all node files.

    Returns a summary of affected nodes. When ``apply`` is True the files are
    rewritten; otherwise this is a dry run (preview only).
    """
    old_name = concept.get("name", "")
    aliases = concept.get("aliases", []) or []
    nodes_dir = os.path.join(ps.get_current_path(), ps.NODES_DIR)
    affected = []
    if not old_name or old_name == new_name:
        return {"affected": affected, "total": 0, "oldName": old_name, "newName": new_name}

    replacements = []
    if os.path.isdir(nodes_dir):
        for fn in sorted(os.listdir(nodes_dir)):
            if not fn.endswith(".md"):
                continue
            fp = os.path.join(nodes_dir, fn)
            with open(fp, encoding="utf-8") as f:
                raw = f.read()
            masked, placeholders = _mask_aliases(raw, aliases, old_name)
            count = masked.count(old_name)
            if count:
                meta, _ = parse_node(raw)
                affected.append({
                    "id": meta.get("id") or fn[:-3],
                    "title": meta.get("title", ""),
                    "count": count,
                })
                if apply:
                    new_masked = masked.replace(old_name, new_name)
                    replacements.append((fp, _restore_aliases(new_masked, placeholders)))

    if apply:
        for fp, text in replacements:
            with open(fp, "w", encoding="utf-8") as f:
                f.write(text)

    total = sum(a["count"] for a in affected)
    return {"affected": affected, "total": total, "oldName": old_name, "newName": new_name}
