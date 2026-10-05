"""One clear path through extract -> chunk -> embed -> store -> retrieve -> answer."""
import os
from .document_processor import extract_pages
from .chunker import chunk_pages
from .embeddings import embed_texts
from .llm import answer_question, rewrite_followup

NOT_FOUND = "I couldn't find enough information in your uploaded documents to answer this."


class RAG:
    def __init__(self, store):
        self.store = store

    def index_document(self, path, name):
        pages = extract_pages(path)                         # Read and clean each page.
        chunks = chunk_pages(pages, name)                  # Keep chunks short and traceable.
        vectors = embed_texts([chunk["text"] for chunk in chunks])  # Local semantic vectors.
        self.store.add(chunks, vectors)                    # Persist text, sources, and vectors.
        return len(pages), len(chunks)

    def ask(self, question, history=None, selected_docs=None):
        standalone = rewrite_followup(question, history or [])
        query_vector = embed_texts([standalone])[0]
        top_k = max(3, min(5, int(os.getenv("TOP_K", "4"))))
        chunks = self.store.search(query_vector, top_k, selected_docs)
        threshold = float(os.getenv("SIMILARITY_THRESHOLD", "0.28"))
        if not chunks or chunks[0]["score"] < threshold:
            return {"answer": NOT_FOUND, "sources": [], "standalone_question": standalone, "found": False}
        try:
            answer = answer_question(standalone, chunks, history or [])
        except Exception as exc:
            # Gemini can temporarily reject a valid request when a model is busy.
            # Still give the student the retrieved evidence instead of a dead end.
            if "503" not in str(exc) and "UNAVAILABLE" not in str(exc):
                raise
            passages = "\n\n".join(
                f"**{chunk['doc']} · page {chunk['page']}**\n{chunk['text']}"
                for chunk in chunks
            )
            answer = ("Gemini is temporarily busy, so here are the most relevant "
                      "passages I found in your documents:\n\n" + passages)
        sources = [{"doc": c["doc"], "page": c["page"], "snippet": c["text"],
                    "score": round(float(c["score"]), 4)} for c in chunks]
        return {"answer": answer, "sources": sources, "standalone_question": standalone, "found": True}
