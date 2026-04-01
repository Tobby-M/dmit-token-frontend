# Production Setup Bundle

This folder is the saved setup reference for the DMIT frontend production backend.

Use it later to recreate:

- the NoCodeBackend tables
- the production environment variables
- the Premium cloud-storage configuration

## Files

- `nocodebackend-access_tokens.schema.json`
  Existing token table definition used by the frontend and admin app.
- `nocodebackend-scan_sessions.schema.json`
  New scan-session table definition used by the production session store.
- `env.production.example`
  Production environment template for the frontend app.
- `cloudinary-setup.md`
  Premium capture cloud-storage checklist.

## Setup Order

1. Create `access_tokens` in NoCodeBackend if it does not already exist.
2. Create `scan_sessions` in NoCodeBackend.
3. Configure Cloudinary credentials.
4. Set the production env vars from `env.production.example`.
5. Switch:
   - `SCAN_SESSION_STORE_MODE=nocodebackend`
   - `PREMIUM_CAPTURE_STORAGE_MODE=cloudinary`

## Important Notes

- `record_json` in `scan_sessions` should use a long-text field, not a short `varchar`.
- `ACCESS_SESSION_SECRET` should be its own production secret.
- Do not use local filesystem storage in production.
