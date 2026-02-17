# Cache Service Testing & Verification

## Quick Start Guide

### 1. Setup Python Service

```bash
cd src/prompt_cache-master/prompt-cache-service

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Dell credentials
```

### 2. Start the Service

```bash
# From: src/prompt_cache-master/prompt-cache-service
uvicorn prompt_cache_service.main:app --reload --port 8001
```

**Expected Output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8001
INFO:     Downloading Dell certificates from: https://pki.dell.com/...
INFO:     Dell certificates successfully added to certifi bundle
INFO:     Using Client ID/Secret authentication for Dell GenAI
INFO:     Initialized Dell GenAI embedding provider with model: granite-embedding-278m-multilingual
INFO:     Starting prompt_cache_service
INFO:     Application startup complete.
```

### 3. Run API Tests

```bash
# In a NEW terminal (keep service running)
cd src/prompt_cache-master/prompt-cache-service
source venv/bin/activate
python test_cache_service.py
```

**What the tests verify:**
- ✅ `/health` endpoint responds
- ✅ `/cache/insert` accepts all compression metrics
- ✅ `/cache/lookup` returns all fields
- ✅ Cache miss returns empty results
- ✅ Complete data parity with IndexedDB schema

### 4. Manual API Testing

#### Health Check
```bash
curl http://localhost:8001/health
# Expected: {"status":"ok"}
```

#### Insert Cache Entry
```bash
curl -X POST http://localhost:8001/cache/insert \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "PowerStore",
    "user_id": "alice@dell.com",
    "prompt": "What is RAID?",
    "response": "RAID (Redundant Array of Independent Disks) is...",
    "compressed_prompt": "Explain RAID",
    "compression_ratio": 60,
    "original_tokens": 500,
    "compressed_tokens": 200
  }'
```

#### Lookup Cache Entry
```bash
curl -X POST http://localhost:8001/cache/lookup \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "PowerStore",
    "user_id": "alice@dell.com",
    "prompt": "What is RAID?"
  }'
```

### 5. Test with Frontend

#### Enable Cache Service
```bash
# In project root: /Users/ronberger/Desktop/compact
echo "VITE_USE_CACHE_SERVICE=true" >> .env
```

#### Restart Frontend
```bash
# Stop current dev server (Ctrl+C)
npm run dev:full
```

#### Test Flow
1. Open http://localhost:5173
2. Login as any user
3. Send query: "What is caching?"
4. Check browser console for logs:
   - ❌ `Cache service unreachable` = Service not running
   - ✅ `Insert SUCCESS` = Working!
5. Send same query again
6. Should see `Lookup HIT` in console
7. Response should appear instantly with "Cached" badge

### 6. Switch Between Backends

**Use IndexedDB (current):**
```bash
echo "VITE_USE_CACHE_SERVICE=false" >> .env
# Restart frontend
```

**Use Cache Service (new):**
```bash
echo "VITE_USE_CACHE_SERVICE=true" >> .env
# Restart frontend
```

## Troubleshooting

### Service won't start

**Error: "Missing Dell authentication credentials"**
```bash
# Check .env file has:
DELL_CLIENT_ID=your_actual_client_id
DELL_CLIENT_SECRET=your_actual_secret
```

**Error: "ModuleNotFoundError: No module named 'openai'"**
```bash
pip install -r requirements.txt
```

### Frontend can't connect

**Error: "Cache service unreachable"**
```bash
# Check service is running:
curl http://localhost:8001/health

# Check URL in .env:
VITE_CACHE_SERVICE_URL=http://localhost:8001
```

### Dell GenAI authentication fails

**Error: "401 Unauthorized"**
- Verify credentials in Dell Digital Cloud dashboard
- Check if using Teams plan vs Individual plan
- Try setting `DELL_USE_SSO=true` if on Individual plan

## Verification Checklist

- [ ] Python service starts without errors
- [ ] Health check returns `{"status":"ok"}`
- [ ] Test script passes all 5 tests
- [ ] Manual insert returns `stored_entries`
- [ ] Manual lookup returns all fields including compression metrics
- [ ] Frontend connects to service (check browser console)
- [ ] Frontend can insert new cache entries
- [ ] Frontend can retrieve cached responses
- [ ] Feature flag switches between IndexedDB and service
- [ ] Both backends work without code changes

## What's Working

✅ Dell GenAI embedding provider
✅ Certificate auto-installation
✅ ChromaDB storage with persistence
✅ Full compression metrics storage
✅ API endpoints with complete data parity
✅ Frontend hybrid wrapper with feature flag
✅ Zero-downtime backend switching

## Next Steps

After verification:
1. Export existing IndexedDB data
2. Create migration script
3. Import data to ChromaDB
4. Enable service for all users
5. Monitor performance
