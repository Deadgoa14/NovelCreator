"""FastAPI routes for the novel studio backend."""
import subprocess
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import (
    ai,
    board_store,
    concept_store,
    export as export_mod,
    node_store,
    project_store as ps,
    recent_store,
    rename as rename_mod,
    storyline_store,
    usage_store,
    volume_store,
)
from . import shutdown as sd

router = APIRouter()


# ---------------------------------------------------------------- request models
class CreateProjectReq(BaseModel):
    path: str
    name: str = ""


class OpenProjectReq(BaseModel):
    path: str


class UpdateNodeReq(BaseModel):
    title: Optional[str] = None
    beats: Optional[List[Any]] = None
    characters: Optional[List[str]] = None
    order: Optional[int] = None


class ReorderItemsReq(BaseModel):
    items: List[dict] = Field(default_factory=list)


class BodyReq(BaseModel):
    body: str


class ConceptReq(BaseModel):
    id: Optional[str] = None
    type: str = "generic"
    name: str = ""
    aliases: List[str] = Field(default_factory=list)
    description: str = ""
    color: str = "#cccccc"
    personality: str = ""
    background: str = ""
    identity: str = ""


class PositionReq(BaseModel):
    x: float
    y: float


class RenameReq(BaseModel):
    oldTerm: str
    newTerm: str
    apply: bool = False


class StorylineReq(BaseModel):
    id: Optional[str] = None
    name: str = ""
    color: str = "#4caf50"
    nodes: List[str] = Field(default_factory=list)
    type: str = "single"
    edges: List[Any] = Field(default_factory=list)
    start: Optional[str] = None


class VolumeReq(BaseModel):
    name: Optional[str] = None
    intro: Optional[str] = None
    body: Optional[str] = None


class RelationsReq(BaseModel):
    relations: List[Any] = Field(default_factory=list)


class ExportReq(BaseModel):
    storylineId: Optional[str] = None
    nodeId: Optional[str] = None
    format: str = "txt"
    indentParagraph: bool = False
    paragraphGap: int = 0
    chapterHeadBlank: int = 0
    chapterTailBlank: int = 0
    chapterNumberingPerVolume: bool = False


class ExportSettingsReq(BaseModel):
    indentParagraph: bool = True
    paragraphGap: int = 0
    chapterHeadBlank: int = 0
    chapterTailBlank: int = 0


class AiConfigReq(BaseModel):
    baseURL: str = ""
    apiKey: str = ""
    model: str = ""


class AiTextReq(BaseModel):
    text: str
    type: str = "character"
    chunkChars: int = 1000


class AiContinueReq(BaseModel):
    nodeId: str
    beatIndex: int = 0


class AiBeatReq(BaseModel):
    nodeId: str


class RecentRemoveReq(BaseModel):
    path: str


def _http(err):
    return HTTPException(status_code=400, detail=str(err))


def _pick_directory():
    """Open a native Windows folder picker; return the chosen path ('' if cancelled)."""
    # Prefer tkinter (ships with python.org on Windows); fall back to PowerShell.
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        path = filedialog.askdirectory(title="选择文件夹")
        root.destroy()
        return path or ""
    except Exception:
        pass
    try:
        script = (
            "Add-Type -AssemblyName System.Windows.Forms;"
            "$f = New-Object System.Windows.Forms.FolderBrowserDialog;"
            "$null = $f.ShowDialog();"
            "Write-Output $f.SelectedPath"
        )
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command", script],
            capture_output=True,
            text=True,
            timeout=120,
        )
        return (out.stdout or "").strip()
    except Exception as e:
        raise ps.ProjectError(f"无法打开文件夹选择窗口：{e}")


# ---------------------------------------------------------------- projects
@router.post("/projects/create")
def create_project(req: CreateProjectReq):
    try:
        return ps.create_project(req.path, req.name)
    except ps.ProjectError as e:
        raise _http(e)


@router.post("/projects/open")
def open_project(req: OpenProjectReq):
    try:
        return ps.open_project(req.path)
    except ps.ProjectError as e:
        raise _http(e)


@router.get("/project")
def get_project():
    try:
        return ps.load_project()
    except ps.ProjectError as e:
        raise _http(e)


@router.get("/projects/recent")
def get_recent():
    return recent_store.list_recent()


@router.post("/projects/recent/remove")
def remove_recent(req: RecentRemoveReq):
    return recent_store.remove(req.path)


@router.post("/picker/dir")
def pick_directory():
    return {"path": _pick_directory()}


# ---------------------------------------------------------------- nodes
@router.get("/nodes")
def list_nodes():
    return node_store.list_nodes()


@router.post("/nodes")
def create_node():
    return node_store.create_node()


@router.get("/nodes/{node_id}")
def get_node(node_id: str):
    try:
        return node_store.get_node(node_id)
    except ps.ProjectError as e:
        raise _http(e)


@router.put("/nodes/{node_id}")
def update_node(node_id: str, req: UpdateNodeReq):
    try:
        return node_store.update_node(node_id, req.model_dump(exclude_none=True))
    except ps.ProjectError as e:
        raise _http(e)


@router.put("/nodes/{node_id}/body")
def save_body(node_id: str, req: BodyReq):
    try:
        return node_store.save_body(node_id, req.body)
    except ps.ProjectError as e:
        raise _http(e)


@router.delete("/nodes/{node_id}")
def delete_node(node_id: str):
    try:
        node_store.delete_node(node_id)
        return {"ok": True}
    except ps.ProjectError as e:
        raise _http(e)


# ---------------------------------------------------------------- volumes
@router.get("/volumes")
def list_volumes():
    return volume_store.list_volumes()


@router.post("/volumes")
def create_volume(req: VolumeReq):
    return volume_store.create_volume(req.name or "")


@router.put("/volumes/{volume_id}")
def update_volume(volume_id: str, req: VolumeReq):
    try:
        return volume_store.update_volume(volume_id, req.model_dump(exclude_none=True))
    except ps.ProjectError as e:
        raise _http(e)


@router.delete("/volumes/{volume_id}")
def delete_volume(volume_id: str):
    try:
        volume_store.delete_volume(volume_id)
        return {"ok": True}
    except ps.ProjectError as e:
        raise _http(e)


# ---------------------------------------------------------------- ordering
@router.post("/items/reorder")
def reorder_items(req: ReorderItemsReq):
    try:
        return node_store.reorder_items(req.items)
    except ps.ProjectError as e:
        raise _http(e)


# ---------------------------------------------------------------- concepts
@router.get("/concepts")
def get_concepts():
    return {"concepts": concept_store.list_concepts(), "relations": concept_store.read_relations()}


@router.post("/concepts")
def create_concept(req: ConceptReq):
    concept = req.model_dump(exclude_none=True)
    return concept_store.create_concept(concept)


@router.put("/concepts/{concept_id}")
def update_concept(concept_id: str, req: ConceptReq):
    try:
        concept = req.model_dump(exclude_none=True)
        return concept_store.update_concept(concept_id, concept)
    except ps.ProjectError as e:
        raise _http(e)


@router.delete("/concepts/{concept_id}")
def delete_concept(concept_id: str):
    try:
        concept_store.delete_concept(concept_id)
        return {"ok": True}
    except ps.ProjectError as e:
        raise _http(e)


@router.post("/concepts/{concept_id}/rename")
def rename_concept(concept_id: str, req: RenameReq):
    try:
        concept = concept_store.get_concept(concept_id)
    except ps.ProjectError as e:
        raise _http(e)
    result = rename_mod.rename_term(concept, req.oldTerm, req.newTerm, req.apply)
    if req.apply:
        if concept.get("name") == req.oldTerm:
            concept["name"] = req.newTerm
        else:
            aliases = concept.get("aliases") or []
            concept["aliases"] = [req.newTerm if a == req.oldTerm else a for a in aliases]
        concept_store.update_concept(concept_id, concept)
    return result


# ---------------------------------------------------------------- storylines
@router.get("/storylines")
def get_storylines():
    return {"storylines": storyline_store.list_storylines()}


@router.post("/storylines")
def create_storyline(req: StorylineReq):
    return storyline_store.create_storyline(req.model_dump())


@router.put("/storylines/{line_id}")
def update_storyline(line_id: str, req: StorylineReq):
    try:
        return storyline_store.update_storyline(line_id, req.model_dump())
    except ps.ProjectError as e:
        raise _http(e)


@router.delete("/storylines/{line_id}")
def delete_storyline(line_id: str):
    try:
        storyline_store.delete_storyline(line_id)
        return {"ok": True}
    except ps.ProjectError as e:
        raise _http(e)


# ---------------------------------------------------------------- relations
@router.put("/relations")
def save_relations(req: RelationsReq):
    concept_store.write_relations(req.relations)
    return {"ok": True}


# ---------------------------------------------------------------- board layout
@router.put("/board/node/{node_id}/position")
def set_node_position(node_id: str, req: PositionReq):
    return board_store.set_node_position(node_id, req.x, req.y)


@router.put("/board/start/{storyline_id}/position")
def set_start_position(storyline_id: str, req: PositionReq):
    return board_store.set_start_position(storyline_id, req.x, req.y)


@router.put("/board/character/{concept_id}/position")
def set_character_position(concept_id: str, req: PositionReq):
    return board_store.set_character_position(concept_id, req.x, req.y)


# ---------------------------------------------------------------- export
@router.post("/export")
def export(req: ExportReq):
    opts = {
        "indentParagraph": req.indentParagraph,
        "paragraphGap": req.paragraphGap,
        "chapterHeadBlank": req.chapterHeadBlank,
        "chapterTailBlank": req.chapterTailBlank,
        "chapterNumberingPerVolume": req.chapterNumberingPerVolume,
    }
    if req.nodeId:
        content, char_count = export_mod.export_node(req.nodeId, opts)
        try:
            n = node_store.get_node(req.nodeId)
            title = (n.get("meta") or {}).get("title") or "单章"
        except ps.ProjectError:
            title = "单章"
        return {"filename": f"{title}.txt", "content": content, "charCount": char_count}
    sl = next((s for s in storyline_store.list_storylines() if s["id"] == req.storylineId), None)
    if not sl:
        raise _http("故事线不存在")
    content, char_count = export_mod.export_storyline(sl, opts)
    name = sl.get("name") or "导出"
    return {"filename": f"{name}.txt", "content": content, "charCount": char_count}


# ---------------------------------------------------------------- export settings
@router.get("/export-settings")
def get_export_settings():
    return ps.read_export_settings()


@router.put("/export-settings")
def save_export_settings(req: ExportSettingsReq):
    return ps.write_export_settings(req.model_dump())


# ---------------------------------------------------------------- ai
@router.get("/ai/config")
def get_ai_config():
    return ai.get_config()


@router.put("/ai/config")
def save_ai_config(req: AiConfigReq):
    return ai.set_config(req.model_dump())


@router.post("/ai/test")
def ai_test():
    try:
        ai.chat([{"role": "user", "content": "只回复两个字：OK"}], max_tokens=16)
        return {"ok": True}
    except ps.ProjectError as e:
        raise _http(e)


@router.post("/ai/extract")
def ai_extract(req: AiTextReq):
    try:
        return {"items": ai.extract_concepts(req.type, req.text)}
    except ps.ProjectError as e:
        raise _http(e)


@router.post("/ai/summarize")
def ai_summarize(req: AiTextReq):
    try:
        return {"beats": ai.summarize_beats(req.text, req.chunkChars)}
    except ps.ProjectError as e:
        raise _http(e)


@router.post("/ai/analyze-raw")
def ai_analyze_raw(req: AiTextReq):
    try:
        return ai.analyze_raw(req.text)
    except ps.ProjectError as e:
        raise _http(e)


@router.post("/ai/continue")
def ai_continue(req: AiContinueReq):
    try:
        n = node_store.get_node(req.nodeId)
        meta = n.get("meta") or {}
        beats = meta.get("beats") or []
        beats_up_to = beats[: req.beatIndex + 1]
        concepts = concept_store.list_concepts()
        related = [c for c in concepts if c.get("type") == "character"]
        return {"text": ai.continue_body(meta.get("title", ""), beats_up_to, related)}
    except ps.ProjectError as e:
        raise _http(e)


@router.post("/ai/beat")
def ai_beat(req: AiBeatReq):
    try:
        n = node_store.get_node(req.nodeId)
        meta = n.get("meta") or {}
        beats = meta.get("beats") or []
        summaries = [b.get("text") or "" for b in beats if isinstance(b, dict)]
        return {"text": ai.next_beat(meta.get("title", ""), summaries)}
    except ps.ProjectError as e:
        raise _http(e)


@router.post("/ai/polish")
def ai_polish(req: AiTextReq):
    try:
        return {"text": ai.polish(req.text)}
    except ps.ProjectError as e:
        raise _http(e)


@router.post("/ai/proofread")
def ai_proofread(req: AiTextReq):
    try:
        return {"text": ai.proofread(req.text)}
    except ps.ProjectError as e:
        raise _http(e)


@router.post("/ai/stream/continue")
async def ai_stream_continue(req: AiContinueReq):
    try:
        n = node_store.get_node(req.nodeId)
        meta = n.get("meta") or {}
        beats = meta.get("beats") or []
        beats_up_to = beats[: req.beatIndex + 1]
        concepts = [c for c in concept_store.list_concepts() if c.get("type") == "character"]
        messages = ai.continue_messages(meta.get("title", ""), beats_up_to, concepts)
        gen = await ai.stream_response(messages, temperature=0.8, max_tokens=4096)
    except ps.ProjectError as e:
        raise _http(e)
    return StreamingResponse(gen, media_type="text/plain; charset=utf-8")


@router.post("/ai/stream/polish")
async def ai_stream_polish(req: AiTextReq):
    try:
        gen = await ai.stream_response(ai.polish_messages(req.text), temperature=0.6, max_tokens=4096)
    except ps.ProjectError as e:
        raise _http(e)
    return StreamingResponse(gen, media_type="text/plain; charset=utf-8")


@router.post("/ai/stream/proofread")
async def ai_stream_proofread(req: AiTextReq):
    try:
        gen = await ai.stream_response(ai.proofread_messages(req.text), temperature=0.3, max_tokens=4096)
    except ps.ProjectError as e:
        raise _http(e)
    return StreamingResponse(gen, media_type="text/plain; charset=utf-8")


@router.get("/ai/usage")
def get_ai_usage():
    return usage_store.snapshot()


@router.post("/ai/usage/reset")
def reset_ai_usage():
    usage_store.reset()
    return usage_store.snapshot()


# ---------------------------------------------------------------- shutdown
@router.post("/shutdown")
def shutdown_server():
    sd.request_shutdown()
    return {"ok": True}


@router.post("/heartbeat")
def heartbeat():
    sd.heartbeat()
    return {"ok": True}
