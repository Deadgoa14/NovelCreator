"""Board layout storage: positions of nodes/start-dots and character nodes.

``whiteboard.json`` holds the storyline-board layout (plot nodes + one start
dot per storyline); ``relations-board.json`` holds the character-relation board
layout (character node positions).
"""
import os
import threading

from . import project_store as ps

_lock = threading.Lock()


def read_whiteboard():
    return ps.read_json_file(ps.WHITEBOARD_FILE, {"items": []})


def read_relations_board():
    return ps.read_json_file(ps.RELATIONS_BOARD_FILE, {"items": []})


def _upsert(items, key_fn, new_item):
    """Replace the item matching ``key_fn`` or append ``new_item``."""
    for i, it in enumerate(items):
        if key_fn(it):
            items[i] = new_item
            return items
    items.append(new_item)
    return items


def write_whiteboard_items(items):
    ps.write_json_file(ps.WHITEBOARD_FILE, {"items": items})


def set_node_position(node_id, x, y):
    with _lock:
        data = read_whiteboard()
        data["items"] = _upsert(
            data.get("items", []),
            lambda it: it.get("type") == "node" and it.get("nodeId") == node_id,
            {"type": "node", "nodeId": node_id, "position": {"x": x, "y": y}},
        )
        ps.write_json_file(ps.WHITEBOARD_FILE, data)
    return {"ok": True}


def set_start_position(storyline_id, x, y):
    with _lock:
        data = read_whiteboard()
        data["items"] = _upsert(
            data.get("items", []),
            lambda it: it.get("type") == "start" and it.get("storylineId") == storyline_id,
            {"type": "start", "storylineId": storyline_id, "position": {"x": x, "y": y}},
        )
        ps.write_json_file(ps.WHITEBOARD_FILE, data)
    return {"ok": True}


def set_character_position(concept_id, x, y):
    with _lock:
        data = read_relations_board()
        data["items"] = _upsert(
            data.get("items", []),
            lambda it: it.get("type") == "character" and it.get("conceptId") == concept_id,
            {"type": "character", "conceptId": concept_id, "position": {"x": x, "y": y}},
        )
        ps.write_json_file(ps.RELATIONS_BOARD_FILE, data)
    return {"ok": True}


def prune_storyline_items(valid_node_ids, valid_storyline_ids):
    """Drop board items referencing deleted nodes or storylines."""
    with _lock:
        data = read_whiteboard()
        data["items"] = [
            it for it in data.get("items", [])
            if (it.get("type") == "node" and it.get("nodeId") in valid_node_ids)
            or (it.get("type") == "start" and it.get("storylineId") in valid_storyline_ids)
        ]
        ps.write_json_file(ps.WHITEBOARD_FILE, data)


def prune_character_items(valid_concept_ids):
    with _lock:
        data = read_relations_board()
        data["items"] = [
            it for it in data.get("items", [])
            if it.get("type") != "character" or it.get("conceptId") in valid_concept_ids
        ]
        ps.write_json_file(ps.RELATIONS_BOARD_FILE, data)
