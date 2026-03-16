# DMIT Scan Demo (4 Finger PWA)

This project is a phone-first Next.js PWA demo for DMIT scanning with these fingers only:

- Left Thumb
- Right Thumb
- Left Index
- Right Index

It captures a fingerprint using the rear camera, requests torch/flash ON when supported, sends the captured image to Gemini, gets a tool/function-call classification (type code), and renders the matching report text from the existing dataset.

## Important Data Safety Note

The original dataset is preserved in-place and is read-only:

- `data/data/Image/Fingerprints` (10 type reference images)
- `data/data/Text/sorted_by_finger` (final report text mapping)

The app does not move, rename, or overwrite files in `data/data`.

## Tech Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- PWA via `next-pwa`
- Gemini API via `@google/genai`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.example .env.local
```

3. Set API values in `.env.local`:

```env
GEMINI_API_KEY=your_ai_studio_key_here
GEMINI_MODEL=gemma-3-27b-it
```

If your Gemini project does not expose this model id, switch to an available model id in your account.

4. Run development server:

```bash
npm run dev
```

5. Open the app on mobile over the same network (or use HTTPS tunnel for PWA install behavior).

## How The Flow Works

1. User selects one finger from dropdown.
2. Camera starts with environment-facing preference.
3. App requests torch ON if the device supports it.
4. User captures image.
5. API sends prompt + 10 reference fingerprint images + captured image to Gemini.
6. Gemini is constrained to a function/tool schema and returns: finger, type, confidence, notes.
7. API validates output and maps report from:
   `data/data/Text/sorted_by_finger/<Selected Finger>/<TYPE>.txt`
8. UI renders report sections in a mobile layout.

## Reliability Rules Implemented

- Allowed fingers are enum-constrained to the demo 4.
- Allowed types are enum-constrained to 10 DMIT codes.
- One auto-retry occurs if first classification is weak/invalid.
- If still weak or invalid, API requests recapture.
- If model returns a different finger than selected, response is rejected.

## Build Validation

- `npm run typecheck`
- `npm run build`

Both pass in the current implementation.
