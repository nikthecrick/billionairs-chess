#!/bin/bash
cd /Users/test/chess-game/public/assets/portraits

# Download from Wikipedia API
download() {
  local name="$1"
  local output="$2"
  local url=$(curl -s "https://en.wikipedia.org/api/rest_v1/page/summary/${name}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('originalimage',{}).get('source', d.get('thumbnail',{}).get('source','')))" 2>/dev/null)
  if [ -n "$url" ] && [ "$url" != "" ]; then
    curl -s -L -o "$output" "$url" -H "User-Agent: ChessGame/1.0"
    if file "$output" | grep -q "JPEG\|PNG\|image"; then
      echo "OK: $output"
    else
      echo "FAIL: $output (not an image)"
    fi
  else
    echo "NO_URL: $name"
  fi
}

# Fix actors
download "Jackie_Chan" "actors/king-black.jpg"
download "Jet_Li" "actors/knight-black.jpg"

# Fix musicians
download "Eminem" "musicians/knight-black.jpg"

# Distinct pawn portraits: every deck's pawns previously reused the knight
# photo. Prefer the ~330px thumbnail so the files stay small; the app draws
# portraits onto a 256px canvas anyway.
download_pawn() {
  local name="$1"
  local output="$2"
  local url=$(curl -s "https://en.wikipedia.org/api/rest_v1/page/summary/${name}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('thumbnail',{}).get('source', d.get('originalimage',{}).get('source','')))" 2>/dev/null)
  if [ -n "$url" ] && [ "$url" != "" ]; then
    curl -s -L -o "$output" "$url" -H "User-Agent: ChessGame/1.0"
    if file "$output" | grep -q "JPEG\|PNG\|image"; then
      echo "OK: $output"
    else
      echo "FAIL: $output (not an image)"
    fi
  else
    echo "NO_URL: $name"
  fi
}

# silicon-valley: Tech Employee (Apple employee #1), Tech Intern
download_pawn "Steve_Wozniak" "silicon-valley/pawn-white.jpg"
download_pawn "Aaron_Swartz" "silicon-valley/pawn-black.jpg"

# politicians: Senator, Diplomat
download_pawn "Elizabeth_Warren" "politicians/pawn-white.jpg"
download_pawn "Kofi_Annan" "politicians/pawn-black.jpg"

# actors: Stunt Double, Extra
download_pawn "Hal_Needham" "actors/pawn-white.jpg"
download_pawn "Jesse_Heiman" "actors/pawn-black.jpg"

# musicians: Roadie (roadied for Jimi Hendrix), DJ
download_pawn "Lemmy" "musicians/pawn-white.jpg"
download_pawn "Calvin_Harris" "musicians/pawn-black.jpg"
