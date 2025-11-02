# TenderAI BF - API Documentation

## 🔌 REST API Reference

Base URL: `http://localhost:8000`

## Authentication

TenderAI BF uses JWT (JSON Web Tokens) for API authentication.

### Login

**Endpoint:** `POST /api/v1/admin/login`

**Request:**
```bash
curl -X POST "http://localhost:8000/api/v1/admin/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123"
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 86400
}
```

**Using the Token:**
```bash
export TOKEN="your-access-token-here"
curl "http://localhost:8000/api/v1/runs" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📊 Pipeline Runs

### Trigger Pipeline Run

**Endpoint:** `POST /api/v1/runs/trigger`

**Authentication:** Optional (recommended)

**Request Body:**
```json
{
  "triggered_by": "api",
  "triggered_by_user": "john.doe",
  "sources": ["armp", "mtd"],
  "send_email": true,
  "dry_run": false
}
```

**Response:**
```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "started_at": "2024-11-01T07:30:00Z",
  "triggered_by": "api",
  "triggered_by_user": "john.doe"
}
```

### Get Run Status

**Endpoint:** `GET /api/v1/runs/{run_id}/status`

**Response:**
```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "started_at": "2024-11-01T07:30:00Z",
  "completed_at": "2024-11-01T07:35:42Z",
  "duration_seconds": 342.5,
  "triggered_by": "api",
  "error_occurred": false,
  "errors_count": 0,
  "stats": {
    "sources_checked": 3,
    "items_parsed": 45,
    "relevant_items": 12,
    "unique_items": 10
  },
  "report_url": "http://minio:9000/tenderai-bf/reports/550e8400/rapport.docx"
}
```

### List Runs

**Endpoint:** `GET /api/v1/runs`

**Query Parameters:**
- `page` (default: 1)
- `page_size` (default: 20)
- `status_filter` (optional): completed, failed, running

**Response:**
```json
{
  "runs": [
    {
      "run_id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "completed",
      "started_at": "2024-11-01T07:30:00Z",
      "completed_at": "2024-11-01T07:35:42Z",
      "duration_seconds": 342.5,
      "stats": {
        "unique_items": 10
      }
    }
  ],
  "total": 156,
  "page": 1,
  "page_size": 20
}
```

### Get Run Statistics

**Endpoint:** `GET /api/v1/runs/stats`

**Response:**
```json
{
  "total_runs": 156,
  "successful_runs": 142,
  "failed_runs": 14,
  "running": 0,
  "average_duration_seconds": 325.8,
  "last_run": {
    "run_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "started_at": "2024-11-01T07:30:00Z"
  }
}
```

### Delete Run

**Endpoint:** `DELETE /api/v1/runs/{run_id}`

**Authentication:** Required

**Response:** `204 No Content`

---

## 🌐 Sources Management

### List Sources

**Endpoint:** `GET /api/v1/sources`

**Query Parameters:**
- `enabled_only` (default: false)

**Response:**
```json
{
  "sources": [
    {
      "id": 1,
      "name": "ARMP - Autorité de Régulation des Marchés Publics",
      "list_url": "https://www.armp.bf/index.php?page=avis-appel-offres",
      "parser": "html",
      "rate_limit": "8/m",
      "enabled": true,
      "last_check_at": "2024-11-01T07:30:00Z",
      "last_success_at": "2024-11-01T07:30:00Z",
      "last_error": null
    }
  ],
  "total": 5
}
```

### Get Source

**Endpoint:** `GET /api/v1/sources/{source_id}`

### Create Source

**Endpoint:** `POST /api/v1/sources`

**Authentication:** Required

**Request Body:**
```json
{
  "name": "New Ministry Portal",
  "list_url": "https://ministry.gov.bf/tenders",
  "item_url_pattern": "https://ministry.gov.bf/tender/{id}",
  "parser": "html",
  "rate_limit": "10/m",
  "enabled": true,
  "selectors": {
    "title": ".tender-title",
    "description": ".tender-description",
    "deadline": ".deadline"
  }
}
```

### Update Source

**Endpoint:** `PUT /api/v1/sources/{source_id}`

**Authentication:** Required

### Delete Source

**Endpoint:** `DELETE /api/v1/sources/{source_id}`

**Authentication:** Required

### Test Source

**Endpoint:** `POST /api/v1/sources/{source_id}/test`

**Response:**
```json
{
  "status": "success",
  "source_id": 1,
  "source_name": "ARMP",
  "content_length": 45678,
  "message": "Successfully fetched 45678 bytes from source"
}
```

---

## 📄 Reports

### List Reports

**Endpoint:** `GET /api/v1/reports`

**Query Parameters:**
- `limit` (default: 50)

**Response:**
```json
{
  "reports": [
    {
      "run_id": "550e8400-e29b-41d4-a716-446655440000",
      "report_url": "http://minio:9000/tenderai-bf/reports/550e8400/rapport.docx",
      "created_at": "2024-11-01T07:35:42Z",
      "format": "docx"
    }
  ],
  "total": 142
}
```

### Get Report Info

**Endpoint:** `GET /api/v1/reports/{run_id}`

### Download Report

**Endpoint:** `GET /api/v1/reports/{run_id}/download`

**Response:** Binary DOCX file

```bash
curl "http://localhost:8000/api/v1/reports/{run_id}/download" \
  -o rapport.docx
```

### Preview Report

**Endpoint:** `GET /api/v1/reports/{run_id}/preview`

**Response:**
```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2024-11-01T07:35:42Z",
  "status": "completed",
  "stats": {
    "total_items": 45,
    "relevant_items": 12,
    "unique_items": 10
  },
  "notices_preview": [
    {
      "title": "Développement d'une plateforme e-gouvernement",
      "organization": "Ministère de la Transition Digitale",
      "deadline": "2024-12-15T23:59:59Z",
      "url": "https://mtd.gov.bf/tender/123",
      "is_relevant": true
    }
  ],
  "total_notices": 10
}
```

### Regenerate Report

**Endpoint:** `POST /api/v1/reports/{run_id}/regenerate`

**Authentication:** Required

---

## 🔧 Admin & Settings

### Get Current User

**Endpoint:** `GET /api/v1/admin/me`

**Authentication:** Required

**Response:**
```json
{
  "username": "admin",
  "email": "admin@tenderai.bf",
  "is_active": true,
  "is_admin": true
}
```

### Test Email

**Endpoint:** `POST /api/v1/admin/test-email`

**Authentication:** Required

**Request Body:**
```json
{
  "to_address": "test@example.com",
  "subject": "Test Email",
  "body": "This is a test email from TenderAI BF"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Test email sent to test@example.com",
  "to_address": "test@example.com"
}
```

### Get Settings

**Endpoint:** `GET /api/v1/admin/settings`

**Authentication:** Required

**Response:**
```json
{
  "app_name": "TenderAI BF",
  "app_version": "1.0.0",
  "environment": "production",
  "debug": false,
  "database": {
    "url_masked": "***"
  },
  "email": {
    "smtp_server": "smtp.gmail.com",
    "smtp_port": 587
  },
  "pipeline": {
    "max_items_per_source": 100,
    "max_total_items": 500
  },
  "scheduler": {
    "enabled": true,
    "cron_schedule": "30 7 * * 1-5",
    "timezone": "Africa/Ouagadougou"
  }
}
```

### Clear Cache

**Endpoint:** `POST /api/v1/admin/clear-cache`

**Authentication:** Required

### Reload Config

**Endpoint:** `POST /api/v1/admin/reload-config`

**Authentication:** Required

---

## 🏥 Health & Monitoring

### Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "environment": "production",
  "components": {
    "database": {
      "status": "healthy",
      "url": "postgresql://...",
      "pool_size": 10
    },
    "storage": {
      "status": "healthy",
      "endpoint": "http://minio:9000",
      "bucket": "tenderai-bf"
    },
    "email": {
      "status": "configured",
      "smtp_server": "smtp.gmail.com"
    }
  }
}
```

### Liveness Probe

**Endpoint:** `GET /health/live`

**Response:**
```json
{
  "status": "alive"
}
```

### Readiness Probe

**Endpoint:** `GET /health/ready`

**Response:**
```json
{
  "status": "ready",
  "ready": true,
  "checks": {
    "database": true,
    "storage": true
  }
}
```

### Metrics (Prometheus)

**Endpoint:** `GET /metrics`

**Response:** Prometheus text format
```
# HELP tenderai_info Application information
# TYPE tenderai_info gauge
tenderai_info{version="1.0.0",environment="production"} 1

# HELP tenderai_db_pool_size Database connection pool size
# TYPE tenderai_db_pool_size gauge
tenderai_db_pool_size 10

# HELP tenderai_db_health Database health status
# TYPE tenderai_db_health gauge
tenderai_db_health 1
```

---

## 📝 Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `202 Accepted` - Request accepted for processing
- `204 No Content` - Request successful, no content to return
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict (duplicate)
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Service temporarily unavailable

---

## 🔐 Security Best Practices

1. **Change Default Credentials**
   - Update admin password in `.env`
   - Generate new JWT secret: `openssl rand -hex 32`

2. **Use HTTPS in Production**
   - Configure reverse proxy (nginx/Caddy)
   - Enable TLS certificates

3. **Rotate JWT Tokens**
   - Tokens expire after 24 hours
   - Re-authenticate for long-running operations

4. **Rate Limiting**
   - Implement API rate limiting in production
   - Use nginx or cloud provider rate limiting

5. **Monitor API Usage**
   - Use `/metrics` endpoint with Prometheus
   - Track failed authentication attempts

---

## 📚 Additional Resources

- **Interactive API Docs**: http://localhost:8000/docs
- **ReDoc Documentation**: http://localhost:8000/redoc
- **OpenAPI Spec**: http://localhost:8000/openapi.json
- **Gradio UI**: http://localhost:7860

---

## 🆘 Support

For API support, please contact:
- Email: dev@yulcom.com
- GitHub Issues: https://github.com/your-org/tenderai-bf/issues