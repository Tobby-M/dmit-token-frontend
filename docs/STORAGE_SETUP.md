# Production Storage Setup

This project now supports:

- remote scan-session persistence through NoCodeBackend
- cloud-backed Premium capture storage through Cloudinary

## 1. NoCodeBackend Scan Sessions Table

Create a new table named `scan_sessions`.

Recommended columns:

| Column | Type | Purpose |
|---|---|---|
| `session_id` | `varchar` | stable app session id |
| `tier` | `varchar` | `free`, `basic`, or `premium` |
| `status` | `varchar` | `active`, `completed`, or `abandoned` |
| `token_prefix` | `varchar` | nullable token prefix |
| `token_record_id` | `varchar` | nullable token record id |
| `record_json` | `text` | full serialized scan session record |

After the table exists, switch:

```env
SCAN_SESSION_STORE_MODE=nocodebackend
```

## 2. Cloudinary Premium Capture Storage

Create a Cloudinary product environment and collect:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Then switch:

```env
PREMIUM_CAPTURE_STORAGE_MODE=cloudinary
```

Optional:

```env
CLOUDINARY_UPLOAD_FOLDER=dmit-scan-demo/premium-captures
```

Premium captures will then upload to:

- `{folder}/{sessionId}/{captureOrder}-{fingerLabel}`

## 3. Recommended Production Env

```env
SCAN_SESSION_STORE_MODE=nocodebackend
PREMIUM_CAPTURE_STORAGE_MODE=cloudinary
ACCESS_SESSION_SECRET=your-own-secret-not-the-nocodebackend-key
```

## 4. Current Fallback Behavior

If the modes stay on `filesystem`, the app will continue using:

- `.runtime/scan-sessions.json`
- `.runtime/premium-captures/...`

That is acceptable for local development only.
