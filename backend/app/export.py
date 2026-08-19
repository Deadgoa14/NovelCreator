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


def _render_volume(volume, index, o):
    lines = [f"第{index}卷  {volume.get('name', '')}"]
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


def _branch_order(storyline):
    """Return the ordered node-id list for a branch storyline.

    Walk from ``start`` (fallback: the node with no incoming edge, then
    ``nodes[0]``) following the unique active outgoing edge until there is
    none. Inactive branches are skipped.
    """
    nodes = storyline.get("nodes") or []
    edges = storyline.get("edges") or []
    incoming = {e.get("to") for e in edges if isinstance(e, dict)}
    root = storyline.get("start") or next((n for n in nodes if n not in incoming), (nodes[0] if nodes else None))
    if not root:
        return []
    by_from = {}
    for e in edges:
        if isinstance(e, dict):
            by_from.setdefault(e.get("from"), []).append(e)
    order = []
    cur = root
    seen = set()
    while cur and cur not in seen:
        seen.add(cur)
        order.append(cur)
        nxt = None
        for e in by_from.get(cur, []):
            if e.get("active"):
                nxt = e.get("to")
                break
        cur = nxt
    return order


def _resolve_order(storyline):
    """Ordered node-id list to export: follow the active connections from the
    storyline's 线头 id, expanding volume ids to their chapters."""
    from . import connection_store, volume_store

    vol_chapters = {v["id"]: (v.get("chapters") or []) for v in volume_store.list_volumes()}
    by_from = {}
    for c in connection_store.list_connections():
        if c.get("active"):
            by_from.setdefault(c.get("from"), []).append(c.get("to"))

    order = []
    cur = storyline.get("id")
    seen = set()
    while cur and cur not in seen:
        seen.add(cur)
        if cur != storyline.get("id"):
            if cur in vol_chapters:
                order.extend(vol_chapters[cur])
            else:
                order.append(cur)
        nxts = by_from.get(cur) or []
        cur = nxts[0] if nxts else None
    return order


def _opts(opts):
    opts = opts or {}
    return {
        "indentParagraph": bool(opts.get("indentParagraph")),
        "paragraphGap": int(opts.get("paragraphGap") or 0),
        "chapterHeadBlank": int(opts.get("chapterHeadBlank") or 0),
        "chapterTailBlank": int(opts.get("chapterTailBlank") or 0),
        "chapterNumberingPerVolume": bool(opts.get("chapterNumberingPerVolume")),
    }


def export_storyline(storyline, opts=None):
    o = _opts(opts)
    nodes_dir = os.path.join(ps.get_current_path(), ps.NODES_DIR)

    # Build the "which volume does each node belong to" map from volume.chapters.
    nodes = node_store.list_nodes()
    node_order = {n["id"]: (n.get("order") if isinstance(n.get("order"), int) else 0) for n in nodes}
    volume_map = {}
    for v in volume_store.list_volumes():
        for nid in v.get("chapters") or []:
            volume_map[nid] = v
    # Order volumes by their first chapter's position for stable 卷 numbering.
    def _vol_key(v):
        orders = [node_order.get(c, 0) for c in (v.get("chapters") or [])]
        return min(orders) if orders else 0
    volumes = sorted(volume_store.list_volumes(), key=_vol_key)
    volume_by_id = {v["id"]: v for v in volumes}
    volume_index = {v["id"]: i + 1 for i, v in enumerate(volumes)}

    chapters = []
    char_count = 0
    chapter_no = 0
    emitted_volumes = set()
    for nid in _resolve_order(storyline):
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
            chapters.append(_render_volume(vol, volume_index.get(vol["id"], 0), o))
            char_count += sum(1 for ch in (vol.get("body") or "") if not ch.isspace())
            emitted_volumes.add(vol["id"])
            if o["chapterNumberingPerVolume"]:
                chapter_no = 0
        chapter_no += 1
        for beat in meta.get("beats", []) or []:
            char_count += sum(1 for ch in (beat.get("body") or "") if not ch.isspace())
        chapters.append(_render_chapter(chapter_no, meta.get("title") or "", paragraphs, o))
    content = "\n".join(chapters) + ("\n" if chapters else "")
    return content, char_count


def _chapter_index(node_id):
    """1-based chapter number of a node within its first containing storyline."""
    from . import storyline_store

    for sl in storyline_store.list_storylines():
        order = _resolve_order(sl)
        if node_id in order:
            return order.index(node_id) + 1
    return 1


def export_node(node_id, opts=None):
    """Export a single node's prose as one chapter, auto-numbered by its
    position in its storyline."""
    o = _opts(opts)
    nodes_dir = os.path.join(ps.get_current_path(), ps.NODES_DIR)
    fp = os.path.join(nodes_dir, f"{node_id}.md")
    if not os.path.exists(fp):
        raise ps.ProjectError("剧情节点不存在")
    with open(fp, encoding="utf-8") as f:
        meta, body = parse_node(f.read())
    migrate_legacy_body(meta, body)
    paragraphs = _chapter_paragraphs(meta, o)
    if not paragraphs:
        return "", 0
    content = _render_chapter(_chapter_index(node_id), meta.get("title") or "", paragraphs, o)
    char_count = 0
    for beat in meta.get("beats", []) or []:
        char_count += sum(1 for ch in (beat.get("body") or "") if not ch.isspace())
    return content, char_count


# ---------------------------------------------------------------- data export
def export_data(kind, fmt="txt"):
    """Export concepts / characters / plot outlines as txt or markdown."""
    from . import concept_store

    concepts = concept_store.list_concepts()
    by_id = {c["id"]: c for c in concepts}

    if kind in ("concepts", "characters"):
        items = [c for c in concepts if (c.get("type") == "character") == (kind == "characters")]
        return _render_concepts(items, by_id, fmt)

    # outlines: node title + 梗概 (beat text)
    nodes = node_store.list_nodes()
    return _render_outlines(nodes, fmt)


def _concept_attrs(c, by_id):
    attrs = []
    aliases = c.get("aliases") or []
    if aliases:
        attrs.append(("别名", "、".join(str(a) for a in aliases)))
    if c.get("type") == "character":
        if c.get("identity"):
            attrs.append(("身份", str(c.get("identity"))))
        if c.get("personality"):
            attrs.append(("性格", str(c.get("personality"))))
        if c.get("background"):
            attrs.append(("背景", str(c.get("background"))))
        if c.get("category"):
            attrs.append(("类", str(c.get("category"))))
    else:
        tmap = {"generic": "通用", "place": "地点", "item": "物品"}
        attrs.append(("类型", tmap.get(c.get("type"), "通用")))
    if c.get("description"):
        attrs.append(("描述", str(c.get("description"))))
    tags = [by_id[t].get("name") for t in (c.get("tags") or []) if t in by_id and by_id[t].get("name")]
    if tags:
        attrs.append(("标签", "、".join(tags)))
    return attrs


def _render_concepts(items, by_id, fmt):
    blocks = []
    for c in items:
        name = c.get("name") or "未命名"
        attrs = _concept_attrs(c, by_id)
        if fmt == "md":
            lines = [f"## {name}"]
            for k, v in attrs:
                lines.append(f"- {k}：{v}")
        else:
            lines = [name]
            for k, v in attrs:
                lines.append(f"{k}：{v}")
        blocks.append("\n".join(lines))
    return ("\n\n".join(blocks) + "\n") if blocks else ""


def _render_outlines(nodes, fmt):
    blocks = []
    for n in nodes:
        title = n.get("title") or "未命名节点"
        lines = [f"## {title}" if fmt == "md" else title]
        for i, b in enumerate(n.get("beats") or [], start=1):
            text = (b.get("text") or "").strip()
            if text:
                lines.append(f"{i}. {text}")
        blocks.append("\n".join(lines))
    return ("\n\n".join(blocks) + "\n") if blocks else ""
