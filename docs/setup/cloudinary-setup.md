# Cloudinary Setup

Use Cloudinary for Premium capture storage in production.

## Required Values

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

## Required App Env

```env
PREMIUM_CAPTURE_STORAGE_MODE=cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_UPLOAD_FOLDER=dmit-scan-demo/premium-captures
```

## Upload Pattern

Premium captures upload under:

- `{CLOUDINARY_UPLOAD_FOLDER}/{sessionId}/{captureOrder}-{fingerLabel}`

Examples:

- `dmit-scan-demo/premium-captures/scan-123/01-left-thumb`
- `dmit-scan-demo/premium-captures/scan-123/10-right-little`

## Production Reminder

- verify uploads work before launch
- confirm the returned `secure_url` is stored in the scan session
- define retention/cleanup rules for biometric image storage
