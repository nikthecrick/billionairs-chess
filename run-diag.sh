#!/bin/bash
cd /Users/test/chess-game
for deck in musicians silicon-valley politicians actors; do
  node deck-diag.js "$deck" > "/tmp/diag-$deck.log" 2>&1
done
echo DONE > diag-marker.txt
