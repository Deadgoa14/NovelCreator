"""Obsidian markdown contract for the chapter/people/concept mirror.

Pure parse/serialize helpers: no project state, no file IO. The layout is:

    章节目录/<title>.md   front-matter + #章 / ##梗概 / ###要点 / ###？问题
    人物.md                ### 人物 / #### 名字 / ##### 字段
    概念.md                ### 概念 / #### 名字 / ##### 字段
"""
import hashlib
import json
import re

import yaml

from .node_parser import split_frontmatter

NC = "nc"
MANAGED_FM_KEYS = {"nc", "id", "title", "order", "volume", "volumeId"}
TYPE_LABELS = {"place": "地点", "item": "物品", "generic": "通用"}
TYPE_BY_LABEL = {v: k for k, v in TYPE_LABELS.items()}

_HEADING_RE = re.compile(r"^(#{1,6})(?:[ \t]+(.*))?$")
_CONCEPT_ID_RE = re.compile(r"<!--\s*nc:([A-Za-z0-9_-]+)\s*-->\s*$")
_CHAPTER_PREFIX_RE = re.compile(
    r"^第\s*[0-9一二三四五六七八九十百千万零〇两]+\s*[章回节卷部篇集](?:\s+|[：:、.．\-—]\s*|$)"
)
_FILE_PREFIX_RE = re.compile(r"^\d{4}\s+")


class MdFormatError(Exception):
    """Raised when a managed markdown file cannot be parsed safely."""


# ---------------------------------------------------------------- helpers
def normalize_block(text):
    """One non-empty line == one paragraph; trim and drop blank lines."""
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.strip() for line in text.split("\n") if line.strip())


def paragraphs(text):
    text = normalize_block(text)
    return text.split("\n") if text else []


def escape_line(line):
    """Escape a prose/value line that would otherwise read as markdown syntax."""
    if line.startswith("\\"):
        return "\\" + line
    if line.startswith("#") or line.startswith(">") or line.startswith("---"):
        return "\\" + line
    return line


def unescape_line(line):
    if line.startswith("\\\\"):
        return line[1:]
    if line.startswith("\\#") or line.startswith("\\>") or line.startswith("\\---"):
        return line[1:]
    return line


def canonical_hash(obj):
    raw = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _as_int(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _as_str(value):
    if value is None:
        return ""
    return str(value)


def _split_list_value(lines):
    """Aliases/tags accept one per line, or 、/，/, separated on one line."""
    out = []
    for line in lines:
        for part in re.split(r"[、,，]", line):
            part = part.strip()
            if part:
                out.append(part)
    return out


def _strip_chapter_prefix(title):
    return _CHAPTER_PREFIX_RE.sub("", title or "").strip()


def _dump_frontmatter(fm):
    return yaml.safe_dump(fm, allow_unicode=True, sort_keys=False)


def _heading_lines(level, text):
    """Render a heading plus ``> `` continuations for multi-line text."""
    lines = normalize_block(text).split("\n") if normalize_block(text) else [""]
    first = lines[0]
    out = [f"{'#' * level} {first}".rstrip()]
    for extra in lines[1:]:
        out.append("> " + extra if extra else ">")
    return out


def _value_lines(text):
    out = []
    for p in paragraphs(text):
        out.append(escape_line(p))
    return out


# ---------------------------------------------------------------- chapter
def node_projection(meta, volume):
    beats = []
    for b in meta.get("beats") or []:
        if not isinstance(b, dict):
            continue
        beats.append({
            "text": normalize_block(b.get("text")),
            "body": normalize_block(b.get("body")),
            "notes": [normalize_block(n) for n in (b.get("notes") or []) if normalize_block(n)],
        })
    questions = []
    for q in meta.get("questions") or []:
        if isinstance(q, dict):
            questions.append({
                "text": normalize_block(q.get("text")),
                "answer": normalize_block(q.get("answer")),
            })
    return {
        "title": (meta.get("title") or "").strip(),
        "order": _as_int(meta.get("order")) or 0,
        "volumeId": (volume or {}).get("id", ""),
        "volumeName": (volume or {}).get("name", ""),
        "beats": beats,
        "questions": questions,
    }


def serialize_chapter(meta, volume=None, existing_frontmatter=None):
    """Render one chapter as Obsidian-friendly markdown."""
    fm = {}
    # Preserve Obsidian's own properties, then overwrite our managed keys.
    if isinstance(existing_frontmatter, dict):
        fm.update({k: v for k, v in existing_frontmatter.items() if k not in MANAGED_FM_KEYS})
    fm[NC] = "chapter"
    fm["id"] = meta.get("id") or ""
    fm["title"] = meta.get("title") or ""
    fm["order"] = _as_int(meta.get("order"))
    if volume:
        fm["volume"] = volume.get("name") or ""
        fm["volumeId"] = volume.get("id") or ""

    lines = ["# " + ((meta.get("title") or "未命名节点").strip() or "未命名节点"), ""]
    for beat in meta.get("beats") or []:
        if not isinstance(beat, dict):
            continue
        text = normalize_block(beat.get("text")) or "（无梗概）"
        lines.extend(_heading_lines(2, text))
        body = _value_lines(beat.get("body"))
        if body:
            lines.append("")
            for i, p in enumerate(body):
                if i:
                    lines.append("")
                lines.append(p)
        for note in beat.get("notes") or []:
            note = normalize_block(note)
            if not note:
                continue
            lines.append("")
            if note.lstrip().startswith(("？", "?")):
                lines.extend(_heading_lines(3, "\\" + note))
            else:
                lines.extend(_heading_lines(3, note))
        lines.append("")

    if meta.get("questions"):
        for q in meta.get("questions") or []:
            if not isinstance(q, dict):
                continue
            text = normalize_block(q.get("text"))
            if not text:
                continue
            text = text.lstrip("？?").strip()
            lines.extend(_heading_lines(3, "？" + text))
            answer = _value_lines(q.get("answer"))
            if answer:
                lines.append("")
                for i, p in enumerate(answer):
                    if i:
                        lines.append("")
                    lines.append(p)
            lines.append("")

    body = "\n".join(lines).rstrip() + "\n"
    return "---\n" + _dump_frontmatter(fm) + "---\n\n" + body


def parse_chapter(raw, fallback_title=""):
    """Parse a chapter file into meta/projection fields + warnings."""
    fallback_title = _FILE_PREFIX_RE.sub("", fallback_title or "")
    fm, body = split_frontmatter(raw)
    warnings = []
    data = {}
    if fm.strip():
        try:
            loaded = yaml.safe_load(fm)
        except Exception as e:
            raise MdFormatError(f"YAML 解析失败：{e}")
        if loaded is not None and not isinstance(loaded, dict):
            raise MdFormatError("front-matter 不是键值对")
        data = loaded or {}

    title = ""
    heading_title = ""
    beats = []
    questions = []
    pending_notes = []
    orphan_lines = []
    cur_beat = None
    cur_question = None
    cur_note_index = None  # index into cur_beat.notes / pending_notes
    mode = "none"
    heading_cont = False  # True while a heading may still take `> ` continuations

    def add_note(text):
        nonlocal cur_note_index
        if cur_beat is not None:
            cur_beat["notes"].append(text)
            cur_note_index = ("beat", len(cur_beat["notes"]) - 1)
        else:
            pending_notes.append(text)
            cur_note_index = ("pending", len(pending_notes) - 1)

    def append_note_line(text):
        if not cur_note_index:
            add_note(text)
            return
        kind, idx = cur_note_index
        target = cur_beat["notes"] if kind == "beat" else pending_notes
        if text:
            target[idx] = (target[idx] + "\n" + text).strip()
        cur_note_index = (kind, idx)

    for raw_line in body.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw_line.rstrip()
        stripped = line.strip()
        m = _HEADING_RE.match(stripped)
        if m:
            level = len(m.group(1))
            content = (m.group(2) or "").strip()
            heading_cont = True
            cur_note_index = None
            if level == 1:
                if not heading_title:
                    heading_title = content
                else:
                    warnings.append("章节里出现了多个一级标题，只采用第一个")
                heading_cont = False
                mode = "none"
                cur_beat = None
                cur_question = None
            elif level == 2:
                cur_beat = {"text": content, "body": "", "notes": []}
                beats.append(cur_beat)
                cur_question = None
                mode = "beat"
            elif level == 3:
                is_escaped_note = content.startswith("\\？") or content.startswith("\\?")
                is_question = (not is_escaped_note) and content.startswith(("？", "?"))
                if is_escaped_note:
                    add_note(content[1:])
                    mode = "note"
                elif is_question:
                    cur_question = {"text": content.lstrip("？?").strip(), "answer": ""}
                    questions.append(cur_question)
                    mode = "question"
                else:
                    add_note(content)
                    mode = "note"
            else:
                # #### and deeper are not part of the contract; keep as prose.
                heading_cont = False
                target = cur_question if mode == "question" else None
                if target is not None:
                    target["answer"] = (target["answer"] + "\n" + stripped).strip()
                elif mode == "beat" and cur_beat is not None:
                    cur_beat["body"] = (cur_beat["body"] + "\n" + stripped).strip()
                elif mode == "note":
                    append_note_line(stripped)
                else:
                    orphan_lines.append(stripped)
            continue

        if not stripped:
            heading_cont = False
            continue

        # Multi-line heading text: `> ...` directly below a heading.
        if heading_cont and stripped.startswith(">"):
            extra = stripped[1:].lstrip()
            if mode == "beat" and cur_beat is not None:
                cur_beat["text"] = (cur_beat["text"] + "\n" + extra).strip()
            elif mode == "question" and cur_question is not None:
                cur_question["text"] = (cur_question["text"] + "\n" + extra).strip()
            elif mode == "note":
                append_note_line(extra)
            continue
        heading_cont = False

        line = unescape_line(stripped)
        if mode == "question" and cur_question is not None:
            cur_question["answer"] = (cur_question["answer"] + "\n" + line).strip()
        elif mode == "beat" and cur_beat is not None:
            cur_beat["body"] = (cur_beat["body"] + "\n" + line).strip()
        elif mode == "note":
            append_note_line(line)
        else:
            orphan_lines.append(line)

    # Text before the first beat: keep it instead of dropping it.
    if orphan_lines:
        if not beats:
            beats.append({"text": "", "body": "", "notes": []})
            cur_beat = beats[0]
        beats[0]["body"] = ((beats[0].get("body") or "") + "\n" + "\n".join(orphan_lines)).strip()
        warnings.append("第一条梗概之前的正文已并入第一条梗概的正文")

    if pending_notes:
        if not beats:
            beats.append({"text": "", "body": "", "notes": []})
        beats[0]["notes"] = list(pending_notes) + list(beats[0].get("notes") or [])

    fm_title = (data.get("title") or "").strip()
    if heading_title:
        stripped = _strip_chapter_prefix(heading_title)
        # Only strip a hand-written 第N章 prefix when it agrees with the stored
        # title; otherwise the title itself may legitimately start with 第一章.
        title = stripped if (not fm_title or stripped == fm_title) else heading_title
    else:
        title = fm_title or fallback_title or "未命名节点"

    for b in beats:
        b["text"] = normalize_block(b.get("text"))
        if b["text"] == "（无梗概）":
            b["text"] = ""
        b["body"] = normalize_block(b.get("body"))
        b["notes"] = [normalize_block(n) for n in b.get("notes") or [] if normalize_block(n)]

    meta = {
        "id": _as_str(data.get("id")).strip(),
        "title": title,
        "order": _as_int(data.get("order")),
        "volume": _as_str(data.get("volume")).strip(),
        "volumeId": _as_str(data.get("volumeId")).strip(),
        "beats": beats,
        "questions": questions,
        "frontmatter": data,
        "warnings": warnings,
    }
    return meta


def chapter_projection(parsed):
    return node_projection(parsed, {"id": parsed.get("volumeId", ""), "name": parsed.get("volume", "")})


# ---------------------------------------------------------------- people / concepts
def concept_projection(concept, tag_names=None):
    return {
        "type": concept.get("type") or "generic",
        "name": (concept.get("name") or "").strip(),
        "aliases": list(concept.get("aliases") or []),
        "identity": normalize_block(concept.get("identity")),
        "personality": normalize_block(concept.get("personality")),
        "background": normalize_block(concept.get("background")),
        "category": (concept.get("category") or "").strip(),
        "description": normalize_block(concept.get("description")),
        "tagNames": sorted(tag_names or []),
    }


CONCEPT_FIELD_KEYS = {
    "别名": "aliases",
    "类型": "type_label",
    "身份": "identity",
    "性格": "personality",
    "背景": "background",
    "类": "category",
    "描述": "description",
    "标签": "tags",
}
LIST_FIELDS = {"aliases", "tags"}


def _serialize_concept_block(c, tag_names):
    lines = [f"#### {(c.get('name') or '未命名').strip()} <!-- nc:{c.get('id') or ''} -->", ""]
    aliases = [a for a in (c.get("aliases") or []) if str(a).strip()]
    if aliases:
        lines.append("##### 别名")
        lines.extend(escape_line(str(a).strip()) for a in aliases)
        lines.append("")
    if c.get("type") != "character":
        lines.append("##### 类型")
        lines.append(TYPE_LABELS.get(c.get("type"), "通用"))
        lines.append("")
    else:
        if (c.get("identity") or "").strip():
            lines.append("##### 身份")
            lines.extend(_value_lines(c.get("identity")))
            lines.append("")
        if (c.get("personality") or "").strip():
            lines.append("##### 性格")
            lines.extend(_value_lines(c.get("personality")))
            lines.append("")
        if (c.get("background") or "").strip():
            lines.append("##### 背景")
            lines.extend(_value_lines(c.get("background")))
            lines.append("")
    if (c.get("category") or "").strip():
        lines.append("##### 类")
        lines.append(escape_line(str(c.get("category")).strip()))
        lines.append("")
    if (c.get("description") or "").strip():
        lines.append("##### 描述")
        lines.extend(_value_lines(c.get("description")))
        lines.append("")
    tags = [t for t in (tag_names or []) if str(t).strip()]
    if tags:
        lines.append("##### 标签")
        lines.extend(escape_line(str(t).strip()) for t in tags)
        lines.append("")
    return lines


def serialize_people(concepts, tag_names_by_id, group="人物", existing_frontmatter=None):
    fm = {}
    if isinstance(existing_frontmatter, dict):
        fm.update(existing_frontmatter)
    fm[NC] = "characters" if group == "人物" else "concepts"
    lines = [f"### {group}", ""]
    for c in concepts:
        lines.extend(_serialize_concept_block(c, tag_names_by_id.get(c.get("id"), [])))
    body = "\n".join(lines).rstrip() + "\n"
    return "---\n" + _dump_frontmatter(fm) + "---\n\n" + body


def parse_people(raw, kind="characters"):
    """Parse 人物.md/概念.md. ``kind`` decides the default concept type."""
    fm, body = split_frontmatter(raw)
    try:
        loaded = yaml.safe_load(fm) if fm.strip() else {}
    except Exception as e:
        raise MdFormatError(f"YAML 解析失败：{e}")
    if loaded is not None and not isinstance(loaded, dict):
        raise MdFormatError("front-matter 不是键值对")

    entities = []
    cur = None
    field = None
    warnings = []
    block_lines = []
    preamble = []

    def flush():
        if cur is not None and (cur.get("name") or "").strip():
            for key in ("aliases", "identity", "personality", "background", "category", "description"):
                if key == "aliases":
                    cur[key] = _split_list_value(cur.get("_raw", {}).get("aliases", []))
                elif key == "category":
                    cur[key] = "\n".join(cur.get("_raw", {}).get("category", [])).strip()
                elif key in ("identity", "personality", "background", "description"):
                    cur[key] = "\n".join(cur.get("_raw", {}).get(key, [])).strip()
            raw_tags = cur.get("_raw", {}).get("tags", [])
            cur["tags"] = _split_list_value(raw_tags)
            type_label = "\n".join(cur.get("_raw", {}).get("type_label", [])).strip()
            cur.pop("_raw", None)
            cur["raw"] = "\n".join(block_lines).strip()
            if kind == "characters":
                cur["type"] = "character"
            else:
                cur["type"] = TYPE_BY_LABEL.get(type_label, "generic")
            entities.append(cur)

    for raw_line in body.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        stripped = raw_line.strip()
        m = _HEADING_RE.match(stripped)
        if m and len(m.group(1)) == 4:
            flush()
            block_lines = [raw_line.rstrip()]
            content = (m.group(2) or "").strip()
            cid = ""
            cm = _CONCEPT_ID_RE.search(content)
            if cm:
                cid = cm.group(1)
                content = content[: cm.start()].strip()
            cur = {"id": cid, "name": content, "_raw": {}}
            field = None
            continue
        if cur is not None:
            block_lines.append(raw_line.rstrip())
        elif stripped:
            preamble.append(raw_line.rstrip())
        if not stripped:
            continue
        if m and len(m.group(1)) == 3:
            # Group heading (人物 / 概念); content belongs to no entity.
            field = None
            continue
        if m and len(m.group(1)) == 5:
            label = (m.group(2) or "").strip()
            field = CONCEPT_FIELD_KEYS.get(label)
            if field is None:
                warnings.append(f"未知字段「{label}」已忽略")
            continue
        if m:
            continue
        if cur is None or field is None:
            continue
        cur["_raw"].setdefault(field, []).append(unescape_line(stripped))

    flush()
    return {
        "frontmatter": loaded or {},
        "entities": entities,
        "warnings": warnings,
        "preamble": "\n".join(preamble).strip(),
    }
