"""Export a storyline into a single document with auto chapter numbering.

Only the per-beat ``body`` prose is concatenated; the outline (``text``) is
not included. Volume (卷) names + bodies are inserted once before the first
chapter that belongs to each volume; a volume's intro is never exported.
"""
import os

from . import node_store, project_store as ps, volume_store
from .node_parser import migrate_legacy_body, parse_node

_INDENT = "　　"  # two full-width spaces


def _chapter_paragraphs(meta, o):
    paragraphs = []
    for beat in meta.get("beats", []) or []:
        for p in (beat.get("body") or "").split("\n"):
            p = p.strip()
            if p:
                paragraphs.append(_INDENT + p if o["indentParagraph"] else p)
    return paragraphs


def _body_paragraphs(text, o):
    paragraphs = []
    for p in (text or "").split("\n"):
        p = p.strip()
        if p:
            paragraphs.append(_INDENT + p if o["indentParagraph"] else p)
    return paragraphs


def _render_chapter(index, title, paragraphs, o):
    lines = [f"第{index}章  {title}"]
    for _ in range(max(0, o["chapterHeadBlank"])):
        lines.append("")
    lines.append(("\n" * (max(0, o["paragraphGap"]) + 1)).join(paragraphs))
    for _ in range(max(0, o["chapterTailBlank"])):
        lines.append("")
    return "\n".join(lines)


def _render_volume(volume, o):
    lines = [volume.get("name", "")]
    for _ in range(max(0, o["chapterHeadBlank"])):
        lines.append("")
    paragraphs = _body_paragraphs(volume.get("body"), o)
    if paragraphs:
        lines.append(("\n" * (max(0, o["paragraphGap"]) + 1)).join(paragraphs))
    for _ in range(max(0, o["chapterTailBlank"])):
        lines.append("")
    return "\n".join(lines)


def _volume_of_node(node_id, volume_map):
    return volume_map.get(node_id)


def export_storyline(storyline, opts=None):
    opts = opts or {}
    o = {
        "indentParagraph": bool(opts.get("indentParagraph")),
        "paragraphGap": int(opts.get("paragraphGap") or 0),
        "chapterHeadBlank": int(opts.get("chapterHeadBlank") or 0),
        "chapterTailBlank": int(opts.get("chapterTailBlank") or 0),
    }
    nodes_dir = os.path.join(ps.get_current_path(), ps.NODES_DIR)

    # Build the "which volume does each node belong to" map from global order.
    nodes = node_store.list_nodes()
    volumes = sorted(volume_store.list_volumes(), key=lambda v: (v.get("order") or 0))
    node_order = {n["id"]: (n.get("order") if isinstance(n.get("order"), int) else 0) for n in nodes}
    volume_map = {}
    for n in nodes:
        o_n = node_order[n["id"]]
        vol = None
        for v in volumes:
            if (v.get("order") if isinstance(v.get("order"), int) else 0) < o_n:
                vol = v
            else:
                break
        volume_map[n["id"]] = vol
    volume_by_id = {v["id"]: v for v in volumes}

    chapters = []
    char_count = 0
    chapter_no = 0
    emitted_volumes = set()
    for nid in storyline.get("nodes", []):
        fp = os.path.join(nodes_dir, f"{nid}.md")
        if not os.path.exists(fp):
            continue
        with open(fp, encoding="utf-8") as f:
            meta, body = parse_node(f.read())
        migrate_legacy_body(meta, body)
        paragraphs = _chapter_paragraphs(meta, o)
        if not paragraphs:
            continue  # node has no prose -> no chapter emitted
        vol = _volume_of_node(nid, volume_map)
        if vol and vol["id"] not in emitted_volumes:
            chapters.append(_render_volume(vol, o))
            char_count += sum(1 for ch in (vol.get("body") or "") if not ch.isspace())
            emitted_volumes.add(vol["id"])
        chapter_no += 1
        for beat in meta.get("beats", []) or []:
            char_count += sum(1 for ch in (beat.get("body") or "") if not ch.isspace())
        chapters.append(_render_chapter(chapter_no, meta.get("title") or "", paragraphs, o))
    content = "\n".join(chapters) + ("\n" if chapters else "")
    return content, char_count
