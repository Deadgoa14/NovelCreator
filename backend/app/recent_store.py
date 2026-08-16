"""Global (cross-project) store for the recently opened project list."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

RECENT_FILE = Path(__file__).resolve().parent.parent / "recent_projects.json"

MAX_RECENT = 20


def _now():
    return datetime.now(timezone.utc).isoformat()


def load():
    data = {"recent": [], "lastPath": ""}
    if os.path.exists(RECENT_FILE):
        try:
            with open(RECENT_FILE, encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                data.update(loaded)
        except Exception:
            pass
    return data


def _save(data):
    with open(RECENT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def record(path, name):
    """Mark ``path`` as the most-recently opened project."""
    path = os.path.abspath(path)
    data = load()
    data["lastPath"] = path
    recents = [r for r in data.get("recent", []) if isinstance(r, dict) and r.get("path") != path]
    recents.insert(0, {"path": path, "name": name or os.path.basename(path), "lastOpened": _now()})
    data["recent"] = recents[:MAX_RECENT]
    _save(data)
    return data


def remove(path):
    path = os.path.abspath(path)
    data = load()
    data["recent"] = [r for r in data.get("recent", []) if r.get("path") != path]
    if data.get("lastPath") == path:
        data["lastPath"] = data["recent"][0]["path"] if data["recent"] else ""
    _save(data)
    return data


def list_recent():
    return load()
