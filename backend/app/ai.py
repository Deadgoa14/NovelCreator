"""AI integration layer: config + OpenAI-compatible chat + task prompts.

The API key lives in a backend-local file (``backend/ai_config.json``), never
in the browser or in Git. All model calls go through :func:`chat`, which talks
to any OpenAI-compatible ``/chat/completions`` endpoint (DeepSeek, Ollama,
DashScope-compatible, Kimi, custom, ...).
"""
import json
import os
import re
from pathlib import Path

import httpx

from . import project_store as ps
from . import usage_store

CONFIG_FILE = Path(__file__).resolve().parent.parent / "ai_config.json"

DEFAULTS = {
    "baseURL": "https://api.deepseek.com/v1",
    "apiKey": "",
    "model": "deepseek-chat",
}


# ---------------------------------------------------------------- config
def get_config():
    cfg = dict(DEFAULTS)
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                for k in DEFAULTS:
                    if k in loaded:
                        cfg[k] = loaded[k]
        except Exception:
            pass
    return cfg


def set_config(data):
    cfg = dict(DEFAULTS)
    if isinstance(data, dict):
        for k in DEFAULTS:
            if k in data and data[k] is not None:
                cfg[k] = data[k]
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    return cfg


# ---------------------------------------------------------------- low-level chat
def _post(url, payload, headers):
    try:
        resp = httpx.post(url, json=payload, headers=headers, timeout=120)
    except httpx.HTTPError as e:
        raise ps.ProjectError(f"无法连接 AI 服务：{e}")
    if resp.status_code != 200:
        detail = resp.text[:500] or f"HTTP {resp.status_code}"
        raise ps.ProjectError(f"AI 服务返回错误：{detail}")
    try:
        return resp.json()
    except ValueError:
        raise ps.ProjectError("AI 返回格式无法解析")


def _chat_openai(base, model, api_key, messages, temperature, max_tokens):
    data = _post(
        base + "/chat/completions",
        {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        {"Authorization": f"Bearer {api_key}"},
    )
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise ps.ProjectError("AI 返回格式无法解析")
    usage = None
    u = data.get("usage")
    if isinstance(u, dict):
        usage = {
            "input": int(u.get("prompt_tokens") or 0),
            "output": int(u.get("completion_tokens") or 0),
        }
    return content, usage


def _chat_anthropic(base, model, api_key, messages, temperature, max_tokens):
    system_parts = [m["content"] for m in messages if m.get("role") == "system"]
    rest = [{"role": m["role"], "content": m["content"]} for m in messages if m.get("role") != "system"]
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": rest,
    }
    if system_parts:
        payload["system"] = "\n\n".join(system_parts)
    data = _post(
        base + "/v1/messages",
        payload,
        {"x-api-key": api_key, "anthropic-version": "2023-06-01"},
    )
    try:
        blocks = data["content"]
        content = "".join(b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text")
    except (KeyError, TypeError):
        raise ps.ProjectError("AI 返回格式无法解析")
    usage = None
    u = data.get("usage")
    if isinstance(u, dict):
        usage = {
            "input": int(u.get("input_tokens") or 0),
            "output": int(u.get("output_tokens") or 0),
        }
    return content, usage


def chat(messages, *, temperature=0.7, max_tokens=2048):
    cfg = get_config()
    if not (cfg.get("apiKey") or "").strip():
        raise ps.ProjectError("请先在「设置 → AI」里配置 API Key")
    base = (cfg.get("baseURL") or "").rstrip("/")
    model = cfg.get("model") or ""
    api_key = cfg.get("apiKey") or ""
    # DeepSeek's Anthropic-compatible endpoint (and other Anthropic-style
    # services) use the Messages API; everything else uses chat/completions.
    if "/anthropic" in base:
        content, usage = _chat_anthropic(base, model, api_key, messages, temperature, max_tokens)
    else:
        content, usage = _chat_openai(base, model, api_key, messages, temperature, max_tokens)
    if usage:
        usage_store.record(model, usage["input"], usage["output"])
    return content


def _unwrap_list(data):
    """If data is a dict wrapping a list under a common key, return that list."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("items", "beats", "concepts", "characters", "data", "result", "results"):
            if isinstance(data.get(key), list):
                return data[key]
    return data


def _strip_trailing_commas(s):
    """Remove commas immediately before a closing bracket/brace — a common LLM slip."""
    return re.sub(r",(\s*[}\]])", r"\1", s)


def _extract_json(text, unwrap=True):
    """Tolerantly pull a JSON array/object out of a model's free-form reply.

    ``unwrap`` controls whether a dict that wraps a list under a common key
    (``items``/``beats``/...) is reduced to that list. Disable it when the top
    level is expected to be an object (e.g. the multi-section analyze output).
    """
    if not text or not text.strip():
        raise ps.ProjectError("AI 返回为空")
    s = text.strip()
    # Strip a surrounding markdown code fence.
    if s.startswith("```"):
        s = s.lstrip("`")
        if "\n" in s:
            tag = s[: s.find("\n")].strip()
            rest = s[s.find("\n") + 1 :]
            if tag in ("", "json", "JSON", "js"):
                s = rest
        s = s.rstrip("`")
    s = s.strip()

    def maybe_unwrap(data):
        return _unwrap_list(data) if unwrap else data

    # Whole text first, then bracket extraction (array, then object). Each parse
    # is also retried with trailing commas stripped (a common LLM mistake).
    try:
        return maybe_unwrap(json.loads(s))
    except ValueError:
        pass
    try:
        return maybe_unwrap(json.loads(_strip_trailing_commas(s)))
    except ValueError:
        pass
    for open_c, close_c in (("[", "]"), ("{", "}")):
        start = s.find(open_c)
        end = s.rfind(close_c)
        if start != -1 and end > start:
            candidate = s[start : end + 1]
            try:
                return maybe_unwrap(json.loads(candidate))
            except ValueError:
                pass
            try:
                return maybe_unwrap(json.loads(_strip_trailing_commas(candidate)))
            except ValueError:
                pass
    raise ps.ProjectError("AI 返回中没有可解析的 JSON，请重试")


def _ask_json(messages, *, temperature=0.3, max_tokens=4096, unwrap=True):
    """chat() then tolerant JSON extraction, with one corrective retry on failure."""
    raw = chat(messages, temperature=temperature, max_tokens=max_tokens)
    try:
        return _extract_json(raw, unwrap=unwrap)
    except ps.ProjectError:
        retry = messages + [
            {"role": "assistant", "content": raw},
            {"role": "user", "content": "上面的输出无法解析成 JSON。请重新只输出一个纯 JSON（不要代码块、不要任何解释文字）。"},
        ]
        raw2 = chat(retry, temperature=temperature, max_tokens=max_tokens)
        return _extract_json(raw2, unwrap=unwrap)


# ---------------------------------------------------------------- task prompts
def extract_concepts(type_, text):
    """Extract structured concept candidates (character/place/item) from prose."""
    label = {"character": "人物", "place": "地点", "item": "物品", "generic": "概念"}.get(type_, "概念")
    messages = [
        {
            "role": "system",
            "content": "你是小说设定助手。从给定文本中识别出角色/概念，返回结构化 JSON。",
        },
        {
            "role": "user",
            "content": (
                f"请从下面的小说文本中识别出所有「{label}」，只返回一个 JSON 数组，"
                "每个元素是一个对象，字段为：name（名称）、aliases（别名，字符串数组，可空）、"
                "description（一句话简介）、identity（身份，可空）、personality（性格，可空）、"
                "background（背景，可空）。不要输出 JSON 以外的任何内容。\n\n文本：\n"
                + text
            ),
        },
    ]
    data = _ask_json(messages, temperature=0.3, max_tokens=4096)
    if not isinstance(data, list):
        raise ps.ProjectError("AI 返回格式错误，请重试")
    items = []
    for it in data:
        if not isinstance(it, dict) or not (it.get("name") or "").strip():
            continue
        items.append(
            {
                "name": str(it.get("name")).strip(),
                "aliases": [str(a).strip() for a in (it.get("aliases") or []) if str(a).strip()],
                "description": str(it.get("description") or "").strip(),
                "identity": str(it.get("identity") or "").strip(),
                "personality": str(it.get("personality") or "").strip(),
                "background": str(it.get("background") or "").strip(),
            }
        )
    return items


def _chunk_paragraphs(text, size):
    """Split prose into chunks by natural paragraphs.

    Each chunk ends at a paragraph boundary once its accumulated character
    count reaches ``size`` — so no paragraph is ever split mid-way, and the
    last (possibly shorter) paragraph run forms the final chunk.
    """
    paras = [p.strip() for p in text.split("\n") if p.strip()]
    chunks = []
    cur = []
    cur_len = 0
    for p in paras:
        cur.append(p)
        cur_len += len(p)
        if cur_len >= size:
            chunks.append("\n".join(cur))
            cur = []
            cur_len = 0
    if cur:
        chunks.append("\n".join(cur))
    return chunks


def summarize_beats(text, chunk_chars=1000):
    """Condense prose into beats, one per ~``chunk_chars``-sized paragraph run.

    Instead of letting the model split every paragraph into its own beat (which
    produced overly-fragmented outlines), we chunk locally at paragraph
    boundaries and ask the model for a single one-line 梗概 per chunk. ``body``
    is the chunk's original text; ``text`` is the model's summary.
    """
    size = max(1, int(chunk_chars or 0) or 1000)
    chunks = _chunk_paragraphs(text, size)
    if not chunks:
        return []
    messages = [
        {"role": "system", "content": "你是小说大纲助手，擅长把一段剧情浓缩成一句话梗概。"},
        {
            "role": "user",
            "content": (
                "下面有若干段剧情片段，用「=====」分隔。请为每一段分别写一句梗概，"
                "严格按片段顺序返回一个 JSON 数组，数组长度等于片段数量，每个元素是一个字符串"
                "（对应片段的一句话梗概，概括该段关键事件）。不要输出 JSON 以外的任何内容。\n\n片段：\n"
                + "\n=====\n".join(chunks)
            ),
        },
    ]
    data = _ask_json(messages, temperature=0.4, max_tokens=4096)
    if not isinstance(data, list):
        raise ps.ProjectError("AI 返回格式错误，请重试")
    beats = []
    for i, ch in enumerate(chunks):
        item = data[i] if i < len(data) else None
        if isinstance(item, dict):
            t = str(item.get("text") or item.get("summary") or "").strip()
        else:
            t = str(item).strip() if item is not None else ""
        if not t:
            t = ch.split("\n", 1)[0][:40]
        beats.append({"text": t, "body": ch})
    return beats


def analyze_raw(text):
    """Break a messy "raw text" (settings + prose + background + notes mixed
    together) into structured sections: title, summary, worldbuilding,
    characters, concepts, and beats."""
    messages = [
        {
            "role": "system",
            "content": "你是小说设定助手。用户会粘贴一段「生文本」，其中可能杂糅设定、正文、背景、解释。请把它拆解成结构化内容。",
        },
        {
            "role": "user",
            "content": (
                "请分析下面的生文本，返回一个 JSON 对象，字段为：\n"
                "title（暂定标题，可空字符串）\n"
                "summary（一句话故事梗概，可空字符串）\n"
                "worldbuilding（世界观/设定，数组，每项 {\"name\": 名称, \"description\": 说明}）\n"
                "characters（人物，数组，每项 {\"name\", \"aliases\": 字符串数组, \"identity\", \"personality\", \"background\", \"description\"}）\n"
                "concepts（地点/物品/其他概念，数组，每项 {\"name\", \"aliases\": 字符串数组, \"type\": place|item|generic, \"description\"}）\n"
                "beats（剧情，数组，每项 {\"text\": 一句话梗概}，不要复制原文、不要写 body 字段）\n"
                "只输出纯 JSON，不要代码块、不要任何解释文字。\n\n生文本：\n" + text
            ),
        },
    ]
    data = _ask_json(messages, temperature=0.3, max_tokens=8192, unwrap=False)
    if not isinstance(data, dict):
        raise ps.ProjectError("AI 返回格式错误，请重试")

    def _s(v):
        return str(v).strip() if v is not None else ""

    def _list(v):
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        return []

    characters = []
    for it in data.get("characters") or []:
        if not isinstance(it, dict) or not _s(it.get("name")):
            continue
        characters.append({
            "name": _s(it.get("name")),
            "aliases": _list(it.get("aliases")),
            "identity": _s(it.get("identity")),
            "personality": _s(it.get("personality")),
            "background": _s(it.get("background")),
            "description": _s(it.get("description")),
        })

    concepts = []
    for it in data.get("concepts") or []:
        if not isinstance(it, dict) or not _s(it.get("name")):
            continue
        t = _s(it.get("type"))
        if t not in ("place", "item", "generic"):
            t = "generic"
        concepts.append({
            "name": _s(it.get("name")),
            "aliases": _list(it.get("aliases")),
            "type": t,
            "description": _s(it.get("description")),
        })

    worldbuilding = []
    for it in data.get("worldbuilding") or []:
        if not isinstance(it, dict) or not _s(it.get("name")):
            continue
        worldbuilding.append({"name": _s(it.get("name")), "description": _s(it.get("description"))})

    beats = []
    for it in data.get("beats") or []:
        if not isinstance(it, dict):
            continue
        b = {"text": _s(it.get("text")), "body": _s(it.get("body"))}
        if b["text"] or b["body"]:
            beats.append(b)

    return {
        "title": _s(data.get("title")),
        "summary": _s(data.get("summary")),
        "worldbuilding": worldbuilding,
        "characters": characters,
        "concepts": concepts,
        "beats": beats,
    }


def continue_messages(title, beats, concepts, notes=None):
    """Build the chat messages for continuing the last beat's body prose."""
    context = f"章节标题：{title or '（无）'}\n"
    if beats:
        context += "\n前面的梗概与正文：\n"
        for i, b in enumerate(beats, start=1):
            context += f"{i}. 梗概：{b.get('text') or ''}\n   正文：{(b.get('body') or '').strip()}\n"
    if notes:
        context += "\n写作要点（请在续写中重点体现）：\n"
        for n in notes:
            if str(n).strip():
                context += f"- {str(n).strip()}\n"
    if concepts:
        names = "、".join(c.get("name", "") for c in concepts if c.get("name"))
        context += f"\n相关人物/概念：{names}\n"
    return [
        {
            "role": "system",
            "content": (
                "你是小说作者助手。根据给出的章节标题、前文梗概与正文，续写最后一条梗概对应的正文，"
                "保持文风与人物一致，直接输出正文，不要任何说明。"
            ),
        },
        {"role": "user", "content": context + "\n请续写最后一条梗概的正文："},
    ]


def continue_body(title, beats, concepts, notes=None):
    """Continue writing the body prose for the last beat of a node."""
    return chat(continue_messages(title, beats, concepts, notes), temperature=0.8, max_tokens=4096).strip()


def resolve_questions(title, beats, questions):
    """Answer each unresolved plot/setting question for a node."""
    questions = [q for q in (questions or []) if str(q).strip()]
    if not questions:
        return []
    context = f"章节标题：{title or '（无）'}\n"
    if beats:
        context += "已有梗概（按顺序）：\n"
        for i, b in enumerate(beats, start=1):
            context += f"{i}. {(b.get('text') or '').strip()}\n"
    qs = "\n".join(f"{i}. {q}" for i, q in enumerate(questions, start=1))
    messages = [
        {
            "role": "system",
            "content": (
                "你是小说设定/剧情顾问。用户列出了几个尚未解决的剧情或设定问题（空缺、逻辑不通、动机不明）。"
                "请针对每个问题给出一个合理的解决方案，补全空缺、理顺逻辑，保持与已有梗概一致。"
            ),
        },
        {
            "role": "user",
            "content": (
                context + "\n待解决的问题：\n" + qs
                + "\n\n请严格按问题顺序返回一个 JSON 数组，每个元素是字符串（对应问题的解决方案），不要输出其他内容。"
            ),
        },
    ]
    data = _ask_json(messages, temperature=0.7, max_tokens=4096)
    if not isinstance(data, list):
        raise ps.ProjectError("AI 返回格式错误，请重试")
    return [str(x).strip() if x is not None else "" for x in data]


def next_beat(title, summaries):
    """Generate the next beat summary (梗概) from the node's existing outline."""
    context = f"章节标题：{title or '（无）'}\n"
    context += "已写好的剧情梗概（按顺序）：\n"
    for i, s in enumerate(summaries, start=1):
        context += f"{i}. {s}\n"
    messages = [
        {"role": "system", "content": "你是小说大纲助手，擅长根据已有梗概推演下一段剧情。"},
        {
            "role": "user",
            "content": (
                context
                + "\n请根据上面的梗概，推演出「下一条」剧情梗概，只输出一句话梗概，不要输出任何其他内容。"
            ),
        },
    ]
    return chat(messages, temperature=0.8, max_tokens=512).strip()


def polish_messages(text):
    """Build the chat messages for polishing prose."""
    return [
        {"role": "system", "content": "你是小说文字编辑，擅长润色文笔。"},
        {
            "role": "user",
            "content": (
                "请润色下面这段小说正文：优化用词与句式、让表达更流畅生动，但保持原意、"
                "不改变情节与人物，直接输出润色后的正文，不要任何说明。\n\n正文：\n" + text
            ),
        },
    ]


def polish(text):
    """Polish prose while preserving meaning."""
    return chat(polish_messages(text), temperature=0.6, max_tokens=4096).strip()


def proofread_messages(text):
    """Build the chat messages for proofreading prose."""
    return [
        {"role": "system", "content": "你是小说审校，擅长找出错别字、病句与前后矛盾。"},
        {
            "role": "user",
            "content": (
                "请审校下面这段小说正文：修正错别字、语病、标点，指出明显的前后不一致之处，"
                "保持原意与文风，直接输出修正后的正文，不要任何说明。\n\n正文：\n" + text
            ),
        },
    ]


def proofread(text):
    """Proofread prose for typos, grammar, and consistency."""
    return chat(proofread_messages(text), temperature=0.3, max_tokens=4096).strip()


# ---------------------------------------------------------------- streaming
def _stream_request(cfg, messages, temperature, max_tokens):
    """Build (url, payload, headers, anthropic) for a streaming call."""
    base = (cfg.get("baseURL") or "").rstrip("/")
    model = cfg.get("model") or ""
    key = cfg.get("apiKey") or ""
    anthropic = "/anthropic" in base
    if anthropic:
        system_parts = [m["content"] for m in messages if m.get("role") == "system"]
        rest = [{"role": m["role"], "content": m["content"]} for m in messages if m.get("role") != "system"]
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": rest,
            "stream": True,
        }
        if system_parts:
            payload["system"] = "\n\n".join(system_parts)
        url = base + "/v1/messages"
        headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
    else:
        url = base + "/chat/completions"
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        headers = {"Authorization": f"Bearer {key}"}
    return url, payload, headers, anthropic


def _extract_delta(obj, anthropic):
    if anthropic:
        if isinstance(obj, dict) and obj.get("type") == "content_block_delta":
            return obj.get("delta", {}).get("text")
        return None
    try:
        return obj["choices"][0]["delta"].get("content")
    except (KeyError, IndexError, TypeError):
        return None


async def stream_response(messages, *, temperature=0.7, max_tokens=2048):
    """Open a streaming chat request and return an async generator of text chunks.

    Connection and HTTP status are checked eagerly here so configuration and
    auth errors surface as a normal HTTP error (before streaming begins).
    """
    cfg = get_config()
    if not (cfg.get("apiKey") or "").strip():
        raise ps.ProjectError("请先在「设置 → AI」里配置 API Key")
    url, payload, headers, anthropic = _stream_request(cfg, messages, temperature, max_tokens)
    client = httpx.AsyncClient(timeout=120)
    try:
        resp = await client.send(client.build_request("POST", url, json=payload, headers=headers), stream=True)
    except httpx.HTTPError as e:
        await client.aclose()
        raise ps.ProjectError(f"无法连接 AI 服务：{e}")
    if resp.status_code != 200:
        body = (await resp.aread()).decode("utf-8", "ignore")[:500]
        await client.aclose()
        raise ps.ProjectError(f"AI 服务返回错误：{body}")

    model = cfg.get("model") or ""
    input_tokens = None
    output_tokens = None

    async def gen():
        nonlocal input_tokens, output_tokens
        try:
            async for line in resp.aiter_lines():
                if not line or line.startswith(":"):
                    continue
                if line.startswith("data: "):
                    line = line[6:]
                if line.strip() == "[DONE]":
                    break
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                if anthropic:
                    if obj.get("type") == "message_start":
                        u = (obj.get("message") or {}).get("usage") or {}
                        if "input_tokens" in u:
                            input_tokens = u["input_tokens"]
                    elif obj.get("type") == "message_delta":
                        u = obj.get("usage") or {}
                        if "output_tokens" in u:
                            output_tokens = u["output_tokens"]
                else:
                    u = obj.get("usage")
                    if isinstance(u, dict):
                        if "prompt_tokens" in u:
                            input_tokens = u["prompt_tokens"]
                        if "completion_tokens" in u:
                            output_tokens = u["completion_tokens"]
                delta = _extract_delta(obj, anthropic)
                if delta:
                    yield delta
        finally:
            await resp.aclose()
            await client.aclose()
        if input_tokens is not None or output_tokens is not None:
            usage_store.record(model, input_tokens or 0, output_tokens or 0)

    return gen()
