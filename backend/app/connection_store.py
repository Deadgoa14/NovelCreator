"""Global directed connections between nodes / storylines / volumes.

``from -> to`` means "``from`` happens before ``to``" (a partial-order constraint).
The model is strictly linear: each node has at most one outgoing connection.
(Branching was removed — to fork a plot, delete the connection and re-draw, or
create a separate storyline.)
"""
import threading

from . import node_store, project_store as ps

_lock = threading.Lock()


def list_connections():
    raw = ps.read_json_file(ps.CONNECTIONS_FILE, {"connections": []}).get("connections", [])
    return [
        {"id": c.get("id"), "from": c.get("from"), "to": c.get("to")}
        for c in raw
        if c.get("from") and c.get("to")
    ]


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
    """Add a directed constraint, rejecting duplicates, cycles, and a second
    outgoing edge from the same source (the plot is linear)."""
    if not from_id or not to_id or from_id == to_id:
        return None
    with _lock:
        conns = list_connections()
        for c in conns:
            if c.get("from") == from_id and c.get("to") == to_id:
                return c
        if any(c.get("from") == from_id for c in conns):
            raise ps.ProjectError("该节点已连接到下一个节点，请先断开现有连线")
        if _creates_cycle(conns, from_id, to_id):
            raise ps.ProjectError("会形成循环（A 在 B 之前、B 又在 A 之前）")
        conn = {"id": node_store.new_id("conn"), "from": from_id, "to": to_id}
        conns.append(conn)
        ps.write_json_file(ps.CONNECTIONS_FILE, {"connections": conns})
    ps.touch_project()
    return conn


def delete_connection(conn_id):
    """Delete a connection."""
    with _lock:
        conns = [c for c in list_connections() if c.get("id") != conn_id]
        ps.write_json_file(ps.CONNECTIONS_FILE, {"connections": conns})
    ps.touch_project()
    return {"ok": True}


def remove_connections_touching(ref_id):
    """Drop every connection whose source or target is ``ref_id`` (node/volume/line delete)."""
    with _lock:
        conns = [c for c in list_connections() if c.get("from") != ref_id and c.get("to") != ref_id]
        ps.write_json_file(ps.CONNECTIONS_FILE, {"connections": conns})
