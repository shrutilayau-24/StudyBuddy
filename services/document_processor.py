"""Read supported documents and keep page information attached to text."""
from pathlib import Path
import re
from pypdf import PdfReader


def clean_text(text: str) -> str:
    """Normalize whitespace while keeping useful paragraph breaks."""
    text = text.replace("\x00", " ").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pages(path: str):
    """Return (page number, text) pairs; plain text is treated as page 1."""
    file_path = Path(path)
    if file_path.suffix.lower() == ".pdf":
        reader = PdfReader(str(file_path))
        pages = [(number, clean_text(page.extract_text() or ""))
                 for number, page in enumerate(reader.pages, start=1)]
    elif file_path.suffix.lower() == ".txt":
        pages = [(1, clean_text(file_path.read_text(encoding="utf-8", errors="replace")))]
    else:
        raise ValueError("Only PDF and TXT files are supported.")
    if not any(text for _, text in pages):
        raise ValueError("No selectable text was found. This may be a scanned PDF; try a text-based PDF or TXT file.")
    return [(page, text) for page, text in pages if text]
