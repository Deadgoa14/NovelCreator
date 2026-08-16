"""Global (cross-project) AI usage statistics: requests, tokens, estimated cost."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

USAGE_FILE = Path(__file__).resolve().parent.parent / "ai_usage.json"

# Estimated price per 1M tokens (人民币) — input, output. Approximate and
# subject to change; unknown models fall back to DEFAULT_PRICE.
PRICING = {
    "deepseek-chat": (2.0, 8.0),
    "deepseek-reasoner": (4.0, 16.0),
    "qwen-plus": (0.8, 2.0),
    "qwen-turbo": (0.3, 0.6),
    "moonshot-v1-8k": (12.0, 12.0),
    "glm-4-flash": (0.0, 0.0),
    # Rough estimates (人民币 / 1M tokens), subject to change.
    "gpt-4o": (18.0, 72.0),
    "claude-opus-4-5": (108.0, 540.0),
}
DEFAULT_PRICE = (2.0, 8.0)


def _today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _default():
    return {
        "totalRequests": 0,
        "totalInput": 0,
        "totalOutput": 0,
        "totalCost": 0.0,
        "byModel": {},
        "daily": {},
    }


def load():
    data = _default()
    if os.path.exists(USAGE_FILE):
        try:
            with open(USAGE_FILE, encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                data.update(loaded)
                data.setdefault("byModel", {})
                data.setdefault("daily", {})
        except Exception:
            pass
    return data


def _save(data):
    with open(USAGE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _cost(model, input_tokens, output_tokens):
    price_in, price_out = PRICING.get(model, DEFAULT_PRICE)
    return input_tokens / 1e6 * price_in + output_tokens / 1e6 * price_out


def record(model, input_tokens, output_tokens):
    data = load()
    cost = _cost(model, input_tokens, output_tokens)

    data["totalRequests"] += 1
    data["totalInput"] += input_tokens
    data["totalOutput"] += output_tokens
    data["totalCost"] = round(data["totalCost"] + cost, 6)

    m = data["byModel"].setdefault(model, {"requests": 0, "input": 0, "output": 0, "cost": 0.0})
    m["requests"] += 1
    m["input"] += input_tokens
    m["output"] += output_tokens
    m["cost"] = round(m["cost"] + cost, 6)

    day = data["daily"].setdefault(_today(), {"requests": 0, "input": 0, "output": 0, "cost": 0.0})
    day["requests"] += 1
    day["input"] += input_tokens
    day["output"] += output_tokens
    day["cost"] = round(day["cost"] + cost, 6)

    _save(data)


def reset():
    _save(_default())


def snapshot():
    """Return a frontend-friendly summary (totals + byModel + last 30 days)."""
    data = load()
    by_model = [
        {"model": model, **stats}
        for model, stats in sorted(data["byModel"].items(), key=lambda kv: -kv[1]["cost"])
    ]
    daily = [
        {"date": date, **stats}
        for date, stats in sorted(data["daily"].items())
    ][-30:]
    return {
        "totalRequests": data["totalRequests"],
        "totalInput": data["totalInput"],
        "totalOutput": data["totalOutput"],
        "totalCost": round(data["totalCost"], 6),
        "byModel": by_model,
        "daily": daily,
    }
