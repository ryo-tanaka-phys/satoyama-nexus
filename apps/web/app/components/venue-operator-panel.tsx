'use client';

import Link from 'next/link';
import { useState } from 'react';
import type {
  MediatedAIPrimaryAssessment,
  VenueFoundationSnapshot
} from '../../../../db/venue-store';

interface VenueOperatorPanelProps {
  snapshot: VenueFoundationSnapshot;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onFeedback: (fb: { kind: 'ok' | 'error'; text: string }) => void;
}

export function VenueOperatorPanel({
  snapshot,
  busy,
  onRefresh,
  onFeedback
}: VenueOperatorPanelProps) {
  const [submitting, setSubmitting] = useState(false);
  const [certReasons, setCertReasons] = useState<Record<string, string>>({});

  // Seeking-match mediated strict review state
  const actorMap = new Map(snapshot.actors.map((a) => [a.id, a]));
  const profileMap = new Map(snapshot.publicProfiles.map((p) => [p.actorId, p]));
  const dummyIds = new Set(snapshot.memberships.filter((m) => m.isDummy).map((m) => m.personActorId));

  const seekingCitizens = snapshot.publicProfiles.filter((p) => {
    const actor = actorMap.get(p.actorId);
    return actor?.kind === 'person' && !dummyIds.has(p.actorId) && p.seekingMatch;
  });
  const orgActors = snapshot.actors.filter((a) => a.kind === 'organization');

  const [selectedCitizenId, setSelectedCitizenId] = useState<string>(seekingCitizens[0]?.actorId ?? '');
  const [selectedOrgId, setSelectedOrgId] = useState<string>(
    orgActors.find((a) => profileMap.get(a.id)?.orgCertificationStatus === 'certified')?.id ?? orgActors[0]?.id ?? ''
  );
  const [latestAssessment, setLatestAssessment] = useState<MediatedAIPrimaryAssessment | null>(null);
  const [humanReason, setHumanReason] = useState(
    'AI一次評価の距離・タグ一致および受入体制を確認し、初回案内として適切と判断したため仲介通知を承認する。'
  );

  const effectiveCitizenId =
    seekingCitizens.some((c) => c.actorId === selectedCitizenId)
      ? selectedCitizenId
      : seekingCitizens[0]?.actorId ?? '';
  const effectiveOrgId =
    orgActors.some((o) => o.id === selectedOrgId) ? selectedOrgId : orgActors[0]?.id ?? '';

  // Also restore any prior AI review from auditEvents for this pair so polling preserves state
  const latestAiAuditForPair = snapshot.auditEvents.find(
    (ev) =>
      ev.action === 'mediated-match.ai-review' &&
      ev.outcome === 'allowed' &&
      ev.detailSummary.citizenActorId === effectiveCitizenId &&
      ev.detailSummary.targetOrgActorId === effectiveOrgId
  );
  const activeRecId =
    latestAssessment &&
    latestAssessment.citizenActorId === effectiveCitizenId &&
    latestAssessment.targetOrgActorId === effectiveOrgId
      ? latestAssessment.recommendationId
      : (latestAiAuditForPair?.targetId ?? null);

  async function handleReviewCert(requestId: string, decision: 'approved' | 'rejected') {
    const reason =
      (certReasons[requestId] ?? '').trim() ||
      (decision === 'approved'
        ? '申請内容・根拠メモを確認し、Phase 1 模擬環境での認証を承認します。'
        : '追加確認事項があるため差し戻します。');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/venue/certifications/${encodeURIComponent(requestId)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? '認証審査に失敗しました。' });
      } else {
        await onRefresh();
        onFeedback({
          kind: 'ok',
          text:
            decision === 'approved'
              ? '認証申請を承認しました（対象アカウントへ通知が送信され、機能が即時解放されます）。'
              : '認証申請を却下しました（監査ログと通知に記録されました）。'
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRunMediatedAI() {
    if (!effectiveCitizenId || !effectiveOrgId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/venue/operator/mediated-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'ai-review',
          citizenActorId: effectiveCitizenId,
          targetOrgActorId: effectiveOrgId
        })
      });
      const json = (await res.json()) as {
        ok: boolean;
        assessment?: MediatedAIPrimaryAssessment;
        message?: string;
      };
      if (!json.ok || !json.assessment) {
        onFeedback({ kind: 'error', text: json.message ?? 'AI一次評価に失敗しました。' });
      } else {
        setLatestAssessment(json.assessment);
        await onRefresh();
        onFeedback({
          kind: 'ok',
          text: `AI一次評価 (${json.assessment.recommendationId}) を記録しました。人間の二次審査承認までは通知されません。`
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitMediatedHuman(decision: 'approved' | 'rejected') {
    if (!effectiveCitizenId || !effectiveOrgId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/venue/operator/mediated-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'human-review',
          citizenActorId: effectiveCitizenId,
          targetOrgActorId: effectiveOrgId,
          recommendationId: activeRecId,
          decision,
          reason: humanReason
        })
      });
      const json = (await res.json()) as {
        ok: boolean;
        reasonCode?: string;
        message?: string;
        notificationSent?: boolean;
      };
      if (!json.ok) {
        await onRefresh();
        onFeedback({
          kind: 'error',
          text: `[${json.reasonCode ?? 'DENIED'}] ${json.message ?? '人間二次審査が拒否されました。'}`
        });
      } else {
        await onRefresh();
        onFeedback({
          kind: 'ok',
          text: json.notificationSent
            ? '人間二次審査を承認し、紹介希望の市民と対象団体へ仲介マッチング通知を送信しました。'
            : '人間二次審査で却下を記録しました（通知は送信されていません）。'
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = busy || submitting;
  const pendingCerts = snapshot.certificationRequests.filter((r) => r.status === 'pending');

  return (
    <div className="operator-panel-stack">
      {/* 1. Certification Queue */}
      <section className="card" style={{ borderTop: '4px solid #526c35' }}>
        <div className="dashboard-hero-head">
          <h2>
            運営・審査パネル①：認証キュー（法人格・専門家資格）{' '}
            <span className={`badge ${pendingCerts.length > 0 ? 'badge-warn' : 'badge-ok'}`}>
              未処理 {pendingCerts.length} 件
            </span>
          </h2>
          <Link href="/workbench" className="btn-link">
            M1-M4 詳細検証ワークベンチへ →
          </Link>
        </div>

        {snapshot.certificationRequests.length === 0 ? (
          <p className="muted-sm">
            現在、団体認証・専門家資格認証の申請はありません。市民団体端末または専門家候補端末から申請するとここに届きます。
          </p>
        ) : (
          <div className="feed-list">
            {snapshot.certificationRequests.map((req) => {
              const target = actorMap.get(req.targetActorId);
              return (
                <div key={req.id} className="feed-item">
                  <div className="notif-head">
                    <div>
                      <span className={`badge ${req.kind === 'organization' ? 'badge-public' : 'badge-sim'}`}>
                        {req.kind === 'organization' ? '市民団体（法人格・責任者）' : '専門家（資格認証）'}
                      </span>{' '}
                      <strong>{target?.displayName ?? req.targetActorId}</strong>
                    </div>
                    <span
                      className={`badge ${
                        req.status === 'approved'
                          ? 'badge-ok'
                          : req.status === 'rejected'
                            ? 'badge-deny'
                            : 'badge-warn'
                      }`}
                    >
                      {req.status === 'pending' ? '審査待ち' : req.status === 'approved' ? '承認済み' : '却下'}
                    </span>
                  </div>
                  <p style={{ marginTop: 6 }}>{req.summary}</p>
                  {req.evidenceNote && <p className="muted-sm">根拠メモ：{req.evidenceNote}</p>}

                  {req.status === 'pending' ? (
                    <div className="comment-input-row" style={{ marginTop: 8 }}>
                      <input
                        type="text"
                        value={certReasons[req.id] ?? ''}
                        onChange={(e) => setCertReasons((prev) => ({ ...prev, [req.id]: e.target.value }))}
                        placeholder="審査理由を入力（空欄時は既定の承認/却下理由を使用）"
                      />
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => handleReviewCert(req.id, 'approved')}
                        disabled={disabled}
                      >
                        承認する
                      </button>
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        onClick={() => handleReviewCert(req.id, 'rejected')}
                        disabled={disabled}
                      >
                        却下
                      </button>
                    </div>
                  ) : (
                    <p className="muted-sm" style={{ marginBottom: 0 }}>
                      審査者：<code>{req.reviewerAccountId}</code> ／ 理由：{req.reviewReason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Seeking-Match Strict Review Panel */}
      <section className="card" style={{ borderTop: '4px solid #21405d' }}>
        <h2>
          運営・審査パネル②：宛てがない登録者の把握＆厳格仲介審査{' '}
          <span className="badge badge-public">紹介希望 {seekingCitizens.length} 名</span>
        </h2>
        <p className="muted-sm">
          マッチングの宛てがない市民に対し、<strong>構造化データ（グリッド座標・9タグ）のみを用いたAI一次評価（自己紹介テキスト非入力）</strong> →{' '}
          <strong>運営者の人間二次審査（自己審査禁止）</strong> を経て仲介マッチング通知を発行します。
        </p>

        {seekingCitizens.length === 0 ? (
          <p className="muted-sm">現在「紹介希望」状態の市民はいません。</p>
        ) : (
          <div className="venue-form" style={{ marginTop: 10 }}>
            <div className="grid-2">
              <label className="field-group">
                <span>対象の市民（宛てがない・紹介希望）</span>
                <select value={effectiveCitizenId} onChange={(e) => setSelectedCitizenId(e.target.value)}>
                  {seekingCitizens.map((c) => {
                    const actor = actorMap.get(c.actorId);
                    return (
                      <option key={c.actorId} value={c.actorId}>
                        {actor?.displayName ?? c.actorId}（{c.gridLabel ?? '位置未設定'} / {c.interestTags.join('・')}）
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="field-group">
                <span>推薦先の候補団体</span>
                <select value={effectiveOrgId} onChange={(e) => setSelectedOrgId(e.target.value)}>
                  {orgActors.map((o) => {
                    const prof = profileMap.get(o.id);
                    const certLabel = prof?.orgCertificationStatus === 'certified' ? '認証済み' : '未認証';
                    return (
                      <option key={o.id} value={o.id}>
                        [{certLabel}] {o.displayName}（{prof?.gridLabel ?? '位置未設定'}）
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            <div className="feed-actions">
              <button type="button" onClick={handleRunMediatedAI} disabled={disabled}>
                ① AI一次評価を実行（M2距離・タグ＋M3構造化トリアージ）
              </button>
              {activeRecId ? (
                <span className="badge badge-ok">現行ペアのAI一次評価済み: {activeRecId}</span>
              ) : (
                <span className="badge badge-warn">AI一次評価 未実行（このまま二次審査すると要件4で拒否）</span>
              )}
            </div>

            {latestAiAuditForPair && (
              <div className="card card-muted">
                <strong>AI一次評価結果（<code>{latestAiAuditForPair.targetId}</code> / externalApiCalled: false）</strong>
                <div className="muted-sm" style={{ marginTop: 4 }}>
                  {String(latestAiAuditForPair.detailSummary.rationale ?? '')}
                </div>
                <div className="muted-sm">
                  トリアージ：<code>{String(latestAiAuditForPair.detailSummary.triageSignal ?? '')}</code> ／ 状態：
                  <code>requires-human-review</code>
                </div>
              </div>
            )}

            <label className="field-group">
              <span>② 人間二次審査の判断理由（監査ログへ追記）</span>
              <input
                type="text"
                value={humanReason}
                onChange={(e) => setHumanReason(e.target.value)}
              />
            </label>

            <div className="feed-actions">
              <button
                type="button"
                onClick={() => handleSubmitMediatedHuman('approved')}
                disabled={disabled}
              >
                人間二次審査を承認し、仲介マッチング通知を送る
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => handleSubmitMediatedHuman('rejected')}
                disabled={disabled}
              >
                却下を記録する
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 3. Append-only Audit Trail */}
      <section className="card">
        <h3>追記型 監査・透明性ログ（ops_audit.venue_audit_event / 最新 {snapshot.auditEvents.length} 件）</h3>
        {snapshot.auditEvents.length === 0 ? (
          <p className="muted-sm">まだ監査イベントはありません。</p>
        ) : (
          <div className="notif-list">
            {snapshot.auditEvents.slice(0, 15).map((ev) => (
              <div key={ev.id} className="notif-item notif-read">
                <div className="notif-head">
                  <div>
                    <span className={`badge ${ev.outcome === 'allowed' ? 'badge-ok' : 'badge-deny'}`}>
                      {ev.outcome}
                    </span>{' '}
                    <strong>{ev.action}</strong>{' '}
                    <code>{ev.reasonCode}</code>
                  </div>
                  <span className="muted-sm">{ev.actorAccountId ?? 'anonymous'}</span>
                </div>
                <div className="muted-sm">
                  target: <code>{ev.targetId}</code>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
