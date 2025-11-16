# Node Output Logging

Each node in the TenderAI BF pipeline now logs its output to a separate JSON file in `/app/logs/nodes/`. This provides detailed visibility into what each step produces and helps with debugging and monitoring.

## Overview

- **Location:** `/app/logs/nodes/`
- **Format:** JSON files, one per node
- **Behavior:** Each node clears its output file at the start and writes its results at the end

## Node Output Files

### 1. `load_sources.json`
**What it logs:** List of active sources loaded from configuration/database

**Structure:**
```json
[
  {
    "_logged_at": "2025-11-15T10:30:00.123456",
    "_run_id": "abc-123-def",
    "_node": "load_sources",
    "data": [
      {
        "id": 1,
        "name": "DGCMEF RAG",
        "list_url": "https://www.dgcmef.gov.bf/fr/appels-d-offre",
        "parser_type": "pdf_rag",
        "enabled": true
      }
    ]
  }
]
```

### 2. `fetch_listings.json`
**What it logs:** Raw listing page fetches (HTML or PDF quotidien table)

**Structure:**
```json
[
  {
    "_logged_at": "2025-11-15T10:30:15.456",
    "_run_id": "abc-123-def",
    "_node": "fetch_listings",
    "data": [
      {
        "url": "https://www.dgcmef.gov.bf/fr/appels-d-offre",
        "status": "success",
        "content": "...",
        "content_type": "text/html",
        "source": {...}
      }
    ]
  }
]
```

### 3. `extract_item_links.json`
**What it logs:** Extracted links to individual tender items or PDFs

**Structure:**
```json
[
  {
    "_logged_at": "2025-11-15T10:30:20.789",
    "_run_id": "abc-123-def",
    "_node": "extract_item_links",
    "data": [
      {
        "url": "https://example.com/quotidien.pdf",
        "type": "pdf_rag",
        "source": "DGCMEF RAG",
        "title": "Quotidien N°4269"
      },
      "https://www.joffres.net/appeloffre/123",
      "https://www.arcop.bf/tender/456"
    ]
  }
]
```

### 4. `fetch_items.json`
**What it logs:** Fetched content for each individual item (HTML pages, PDF bytes)

**Structure:**
```json
[
  {
    "_logged_at": "2025-11-15T10:30:35.012",
    "_run_id": "abc-123-def",
    "_node": "fetch_items",
    "data": [
      {
        "url": "https://example.com/quotidien.pdf",
        "content": "<binary data>",
        "content_type": "application/pdf",
        "status": "success",
        "size": 2211840,
        "parser_type": "pdf_rag"
      }
    ]
  }
]
```

### 5. `parse_extract.json`
**What it logs:** Parsed and extracted tender data with structured fields

**Structure:**
```json
[
  {
    "_logged_at": "2025-11-15T10:31:45.234",
    "_run_id": "abc-123-def",
    "_node": "parse_extract",
    "data": [
      {
        "id": "DGCMEF_RAG_0_1731667905",
        "entity": "Ministère de l'Éducation",
        "reference": "AO-2025/001/MEN",
        "description": "Acquisition de matériel informatique",
        "deadline": "2025-02-15",
        "category": "IT",
        "relevance_score": 0.95,
        "content_hash": "abc123def456...",
        "source": "DGCMEF RAG"
      }
    ]
  }
]
```

### 6. `classify.json`
**What it logs:** Items classified as relevant for IT/Engineering

**Structure:**
```json
[
  {
    "_logged_at": "2025-11-15T10:32:00.567",
    "_run_id": "abc-123-def",
    "_node": "classify",
    "data": [
      {
        "id": "DGCMEF_RAG_0_1731667905",
        "entity": "Ministère de l'Éducation",
        "is_relevant": true,
        "relevance_score": 0.95,
        "category": "IT",
        "classification_method": "llm"
      }
    ]
  }
]
```

### 7. `deduplicate.json`
**What it logs:** Unique items after deduplication

**Structure:**
```json
[
  {
    "_logged_at": "2025-11-15T10:32:10.890",
    "_run_id": "abc-123-def",
    "_node": "deduplicate",
    "data": [
      {
        "id": "DGCMEF_RAG_0_1731667905",
        "entity": "Ministère de l'Éducation",
        "is_duplicate": false,
        "content_hash": "abc123def456..."
      },
      {
        "id": "DGCMEF_RAG_1_1731667906",
        "entity": "Ministère de la Santé",
        "is_duplicate": false,
        "content_hash": "def789ghi012..."
      }
    ]
  }
]
```

### 8. `summarize.json`
**What it logs:** Generated summaries for each tender

**Structure:**
```json
[
  {
    "_logged_at": "2025-11-15T10:32:25.123",
    "_run_id": "abc-123-def",
    "_node": "summarize",
    "data": {
      "DGCMEF_RAG_0_1731667905": "Le Ministère de l'Éducation lance un appel d'offres pour l'acquisition de matériel informatique...",
      "DGCMEF_RAG_1_1731667906": "Le Ministère de la Santé recherche un prestataire pour le développement d'un système de gestion..."
    }
  }
]
```

### 9. `compose_report.json`
**What it logs:** Report generation metadata

**Structure:**
```json
[
  {
    "_logged_at": "2025-11-15T10:32:40.456",
    "_run_id": "abc-123-def",
    "_node": "compose_report",
    "data": {
      "report_url": "http://localhost:9000/tenderai-bf/reports/abc-123-def.docx",
      "report_size": 245678,
      "unique_items_count": 52
    }
  }
]
```

### 10. `email_report.json`
**What it logs:** Email sending status

**Structure:**
```json
[
  {
    "_logged_at": "2025-11-15T10:32:50.789",
    "_run_id": "abc-123-def",
    "_node": "email_report",
    "data": {
      "success": true,
      "recipients_count": 1,
      "sent_at": 1731668370.789
    }
  }
]
```

## Viewing Node Outputs

### View Latest Output
```bash
# View specific node output
cat /app/logs/nodes/parse_extract.json | jq .

# View with pretty formatting
cat /app/logs/nodes/deduplicate.json | jq '.[] | .data'

# Count items in output
cat /app/logs/nodes/parse_extract.json | jq '.[] | .data | length'
```

### View Run-Specific Data
```bash
# Filter by run_id
cat /app/logs/nodes/classify.json | jq '.[] | select(._run_id == "abc-123-def")'

# Get data for latest run
cat /app/logs/nodes/deduplicate.json | jq '.[-1].data'
```

### Monitor in Real-Time
```bash
# Watch for changes (while pipeline is running)
watch -n 1 'cat /app/logs/nodes/parse_extract.json | jq ".[] | .data | length"'

# Tail all node logs
tail -f /app/logs/nodes/*.json
```

## Debugging Workflows

### 1. Check Deduplication Issues
```bash
# See how many items before deduplication
cat /app/logs/nodes/classify.json | jq '.[-1].data | length'

# See how many after deduplication
cat /app/logs/nodes/deduplicate.json | jq '.[-1].data | length'

# Find duplicates (if they exist in the data)
cat /app/logs/nodes/deduplicate.json | jq '.[-1].data[] | select(.is_duplicate == true)'
```

### 2. Verify Extraction Quality
```bash
# Check all extracted entities
cat /app/logs/nodes/parse_extract.json | jq '.[-1].data[] | .entity' | sort | uniq

# Find items missing deadlines
cat /app/logs/nodes/parse_extract.json | jq '.[-1].data[] | select(.deadline == null or .deadline == "N/A")'

# Check relevance scores
cat /app/logs/nodes/parse_extract.json | jq '.[-1].data[] | {entity: .entity, score: .relevance_score}'
```

### 3. Classification Analysis
```bash
# Count by category
cat /app/logs/nodes/classify.json | jq '.[-1].data | group_by(.category) | map({category: .[0].category, count: length})'

# Find low relevance scores
cat /app/logs/nodes/classify.json | jq '.[-1].data[] | select(.relevance_score < 0.5)'
```

### 4. Source Performance
```bash
# Count items per source
cat /app/logs/nodes/parse_extract.json | jq '.[-1].data | group_by(.source) | map({source: .[0].source, count: length})'

# Check fetch success rates
cat /app/logs/nodes/fetch_listings.json | jq '.[-1].data | group_by(.status) | map({status: .[0].status, count: length})'
```

## File Clearing Behavior

Each node **clears its output file** at the start of execution:

```python
# At the beginning of each node
clear_node_output("node_name")  # Empties the JSON file

# ... node processing ...

# At the end of node
log_node_output("node_name", data, run_id=state.run_id)  # Writes new data
```

This means:
- ✅ Files always contain the **latest run's data**
- ✅ No mixing of data from different runs
- ✅ Easy to see current pipeline state
- ⚠️ Previous run data is overwritten (check main logs for history)

## Integration with Main Logs

Node outputs complement the main log files:

- **Main logs** (`/app/logs/tenderai.log`): Timestamps, errors, flow control
- **Node outputs** (`/app/logs/nodes/*.json`): Actual data produced by each step

Example workflow:
```bash
# 1. Check main log for overall flow
tail -f /app/logs/tenderai.log | grep "completed"

# 2. Inspect specific node data
cat /app/logs/nodes/parse_extract.json | jq '.[-1].data | length'

# 3. Debug issues
cat /app/logs/nodes/deduplicate.json | jq '.[-1].data[] | select(.is_duplicate == true)'
```

## Performance Tips

### Large Files
If node output files get very large:

```bash
# Count without loading full file
cat /app/logs/nodes/parse_extract.json | jq '.[-1].data | length'

# Stream process large files
jq -c '.[-1].data[]' /app/logs/nodes/parse_extract.json | head -10

# Compress old outputs
gzip /app/logs/nodes/*.json
```

### Disk Space
Monitor disk usage:

```bash
# Check node logs size
du -sh /app/logs/nodes/

# List largest files
du -h /app/logs/nodes/* | sort -rh | head -5

# Clean up if needed (files will be recreated on next run)
rm /app/logs/nodes/*.json
```

## Best Practices

1. **After each run:** Check key node outputs to verify data quality
2. **During development:** Monitor node outputs in real-time to catch issues early
3. **For debugging:** Start from the first failing node and work backwards
4. **Performance tuning:** Check node outputs to identify bottlenecks (e.g., too many items, large payloads)
5. **Data validation:** Use node outputs to verify schema compliance and data completeness

## Troubleshooting

### Files not created
```bash
# Check directory permissions
ls -la /app/logs/nodes/

# Create directory if missing
mkdir -p /app/logs/nodes/
chmod 777 /app/logs/nodes/
```

### Empty files
- Node may have failed before logging
- Check main logs for errors: `grep ERROR /app/logs/tenderai.log`

### Old data persisting
- Ensure node is calling `clear_node_output()` at start
- Check for exceptions preventing file clear

## Related Documentation

- [Deduplication Fix](./DEDUPLICATION_FIX.md) - Understanding the deduplication process
- [API Documentation](../API_DOCUMENTATION.md) - Triggering runs and viewing outputs
- [Technical Specifications](../technical_specifications.md) - Pipeline architecture
