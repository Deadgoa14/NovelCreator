"""Storyline storage: one JSON file per storyline inside storylines/."""
import json
import os
import threading

from . import node_store, project_store as ps

_lock = threading.Lock()


def _dir():
    return os.path.join(ps.get_current_path(), ps.STORYLINES_DIR)


def _path(stem):
    return os.path.join(_dir(), stem + ".json")


def _write_storyline_file(sl):
    """Write one storyline to a name-derived file. Used by migration too."""
    ps.ensure_storylines_dir()
    stem = ps.unique_stem(_dir(), sl.get("name", ""))
    with open(_path(stem), "w", encoding="utf-8") as f:
        json.dump(sl, f, ensure_ascii=False, indent=2)


def list_storylines():
    d = _dir()
    result = []
    if not os.path.isdir(d):
        return result
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".json"):
            continue
        try:
            with open(os.path.join(d, fn), encoding="utf-8") as f:
                sl = json.load(f)
        except Exception:
            continue
        if isinstance(sl, dict):
            result.append(sl)
    result.sort(key=lambda s: s.get("name", ""))
    return result


def _find_file(line_id):
    d = _dir()
    if not os.path.isdir(d):
        return None
    for fn in os.listdir(d):
        if not fn.endswith(".json"):
            continue
        fp = os.path.join(d, fn)
        try:
            with open(fp, encoding="utf-8") as f:
                sl = json.load(f)
        except Exception:
            continue
        if sl.get("id") == line_id:
            return fp
    return None


def create_storyline(sl):
    with _lock:
        sl["id"] = sl.get("id") or node_store.new_id("line")
        _write_storyline_file(sl)
    ps.touch_project()
    return sl


def update_storyline(line_id, sl):
    with _lock:
        fp = _find_file(line_id)
        if not fp:
            raise ps.ProjectError("故事线不存在")
        old = None
        with open(fp, encoding="utf-8") as f:
            old = json.load(f)
        sl["id"] = line_id
        if sl.get("name") != old.get("name"):
            stem = ps.unique_stem(_dir(), sl.get("name", ""))
            new_fp = _path(stem)
            if os.path.abspath(new_fp) != os.path.abspath(fp):
                os.remove(fp)
                fp = new_fp
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(sl, f, ensure_ascii=False, indent=2)
    ps.touch_project()
    return sl


def delete_storyline(line_id):
    with _lock:
        fp = _find_file(line_id)
        if fp and os.path.exists(fp):
            os.remove(fp)
    ps.touch_project()
