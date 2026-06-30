MF TRACKER — self-service PWA (Phase 1, on-device)

WHAT IT DOES
- You enter age, horizon, comfort level (stored only on your phone).
- You upload your NJ E-Wealth screenshots. The app reads them in your browser
  (OCR), de-duplicates funds, and matches each to its official AMFI code.
- You review/fix the parsed funds (units + invested), then it builds the
  dashboard: live value, allocation, trend, keep/trim/exit, and what to do.
- NAVs refresh live every time you open it. No data ever leaves your phone.

FILES IN THIS FOLDER (upload ALL of them):
  index.html, manifest.webmanifest, sw.js,
  icon-192.png, icon-512.png, apple-touch-icon.png

PUT IT ON YOUR IPHONE (GitHub Pages, public, NO personal data in files)
1. github.com -> sign in -> create a new PUBLIC repository, e.g. "mf-tracker".
   (Public is fine: these files contain ZERO personal data. Your age, amounts
    and funds are typed into the app and saved only in your phone's browser.)
2. "Add file > Upload files" -> drag in ALL files above -> Commit.
3. Settings > Pages: Source = "Deploy from a branch", Branch = "main",
   Folder = "/ (root)". Save.
4. Wait ~1 minute for the link:  https://YOURNAME.github.io/mf-tracker/
5. Open it in SAFARI on your iPhone.
6. Share button > "Add to Home Screen". You now have an app icon.

USING IT
- First open: fill the form, upload screenshots, review, build.
- NAVs: refresh automatically on every open (and the rotate button). Two sources
  are tried; if both fail it shows last saved values and flags lagging NAVs.
- Portfolio changed (bought/sold): tap "Update" (bottom bar) and upload new
  screenshots — it rebuilds. Or "add funds manually".
- Profile change: tap "Profile" to update age/horizon/comfort.

NOTES / LIMITS (Phase 1)
- OCR is good but not perfect. ALWAYS glance at the review screen and correct
  units/amounts before building — that's the safety net.
- Advice is from a transparent rules engine (overweight, duplicates, age-based
  target mix), not a live adviser. It's a second opinion. Confirm with a SEBI-
  registered adviser before acting.
- If a fund won't match AMFI, edit its name closer to how NJ shows it, or skip.

UPDATING THE APP LATER
- If I send you a new version, re-upload the files to GitHub (drag, commit).
  The app auto-updates within a minute (the service worker version is bumped).
