# StudyBuddy — The Midnight Library

A beginner-friendly document assistant for first-year students. Add PDF or TXT course notes, ask a question, and StudyBuddy retrieves relevant passages before asking Gemini to explain them. Every answer includes evidence cards with file, page, passage, and similarity score.

## Project structure

```text
StudyBuddy/
├── app.py
├── requirements.txt
├── .env.example
├── README.md
├── uploads/                 # Original uploaded documents (created automatically)
├── data/                    # Chunk metadata and vector index (created automatically)
├── services/
│   ├── __init__.py
│   ├── document_processor.py
│   ├── chunker.py
│   ├── embeddings.py
│   ├── vector_store.py
│   ├── llm.py
│   └── rag.py
├── templates/index.html
└── static/{style.css,script.js}
```

## Run on Windows

Install Python 3.10 or later. In PowerShell, open this folder and run:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
python app.py
```

Open <http://127.0.0.1:5000>. The first embedding request downloads the `all-MiniLM-L6-v2` model; allow a little extra time and disk space on first run. FAISS is optional: when its import is not available (including typical Windows installs), StudyBuddy uses the same normalized vectors with NumPy cosine similarity.

### Gemini API key

Create a key in [Google AI Studio](https://aistudio.google.com/app/apikey), then place it in `.env`:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.1-flash-lite
TOP_K=4
SIMILARITY_THRESHOLD=0.28
```

Keep `.env` private; it contains your API credential. The model and key are only read by `services/llm.py`. Gemini availability, quotas, and free-tier terms can change, so check the current information shown by Google AI Studio.

## Architecture, simply

1. **Extract:** `document_processor.py` reads each PDF page separately with pypdf, or reads TXT as page 1. It cleans extra whitespace and rejects documents with no selectable text.
2. **Chunk:** `chunker.py` makes passages around 800 characters, with roughly 150 characters of overlap. A passage is small enough to search and retains its document and page labels.
3. **Embed:** `embeddings.py` loads the local MiniLM sentence-transformer once and turns each passage into a normalized vector that captures meaning.
4. **Store:** `vector_store.py` saves text metadata and vectors under `data/`. It uses FAISS `IndexFlatIP` when available; normalized vectors make inner product equal cosine similarity. NumPy provides the fallback.
5. **Retrieve:** `rag.py` embeds a question, optionally filters by selected files, and returns the best 3–5 matches (4 by default). If the strongest match is below the configured threshold, it returns the not-found response without calling the answer model.
6. **Answer:** `llm.py` sends only retrieved passages, the standalone question, and a few recent chat turns to Gemini. The prompt tells the model to use only the context. Returned source cards let the student inspect the passages.

The browser keeps recent chat turns for follow-ups. `rag.py` asks Gemini to resolve references such as “what is its formula?” into a standalone search question. The final answer is still constrained to retrieved document passages. Uploads, vectors, and text index live in the project folders on this machine; Gemini receives the question and selected retrieved context when answering.

## API overview

- `POST /upload` — multipart `files` field, accepts multiple PDF/TXT uploads.
- `GET /documents` — uploaded documents and indexed page/chunk counts.
- `DELETE /documents/<name>` — remove one original and its indexed chunks.
- `POST /ask` — JSON `{ "question": "...", "history": [], "selected_docs": [] }`.
- `POST /clear` — remove all uploaded documents and index entries.

Set `TOP_K` from 3 to 5. Similarity scores are cosine similarity (roughly -1 to 1), and `SIMILARITY_THRESHOLD` controls when the app declines to answer. Tune it against your course notes; embedding similarity is a useful gate, not a guarantee that every returned passage fully answers a question.

## How to explain this project in an interview

### 60-second explanation

“StudyBuddy is a small retrieval-augmented generation app for course notes. A student uploads PDFs or text files. The backend extracts text page by page, splits it into overlapping passages, and uses a local sentence-transformer to embed each passage. We save those vectors and their source metadata, then compare an embedded question against them with cosine similarity. The best passages are sent as context to Gemini, with a prompt to answer only from those passages. If similarity is too low, the app skips the LLM and says it could not find enough information. The UI shows the exact source passage, page, and score, so a student can verify what the answer is based on. Flask handles the API, while plain HTML, CSS, and JavaScript provide the interface.”

### Likely questions

**What is RAG?** Retrieval-augmented generation finds relevant information in a chosen knowledge base and gives it to a language model as context before generating an answer.

**What are embeddings?** Embeddings are numeric vectors representing the meaning of text. Similar meanings tend to have vectors pointing in similar directions, so cosine similarity can find useful passages even when the exact keywords differ.

**Why chunk?** A whole textbook is too large and imprecise to send for each question. Smaller passages make retrieval focused and keep the source location clear.

**Why overlap?** A definition or explanation can straddle a chunk boundary. Repeating a short tail in the next chunk reduces the chance of splitting that idea apart.

**How do you prevent hallucination?** The prompt restricts the model to retrieved context, the similarity threshold avoids a call when no passage looks relevant, and visible citations help users verify claims. These reduce risk but cannot mathematically guarantee a model will never make a mistake.

**What would you improve?** Add OCR for scanned PDFs, evaluate retrieval against a labeled question set, improve reranking and citation checking, support user accounts and encrypted storage, and add background jobs for large uploads.

## Manual demo plan

1. Create two small course-note files, such as `biology.txt` and `calculus.txt`, and upload them together. Confirm both become Ready and show their page and chunk counts.
2. Ask a question explicitly answered in one note. Confirm the answer appears and the matching file, page, snippet, and relevance score are visible. Click a source chip to highlight its evidence card.
3. Ask a follow-up with a pronoun, such as “Why does it matter?” Confirm the conversation context helps resolve the question and that the answer still cites retrieved text.
4. Ask about a topic absent from both notes. Confirm the not-found card appears and no Gemini answer sources are shown.
5. Uncheck one document to test document filtering, delete a document, refresh the page to check persistence, and use the daylight toggle and mobile layout.

## Notes

- Image-only/scanned PDFs need OCR before they can be indexed; this version gives a friendly message when no text is extractable.
- The app is intended for local demos. Add authentication, CSRF protections, per-user storage, and production server configuration before deploying it for multiple users.
- `data/` and `uploads/` are runtime folders. Uploaded documents are not automatically cleaned up when the app exits.
