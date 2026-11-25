'use client';

import { useState } from 'react';
import type { DemoAccountRecord, PublicVenueProfileView } from '@satoyama/domain';
import type { CertificationRequestRecord } from '../../../../db/venue-store';

interface VenueCertificationBannerProps {
  account: DemoAccountRecord;
  publicProfile: PublicVenueProfileView | null;
  certificationRequests: readonly CertificationRequestRecord[];
  busy: boolean;
  onRefresh: () => Promise<void>;
  onFeedback: (fb: { kind: 'ok' | 'error'; text: string }) => void;
}

export function VenueCertificationBanner({
  account,
  publicProfile,
  certificationRequests,
  busy,
  onRefresh,
  onFeedback
}: VenueCertificationBannerProps) {
  const [submitting, setSubmitting] = useState(false);
  const [showExpertForm, setShowExpertForm] = useState(false);
  const [summary, setSummary] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');

  const myRequests = certificationRequests.filter((r) => r.targetActorId === account.actorId);
  const latestPending = myRequests.find((r) => r.status === 'pending');

  async function submitRequest(kind: 'organization' | 'expert', defaultSummary: string) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/venue/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          summary: summary.trim() || defaultSummary,
          evidenceNote: evidenceNote.trim() || null
        })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? '認証申請に失敗しました。' });
      } else {
        setSummary('');
        setEvidenceNote('');
        setShowExpertForm(false);
        await onRefresh();
        onFeedback({
          kind: 'ok',
          text:
            kind === 'organization'
              ? '市民団体の法人格・責任者認証を運営へ申請しました。運営が承認すると専用機能が自動解放されます。'
              : '専門家資格認証を運営へ申請しました。運営が承認すると専門家バッジが有効になります。'
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = busy || submitting;

  // Organization certification banner (legal-entity model)
  if (account.roleTrack === 'organization') {
    const status = publicProfile?.orgCertificationStatus ?? 'none';
    if (status === 'certified') {
      return (
        <section className="card" style={{ borderLeft: '5px solid #185c37' }}>
          <div className="dashboard-hero-head">
            <div>
              <span className="badge badge-ok">運営認証済み市民団体（法人格・責任者認証済み）</span>
              <p className="muted-sm" style={{ marginTop: 6, marginBottom: 0 }}>
                団体専用機能（カレンダー活動管理・メンバー管理・メンバーチャット・簡易レポート作成・自治体申請）が解放されています。
              </p>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="card" style={{ borderLeft: '5px solid #d6a45b' }}>
        <h2>
          市民団体 認証ステータス{' '}
          <span className="badge badge-warn">
            {status === 'pending' ? '運営審査待ち' : status === 'rejected' ? '差し戻し（再申請可）' : '未認証・専用機能ロック中'}
          </span>
        </h2>
        <p className="muted-sm">
          市民団体専用の管理・活動機能（カレンダー・メンバー管理・チャット・簡易レポート・公的申請）へアクセスするには、運営による団体認証（法人格・団体責任者認証）が必要です。
        </p>

        {status === 'pending' && latestPending ? (
          <div className="feedback-box feedback-ok" style={{ marginBottom: 0 }}>
            申請中（ID: <code>{latestPending.id}</code>）：運営ダッシュボードへ送信済みです。承認されると4秒以内にこの画面が自動解放されます。
          </div>
        ) : (
          <form
            className="venue-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submitRequest(
                'organization',
                `${account.displayName} の団体責任者認証および団体専用機能の利用を申請します。`
              );
            }}
          >
            <label className="field-group">
              <span>団体認証の申請内容（活動目的・地域など）</span>
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="例：九大伊都キャンパス東側の竹林整備と地域住民の安全保全を目的に活動します"
              />
            </label>
            <label className="field-group">
              <span>根拠・補足メモ（規約・安全体制など任意）</span>
              <input
                type="text"
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                placeholder="例：活動メンバー2名登録済み・月1回定例活動予定"
              />
            </label>
            <div>
              <button type="submit" disabled={disabled}>
                運営へ市民団体認証（法人格・責任者権限）を申請する
              </button>
            </div>
          </form>
        )}
      </section>
    );
  }

  // Citizen expert qualification certification banner
  if (account.roleTrack === 'citizen') {
    if (publicProfile?.expertCertified) {
      return (
        <section className="card" style={{ borderLeft: '5px solid #185c37' }}>
          <span className="badge badge-ok">運営による専門家資格認証済み（市民枠）</span>
          <p className="muted-sm" style={{ marginTop: 6, marginBottom: 0 }}>
            認証メモ：{publicProfile.expertCertificationNote ?? '運営確認済み'} — タイムラインへのコメントには自動で「認証済み専門家の助言」バッジが付与されます。
          </p>
        </section>
      );
    }

    return (
      <section className="card card-muted">
        <div className="dashboard-hero-head">
          <div>
            <strong>専門家資格認証（任意・市民枠からの認証申請）</strong>
            <div className="muted-sm">
              区分上は一般市民枠のまま、運営から資格認証を受けると専門家バッジと助言記録が有効化されます。
            </div>
          </div>
          {latestPending ? (
            <span className="badge badge-warn">資格認証 審査待ち ({latestPending.id})</span>
          ) : (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setShowExpertForm((v) => !v)}
            >
              {showExpertForm ? '閉じる' : '専門家資格認証を申請する'}
            </button>
          )}
        </div>

        {showExpertForm && !latestPending && (
          <form
            className="venue-form"
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              void submitRequest(
                'expert',
                '里山植生調査および野外安全管理に関する専門家資格認証を申請します。'
              );
            }}
          >
            <label className="field-group">
              <span>専門分野・助言できる内容</span>
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="例：植生調査設計・竹林伐採時の安全管理助言が可能です"
              />
            </label>
            <label className="field-group">
              <span>資格・実績の根拠メモ（運営確認用）</span>
              <input
                type="text"
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                placeholder="例：植物生態学研究歴・野外安全講習修了（模擬根拠）"
              />
            </label>
            <div>
              <button type="submit" disabled={disabled}>
                運営へ資格認証を申請する
              </button>
            </div>
          </form>
        )}
      </section>
    );
  }

  return null;
}
