'use client';

import { useState } from 'react';
import {
  KYUSHU_GRID_CELLS,
  type DemoAccountRecord,
  type PublicVenueProfileView
} from '@satoyama/domain';
import type {
  OrgChatMessageRecord,
  VenueFoundationSnapshot
} from '../../../../db/venue-store';

interface VenueOrganizationPanelProps {
  account: DemoAccountRecord;
  publicProfile: PublicVenueProfileView | null;
  orgChatMessages: readonly OrgChatMessageRecord[];
  snapshot: VenueFoundationSnapshot;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onFeedback: (fb: { kind: 'ok' | 'error'; text: string }) => void;
}

export function VenueOrganizationPanel({
  account,
  publicProfile,
  orgChatMessages,
  snapshot,
  busy,
  onRefresh,
  onFeedback
}: VenueOrganizationPanelProps) {
  const [submitting, setSubmitting] = useState(false);

  // Calendar event form
  const [calTitle, setCalTitle] = useState('');
  const [calDate, setCalDate] = useState('2026-12-06');
  const [calGridId, setCalGridId] = useState(publicProfile?.gridCellId ?? 'grid-r1-c2');
  const [calParticipants, setCalParticipants] = useState('6');
  const [calSummary, setCalSummary] = useState('');

  // Dummy member form
  const [memberName, setMemberName] = useState('');
  const [memberRoleNote, setMemberRoleNote] = useState('整備班');

  // Private chat form
  const [chatBody, setChatBody] = useState('');

  // Report generation form
  const [reportTitle, setReportTitle] = useState('伊都里山みらいの会 活動実績・透明化簡易レポート');
  const [reportPeriod, setReportPeriod] = useState('2026年11月〜12月 実証期間');
  const [reportNote, setReportNote] = useState('');

  const isCertified = publicProfile?.orgCertificationStatus === 'certified';
  const actorMap = new Map(snapshot.actors.map((a) => [a.id, a]));

  const myEvents = snapshot.orgCalendarEvents.filter((e) => e.organizationActorId === account.actorId);
  const myMembers = snapshot.memberships.filter((m) => m.organizationActorId === account.actorId);
  const myReports = snapshot.activityReports.filter((r) => r.organizationActorId === account.actorId);
  const myPosts = snapshot.initialPosts.filter((p) => p.authorActorId === account.actorId);
  const myPostIds = new Set(myPosts.map((p) => p.id));
  const myExpertAdviceCount = snapshot.comments.filter((c) => myPostIds.has(c.postId) && c.isExpertAdvice).length;
  const completedCount = myEvents.filter((e) => e.status === 'completed').length;

  async function runAction(fn: () => Promise<void>) {
    setSubmitting(true);
    try {
      await fn();
      await onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddCalendarEvent(e: React.FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      const res = await fetch('/api/venue/org/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: calTitle,
          scheduledDate: calDate,
          gridCellId: calGridId,
          participantCount: Number(calParticipants || 0),
          summary: calSummary
        })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? 'カレンダー登録に失敗しました。' });
      } else {
        setCalTitle('');
        setCalSummary('');
        onFeedback({ kind: 'ok', text: '団体カレンダーへ活動予定を登録しました。' });
      }
    });
  }

  async function handleToggleEventStatus(eventId: string, nextStatus: 'planned' | 'completed') {
    await runAction(async () => {
      const res = await fetch('/api/venue/org/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-status', eventId, status: nextStatus })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? 'ステータス更新に失敗しました。' });
      } else {
        onFeedback({
          kind: 'ok',
          text: nextStatus === 'completed' ? '実施済みとして記録しました（簡易レポートの集計対象になります）。' : '予定へ戻しました。'
        });
      }
    });
  }

  async function handleAddDummyMember(e: React.FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      const res = await fetch('/api/venue/org/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: memberName, roleNote: memberRoleNote })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? 'ダミーメンバー追加に失敗しました。' });
      } else {
        setMemberName('');
        onFeedback({ kind: 'ok', text: 'ダミーメンバーを登録しました（デモ用・操作アカウント非紐付け）。' });
      }
    });
  }

  async function handlePostChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatBody.trim()) return;
    await runAction(async () => {
      const res = await fetch('/api/venue/org/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: chatBody })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? 'チャット送信に失敗しました。' });
      } else {
        setChatBody('');
      }
    });
  }

  async function handleGenerateReport(e: React.FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      const res = await fetch('/api/venue/org/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: reportTitle,
          periodLabel: reportPeriod,
          additionalNote: reportNote
        })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? '簡易レポート生成に失敗しました。' });
      } else {
        setReportNote('');
        onFeedback({
          kind: 'ok',
          text: '活動実績の簡易透明化レポートを生成しました（自治体への公的申請・企業資金支援判定へ連動します）。'
        });
      }
    });
  }

  if (!isCertified) {
    return (
      <section className="card card-muted">
        <h2>
          市民団体専用ワークスペース <span className="badge badge-warn">認証待ちロック中</span>
        </h2>
        <p className="muted-sm">
          上の申請パネルから運営認証（法人格・責任者認証）を受けると、以下の4機能が即時解放されます（未認証状態ではサーバー側APIも 403 で保護されます）。
        </p>
        <div className="grid-2" style={{ marginTop: 10 }}>
          <div className="feed-item">
            <strong>🔒 カレンダー活動管理</strong>
            <div className="muted-sm">活動予定の登録・実施完了記録</div>
          </div>
          <div className="feed-item">
            <strong>🔒 メンバー管理（ダミー団員）</strong>
            <div className="muted-sm">認証済み責任者・団員名簿の管理</div>
          </div>
          <div className="feed-item">
            <strong>🔒 メンバーチャットスペース</strong>
            <div className="muted-sm">団体内部専用の非公開チャット</div>
          </div>
          <div className="feed-item">
            <strong>🔒 活動実績の簡易レポート作成</strong>
            <div className="muted-sm">自治体への実績透明化・申請添付資料</div>
          </div>
        </div>
      </section>
    );
  }

  const disabled = busy || submitting;

  return (
    <div className="org-workspace-stack">
      <div className="grid-2">
        {/* 1. Calendar Management */}
        <section className="card" style={{ borderTop: '4px solid #185c37' }}>
          <h2>
            団体専用①：カレンダー活動管理{' '}
            <span className="badge badge-ok">実施済 {completedCount} / 計 {myEvents.length} 件</span>
          </h2>
          <form onSubmit={handleAddCalendarEvent} className="venue-form">
            <div className="grid-2">
              <label className="field-group">
                <span>活動日</span>
                <input type="date" required value={calDate} onChange={(e) => setCalDate(e.target.value)} />
              </label>
              <label className="field-group">
                <span>参加人数（見込/実績）</span>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={calParticipants}
                  onChange={(e) => setCalParticipants(e.target.value)}
                />
              </label>
            </div>
            <label className="field-group">
              <span>活動タイトル</span>
              <input
                type="text"
                required
                value={calTitle}
                onChange={(e) => setCalTitle(e.target.value)}
                placeholder="例：元岡東側・放置竹林の伐採と歩道点検"
              />
            </label>
            <label className="field-group">
              <span>活動区画（九州大学周辺グリッド）</span>
              <select value={calGridId} onChange={(e) => setCalGridId(e.target.value)}>
                {KYUSHU_GRID_CELLS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.id})
                  </option>
                ))}
              </select>
            </label>
            <input
              type="text"
              value={calSummary}
              onChange={(e) => setCalSummary(e.target.value)}
              placeholder="メモ（持ち物・安全確認など任意）"
              style={{ font: 'inherit', padding: '7px 10px', borderRadius: 7, border: '1px solid #b5c4ae' }}
            />
            <div>
              <button type="submit" disabled={disabled}>
                カレンダーに予定を追加
              </button>
            </div>
          </form>

          <div className="feed-list" style={{ marginTop: 12 }}>
            {myEvents.length === 0 ? (
              <p className="muted-sm">まだ活動予定はありません。</p>
            ) : (
              myEvents.map((ev) => (
                <div key={ev.id} className="feed-item">
                  <div className="notif-head">
                    <div>
                      <span className={`badge ${ev.status === 'completed' ? 'badge-ok' : 'badge-sim'}`}>
                        {ev.status === 'completed' ? '実施済み' : '予定'}
                      </span>{' '}
                      <strong>{ev.scheduledDate}</strong> {ev.title}
                    </div>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => handleToggleEventStatus(ev.id, ev.status === 'completed' ? 'planned' : 'completed')}
                      disabled={disabled}
                    >
                      {ev.status === 'completed' ? '予定に戻す' : '実施済みにする'}
                    </button>
                  </div>
                  <div className="muted-sm">
                    参加: {ev.participantCount}名 {ev.summary ? `／ ${ev.summary}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 2. Member Management (Dummy Members) + Private Org Chat */}
        <div className="social-side-col">
          <section className="card" style={{ borderTop: '4px solid #185c37' }}>
            <h2>
              団体専用②：メンバー管理 <span className="badge badge-sim">{myMembers.length} 名</span>
            </h2>
            <p className="muted-sm">
              デモでは一般市民役と区別するため、団体メンバーは操作対象外のダミーデータとして登録・管理します。
            </p>
            <div className="notif-list">
              {myMembers.map((m) => {
                const person = actorMap.get(m.personActorId);
                return (
                  <div key={`${m.personActorId}-${m.organizationActorId}`} className="notif-item notif-read">
                    <div className="notif-head">
                      <strong>{person?.displayName ?? m.personActorId}</strong>
                      <span className={`badge ${m.role === 'leader' ? 'badge-ok' : 'badge-sim'}`}>
                        {m.role === 'leader' ? '認証済み責任者' : m.isDummy ? 'ダミー団員（操作外）' : 'メンバー'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <form onSubmit={handleAddDummyMember} className="comment-input-row" style={{ marginTop: 10 }}>
              <input
                type="text"
                required
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="追加するダミー団員名（例：桑原 花子）"
              />
              <input
                type="text"
                value={memberRoleNote}
                onChange={(e) => setMemberRoleNote(e.target.value)}
                placeholder="担当班"
                style={{ maxWidth: 110 }}
              />
              <button type="submit" className="btn-sm" disabled={disabled}>
                追加
              </button>
            </form>
          </section>

          <section className="card" style={{ borderTop: '4px solid #185c37' }}>
            <h2>
              団体専用③：メンバーチャット <span className="badge badge-public">団体外非公開</span>
            </h2>
            <div className="notif-list">
              {orgChatMessages.length === 0 ? (
                <p className="muted-sm">団体内チャットはまだありません（団体外ユーザーからは閲覧不可）。</p>
              ) : (
                orgChatMessages.map((msg) => (
                  <div key={msg.id} className="comment-item">
                    <div className="muted-sm">
                      <strong>{msg.senderDisplayName}</strong>
                    </div>
                    <div>{msg.body}</div>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handlePostChat} className="comment-input-row" style={{ marginTop: 10 }}>
              <input
                type="text"
                value={chatBody}
                onChange={(e) => setChatBody(e.target.value)}
                placeholder="団体内連絡を入力（備品確認・集合時間など）..."
              />
              <button type="submit" className="btn-sm" disabled={disabled || !chatBody.trim()}>
                送信
              </button>
            </form>
          </section>
        </div>
      </div>

      {/* 4. Simplified Activity Report Generation */}
      <section className="card" style={{ borderTop: '4px solid #21405d' }}>
        <h2>
          団体専用④：活動実績の簡易レポート作成（自治体向け透明化）{' '}
          <span className="badge badge-public">生成済 {myReports.length} 件</span>
        </h2>
        <p className="muted-sm">
          現在の自動集計プレビュー：実施済みカレンダー活動 <strong>{completedCount}件</strong> ／ SNS活動投稿{' '}
          <strong>{myPosts.length}件</strong> ／ 認証済み専門家助言 <strong>{myExpertAdviceCount}件</strong>
        </p>

        <form onSubmit={handleGenerateReport} className="venue-form" style={{ marginTop: 10 }}>
          <div className="grid-2">
            <label className="field-group">
              <span>レポート表題</span>
              <input type="text" required value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} />
            </label>
            <label className="field-group">
              <span>対象期間ラベル</span>
              <input type="text" required value={reportPeriod} onChange={(e) => setReportPeriod(e.target.value)} />
            </label>
          </div>
          <label className="field-group">
            <span>自治体への補足メモ（任意）</span>
            <input
              type="text"
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              placeholder="例：公有林の資材保管スペースおよび安全講習支援を希望"
            />
          </label>
          <div>
            <button type="submit" disabled={disabled}>
              サイト上の活動ログから簡易レポートを自動生成する
            </button>
          </div>
        </form>

        {myReports.length > 0 && (
          <div className="feed-list" style={{ marginTop: 12 }}>
            {myReports.map((rep) => (
              <article key={rep.id} className="feed-item">
                <div className="notif-head">
                  <strong>{rep.title}</strong>
                  <span className="badge badge-ok">{rep.id}</span>
                </div>
                <p className="muted-sm" style={{ marginTop: 4, marginBottom: 0 }}>
                  {rep.summaryText}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
