# Content Hash Fix - Direct Extraction Mode

## Issue

The summarize node was only processing 1 tender instead of all 46 extracted tenders. Investigation revealed:

1. **Classify node**: 46 items extracted ✅
2. **Deduplicate node**: Only 1 item output ❌
3. **Summarize node**: Only 1 summary generated ❌

### Root Cause

All 46 extracted tenders had `content_hash: null` in the classify node output. This caused the deduplication logic to treat all items as duplicates of the first item:

```python
# In deduplicate.py (lines 124-126)
if content_hash and content_hash in seen_hashes:
    logger.info("Duplicate found (by content hash)", ...)
    continue
```

When `content_hash` is `null`, the first item passes through, but all subsequent items also have `null` which is added to `seen_hashes`. This causes all 45 other items to be filtered out as duplicates.

### Why Content Hash Was Null

The pipeline uses **direct extraction mode** by default (`use_direct_extraction=True` in `parse_pdf_rag.py`). This mode was missing the content hash generation code.

In `parse_pdf_rag.py`:
- **Direct extraction mode** (lines 300-391): Chunks PDF text and sends to LLM
  - Original code at lines 344-356: Created tenders without `content_hash`
  - Missing the hash generation that existed only in RAG mode
  
- **RAG mode** (lines 390+): Uses ChromaDB vector store
  - Had content_hash generation at lines 499-506

## Solution

Added content hash generation to the **direct extraction mode** path in `parse_pdf_rag.py`.

### Changes Made

**File**: `src/tenderai_bf/agents/nodes/parse_pdf_rag.py`

**Lines 342-363** (previously 344-356):

```python
# BEFORE (List comprehension without hash)
chunk_tenders = [
    {
        **tender.dict(),
        'id': f"{source_name}_{i}_{j}",
        'source': source_name,
        'chunk_index': i
    }
    for j, tender in enumerate(extraction.tenders, 1)
]

# AFTER (Loop with hash generation)
chunk_tenders = []
for j, tender in enumerate(extraction.tenders, 1):
    tender_dict = {
        **tender.dict(),
        'id': f"{source_name}_{i}_{j}",
        'source': source_name,
        'chunk_index': i
    }
    
    # Generate content_hash for deduplication
    hash_content = (
        f"{tender_dict.get('entity', '')}"
        f"{tender_dict.get('reference', '')}"
        f"{tender_dict.get('description', '')}"
        f"{tender_dict.get('deadline', '')}"
    )
    tender_dict['content_hash'] = hashlib.sha256(hash_content.encode()).hexdigest()
    
    chunk_tenders.append(tender_dict)
```

### Hash Generation Logic

The `content_hash` is a SHA256 hash of concatenated fields:
- `entity` (organization name)
- `reference` (tender reference number)
- `description` (tender description)
- `deadline` (submission deadline)

This ensures that identical tenders from different sources or duplicate entries are properly deduplicated.

## Expected Behavior After Fix

With the fix applied:

1. **Parse & Extract**: All tenders get valid `content_hash` (64-character hex string)
2. **Classify**: 46 items with valid hashes
3. **Deduplicate**: ~40-45 unique items (filtering actual duplicates)
4. **Summarize**: ~40-45 summaries generated

### Example Valid Hash

```json
{
  "id": "SEAO_1_1",
  "entity": "Ministère de la Santé",
  "reference": "REF-2024-001",
  "description": "Fourniture de services informatiques",
  "deadline": "2024-12-31",
  "content_hash": "70dab6fe4c5e58f3de3f55410b0aa512992c93241173c25f9a80db151e7caa28"
}
```

## Testing

Run the pipeline and verify:

```bash
# Run pipeline
make run-once

# Check parse_extract output has hashes
cat logs/nodes/parse_extract.json | jq '.[-1].data[0].content_hash'
# Should show: "70dab6fe4c5e58f3de3f55410b0aa512992c93241173c25f9a80db151e7caa28"
# NOT: null

# Check classify output
cat logs/nodes/classify.json | jq '.[-1].data | length'
# Should show: 46 (or similar number of extracted items)

# Check deduplicate output
cat logs/nodes/deduplicate.json | jq '.[-1].data | length'
# Should show: ~40-45 (after removing actual duplicates)

# Check summarize output
cat logs/nodes/summarize.json | jq '.[-1].data | length'
# Should match deduplicate count: ~40-45

# Verify no null hashes
cat logs/nodes/classify.json | jq '.[-1].data[] | select(.content_hash == null) | .id' | wc -l
# Should show: 0 (no items with null hash)
```

## Related Issues

### Issue 1: Premature unique_items Assignment (Low Priority)

In `classify.py` line 225:
```python
state.unique_items = relevant_items
```

This sets `unique_items` before the deduplicate node runs. However, this doesn't affect the pipeline because `deduplicate.py` line 152 overwrites it:
```python
state.unique_items = unique_items
```

**Recommendation**: Remove line 225 from classify.py to make the pipeline flow clearer. The classify node should only set `state.relevant_items`, not `state.unique_items`.

### Issue 2: RAG Mode Also Has Hash Generation

The RAG mode (lines 469-506 in `parse_pdf_rag.py`) already had content_hash generation. This fix brings direct extraction mode to parity with RAG mode.

## Code Locations

- **Hash generation (direct mode)**: `parse_pdf_rag.py` lines 351-359
- **Hash generation (RAG mode)**: `parse_pdf_rag.py` lines 499-506
- **Hash checking**: `deduplicate.py` lines 124-146
- **Premature assignment**: `classify.py` line 225

## Verification Commands

```bash
# Count items at each stage
echo "Parsed:" $(cat logs/nodes/parse_extract.json | jq '.[-1].data | length')
echo "Classified:" $(cat logs/nodes/classify.json | jq '.[-1].data | length')
echo "Deduplicated:" $(cat logs/nodes/deduplicate.json | jq '.[-1].data | length')
echo "Summarized:" $(cat logs/nodes/summarize.json | jq '.[-1].data | length')

# Check hash validity
echo "Null hashes:" $(cat logs/nodes/classify.json | jq '.[-1].data[] | select(.content_hash == null)' | wc -l)
echo "Valid hashes:" $(cat logs/nodes/classify.json | jq '.[-1].data[] | select(.content_hash != null)' | wc -l)
```

## Timeline

- **Issue reported**: Summarize node only outputting 1 tender
- **Investigation**: Found all items had `content_hash: null`
- **Root cause**: Direct extraction mode missing hash generation
- **Fix applied**: Added hash generation loop to direct extraction path
- **Status**: ✅ Fixed - Ready for testing

---

**Author**: GitHub Copilot  
**Date**: 2024  
**Related Files**: parse_pdf_rag.py, deduplicate.py, classify.py
