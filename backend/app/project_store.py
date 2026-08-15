"""Project-level storage: folder layout, JSON read/write, current project tracking."""
import json
import os
import re
from datetime import datetime, timezone

PROJECT_FILE = "project.json"
CONCEPTS_DIR = "concepts"
STORYLINES_DIR = "storylines"
VOLUMES_DIR = "volumes"
RELATIONS_FILE = "relations.json"
WHITEBOARD_FILE = "whiteboard.json"
RELATIONS_BOARD_FILE = "relations-board.json"
NODES_DIR = "nodes"
EXPORT_SETTINGS_FILE = "export-settings.json"

# Legacy (pre-folder) files, kept only for one-time migration.
LEGACY_CONCEPTS_FILE = "concepts.json"
LEGACY_STORYLINES_FILE = "storylines.json"

DEFAULT_EXPORT_SETTINGS = {
    "indentParagraph": True,
    "paragraphGap": 0,
    "chapterHeadBlank": 0,
    "chapterTailBlank": 0,
}


class ProjectError(Exception):
    """Raised for project-level user-facing errors."""


_current_path = None


def _now():
    return datetime.now(timezone.utc).isoformat()


def get_current_path():
    if not _current_path:
        raise ProjectError("尚未打开任何项目")
    return _current_path


def set_current(path):
    global _current_path
    _current_path = os.path.abspath(path)


def read_json_file(filename, default=None):
    fp = os.path.join(get_current_path(), filename)
    if not os.path.exists(fp):
        return default
    with open(fp, encoding="utf-8") as f:
        return json.load(f)


def write_json_file(filename, data):
    fp = os.path.join(get_current_path(), filename)
    with open(fp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def read_export_settings():
    return read_json_file(EXPORT_SETTINGS_FILE, dict(DEFAULT_EXPORT_SETTINGS))


def write_export_settings(data):
    write_json_file(EXPORT_SETTINGS_FILE, data)
    return read_export_settings()


def safe_filename(name):
    """Turn a human name into a filesystem-safe filename stem."""
    s = re.sub(r'[\\/:*?"<>|\r\n\t]+', "_", (name or "").strip())
    return s or "未命名"


def unique_stem(dirpath, name):
    """Return a free filename stem (no extension) inside ``dirpath``.

    Appends `` (2)``, `` (3)`` … when a file with the same stem already exists.
    """
    stem = safe_filename(name)
    if not os.path.exists(os.path.join(dirpath, stem + ".json")):
        return stem
    n = 2
    while os.path.exists(os.path.join(dirpath, f"{stem} ({n}).json")):
        n += 1
    return f"{stem} ({n})"


def _ensure_dir(dirname):
    os.makedirs(os.path.join(get_current_path(), dirname), exist_ok=True)


def ensure_concepts_dir():
    _ensure_dir(CONCEPTS_DIR)


def ensure_storylines_dir():
    _ensure_dir(STORYLINES_DIR)


def ensure_volumes_dir():
    _ensure_dir(VOLUMES_DIR)


def create_project(path, name):
    path = os.path.abspath(path)
    if os.path.exists(os.path.join(path, PROJECT_FILE)):
        raise ProjectError("该路径已经是一个项目，请使用「打开项目」")
    if os.path.isdir(path) and os.listdir(path):
        raise ProjectError("目标文件夹非空，请选择一个空文件夹或新路径")
    set_current(path)
    os.makedirs(os.path.join(path, NODES_DIR), exist_ok=True)
    os.makedirs(os.path.join(path, CONCEPTS_DIR), exist_ok=True)
    os.makedirs(os.path.join(path, STORYLINES_DIR), exist_ok=True)
    os.makedirs(os.path.join(path, VOLUMES_DIR), exist_ok=True)
    project = {
        "schemaVersion": 2,
        "name": name or os.path.basename(path),
        "createdAt": _now(),
        "updatedAt": _now(),
    }
    write_json_file(PROJECT_FILE, project)
    write_json_file(RELATIONS_FILE, {"relations": []})
    write_json_file(WHITEBOARD_FILE, {"items": []})
    write_json_file(RELATIONS_BOARD_FILE, {"items": []})
    write_json_file(EXPORT_SETTINGS_FILE, dict(DEFAULT_EXPORT_SETTINGS))
    return load_project()


def open_project(path):
    path = os.path.abspath(path)
    if not os.path.exists(os.path.join(path, PROJECT_FILE)):
        raise ProjectError("该路径不是有效项目（缺少 project.json）")
    set_current(path)
    _migrate_legacy()
    return load_project()


def load_project():
    from . import board_store, concept_store, node_store, storyline_store, volume_store

    project = read_json_file(PROJECT_FILE, {})
    nodes = node_store.list_nodes()
    return {
        "project": project,
        "concepts": {"concepts": concept_store.list_concepts(), "relations": concept_store.read_relations()},
        "storylines": {"storylines": storyline_store.list_storylines()},
        "volumes": volume_store.list_volumes(),
        "whiteboard": board_store.read_whiteboard(),
        "relationsBoard": board_store.read_relations_board(),
        "nodes": nodes,
        "exportSettings": read_export_settings(),
    }


def touch_project():
    project = read_json_file(PROJECT_FILE, {})
    project["updatedAt"] = _now()
    write_json_file(PROJECT_FILE, project)


def _migrate_legacy():
    """One-time migration from the old flat JSON files into folders."""
    path = get_current_path()

    # concepts.json -> concepts/*.json + relations.json + relations-board.json
    legacy = os.path.join(path, LEGACY_CONCEPTS_FILE)
    if os.path.exists(legacy):
        data = read_json_file(LEGACY_CONCEPTS_FILE, {"concepts": [], "relations": []})
        write_json_file(RELATIONS_FILE, {"relations": data.get("relations", [])})
        ensure_concepts_dir()
        items = []
        for c in data.get("concepts", []):
            if c.get("position"):
                items.append({"type": "character", "conceptId": c["id"], "position": c["position"]})
        write_json_file(RELATIONS_BOARD_FILE, {"items": items})
        from . import concept_store

        for c in data.get("concepts", []):
            c = {k: v for k, v in c.items() if k != "position"}
            concept_store._write_concept_file(c)
        os.remove(legacy)

    # storylines.json -> storylines/*.json
    legacy_lines = os.path.join(path, LEGACY_STORYLINES_FILE)
    if os.path.exists(legacy_lines):
        data = read_json_file(LEGACY_STORYLINES_FILE, {"storylines": []})
        ensure_storylines_dir()
        from . import storyline_store

        for s in data.get("storylines", []):
            storyline_store._write_storyline_file(s)
        os.remove(legacy_lines)

    # node frontmatter position -> whiteboard.json
    from . import node_store

    node_store.migrate_positions_to_whiteboard()
