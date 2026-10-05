"""All Gemini-specific code lives here, so another provider is easy to swap in."""
import os


SYSTEM_PROMPT = ("You are a document assistant. Answer using ONLY the provided context. "
                "If the context does not contain the answer, say you could not find it. "
                "Do not use outside knowledge. Mention which source file/page supports "
                "the answer. Explain clearly for a first-year student.")


def _client():
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("Add your Gemini API key to .env to ask questions.")
    from google import genai
    return genai.Client(api_key=key)


def answer_question(question, chunks, history):
    context = "\n\n".join(f"[{i}] {c['doc']} (page {c['page']}): {c['text']}"
                          for i, c in enumerate(chunks, 1))
    turns = "\n".join(f"{m.get('role','user')}: {m.get('content','')}" for m in history[-6:])
    prompt = (f"{SYSTEM_PROMPT}\n\nRecent conversation (for context only):\n{turns or '(none)'}"
              f"\n\nDocument context:\n{context}\n\nQuestion: {question}\n\nAnswer:")
    response = _client().models.generate_content(model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"), contents=prompt)
    return response.text or "I couldn't produce an answer from the provided documents."


def rewrite_followup(question, history):
    """Resolve pronouns using recent chat; retrieval still decides what's supported."""
    if not history:
        return question
    try:
        prompt = ("Rewrite the latest question as a standalone search question using only "
                 "the conversation for references. Return only the rewritten question.\n"
                 + "\n".join(f"{m.get('role','user')}: {m.get('content','')}" for m in history[-6:])
                 + f"\nuser: {question}")
        response = _client().models.generate_content(model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"), contents=prompt)
        return (response.text or question).strip()
    except Exception:
        # A rewrite is helpful but optional; normal retrieval can still proceed.
        return question
