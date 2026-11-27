#!/usr/bin/env bash
# Requires a running local Ollama instance. All identities here use the preview database.
set -euo pipefail
cd "$(dirname "$0")/.."
export OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
export BOO_CHAT_MODEL="${BOO_CHAT_MODEL:-qwen2.5:3b}"
export BOO_CHAT_URL="http://${OLLAMA_HOST#http://}/v1/chat/completions"
export BOO_CHAT_ACCESS=authenticated HOST=127.0.0.1
export DATA_DIR="${PREVIEW_DATA_DIR:-.local-preview/data}"
export PORT="${PREVIEW_PORT:-4331}"
ollama pull "$BOO_CHAT_MODEL"
npm run build
exec node server/index.ts
