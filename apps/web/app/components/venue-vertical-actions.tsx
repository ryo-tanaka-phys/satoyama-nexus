'use client';

import { useState } from 'react';
import {
  formatPublicApprovalView,
  type DemoAccountRecord,
  type PublicApprovalVisibilityMode,
  type PublicVenueProfileView
} from '@satoyama/domain';
import type { VenueFoundationSnapshot } from '../../../../db/venue-store';

interface VenueVerticalActionsProps {
  account: DemoAccountRecord;
  publicProfile: PublicVenueProfileView | null;
  snapshot: VenueFoundationSnapshot;
  visibilityMode: PublicApprovalVisibilityMode;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onFeedback: (fb: { kind: 'ok' | 'error'; text: string }) => void;
}

export function VenueVerticalActions({
  account,
  publicProfile,
  snapshot,
  visibilityMode,
  busy,
  onRefresh,
  onFeedback
}: VenueVerticalActionsProps) {
  const [submitting, setSubmitting] = useState(false);

  const actorMap = new Map(snapshot.actors.map((a) => [a.id, a]));
  const govActors = snapshot.actors.filter((a) => a.kind === 'government-body');
  const myReports = snapshot.activityReports.filter((r) => r.organizationActorId === account.actorId);
  const myOutgoingPetitions = snapshot.publicInteractions.filter(
    (p) => p.direction === 'to-government' && p.fromActorId === account.actorId
  );
  const myIncomingOffers = snapshot.publicInteractions.filter(
    (p) => p.direction === 'from-government' && p.toActorId === account.actorId
  );
  const myCorporateOffers = snapshot.corporateOffers.filter((o) => o.targetActorId === account.actorId);

  const [govTargetId, setGovTargetId] = useState(govActors[0]?.id ?? 'sim-kyushu-gov-demo');
  const [petKind, setPetKind] = useState<'support-request' | 'petition'>('support-request');
  const [selectedReportId, setSelectedReportId] = useState<string>(myReports[0]?.id ?? '');
  const [petTitle, setPetTitle] = useState('');
  const [petBody, setPetBody] = useState('');
  const [offerReplies, setOfferReplies] = useState<Record<string, string>>({});

  const isCertifiedOrg =
    account.roleTrack === 'organization' && publicProfile?.orgCertificationStatus === 'certified';

  async function handleSubmitPetition(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const reportIdToSend =
        selectedReportId && myReports.some((r) => r.id === selectedReportId)
          ? selectedReportId
          : myReports[0]?.id ?? null;

      const res = await fetch('/api/venue/public-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: 'to-government',
          kind: petKind,
          toActorId: govTargetId || govActors[0]?.id,
          reportId: reportIdToSend,
          title: petTitle,
          body: petBody
        })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? '自治体への提出に失敗しました。' });
      } else {
        setPetTitle('');
        setPetBody('');
        await onRefresh();
        onFeedback({
          kind: 'ok',
          text: '自治体窓口へ要望・公的申請を提出しました（自治体ダッシュボードへ自動同期されます）。'
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRespondOffer(interactionId: string, nextStatus: 'accepted' | 'declined') {
    const reason =
      (offerReplies[interactionId] ?? '').trim() ||
      (nextStatus === 'accepted'
        ? '自治体からのご提案を承諾し、詳細調整へ進みます。'
        : '現在の活動予定との兼ね合いにより今回は辞退します。');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/venue/public-interactions/${encodeURIComponent(interactionId)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextStatus, reason })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? '応答に失敗しました。' });
      } else {
        await onRefresh();
        onFeedback({
          kind: 'ok',
          text: nextStatus === 'accepted' ? '自治体からのオファーを承諾しました。' : '自治体からのオファーを辞退しました。'
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAckCorporateOffer(offerId: string) {
    setSubmitting(true);
    try {
      await fetch('/api/venue/corporate-offers/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId })
      });
      await onRefresh();
      onFeedback({ kind: 'ok', text: '企業からの支援申し出を確認済みにしました。' });
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = busy || submitting;

  if (!isCertifiedOrg && myIncomingOffers.length === 0) {
    return null;
  }

  return (
    <div className="org-workspace-stack">
      {/* Incoming Government Offers (for ANY account: org, citizen, expert) */}
      {myIncomingOffers.length > 0 && (
        <section className="card" style={{ borderLeft: '5px solid #21405d' }}>
          <h2>
            自治体から届いたオファー・公的案内{' '}
            <span className="badge badge-public">{myIncomingOffers.length} 件</span>
          </h2>
          <div className="feed-list">
            {myIncomingOffers.map((o) => {
              const gov = actorMap.get(o.fromActorId);
              return (
                <div key={o.id} className="feed-item">
                  <div className="notif-head">
                    <div>
                      <span className="badge badge-public">{o.status}</span>{' '}
                      <strong>{gov?.displayName ?? o.fromActorId}</strong>
                    </div>
                    <code>{o.id}</code>
                  </div>
                  <h3 style={{ marginTop: 4 }}>{o.title}</h3>
                  <p>{o.body}</p>
                  {o.status === 'submitted' ? (
                    <div className="comment-input-row">
                      <input
                        type="text"
                        value={offerReplies[o.id] ?? ''}
                        onChange={(e) => setOfferReplies((prev) => ({ ...prev, [o.id]: e.target.value }))}
                        placeholder="応答コメント（任意）"
                      />
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => handleRespondOffer(o.id, 'accepted')}
                        disabled={disabled}
                      >
                        承諾する
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => handleRespondOffer(o.id, 'declined')}
                        disabled={disabled}
                      >
                        辞退
                      </button>
                    </div>
                  ) : (
                    <div className="muted-sm">応答理由：{o.latestDecisionReason}</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Certified Org: Automatic Corporate Support Offers + Government Petition Form */}
      {isCertifiedOrg && (
        <div className="grid-2">
          <section className="card" style={{ borderTop: '4px solid #21405d' }}>
            <h2>
              団体専用⑤：自治体への要望・公的支援申請{' '}
              <span className="badge badge-public">提出済 {myOutgoingPetitions.length} 件</span>
            </h2>
            <form onSubmit={handleSubmitPetition} className="venue-form">
              <div className="grid-2">
                <label className="field-group">
                  <span>提出先の自治体窓口</span>
                  <select value={govTargetId} onChange={(e) => setGovTargetId(e.target.value)}>
                    {govActors.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-group">
                  <span>申請種別</span>
                  <select
                    value={petKind}
                    onChange={(e) => setPetKind(e.target.value as 'support-request' | 'petition')}
                  >
                    <option value="support-request">公的支援・資金・バックアップ相談</option>
                    <option value="petition">公有林利用・地域課題の要望書</option>
                  </select>
                </label>
              </div>

              <label className="field-group">
                <span>添付する活動実績 簡易レポート（推奨）</span>
                <select value={selectedReportId} onChange={(e) => setSelectedReportId(e.target.value)}>
                  <option value="">（レポートを添付しない）</option>
                  {myReports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}（実施{r.calendarEventCount}件・助言{r.expertAdviceCount}件）
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-group">
                <span>要望・申請タイトル</span>
                <input
                  type="text"
                  required
                  value={petTitle}
                  onChange={(e) => setPetTitle(e.target.value)}
                  placeholder="例：元岡竹林整備に向けた公有地資材置場の利用申請"
                />
              </label>

              <label className="field-group">
                <span>要望・相談内容</span>
                <textarea
                  rows={2}
                  required
                  value={petBody}
                  onChange={(e) => setPetBody(e.target.value)}
                  placeholder="活動実績レポートを踏まえた要望内容・必要支援を記載"
                />
              </label>

              <div>
                <button type="submit" disabled={disabled}>
                  自治体窓口へ要望・公的申請を提出する
                </button>
              </div>
            </form>

            {myOutgoingPetitions.length > 0 && (
              <div className="feed-list" style={{ marginTop: 12 }}>
                {myOutgoingPetitions.map((p) => {
                  const steps = snapshot.publicInteractionEvents.filter((e) => e.interactionId === p.id);
                  const view = formatPublicApprovalView(
                    { status: p.status, decidedAt: p.decidedAt, steps },
                    visibilityMode
                  );
                  return (
                    <div key={p.id} className="feed-item">
                      <div className="notif-head">
                        <strong>{p.title}</strong>
                        <span className="badge badge-public">{p.status}</span>
                      </div>
                      {p.latestDecisionReason && (
                        <div className="muted-sm">最新回答：{p.latestDecisionReason}</div>
                      )}
                      {view.processSteps.length > 0 && (
                        <ul style={{ margin: '4px 0 0 18px', padding: 0, fontSize: '0.8rem' }}>
                          {view.processSteps.map((s) => (
                            <li key={s.id}>
                              <code>{s.fromStatus ?? 'new'} → {s.toStatus}</code>：{s.reason}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card" style={{ borderTop: '4px solid #d6a45b' }}>
            <h2>
              企業からの自動支援申し出（分離領域）{' '}
              <span className={`badge ${myCorporateOffers.length > 0 ? 'badge-ok' : 'badge-warn'}`}>
                受信 {myCorporateOffers.length} / 3 プラン
              </span>
            </h2>
            <p className="muted-sm">
              団体認証・タグ・簡易レポート提出・専門家助言の条件を満たすと、疑似企業プラン（操作なし・分離テーブル）から自動で支援申し出が届きます。
            </p>
            {myCorporateOffers.length === 0 ? (
              <p className="muted-sm">まだ条件一致した企業支援申し出はありません。</p>
            ) : (
              <div className="feed-list">
                {myCorporateOffers.map((offer) => {
                  const plan = snapshot.corporatePlans.find((pl) => pl.id === offer.planId);
                  const sponsor = snapshot.corporateSponsors.find((sp) => sp.id === plan?.sponsorId);
                  return (
                    <div key={offer.id} className="feed-item" style={{ background: '#fffaf0' }}>
                      <div className="notif-head">
                        <div>
                          <span className="badge badge-warn">{plan?.supportType ?? 'support'}</span>{' '}
                          <strong>{sponsor?.name}</strong>
                        </div>
                        {offer.status === 'offered' ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => handleAckCorporateOffer(offer.id)}
                            disabled={disabled}
                          >
                            確認済みにする
                          </button>
                        ) : (
                          <span className="badge badge-ok">確認済み</span>
                        )}
                      </div>
                      <div style={{ fontWeight: 700, marginTop: 4 }}>{plan?.title}</div>
                      <div className="muted-sm">一致根拠：{offer.matchedReasons.join(' ／ ')}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
