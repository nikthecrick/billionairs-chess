#!/bin/bash
cd "$(dirname "$0")/public/assets/sounds"

# Chess sounds from lichess (github.com/lichess-org/lila, public/sound/standard).
# The repo stores a few files as Git LFS stubs, so those are fetched from the
# lichess CDN instead, which always serves the real audio.
RAW="https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard"
CDN="https://lichess.org/assets/sound/standard"
UA="ChessGame/1.0 (sound downloader)"

download() {
  local url="$1"
  local output="$2"
  curl -sfL -H "User-Agent: $UA" "$url" -o "$output"
  if file "$output" | grep -q "MPEG"; then
    echo "OK: $output"
  else
    echo "FAIL: $output (not audio)"
    rm -f "$output"
  fi
}

download "$RAW/Move.mp3"         "move.mp3"
download "$RAW/Capture.mp3"      "capture.mp3"
download "$RAW/Select.mp3"       "select.mp3"
download "$RAW/Error.mp3"        "error.mp3"
download "$RAW/Confirmation.mp3" "button.mp3"
download "$CDN/Check.mp3"        "check.mp3"
download "$CDN/Victory.mp3"      "victory.mp3"
download "$CDN/Defeat.mp3"       "defeat.mp3"
