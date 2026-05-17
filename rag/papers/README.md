# Research Paper Corpus

Place the 8 source PDFs here (gitignored). Ingest with:

```bash
python -m rag.ingest
python -m rag.colpali_offline_ingest --pdf rag/papers/*.pdf
```

Expected files (per author's publication record):
1. IEEE accepted — Diabetes prediction XGBoost + SHAP + TRIPOD-AI
2. JHE Q2 — HMDA mortgage racial disparities (DML)
3. NeurIPS — IndiaFinBench benchmark
4. JBI #1 — CPFE cross-platform fairness
5. JBI #2 — FL Diabetes federated learning
6. SSRN — CATE HMDA heterogeneous treatment effects
7. SSRN — ICGDF null result finance ML
8. SSRN — ML equity conviction ranking
