# Ollama Integration Guide

This guide explains how to use Ollama as a local LLM provider for TenderAI BF.

## What is Ollama?

Ollama allows you to run large language models locally on your machine, providing:
- **No API costs** - Run models for free on your hardware
- **Privacy** - Data never leaves your system
- **No rate limits** - Process as much as your hardware allows
- **Offline operation** - No internet required after model download

## Prerequisites

### 1. Install Ollama

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**macOS:**
```bash
brew install ollama
```

**Windows:**
Download from https://ollama.com/download

### 2. Install langchain-ollama Package

```bash
pip install langchain-ollama
```

Or add to your requirements/pyproject.toml:
```toml
langchain-ollama = "^0.1.0"
```

## Quick Start

### 1. Start Ollama Service

```bash
ollama serve
```

The server will start on `http://localhost:11434` by default.

### 2. Download a Model

Choose a model based on your hardware and needs:

**Recommended for testing (lighter models):**
```bash
# Llama 3.1 8B (recommended, good balance)
ollama pull llama3.1

# Mistral 7B (fast, good quality)
ollama pull mistral

# Phi-3 (very lightweight, 3.8GB)
ollama pull phi3
```

**For better quality (larger models):**
```bash
# Llama 3.1 70B (requires powerful hardware)
ollama pull llama3.1:70b

# Mixtral 8x7B (good quality, moderate size)
ollama pull mixtral
```

**List available models:**
```bash
ollama list
```

### 3. Configure TenderAI BF

**Option A: Environment Variables (recommended)**

Create/update your `.env` file:
```bash
# Set Ollama as the LLM provider
LLM_PROVIDER=ollama

# Ollama configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

**Option B: settings.yaml**

Update your `settings.yaml`:
```yaml
langchain:
  llm_provider: "ollama"
  ollama_base_url: "http://localhost:11434"
  ollama_model: "llama3.1"
```

### 4. Test the Integration

```bash
# Run a simple test
python -c "
from tenderai_bf.utils.llm_utils import get_llm_instance
llm = get_llm_instance()
if llm:
    response = llm.invoke('Bonjour! Présentez-vous en une phrase.')
    print(response.content)
else:
    print('Failed to initialize Ollama')
"
```

## Running Tests with Ollama

### PDF RAG Extraction Test

```bash
cd /app/tests/nodes
LLM_PROVIDER=ollama python test_pdf_rag.py
```

The configuration will be logged at the start:
```
Starting PDF parsing
  llm_provider='ollama'
  llm_model='llama3.1'
  chunk_size=76800
  chunk_overlap=2400
```

### View Extracted Results

```bash
# View all extracted tenders
cat /app/logs/extracted_tenders.json | jq .

# Count tenders by test
cat /app/logs/extracted_tenders.json | jq -r '._test_name' | sort | uniq -c

# View specific test results
cat /app/logs/extracted_tenders.json | jq 'select(._test_name == "test_full_rag_extraction")'
```

## Model Selection Guide

### By Use Case

**PDF Extraction (French documents):**
- `llama3.1` - Good multilingual support
- `mistral` - Excellent for French
- `mixtral` - Best quality, larger size

**Quick Testing:**
- `phi3` - Very fast, smaller
- `mistral` - Good balance

**Production Quality:**
- `llama3.1:70b` - Best quality (requires powerful GPU)
- `mixtral` - Good quality, reasonable size

### Hardware Requirements

| Model | Size | RAM Needed | GPU VRAM | Speed |
|-------|------|------------|----------|-------|
| phi3 | 3.8GB | 8GB | Optional | Very Fast |
| mistral | 7.2GB | 16GB | 4GB+ | Fast |
| llama3.1 | 8.0GB | 16GB | 6GB+ | Medium |
| mixtral | 26GB | 32GB | 12GB+ | Slow |
| llama3.1:70b | 70GB | 64GB | 40GB+ | Very Slow |

## Configuration Options

### Complete Ollama Settings

In `config.py`, the following fields are available:
```python
ollama_base_url: str = "http://localhost:11434"  # Ollama server URL
ollama_model: str = "llama3.1"  # Model name
temperature: float = 0.1  # Sampling temperature (0.0-1.0)
max_tokens: int = 2048  # Maximum response length
```

### Environment Variables

All settings can be overridden with environment variables:
```bash
OLLAMA_BASE_URL=http://your-ollama-server:11434
OLLAMA_MODEL=mistral
LLM_PROVIDER=ollama
```

## Troubleshooting

### Ollama Not Running

**Error:** `Failed to instantiate Ollama LLM`

**Solution:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama if not running
ollama serve
```

### Model Not Found

**Error:** `model 'llama3.1' not found`

**Solution:**
```bash
# Pull the model
ollama pull llama3.1

# List available models
ollama list
```

### langchain-ollama Not Installed

**Error:** `langchain-ollama not installed`

**Solution:**
```bash
pip install langchain-ollama
```

### Slow Performance

**Solutions:**
- Use a smaller model (`phi3`, `mistral`)
- Reduce `chunk_size` in settings
- Enable GPU acceleration (install CUDA/ROCm)
- Use a machine with more RAM/VRAM

### Remote Ollama Server

If running Ollama on a different machine:

```bash
# On remote machine (expose Ollama)
OLLAMA_HOST=0.0.0.0:11434 ollama serve

# In TenderAI BF .env
OLLAMA_BASE_URL=http://remote-server-ip:11434
```

## Performance Comparison

### Groq vs Ollama

| Aspect | Groq | Ollama |
|--------|------|--------|
| Cost | API fees | Free (hardware cost) |
| Speed | Very fast | Depends on hardware |
| Rate Limits | 6000 TPM | No limits |
| Privacy | Cloud-based | Local only |
| Setup | API key only | Install + download models |
| Models | Limited selection | Many options |

### Recommended Workflow

**Development/Testing:**
- Use Ollama with `llama3.1` or `mistral` for free local testing
- No rate limits, faster iteration

**Production:**
- Use Groq with `llama-3.3-70b-versatile` for quality
- Use Ollama as fallback for rate limit issues
- Consider OpenAI for critical extractions

## Advanced Usage

### Multiple Models

Switch models on the fly:
```python
from tenderai_bf.utils.llm_utils import get_llm_instance

# Use different models for different tasks
fast_llm = get_llm_instance()  # Uses config default
quality_llm = get_llm_instance()  # Same model

# Note: To use different models, update OLLAMA_MODEL env var
```

### Custom Ollama Server

For production deployments:
```yaml
# docker-compose.yml
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-models:/root/.ollama
    environment:
      - OLLAMA_MODELS=/root/.ollama/models
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

volumes:
  ollama-models:
```

Then configure TenderAI BF:
```bash
OLLAMA_BASE_URL=http://ollama:11434
```

## Best Practices

1. **Model Selection:** Start with `llama3.1`, upgrade to `mixtral` if quality issues
2. **Chunk Size:** Reduce `chunk_size` for faster processing (e.g., 512-2048)
3. **Temperature:** Keep at 0.1 for consistent extraction
4. **Monitoring:** Watch Ollama logs: `journalctl -u ollama -f`
5. **GPU Acceleration:** Install CUDA for significant speedup

## Next Steps

- Read [tests/nodes/README.md](../../tests/nodes/README.md) for testing examples
- Check [tests/nodes/QUICKSTART.md](../../tests/nodes/QUICKSTART.md) for quick commands
- Review [API_DOCUMENTATION.md](../../API_DOCUMENTATION.md) for API usage
- See [technical_specifications.md](../../technical_specifications.md) for architecture

## Support

For Ollama-specific issues:
- Ollama Documentation: https://ollama.com/docs
- GitHub: https://github.com/ollama/ollama

For TenderAI BF integration:
- Check logs in `/app/logs/`
- Enable debug logging: `LOG_LEVEL=DEBUG`
- Review configuration in `settings.yaml`
