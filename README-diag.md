# Deck loading diagnostics

Temporary files used to diagnose the portrait deck loading bug:

- `deck-diag.js` - headless-browser probe for a single deck (usage: `node deck-diag.js <deckId>`)
- `run-diag.sh` - runs the probe for all decks, writes logs to /tmp/diag-*.log
- `diag-marker.txt` - progress marker (DONE when finished)

Delete these files once the bug is fixed.
