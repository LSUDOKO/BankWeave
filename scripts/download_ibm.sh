#!/usr/bin/env bash
# Download IBM's synthetic AML dataset (HI-Small by default) from Kaggle.
# Requires a Kaggle API token at ~/.kaggle/kaggle.json (or KAGGLE_USERNAME/KAGGLE_KEY).
set -euo pipefail
VARIANT="${1:-HI-Small}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/data/raw"
SLUG="ealtman2019/ibm-transactions-for-anti-money-laundering-aml"
mkdir -p "$DEST"
for f in "${VARIANT}_Trans.csv" "${VARIANT}_Patterns.txt"; do
  if [[ -f "$DEST/$f" ]]; then echo "have $f"; continue; fi
  echo "downloading $f"
  uvx kaggle datasets download -d "$SLUG" -f "$f" -p "$DEST" --quiet
  if [[ -f "$DEST/$f.zip" ]]; then unzip -o -q "$DEST/$f.zip" -d "$DEST" && rm "$DEST/$f.zip"; fi
done
ls -lh "$DEST"
