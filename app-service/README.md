# Dell Compact – RAG Gateway

RAG Gateway with semantic caching, prompt compression, and IndexedDB storage.

## Tech Stack

- **Vite** + **TypeScript** + **React 18**
- **shadcn/ui** + **Tailwind CSS**
- **IndexedDB** (via `idb`) for storage
- **js-tiktoken** for token counting
- **React Router** for navigation

## Features

- **Semantic cache** – Query similarity matching (cosine > 0.85)
- **4-stage RAG Compressor** – Security, n-gram (§-tokens), whitespace, semantic pruning
- **IndexedDB** – Users, cache, prompts
- **Compression View** – Interactive pipeline demo with Golden Example

## Getting Started

```sh
npm install
npm run dev
```

- **Build:** `npm run build`
- **Test:** `npm test`
- **Preview:** `npm run preview`

## Routes

| Path | Description |
|------|-------------|
| `/` | Login |
| `/chat` | Main chat interface |
| `/cache` | Cache dashboard |
| `/compression` | RAG Compressor demo |
| `/org-cache` | Org-wide cache view |
| `/testing` | IndexedDB test dashboard |

## Documentation

See `docs/PROJECT_ARCHITECTURE.md` for full architecture and flow documentation.
