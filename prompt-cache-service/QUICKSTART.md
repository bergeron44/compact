# Quick Start with HuggingFace Embeddings

## משתמש ב-HuggingFace עכשיו (יש לנו API key)

### 1. הגדר סביבה

```bash
cd src/prompt_cache-master/prompt-cache-service

# העתק .env.example
cp .env.example .env

# ערוך .env והוסף את ה-HuggingFace API key שלך:
# HUGGINGFACEHUB_API_KEY=hf_your_actual_key_here
# EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
```

### 2. התקן dependencies

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. הרץ את הסרוויס

```bash
uvicorn prompt_cache_service.main:app --reload --port 8000
```

**פלט מצופה:**
```
INFO:     ✅ Using HuggingFace embeddings (temporary)
INFO:     Initialized HuggingFace embedding provider with model: sentence-transformers/all-MiniLM-L6-v2
INFO:     Starting prompt_cache_service
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### 4. בדוק עם טסטים

```bash
# בטרמינל נפרד
python test_cache_service.py
```

---

## מעבר ל-Dell GenAI בעתיד

כשיהיו לך Dell credentials:

1. **הוסף ל-.env:**
```bash
# הסר/הוסף # ל-HuggingFace
# HUGGINGFACEHUB_API_KEY=...

# הפעל Dell
DELL_USE_SSO=false
DELL_CLIENT_ID=your_dell_client_id
DELL_CLIENT_SECRET=your_dell_secret
DELL_EMBEDDING_MODEL=granite-embedding-278m-multilingual
```

2. **הפעל מחדש את הסרוויס** - זהו! הסרוויס יעבור אוטומטית ל-Dell.

**לא צריך לשנות קוד!** 🎉

---

## Fallback Logic

הסרוויס בוחר אוטומטית לפי סדר עדיפות:

1. **HuggingFace** (אם יש `HUGGINGFACEHUB_API_KEY`) ✅ ← כרגע
2. **Dell GenAI** (אם יש credentials)
3. **Placeholder** (zero vectors - רק לדיבאג)

---

## בדיקה מהירה

```bash
# בדוק שהסרוויס רץ
curl http://localhost:8000/health

# הכנס entry עם embeddings אמיתיים
curl -X POST http://localhost:8000/cache/insert \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "test",
    "user_id": "test@example.com",
    "prompt": "What is caching?",
    "response": "Caching stores data for faster access",
    "compressed_prompt": "Explain caching",
    "compression_ratio": 50,
    "original_tokens": 100,
    "compressed_tokens": 50
  }'

# חפש (עם embedding similarity אמיתי!)
curl -X POST http://localhost:8000/cache/lookup \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "test",
    "user_id": "test@example.com",
    "prompt": "What is caching?"
  }'
```

עכשיו יש לך **embeddings אמיתיים** מ-HuggingFace! 🚀
