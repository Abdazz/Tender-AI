# Deduplication Bug Fix

## Problem Description

The deduplication node was incorrectly reducing 54 relevant items to just 1 unique item. The pipeline metrics showed:

```
Items analysés: 54
Avis pertinents: 54
Avis uniques (après dédoublonnage): 1  ❌ INCORRECT
```

## Root Causes

### Issue #1: Missing `content_hash` in RAG-extracted Tenders

**Location:** `src/tenderai_bf/agents/nodes/parse_pdf_rag.py`

**Problem:** When tenders were extracted from PDFs using the RAG parser, the code was not generating a unique `content_hash` for each tender. The `content_hash` field was either missing or `None`.

**Impact:** This caused all tenders to have `content_hash = None`.

**Fix:** Added code to generate a unique `content_hash` for each tender based on its specific content:

```python
# Generate unique content_hash for each tender based on its specific content
# Use entity + reference + description to create a unique hash
hash_content = (
    f"{tender.get('entity', '')}"
    f"{tender.get('reference', '')}"
    f"{tender.get('description', '')}"
    f"{tender.get('deadline', '')}"
)
tender['content_hash'] = hashlib.sha256(hash_content.encode()).hexdigest()
```

### Issue #2: Incorrect Handling of `None` in Deduplication Logic

**Location:** `src/tenderai_bf/agents/nodes/deduplicate.py`

**Problem:** The deduplication logic checked `if content_hash in seen_hashes:` without first verifying that `content_hash` was not `None`. 

**Why this broke everything:**
1. First tender has `content_hash = None`
2. Code adds `None` to `seen_hashes` set: `seen_hashes = {None}`
3. Second tender also has `content_hash = None`
4. Check `if None in seen_hashes:` → **True!**
5. Second tender marked as duplicate ❌
6. This repeats for ALL remaining tenders
7. Result: Only 1 unique item out of 54

**Fix:** Added null-checking before using `content_hash`:

```python
# Check exact hash duplicates first (only if content_hash exists and is not None)
if content_hash and content_hash in seen_hashes:
    item['is_duplicate'] = True
    similar_items.append(item)
    continue

# ... later ...

# Only add hash to seen_hashes if it exists and is not None
if content_hash:
    seen_hashes.add(content_hash)
```

## Changes Made

### 1. `parse_pdf_rag.py`

**Added imports:**
```python
import hashlib
import time
```

**Modified tender processing:**
- Changed `id` generation to use index and timestamp: `f"{source_name}_{idx}_{int(time.time())}"`
- Added `content_hash` generation using entity, reference, description, and deadline
- Ensures each tender has a unique hash even if extracted from the same PDF

### 2. `deduplicate.py`

**Modified deduplication logic:**
- Added null-check before comparing `content_hash` values
- Only add `content_hash` to `seen_hashes` if it's not None
- Added safe `.get('id', 'unknown')` when setting `duplicate_of_id`

## How Deduplication Now Works

1. **Exact Hash Match:** If two tenders have the exact same `content_hash`, they are duplicates
   - Only checked if `content_hash` is not None
   
2. **Title Similarity:** If titles are >= 85% similar (default threshold), they are duplicates
   - Uses fuzzy string matching with RapidFuzz
   - Threshold configurable via `DEDUPLICATION_THRESHOLD` env var

3. **Unique Items:** Items that pass both checks are added to `unique_items`

## Testing

### Before Fix
```
Items analysés: 54
Avis pertinents: 54
Avis uniques: 1  ❌
```

### After Fix (Expected)
```
Items analysés: 54
Avis pertinents: 54
Avis uniques: 50-54  ✅ (depending on actual duplicates)
```

### Manual Testing

Run the pipeline with RAG extraction:

```bash
# Run full pipeline
docker-compose exec api python -m tenderai_bf.cli run

# Check results in logs
tail -f logs/tenderai.log | grep "Deduplicate completed"
```

Should see output like:
```
Deduplicate completed
  relevant_items=54
  unique_items=52
  duplicates_removed=2
```

### Test with Known Data

```bash
cd /app/tests/nodes
python test_deduplicate.py
```

Should show 100% accuracy on deduplication test cases.

## Configuration

The deduplication threshold can be adjusted:

```bash
# .env file
DEDUPLICATION_THRESHOLD=0.85  # 85% similarity threshold
```

- Lower values (e.g., 0.7) = More aggressive deduplication (more items marked as duplicates)
- Higher values (e.g., 0.95) = Less aggressive (only very similar items marked as duplicates)

## Related Files

- `src/tenderai_bf/agents/nodes/parse_pdf_rag.py` - RAG PDF parser
- `src/tenderai_bf/agents/nodes/deduplicate.py` - Deduplication logic
- `src/tenderai_bf/agents/nodes/parse_extract.py` - Coordinates different parsers
- `tests/nodes/test_deduplicate.py` - Deduplication tests
- `src/tenderai_bf/config.py` - Configuration with `deduplication_threshold`

## Prevention

To prevent this issue in the future:

1. **Always generate `content_hash`** for extracted items
2. **Null-check** before using `content_hash` in comparisons
3. **Test deduplication** with real data during development
4. **Monitor metrics** - if unique_items is suspiciously low, investigate

## Notes

- The `content_hash` is based on tender content (entity, reference, description, deadline)
- Two truly identical tenders will have the same hash (correct behavior)
- Minor variations in text will result in different hashes (correct behavior)
- Title similarity check catches near-duplicates with different wording
