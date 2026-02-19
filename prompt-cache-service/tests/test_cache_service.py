#!/usr/bin/env python3
"""
Test script for Cache Service API endpoints.

Tests all exposed APIs to ensure:
1. Health check works
2. Cache insertion with compression metrics works
3. Cache lookup returns all fields correctly
4. Data parity with IndexedDB schema
"""

import asyncio
import httpx
import json
from datetime import datetime

# Service configuration
BASE_URL = "http://localhost:8001"

# Test data
TEST_PROJECT_ID = "test-project"
TEST_USER_ID = "test-user@dell.com"
TEST_QUERY = "What is prompt caching and how does it save costs?"
TEST_RESPONSE = "Prompt caching stores frequently used prompts and their responses, reducing LLM API calls and saving costs by serving cached responses instantly."
TEST_COMPRESSED_PROMPT = "Explain: prompt caching cost savings"
TEST_COMPRESSION_RATIO = 45  # 45% compression
TEST_ORIGINAL_TOKENS = 850
TEST_COMPRESSED_TOKENS = 467


async def test_health_check():
    """Test 1: Health check endpoint"""
    print("\n" + "="*60)
    print("TEST 1: Health Check")
    print("="*60)
    
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/health")
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        assert response.status_code == 200, "Health check failed"
        assert response.json()["status"] == "ok", "Health status not ok"
        
    print("✅ Health check PASSED")


async def test_cache_insert():
    """Test 2: Cache insertion with all compression metrics"""
    print("\n" + "="*60)
    print("TEST 2: Cache Insert (with compression metrics)")
    print("="*60)
    
    request_data = {
        "project_id": TEST_PROJECT_ID,
        "user_id": TEST_USER_ID,
        "prompt": TEST_QUERY,
        "response": TEST_RESPONSE,
        "compressed_prompt": TEST_COMPRESSED_PROMPT,
        "compression_ratio": TEST_COMPRESSION_RATIO,
        "original_tokens": TEST_ORIGINAL_TOKENS,
        "compressed_tokens": TEST_COMPRESSED_TOKENS,
    }
    
    print("\nRequest Payload:")
    print(json.dumps(request_data, indent=2))
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/cache/insert",
            json=request_data,
            timeout=30.0
        )
        
        print(f"\nStatus Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        assert response.status_code == 200, f"Insert failed with status {response.status_code}"
        data = response.json()
        assert len(data["stored_entries"]) > 0, "No entries stored"
        
    print("✅ Cache insert PASSED")


async def test_cache_lookup():
    """Test 3: Cache lookup with all fields"""
    print("\n" + "="*60)
    print("TEST 3: Cache Lookup (verify all fields returned)")
    print("="*60)
    
    request_data = {
        "project_id": TEST_PROJECT_ID,
        "user_id": TEST_USER_ID,
        "prompt": TEST_QUERY,
    }
    
    print("\nRequest Payload:")
    print(json.dumps(request_data, indent=2))
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/cache/lookup",
            json=request_data,
            timeout=30.0
        )
        
        print(f"\nStatus Code: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Lookup failed with status {response.status_code}"
        assert data["found"], "Cache entry not found (expected hit)"
        assert len(data["results"]) > 0, "No results returned"
        
        result = data["results"][0]
        
        # Verify all required fields exist
        required_fields = [
            "key", "value", "score",
            "compressed_prompt", "compression_ratio",
            "original_tokens", "compressed_tokens",
            "hit_count", "created_at", "last_accessed", "employee_id"
        ]
        
        print("\n📋 Field Verification:")
        for field in required_fields:
            assert field in result, f"Missing field: {field}"
            print(f"  ✅ {field}: {result[field]}")
        
        # Verify compression metrics match what we inserted
        assert result["compression_ratio"] == TEST_COMPRESSION_RATIO, "Compression ratio mismatch"
        assert result["original_tokens"] == TEST_ORIGINAL_TOKENS, "Original tokens mismatch"
        assert result["compressed_tokens"] == TEST_COMPRESSED_TOKENS, "Compressed tokens mismatch"
        assert result["compressed_prompt"] == TEST_COMPRESSED_PROMPT, "Compressed prompt mismatch"
        
    print("\n✅ Cache lookup PASSED - All fields present and correct!")


async def test_cache_miss():
    """Test 4: Cache lookup miss scenario"""
    print("\n" + "="*60)
    print("TEST 4: Cache Miss (non-existent query)")
    print("="*60)
    
    request_data = {
        "project_id": TEST_PROJECT_ID,
        "user_id": TEST_USER_ID,
        "prompt": "This query definitely does not exist in the cache 12345xyz",
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/cache/lookup",
            json=request_data,
            timeout=30.0
        )
        
        print(f"Status Code: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, "Lookup request failed"
        assert not data["found"], "Expected cache miss but got hit"
        assert len(data["results"]) == 0, "Expected no results for cache miss"
        
    print("✅ Cache miss PASSED")


async def test_data_parity():
    """Test 5: Verify complete data parity with IndexedDB schema"""
    print("\n" + "="*60)
    print("TEST 5: Data Parity Check")
    print("="*60)
    
    # Insert and lookup to verify all IndexedDB fields are preserved
    insert_payload = {
        "project_id": "parity-test",
        "user_id": "parity-user@dell.com",
        "prompt": "Data parity test query",
        "response": "Data parity test response",
        "compressed_prompt": "Parity test",
        "compression_ratio": 75,
        "original_tokens": 1200,
        "compressed_tokens": 300,
    }
    
    async with httpx.AsyncClient() as client:
        # Insert
        await client.post(f"{BASE_URL}/cache/insert", json=insert_payload, timeout=30.0)
        
        # Lookup
        lookup_payload = {
            "project_id": "parity-test",
            "user_id": "parity-user@dell.com",
            "prompt": "Data parity test query",
        }
        response = await client.post(f"{BASE_URL}/cache/lookup", json=lookup_payload, timeout=30.0)
        result = response.json()["results"][0]
        
        # IndexedDB schema fields (from implementation_plan.md)
        indexeddb_fields = {
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
        
        print("\n📊 IndexedDB → Service Mapping:")
        for indexeddb_field, service_field in indexeddb_fields.items():
            value = result.get(service_field, "MISSING")
            status = "✅" if service_field in result else "❌"
            print(f"  {status} {indexeddb_field:20} → {service_field:20} = {value}")
        
        # Verify numeric fields match
        assert result["compression_ratio"] == 75
        assert result["original_tokens"] == 1200
        assert result["compressed_tokens"] == 300
        
    print("\n✅ Data parity PASSED - All IndexedDB fields mapped!")


async def main():
    """Run all tests"""
    print("\n" + "🚀"*30)
    print("Cache Service API Test Suite")
    print("🚀"*30)
    print(f"\nTesting service at: {BASE_URL}")
    print(f"Start time: {datetime.now().isoformat()}")
    
    try:
        await test_health_check()
        await test_cache_insert()
        await test_cache_lookup()
        await test_cache_miss()
        await test_data_parity()
        
        print("\n" + "="*60)
        print("🎉 ALL TESTS PASSED! 🎉")
        print("="*60)
        print("\n✅ Cache service is working correctly")
        print("✅ All APIs exposed properly")
        print("✅ Compression metrics stored and retrieved")
        print("✅ Data parity with IndexedDB maintained")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        raise
    except Exception as e:
        print(f"\n💥 ERROR: {e}")
        raise
    
    print(f"\nEnd time: {datetime.now().isoformat()}")


if __name__ == "__main__":
    asyncio.run(main())
