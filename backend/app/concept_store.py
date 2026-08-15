"""Concept/character storage: one JSON file per concept inside concepts/."""
import json
import os
import threading

from . import node_store, project_store as ps

_lock = threading.Lock()


def _concepts_dir():
    return os.path.join(ps.get_current_path(), ps.CONCEPTS_DIR)


def _concept_path(stem):
    return os.path.join(_concepts_dir(), stem + ".json")


def _read_file(fp):
    with open(fp, encoding="utf-8") as f:
        return json.load(f)


def _write_concept_file(concept):
    """Write one concept to a name-derived file. Used by migration too."""
    ps.ensure_concepts_dir()
    stem = ps.unique_stem(_concepts_dir(), concept.get("name", ""))
    with open(_concept_path(stem), "w", encoding="utf-8") as f:
        json.dump(concept, f, ensure_ascii=False, indent=2)


def list_concepts():
    d = _concepts_dir()
    concepts = []
    if not os.path.isdir(d):
        return concepts
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".json"):
            continue
        try:
            c = _read_file(os.path.join(d, fn))
        except Exception:
            continue
        if isinstance(c, dict):
            concepts.append(c)
    concepts.sort(key=lambda c: c.get("name", ""))
    return concepts


def _find_file(concept_id):
    d = _concepts_dir()
    if not os.path.isdir(d):
        return None
    for fn in os.listdir(d):
        if not fn.endswith(".json"):
            continue
        fp = os.path.join(d, fn)
        try:
            c = _read_file(fp)
        except Exception:
            continue
        if c.get("id") == concept_id:
            return fp
    return None


def get_concept(concept_id):
    fp = _find_file(concept_id)
    if not fp:
        raise ps.ProjectError("概念不存在")
    return _read_file(fp)


def create_concept(concept):
    with _lock:
        concept["id"] = concept.get("id") or node_store.new_id("concept")
        _write_concept_file(concept)
    ps.touch_project()
    return concept


def update_concept(concept_id, concept):
    with _lock:
        fp = _find_file(concept_id)
        if not fp:
            raise ps.ProjectError("概念不存在")
        old = _read_file(fp)
        concept["id"] = concept_id
        # Name change -> move/rename the file to match the new name.
        if concept.get("name") != old.get("name"):
            stem = ps.unique_stem(_concepts_dir(), concept.get("name", ""))
            new_fp = _concept_path(stem)
            if os.path.abspath(new_fp) != os.path.abspath(fp):
                os.remove(fp)
                fp = new_fp
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(concept, f, ensure_ascii=False, indent=2)
    ps.touch_project()
    return concept


def delete_concept(concept_id):
    with _lock:
        fp = _find_file(concept_id)
        if fp and os.path.exists(fp):
            os.remove(fp)
        # Clean relations referencing this concept.
        data = ps.read_json_file(ps.RELATIONS_FILE, {"relations": []})
        data["relations"] = [
            r for r in data.get("relations", [])
            if r.get("from") != concept_id and r.get("to") != concept_id
        ]
        ps.write_json_file(ps.RELATIONS_FILE, data)
    ps.touch_project()


def read_relations():
    return ps.read_json_file(ps.RELATIONS_FILE, {"relations": []}).get("relations", [])


def write_relations(relations):
    ps.write_json_file(ps.RELATIONS_FILE, {"relations": relations})
    ps.touch_project()
