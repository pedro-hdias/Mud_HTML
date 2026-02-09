# MUD HTML v2

Web-based MUD client implementation.

## Configuration

### Debug Mode

By default, debug endpoints are disabled for security reasons. To enable debug endpoints for development:

```bash
# Using environment variable
export DEBUG=true
uvicorn app.main:app --reload

# Or inline
DEBUG=true uvicorn app.main:app --reload

# With Docker Compose
# Edit docker-compose.yml and add to environment section:
environment:
  - DEBUG=true
```

#### Debug Endpoints

When `DEBUG=true`, the following endpoints are available:

- `/sessions` - Web page to view active sessions
- `/api/sessions/status` - API endpoint returning session status with internal identifiers and activity timestamps
- `/logs` - Web page to view application logs in real-time
- `/api/logs/stream` - Server-sent events stream for log data

**⚠️ Security Warning**: These endpoints expose internal system information and should **never** be enabled in production environments.

## Running the Application

### Development Mode (with debug endpoints)

```bash
DEBUG=true uvicorn app.main:app --reload
```

### Production Mode (debug endpoints disabled)

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Or using Docker:

```bash
docker build -t mudclient .
docker run -p 8000:8000 mudclient
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEBUG` | `false` | Enable debug endpoints. Set to `true`, `1`, or `yes` to enable |
