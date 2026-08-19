"""Volume (卷) storage: one JSON file per volume inside volumes/.

A volume is an aggregate of plot nodes: ``chapters`` holds the ordered node-id
list it contains. Volumes carry no ``order`` of their own — their position in
the chapter list is derived from the order of their first chapter.
"""
import json
import os
import threading

from . import node_store, project_store as ps

_lock = threading.Lock()


def _dir():
    return os.path.join(ps.get_current_path(), ps.VOLUMES_DIR)


def _path(stem):
    return os.path.join(_dir(), stem + ".json")


def _write_volume_file(volume):
    ps.ensure_volumes_dir()
    stem = ps.unique_stem(_dir(), volume.get("name", ""))
    with open(_path(stem), "w", encoding="utf-8") as f:
        json.dump(volume, f, ensure_ascii=False, indent=2)


def list_volumes():
    d = _dir()
    result = []
    if not os.path.isdir(d):
        return result
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".json"):
            continue
        try:
            with open(os.path.join(d, fn), encoding="utf-8") as f:
                v = json.load(f)
        except Exception:
            continue
        if isinstance(v, dict):
            result.append(v)
    result.sort(key=lambda v: v.get("id", ""))
    return result


def _find_file(volume_id):
    d = _dir()
    if not os.path.isdir(d):
        return None
    for fn in os.listdir(d):
        if not fn.endswith(".json"):
            continue
        fp = os.path.join(d, fn)
        try:
            with open(fp, encoding="utf-8") as f:
                v = json.load(f)
        except Exception:
            continue
        if v.get("id") == volume_id:
            return fp
    return None


def create_volume(name=""):
    with _lock:
        volume = {
            "id": node_store.new_id("volume"),
            "name": name or "未命名卷",
            "intro": "",
            "body": "",
            "chapters": [],
        }
        _write_volume_file(volume)
    ps.touch_project()
    return volume


def get_volume(volume_id):
    fp = _find_file(volume_id)
    if not fp:
        raise ps.ProjectError("卷不存在")
    with open(fp, encoding="utf-8") as f:
        return json.load(f)


def update_volume(volume_id, patch):
    with _lock:
        fp = _find_file(volume_id)
        if not fp:
            raise ps.ProjectError("卷不存在")
        with open(fp, encoding="utf-8") as f:
            volume = json.load(f)
        for k, v in (patch or {}).items():
            if v is not None:
                volume[k] = v
        volume["id"] = volume_id
        if "name" in (patch or {}) and patch["name"] != volume.get("name"):
            stem = ps.unique_stem(_dir(), volume.get("name", ""))
            new_fp = _path(stem)
            if os.path.abspath(new_fp) != os.path.abspath(fp):
                os.remove(fp)
                fp = new_fp
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(volume, f, ensure_ascii=False, indent=2)
    ps.touch_project()
    return volume


def set_chapters(volume_id, chapters):
    """Replace a volume's ordered chapter list."""
    chapters = [c for c in (chapters or []) if isinstance(c, str) and c]
    with _lock:
        fp = _find_file(volume_id)
        if not fp:
            raise ps.ProjectError("卷不存在")
        with open(fp, encoding="utf-8") as f:
            volume = json.load(f)
        volume["chapters"] = chapters
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(volume, f, ensure_ascii=False, indent=2)
    ps.touch_project()
    return volume


def remove_chapter_from_all(node_id):
    """Drop a deleted node from every volume's chapters (no-op if absent)."""
    for v in list_volumes():
        if node_id in (v.get("chapters") or []):
            update_volume(v["id"], {"chapters": [c for c in v["chapters"] if c != node_id]})


def delete_volume(volume_id):
    with _lock:
        fp = _find_file(volume_id)
        if fp and os.path.exists(fp):
            os.remove(fp)
    ps.touch_project()


def migrate_legacy_order():
    """One-time: volumes that still carry an ``order`` (and no ``chapters``) get
    their chapters inferred from that order, then the field is dropped."""
    d = _dir()
    if not os.path.isdir(d):
        return
    nodes = node_store.list_nodes()
    node_order = {n["id"]: (n.get("order") if isinstance(n.get("order"), int) else 0) for n in nodes}

    vols = []
    for fn in os.listdir(d):
        if not fn.endswith(".json"):
            continue
        fp = os.path.join(d, fn)
        try:
            with open(fp, encoding="utf-8") as f:
                v = json.load(f)
        except Exception:
            continue
        if not isinstance(v, dict) or "chapters" in v:
            continue
        vols.append((fp, v))
    if not vols:
        return
    vols.sort(key=lambda x: (x[1].get("order") if isinstance(x[1].get("order"), int) else 0))
    with _lock:
        for i, (fp, v) in enumerate(vols):
            lo = v.get("order") if isinstance(v.get("order"), int) else 0
            hi = None
            if i + 1 < len(vols):
                hi = vols[i + 1][1].get("order")
                if not isinstance(hi, int):
                    hi = None
            chapters = [nid for nid, o in node_order.items() if o > lo and (hi is None or o < hi)]
            chapters.sort(key=lambda nid: node_order.get(nid, 0))
            v["chapters"] = chapters
            v.pop("order", None)
            with open(fp, "w", encoding="utf-8") as f:
                json.dump(v, f, ensure_ascii=False, indent=2)
