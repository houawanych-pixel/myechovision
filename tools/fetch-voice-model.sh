#!/usr/bin/env bash
# Copies the Pocket TTS browser model and ONNX Runtime Web into this repo so
# My Echo Vision's voice cloning does not depend on anyone else's hosting.
# Run by .github/workflows/fetch-voice-model.yml, or by hand from the repo root.
set -euo pipefail
SRC="https://huggingface.co/spaces/KevinAHM/pocket-tts-web/resolve/main/onnx"
LANGS="${LANGS:-english_2026-04}"   # also available: german italian portuguese spanish
ORT_VERSION="1.18.0"                # must match ORT_VERSION in app/vendor/pocket-voice/inference-worker.js

get() { curl -fL --retry 4 --retry-delay 5 -sS "$1" -o "$2"; }

for L in $LANGS; do
  d="app/models/onnx/$L"; mkdir -p "$d"
  get "$SRC/$L/bundle.json" "$d/bundle.json"
  extra=$(python3 -c "import json,sys;m=json.load(open(sys.argv[1]));print(' '.join(v for v in (m.get('tokenizer_file'),m.get('bos_before_voice_file')) if v))" "$d/bundle.json")
  # voices.bin (the model's bundled sample voices, ~50 MB) is left out on purpose: My Echo Vision only uses cloned voices.
  for f in mimi_encoder_int8.onnx text_conditioner_int8.onnx flow_lm_main_int8.onnx flow_lm_flow_int8.onnx mimi_decoder_int8.onnx $extra; do
    echo "fetching $L/$f"; get "$SRC/$L/$f" "$d/$f"
  done
done

tmp=$(mktemp -d); (cd "$tmp" && npm pack --silent "onnxruntime-web@$ORT_VERSION" >/dev/null && tar -xzf onnxruntime-web-*.tgz)
mkdir -p app/vendor/ort
cp "$tmp"/package/dist/ort.all.min.js "$tmp"/package/dist/ort.min.js app/vendor/ort/
cp "$tmp"/package/dist/*.wasm app/vendor/ort/
cp "$tmp"/package/dist/*.worker.js app/vendor/ort/ 2>/dev/null || true
cp "$tmp"/package/LICENSE app/vendor/ort/LICENSE 2>/dev/null || true
rm -rf "$tmp"

{
  echo "Pocket TTS browser model (Kyutai, CC BY 4.0), ONNX export by KevinAHM."
  echo "Source: $SRC   Languages: $LANGS   ONNX Runtime Web: $ORT_VERSION (MIT)"
  echo "Terms: no voice cloning or impersonation without explicit, lawful consent."
  echo
  (cd app && find models vendor/ort -type f ! -name SOURCES.txt -print0 | sort -z | xargs -0 sha256sum)
} > app/models/SOURCES.txt
du -sh app/models app/vendor/ort
