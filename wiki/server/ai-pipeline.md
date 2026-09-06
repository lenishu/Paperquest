# AI pipeline — llm.js, prompts.js, graphUtil.js

Everything between "user clicked analyze/learn" and "valid graph/lesson on disk".

## server/llm.js — provider adapter
`callLLM(settings, messages, {json, maxTokens})` resolves the **active
connection** (`store.activeConnection`) and dispatches by the provider's `kind`
(from `store.PROVIDERS`): `openai` / `anthropic` / `gemini`, all via global
`fetch`, `TIMEOUT_MS = 240000`. The `openai` kind serves OpenAI **and** any
OpenAI-compatible endpoint (Groq, Zhipu GLM, custom) — same function, the
connection's `baseUrl` (or the provider default) picks the host, and only real
OpenAI uses `max_completion_tokens` (others use `max_tokens`). On a 400 it
recovers by swapping the token param or dropping `response_format` (JSON mode).
`parseModelJSON(text)` strips fences/prose and parses the model's JSON (never
`JSON.parse` raw output). `httpError` also lives here.
**Change here when:** adding a provider *kind* (register metadata in
`store.PROVIDERS`), changing timeouts/token limits, fixing response parsing.
Providers/keys are a list of connections — see [storage.md](storage.md).

## server/prompts.js — all prompt text
- `BASELINE` — the learner persona: competition-level high-school student.
  Tier calibration flows from this (matrix multiplication = novice). Changing
  it shifts every tier judgment.
- `truncateDoc(md, head=45000, tail=8000)` — how much paper reaches the model.
- `GRAPH_SCHEMA` / `GRAPH_EXAMPLE` / `GRAPH_RULES` — strict-JSON contract,
  few-shot example (Transformer paper), and graph-thinking rules shared by both
  graph prompts.
- `conceptExtractionMessages(paperMd, paperName)` — first paper in a project.
- `conceptMergeMessages(existingNodes, paperMd, paperName)` — later papers;
  must preserve existing node ids while weaving new concepts in.
- `lessonMessages({node, masteredNames, paperTitles, field, usageText})` —
  lesson + quiz generation; consumes the node's `usage` text from the paper.
**Change here when:** output quality/shape issues, persona/difficulty tuning.
Keep the mandatory-fields language (tier/branch/prereqs/usage) — sanitize
depends on it.

## server/graphUtil.js — pure functions, tested (graphUtil.test.js)
Pipeline order in the analyze route:
`sanitizeGraph(raw)` (drop junk, coerce fields, `slugify` ids, `inferBranch`
via `BRANCH_KEYWORDS`) → `isDegenerate(nodes)` (too few/disconnected ⇒ one
retry with the same prompt) → `repairGraph(nodes)` (backstop: guarantees a
connected, layered DAG whatever the model returned) → `computeDepths`.
Also: `computeStates(nodes, masteredIds)` → locked/ready/learning/mastered;
`xpForNode(node, skipped)`; `levelInfo(xp)` + `TITLES`; `effectiveTier`,
`isAdvanced`.
**Change here when:** graph shape/tier/state/XP logic. Add a test in
`graphUtil.test.js` (`node --test server/`) — these are the only tested functions.

## The analyze route (in server/index.js) ties it together
read md → `hasGraph ? conceptMergeMessages : conceptExtractionMessages`
(+ project memory from `store.readMemory`) → `callLLM` → `parseModelJSON` →
sanitize/retry/repair as above → `saveNodesSnapshot` (undo) → `saveProject` →
`logEvent` + `logAudit`.

## Reliability contract (do not weaken)
Prompt asks for strict JSON with mandatory fields → one retry if degenerate →
`repairGraph` ALWAYS yields a usable DAG. The UI assumes analyze never
produces a broken graph.
