"""Volume (卷) storage: one JSON file per volume inside volumes/."""
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
    result.sort(key=lambda v: (v.get("order") if isinstance(v.get("order"), int) else 0, v.get("id", "")))
    return result


def _max_order():
    d = _dir()
    m = 0
    if not os.path.isdir(d):
        return m
    for fn in os.listdir(d):
        if not fn.endswith(".json"):
            continue
        try:
            with open(os.path.join(d, fn), encoding="utf-8") as f:
                v = json.load(f)
            o = v.get("order")
            if isinstance(o, int) and o > m:
                m = o
        except Exception:
            continue
    return m


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
            "order": node_store.max_order() + 1,
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


def set_order(volume_id, order):
    with _lock:
        fp = _find_file(volume_id)
        if not fp:
            return
        with open(fp, encoding="utf-8") as f:
            volume = json.load(f)
        volume["order"] = order
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(volume, f, ensure_ascii=False, indent=2)


def delete_volume(volume_id):
    with _lock:
        fp = _find_file(volume_id)
        if fp and os.path.exists(fp):
            os.remove(fp)
    ps.touch_project()
