# תוכנית מימוש – RAG Compressor

## סיכום המסמך המקורי

הקומפרסור מורכב מ-**4 שלבים**:

| שלב | שם | תיאור |
|-----|-----|-------|
| 1 | Security & Term Substitution | החלפת מונחים רגישים + ביטויים מילוליים (`in order to` → `to`) |
| 2 | N-Gram Mining (10→2) | זיהוי והחלפת n-grams חוזרים (מ-10 מילים עד 2) ב־`[NGn:phrase]` |
| 3 | Whitespace & Punctuation | ניקוי רווחים וסימני פיסוק מיותרים |
| 4 | Semantic Pruning | הסרת stop words (רק כאשר `aggressive=true`) |

---

## חיבורים לקוד הקיים

### 1. `src/lib/cache.ts` – addToCache

**מצב נוכחי:**
```typescript
function compressText(text: string, ratio = 0.5): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const keepCount = Math.max(1, Math.ceil(sentences.length * ratio));
  return sentences.slice(0, keepCount).join(' ').trim();
}
// ...
const compressed = compressText(response);
const originalTokens = estimateTokens(response);
const compressedTokens = estimateTokens(compressed);
const compressionRatio = Math.round((1 - compressedTokens / originalTokens) * 100);
```

**שינויים נדרשים:**
- להחליף את `compressText` ו־`estimateTokens` בשימוש ב־`compressor.compress(response)`.
- לוודא שה־compressor מאותחל (למשל `await compressor.init()` לפני הדחיפה הראשונה).
- להעביר מ־`CompressionResult`:
  - `compressedText` → `compressedResponse`
  - `originalTokens` → `originalTokens`
  - `compressedTokens` → `compressedTokens`
  - `compressionRatio` = `Math.round(result.compressionPercentage)` (0–100, כמו היום).

### 2. `src/pages/CompressionView.tsx`

**מצב נוכחי:**
- שלב 1: Caesar cipher – **לא תואם** (צריך Security & Term Substitution).
- שלב 2: N-Gram רק bigrams, פורמט `[NG:xxx×n]` – **לא תואם** (צריך 10→2 עם `[NGn:phrase]`).
- שלב 3: Sanitization – דומה ל־whitespace cleanup.
- שלב 4: Semantic Pruning – דומה.

**שינויים נדרשים:**
- להחליף את הלוגיקה הפנימית ב־`runPipeline` בקריאה ל־`compressor.compress()`.
- להשתמש ב־`result.stages` להצגת חיסכון לפי שלב.
- לאתחל את ה־compressor ב־`useEffect`.
- להוסיף Toggle ל־`aggressive` mode.
- לשמור על מבנה ה־UI הקיים (שמות השלבים יכולים להשתנות).

### 3. `src/App.tsx`

- להוסיף אתחול לקומפרסור לצד המיגרציה:
```typescript
useEffect(() => {
  migrateToIndexedDB().catch(console.error);
  compressor.init().catch(console.error);
}, []);
```

### 4. קובץ נתונים

- ליצור `public/data/encryption.json` (בתיקיית `public` כדי ש־`fetch('/data/encryption.json')` יעבוד).

---

## מבנה קבצים חדשים

```
src/lib/compression/
├── types.ts           # ממשקים: SecurityMappings, CompressionOptions, CompressionResult
├── tokenCounter.ts    # ספירת טוקנים עם js-tiktoken (cl100k_base)
├── securityLoader.ts  # טעינת encryption.json + fallback
├── compressor.ts      # המנוע המרכזי – 4 שלבים
├── index.ts           # ייצוא
└── __tests__/
    └── compressor.test.ts
```

```
public/
└── data/
    └── encryption.json
```

---

## פרטי מימוש חשובים

### Stage 1 – Security & Term Substitution
- מיון מפתחות לפי אורך (מהארוך לקצר).
- החלפה case-insensitive.
- טעינה מ־`/data/encryption.json`, fallback אם הקובץ חסר.

### Stage 2 – N-Gram Mining
- **חובה:** איטרציה 10→2 (לא 2→10).
- פורמט טוקן: `[NGn:phrase]` (למשל `[NG3:machine learning is]`).
- להחליף רק n-grams עם count ≥ 2.
- לעבוד על הטקסט **המעודכן** בכל איטרציה.
- להשתמש ב־`findNGrams(text, n)` שמחזיר `Map<string, number>`.

### Stage 3 – Whitespace Cleanup
- רווחים מרובים → רווח יחיד.
- הסרת רווח לפני פיסוק: `" ."` → `"."`.
- הסרת רווח מסביב לסוגריים וסימני ציטוט.

### Stage 4 – Semantic Pruning
- פועל רק כאשר `aggressive: true`.
- רשימת stop words קבועה.

### Token Counter
- ספריית `js-tiktoken`, encoding: `cl100k_base`.
- Fallback: `Math.ceil(text.length / 4)` אם ה־encoder לא טעון.

### התאמה ל־compressionRatio
- ה־cache מצפה ל־`compressionRatio` באחוזים (0–100).
- `CompressionResult.compressionPercentage` הוא אחוז החיסכון – להשתמש בו.

---

## תלויות

```bash
npm install js-tiktoken
```

---

## סדר הביצוע המומלץ

1. **התקנה וליבה**
   - התקנת `js-tiktoken`.
   - יצירת `types.ts`.
   - יצירת `tokenCounter.ts`.
   - יצירת `securityLoader.ts`.

2. **הקומפרסור**
   - יצירת `compressor.ts` עם 4 השלבים (כולל Stage 2 לפי המפרט 10→2).
   - יצירת `index.ts`.

3. **נתונים ואתחול**
   - יצירת `public/data/encryption.json`.
   - הוספת `compressor.init()` ב־`App.tsx`.

4. **חיבור לקוד הקיים**
   - עדכון `cache.ts` – `addToCache` ישתמש ב־compressor.
   - עדכון `CompressionView.tsx` – pipeline ישתמש ב־compressor.

5. **בדיקות**
   - יצירת `compressor.test.ts`.
   - הרצת `npm test`.

---

## הערות

- **ה־compressor.ts בדוגמה במסמך המקורי** מכיל Stage 2 מפושט (bigrams בלבד). יש לממש את הגרסה המלאה (10→2) מהמפרט.
- **CompressionView** משתמש ב־`estimateTokens` מקומית; לאחר המעבר נשתמש ב־`tokenCounter.count()` מ־compression.
- ה־compressor חייב להיות אסינכרוני (init), אך `compress()` עצמו סינכרוני.
