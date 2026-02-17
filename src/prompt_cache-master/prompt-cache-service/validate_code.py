#!/usr/bin/env python3
"""
Validation script - checks code structure without running the service.
Tests imports, models, and basic functionality without Dell credentials.
"""

import sys
import os

# Add src to path so we can import modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

print("🔍 Cache Service Code Validation")
print("="*60)

# Test 1: Basic imports
print("\n1️⃣  Testing basic imports...")
try:
    from prompt_cache_service.models import (
        CacheLookupRequest,
        CacheLookupResponse,
        CacheLookupResult,
        DataInsertionRequest,
        DataInsertionResponse,
        StoredEntry
    )
    print("   ✅ All Pydantic models imported successfully")
except Exception as e:
    print(f"   ❌ Failed to import models: {e}")
    sys.exit(1)

# Test 2: Validate model structure
print("\n2️⃣  Validating model schemas...")
try:
    # Create sample request
    lookup_req = CacheLookupRequest(
        project_id="test",
        user_id="user@test.com",
        prompt="test query"
    )
    assert lookup_req.project_id == "test"
    print("   ✅ CacheLookupRequest validated")
    
    # Create sample result with ALL compression fields
    result = CacheLookupResult(
        key="query",
        value="response",
        score=0.95,
        compressed_prompt="compressed",
        compression_ratio=50,
        original_tokens=100,
        compressed_tokens=50,
        hit_count=1,
        created_at="2024-01-01T00:00:00",
        last_accessed="2024-01-01T00:00:00",
        employee_id="user@test.com"
    )
    assert result.compression_ratio == 50
    assert result.original_tokens == 100
    assert result.compressed_tokens == 50
    print("   ✅ CacheLookupResult with compression metrics validated")
    
    # Create insertion request
    insert_req = DataInsertionRequest(
        project_id="test",
        user_id="user@test.com",
        prompt="query",
        response="answer",
        compressed_prompt="short",
        compression_ratio=60,
        original_tokens=200,
        compressed_tokens=80
    )
    assert insert_req.compression_ratio == 60
    print("   ✅ DataInsertionRequest with compression metrics validated")
    
except Exception as e:
    print(f"   ❌ Model validation failed: {e}")
    sys.exit(1)

# Test 3: Check authentication provider
print("\n3️⃣  Testing authentication provider...")
try:
    from prompt_cache_service.db_handler.authentication_provider import AuthenticationProvider
    
    # Test Base64 encoding
    auth = AuthenticationProvider(
        client_id="test_id",
        client_secret="test_secret"
    )
    credentials = auth.get_basic_credentials()
    
    # Decode to verify
    import base64
    decoded = base64.b64decode(credentials).decode('utf-8')
    assert decoded == "test_id:test_secret"
    print("   ✅ Authentication provider working correctly")
    
except Exception as e:
    print(f"   ❌ Authentication provider failed: {e}")
    sys.exit(1)

# Test 4: Check Dell certificate updater exists
print("\n4️⃣  Checking Dell certificate updater...")
try:
    from prompt_cache_service import dell_certs
    assert hasattr(dell_certs, 'update_certifi_with_dell_certs')
    print("   ✅ Dell certificate updater function exists")
except Exception as e:
    print(f"   ❌ Dell certs module failed: {e}")
    sys.exit(1)

# Test 5: Check embedding provider structure
print("\n5️⃣  Checking embedding provider structure...")
try:
    from prompt_cache_service.db_handler.embedding import (
        EmbeddingEngine,
        DellGenAIEmbeddingProvider,
        PlaceholderEmbeddingProvider
    )
    
    # Check abstract base class
    assert hasattr(EmbeddingEngine, 'embed')
    print("   ✅ EmbeddingEngine abstract class defined")
    
    # Check placeholder provider (doesn't need credentials)
    placeholder = PlaceholderEmbeddingProvider(dim=384)
    import asyncio
    result = asyncio.run(placeholder.embed("test"))
    assert len(result) == 384
    assert all(x == 0.0 for x in result)
    print("   ✅ PlaceholderEmbeddingProvider working (384-dim zeros)")
    
    # Check Dell provider class exists with correct attributes
    assert hasattr(DellGenAIEmbeddingProvider, 'AVAILABLE_MODELS')
    available_models = DellGenAIEmbeddingProvider.AVAILABLE_MODELS
    assert "granite-embedding-278m-multilingual" in available_models
    assert "nomic-embed-text-v1" in available_models
    assert "embeddinggemma-300m" in available_models
    print(f"   ✅ DellGenAIEmbeddingProvider supports {len(available_models)} models")
    
except Exception as e:
    print(f"   ❌ Embedding provider check failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 6: Check router endpoints
print("\n6️⃣  Checking router structure...")
try:
    from prompt_cache_service.router import router
    
    # Get all routes
    routes = [route.path for route in router.routes]
    
    required_endpoints = ["/health", "/cache/lookup", "/cache/insert"]
    for endpoint in required_endpoints:
        assert endpoint in routes, f"Missing endpoint: {endpoint}"
        print(f"   ✅ {endpoint} endpoint defined")
    
except Exception as e:
    print(f"   ❌ Router check failed: {e}")
    sys.exit(1)

# Test 7: Verify data parity fields
print("\n7️⃣  Verifying complete data parity...")
try:
    # IndexedDB fields that MUST be in the service
    required_fields = {
        "queryText": "key",
        "llmResponse": "value",
        "compressedPrompt": "compressed_prompt",
        "compressionRatio": "compression_ratio",
        "originalTokens": "original_tokens",
        "compressedTokens": "compressed_tokens",
        "hitCount": "hit_count",
        "createdAt": "created_at",
        "lastAccessed": "last_accessed",
        "employeeId": "employee_id",
    }
    
    # Check CacheLookupResult has all fields
    result_fields = CacheLookupResult.model_fields.keys()
    
    missing_fields = []
    for indexeddb_field, service_field in required_fields.items():
        if service_field not in result_fields:
            missing_fields.append(f"{indexeddb_field} → {service_field}")
    
    if missing_fields:
        print(f"   ❌ Missing fields: {', '.join(missing_fields)}")
        sys.exit(1)
    
    print("   ✅ All IndexedDB fields mapped to service")
    print(f"   ✅ {len(required_fields)} fields validated")
    
except Exception as e:
    print(f"   ❌ Data parity check failed: {e}")
    sys.exit(1)

# Summary
print("\n" + "="*60)
print("🎉 ALL VALIDATION CHECKS PASSED!")
print("="*60)
print("\n✅ Models: All Pydantic models valid")
print("✅ Authentication: Base64 encoding works")
print("✅ Certificates: Dell cert updater ready")
print("✅ Embedding: Providers defined correctly")
print("✅ Router: All 3 endpoints exist")
print("✅ Data Parity: All 10 IndexedDB fields mapped")
print("\n📝 Notes:")
print("   - Code structure is correct")
print("   - Imports work without errors")
print("   - Models validate compression metrics")
print("   - Ready for service startup")
print("\n⚠️  To test Dell GenAI embedding:")
print("   - Need Dell credentials (Client ID/Secret or SSO)")
print("   - Run: uvicorn prompt_cache_service.main:app --reload --port 8001")
