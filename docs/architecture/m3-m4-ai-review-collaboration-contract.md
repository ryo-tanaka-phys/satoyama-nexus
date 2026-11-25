# M3 AI Review & M4 Simulation Collaboration Contract

## Scope
- **M3 (`packages/ai-review/src/m3.ts`)**: Structured primary AI evaluation (`deterministicPrimaryReviewer`, `appendAIRecommendation`, `getCaseReviewReadiness`) consuming `@satoyama/domain` governed state and optional structural M2 matching evidence (`MatchingEvidenceSummary`) without adding dependencies to `packages/ai-review/package.json`.
- **M4 (`apps/web`)**: Server-side Phase 1 simulation collaboration workbench and API routes allowing browser-based end-to-end verification of:
  1. Public catalog vs. simulation data separation (public catalog remains empty/unregistered until verified sources exist).
  2. M2 provisional matching (`recommendSimulationCandidates`) over simulation actors only.
  3. M3 AI primary evaluation (`status: 'requires-human-review'`, `externalApiCalled: false`, never approves or transitions).
  4. M1 human secondary review (`recordHumanReview`) with server-side `ServerAuthContext`, self-review prohibition (`SELF_REVIEW_PROHIBITED`), append-only `ReviewRecord` history, and material-change revision invalidation (`applyMaterialCaseChange`).
  5. M4 sequential simulation collaboration transitions (`draft → requested → coordinating → agreed → preparing`) with simulated collaboration notes and append-only sanitized `AuditEvent` logs.

## Phase 1 Non-Negotiable Invariants
- No external AI SDK/API calls, no real external contact/email/notifications, and no real OAuth/session credentials.
- Client requests never supply trusted `reviewerId` or `role`; `apps/web` resolves demo personas solely from a server-side persona table into `ServerAuthContext` to demonstrate M1 authorization and self-review enforcement.
- `AIRecommendationRecord` and `ReviewRecord` remain strictly separated and revision-pinned (`caseRevision`).
- Every allowed and denied governed command records a sanitized `AuditEvent` via `executeWithAtomicAudit`.
