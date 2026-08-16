"""Plot-node CRUD backed by node .md files."""
import os
import threading
import uuid

from . import matching, project_store as ps
from .node_parser import migrate_legacy_body, parse_node, serialize_node

_lock = threading.Lock()


def _nodes_dir():
    return os.path.join(ps.get_current_path(), ps.NODES_DIR)


def _node_path(node_id):
    return os.path.join(_nodes_dir(), f"{node_id}.md")


def new_id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _read_node(node_id):
    """Return (meta, body) with beats normalized and any legacy body migrated."""
    fp = _node_path(node_id)
    if not os.path.exists(fp):
        raise ps.ProjectError("剧情节点不存在")
    with open(fp, encoding="utf-8") as f:
        raw = f.read()
    meta, body = parse_node(raw)
    body = migrate_legacy_body(meta, body)
    return meta, body


def _max_order():
    """Return the largest ``order`` value across all node files (0 if none)."""
    d = _nodes_dir()
    m = 0
    if not os.path.isdir(d):
        return m
    for fn in os.listdir(d):
        if not fn.endswith(".md"):
            continue
        try:
            with open(os.path.join(d, fn), encoding="utf-8") as f:
                meta, _ = parse_node(f.read())
            o = meta.get("order")
            if isinstance(o, int) and o > m:
                m = o
        except Exception:
            continue
    return m


def max_order():
    """Largest order across both plot nodes and volumes (shared order space)."""
    from . import volume_store

    return max(_max_order(), volume_store._max_order())


def list_nodes():
    d = _nodes_dir()
    nodes = []
    if not os.path.isdir(d):
        return nodes
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".md"):
            continue
        fp = os.path.join(d, fn)
        with open(fp, encoding="utf-8") as f:
            raw = f.read()
        meta, body = parse_node(raw)
        migrate_legacy_body(meta, body)
        nodes.append({
            "id": meta.get("id") or fn[:-3],
            "title": meta.get("title", ""),
            "order": meta.get("order", 0),
            "beatCount": len(meta.get("beats", []) or []),
            "characterCount": len(meta.get("characters", []) or []),
            "characters": meta.get("characters", []) or [],
            "beats": meta.get("beats", []) or [],
        })
    nodes.sort(key=lambda n: (n["order"] if isinstance(n["order"], int) else 0, n["id"]))
    return nodes


def get_node(node_id):
    meta, body = _read_node(node_id)
    return {"id": node_id, "meta": meta, "body": body}


def create_node(title=""):
    node_id = new_id("node")
    with _lock:
        # Always place new nodes at the very bottom (max order + 1),
        # never relative to any currently-selected node.
        meta = {
            "id": node_id,
            "title": title or "未命名节点",
            "order": max_order() + 1,
            "beats": [],
            "characters": [],
        }
        _write_node(node_id, meta, "")
    ps.touch_project()
    return get_node(node_id)


def set_order(node_id, order):
    if not os.path.exists(_node_path(node_id)):
        return
    meta, body = _read_node(node_id)
    meta["order"] = order
    _write_node(node_id, meta, body)


def reorder_items(sequence):
    """Renumber ``order`` 1..N for the given sequence of {type, id} items."""
    from . import volume_store

    with _lock:
        for i, item in enumerate(sequence, start=1):
            if item.get("type") == "node":
                set_order(item.get("id"), i)
            elif item.get("type") == "volume":
                volume_store.set_order(item.get("id"), i)
    ps.touch_project()
    return {"nodes": list_nodes(), "volumes": volume_store.list_volumes()}


def _beats_text(beats):
    parts = []
    for b in beats or []:
        if isinstance(b, dict):
            parts.append((b.get("text") or "") + "\n" + (b.get("body") or ""))
    return "\n".join(parts)


def update_node(node_id, meta_patch, body=None):
    with _lock:
        meta, current_body = _read_node(node_id)
        for k, v in (meta_patch or {}).items():
            if v is not None:
                meta[k] = v
        if "beats" in (meta_patch or {}):
            from . import concept_store

            concepts = concept_store.list_concepts()
            meta["characters"] = matching.find_character_ids(_beats_text(meta.get("beats")), concepts)
            current_body = ""
        elif body is not None:
            current_body = body
        _write_node(node_id, meta, current_body)
    ps.touch_project()
    return get_node(node_id)


def save_body(node_id, body):
    with _lock:
        meta, _ = _read_node(node_id)
        from . import concept_store

        concepts = concept_store.list_concepts()
        meta["characters"] = matching.find_character_ids(body, concepts)
        _write_node(node_id, meta, body)
    ps.touch_project()
    return get_node(node_id)


def delete_node(node_id):
    fp = _node_path(node_id)
    if os.path.exists(fp):
        os.remove(fp)
    # Drop the deleted node from every storyline so no stale references remain.
    from . import storyline_store

    for sl in storyline_store.list_storylines():
        next_sl = dict(sl)
        changed = False
        if node_id in (sl.get("nodes") or []):
            next_sl["nodes"] = [n for n in sl["nodes"] if n != node_id]
            changed = True
        edges = sl.get("edges") or []
        if edges:
            kept = [e for e in edges if e.get("from") != node_id and e.get("to") != node_id]
            if len(kept) != len(edges):
                next_sl["edges"] = kept
                changed = True
        if sl.get("start") == node_id:
            next_sl["start"] = None
            changed = True
        if changed:
            storyline_store.update_storyline(sl["id"], next_sl)
    ps.touch_project()


def migrate_positions_to_whiteboard():
    """Move legacy node frontmatter ``position`` into whiteboard.json (once)."""
    from . import board_store

    d = _nodes_dir()
    if not os.path.isdir(d):
        return
    data = board_store.read_whiteboard()
    items = data.get("items", [])
    existing = {it.get("nodeId") for it in items if it.get("type") == "node"}
    changed = False
    for fn in os.listdir(d):
        if not fn.endswith(".md"):
            continue
        fp = os.path.join(d, fn)
        with open(fp, encoding="utf-8") as f:
            raw = f.read()
        meta, body = parse_node(raw)
        node_id = meta.get("id") or fn[:-3]
        pos = meta.get("position")
        if pos and node_id not in existing:
            items.append({"type": "node", "nodeId": node_id, "position": pos})
            existing.add(node_id)
        if "position" in meta:
            del meta["position"]
            _write_node(node_id, meta, body)
            changed = True
    if items or changed:
        board_store.write_whiteboard_items(items)


def _write_node(node_id, meta, body):
    os.makedirs(_nodes_dir(), exist_ok=True)
    text = serialize_node(meta, body)
    with open(_node_path(node_id), "w", encoding="utf-8") as f:
        f.write(text)
