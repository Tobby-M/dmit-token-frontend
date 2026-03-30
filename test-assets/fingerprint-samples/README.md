# Fingerprint Test Fixtures

These are the exact sample files used for the local scanner verification pass on March 30, 2026.

Source pack:

- `C:\Users\Theo\Downloads\4 Fingers 10 Type\4 Fingers 10 Type`

Purpose:

- repeatable Free / Basic / Premium scanner checks during development
- stable sample inputs for manual verification before pushing scanner changes

Notes:

- `sample-pe.png` comes from `Image\Fingerprints\pe.png` because the `Image\Screenshots\PE` folder was empty in the source pack.
- The other samples come from `Image\Screenshots\{TYPE}`.
- The mapping of each sample to the verified scan steps is recorded in `manifest.json`.
