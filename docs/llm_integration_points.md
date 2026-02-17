# מיפוי אינטגרציות עם מודלים (LLM Integration Map)

מסמך זה ממפה את כל המקומות בפרויקט בהם מתבצעת תקשורת עם מודל שפה (חיצוני או מקומי), ומסביר איך כל חלק ממומש כרגע.

## 1. יצירת וקטורים (Embeddings) - **מודל אמיתי**

החלק הזה אחראי להפוך טקסט למספרים כדי לאפשר חיפוש בקאש.

*   **קוד לקוח:** `src/lib/embedApi.ts` (פונקציה `embedText`).
*   **איך זה עובד:** שולח בקשת `POST /api/embed` לשרת המקומי.
*   **בשרת:** הקובץ `server/index.js` משתמש בספרייה `@langchain/community/embeddings/hf` כדי לפנות ל-Hugging Face Inference API.
*   **המודל:** מוגדר ב-`.env` תחת `EMBEDDING_MODEL` (ברירת מחדל: `sentence-transformers/all-MiniLM-L6-v2`).

---

## 2. סינון ודירוג (Filter & Rate) - **מוק (Mock) עם אופציה לאמיתי**

החלק הזה מחליט האם לשמור שאילתה בקאש ומדרג את איכותה.

*   **קוד לקוח:** `src/lib/filterAndRating.ts`.
*   **המצב כרגע:** משתמש ב-`MockPromptClassifier` שמריץ חוקים קבועים (Regex) בדיקה לוקאלית.
*   **איך עוברים לאמיתי:**
    1.  ב-`server/index.js` כבר קיים Endpoint מוכן: `POST /api/filter-and-rate` שפונה למודל של Mistral דרך Hugging Face.
    2.  כדי להפעיל אותו בקליינט, צריך רק לעשות Uncomment למחלקת `ApiPromptClassifier` ב-`src/lib/filterAndRating.ts` ולקרוא ל-`promptClassifier.setBackend(new ApiPromptClassifier())`.

---

## 3. הצ'אט הראשי (Main Chat Response) - **מוק (Mock)**

התשובות שהבוט עונה למשתמש בצ'אט.

*   **קוד לקוח:** `src/lib/mockLLM.ts` (פונקציה `simulateLLMResponse`).
*   **המצב כרגע:** **מזויף לחלוטין**. המערכת בוחרת תשובה מוכנה מראש מתוך רשימה קבועה (לפי מילות מפתח כמו "rag", "cache", "compression").
*   **איך להחליף לאמיתי:** צריך לשכתב את הפונקציה `simulateLLMResponse` כך שתקרא ל-API חיצוני (כמו OpenAI / Anthropic / שרת מקומי משלכם).

---

## 4. סיכום טקסטים (Summarization) - **מוק (Mock)**

חלק ממנגנון הדחיסה (Compression) שמקצר פרומפטים ארוכים.

*   **קוד לקוח:** `src/lib/compression/summarizer.ts`.
*   **המצב כרגע:** `MockSummarizer` שמנקה טקסט לפי תבניות (Scrubbing) ולא באמת "מסכם" עם בינה מלאכותית.
*   **איך להחליף לאמיתי:** לממש את הממשק `Summarizer` במחלקה חדשה שקוראת ל-LLM, ולהחליף ב-`compressor.ts`.

---

## טבלת סיכום

| רכיב | סטטוס נוכחי | מיקום בקוד | מודל בשימוש |
| :--- | :--- | :--- | :--- |
| **Embeddings** | ✅ **אמיתי** (API) | `server/index.js` | `all-MiniLM-L6-v2` (HF) |
| **Filter & Rate** | 🚧 **Mock** (API מוכן) | `src/lib/filterAndRating.ts` | `Mistral-7B` (בשרת בלבד) |
| **Chat Response** | ❌ **Mock** (Placeholder) | `src/lib/mockLLM.ts` | אין (תשובות הארד-קודד) |
| **Summarization** | ❌ **Mock** (Regex) | `src/lib/compression/summarizer.ts` | אין (Regex) |
