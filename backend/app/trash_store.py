"""Recycle-bin storage: deleted editor text, kept for later restore.

Stored per-project in ``trash.json``. Entries carry the source node/beat so they
can be restored, plus the removed text. ``add`` enforces a max entry count.
"""
import threading
from datetime import datetime, timezone

from . import node_store, project_store as ps

_lock = threading.Lock()


def _now():
    return datetime.now(timezone.utc).isoformat()


def list_trash():
    return ps.read_json_file(ps.TRASH_FILE, {"trash": []}).get("trash", [])


def add_trash(text, node_id, beat_id, max_count=20):
    if not text or not text.strip():
        return list_trash()
    with _lock:
        items = list_trash()
        items.insert(0, {
            "id": node_store.new_id("trash"),
            "text": text,
            "nodeId": node_id,
            "beatId": beat_id,
            "createdAt": _now(),
        })
        if isinstance(max_count, int) and max_count > 0:
            items = items[:max_count]
        ps.write_json_file(ps.TRASH_FILE, {"trash": items})
    ps.touch_project()
    return items


def delete_trash(trash_id):
    with _lock:
        items = [t for t in list_trash() if t.get("id") != trash_id]
        ps.write_json_file(ps.TRASH_FILE, {"trash": items})
    ps.touch_project()
    return {"ok": True}


def clear_trash():
    with _lock:
        ps.write_json_file(ps.TRASH_FILE, {"trash": []})
    ps.touch_project()
    return {"ok": True}
