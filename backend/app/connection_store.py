"""Global directed connections between nodes / storylines / volumes.

``from -> to`` means "``from`` happens before ``to``" (a partial-order constraint).
Each connection has an ``active`` flag: at most one outgoing connection per node
is active (the currently chosen branch). The active edges reachable from a
storyline (线头) form that storyline's execution chain.
"""
import threading

from . import node_store, project_store as ps

_lock = threading.Lock()


def list_connections():
    return ps.read_json_file(ps.CONNECTIONS_FILE, {"connections": []}).get("connections", [])


def _creates_cycle(conns, from_id, to_id):
    """True if adding ``from_id -> to_id`` would create a cycle."""
    by_from = {}
    for c in conns:
        by_from.setdefault(c.get("from"), []).append(c.get("to"))
    stack = [to_id]
    seen = set()
    while stack:
        cur = stack.pop()
        if cur == from_id:
            return True
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(by_from.get(cur, []))
    return False


def create_connection(from_id, to_id):
    """Add a directed constraint, ignoring exact duplicates and rejecting cycles.

    A new edge is active iff its source has no other active outgoing edge yet —
    so the first edge from a node is the live one and later ones are dormant
    branches until switched to.
    """
    if not from_id or not to_id or from_id == to_id:
        return None
    with _lock:
        conns = list_connections()
        for c in conns:
            if c.get("from") == from_id and c.get("to") == to_id:
                return c
        if _creates_cycle(conns, from_id, to_id):
            raise ps.ProjectError("会形成循环（A 在 B 之前、B 又在 A 之前）")
        has_active = any(c.get("from") == from_id and c.get("active") for c in conns)
        conn = {"id": node_store.new_id("conn"), "from": from_id, "to": to_id, "active": not has_active}
        conns.append(conn)
        ps.write_json_file(ps.CONNECTIONS_FILE, {"connections": conns})
    ps.touch_project()
    return conn


def set_active(conn_id):
    """Make one connection the active branch of its source (others become inactive)."""
    with _lock:
        conns = list_connections()
        target = next((c for c in conns if c.get("id") == conn_id), None)
        if not target:
            raise ps.ProjectError("连线不存在")
        from_id = target["from"]
        for c in conns:
            if c.get("from") == from_id:
                c["active"] = c.get("id") == conn_id
        ps.write_json_file(ps.CONNECTIONS_FILE, {"connections": conns})
    ps.touch_project()
    return {"ok": True}


def delete_connection(conn_id):
    """Delete a connection; if it was active, re-activate a sibling (first found)."""
    with _lock:
        conns = list_connections()
        target = next((c for c in conns if c.get("id") == conn_id), None)
        conns = [c for c in conns if c.get("id") != conn_id]
        if target and target.get("active"):
            for c in conns:
                if c.get("from") == target.get("from"):
                    c["active"] = True
                    break
        ps.write_json_file(ps.CONNECTIONS_FILE, {"connections": conns})
    ps.touch_project()
    return {"ok": True}


def remove_connections_touching(ref_id):
    """Drop every connection whose source or target is ``ref_id`` (node/volume/line delete)."""
    with _lock:
        conns = [c for c in list_connections() if c.get("from") != ref_id and c.get("to") != ref_id]
        ps.write_json_file(ps.CONNECTIONS_FILE, {"connections": conns})
