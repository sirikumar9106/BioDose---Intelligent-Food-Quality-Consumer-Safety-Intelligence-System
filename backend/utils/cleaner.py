import re
import html


def normalize_text(text):
    text = html.unescape(str(text))

    text = text.lower().strip()

    text = re.sub(r"\(.*?\)", "", text)

    text = re.sub(r"[^a-zA-Z0-9\s]", " ", text)

    text = re.sub(r"\s+", " ", text)

    return text.strip()


def extract_e_numbers(text):
    pattern = r"\b[eE]\d{3}[a-zA-Z]?\b"

    return re.findall(pattern, text)


def tokenize_ingredients(text):
    if not text:
        return []
    
    text = html.unescape(str(text))
    tokens = re.split(r",|;", text)
    
    result = []
    for token in tokens:
        cleaned = normalize_text(token)
        if cleaned:
            result.append(cleaned)
    return result