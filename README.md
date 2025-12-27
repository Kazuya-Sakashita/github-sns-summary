# github-sns-summary（Webhook 検証メモ / README）

GitHub の Webhook（pull_request の merged）を受け取り、SQLite に保存・重複排除しつつ、失敗した delivery を手動でリトライできる仕組みを検証する。

---

## 必要なもの

- Node.js / npm
- SQLite（sqlite3 コマンド）
- ngrok（ローカルを外部公開するため）

---

## 環境変数（.env）

例：

```env
DATABASE_URL="file:./dev.db"

OWNER_USER_ID="cmje473qy0000tsu6e5kpkcpg"
GITHUB_WEBHOOK_SECRET="change-me-please"

SNS_WEBHOOK_URL="https://webhook.site/xxxx"
WEBHOOK_RETRY_API_KEY="dev-retry-key"
```

---

## 起動（ローカル）

```bash
npm install
npm run dev
```

疎通（GET は 405 でOK）:

```bash
curl -i http://localhost:3000/api/github/webhook | head
```

ngrok（ローカルを GitHub から叩けるようにする）

```bash
ngrok http 3000
```

表示される URL を控える：
例）`https://xxxxxxxxxxxx.ngrok-free.app`

Webhook の受け口は以下：

- `https://xxxxxxxxxxxx.ngrok-free.app/api/github/webhook`

---

## GitHub Webhook 設定

Repository:

- Settings → Webhooks → Add webhook
- Payload URL: https://xxxxxxxxxxxx.ngrok-free.app/api/github/webhook
- Content type: application/json
- Secret: .env の GITHUB_WEBHOOK_SECRET と同じ値
- Events: Pull requests（必要なら ping も）

---

## 動作確認（DB）

### Delivery（Webhook 受信ログ）

```bash
sqlite3 dev.db "
SELECT deliveryId, eventName, status, attemptCount, errorMessage
FROM GithubWebhookDelivery
ORDER BY receivedAt DESC
LIMIT 10;
"
```

### GithubEvent（PR merged から生成されるイベント）

```bash
sqlite3 dev.db "
SELECT id, githubDeliveryId, repoName, prNumber, mergedBy, mergeCommitSha
FROM GithubEvent
ORDER BY createdAt DESC
LIMIT 10;
"
```

### 期待する挙動

ping は保存されるが処理対象外（IGNORED）

- eventName=ping
- status=IGNORED

pull_request(merged) は PROCESSED になり GithubEvent が作られる

- GithubWebhookDelivery.status=PROCESSED
- GithubWebhookDelivery.githubEventId が入る
- GithubEvent が 1 件作成される

### 重複排除（同じ deliveryId を再送しても 1 件）

- 同じ deliveryId を再送すると API は duplicated: true を返す
- DB の attemptCount は増えない

### 手動リトライ API（FAILED の delivery を再処理）

POST /api/github/webhook/retry
Headers:

- x-retry-api-key: <WEBHOOK_RETRY_API_KEY>

Body:

```json
{ "deliveryId": "xxxx", "force": false }
```

例：

```bash
curl -sS -X POST "http://localhost:3000/api/github/webhook/retry" \
  -H "content-type: application/json" \
  -H "x-retry-api-key: dev-retry-key" \
  --data '{"deliveryId":"test-failed-then-ok-002"}'
echo
```

---

### テスト（Vitest + SQLite）

```bash
npm run test
```

test.db を使って Prisma を db push --force-reset し、API の integration test を実行する。

## ローカルで GitHub Webhook を本番同様に確認する（ngrok + 署名検証）

### 前提

- `.env` に `GITHUB_WEBHOOK_SECRET`, `OWNER_USER_ID` を設定済み
- `ngrok http 3000` で公開URLを取得済み（例: `https://xxxx.ngrok-free.app`）

### 起動

```bash
npm run dev
ngrok http 3000
```

### 署名付きで webhook を送る（推奨）

```baash

export NGROK_BASE="https://xxxx.ngrok-free.app"
export GITHUB_WEBHOOK_SECRET="(your secret)"

./scripts/webhook-send.sh ping ping-001 '{"zen":"hello"}'

```

### pull_request(merged) を送る

```bash
payload='{
  "action":"closed",
  "pull_request":{
    "number":12345,
    "title":"test",
    "html_url":"https://github.com/owner/repo/pull/12345",
    "merged":true,
    "merged_by":{"login":"tester"},
    "merged_at":"2025-12-21T00:00:00Z",
    "merge_commit_sha":"sha"
  },
  "repository":{"full_name":"owner/repo"}
}'

./scripts/webhook-send.sh pull_request pr-001 "$payload"

```

### DB で結果確認

```bash
sqlite3 dev.db "
SELECT deliveryId, eventName, status, attemptCount, errorMessage
FROM GithubWebhookDelivery
ORDER BY receivedAt DESC
LIMIT 10;
"

sqlite3 dev.db "
SELECT id, githubDeliveryId, repoName, prNumber, mergedBy, mergeCommitSha
FROM GithubEvent
ORDER BY mergedAt DESC
LIMIT 10;
"
```

### 署名エラーの期待挙動

- x-hub-signature-256 が無い → 401 / reason=missing_header
- secret が違う → 401 / reason=mismatch
- いずれも GithubWebhookDelivery.status=FAILED に記録される
