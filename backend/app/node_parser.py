"""Parse and serialize node .md files (YAML frontmatter + markdown body)."""
import re

import yaml

_FM_RE = re.compile(r"^---[ \t]*\r?\n(.*?)\r?\n---[ \t]*\r?\n(.*)$", re.DOTALL)
_BEAT_MARKER = re.compile(r"<!--\s*beat:([A-Za-z0-9_-]+)\s*-->\s*")


def split_frontmatter(raw):
    """Split raw text into (frontmatter_str, body_str)."""
    raw = raw.lstrip("﻿")
    m = _FM_RE.match(raw)
    if m:
        return m.group(1), m.group(2)
    return "", raw


def _normalize_beats(beats):
    """Ensure each beat is a dict with id/text/body/notes keys."""
    out = []
    for b in beats or []:
        if not isinstance(b, dict):
            continue
        notes = b.get("notes")
        if not isinstance(notes, list):
            notes = []
        notes = [str(n).strip() for n in notes if str(n).strip()]
        out.append({
            "id": b.get("id") or "",
            "text": b.get("text") or "",
            "body": b.get("body") or "",
            "notes": notes,
        })
    return out


def migrate_legacy_body(meta, body):
    """Move a legacy markdown body into per-beat ``body`` fields (in place).

    Returns the (possibly empty) legacy body left over. Only migrates when beats carry
    no body text yet; otherwise the file already uses the new model and is left alone.
    """
    beats = meta.get("beats", []) or []
    if not body or not beats:
        return body
    if any((b.get("body") or "").strip() for b in beats):
        return body  # already migrated

    parts = _BEAT_MARKER.split(body)
    if len(parts) > 1:
        by_id = {b.get("id"): b for b in beats}
        for i in range(1, len(parts), 2):
            beat_id = parts[i]
            seg = (parts[i + 1] if i + 1 < len(parts) else "").strip()
            if beat_id in by_id and seg:
                by_id[beat_id]["body"] = seg
        return ""  # body fully consumed into beats

    # No markers: attach the whole legacy body to the first beat so nothing is lost.
    beats[0]["body"] = ((beats[0].get("body") or "") + "\n" + body.strip()).strip()
    return ""


def parse_node(raw):
    """Return (meta_dict, body_str) from a node file's raw text."""
    fm, body = split_frontmatter(raw)
    meta = {}
    if fm.strip():
        loaded = yaml.safe_load(fm)
        if isinstance(loaded, dict):
            meta = loaded
    meta.setdefault("id", None)
    meta.setdefault("title", "")
    meta.setdefault("beats", [])
    meta.setdefault("characters", [])
    meta.setdefault("questions", [])
    meta["beats"] = _normalize_beats(meta.get("beats"))
    meta["questions"] = _normalize_questions(meta.get("questions"))
    return meta, body


def _normalize_questions(questions):
    """Ensure questions is a list of {id, text, answer} dicts."""
    out = []
    for q in questions or []:
        if isinstance(q, dict):
            out.append({
                "id": q.get("id") or "",
                "text": q.get("text") or "",
                "answer": q.get("answer") or "",
            })
        elif isinstance(q, str) and q.strip():
            out.append({"id": "", "text": q.strip(), "answer": ""})
    return out


def serialize_node(meta, body):
    """Serialize (meta_dict, body_str) back into node file text."""
    fm = yaml.safe_dump(meta, allow_unicode=True, sort_keys=False)
    return "---\n" + fm + "---\n" + body
