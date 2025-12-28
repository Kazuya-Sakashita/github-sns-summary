#!/usr/bin/env bash
set -euo pipefail

# 使い方:
#   set -a; source .env; set +a
#   export NGROK_BASE="https://xxxx.ngrok-free.app"
#
#   ./scripts/webhook-send.sh ping my-delivery-id '{"zen":"hello"}'
#
#   payload='{
#     "action":"closed",
#     "pull_request":{
#       "number":12400,
#       "title":"signed pr via script",
#       "html_url":"https://github.com/owner/repo/pull/12400",
#       "merged":true,
#       "merged_by":{"login":"tester"},
#       "merged_at":"2025-12-21T00:00:00Z",
#       "merge_commit_sha":"signedsha-script"
#     },
#     "repository":{"full_name":"owner/repo"}
#   }'
#   ./scripts/webhook-send.sh pull_request my-delivery-id "$payload"
#
#   # ファイルから送る（改行ありJSON向け）
#   ./scripts/webhook-send.sh pull_request my-delivery-id @payload.json

EVENT_NAME="${1:-}"
DELIVERY_ID="${2:-}"
BODY_ARG="${3:-}"

if [[ -z "$EVENT_NAME" || -z "$DELIVERY_ID" || -z "$BODY_ARG" ]]; then
  echo "Usage: $0 <event_name> <delivery_id> <json_body|@file.json>" >&2
  exit 1
fi

: "${NGROK_BASE:?NGROK_BASE is required (e.g. https://xxxx.ngrok-free.app)}"
: "${GITHUB_WEBHOOK_SECRET:?GITHUB_WEBHOOK_SECRET is required}"

command -v openssl >/dev/null 2>&1 || { echo "openssl is required" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }

URL="${NGROK_BASE%/}/api/github/webhook"

# BODY を作る（@file 対応）
if [[ "$BODY_ARG" == @* ]]; then
  FILE_PATH="${BODY_ARG#@}"
  if [[ ! -f "$FILE_PATH" ]]; then
    echo "JSON file not found: $FILE_PATH" >&2
    exit 1
  fi
  BODY="$(cat "$FILE_PATH")"
else
  BODY="$BODY_ARG"
fi

# 署名（sha256=<hex>）
# openssl の出力は環境で微妙に違うので、末尾のHEXだけを確実に抜く
HEX="$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" | sed 's/^.* //')"
SIG="sha256=$HEX"

# リクエスト（改行・空白を含む JSON でも壊れないよう --data-binary）
curl -sS -X POST "$URL" \
  -H "content-type: application/json" \
  -H "x-github-event: $EVENT_NAME" \
  -H "x-github-delivery: $DELIVERY_ID" \
  -H "x-hub-signature-256: $SIG" \
  --data-binary "$BODY"
echo
