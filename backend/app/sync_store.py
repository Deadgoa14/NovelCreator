"""Obsidian sync settings/state, atomic file IO and backups.

The md folder is a *mirror*: project JSON/node files stay the app's source of
truth. Everything here is project-scoped and stored in ``sync-settings.json``.
"""
import json
import os
import shutil
from datetime import datetime, timezone

from . import project_store as ps

DEFAULT_CHAPTERS_DIR = "章节目录"
DEFAULT_CHARACTERS_FILE = "人物.md"
DEFAULT_CONCEPTS_FILE = "概念.md"
MARKER_FILE = ".nc-sync.json"
BACKUP_KEEP = 10

DEFAULT_SETTINGS = {
    "mdRoot": "",
    "lastSyncAt": "",
    "ignoredPaths": [],
    "entries": {},
}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _normalize(data):
    """Return a settings dict with every expected key present."""
    out = dict(DEFAULT_SETTINGS)
    if isinstance(data, dict):
        out.update({k: data.get(k) for k in DEFAULT_SETTINGS if k in data})
    if not isinstance(out.get("ignoredPaths"), list):
        out["ignoredPaths"] = []
    if not isinstance(out.get("entries"), dict):
        out["entries"] = {}
    return out


def read_settings():
    return _normalize(ps.read_json_file(ps.SYNC_FILE, dict(DEFAULT_SETTINGS)) or {})


def write_settings(data):
    data = _normalize(data)
    ps.write_json_file(ps.SYNC_FILE, data)
    return data


def validate_root(path):
    """Validate an absolute md root and return its normalized form."""
    if not path or not str(path).strip():
        raise ps.ProjectError("请先选择同步文件夹")
    root = os.path.abspath(os.path.expanduser(str(path).strip()))
    if not os.path.isdir(root):
        raise ps.ProjectError("同步文件夹不存在")
    project = os.path.normcase(os.path.abspath(ps.get_current_path()))
    norm_root = os.path.normcase(root)
    if norm_root == project or norm_root.startswith(project + os.sep):
        raise ps.ProjectError("同步文件夹不能放在项目数据目录里，请另选一个文件夹")
    return root


def ensure_layout(md_root):
    """Create the managed layout under ``md_root`` and return resolved paths."""
    root = validate_root(md_root)
    chapters = os.path.join(root, DEFAULT_CHAPTERS_DIR)
    os.makedirs(chapters, exist_ok=True)
    return {
        "root": root,
        "chapters": chapters,
        "characters": os.path.join(root, DEFAULT_CHARACTERS_FILE),
        "concepts": os.path.join(root, DEFAULT_CONCEPTS_FILE),
    }


def rel_path(md_root, path):
    """POSIX-style path relative to ``md_root`` (used in sync state)."""
    return os.path.relpath(path, md_root).replace(os.sep, "/")


def read_text(path):
    """Read UTF-8 text (BOM tolerated) with newlines normalized to LF."""
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        raw = f.read()
    return raw.replace("\r\n", "\n").replace("\r", "\n")


def write_text(path, text):
    ps.atomic_write_text(path, text)


def _prune_backups(base):
    try:
        runs = sorted(
            d for d in os.listdir(base)
            if os.path.isdir(os.path.join(base, d))
        )
    except OSError:
        return
    for name in runs[:-BACKUP_KEEP]:
        shutil.rmtree(os.path.join(base, name), ignore_errors=True)


_backup_run = ""


def begin_backup_run():
    """Give every backup in one sync apply the same timestamp folder."""
    global _backup_run
    _backup_run = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    return _backup_run


def end_backup_run():
    global _backup_run
    _backup_run = ""


def backup_file(src, side, rel):
    """Copy ``src`` into the project's backup folder before it is overwritten.

    ``side`` is ``"md"`` or ``"app"``; ``rel`` is a display-relative path used
    to keep the destination tree readable.
    """
    if not src or not os.path.exists(src):
        return ""
    stamp = _backup_run or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    base = os.path.join(ps.get_current_path(), ps.SYNC_BACKUP_DIR)
    dest = os.path.join(base, stamp, side, *str(rel).replace("\\", "/").split("/"))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy2(src, dest)
    _prune_backups(base)
    return dest


# ---------------------------------------------------------------- project marker
def read_marker(md_root):
    fp = os.path.join(md_root, MARKER_FILE)
    if not os.path.exists(fp):
        return {}
    try:
        with open(fp, encoding="utf-8-sig") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def write_marker(md_root):
    project = os.path.abspath(ps.get_current_path())
    data = {"projectPath": project, "projectName": _project_name(), "updatedAt": _now()}
    ps.atomic_write_text(
        os.path.join(md_root, MARKER_FILE),
        json.dumps(data, ensure_ascii=False, indent=2),
    )
    return data


def check_marker(md_root):
    marker = read_marker(md_root)
    project = os.path.abspath(ps.get_current_path())
    if marker.get("projectPath") and os.path.normcase(marker["projectPath"]) != os.path.normcase(project):
        raise ps.ProjectError(
            "这个文件夹已经和另一个项目（%s）同步过。请换一个文件夹，或先删除其中的 %s。"
            % (marker.get("projectName") or marker.get("projectPath"), MARKER_FILE)
        )
    return marker


def _project_name():
    return (ps.read_json_file(ps.PROJECT_FILE, {}) or {}).get("name", "")


# ---------------------------------------------------------------- state entries
def entry_key(kind, entity_id):
    return f"{kind}:{entity_id}"


def get_entry(settings, kind, entity_id):
    return (settings.get("entries") or {}).get(entry_key(kind, entity_id)) or {}


def put_entry(settings, kind, entity_id, path, content_hash):
    settings.setdefault("entries", {})[entry_key(kind, entity_id)] = {
        "kind": kind,
        "entityId": entity_id,
        "path": path,
        "hash": content_hash,
    }
    return settings


def drop_entry(settings, kind, entity_id):
    (settings.get("entries") or {}).pop(entry_key(kind, entity_id), None)
    return settings


def touch_last_sync(settings):
    settings["lastSyncAt"] = _now()
    return settings
