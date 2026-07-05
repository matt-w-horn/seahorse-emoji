#!/bin/sh
# Renders scripts/resume-pdf/resume.html to static/resume.pdf via headless Chrome.
# Keep resume.html in sync with content/resume.md by hand; rerun after edits.
set -eu
cd "$(dirname "$0")/.."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="static/resume.pdf" \
  "scripts/resume-pdf/resume.html"
echo "Wrote static/resume.pdf"
