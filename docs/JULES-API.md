# Google Jules API Specification & Adapter Contract

## 1. Official Google Jules API Surface

Google Jules is an autonomous coding agent service accessible via REST API.

### 1.1 Base URL & Versions

- **Default Endpoint**: `https://jules.googleapis.com/v1alpha`
- **Supported Versions**: `v1alpha`, `v1beta`, `v1` (configurable via `JULES_API_BASE_URL`)

### 1.2 Authentication

- Authentication header: `X-Goog-Api-Key: <api_key>` or `Authorization: Bearer <oauth_token>`
- Configured via environment variable: `JULES_API_KEY`

---

## 2. API Endpoints

### 2.1 Sessions

- `GET /v1alpha/sessions`
  - Query parameters: `pageSize` (int, default 20), `pageToken` (string), `filter` (string)
  - Response: `{ sessions: JulesSession[], nextPageToken?: string }`
- `GET /v1alpha/sessions/{sessionId}`
  - Response: `JulesSession`
- `POST /v1alpha/sessions`
  - Body: `{ prompt: string, repository: string, branch?: string, options?: Record<string, unknown> }`
  - Response: `JulesSession`

### 2.2 Activities

- `GET /v1alpha/sessions/{sessionId}/activities`
  - Query parameters: `pageSize` (int, default 50), `pageToken` (string), `filter` (string)
  - Response: `{ activities: JulesActivity[], nextPageToken?: string }`
- `GET /v1alpha/sessions/{sessionId}/activities/{activityId}`
  - Response: `JulesActivity`

### 2.3 Mutations & Interactions

- `POST /v1alpha/sessions/{sessionId}:sendMessage`
  - Body: `{ message: string, clientToken?: string }`
  - Response: `JulesActivity` (type: `USER_MESSAGE`)
- `POST /v1alpha/sessions/{sessionId}:approvePlan`
  - Body: `{ approved: boolean, feedback?: string, clientToken?: string }`
  - Response: `JulesActivity` (type: `PLAN_APPROVED` / `PLAN_REJECTED`)

---

## 3. Session States & Lifecycles

| State                    | Description                                       | Supervisor Reaction           |
| ------------------------ | ------------------------------------------------- | ----------------------------- |
| `QUEUED`                 | Session is queued in Jules backend                | Monitor                       |
| `PLANNING`               | Jules is analyzing repository and drafting a plan | Monitor                       |
| `AWAITING_PLAN_APPROVAL` | Jules produced a plan and requests approval       | Triggers Plan Review Pipeline |
| `IN_PROGRESS`            | Jules is actively executing tasks/tools           | Monitor activities            |
| `AWAITING_USER_INPUT`    | Jules requires feedback or answers to questions   | Triggers AI Decision Pipeline |
| `COMPLETED`              | Jules completed the task successfully             | Triggers Patch & Result Audit |
| `FAILED`                 | Jules encountered an unrecoverable failure        | Record failure, alert         |
| `CANCELLED`              | Session was cancelled by user/supervisor          | Settle session                |

---

## 4. Activity Types & Payloads

```json
{
  "id": "act_123456789",
  "sessionId": "ses_987654321",
  "type": "AGENT_MESSAGE | USER_MESSAGE | PLAN_GENERATED | PLAN_APPROVED | PLAN_REJECTED | PROGRESS_UPDATE | TOOL_CALL | TOOL_RESULT | PATCH_CREATED | SESSION_STATE_CHANGED",
  "content": "string content or prompt question",
  "plan": {
    "steps": [
      { "id": 1, "description": "Inspect authentication controller", "status": "COMPLETED" },
      { "id": 2, "description": "Add rate limiter middleware", "status": "IN_PROGRESS" }
    ]
  },
  "patch": {
    "diff": "diff --git a/src/auth.ts b/src/auth.ts...",
    "filesChanged": ["src/auth.ts"]
  },
  "toolCall": {
    "name": "bash",
    "args": { "command": "npm test" }
  },
  "toolResult": {
    "output": "Tests passed: 42",
    "exitCode": 0
  },
  "createTime": "2026-08-27T10:00:00Z"
}
```

---

## 5. Resilience & Fault Handling

1. **Network Retries**: Handled with exponential backoff and jitter for `429`, `503`, and timeout errors. Max retries: 3.
2. **Rate Limiting**: Bounded leaky bucket token limiter ensuring calls do not exceed configured requests-per-minute.
3. **Idempotency**: All mutation calls accept a `clientToken` or deterministic idempotency key. If network fails ambiguously, session state is re-read before retrying.
