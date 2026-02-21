import os
from huggingface_hub import InferenceClient

def test_hf_client():
    api_key = os.getenv("HUGGINGFACEHUB_API_KEY")
    if not api_key:
        print("Skipping test: HUGGINGFACEHUB_API_KEY not set")
        return
    model = "BAAI/bge-small-en-v1.5"
    
    print(f"🧪 Testing with huggingface_hub client...")
    print(f"🔑 Token: {api_key[:4]}...")
    print(f"🤖 Model: {model}")
    
    client = InferenceClient(token=api_key)
    
    try:
        # feature_extraction is the task for embeddings
        response = client.feature_extraction("This is a test", model=model)
        
        print("\n✅ Success!")
        print(f"📊 Dimensions: {len(response)}")
        print(f"Values: {response[:3]}...")
        
        if len(response) == 384:
            print("✨ Dimensions match standard (384)")
        
    except Exception as e:
        print(f"\n❌ Failed: {e}")

if __name__ == "__main__":
    test_hf_client()
