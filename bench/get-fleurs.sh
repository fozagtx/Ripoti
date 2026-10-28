#!/usr/bin/env bash
# Google FLEURS Kiswahili (Kenya) test split, CC BY 4.0.
set -euo pipefail
DIR="${FLEURS_DIR:-$HOME/data/fleurs}"
mkdir -p "$DIR"
cd "$DIR"
curl -L -o test.tsv https://huggingface.co/datasets/google/fleurs/resolve/main/data/sw_ke/test.tsv
curl -L -o test.tar.gz https://huggingface.co/datasets/google/fleurs/resolve/main/data/sw_ke/audio/test.tar.gz
tar -xzf test.tar.gz
