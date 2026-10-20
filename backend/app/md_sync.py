"""Two-way sync between the app store and an Obsidian markdown folder.

The app stays the source of truth; markdown files are a mirror. Every managed
entity keeps the semantic hash it had at the last successful sync, so a scan can
tell which side changed. Applying a scan never overwrites silently: conflicts and
one-sided deletions are returned as plan entries and need an explicit decision.
"""
import os
import re
import shutil
import threading

from . import concept_store, md_format as mf, node_store, project_store as ps, sync_store, volume_store

_lock = threading.Lock()
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}

DEFAULT_ACTIONS = {
    "app-new": "export",
    "md-new": "import",
    "app-changed": "export",
    "md-changed": "import",
    "conflict": "skip",
    "md-deleted": "skip",
    "app-deleted": "skip",
    "md-moved": "acknowledge",
    "converged": "acknowledge",
    "unchanged": "skip",
    "error": "skip",
    "ignored": "skip",
}


# ---------------------------------------------------------------- small helpers
def _now():
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def _valid_id(value):
    return bool(value and _ID_RE.match(value))


def _concept_group(concept):
    return "characters" if (concept or {}).get("type") == "character" else "concepts"


def _group_title(group):
    return "人物" if group == "characters" else "概念"


def _group_file(layout, group):
    return layout["characters"] if group == "characters" else layout["concepts"]


def _group_rel(group):
    return sync_store.DEFAULT_CHARACTERS_FILE if group == "characters" else sync_store.DEFAULT_CONCEPTS_FILE


def _new_id(prefix):
    return node_store.new_id(prefix)


def _safe_stem(name):
    stem = ps.safe_filename(name).strip().rstrip(". ")
    if not stem or stem.upper() in _RESERVED_NAMES:
        stem = "未命名"
    return stem[:60]


_PREFIX_RE = re.compile(r"^(\d{4})\s+(.*)$")


def _chapter_prefix(order):
    """Four-digit, zero-padded prefix so Obsidian sorts chapters correctly."""
    try:
        n = int(order)
    except (TypeError, ValueError):
        n = 0
    return f"{max(0, n):04d}"


def _split_prefixed_stem(stem):
    m = _PREFIX_RE.match(stem or "")
    return (m.group(1), m.group(2).strip()) if m else ("", (stem or "").strip())


def _chapter_path_for(chapters_dir, order, rest, node_id="", current_path=None):
    rest = _safe_stem(rest or "未命名")
    prefix = _chapter_prefix(order)
    fp = os.path.join(chapters_dir, f"{prefix} {rest}.md")
    if current_path and os.path.normcase(os.path.abspath(fp)) == os.path.normcase(os.path.abspath(current_path)):
        return fp
    if not os.path.exists(fp):
        return fp
    suffix = (node_id or "").split("-")[-1][:8]
    n = 2
    while True:
        tail = f"{rest}-{suffix}" if suffix else f"{rest} ({n})"
        cand = os.path.join(chapters_dir, f"{prefix} {tail}.md")
        if os.path.normcase(os.path.abspath(cand)) == os.path.normcase(os.path.abspath(current_path or "")):
            return cand
        if not os.path.exists(cand):
            return cand
        n += 1


def _has_prefix(parsed, order):
    stem = parsed.get("stem") or ""
    prefix, _rest = _split_prefixed_stem(stem)
    return prefix == _chapter_prefix(order)


def _hash(obj):
    return mf.canonical_hash(obj)


def _entry_key_chapter(node_id):
    return f"node:{node_id}"


def _entry_key_concept(concept_id):
    return f"concept:{concept_id}"


def _state_entry(settings, key):
    return (settings.get("entries") or {}).get(key) or {}


def _is_ignored(settings, rel):
    return rel in set(settings.get("ignoredPaths") or [])


# ---------------------------------------------------------------- snapshots
def _app_snapshot():
    volumes = volume_store.list_volumes()
    vol_by_node = {}
    vols_by_name = {}
    for v in volumes:
        vols_by_name.setdefault(v.get("name") or "", []).append(v)
        for cid in v.get("chapters") or []:
            vol_by_node.setdefault(cid, v)

    nodes = {}
    for summary in node_store.list_nodes():
        detail = node_store.get_node(summary["id"])
        meta = detail.get("meta") or {}
        nodes[summary["id"]] = {
            "id": summary["id"],
            "title": meta.get("title") or "",
            "order": meta.get("order") if isinstance(meta.get("order"), int) else 0,
            "beats": meta.get("beats") or [],
            "questions": meta.get("questions") or [],
            "volume": vol_by_node.get(summary["id"]),
        }

    concepts = concept_store.list_concepts()
    tag_names = {c["id"]: c.get("name") or "" for c in concepts if c.get("id")}
    by_name = {}
    for c in concepts:
        by_name.setdefault(c.get("name") or "", []).append(c)
    return {
        "nodes": nodes,
        "volumes": volumes,
        "volumes_by_id": {v["id"]: v for v in volumes},
        "vols_by_name": vols_by_name,
        "concepts": concepts,
        "concepts_by_id": {c["id"]: c for c in concepts if c.get("id")},
        "concepts_by_name": by_name,
        "tag_names": tag_names,
    }


def _md_snapshot(layout, settings):
    chapters = []
    errors = []
    chapters_dir = layout["chapters"]
    if os.path.isdir(chapters_dir):
        for name in sorted(os.listdir(chapters_dir)):
            if name.startswith(".") or not name.lower().endswith(".md"):
                continue
            fp = os.path.join(chapters_dir, name)
            if not os.path.isfile(fp) or os.path.islink(fp):
                continue
            rel = sync_store.rel_path(layout["root"], fp)
            if _is_ignored(settings, rel):
                chapters.append({"ignored": True, "path": fp, "rel": rel, "stem": name[:-3]})
                continue
            try:
                parsed = mf.parse_chapter(sync_store.read_text(fp), fallback_title=name[:-3])
                parsed.update({"path": fp, "rel": rel, "stem": name[:-3]})
                chapters.append(parsed)
            except Exception as e:
                errors.append({"rel": rel, "path": fp, "message": str(e)})

    groups = {}
    group_errors = {}
    for group in ("characters", "concepts"):
        fp = _group_file(layout, group)
        if not os.path.exists(fp):
            groups[group] = None
            continue
        try:
            parsed = mf.parse_people(sync_store.read_text(fp), kind=group)
            parsed.update({"path": fp, "rel": _group_rel(group), "group": group})
            groups[group] = parsed
        except Exception as e:
            errors.append({"rel": _group_rel(group), "path": fp, "message": str(e)})
            groups[group] = None
            group_errors[group] = str(e)
    return {"chapters": chapters, "groups": groups, "errors": errors, "group_errors": group_errors}


# ---------------------------------------------------------------- classification
def _classify(app_hash, md_hash, state_hash):
    if not state_hash:
        return "converged" if app_hash == md_hash else "conflict"
    app_changed = app_hash != state_hash
    md_changed = md_hash != state_hash
    if not app_changed and not md_changed:
        return "unchanged"
    if app_changed and not md_changed:
        return "app-changed"
    if md_changed and not app_changed:
        return "md-changed"
    return "converged" if app_hash == md_hash else "conflict"


def _summary_chapter(record):
    if not record:
        return None
    beats = record.get("beats") or []
    vol = record.get("volume")
    if isinstance(vol, dict):
        volume_name = vol.get("name", "")
    elif isinstance(vol, str):
        volume_name = vol
    else:
        volume_name = ""
    return {
        "title": record.get("title") or "",
        "order": record.get("order") or 0,
        "volume": volume_name,
        "beatCount": len(beats),
        "beats": [((b.get("text") or "")[:80]) for b in beats[:20] if isinstance(b, dict)],
    }


def _summary_concept(c):
    if not c:
        return None
    return {
        "name": c.get("name") or "",
        "type": c.get("type") or "generic",
        "aliases": list(c.get("aliases") or []),
        "description": (c.get("description") or "")[:120],
    }


def _entry(key, kind, entity_id, state, **kw):
    out = {
        "key": key,
        "kind": kind,
        "entityId": entity_id or "",
        "state": state,
        "defaultAction": DEFAULT_ACTIONS.get(state, "skip"),
        "name": kw.pop("name", ""),
        "path": kw.pop("path", ""),
        "appHash": kw.pop("appHash", None),
        "mdHash": kw.pop("mdHash", None),
        "appSummary": kw.pop("appSummary", None),
        "mdSummary": kw.pop("mdSummary", None),
        "warnings": kw.pop("warnings", []),
    }
    out.update(kw)
    return out


# ---------------------------------------------------------------- chapter plan
def _plan_chapters(app, md, settings):
    entries = []
    md_chapters = [c for c in md["chapters"] if not c.get("ignored")]
    ignored = [c for c in md["chapters"] if c.get("ignored")]

    by_id = {}
    for c in md_chapters:
        cid = c.get("id") or ""
        if _valid_id(cid):
            by_id.setdefault(cid, []).append(c)
    dup_ids = {cid for cid, xs in by_id.items() if len(xs) > 1}

    for cid in dup_ids:
        for c in by_id[cid]:
            entries.append(_entry(
                f"error:{c['rel']}", "chapter", cid, "error",
                name=c.get("title") or c.get("stem") or "",
                path=c["rel"],
                mdSummary=_summary_chapter(c),
                warnings=[f"id {cid} 在多个章节文件里出现，已跳过"],
            ))

    by_rel = {c["rel"]: c for c in md_chapters}
    used = set()
    matched = {}

    # 1) match by front-matter id
    for nid in app["nodes"]:
        if nid in dup_ids:
            continue
        candidates = by_id.get(nid) or []
        for c in candidates:
            if c["rel"] not in used:
                matched[nid] = c
                used.add(c["rel"])
                break

    # 2) match by the path recorded at the last sync (covers files without id)
    for nid, node in app["nodes"].items():
        if nid in matched:
            continue
        st = _state_entry(settings, _entry_key_chapter(nid))
        rel = st.get("path")
        c = by_rel.get(rel) if rel else None
        if c and c["rel"] not in used and (not c.get("id") or c.get("id") == nid):
            matched[nid] = c
            used.add(c["rel"])

    # 3) fall back to a unique title/stem match
    title_counts = {}
    for n in app["nodes"].values():
        t = (n.get("title") or "").strip()
        title_counts[t] = title_counts.get(t, 0) + 1
    for nid, node in app["nodes"].items():
        if nid in matched:
            continue
        title = (node.get("title") or "").strip()
        if not title or title_counts.get(title) != 1:
            continue
        candidates = [
            c for c in md_chapters
            if c["rel"] not in used and not c.get("id")
            and (c.get("stem") == title or (c.get("title") or "").strip() == title)
        ]
        if len(candidates) == 1:
            matched[nid] = candidates[0]
            used.add(candidates[0]["rel"])

    # matched app nodes
    for nid, node in app["nodes"].items():
        st_key = _entry_key_chapter(nid)
        st = _state_entry(settings, st_key)
        volume = node.get("volume")
        app_proj = mf.node_projection(node, volume)
        app_hash = _hash(app_proj)
        c = matched.get(nid)
        if c:
            md_hash = _hash(mf.chapter_projection(c))
            state = _classify(app_hash, md_hash, st.get("hash"))
            if state == "unchanged" and st.get("path") and st["path"] != c["rel"]:
                state = "md-moved"
            # One-time normalization after upgrading: existing files get the
            # four-digit order prefix. Only safe when the content is unchanged;
            # an edited file is imported first and renamed by the import.
            needs_prefix = state in ("unchanged", "md-moved", "converged") and not _has_prefix(c, node.get("order"))
            if needs_prefix:
                state = "app-changed"
            warnings = list(c.get("warnings") or [])
            if needs_prefix:
                warnings.append("文件名缺少章节序号，同步后会重命名")
            entries.append(_entry(
                st_key, "chapter", nid, state,
                name=node.get("title") or "",
                path=c["rel"],
                appHash=app_hash, mdHash=md_hash,
                appSummary=_summary_chapter(node),
                mdSummary=_summary_chapter(c),
                warnings=warnings,
                _app=node, _md=c,
            ))
        else:
            state = "md-deleted" if st else "app-new"
            entries.append(_entry(
                st_key, "chapter", nid, state,
                name=node.get("title") or "",
                path=st.get("path") or "",
                appHash=app_hash, mdHash=None,
                appSummary=_summary_chapter(node),
                _app=node, _md=None,
            ))

    # unmatched markdown files
    for c in md_chapters:
        if c["rel"] in used:
            continue
        cid = c.get("id") or ""
        if cid in dup_ids:
            continue
        st = _state_entry(settings, _entry_key_chapter(cid)) if _valid_id(cid) else {}
        if _valid_id(cid) and cid not in app["nodes"] and st:
            entries.append(_entry(
                _entry_key_chapter(cid), "chapter", cid, "app-deleted",
                name=c.get("title") or c.get("stem") or "",
                path=c["rel"],
                appHash=None, mdHash=_hash(mf.chapter_projection(c)),
                mdSummary=_summary_chapter(c),
                warnings=list(c.get("warnings") or []),
                _app=None, _md=c,
            ))
        else:
            md_hash = _hash(mf.chapter_projection(c))
            entries.append(_entry(
                f"md:{c['rel']}", "chapter", cid if _valid_id(cid) else "", "md-new",
                name=c.get("title") or c.get("stem") or "",
                path=c["rel"],
                appHash=None, mdHash=md_hash,
                mdSummary=_summary_chapter(c),
                warnings=list(c.get("warnings") or []),
                _app=None, _md=c,
            ))

    for c in ignored:
        entries.append(_entry(
            f"md:{c['rel']}", "chapter", "", "ignored",
            name=c.get("stem") or "",
            path=c["rel"],
            mdSummary={"title": c.get("stem") or ""},
            _app=None, _md=None,
        ))

    for e in md["errors"]:
        if e["rel"] in (sync_store.DEFAULT_CHARACTERS_FILE, sync_store.DEFAULT_CONCEPTS_FILE):
            continue
        entries.append(_entry(
            f"error:{e['rel']}", "chapter", "", "error",
            name=os.path.basename(e["rel"]),
            path=e["rel"],
            warnings=[e["message"]],
        ))
    return entries


# ---------------------------------------------------------------- concept plan
def _plan_concepts(app, md, settings):
    entries = []
    concept_list = []
    for group in ("characters", "concepts"):
        parsed = md["groups"].get(group)
        if not parsed:
            continue
        for idx, ent in enumerate(parsed["entities"]):
            ent = dict(ent)
            ent["_group"] = group
            ent["_index"] = idx
            concept_list.append(ent)

    by_id = {}
    for ent in concept_list:
        cid = ent.get("id") or ""
        if _valid_id(cid):
            by_id.setdefault(cid, []).append(ent)
    dup_ids = {cid for cid, xs in by_id.items() if len(xs) > 1}

    for cid in dup_ids:
        for ent in by_id[cid]:
            entries.append(_entry(
                f"error:concept:{cid}:{ent['_group']}:{ent['_index']}", "concept", cid, "error",
                name=ent.get("name") or "",
                path=_group_rel(ent["_group"]),
                mdSummary=_summary_concept(ent),
                warnings=[f"id {cid} 在人物/概念文件里重复出现，已跳过"],
                _app=None, _md=ent,
            ))

    used = set()
    matched = {}
    # 1) by stable id comment
    for cid in app["concepts_by_id"]:
        if cid in dup_ids:
            continue
        for ent in by_id.get(cid) or []:
            key = (ent["_group"], ent["_index"])
            if key not in used:
                matched[cid] = ent
                used.add(key)
                break
    # 2) by unique name inside the md entity's own group
    for cid, c in app["concepts_by_id"].items():
        if cid in matched:
            continue
        target_group = _concept_group(c)
        candidates = [
            ent for ent in concept_list
            if (ent["_group"], ent["_index"]) not in used
            and ent["_group"] == target_group
            and not ent.get("id")
            and (ent.get("name") or "") == (c.get("name") or "")
        ]
        if len(candidates) == 1:
            matched[cid] = candidates[0]
            used.add((candidates[0]["_group"], candidates[0]["_index"]))

    group_errors = md.get("group_errors") or {}
    for cid, c in app["concepts_by_id"].items():
        st_key = _entry_key_concept(cid)
        st = _state_entry(settings, st_key)
        target_group = _concept_group(c)
        if target_group in group_errors:
            entries.append(_entry(
                st_key, "concept", cid, "error",
                name=c.get("name") or "",
                path=_group_rel(target_group),
                appSummary=_summary_concept(c),
                warnings=[f"{_group_rel(target_group)} 解析失败：{group_errors[target_group]}"],
                _app=c, _md=None,
            ))
            continue
        app_proj = mf.concept_projection(c, [app["tag_names"].get(t, "") for t in (c.get("tags") or []) if app["tag_names"].get(t)])
        app_hash = _hash(app_proj)
        ent = matched.get(cid)
        if ent:
            md_proj = mf.concept_projection(ent, ent.get("tags") or [])
            md_hash = _hash(md_proj)
            state = _classify(app_hash, md_hash, st.get("hash"))
            entries.append(_entry(
                st_key, "concept", cid, state,
                name=c.get("name") or ent.get("name") or "",
                path=_group_rel(ent["_group"]),
                appHash=app_hash, mdHash=md_hash,
                appSummary=_summary_concept(c),
                mdSummary=_summary_concept(ent),
                _app=c, _md=ent,
            ))
        else:
            state = "md-deleted" if st else "app-new"
            entries.append(_entry(
                st_key, "concept", cid, state,
                name=c.get("name") or "",
                path=_group_rel(_concept_group(c)),
                appHash=app_hash, mdHash=None,
                appSummary=_summary_concept(c),
                _app=c, _md=None,
            ))

    for ent in concept_list:
        key = (ent["_group"], ent["_index"])
        if key in used:
            continue
        cid = ent.get("id") or ""
        if cid in dup_ids:
            continue
        st = _state_entry(settings, _entry_key_concept(cid)) if _valid_id(cid) else {}
        if _valid_id(cid) and cid not in app["concepts_by_id"] and st:
            entries.append(_entry(
                _entry_key_concept(cid), "concept", cid, "app-deleted",
                name=ent.get("name") or "",
                path=_group_rel(ent["_group"]),
                appHash=None, mdHash=_hash(mf.concept_projection(ent, ent.get("tags") or [])),
                mdSummary=_summary_concept(ent),
                _app=None, _md=ent,
            ))
        else:
            entries.append(_entry(
                f"mdconcept:{ent['_group']}:{ent['_index']}", "concept",
                cid if _valid_id(cid) else "", "md-new",
                name=ent.get("name") or "",
                path=_group_rel(ent["_group"]),
                appHash=None, mdHash=_hash(mf.concept_projection(ent, ent.get("tags") or [])),
                mdSummary=_summary_concept(ent),
                _app=None, _md=ent,
            ))

    for e in md["errors"]:
        if e["rel"] in (sync_store.DEFAULT_CHARACTERS_FILE, sync_store.DEFAULT_CONCEPTS_FILE):
            entries.append(_entry(
                f"error:{e['rel']}", "concept", "", "error",
                name=os.path.basename(e["rel"]),
                path=e["rel"],
                warnings=[e["message"]],
            ))
    return entries


def _drop_state_entries(settings, app, entries):
    """State entries whose entity and file are both gone can be forgotten."""
    present = {e["key"] for e in entries}
    drops = []
    for key in list((settings.get("entries") or {}).keys()):
        if key in present:
            continue
        ent = settings["entries"][key]
        if key.startswith("node:"):
            nid = key.split(":", 1)[1]
            if nid in app["nodes"]:
                continue
            path = ent.get("path")
            if path and os.path.exists(os.path.join(settings.get("mdRoot") or "", path)):
                continue
        elif key.startswith("concept:"):
            cid = key.split(":", 1)[1]
            if cid in app["concepts_by_id"]:
                continue
        drops.append(key)
    return drops


# ---------------------------------------------------------------- public scan
def _counts(entries):
    counts = {}
    for e in entries:
        counts[e["state"]] = counts.get(e["state"], 0) + 1
    return counts


def build_plan():
    """Read both sides and return plan entries (no writes)."""
    settings = sync_store.read_settings()
    md_root = settings.get("mdRoot") or ""
    layout = sync_store.ensure_layout(md_root)
    sync_store.check_marker(layout["root"])

    app = _app_snapshot()
    md = _md_snapshot(layout, settings)
    entries = _plan_chapters(app, md, settings) + _plan_concepts(app, md, settings)
    drops = _drop_state_entries(settings, app, entries)
    return {
        "mdRoot": layout["root"],
        "lastSyncAt": settings.get("lastSyncAt") or "",
        "entries": entries,
        "counts": _counts(entries),
        "warnings": [e["message"] for e in md["errors"]],
        "_app": app,
        "_md": md,
        "_settings": settings,
        "_layout": layout,
        "_drops": drops,
    }


def public_plan(plan):
    return {
        "mdRoot": plan["mdRoot"],
        "lastSyncAt": plan["lastSyncAt"],
        "entries": [
            {k: v for k, v in e.items() if not k.startswith("_")}
            for e in plan["entries"]
        ],
        "counts": plan["counts"],
        "warnings": plan["warnings"],
    }


# ---------------------------------------------------------------- apply helpers
def _reuse_id(old_items, index, text, prefix):
    if old_items and index < len(old_items):
        old = old_items[index]
        if isinstance(old, dict) and (old.get("text") or "") == (text or ""):
            return old.get("id") or _new_id(prefix)
    return _new_id(prefix)


def _beat_models(parsed_beats, old_beats):
    out = []
    for i, b in enumerate(parsed_beats):
        out.append({
            "id": _reuse_id(old_beats, i, b.get("text"), "beat"),
            "text": b.get("text") or "",
            "body": b.get("body") or "",
            "notes": list(b.get("notes") or []),
        })
    return out


def _question_models(parsed_questions, old_questions):
    out = []
    for i, q in enumerate(parsed_questions):
        out.append({
            "id": _reuse_id(old_questions, i, q.get("text"), "question"),
            "text": q.get("text") or "",
            "answer": q.get("answer") or "",
        })
    return out


def _add_to_volume(volume_id, node_id, order):
    v = volume_store.get_volume(volume_id)
    chapters = list(v.get("chapters") or [])
    if node_id in chapters:
        return
    node_points = {n["id"]: n["order"] for n in node_store.list_nodes()}
    insert_at = len(chapters)
    for i, cid in enumerate(chapters):
        if node_points.get(cid, 0) > (order or 0):
            insert_at = i
            break
    chapters.insert(insert_at, node_id)
    volume_store.set_chapters(volume_id, chapters)


def _remove_from_other_volumes(node_id, keep_volume_id=None):
    for v in volume_store.list_volumes():
        if v["id"] == keep_volume_id:
            continue
        chapters = v.get("chapters") or []
        if node_id in chapters:
            volume_store.set_chapters(v["id"], [c for c in chapters if c != node_id])


def _apply_volume(parsed, node_id, order, app):
    volume_id = parsed.get("volumeId") or ""
    volume_name = (parsed.get("volume") or "").strip()
    volume = app["volumes_by_id"].get(volume_id) if volume_id else None
    if not volume and volume_name:
        matches = app["vols_by_name"].get(volume_name) or []
        volume = matches[0] if matches else None
    if not volume and volume_name:
        volume = volume_store.create_volume(volume_name)
        app["volumes_by_id"][volume["id"]] = volume
        app["vols_by_name"].setdefault(volume_name, []).append(volume)
    if not volume:
        _remove_from_other_volumes(node_id)
        return
    if volume_name and volume_name != volume.get("name"):
        volume_store.update_volume(volume["id"], {"name": volume_name})
        volume["name"] = volume_name
    _remove_from_other_volumes(node_id, keep_volume_id=volume["id"])
    _add_to_volume(volume["id"], node_id, order)


def _chapter_target_path(entry, layout, settings):
    app = entry.get("_app") or {}
    order = app.get("order") if isinstance(app.get("order"), int) else 0
    current = None
    md = entry.get("_md")
    if md:
        current = md["path"]
    else:
        st = _state_entry(settings, entry["key"])
        if st.get("path"):
            fp = os.path.join(layout["root"], *st["path"].split("/"))
            if os.path.dirname(os.path.abspath(fp)) == os.path.abspath(layout["chapters"]):
                current = fp
    if current:
        stem = os.path.splitext(os.path.basename(current))[0]
        _prefix, rest = _split_prefixed_stem(stem)
        return _chapter_path_for(
            layout["chapters"], order, rest or app.get("title") or "未命名",
            entry.get("entityId"), current_path=current,
        )
    return _chapter_path_for(layout["chapters"], order, app.get("title") or "未命名", entry.get("entityId"))


def _export_chapter(entry, settings, layout):
    node = entry.get("_app")
    if not node:
        raise ps.ProjectError("导出目标不存在")
    fp = _chapter_target_path(entry, layout, settings)
    md = entry.get("_md")
    old_fp = md["path"] if md else None
    if old_fp and not os.path.exists(old_fp):
        old_fp = None

    # Read front-matter from the file we are about to overwrite or move.
    src_fp = fp if os.path.exists(fp) else old_fp
    existing_fm = None
    if src_fp:
        try:
            parsed_existing = mf.parse_chapter(sync_store.read_text(src_fp), fallback_title="")
            existing_fm = parsed_existing.get("frontmatter")
        except Exception:
            raise ps.ProjectError("目标章节文件无法解析，已跳过以免覆盖")
        sync_store.backup_file(src_fp, "md", sync_store.rel_path(layout["root"], src_fp))

    text = mf.serialize_chapter(node, node.get("volume"), existing_fm)
    if not os.path.exists(fp) or sync_store.read_text(fp) != text:
        sync_store.write_text(fp, text)
    if old_fp and os.path.normcase(os.path.abspath(old_fp)) != os.path.normcase(os.path.abspath(fp)):
        try:
            os.remove(old_fp)
        except OSError:
            pass
    return fp, _hash(mf.node_projection(node, node.get("volume")))


def _import_chapter(entry, settings, layout, app):
    md = entry.get("_md")
    if not md:
        raise ps.ProjectError("Markdown 来源不存在")
    node_id = entry.get("entityId") or md.get("id") or ""
    if not _valid_id(node_id):
        node_id = ""
    old_node = app["nodes"].get(node_id) if node_id else None
    if not node_id:
        node_id = _new_id("node")

    old_beats = (old_node or {}).get("beats") or []
    old_questions = (old_node or {}).get("questions") or []
    beats = _beat_models(md.get("beats") or [], old_beats)
    questions = _question_models(md.get("questions") or [], old_questions)
    order = md.get("order")
    if order is None:
        order = (old_node or {}).get("order")
        if order is None:
            order = node_store.max_order() + 1

    if old_node:
        old_fp = os.path.join(ps.get_current_path(), ps.NODES_DIR, f"{node_id}.md")
        if os.path.exists(old_fp):
            sync_store.backup_file(old_fp, "app", f"nodes/{node_id}.md")
        node_store.update_node(node_id, {
            "title": md.get("title") or old_node.get("title") or "未命名节点",
            "order": int(order),
            "beats": beats,
            "questions": questions,
        })
    else:
        node_store.create_node(title=md.get("title") or "未命名节点", node_id=node_id, order=int(order))
        node_store.update_node(node_id, {"beats": beats, "questions": questions})

    _apply_volume(md, node_id, int(order), app)

    current = md["path"]
    stem = os.path.splitext(os.path.basename(current))[0]
    _old_prefix, rest = _split_prefixed_stem(stem)
    desired = _chapter_path_for(
        layout["chapters"], int(order), rest or md.get("title") or "未命名",
        node_id, current_path=current,
    )

    detail = node_store.get_node(node_id)
    vol = app["nodes"].get(node_id, {}).get("volume") or _volume_for(node_id)
    # New markdown files without an id get one written back immediately.
    if not md.get("id") or md.get("id") != node_id:
        text = mf.serialize_chapter(detail["meta"], vol, md.get("frontmatter"))
        sync_store.backup_file(current, "md", md["rel"])
        sync_store.write_text(desired, text)
        if os.path.normcase(os.path.abspath(desired)) != os.path.normcase(os.path.abspath(current)):
            try:
                os.remove(current)
            except OSError:
                pass
    elif os.path.normcase(os.path.abspath(desired)) != os.path.normcase(os.path.abspath(current)):
        shutil.move(current, desired)

    proj = mf.node_projection(detail["meta"], vol)
    return node_id, sync_store.rel_path(layout["root"], desired), _hash(proj)


def _volume_for(node_id):
    for v in volume_store.list_volumes():
        if node_id in (v.get("chapters") or []):
            return v
    return None


def _delete_node_with_backup(node_id):
    fp = os.path.join(ps.get_current_path(), ps.NODES_DIR, f"{node_id}.md")
    if os.path.exists(fp):
        sync_store.backup_file(fp, "app", f"nodes/{node_id}.md")
    node_store.delete_node(node_id)


# ---------------------------------------------------------------- concept apply
def _concept_from_md(ent, tag_ids=None):
    return {
        "id": ent.get("id") or "",
        "type": ent.get("type") or "generic",
        "name": ent.get("name") or "未命名",
        "aliases": list(ent.get("aliases") or []),
        "description": ent.get("description") or "",
        "color": "#e6194b" if ent.get("type") == "character" else "#3cb44b",
        "personality": ent.get("personality") or "",
        "background": ent.get("background") or "",
        "identity": ent.get("identity") or "",
        "category": ent.get("category") or "",
        "tags": list(tag_ids or []),
    }


def _import_concept(entry, app):
    ent = entry.get("_md")
    if not ent:
        raise ps.ProjectError("Markdown 来源不存在")
    existing = app["concepts_by_id"].get(entry.get("entityId")) if entry.get("entityId") else None
    base = _concept_from_md(ent)
    if existing:
        old_fp = concept_store._find_file(existing["id"])
        if old_fp and os.path.exists(old_fp):
            sync_store.backup_file(old_fp, "app", f"concepts/{os.path.basename(old_fp)}")
        base["id"] = existing["id"]
        base["tags"] = list(existing.get("tags") or [])
        base["color"] = existing.get("color") or base["color"]
        concept_store.update_concept(existing["id"], {**existing, **base})
        cid = existing["id"]
    else:
        created = concept_store.create_concept(base)
        cid = created["id"]
    updated = concept_store.get_concept(cid)
    app["concepts_by_id"][cid] = updated
    app["tag_names"][cid] = updated.get("name") or ""
    return cid, list(ent.get("tags") or []), ent


def _resolve_concepts_and_tags(imported, app):
    """Second pass: resolve tag names, auto-create unknown generic concepts."""
    concepts = concept_store.list_concepts()
    by_name = {}
    for c in concepts:
        by_name.setdefault(c.get("name") or "", []).append(c)

    created = []
    for cid, tag_names, _ent in imported:
        tag_ids = []
        for name in tag_names:
            name = (name or "").strip()
            if not name:
                continue
            matches = by_name.get(name) or []
            if matches:
                tag_ids.append(matches[0]["id"])
                continue
            new_c = concept_store.create_concept({
                "id": "",
                "type": "generic",
                "name": name,
                "aliases": [],
                "description": "",
                "color": "#3cb44b",
                "personality": "",
                "background": "",
                "identity": "",
                "category": "",
                "tags": [],
            })
            by_name.setdefault(name, []).append(new_c)
            app["concepts_by_id"][new_c["id"]] = new_c
            tag_ids.append(new_c["id"])
            created.append(new_c)
        current = concept_store.get_concept(cid)
        concept_store.update_concept(cid, {**current, "tags": tag_ids})
    # Keep the in-memory snapshot usable for subsequent block serialization.
    fresh = concept_store.list_concepts()
    app["tag_names"] = {c["id"]: c.get("name") or "" for c in fresh if c.get("id")}
    app["concepts_by_id"] = {c["id"]: c for c in fresh if c.get("id")}
    return created


def _serialize_concept_lines(concept, app):
    names = [app["tag_names"].get(t, "") for t in (concept.get("tags") or []) if app["tag_names"].get(t)]
    return mf._serialize_concept_block(concept, names)


def _write_group(group, layout, app, replacements, remove_ids, append_ids, backfilled_indexes):
    """Merge app-side concept blocks into a group file, preserving raw blocks."""
    path = _group_file(layout, group)
    existing = None
    if os.path.exists(path):
        try:
            existing = mf.parse_people(sync_store.read_text(path), kind=group)
        except Exception:
            existing = None

    replacements = replacements or {}
    remove_ids = remove_ids or set()
    append_ids = append_ids or set()
    blocks = []
    used = set()
    if existing:
        for idx, ent in enumerate(existing["entities"]):
            cid = ent.get("id") or ""
            if cid in remove_ids:
                continue
            if idx in backfilled_indexes and idx in replacements:
                blocks.append("\n".join(replacements[idx]))
                used.add(idx)
                continue
            if cid and cid in replacements:
                blocks.append("\n".join(replacements[cid]))
                used.add(cid)
                continue
            if cid:
                used.add(cid)
            blocks.append(ent.get("raw") or "\n".join(mf._serialize_concept_block(ent, ent.get("tags") or [])))
    # Exported concepts that are not in the file yet (new files / app-new).
    for key, lines in replacements.items():
        if isinstance(key, int) or key in used or key in remove_ids:
            continue
        blocks.append("\n".join(lines))
        used.add(key)
    for cid in append_ids:
        if cid in used:
            continue
        concept = app["concepts_by_id"].get(cid)
        if concept:
            blocks.append("\n".join(_serialize_concept_lines(concept, app)))

    fm = dict((existing or {}).get("frontmatter") or {})
    fm["nc"] = "characters" if group == "characters" else "concepts"
    preamble = ((existing or {}).get("preamble") or f"### {_group_title(group)}").strip()
    body = preamble + ("\n\n" + "\n\n".join(blocks) if blocks else "") + "\n"
    text = "---\n" + mf._dump_frontmatter(fm) + "---\n\n" + body

    if os.path.exists(path):
        if sync_store.read_text(path) == text:
            return path
        if existing is None:
            raise ps.ProjectError(f"{_group_rel(group)} 无法解析，已跳过以免覆盖")
        sync_store.backup_file(path, "md", _group_rel(group))
    sync_store.write_text(path, text)
    return path


# ---------------------------------------------------------------- public apply
def apply_plan(decisions):
    """Apply explicit per-entry decisions. Returns a summary + fresh project data."""
    decisions = decisions or []
    decisions_by_key = {}
    for d in decisions:
        key = d.get("key") if isinstance(d, dict) else getattr(d, "key", None)
        if key:
            decisions_by_key[key] = d

    with _lock:
        sync_store.begin_backup_run()
        plan = build_plan()
        settings = plan["_settings"]
        layout = plan["_layout"]
        app = plan["_app"]
        by_key = {e["key"]: e for e in plan["entries"]}

        applied = 0
        skipped = 0
        errors = []
        stale = []
        warnings = []
        done_keys = set()
        touched_groups = set()

        replacements = {"characters": {}, "concepts": {}}
        remove_ids = {"characters": set(), "concepts": set()}
        append_ids = {"characters": set(), "concepts": set()}
        backfilled = {"characters": set(), "concepts": set()}
        imported_concepts = []

        def decision(entry):
            d = decisions_by_key.get(entry["key"])
            if not d:
                return None
            return d.get("action") if isinstance(d, dict) else getattr(d, "action", None)

        def get_expected(d, name):
            if isinstance(d, dict):
                return d.get(name)
            return getattr(d, name, None)

        ordered = sorted(
            plan["entries"],
            key=lambda e: {
                "delete-md": 0, "delete-app": 1, "import": 2, "keep-md": 2,
                "export": 4, "keep-app": 4, "acknowledge": 5,
                "ignore-md": 6, "skip": 9,
            }.get((decision(e) or "skip"), 9),
        )

        for entry in ordered:
            d = decisions_by_key.get(entry["key"])
            if not d:
                continue
            action = decision(entry)
            if not action or action == "skip":
                skipped += 1
                continue
            if entry["state"] in ("error", "ignored") and action not in ("acknowledge", "ignore-md"):
                errors.append({"key": entry["key"], "message": "该条目无法处理"})
                continue

            expected_app = get_expected(d, "expectedAppHash")
            expected_md = get_expected(d, "expectedMdHash")
            if expected_app is not None or expected_md is not None:
                if expected_app != entry.get("appHash") or expected_md != entry.get("mdHash"):
                    stale.append({"key": entry["key"], "message": "扫描后内容又变了，请重新扫描"})
                    continue

            try:
                if entry["kind"] == "chapter":
                    _apply_chapter_action(entry, action, settings, layout, app,
                                          applied, warnings, done_keys)
                else:
                    _apply_concept_action(entry, action, settings, layout, app,
                                          replacements, remove_ids, append_ids,
                                          backfilled, imported_concepts, touched_groups,
                                          warnings, done_keys)
                applied += 1
            except Exception as e:
                errors.append({"key": entry["key"], "message": str(e)})

        newly_created = _resolve_concepts_and_tags(imported_concepts, app) if imported_concepts else []
        for c in newly_created:
            append_ids["concepts"].add(c["id"])

        for group in ("characters", "concepts"):
            if group in touched_groups or append_ids[group] or remove_ids[group] or backfilled[group]:
                try:
                    _write_group(group, layout, app, replacements[group], remove_ids[group],
                                 append_ids[group], backfilled[group])
                except Exception as e:
                    errors.append({"key": group, "message": str(e)})

        # Record imported/new concepts after tag resolution and group writes.
        for cid, _tags, _ent in imported_concepts:
            try:
                c = concept_store.get_concept(cid)
                names = [app["tag_names"].get(t, "") for t in (c.get("tags") or []) if app["tag_names"].get(t)]
                sync_store.put_entry(settings, "concept", cid, _group_rel(_concept_group(c)),
                                     _hash(mf.concept_projection(c, names)))
            except Exception as e:
                warnings.append(f"无法记录同步状态 {cid}: {e}")
        for c in newly_created:
            sync_store.put_entry(settings, "concept", c["id"], _group_rel(_concept_group(c)),
                                 _hash(mf.concept_projection(c, [])))

        # Drop state entries whose entity and file are both gone.
        for key in plan["_drops"]:
            settings.get("entries", {}).pop(key, None)

        sync_store.touch_last_sync(settings)
        sync_store.write_settings(settings)
        return {
            "applied": applied,
            "skipped": skipped,
            "errors": errors,
            "stale": stale,
            "warnings": warnings,
            "project": ps.load_project(),
        }


def _apply_chapter_action(entry, action, settings, layout, app, applied, warnings, done_keys):
    key = entry["key"]
    if action in ("export", "keep-app"):
        path, content_hash = _export_chapter(entry, settings, layout)
        rel = sync_store.rel_path(layout["root"], path)
        sync_store.put_entry(settings, "node", entry["entityId"], rel, content_hash)
        done_keys.add(key)
        return
    if action in ("import", "keep-md"):
        node_id, rel, content_hash = _import_chapter(entry, settings, layout, app)
        sync_store.put_entry(settings, "node", node_id, rel, content_hash)
        done_keys.add(key)
        return
    if action == "delete-md":
        md = entry.get("_md")
        if md and os.path.exists(md["path"]):
            sync_store.backup_file(md["path"], "md", md["rel"])
            os.remove(md["path"])
        sync_store.drop_entry(settings, "node", entry["entityId"])
        done_keys.add(key)
        return
    if action == "delete-app":
        if entry["entityId"]:
            _delete_node_with_backup(entry["entityId"])
            app["nodes"].pop(entry["entityId"], None)
        sync_store.drop_entry(settings, "node", entry["entityId"])
        done_keys.add(key)
        return
    if action == "acknowledge":
        if entry["entityId"] and entry.get("appHash") is not None:
            sync_store.put_entry(settings, "node", entry["entityId"], entry.get("path") or "", entry["appHash"])
        done_keys.add(key)
        return
    if action == "ignore-md":
        rel = entry.get("path")
        if rel and rel not in settings["ignoredPaths"]:
            settings["ignoredPaths"].append(rel)
        sync_store.drop_entry(settings, "node", entry["entityId"])
        done_keys.add(key)
        return
    raise ps.ProjectError(f"未知操作：{action}")


def _apply_concept_action(entry, action, settings, layout, app, replacements, remove_ids,
                          append_ids, backfilled, imported_concepts, touched_groups,
                          warnings, done_keys):
    key = entry["key"]
    group = _concept_group(entry.get("_app") or entry.get("_md") or {})
    if action in ("export", "keep-app"):
        concept = entry.get("_app")
        if not concept:
            raise ps.ProjectError("导出目标不存在")
        target = _concept_group(concept)
        lines = _serialize_concept_lines(concept, app)
        replacements[target][concept["id"]] = lines
        touched_groups.add(target)
        # A type change means the entity also has to leave the other group file.
        other = "concepts" if target == "characters" else "characters"
        remove_ids[other].add(concept["id"])
        touched_groups.add(other)
        sync_store.put_entry(settings, "concept", concept["id"], _group_rel(target),
                             entry.get("appHash") or mf.canonical_hash(mf.concept_projection(concept, [])))
        done_keys.add(key)
        return
    if action in ("import", "keep-md"):
        cid, tag_names, ent = _import_concept(entry, app)
        imported_concepts.append((cid, tag_names, ent))
        if not ent.get("id"):
            # Write the generated id back into the markdown block.
            idx = ent.get("_index")
            group = ent.get("_group") or group
            if idx is not None:
                concept = concept_store.get_concept(cid)
                replacements[group][idx] = _serialize_concept_lines(concept, app)
                backfilled[group].add(idx)
                touched_groups.add(group)
        done_keys.add(key)
        return
    if action == "delete-md":
        ent = entry.get("_md") or {}
        cid = ent.get("id") or entry.get("entityId")
        if cid:
            remove_ids[ent.get("_group") or group].add(cid)
            touched_groups.add(ent.get("_group") or group)
        sync_store.drop_entry(settings, "concept", entry.get("entityId") or cid or "")
        done_keys.add(key)
        return
    if action == "delete-app":
        cid = entry.get("entityId")
        if cid:
            fp = concept_store._find_file(cid)
            if fp and os.path.exists(fp):
                sync_store.backup_file(fp, "app", f"concepts/{os.path.basename(fp)}")
            concept_store.delete_concept(cid)
            app["concepts_by_id"].pop(cid, None)
        sync_store.drop_entry(settings, "concept", cid or "")
        done_keys.add(key)
        return
    if action == "acknowledge":
        cid = entry.get("entityId")
        if cid and entry.get("appHash") is not None:
            sync_store.put_entry(settings, "concept", cid, entry.get("path") or "", entry["appHash"])
        done_keys.add(key)
        return
    raise ps.ProjectError(f"未知操作：{action}")
