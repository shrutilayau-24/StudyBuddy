"""Load the local sentence-transformer once and normalize for cosine search."""
import numpy as np

_model = None


def embed_texts(texts):
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    vectors = _model.encode(texts, convert_to_numpy=True, normalize_embeddings=True,
                            show_progress_bar=False)
    return np.asarray(vectors, dtype=np.float32)
