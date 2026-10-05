"""Sentence-aware character chunking with a small overlap between chunks."""
import re


def chunk_pages(pages, document_name, size=800, overlap=150):
    """Create chunks without mixing PDF pages, making sources easy to verify."""
    result = []
    for page_number, text in pages:
        sentences = re.split(r"(?<=[.!?])\s+|\n+", text)
        pieces, current = [], ""
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            if len(current) + len(sentence) + 1 > size and current:
                pieces.append(current.strip())
                current = current[-overlap:] + " " + sentence
            else:
                current = (current + " " + sentence).strip()
            while len(current) > size:
                pieces.append(current[:size].strip())
                current = current[size - overlap:]
        if current.strip():
            pieces.append(current.strip())
        for index, piece in enumerate(pieces):
            result.append({"chunk_id": f"{document_name}:{page_number}:{index}",
                           "doc": document_name, "page": page_number, "text": piece})
    return result
