"""Persistent vector index; FAISS is preferred and NumPy is the fallback."""
import json
from pathlib import Path
import numpy as np


class VectorStore:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.meta_path = self.directory / "chunks.json"
        self.vector_path = self.directory / "vectors.npy"
        self.index_path = self.directory / "index.faiss"
        self.chunks, self.vectors = [], np.empty((0, 0), dtype=np.float32)
        try:
            import faiss
            self.faiss = faiss
        except Exception:
            self.faiss = None
        self._load()

    def _load(self):
        if self.meta_path.exists() and self.vector_path.exists():
            self.chunks = json.loads(self.meta_path.read_text(encoding="utf-8"))
            self.vectors = np.load(self.vector_path).astype(np.float32)
        self._rebuild()

    def _rebuild(self):
        self.index = None
        if self.faiss and self.vectors.size:
            self.index = self.faiss.IndexFlatIP(self.vectors.shape[1])
            self.index.add(self.vectors)

    def _save(self):
        self.meta_path.write_text(json.dumps(self.chunks, ensure_ascii=False, indent=2), encoding="utf-8")
        np.save(self.vector_path, self.vectors)
        if self.faiss and self.index is not None:
            self.faiss.write_index(self.index, str(self.index_path))

    def add(self, chunks, vectors):
        vectors = np.asarray(vectors, dtype=np.float32)
        if self.vectors.size and vectors.shape[1] != self.vectors.shape[1]:
            raise ValueError("Embedding dimensions do not match the saved index.")
        self.vectors = vectors if not self.vectors.size else np.vstack((self.vectors, vectors))
        self.chunks.extend(chunks)
        self._rebuild()
        self._save()

    def delete_document(self, name):
        keep = [i for i, chunk in enumerate(self.chunks) if chunk["doc"] != name]
        self.chunks = [self.chunks[i] for i in keep]
        self.vectors = self.vectors[keep] if keep else np.empty((0, self.vectors.shape[1] if self.vectors.ndim == 2 else 0), dtype=np.float32)
        self._rebuild()
        self._save()

    def search(self, query_vector, top_k=4, selected_docs=None):
        if not self.chunks:
            return []
        if selected_docs is not None and len(selected_docs) == 0:
            return []
        allowed = set(selected_docs or [])
        if self.index is not None and not allowed:
            scores, ids = self.index.search(np.asarray(query_vector, dtype=np.float32).reshape(1, -1), len(self.chunks))
            candidates = [(int(i), float(s)) for i, s in zip(ids[0], scores[0]) if i >= 0]
        else:
            sims = self.vectors @ np.asarray(query_vector, dtype=np.float32).reshape(-1)
            candidates = sorted(enumerate(sims.tolist()), key=lambda item: item[1], reverse=True)
        if allowed:
            candidates = [(i, score) for i, score in candidates if self.chunks[i]["doc"] in allowed]
        return [{**self.chunks[i], "score": score} for i, score in candidates[:top_k]]
