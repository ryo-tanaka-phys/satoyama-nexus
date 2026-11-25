'use client';

import { useState } from 'react';
import {
  formatPublicApprovalView,
  type DemoAccountRecord,
  type PublicApprovalVisibilityMode
} from '@satoyama/domain';
import type {
  PublicInteractionStatus,
  VenueFoundationSnapshot
} from '../../../../db/venue-store';

interface VenueGovernmentPanelProps {
  account: DemoAccountRecord;
  snapshot: VenueFoundationSnapshot;
  defaultVisibilityMode: PublicApprovalVisibilityMode;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onFeedback: (fb: { kind: 'ok' | 'error'; text: string }) => void;
}

const STATUS_LABEL: Record<PublicInteractionStatus, { text: string; cls: string }> = {
  submitted: { text: '受付（未処理）', cls: 'badge-warn' },
  'under-review': { text: '所管確認中', cls: 'badge-public' },
  questioned: { text: '質問・補正依頼', cls: 'badge-warn' },
  approved: { text: '承認', cls: 'badge-ok' },
  supported: { text: '支援決定', cls: 'badge-ok' },
  returned: { text: '差戻し', cls: 'badge-deny' },
  accepted: { text: '相手が承諾', cls: 'badge-ok' },
  declined: { text: '相手が辞退', cls: 'badge-deny' }
};

export function VenueGovernmentPanel({
  account,
  snapshot,
  defaultVisibilityMode,
  busy,
  onRefresh,
  onFeedback
}: VenueGovernmentPanelProps) {
  const [submitting, setSubmitting] = useState(false);
  const [visibilityPreview, setVisibilityPreview] = useState<PublicApprovalVisibilityMode>(defaultVisibilityMode);
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});

  const actorMap = new Map(snapshot.actors.map((a) => [a.id, a]));
  const profileMap = new Map(snapshot.publicProfiles.map((p) => [p.actorId, p]));
  const reportMap = new Map(snapshot.activityReports.map((r) => [r.id, r]));
  const dummyIds = new Set(snapshot.memberships.filter((m) => m.isDummy).map((m) => m.personActorId));

  const targetableAccounts = snapshot.actors.filter(
    (a) => a.id !== account.actorId && a.kind !== 'government-body' && !dummyIds.has(a.id)
  );

  // Outgoing offer form
  const [offerTargetId, setOfferTargetId] = useState<string>(
    targetableAccounts.find((a) => a.kind === 'organization')?.id ?? targetableAccounts[0]?.id ?? ''
  );
  const [offerKind, setOfferKind] = useState<'government-offer' | 'partnership-offer'>('government-offer');
  const [offerTitle, setOfferTitle] = useState('');
  const [offerBody, setOfferBody] = useState('');

  const incomingRequests = snapshot.publicInteractions.filter((p) => p.direction === 'to-government');
  const outgoingOffers = snapshot.publicInteractions.filter(
    (p) => p.direction === 'from-government' && p.fromActorId === account.actorId
  );

  async function handleDecide(
    interactionId: string,
    nextStatus: 'under-review' | 'questioned' | 'approved' | 'supported' | 'returned'
  ) {
    const defaultReasonByStatus: Record<typeof nextStatus, string> = {
      'under-review': '担当課にて簡易レポートおよび活動場所の所管確認を開始しました。',
      questioned: '安全管理体制と作業日程の補足確認をお願いいたします。',
      approved: '提出された簡易レポートの活動実績を確認し、公有地活動申請を承認します。',
      supported: '活動実績と地域貢献を確認したため、資材保管・安全講習バックアップの支援を決定します。',
      returned: '申請要件の不足項目を補足のうえ再提出してください。'
    };
    const reason = (decisionReasons[interactionId] ?? '').trim() || defaultReasonByStatus[nextStatus];

    setSubmitting(true);
    try {
      const res = await fetch(`/api/venue/public-interactions/${encodeURIComponent(interactionId)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextStatus, reason })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? '回答の記録に失敗しました。' });
      } else {
        setDecisionReasons((prev) => ({ ...prev, [interactionId]: '' }));
        await onRefresh();
        onFeedback({
          kind: 'ok',
          text: `自治体判断 (${nextStatus}) を記録し、監査ログ追記および相手先への通知を完了しました。`
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendOffer(e: React.FormEvent) {
    e.preventDefault();
    const resolvedTarget = targetableAccounts.some((a) => a.id === offerTargetId)
      ? offerTargetId
      : targetableAccounts[0]?.id ?? '';
    if (!resolvedTarget) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/venue/public-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: 'from-government',
          kind: offerKind,
          toActorId: resolvedTarget,
          title: offerTitle,
          body: offerBody
        })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? 'オファー発信に失敗しました。' });
      } else {
        setOfferTitle('');
        setOfferBody('');
        await onRefresh();
        onFeedback({ kind: 'ok', text: '対象アカウントへ自治体からの公的オファー通知を送信しました。' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = busy || submitting;

  return (
    <div className="gov-panel-stack">
      {/* 1. Incoming petitions / support requests + simplified reports */}
      <section className="card" style={{ borderTop: '4px solid #21405d' }}>
        <div className="dashboard-hero-head">
          <h2>
            自治体パネル①：要望・公的申請・簡易レポート受信トレイ{' '}
            <span className="badge badge-public">{incomingRequests.length} 件</span>
          </h2>
          <div className="filter-pills">
            <button
              type="button"
              className={`btn-sm ${visibilityPreview === 'full-process' ? 'btn-active' : 'btn-secondary'}`}
              onClick={() => setVisibilityPreview('full-process')}
            >
              デモ公開：過程すべて表示
            </button>
            <button
              type="button"
              className={`btn-sm ${visibilityPreview === 'outcome-only' ? 'btn-active' : 'btn-secondary'}`}
              onClick={() => setVisibilityPreview('outcome-only')}
            >
              本番想定プレビュー：結果のみ表示
            </button>
          </div>
        </div>
        <p className="muted-sm">
          認証済み市民団体から届いた要望・簡易レポートを審査し、理由付きで回答します。すべての判断過程は追記型履歴と監査ログに記録されます。
        </p>

        {incomingRequests.length === 0 ? (
          <p className="muted-sm">
            現在、市民団体からの要望・公的申請はありません。認証済み市民団体が簡易レポートを添付して提出するとここに届きます。
          </p>
        ) : (
          <div className="feed-list">
            {incomingRequests.map((req) => {
              const fromActor = actorMap.get(req.fromActorId);
              const report = req.reportId ? reportMap.get(req.reportId) : null;
              const steps = snapshot.publicInteractionEvents.filter((e) => e.interactionId === req.id);
              const approvalView = formatPublicApprovalView(
                { status: req.status, decidedAt: req.decidedAt, steps },
                visibilityPreview
              );
              const statusMeta = STATUS_LABEL[req.status];

              return (
                <article key={req.id} className="feed-item">
                  <div className="notif-head">
                    <div>
                      <span className={`badge ${statusMeta.cls}`}>{statusMeta.text}</span>{' '}
                      <span className="badge badge-sim">
                        {req.kind === 'petition' ? '公的要望' : '支援・助成相談'}
                      </span>{' '}
                      <strong>{fromActor?.displayName ?? req.fromActorId}</strong>
                    </div>
                    <code>{req.id}</code>
                  </div>
                  <h3 style={{ marginTop: 6 }}>{req.title}</h3>
                  <p>{req.body}</p>

                  {report && (
                    <div className="card card-muted" style={{ marginBottom: 10 }}>
                      <span className="badge badge-ok">添付：透明化簡易レポート ({report.id})</span>
                      <div style={{ fontWeight: 700, marginTop: 4 }}>{report.title}</div>
                      <div className="muted-sm">{report.summaryText}</div>
                    </div>
                  )}

                  {/* Process visibility box */}
                  <div className="card card-muted" style={{ marginBottom: 10 }}>
                    <div className="muted-sm">
                      <strong>公的透明性ビュー ({approvalView.visibilityMode})：</strong>
                      {approvalView.notice}
                    </div>
                    {approvalView.processSteps.length > 0 && (
                      <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: '0.84rem' }}>
                        {approvalView.processSteps.map((s) => (
                          <li key={s.id}>
                            <code>{s.fromStatus ?? 'new'} → {s.toStatus}</code>（{s.actorAccountId}）：{s.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="venue-form">
                    <input
                      type="text"
                      value={decisionReasons[req.id] ?? ''}
                      onChange={(e) => setDecisionReasons((prev) => ({ ...prev, [req.id]: e.target.value }))}
                      placeholder="回答・判断理由を入力（空欄時は各ボタンの定型理由を使用）"
                      style={{ font: 'inherit', padding: '7px 10px', borderRadius: 7, border: '1px solid #b5c4ae' }}
                    />
                    <div className="feed-actions" style={{ marginTop: 0 }}>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => handleDecide(req.id, 'under-review')}
                        disabled={disabled}
                      >
                        所管確認中
                      </button>
                      <button
                        type="button"
                        className="btn-warn btn-sm"
                        onClick={() => handleDecide(req.id, 'questioned')}
                        disabled={disabled}
                      >
                        質問・補正依頼
                      </button>
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => handleDecide(req.id, 'approved')}
                        disabled={disabled}
                      >
                        承認する
                      </button>
                      <button
                        type="button"
                        className="btn-active btn-sm"
                        onClick={() => handleDecide(req.id, 'supported')}
                        disabled={disabled}
                      >
                        支援決定
                      </button>
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        onClick={() => handleDecide(req.id, 'returned')}
                        disabled={disabled}
                      >
                        差戻し
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Outgoing government actions to any account */}
      <section className="card" style={{ borderTop: '4px solid #526c35' }}>
        <h2>
          自治体パネル②：各アカウントへアクションをかける（オファー・提携・公的支援案内）{' '}
          <span className="badge badge-sim">発信済 {outgoingOffers.length} 件</span>
        </h2>
        <p className="muted-sm">
          市民団体・一般市民・専門家など任意のアカウントを指定し、公的支援の誘導や提携・協力オファーを直接送信できます。
        </p>

        <form onSubmit={handleSendOffer} className="venue-form" style={{ marginTop: 10 }}>
          <div className="grid-2">
            <label className="field-group">
              <span>アクション対象のアカウント</span>
              <select value={offerTargetId} onChange={(e) => setOfferTargetId(e.target.value)}>
                {targetableAccounts.map((a) => {
                  const prof = profileMap.get(a.id);
                  const badge =
                    a.kind === 'organization'
                      ? prof?.orgCertificationStatus === 'certified'
                        ? '認証済団体'
                        : '未認証団体'
                      : prof?.expertCertified
                        ? '認証済専門家'
                        : '市民';
                  return (
                    <option key={a.id} value={a.id}>
                      [{badge}] {a.displayName}（{prof?.gridLabel ?? '位置未設定'}）
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="field-group">
              <span>オファー種別</span>
              <select
                value={offerKind}
                onChange={(e) => setOfferKind(e.target.value as 'government-offer' | 'partnership-offer')}
              >
                <option value="government-offer">公的支援・バックアップ案内</option>
                <option value="partnership-offer">自治体との協働・提携申し出</option>
              </select>
            </label>
          </div>

          <label className="field-group">
            <span>件名</span>
            <input
              type="text"
              required
              value={offerTitle}
              onChange={(e) => setOfferTitle(e.target.value)}
              placeholder="例：元岡エリア公有林の安全講習・資材置場利用のご提案"
            />
          </label>
          <label className="field-group">
            <span>案内・オファー内容</span>
            <textarea
              rows={2}
              required
              value={offerBody}
              onChange={(e) => setOfferBody(e.target.value)}
              placeholder="支援条件・相談窓口・提携内容などを記載"
            />
          </label>
          <div>
            <button type="submit" disabled={disabled}>
              対象アカウントへ公的オファーを送信する
            </button>
          </div>
        </form>

        {outgoingOffers.length > 0 && (
          <div className="feed-list" style={{ marginTop: 12 }}>
            {outgoingOffers.map((o) => {
              const target = actorMap.get(o.toActorId);
              const meta = STATUS_LABEL[o.status];
              return (
                <div key={o.id} className="feed-item">
                  <div className="notif-head">
                    <div>
                      <span className={`badge ${meta.cls}`}>{meta.text}</span>{' '}
                      <strong>宛先：{target?.displayName ?? o.toActorId}</strong>
                    </div>
                    <code>{o.id}</code>
                  </div>
                  <div style={{ fontWeight: 700 }}>{o.title}</div>
                  <div className="muted-sm">{o.body}</div>
                  {o.latestDecisionReason && (
                    <div className="muted-sm">相手の応答理由：{o.latestDecisionReason}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
