MF TRACKER — self-service PWA (v2.0, on-device)

WHAT IT DOES
- First open shows a plain-language disclosure: educational tool, NOT
  SEBI-registered investment advice, everything stays on the phone.
- You enter age, horizon, plan type (Regular/Direct) and answer a 6-question
  risk check-up (scored -> Conservative / Moderate / Balanced / Growth).
- Add your portfolio three ways: screenshots (OCR), CAS PDF import (beta,
  CAMS/KFintech consolidated statement), or manual entry.
- You verify every figure on the review screen (totals shown), then it builds
  the dashboard: live value, allocation vs a reference mix, trend + projection
  RANGE, and On track / Watch / Review tags with plain-English reasons.
- NAVs come from mfapi.in with an AMFI NAVAll fallback. Direct/Regular plan
  matching follows what you selected.
- Backup: Export/Import a JSON file from the "Data & backup" card — do this
  periodically; browser storage can be cleared by the phone.

FILES IN THIS FOLDER (upload ALL of them):
  index.html, app.js, manifest.webmanifest, sw.js,
  icon-192.png, icon-512.png, apple-touch-icon.png
  (_backup/ is a local restore point — do NOT upload it)

PUT IT ON YOUR IPHONE (GitHub Pages, public, NO personal data in files)
1. github.com -> sign in -> create a new PUBLIC repository, e.g. "mf-tracker".
   (Public is fine: these files contain ZERO personal data. v2.0 removed the
    embedded holdings table that earlier builds carried.)
2. "Add file > Upload files" -> drag in ALL files above -> Commit.
3. Settings > Pages: Source = "Deploy from a branch", Branch = "main",
   Folder = "/ (root)". Save.
4. Wait ~1 minute for the link:  https://YOURNAME.github.io/mf-tracker/
5. Open it in SAFARI on your iPhone.
6. Share button > "Add to Home Screen". You now have an app icon.

USING IT
- First open: read + accept the disclosure, fill the profile and risk check-up,
  add your portfolio, verify on the review screen, build.
- Units and buy year are optional on the review screen; units make values exact,
  buy year enables an approximate per-year (CAGR) figure.
- Portfolio changed: tap "Update" (bottom bar) and re-import.
- Profile / risk retake: tap "Profile".
- Language: the हिं/EN button switches the main labels to Hindi.

NOTES / LIMITS (v2.0)
- OCR is good but not perfect. ALWAYS check the review screen totals against
  your statement — that is the safety net. CAS PDF import is beta.
- The tags and notes are from a transparent rules engine. They are educational
  observations, NOT investment advice, and NOT from a SEBI-registered adviser.
  Confirm any buy/sell with a registered adviser.
- The built-in market commentary is date-stamped (CTX in app.js). When it is
  older than ~4 months the app shows a staleness warning. Update CTX when
  shipping a new build.
- If a fund won't match AMFI it is kept with your entered values (flagged,
  no live updates) — edit the name closer to the official scheme name to fix.

UPDATING THE APP LATER
- Re-upload the files to GitHub (drag, commit). The app auto-updates within
  a minute (bump the service worker cache name + APP_VERSION each release).

RESTORE POINT
- _backup/ contains the previous version (v1.3 build 19) of every file.
  To roll back, copy those files over the current ones and remove the
  ".v1.3-build19.bak" suffixes.
