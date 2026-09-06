# Learning flow — lessons, quizzes, XP, background jobs

## jobs.jsx — the background queue (ALL LLM actions go through it)
`JobsProvider` wraps the app; `useJobs()` gives:
- `enqueue(projectId, files)` — upload jobs: POST papers → POST analyze,
  sequential single-pump queue, statuses queued→converting→analyzing→done/error
- `startLesson(projectId, node)` — lesson jobs: POST /lesson
- `lessonState(pid, cid)` / `clearLesson` — per-concept status the UI reads
  to render spinners and the failure step-up (Retry / Open settings on the
  trigger button)
- `completions[projectId]` — counter bumped when a job finishes; ProjectView
  watches it to refetch
- `JobsIndicator` — the progress dock (bottom), per-job card with dismiss
**Rule:** never call the lesson/analyze endpoints with a bare fetch from a
component; enqueue a job so progress + failure UX stay consistent.

## LearnModal.jsx
Renders the lesson (sections + `MathText`/`normalizeMath` for math) then the
quiz; on pass → `POST /api/complete {projectId, conceptId}` → server marks
GLOBAL mastery + awards XP (`xpForNode`; `skipped` variant for skip-ahead) →
`Confetti`, toast, `refreshProfile`. Lesson JSON comes from
`GET`-through-cache `POST /projects/:id/lesson` (see server/ai-pipeline.md).

## Where learning starts
`NodePanel` (map) and `Overview.jsx` recommendations → `startLesson` →
LearnModal opens when `lessonState` says ready. Quests (`#quest-card` on
Dashboard) and streaks recompute server-side from events (`/api/quests`,
`computeQuestState`).

## Per-concept notes (user's own notes)
`NodePanel` has a `NotesEditor` (📝 My notes) — a textarea that saves on blur
via `onSaveNote(nodeId, text)` → `ProjectView.saveNote` → `PUT
/projects/:id/nodes/:nodeId/notes` (optimistic local update, empty text clears).
Notes ride in the project payload (`data.notes`, a `{nodeId:{text,updatedAt}}`
map) threaded ProjectView → MapView → NodePanel. `Overview.jsx` surfaces them in
the **Your notes** card and also shows a **Recently covered** card (derived from
history events: concept_mastered/skipped/viewed/lesson_generated, matched back to
nodes by name). Both cards' items call `onOpenConcept` (see shell.md — routes via
App so the map remounts with the concept preselected).

**Change here when:** quiz behavior, XP amounts (server `xpForNode`), lesson
rendering, job progress UX. Lesson *content* quality → `server/prompts.js`
(`lessonMessages`).
