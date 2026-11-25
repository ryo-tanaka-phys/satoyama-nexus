'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { WEREWOLF_MISSIONS, type DemoAccountRecord } from '@satoyama/domain';
import type {
  WerewolfAssignmentRecord,
  WerewolfRoomRecord,
  WerewolfRoomState
} from '../../../../db/venue-store';
import type { ClassroomVerificationCoverage } from '../../lib/werewolf-coverage';

export interface WerewolfStatePayload {
  authenticated: boolean;
  account: DemoAccountRecord | null;
  mode: 'standard' | 'werewolf' | null;
  isOperator: boolean;
  rooms: readonly WerewolfRoomState[];
  myRoom: WerewolfRoomRecord | null;
  myAssignment: WerewolfAssignmentRecord | null;
  participantCount: number;
  participantNames: readonly string[];
  verificationCoverage?: ClassroomVerificationCoverage | null;
}

export function WerewolfClient({ initialState }: { initialState: WerewolfStatePayload }) {
  const [state, setState] = useState<WerewolfStatePayload>(initialState);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/werewolf/state', { cache: 'no-store' });
      if (!res.ok) return;
      const next = (await res.json()) as WerewolfStatePayload;
      startTransition(() => setState(next));
    } catch {
      // Ignore transient polling errors
    }
  }, []);

  // 4-second auto-polling for classroom live lobby & role draw updates
  useEffect(() => {
    const id = setInterval(() => {
      if (!busy) {
        void refresh();
      }
    }, 4000);
    return () => clearInterval(id);
  }, [busy, refresh]);

  async function handleOperatorLogin() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/venue/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'demo-acct-operator' })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        setFeedback({ kind: 'error', text: json.message ?? '運営ログインに失敗しました。' });
      } else {
        await refresh();
        setFeedback({ kind: 'ok', text: '運営（据え置き）として入室しました。体験ルームを作成できます。' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleOperatorAction(payload: Record<string, unknown>, okMessage: string) {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/werewolf/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        setFeedback({ kind: 'error', text: json.message ?? '操作に失敗しました。' });
      } else {
        await refresh();
        setFeedback({ kind: 'ok', text: okMessage });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/werewolf/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: roomCodeInput, displayName: displayNameInput })
      });
      const json = (await res.json()) as {
        ok: boolean;
        message?: string;
        lateJoined?: boolean;
        room?: { code: string };
      };
      if (!json.ok) {
        setFeedback({ kind: 'error', text: json.message ?? 'ルーム参加に失敗しました。' });
      } else {
        await refresh();
        setFeedback({
          kind: 'ok',
          text: json.lateJoined
            ? `ルーム ${json.room?.code} へ途中合流しました（一般市民役が自動割当されました）。`
            : `ルーム ${json.room?.code} の待機室に入室しました。運営が抽選を開始するまでこのままお待ちください。`
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLeaveSession() {
    setBusy(true);
    setFeedback(null);
    try {
      await fetch('/api/venue/logout', { method: 'POST' });
      await refresh();
      setFeedback({ kind: 'ok', text: 'セッションを終了しました。別ルームや通常モードへ入れます。' });
    } finally {
      setBusy(false);
    }
  }

  const activeRooms = state.rooms.filter((r) => r.room.status !== 'closed');
  const closedRooms = state.rooms.filter((r) => r.room.status === 'closed');
  const assignedMission =
    state.myAssignment && state.myRoom?.status === 'assigned'
      ? WEREWOLF_MISSIONS[state.myAssignment.assignedRole]
      : null;

  return (
    <>
      <nav className="venue-topnav">
        <div className="venue-topnav-inner">
          <Link href="/" className="venue-brand">
            Satoyama Nexus
          </Link>
          <div className="venue-nav-links">
            <Link href="/" className="nav-pill">
              通常モード（本体）
            </Link>
            <span className="nav-pill nav-pill-active">人狼モード（第2部・本体分離）</span>
            <Link href="/workbench" className="nav-pill">
              裏方検証ワークベンチ
            </Link>
            {state.authenticated && (
              <button type="button" className="btn-secondary btn-sm" onClick={handleLeaveSession} disabled={busy}>
                退出 / ログアウト
              </button>
            )}
          </div>
        </div>
      </nav>

      <main>
        <p className="eyebrow">SEPARATED DEMO WRAPPER · WEREWOLF ROLEPLAY LOBBY</p>
        <h1>人狼モード（第2部・ランダム役柄ロールプレイ）</h1>

        <aside className="phase-banner">
          体験デモ専用の分離ラッパーです。運営役を据え置き、ルームコードで集まった参加者へ「自治体・市民団体・専門家候補・一般市民」を最低保証付きでシャッフル配布します（大本のM1認証境界・監査ログ・企業分離はそのまま維持）。
        </aside>

        {feedback && (
          <div className={`feedback-box ${feedback.kind === 'ok' ? 'feedback-ok' : 'feedback-err'}`} role="status">
            {feedback.text}
          </div>
        )}

        <div className="grid-2" style={{ alignItems: 'start' }}>
          {/* Left: Participant Join / Waiting / Mission Card */}
          <section className="card">
            <h2>
              参加者エリア（学生・講師） <span className="badge badge-sim">4秒自動同期</span>
            </h2>

            {state.isOperator ? (
              <div className="card card-muted">
                <strong>現在、運営（据え置き）アカウントでログイン中です。</strong>
                <p className="muted-sm" style={{ marginTop: 6 }}>
                  右側の運営コントロールパネルからルームを作成し、4文字のルームコードを参加者の皆さんへ共有してください。
                </p>
                <Link href="/" className="btn-link">
                  運営ダッシュボード（認証審査・仲介パネル）を開く →
                </Link>
              </div>
            ) : state.myRoom && state.myAssignment ? (
              state.myRoom.status === 'assigned' && assignedMission ? (
                <div className="werewolf-mission-card">
                  <span className="badge badge-ok">配役確定！ ルーム {state.myRoom.code}</span>
                  <h2 style={{ marginTop: 10, marginBottom: 6 }}>
                    あなたの役柄：{assignedMission.label}
                  </h2>
                  <p style={{ fontSize: '1rem', fontWeight: 600 }}>{state.myAssignment.missionHint || assignedMission.mission}</p>
                  <div className="werewolf-checklist" style={{ marginTop: 10, marginBottom: 12 }}>
                    {assignedMission.steps.map((s, idx) => (
                      <div key={s.id} className="werewolf-check-item">
                        <div className="werewolf-check-title">
                          <span className="badge badge-sim">Step {idx + 1}</span> <strong>{s.action}</strong>
                        </div>
                        <div className="muted-sm">検証ポイント：{s.verificationPoint}</div>
                      </div>
                    ))}
                  </div>
                  <p className="muted-sm">
                    ※ダッシュボードへ入ると、各ステップの達成状況がリアルタイムで自動チェックされます。
                  </p>
                  <div className="feed-actions">
                    <Link href="/" className="btn-link" style={{ background: '#2c523e', color: '#ffffff', borderColor: '#1f3c2d' }}>
                      この役で模擬の場（ダッシュボード）へ入る →
                    </Link>
                  </div>
                </div>
              ) : state.myRoom.status === 'closed' ? (
                <div className="card card-muted">
                  <strong>ルーム {state.myRoom.code} は終了しました。</strong>
                  <p className="muted-sm">次のラウンドへ参加する場合は退出してから新しいルームコードを入力してください。</p>
                  <button type="button" className="btn-secondary" onClick={handleLeaveSession} disabled={busy}>
                    退出して別ルームへ参加する
                  </button>
                </div>
              ) : (
                <div className="card card-muted">
                  <span className="badge badge-warn">待機室に入室済み · ルーム {state.myRoom.code}</span>
                  <h3 style={{ marginTop: 8 }}>
                    {state.myAssignment.displayName} さん、運営の抽選を待っています…
                  </h3>
                  <p className="muted-sm">
                    現在の待機人数：<strong>{state.participantCount} 名</strong>（
                    {state.participantNames.join('・')}）
                  </p>
                  <p className="muted-sm">
                    運営が「役柄を抽選して開始」を押すと、4秒以内にこの画面へあなたの役柄とミッションカードが表示されます（リロードしても復帰します）。
                  </p>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void refresh()} disabled={busy}>
                    今すぐ確認
                  </button>
                </div>
              )
            ) : (
              <form onSubmit={handleJoinRoom} className="venue-form">
                <p className="muted-sm">
                  運営が画面に映している <strong>4文字のルームコード</strong> と、自分のニックネームを入れて待機室に入ってください。
                </p>
                <label className="field-group">
                  <span>ルームコード（4文字・例: ITO4）</span>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    placeholder="4文字コードを入力"
                    className="werewolf-code-input"
                  />
                </label>
                <label className="field-group">
                  <span>ニックネーム（表示名）</span>
                  <input
                    type="text"
                    required
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    placeholder="例：九大 太郎"
                  />
                </label>
                <button type="submit" disabled={busy}>
                  待機室に参加する
                </button>
              </form>
            )}
          </section>

          {/* Right: Operator Control Panel (Fixed Operator) */}
          <section className="card" style={{ borderTop: '4px solid #526c35' }}>
            <h2>
              運営コントロール（据え置き専用） <span className="badge badge-public">最低保証シャッフル</span>
            </h2>

            {!state.isOperator ? (
              <div className="card card-muted">
                <p className="muted-sm">
                  第2部の進行役（運営・審査担当）はこちらのボタンから運営として入室し、体験ルームの発行・参加者の除外・抽選開始を行えます。
                </p>
                <button type="button" onClick={handleOperatorLogin} disabled={busy}>
                  運営審査担当（据え置き）として入室する
                </button>
              </div>
            ) : (
              <div className="venue-form">
                <div className="feed-actions" style={{ marginTop: 0 }}>
                  <button
                    type="button"
                    onClick={() =>
                      handleOperatorAction({ action: 'create' }, '新しい人狼モード体験ルームを作成しました。ルームコードを参加者へ共有してください。')
                    }
                    disabled={busy}
                  >
                    + 新しい体験ルームを作成（4文字コード発行）
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void refresh()} disabled={busy}>
                    参加者リスト更新
                  </button>
                </div>

                {activeRooms.length === 0 ? (
                  <p className="muted-sm">現在稼働中のルームはありません。上のボタンからルームを作成してください。</p>
                ) : (
                  activeRooms.map((rs) => (
                    <div key={rs.room.id} className="feed-item" style={{ background: '#f7faf2' }}>
                      <div className="notif-head">
                        <div>
                          <span className={`badge ${rs.room.status === 'assigned' ? 'badge-ok' : 'badge-warn'}`}>
                            {rs.room.status === 'assigned' ? '配役済み・進行中' : '待機室オープン中'}
                          </span>
                        </div>
                        <span className="werewolf-room-code">{rs.room.code}</span>
                      </div>

                      <div className="muted-sm" style={{ marginBottom: 8 }}>
                        参加人数：<strong>{rs.participants.length} 名</strong>（4人以上で自治体・市民団体・専門家候補・一般市民が全員分確実に配られます）
                      </div>

                      {rs.participants.length > 0 && (
                        <div className="notif-list" style={{ marginBottom: 10 }}>
                          {rs.participants.map((p) => (
                            <div key={p.accountId} className="notif-item notif-read">
                              <div className="notif-head">
                                <div>
                                  <strong>{p.displayName}</strong>
                                  {rs.room.status === 'assigned' && (
                                    <>
                                      {' '}
                                      <span className="badge badge-public">
                                        {WEREWOLF_MISSIONS[p.assignedRole].label}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {rs.room.status === 'lobby' && (
                                  <button
                                    type="button"
                                    className="btn-danger btn-sm"
                                    onClick={() =>
                                      handleOperatorAction(
                                        { action: 'kick', roomId: rs.room.id, targetAccountId: p.accountId },
                                        `${p.displayName} さんを待機室から除外しました。`
                                      )
                                    }
                                    disabled={busy}
                                  >
                                    除外
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="feed-actions">
                        {rs.room.status === 'lobby' && (
                          <button
                            type="button"
                            onClick={() =>
                              handleOperatorAction(
                                { action: 'assign', roomId: rs.room.id },
                                `ルーム ${rs.room.code} の役柄を抽選配布しました！各端末に役柄とミッションカードが表示されます。`
                              )
                            }
                            disabled={busy || rs.participants.length === 0}
                          >
                            役柄を抽選して開始 ({rs.participants.length}名)
                          </button>
                        )}
                        {rs.room.status === 'assigned' && (
                          <Link href="/" className="btn-link">
                            運営ダッシュボードで審査・仲介を行う →
                          </Link>
                        )}
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() =>
                            handleOperatorAction(
                              { action: 'close', roomId: rs.room.id },
                              `ルーム ${rs.room.code} を終了しました（監査ログは保持されます）。`
                            )
                          }
                          disabled={busy}
                        >
                          ルーム終了
                        </button>
                      </div>
                    </div>
                  ))
                )}

                {closedRooms.length > 0 && (
                  <p className="muted-sm">終了済みルーム：{closedRooms.map((r) => r.room.code).join(', ')}</p>
                )}

                {state.verificationCoverage && (
                  <div className="feed-item" style={{ background: '#ffffff', marginTop: 4 }}>
                    <div className="notif-head" style={{ marginBottom: 8 }}>
                      <strong>教室全体の機能検証カバレッジ（リアルタイム）</strong>
                      <span
                        className={`badge ${
                          state.verificationCoverage.verifiedCount === state.verificationCoverage.totalCount
                            ? 'badge-ok'
                            : 'badge-warn'
                        }`}
                      >
                        {state.verificationCoverage.verifiedCount} / {state.verificationCoverage.totalCount} 機構 検証済み
                      </span>
                    </div>
                    <div className="werewolf-checklist" style={{ marginTop: 0 }}>
                      {state.verificationCoverage.items.map((item) => (
                        <div
                          key={item.id}
                          className={`werewolf-check-item ${item.verified ? 'werewolf-check-done' : ''}`}
                        >
                          <div className="werewolf-check-title">
                            <span className={`badge ${item.verified ? 'badge-ok' : 'badge-sim'}`}>
                              {item.verified ? '✓ 検証済み' : '未発火'}
                            </span>{' '}
                            <strong>{item.label}</strong>
                          </div>
                          <div className="muted-sm">
                            {item.mechanism}（{item.detail}）
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
