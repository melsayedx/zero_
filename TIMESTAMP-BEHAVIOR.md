# Timestamp Behavior

## Overview

The `timestamp` field is **NEVER PROVIDED** during log ingestion. ClickHouse automatically generates it using `DEFAULT now()`.

## Behavior

### ✅ When Inserting Logs

**Timestamp is always auto-generated:**
```javascript
// Client sends (NO timestamp field)
{
  "app_id": "my-app",
  "level": "INFO",
  "message": "User logged in",
  "source": "api-server"
}

// LogEntry processes without timestamp
// toObject() NEVER includes timestamp field
// ClickHouse generates timestamp on insert using DEFAULT now()
```

**❌ Client cannot provide timestamp:**
```javascript
// Even if client sends timestamp, it's IGNORED
{
  "app_id": "my-app",
  "level": "INFO",
  "message": "User logged in",
  "source": "api-server",
  "timestamp": "2025-11-12T10:30:00.000Z"  // ❌ IGNORED
}

// LogEntry ignores the timestamp field
// ClickHouse generates its own timestamp
```

### ✅ When Reading Logs

**Timestamp is ALWAYS included:**
```javascript
// Reading from database
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "app_id": "my-app",
  "timestamp": "2025-11-12 10:30:15.123",  // ✅ Always present
  "level": "INFO",
  "message": "User logged in",
  "source": "api-server",
  // ... other fields
}
```

## Use Cases

### Real-time Logging
All logs are timestamped by the server when received:

```bash
curl -X POST http://localhost:3000/api/logs \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "my-app",
    "level": "INFO",
    "message": "User action",
    "source": "web-server"
  }'
```

**Benefits:**
- ✅ Simpler payload - no timestamp needed
- ✅ Server time is authoritative
- ✅ No clock sync issues between clients
- ✅ Faster validation (less validation overhead)
- ✅ Consistent timing across all clients
- ✅ No timezone confusion

## Validation Rules

| Scenario | Behavior |
|----------|----------|
| No timestamp in request | ✅ Normal - ClickHouse generates it |
| Timestamp provided in request | ✅ Ignored - ClickHouse generates it anyway |

**There is NO timestamp validation** - the field is never validated or used during insertion.

## Database Schema

```sql
CREATE TABLE logs (
    -- ... other fields
    timestamp DateTime64(3) DEFAULT now() CODEC(Delta, ZSTD(19)),
    -- ... other fields
) ENGINE = MergeTree()
ORDER BY (app_id, timestamp, id);
```

The `DEFAULT now()` ensures timestamp is always populated, even when not provided in INSERT.

## Code Reference

### LogEntry Constructor
```javascript
// In log-entry.js
// Timestamp only set when reading from database (not for insertion)
const timestamp = data.timestamp || null;

// NO validation for timestamp during insertion
// Field is only populated when reading from DB
```

### LogEntry.toObject()
```javascript
// Timestamp is NEVER included in insertion object
toObject() {
  return {
    id: this.id,
    app_id: this.app_id,
    // ... other fields
    // timestamp NOT included - ClickHouse generates it
  };
}
```

## Performance Impact

✅ **Faster ingestion** - Zero timestamp validation overhead
✅ **Smaller payloads** - No timestamp in requests  
✅ **Better reliability** - No clock sync issues between clients
✅ **Same query performance** - Timestamp always indexed and sortable
✅ **Consistent ordering** - Server-side timestamps prevent out-of-order issues

## Important Notes

⚠️ **Historical Data Import**: If you need to import logs with specific timestamps (e.g., from legacy systems), you'll need to:
1. Temporarily modify the code to accept timestamps, OR
2. Insert directly into ClickHouse via SQL with custom timestamps

This design prioritizes real-time logging accuracy over historical import flexibility.

