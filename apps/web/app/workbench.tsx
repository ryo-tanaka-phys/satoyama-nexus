'use client';

import { useState, useTransition } from 'react';
import type { CollaborationStage } from '@satoyama/domain';
import type { DemoPersonaId, WorkbenchSnapshot } from '../lib/simulation-store';

const STAGES: readonly { key: CollaborationStage; label: string }[] = [
  { key: 'draft', label: '1. 下書き (draft)' },
  { key: 'requested', label: '2. 模擬依頼 (requested)' },
  { key: 'coordinating', label: '3. 模擬調整 (coordinating)' },
  { key: 'agreed', label: '4. 模擬合意 (agreed)' },
  { key: 'preparing', label: '5. 実施準備 (preparing)' }
];

interface FeedbackState {
  kind: 'ok' | 'error';
  code: string;
  message: string;
}

export function SimulationWorkbenchClient({ initialSnapshot }: { initialSnapshot: WorkbenchSnapshot }) {
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot>(initialSnapshot);
  const [personaId, setPersonaId] = useState<DemoPersonaId>('creator');
  const [selectedCaseId, setSelectedCaseId] = useState<string>(initialSnapshot.cases[0]?.id ?? '');
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  // New simulated activity proposal form
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalLocationLabel, setProposalLocationLabel] = useState('');
  const [proposalSkills, setProposalSkills] = useState('植生観察, 竹林整備');
  const [proposalTransport, setProposalTransport] = useState('地域バス, 徒歩');

  // Human review form
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewReason, setReviewReason] = useState(
    'AI一次評価の懸念点（座標未設定拠点・安全講習の要確認事項）を確認した上で、Phase 1模擬手順の進行を承認する。'
  );
  const [stageNote, setStageNote] = useState('');

  const activePersona = snapshot.personas.find((p) => p.id === personaId) ?? snapshot.personas[0];
  const selectedActivity = snapshot.simulationActivities.find((a) => a.id === snapshot.selectedActivityId);
  const selectedActivityLocations = snapshot.locations.filter(
    (l) => l.activityId === snapshot.selectedActivityId && l.activityRevision === (selectedActivity?.revision ?? 1)
  );
  const selectedActivityCondition = snapshot.participationConditions.find(
    (c) => c.target.activityId === snapshot.selectedActivityId && c.target.activityRevision === (selectedActivity?.revision ?? 1)
  );

  const selectedCase = snapshot.cases.find((c) => c.id === selectedCaseId) ?? snapshot.cases[0];
  const selectedCaseGov = selectedCase
    ? snapshot.caseGovernance.find((g) => g.caseId === selectedCase.id)
    : undefined;
  const selectedCaseReadiness = selectedCase ? snapshot.caseReadiness[selectedCase.id] : undefined;
  const latestAssessmentForCase = selectedCase
    ? [...snapshot.aiAssessments]
        .reverse()
        .find((a) => a.caseId === selectedCase.id && a.caseRevision === selectedCase.revision)
    : undefined;
  const notesForCase = selectedCase
    ? snapshot.collaborationNotes.filter((n) => n.caseId === selectedCase.id)
    : [];

  async function refreshActivity(activityId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/simulation/state?activityId=${encodeURIComponent(activityId)}`, {
        cache: 'no-store'
      });
      const data = (await res.json()) as WorkbenchSnapshot;
      startTransition(() => setSnapshot(data));
    } finally {
      setBusy(false);
    }
  }

  async function postAction(
    url: string,
    payload: Record<string, unknown>,
    onSuccess?: (data: Record<string, unknown>) => void
  ) {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (data.snapshot) {
        const nextSnap = data.snapshot as WorkbenchSnapshot;
        startTransition(() => setSnapshot(nextSnap));
      }
      if (data.ok) {
        onSuccess?.(data);
      } else {
        setFeedback({
          kind: 'error',
          code: String(data.reasonCode ?? 'ERROR'),
          message: String(data.message ?? '操作が拒否されました。')
        });
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : '通信エラーが発生しました。'
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateProposal(e: React.FormEvent) {
    e.preventDefault();
    await postAction(
      '/api/simulation/activities',
      {
        personaId,
        title: proposalTitle,
        locationLabel: proposalLocationLabel,
        requiredSkills: proposalSkills.split(/[,、]/).map((s) => s.trim()).filter(Boolean),
        transportModes: proposalTransport.split(/[,、]/).map((s) => s.trim()).filter(Boolean)
      },
      (data) => {
        const act = data.activity as { id: string; title: string };
        setFeedback({
          kind: 'ok',
          code: 'ACTIVITY_CREATED',
          message: `模擬活動「${act.title}」(${act.id}) を登録し、M2 マッチングを再計算しました。`
        });
        setProposalTitle('');
        setProposalLocationLabel('');
        setShowProposalForm(false);
      }
    );
  }

  async function handleCreateCase(candidateActorId: string, candidateName: string) {
    if (!selectedActivity) return;
    await postAction(
      '/api/simulation/cases',
      {
        personaId,
        activityId: selectedActivity.id,
        candidateActorId,
        role: '模擬協働候補'
      },
      (data) => {
        const newCaseId = String(data.caseId);
        setSelectedCaseId(newCaseId);
        setFeedback({
          kind: 'ok',
          code: 'CASE_DRAFT_CREATED',
          message: `模擬案件 ${newCaseId}（draft / rev 1, 候補: ${candidateName}）を作成しました。次は AI 一次評価と人間の二次審査へ進みます。`
        });
      }
    );
  }

  async function handleRunAIReview() {
    if (!selectedCase) return;
    await postAction('/api/simulation/ai-review', { caseId: selectedCase.id }, (data) => {
      const assessment = data.assessment as { record: { id: string }; triageSignal: string };
      setFeedback({
        kind: 'ok',
        code: 'AI_PRIMARY_RECORDED',
        message: `AI一次評価 (${assessment.record.id} / ${assessment.triageSignal}) を追記しました。人間の二次審査までは段階遷移できません。`
      });
    });
  }

  async function handleSubmitHumanReview(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCase) return;
    const latestAiId =
      selectedCaseReadiness?.currentRevisionAIRecommendations[
        selectedCaseReadiness.currentRevisionAIRecommendations.length - 1
      ]?.id ?? null;

    await postAction(
      '/api/simulation/review',
      {
        personaId,
        caseId: selectedCase.id,
        expectedVersion: selectedCase.revision,
        decision: reviewDecision,
        reason: reviewReason,
        aiRecommendationId: latestAiId
      },
      () => {
        setFeedback({
          kind: 'ok',
          code: reviewDecision === 'approved' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED',
          message:
            reviewDecision === 'approved'
              ? `案件 ${selectedCase.id} (rev ${selectedCase.revision}) を第三者審査で承認しました。`
              : `案件 ${selectedCase.id} (rev ${selectedCase.revision}) を却下として追記記録しました。`
        });
      }
    );
  }

  async function handleMaterialChange() {
    if (!selectedCase) return;
    await postAction(
      '/api/simulation/material-change',
      {
        personaId,
        caseId: selectedCase.id,
        expectedVersion: selectedCase.revision,
        changeKind: 'participation-condition',
        changeSummary: '作業安全条件・集合場所の重要変更（旧リビジョン承認の失効確認）'
      },
      () => {
        setFeedback({
          kind: 'ok',
          code: 'MATERIAL_CHANGE_REQUIRES_REREVIEW',
          message: `案件 ${selectedCase.id} に重要変更を適用しました（rev ${selectedCase.revision} → rev ${selectedCase.revision + 1}）。旧リビジョンの承認は無効となり再審査が必要です。`
        });
      }
    );
  }

  async function handleTransition(targetStage: CollaborationStage) {
    if (!selectedCase) return;
    await postAction(
      '/api/simulation/transition',
      {
        personaId,
        caseId: selectedCase.id,
        expectedVersion: selectedCase.revision,
        targetStage,
        simulationNote: stageNote
      },
      () => {
        setStageNote('');
        setFeedback({
          kind: 'ok',
          code: 'STAGE_TRANSITIONED',
          message: `案件 ${selectedCase.id} を「${targetStage}」へ模擬遷移しました（外部連絡なし）。`
        });
      }
    );
  }

  async function handleReset() {
    await postAction('/api/simulation/reset', {}, () => {
      setSelectedCaseId('sim-case-001');
      setPersonaId('creator');
      setFeedback({
        kind: 'ok',
        code: 'WORKBENCH_RESET',
        message: 'Phase 1 模擬ワークベンチを初期状態にリセットしました。'
      });
    });
  }

  const currentStageIndex = selectedCase ? STAGES.findIndex((s) => s.key === selectedCase.stage) : 0;

  return (
    <main>
      <p className="eyebrow">SATOYAMA NEXUS / PHASE 1 WORKBENCH (M1–M4)</p>
      <h1>
        里山の協働を、
        <br />
        確かな一歩から。
      </h1>
      <p>市民・団体・専門家をつなぐ実証用プラットフォームです（活動提案 → M2 推薦 → M3 AI一次評価 → 人間二次審査 → M4 模擬協働）。</p>

      <aside aria-label="実証環境の注意" className="phase-banner">
        Phase 1：すべての依頼・調整・合意は模擬処理です。外部への連絡は行いません。実AI API呼出や実在団体の募集確認も未接続です。
      </aside>

      {/* Server-side Demo Persona Bar */}
      <div className="persona-bar" aria-label="Phase 1 模擬セッション切替">
        <div className="row-between">
          <div>
            <strong>Phase 1 操作ロール切替（サーバー側 <code>ServerAuthContext</code> 検証用）</strong>
            <p className="small-note" style={{ marginBottom: 0 }}>
              クライアントから権限や reviewerId を自己申告せず、サーバー側の模擬セッションから認可・自己レビュー禁止を判定します。
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={handleReset} disabled={busy}>
            初期状態にリセット
          </button>
        </div>

        <div className="persona-buttons">
          {snapshot.personas.map((p) => (
            <button
              key={p.id}
              type="button"
              className={personaId === p.id ? 'btn-active' : 'btn-secondary'}
              onClick={() => setPersonaId(p.id)}
              disabled={busy}
            >
              {p.label}
            </button>
          ))}
        </div>

        {activePersona && (
          <p className="small-note" style={{ marginBottom: 0 }}>
            現在の模擬セッション: <code>{activePersona.accountId ?? '未認証 (anonymous)'}</code> / 権限:{' '}
            <code>{activePersona.roles.length > 0 ? activePersona.roles.join(', ') : 'none'}</code> —{' '}
            {activePersona.description}
          </p>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className={`feedback-box ${feedback.kind === 'ok' ? 'feedback-ok' : 'feedback-error'}`}
        >
          <strong>[{feedback.code}]</strong> {feedback.message}
        </div>
      )}

      {/* Section 1: Data Separation */}
      <section className="section-block">
        <div className="grid-2">
          <div className="card card-muted">
            <h2>
              実在する活動の公開情報 <span className="badge badge-public">public-catalog</span>
            </h2>
            <p>
              <strong>未登録（公開活動 {snapshot.publicCatalog.activities.length} 件 / 公開主体 {snapshot.publicCatalog.actors.length} 件）</strong>
              。出典と参照日を確認した公開情報を、模擬プロフィールと区別して追加します。
            </p>
            <p className="small-note">
              注意: {snapshot.publicCatalog.notice}（fixture 件数: {snapshot.publicCatalog.fixtureActivityCount} 件。公開カタログ主体は M2 マッチング候補や模擬連絡先に混入できません）。
            </p>
          </div>

          <div className="card">
            <div className="row-between">
              <h2>
                模擬プロフィール・模擬活動 <span className="badge badge-sim">simulation</span>
              </h2>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowProposalForm((v) => !v)}
                disabled={busy}
              >
                {showProposalForm ? '提案フォームを閉じる' : '＋ 新しい模擬活動を提案'}
              </button>
            </div>

            {showProposalForm && (
              <form className="form-grid" onSubmit={handleCreateProposal} style={{ marginBottom: 16 }}>
                <label className="field">
                  模擬活動タイトル
                  <input
                    type="text"
                    value={proposalTitle}
                    onChange={(e) => setProposalTitle(e.target.value)}
                    placeholder="例：里山トレイルの下草刈り・生態記録"
                    required
                  />
                </label>
                <label className="field">
                  場所メモ（座標未指定の場合は欠損 null として保持）
                  <input
                    type="text"
                    value={proposalLocationLabel}
                    onChange={(e) => setProposalLocationLabel(e.target.value)}
                    placeholder="例：南尾根エリア（詳細座標は確認中）"
                  />
                </label>
                <label className="field">
                  必要スキル（カンマ区切り）
                  <input
                    type="text"
                    value={proposalSkills}
                    onChange={(e) => setProposalSkills(e.target.value)}
                  />
                </label>
                <label className="field">
                  想定移動手段（カンマ区切り）
                  <input
                    type="text"
                    value={proposalTransport}
                    onChange={(e) => setProposalTransport(e.target.value)}
                  />
                </label>
                <div>
                  <button type="submit" disabled={busy}>
                    模擬活動を登録してマッチング更新
                  </button>
                </div>
              </form>
            )}

            <label className="field">
              検証対象の模擬活動を選択
              <select
                value={snapshot.selectedActivityId}
                onChange={(e) => refreshActivity(e.target.value)}
                disabled={busy}
              >
                {snapshot.simulationActivities.map((act) => (
                  <option key={act.id} value={act.id}>
                    {act.title} ({act.id} / rev {act.revision})
                  </option>
                ))}
              </select>
            </label>

            {selectedActivity && (
              <div style={{ marginTop: 12 }}>
                <p className="small-note">
                  <strong>位置情報 ({selectedActivityLocations.length} 件):</strong>{' '}
                  {selectedActivityLocations.map((loc) => (
                    <span key={loc.id} style={{ display: 'block' }}>
                      ・{loc.label} — 精度 <code>{loc.precision}</code> / 座標{' '}
                      <code>
                        {loc.coordinates
                          ? `${loc.coordinates.latitude.toFixed(4)}, ${loc.coordinates.longitude.toFixed(4)}`
                          : 'null (欠損保持)'}
                      </code>
                    </span>
                  ))}
                </p>
                {selectedActivityCondition && (
                  <p className="small-note">
                    <strong>参加条件状態:</strong> 日程 <code>{selectedActivityCondition.schedule.dates.state}</code> / 技能{' '}
                    <code>{selectedActivityCondition.skills.state}</code> / 資格{' '}
                    <code>{selectedActivityCondition.qualifications.state}</code> / 年齢・他制約{' '}
                    <code>{selectedActivityCondition.ageOrOtherConstraints.state}</code>
                  </p>
                )}
              </div>
            )}

            <h3 style={{ marginTop: 14 }}>模擬プロフィール（架空の参加者・団体）</h3>
            <div className="chip-row">
              {snapshot.simulationActors.map((actor) => (
                <span key={actor.id} className="badge badge-sim">
                  {actor.displayName} ({actor.kind}) · {actor.expertise.map((e) => e.label).join('、')}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: M2 Matching */}
      <section className="section-block">
        <h2>
          M2 マッチング推薦（地理・技能・参加意欲）{' '}
          <span className="badge badge-warn">policy: {snapshot.matchingPolicy.policyVersion}</span>
        </h2>
        <p className="small-note">
          距離や技能申告だけで参加可能・資格確認済みとは断定しません（すべて <code>canParticipate: null</code> /{' '}
          <code>qualificationVerified: false</code> / <code>impliesAgreement: false</code>）。
        </p>

        <div className="grid-2">
          {snapshot.recommendations.map((rec) => (
            <article key={rec.actorId} className="card">
              <div className="row-between">
                <h3>
                  {rec.actorDisplayName} <span className="badge badge-sim">{rec.actorKind}</span>
                </h3>
                <span className="badge badge-warn">暫定スコア {rec.provisionalScore} / 100</span>
              </div>

              <div className="chip-row">
                <span className="badge badge-public">
                  距離: {rec.geographic.distanceMeters !== null ? `${rec.geographic.distanceMeters}m` : '未算出 (null)'}
                </span>
                <span className="badge badge-public">地理状態: {rec.geographic.status}</span>
                <span className="badge badge-public">参加可否: 未判定 (null)</span>
                <span className="badge badge-deny">資格確認: 未確認</span>
              </div>

              <ul className="meta-list">
                <li>
                  <strong>地理 ({rec.geographic.score}点):</strong> {rec.geographic.reasons.join(' ')}
                </li>
                <li>
                  <strong>技能 ({rec.skill.score}点):</strong> 一致{' '}
                  {rec.skill.matchedRequiredSkills.length > 0 ? rec.skill.matchedRequiredSkills.join('、') : 'なし'} / 不足{' '}
                  {rec.skill.missingRequiredSkills.length > 0 ? rec.skill.missingRequiredSkills.join('、') : 'なし'}
                </li>
                <li>
                  <strong>意欲 ({rec.interest.score}点):</strong> {rec.interest.willingness}（{rec.interest.reasons[0]}）
                </li>
                {rec.uncertainties.length > 0 && (
                  <li>
                    <strong>不確実性:</strong> {rec.uncertainties.join(' / ')}
                  </li>
                )}
              </ul>

              <div className="inline-actions">
                <button
                  type="button"
                  onClick={() => handleCreateCase(rec.actorId, rec.actorDisplayName)}
                  disabled={busy}
                >
                  この候補で模擬案件を作成 (draft)
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Section 3: M3 AI Primary Review -> Human Secondary Review -> M4 Collaboration Flow */}
      <section className="section-block">
        <h2>協働までの流れ（M3 AI一次推奨 → 人間の二次審査 → M4 模擬協働遷移）</h2>
        <ol className="meta-list" style={{ marginBottom: 16 }}>
          <li>AI一次推薦（Phase 1 はローカル決定論的アダプター。承認や遷移は不可）</li>
          <li>人間による二次審査（作成者・重要変更者・当事者による自己レビューは禁止）</li>
          <li>模擬依頼 (requested) → 模擬調整 (coordinating) → 模擬合意 (agreed) → 実施準備 (preparing)</li>
        </ol>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row-between">
            <label className="field" style={{ maxWidth: 480 }}>
              操作対象の模擬案件を選択
              <select
                value={selectedCase?.id ?? ''}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                disabled={busy}
              >
                {snapshot.cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — stage: {c.stage} / rev {c.revision} ({c.activity.id})
                  </option>
                ))}
              </select>
            </label>

            {selectedCase && selectedCaseGov && (
              <div className="small-note">
                作成者: <code>{selectedCaseGov.createdByAccountId}</code> / 最終重要変更者:{' '}
                <code>{selectedCaseGov.lastMaterialChangeByAccountId ?? 'なし'}</code> / 当事者:{' '}
                <code>{selectedCase.parties.map((p) => `${p.actorId}(${p.role})`).join(', ')}</code>
              </div>
            )}
          </div>

          {selectedCase && (
            <div className="stepper" aria-label="模擬協働ステージ進行状況">
              {STAGES.map((st, idx) => (
                <span
                  key={st.key}
                  className={`step-pill ${
                    idx < currentStageIndex ? 'step-done' : idx === currentStageIndex ? 'step-current' : ''
                  }`}
                >
                  {st.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {selectedCase && selectedCaseReadiness && (
          <div className="grid-3">
            {/* Step A: M3 AI Primary Review */}
            <div className="card">
              <h3>
                1. AI 一次評価 <span className="badge badge-warn">requires-human-review</span>
              </h3>
              <p className="small-note">
                現行 rev {selectedCase.revision} の AI 評価件数:{' '}
                <strong>{selectedCaseReadiness.currentRevisionAIRecommendations.length} 件</strong>（旧 rev:{' '}
                {selectedCaseReadiness.staleAIRecommendationCount} 件）
              </p>

              <div className="inline-actions" style={{ marginBottom: 12 }}>
                <button type="button" onClick={handleRunAIReview} disabled={busy}>
                  AI 一次評価を実行（模擬アダプター）
                </button>
              </div>

              {latestAssessmentForCase ? (
                <div>
                  <div className="chip-row">
                    <span className="badge badge-warn">{latestAssessmentForCase.triageSignal}</span>
                    <span className="badge badge-public">外部API呼出: なし</span>
                  </div>
                  <p className="small-note">
                    <strong>根拠:</strong> {latestAssessmentForCase.strengths.join(' ')}
                  </p>
                  <p className="small-note">
                    <strong>懸念・不足:</strong>{' '}
                    {latestAssessmentForCase.risksAndGaps.length > 0
                      ? latestAssessmentForCase.risksAndGaps.join(' ')
                      : '重大な欠落なし'}
                  </p>
                  <p className="small-note">
                    <strong>人間確認項目:</strong>
                  </p>
                  <ul className="meta-list">
                    {latestAssessmentForCase.requiredHumanChecks.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                  <p className="small-note">
                    <code>
                      {latestAssessmentForCase.provenance.model}@{latestAssessmentForCase.provenance.promptVersion}
                    </code>
                  </p>
                </div>
              ) : (
                <p className="small-note">現行リビジョンの AI 一次評価はまだ実行されていません。</p>
              )}
            </div>

            {/* Step B: Human Secondary Review + Material Change */}
            <div className="card">
              <h3>
                2. 人間の二次審査{' '}
                <span
                  className={`badge ${
                    selectedCaseReadiness.humanDecisionStatus === 'approved'
                      ? 'badge-ok'
                      : selectedCaseReadiness.humanDecisionStatus === 'rejected'
                        ? 'badge-deny'
                        : 'badge-warn'
                  }`}
                >
                  {selectedCaseReadiness.humanDecisionStatus}
                </span>
              </h3>
              <p className="small-note">
                現行 rev {selectedCase.revision} への審査履歴:{' '}
                <strong>{selectedCaseReadiness.currentRevisionReviews.length} 件</strong>（旧 rev:{' '}
                {selectedCaseReadiness.staleReviewCount} 件）。上の切替バーで「作成者」を選ぶと{' '}
                <code>SELF_REVIEW_PROHIBITED</code> を確認できます。
              </p>

              <form className="form-grid" onSubmit={handleSubmitHumanReview}>
                <label className="field">
                  判定（追記専用）
                  <select
                    value={reviewDecision}
                    onChange={(e) => setReviewDecision(e.target.value as 'approved' | 'rejected')}
                    disabled={busy}
                  >
                    <option value="approved">承認 (approved)</option>
                    <option value="rejected">却下 (rejected)</option>
                  </select>
                </label>
                <label className="field">
                  審査理由（必須）
                  <textarea
                    rows={3}
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                    required
                  />
                </label>
                <div className="inline-actions">
                  <button
                    type="submit"
                    className={reviewDecision === 'rejected' ? 'btn-danger' : ''}
                    disabled={busy}
                  >
                    二次審査を記録する
                  </button>
                  <button
                    type="button"
                    className="btn-warn"
                    onClick={handleMaterialChange}
                    disabled={busy}
                  >
                    重要変更（rev +1・再審査要求）
                  </button>
                </div>
              </form>
            </div>

            {/* Step C: M4 Sequential Transition */}
            <div className="card">
              <h3>
                3. M4 模擬協働遷移{' '}
                <span className={`badge ${selectedCaseReadiness.canAdvanceStage ? 'badge-ok' : 'badge-warn'}`}>
                  {selectedCaseReadiness.canAdvanceStage ? '遷移可能' : '承認待ち / 完了'}
                </span>
              </h3>

              {selectedCaseReadiness.blockingReasons.length > 0 && (
                <ul className="meta-list">
                  {selectedCaseReadiness.blockingReasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              )}

              <label className="field" style={{ marginTop: 10 }}>
                模擬協働メモ（任意・外部送信されません）
                <input
                  type="text"
                  value={stageNote}
                  onChange={(e) => setStageNote(e.target.value)}
                  placeholder="例：日程候補と安全確認手順の模擬調整を記録"
                  disabled={busy}
                />
              </label>

              <div className="inline-actions">
                {selectedCaseReadiness.nextSequentialStage && (
                  <button
                    type="button"
                    onClick={() => handleTransition(selectedCaseReadiness.nextSequentialStage!)}
                    disabled={busy}
                  >
                    次段階へ進める ({selectedCase.stage} → {selectedCaseReadiness.nextSequentialStage})
                  </button>
                )}
                {selectedCase.stage !== 'agreed' && selectedCase.stage !== 'preparing' && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleTransition('agreed')}
                    disabled={busy}
                  >
                    段階スキップを試す (→ agreed / 拒否確認)
                  </button>
                )}
              </div>

              {notesForCase.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <p className="small-note">
                    <strong>模擬協働ログ（外部連絡なし）:</strong>
                  </p>
                  <ul className="meta-list">
                    {notesForCase.map((n) => (
                      <li key={n.id}>
                        <code>
                          {n.fromStage} → {n.toStage}
                        </code>{' '}
                        (rev {n.caseRevision}, {n.actorAccountId}): {n.note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Section 4: Append-only Review & Audit History */}
      <section className="section-block">
        <h2>追記専用ログ（ReviewRecord ＆ AuditEvent）</h2>
        <div className="grid-2">
          <div className="card">
            <h3>人間二次審査履歴 ({snapshot.reviewRecords.length} 件)</h3>
            {snapshot.reviewRecords.length === 0 ? (
              <p className="small-note">まだ人間の二次審査は記録されていません。</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>案件 / rev</th>
                      <th>判定</th>
                      <th>審査者</th>
                      <th>理由 / AI参照</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...snapshot.reviewRecords].reverse().map((r) => (
                      <tr key={r.id}>
                        <td>
                          <code>{r.caseId}</code> / rev {r.caseRevision}
                        </td>
                        <td>
                          <span className={`badge ${r.decision === 'approved' ? 'badge-ok' : 'badge-deny'}`}>
                            {r.decision}
                          </span>
                        </td>
                        <td>
                          <code>{r.reviewerAccountId}</code>
                        </td>
                        <td>
                          {r.reason}
                          {r.aiRecommendationId && (
                            <div className="small-note">AI参照: {r.aiRecommendationId}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h3>監査イベント履歴 ({snapshot.auditEvents.length} 件・シークレット非出力)</h3>
            {snapshot.auditEvents.length === 0 ? (
              <p className="small-note">操作を実行すると allowed / denied の監査イベントが追記されます。</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>結果</th>
                      <th>操作 / 理由コード</th>
                      <th>実行者</th>
                      <th>対象 / rev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...snapshot.auditEvents].reverse().map((ev) => (
                      <tr key={ev.id}>
                        <td>
                          <span className={`badge ${ev.outcome === 'allowed' ? 'badge-ok' : 'badge-deny'}`}>
                            {ev.outcome}
                          </span>
                        </td>
                        <td>
                          <code>{ev.action}</code>
                          <div className="small-note">{ev.reasonCode}</div>
                        </td>
                        <td>
                          <code>{ev.actorAccountId ?? 'anonymous'}</code>
                        </td>
                        <td>
                          <code>{ev.targetId}</code> / rev {ev.targetRevision ?? '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
