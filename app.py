"""Flask routes for StudyBuddy; the RAG pipeline lives in services/."""
import os
from pathlib import Path
from threading import Lock
from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from services.vector_store import VectorStore
from services.rag import RAG

BASE = Path(__file__).resolve().parent
load_dotenv(BASE / ".env")
UPLOAD_DIR, DATA_DIR = BASE / "uploads", BASE / "data"
UPLOAD_DIR.mkdir(exist_ok=True); DATA_DIR.mkdir(exist_ok=True)
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024
store = VectorStore(DATA_DIR); rag = RAG(store); lock = Lock()
ALLOWED = {"pdf", "txt"}

@app.get("/")
def index(): return render_template("index.html")

@app.get("/documents")
def documents():
    records = {}
    for chunk in store.chunks: records.setdefault(chunk["doc"], set()).add(chunk["page"])
    return jsonify([{"name": p.name, "pages": len(records.get(p.name, set())),
                     "chunks": sum(c["doc"] == p.name for c in store.chunks),
                     "status": "Ready" if records.get(p.name) else "Error"}
                    for p in sorted(UPLOAD_DIR.iterdir()) if p.is_file()])

@app.post("/upload")
def upload():
    files = request.files.getlist("files")
    if not files or all(not f.filename for f in files): return jsonify(error="Choose one or more PDF or TXT files."), 400
    results = []
    with lock:
        for file in files:
            original, safe = file.filename or "", secure_filename(file.filename or "")
            file.stream.seek(0, os.SEEK_END)
            size = file.stream.tell()
            file.stream.seek(0)
            if size > 20 * 1024 * 1024:
                results.append({"name": safe or original, "status": "Error", "error": "Each file must be no larger than 20 MB."}); continue
            if not safe or "." not in safe or safe.rsplit(".", 1)[1].lower() not in ALLOWED:
                results.append({"name": original, "status": "Error", "error": "Only PDF and TXT files are supported."}); continue
            dest = UPLOAD_DIR / safe
            if dest.exists(): results.append({"name": safe, "status": "Error", "error": "A file with this name is already uploaded."}); continue
            try:
                file.save(dest); pages, chunks = rag.index_document(str(dest), safe)
                results.append({"name": safe, "status": "Ready", "pages": pages, "chunks": chunks})
            except Exception as exc:
                dest.unlink(missing_ok=True); store.delete_document(safe)
                results.append({"name": safe, "status": "Error", "error": str(exc) or "Could not read this file."})
    return jsonify(files=results)

@app.delete("/documents/<name>")
def delete_document(name):
    safe = secure_filename(name)
    if not safe or safe != name: return jsonify(error="Invalid document name."), 400
    (UPLOAD_DIR / safe).unlink(missing_ok=True); store.delete_document(safe)
    return jsonify(ok=True)

@app.post("/clear")
def clear():
    for path in UPLOAD_DIR.iterdir():
        if path.is_file(): path.unlink()
    for name in list({c["doc"] for c in store.chunks}): store.delete_document(name)
    return jsonify(ok=True)

@app.post("/ask")
def ask():
    body = request.get_json(silent=True) or {}; question = (body.get("question") or "").strip()
    if not question: return jsonify(error="Type a question first."), 400
    if len(question) > 4000: return jsonify(error="Please keep questions under 4,000 characters."), 400
    try:
        selected = body.get("selected_docs") if "selected_docs" in body else None
        return jsonify(rag.ask(question, body.get("history") or [], selected))
    except RuntimeError as exc: return jsonify(error=str(exc)), 503
    except Exception as exc:
        message = str(exc).lower()
        friendly = "Gemini is busy or rate-limited. Please wait a moment and try again." if any(x in message for x in ("429", "rate", "quota")) else "The answer service had a problem. Check your .env API key and connection, then try again."
        app.logger.exception("Question answering failed")
        return jsonify(error=friendly), 502

@app.errorhandler(413)
def too_large(_error): return jsonify(error="Each file must be no larger than 20 MB."), 413

if __name__ == "__main__": app.run(debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")
