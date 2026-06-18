# Dreame Adapter — Projektstand

## Wichtige Links

- **Repo:** https://github.com/TA2k/ioBroker.dreame
- **npm:** https://www.npmjs.com/package/iobroker.dreame
- **PR Stable-Antrag:** https://github.com/ioBroker/ioBroker.repositories/pull/6167
- **PR Stable-Antrag:** https://github.com/ioBroker/ioBroker.repositories/pull/6168
- **Issues:** https://github.com/TA2k/ioBroker.dreame/issues
- **Releases:** https://github.com/TA2k/ioBroker.dreame/releases
- **ioBroker Dev Portal:** https://www.iobroker.dev/adapter/TA2k/ioBroker.dreame/releases

## Aktueller Stand

- **Version:** 0.3.15 (in Arbeit)
- **Repochecker:** FINAL status 'OK' ✅
- **Stable-Antrag:** PR #6167 offen, wartet auf ioBroker Team Review

## Offene Todos

- [ ] PR #6167 mergen lassen (ioBroker Team)
- [ ] sources-dist-stable.json Eintrag (nach PR Merge)
- [ ] Issue #20 — ESLint Migration zu @iobroker/eslint-config
- [ ] Issue #42 — Retry-Logik und besseres Error-Handling
- [ ] npm Token erneuern am: **15. September 2026** (90 Tage ab heute)

## Dev-System

- **Adapter Pfad:** `/opt/iobroker/dev/ioBroker.dreame`
- **deploy:** `./deploy.sh`
- **release:** `./release.sh "" "EN Message" "DE Message"`
- **npm Token:** in `/home/iobroker/.npmrc` und `/root/.npmrc`

## Co-Dev Workflow

1. Änderungen in VS Code über SSH
2. `./deploy.sh` — lokal testen
3. `./release.sh "" "EN" "DE"` — Release erstellen
