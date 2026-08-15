"""Concept-name matching helpers (backend side, used for appearance detection)."""


def concept_names(concept):
    names = [concept.get("name")]
    for a in concept.get("aliases", []):
        if a:
            names.append(a)
    return [n for n in names if n]


def find_character_ids(text, concepts):
    """Return ids of character concepts whose name/alias appears in text."""
    found = []
    for c in concepts:
        if c.get("type") != "character":
            continue
        for name in concept_names(c):
            if name in text:
                found.append(c["id"])
                break
    return found
