import asyncio
import os
import sys

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Load env vars manually since python-dotenv might not be installed
from prompt_cache_service.db_handler.embedding import HuggingFaceEmbeddingProvider

async def test_embedding():
    print("🧪 Testing HuggingFace Embedding Provider...")
    
    api_key = os.getenv("HUGGINGFACEHUB_API_KEY")
    if not api_key:
        print("Skipping test: HUGGINGFACEHUB_API_KEY not set")
        return
    print(f"🔑 Using API Key: {api_key[:4]}...{api_key[-4:]}")
    
    try:
        provider = HuggingFaceEmbeddingProvider(
            api_key=api_key,
            model_name="BAAI/bge-small-en-v1.5"
        )
        
        text = "This is a test verifying the embedding connection."
        print(f"📡 Sending text: '{text}'")
        
        embedding = await provider.embed(text)
        
        print(f"✅ Success! Generated embedding.")
        print(f"📊 Dimensions: {len(embedding)}")
        print(f"🔢 First 5 values: {embedding[:5]}")
        
        if len(embedding) == 384:
            print("✨ Dimensions match expected (384) for MiniLM-L6-v2")
        else:
            print(f"⚠️  Dimensions mismatch! Expected 384, got {len(embedding)}")
            
    except Exception as e:
        print(f"❌ Failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_embedding())
