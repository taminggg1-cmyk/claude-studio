#!/bin/sh
# Installs or updates Claude's studio for Claude Code on Linux or macOS.
#   sh install.sh            (or: curl -fsSL https://raw.githubusercontent.com/taminggg1-cmyk/claude-studio/main/install.sh | sh)
# It clones the repository to ~/claude-studio (or $CLAUDE_STUDIO_DIR), adds it as a plugin marketplace and installs the
# plugin. Run it again to update.
set -e
DIR="${CLAUDE_STUDIO_DIR:-$HOME/claude-studio}"
REPO="https://github.com/taminggg1-cmyk/claude-studio"
need() { command -v "$1" >/dev/null 2>&1 || { echo "Claude's studio needs $1: $2" >&2; exit 1; }; }
need git "sudo apt install git"
need node "sudo apt install nodejs (or Node.js from nodejs.org)"
need claude "install Claude Code first (https://claude.com/claude-code)"

if claude plugin marketplace list 2>/dev/null | grep -q "pixel-office-local"; then
  echo "Updating the studio's marketplace..."
  [ -d "$DIR/.git" ] && git -C "$DIR" pull --ff-only
  claude plugin marketplace update pixel-office-local
else
  if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi
  claude plugin marketplace add "$DIR"
fi
claude plugin install pixel-office@pixel-office-local --scope user || echo "(the plugin may already be installed: that is fine)"

found=""
for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable brave-browser vivaldi; do
  command -v "$b" >/dev/null 2>&1 && found="$b" && break
done
[ -n "$found" ] && echo "The window will open in $found." || echo "No Chrome, Chromium, Edge or Brave found: the window opens in your default browser."
echo "Done. Start claude in a new terminal (or type /reload-plugins in a running session)."
