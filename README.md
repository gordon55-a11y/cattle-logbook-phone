# Cattle Logbook phone

Public iPhone page for Cattle Logbook. Add it to the home screen from Safari. The herd book stays in the private repository.

https://gordon55-a11y.github.io/cattle-logbook-phone/

Sign in with the personal Microsoft account that owns the OneDrive folder. The phone reads and writes only the live herd file, `Cattle Logbook/cattle-logbook-data.json`. It does not open the practice copy.

To switch the phone back to the practice copy, set `BOOK_PATH` in `js/path-guard.mjs` to `PRACTICE_PATH` and publish the page again. Notes already queued for one file are not sent to the other.
