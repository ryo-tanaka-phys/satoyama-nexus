'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  VENUE_TAGS,
  type DemoAccountRecord,
  type PublicVenueProfileView,
  type VenueRoleTrack,
  type VenueTag
} from '@satoyama/domain';
import type {
  OrgChatMessageRecord,
  VenueFoundationSnapshot,
  VenueNotificationRecord
} from '../../../db/venue-store';
import { KyushuGridPicker } from './components/kyushu-grid-picker';
import { VenueSocialHub } from './components/venue-social-hub';
import { VenueCertificationBanner } from './components/venue-certification-banner';
import { VenueOperatorPanel } from './components/venue-operator-panel';
import { VenueOrganizationPanel } from './components/venue-organization-panel';

export interface InitialVenuePageData {
  authenticated: boolean;
  mode: 'standard' | 'werewolf' | null;
  account: DemoAccountRecord | null;
  publicProfile: PublicVenueProfileView | null;
  authSummary: {
    userAccountId: string;
    roles: readonly string[];
    operatedActorIds: readonly string[];
  } | null;
  notifications: readonly VenueNotificationRecord[];
  orgChatMessages: readonly OrgChatMessageRecord[];
  snapshot: VenueFoundationSnapshot;
  serverTimestamp: string;
}

const POLL_INTERVAL_MS = 4000;

const ROLE_OPTIONS: readonly {
  value: VenueRoleTrack;
  label: string;
  desc: string;
}[] = [
  {
    value: 'citizen',
    label: '一般市民（専門家候補を含む）',
    desc: '横の交流・能動マッチング・紹介希望。運営の資格認証で専門家バッジが有効化されます。'
  },
  {
    value: 'organization',
    label: '市民団体（未認証からスタート）',
    desc: '法人格モデル。運営から団体認証を受けるとカレンダー・メンバー管理・チャット・簡易レポートが解放されます。'
  },
  {
    value: 'government',
    label: '自治体（公的窓口）',
    desc: '団体の要望・簡易レポートを受け取り、各アカウントへオファーや支援案内を発信します。'
  },
  {
    value: 'operator',
    label: '運営・審査者（裏方・据え置き）',
    desc: '宛てがない人の厳格審査（AI一次評価→人間二次審査）、団体認証・専門家資格認証を担います。'
  }
];

function roleBadgeLabel(account: DemoAccountRecord, profile: PublicVenueProfileView | null): string {
  if (account.roleTrack === 'operator') return '運営・審査者';
  if (account.roleTrack === 'government') return '自治体（公的機関）';
  if (account.roleTrack === 'organization') {
    return profile?.orgCertificationStatus === 'certified' ? '認証済み市民団体' : '市民団体（未認証・機能ロック中）';
  }
  return profile?.expertCertified ? '専門家（資格認証済み・市民枠）' : '一般市民';
}

export function VenueEntryClient({ initialData }: { initialData: InitialVenuePageData }) {
  const [data, setData] = useState<InitialVenuePageData>(initialData);
  const [busy, setBusy] = useState(false);
  const [autoPoll, setAutoPoll] = useState(true);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [, startTransition] = useTransition();

  // Registration form state
  const [roleTrack, setRoleTrack] = useState<VenueRoleTrack>('citizen');
  const [displayName, setDisplayName] = useState('');
  const [ageInternal, setAgeInternal] = useState('');
  const [genderInternal, setGenderInternal] = useState('');
  const [gridCellId, setGridCellId] = useState('grid-r1-c2');
  const [postalCode, setPostalCode] = useState('');
  const [interestTags, setInterestTags] = useState<VenueTag[]>(['竹林整備', '自然観察会']);
  const [strengthTags, setStrengthTags] = useState<VenueTag[]>(['広報']);
  const [bio, setBio] = useState('');
  const [seekingMatch, setSeekingMatch] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/venue/session', { cache: 'no-store' });
      if (!res.ok) return;
      const next = (await res.json()) as InitialVenuePageData;
      startTransition(() => setData(next));
    } catch {
      // Ignore transient network errors during background polling
    }
  }, []);

  // 4-second polling for live 5-device synchronization while logged in
  useEffect(() => {
    if (!data.authenticated || !autoPoll) return;
    const id = setInterval(() => {
      if (!busy) {
        void refreshSession();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [data.authenticated, autoPoll, busy, refreshSession]);

  function toggleTag(list: VenueTag[], setList: (next: VenueTag[]) => void, tag: VenueTag) {
    if (list.includes(tag)) {
      setList(list.filter((t) => t !== tag));
    } else {
      setList([...list, tag]);
    }
  }

  async function handleQuickLogin(accountId: string, label: string) {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/venue/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        setFeedback({ kind: 'error', text: json.message ?? 'ログインに失敗しました。' });
      } else {
        await refreshSession();
        setFeedback({ kind: 'ok', text: `「${label}」としてサーバー側セッションを確立しました。` });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/venue/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          roleTrack,
          gridCellId,
          postalCode: postalCode.trim() || null,
          interestTags,
          strengthTags,
          bio,
          ageInternal: ageInternal.trim() ? Number(ageInternal) : null,
          genderInternal: genderInternal.trim() || null,
          seekingMatch
        })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        setFeedback({ kind: 'error', text: json.message ?? '登録に失敗しました。' });
      } else {
        setDisplayName('');
        setAgeInternal('');
        setGenderInternal('');
        setBio('');
        await refreshSession();
        setFeedback({
          kind: 'ok',
          text: '新規アカウントを登録し、HttpOnly Cookie セッションでログインしました（年齢・性別は内部データとして非公開保持されます）。'
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setFeedback(null);
    try {
      await fetch('/api/venue/logout', { method: 'POST' });
      await refreshSession();
      setFeedback({ kind: 'ok', text: 'ログアウトし、サーバー側セッションを失効させました。' });
    } finally {
      setBusy(false);
    }
  }

  const demoAccounts5 = data.snapshot.demoAccounts.filter((a) => a.id.startsWith('demo-acct-'));
  const profileMap = new Map(data.snapshot.publicProfiles.map((p) => [p.actorId, p]));

  return (
    <>
      <nav className="venue-topnav">
        <div className="venue-topnav-inner">
          <Link href="/" className="venue-brand">
            Satoyama Nexus
          </Link>
          <div className="venue-nav-links">
            <span className="nav-pill nav-pill-active">通常モード（SNS模擬の場）</span>
            <Link href="/werewolf" className="nav-pill">
              人狼モード（第2部体験用）
            </Link>
            <Link href="/workbench" className="nav-pill">
              裏方検証ワークベンチ
            </Link>
            {data.authenticated && data.account && (
              <button type="button" className="btn-secondary btn-sm" onClick={handleLogout} disabled={busy}>
                ログアウト
              </button>
            )}
          </div>
        </div>
      </nav>

      <main>
        <p className="eyebrow">KYUSHU UNIVERSITY ITO AREA · SIMULATED COLLABORATION VENUE</p>
        <h1>Satoyama Nexus — 里山協働・模擬プラットフォーム</h1>

        <aside className="phase-banner">
          模擬実証環境（九州大学周辺エリア）：表示される活動・団体・自治体・企業はすべて架空の模擬データです。外部への実連絡・実申請は一切行いません。
        </aside>

        {feedback && (
          <div className={`feedback-box ${feedback.kind === 'ok' ? 'feedback-ok' : 'feedback-err'}`} role="status">
            {feedback.text}
          </div>
        )}

        {!data.authenticated || !data.account ? (
          <>
            <section className="card mode-strip">
              <div>
                <h2>デモ参加モード選択（本体と体験用を分離）</h2>
                <p className="muted-sm">
                  第1部の5人実演・通常登録はこの「通常モード」から、第2部のランダム役柄割り当て体験は分離された「人狼モード」から入室します。
                </p>
              </div>
              <div className="mode-actions">
                <span className="badge badge-ok">現在：通常モード（本体）</span>
                <Link href="/werewolf" className="btn-link">
                  人狼モード入口へ切替 →
                </Link>
              </div>
            </section>

            <div className="venue-entry-layout">
              <section className="card">
                <h2>
                  第1部・5人実演用 クイックログイン <span className="badge badge-sim">5端末同時デモ対応</span>
                </h2>
                <p className="muted-sm">
                  班メンバー5人が各自の端末から別々の役を選んでログインできます。セッションは端末ごとの HttpOnly Cookie でサーバー側管理されます。
                </p>
                <div className="quick-login-list">
                  {demoAccounts5.map((acct) => {
                    const prof = profileMap.get(acct.actorId) ?? null;
                    return (
                      <div key={acct.id} className="quick-login-card">
                        <div>
                          <div className="quick-login-title">
                            <strong>{acct.displayName}</strong>{' '}
                            <span className="badge badge-public">{roleBadgeLabel(acct, prof)}</span>
                          </div>
                          <div className="muted-sm">
                            本拠地：{prof?.gridLabel ?? '未設定'} ／ 興味：{prof?.interestTags.join('・') || 'なし'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleQuickLogin(acct.id, acct.displayName)}
                          disabled={busy}
                        >
                          この役で入る
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="card">
                <h2>
                  新規アカウント作成 <span className="badge badge-sim">タグ＋固定グリッド登録</span>
                </h2>
                <form onSubmit={handleRegister} className="venue-form">
                  <label className="field-group">
                    <span>1. 登録する立場（役割別ダッシュボードが決まります）</span>
                    <select
                      value={roleTrack}
                      onChange={(e) => setRoleTrack(e.target.value as VenueRoleTrack)}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <small className="muted-sm">
                      {ROLE_OPTIONS.find((o) => o.value === roleTrack)?.desc}
                    </small>
                  </label>

                  <label className="field-group">
                    <span>2. 名前（表示名・必須）</span>
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="例：元岡 はるか"
                    />
                  </label>

                  <div className="grid-2">
                    <label className="field-group">
                      <span>年齢（任意・内部データ／他者非公開）</span>
                      <input
                        type="number"
                        min={0}
                        max={130}
                        value={ageInternal}
                        onChange={(e) => setAgeInternal(e.target.value)}
                        placeholder="空欄可"
                      />
                    </label>
                    <label className="field-group">
                      <span>性別（任意・内部データ／他者非公開）</span>
                      <input
                        type="text"
                        value={genderInternal}
                        onChange={(e) => setGenderInternal(e.target.value)}
                        placeholder="自由入力・空欄可"
                      />
                    </label>
                  </div>

                  <div className="field-group">
                    <span>3. 本拠地指定（九州大学周辺 4×4 固定グリッド）</span>
                    <KyushuGridPicker
                      selectedCellId={gridCellId}
                      postalCode={postalCode}
                      onSelectCell={setGridCellId}
                      onChangePostalCode={setPostalCode}
                    />
                  </div>

                  <div className="field-group">
                    <span>4. 興味のある分野（マッチング用・9タグ選択式）</span>
                    <div className="tag-selector">
                      {VENUE_TAGS.map((tag) => {
                        const active = interestTags.includes(tag);
                        return (
                          <button
                            key={`interest-${tag}`}
                            type="button"
                            className={`tag-pill ${active ? 'tag-pill-active' : ''}`}
                            onClick={() => toggleTag(interestTags, setInterestTags, tag)}
                          >
                            {active ? '✓ ' : '+ '}
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="field-group">
                    <span>5. 自信のある分野（技能・専門性タグ・9タグ選択式）</span>
                    <div className="tag-selector">
                      {VENUE_TAGS.map((tag) => {
                        const active = strengthTags.includes(tag);
                        return (
                          <button
                            key={`strength-${tag}`}
                            type="button"
                            className={`tag-pill ${active ? 'tag-pill-strength' : ''}`}
                            onClick={() => toggleTag(strengthTags, setStrengthTags, tag)}
                          >
                            {active ? '★ ' : '+ '}
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="field-group">
                    <span>6. 自己紹介入力カード（AIマッチングには使いません・能動マッチング専用）</span>
                    <textarea
                      rows={3}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="やってみたい活動や、話しかけてほしいことなどを自由に書けます（AIの自動判定入力には渡されません）。"
                    />
                  </label>

                  {roleTrack === 'citizen' && (
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={seekingMatch}
                        onChange={(e) => setSeekingMatch(e.target.checked)}
                      />
                      <span>
                        マッチングの宛てがないため、運営からの仲介・おすすめ通知を希望する（厳格審査ルート対象）
                      </span>
                    </label>
                  )}

                  <button type="submit" disabled={busy}>
                    アカウントを作成してログイン
                  </button>
                </form>
              </section>
            </div>
          </>
        ) : (
          <div className="dashboard-shell">
            <section className="card dashboard-hero">
              <div className="dashboard-hero-head">
                <div>
                  <span className="badge badge-ok">{roleBadgeLabel(data.account, data.publicProfile)}</span>{' '}
                  <span className="badge badge-sim">
                    サーバー認証済み ({data.authSummary?.userAccountId})
                  </span>{' '}
                  <span className="badge badge-public">
                    {autoPoll ? '自動同期 ON (4秒)' : '自動同期 OFF'}
                  </span>
                  <h2 style={{ marginTop: 8 }}>{data.account.displayName} のダッシュボード</h2>
                </div>
                <div className="dashboard-hero-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setAutoPoll((v) => !v)}
                  >
                    {autoPoll ? '自動同期を停止' : '自動同期を再開'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => void refreshSession()}
                    disabled={busy}
                  >
                    今すぐ更新
                  </button>
                  {data.account.roleTrack === 'operator' && (
                    <Link href="/workbench" className="btn-link">
                      M1-M4 裏方厳格審査ワークベンチ →
                    </Link>
                  )}
                  <button type="button" className="btn-secondary btn-sm" onClick={handleLogout} disabled={busy}>
                    ログアウト
                  </button>
                </div>
              </div>

              <div className="profile-summary-strip">
                <span>
                  本拠地：<strong>{data.publicProfile?.gridLabel ?? '未設定'}</strong>
                </span>
                <span>
                  興味：
                  {data.publicProfile?.interestTags.map((t) => (
                    <span key={t} className="badge badge-sim" style={{ marginLeft: 4 }}>
                      {t}
                    </span>
                  ))}
                </span>
                <span>
                  自信：
                  {data.publicProfile?.strengthTags.map((t) => (
                    <span key={t} className="badge badge-public" style={{ marginLeft: 4 }}>
                      ★{t}
                    </span>
                  ))}
                </span>
              </div>
            </section>

            {/* Role-specific certification banner (Organization legal-entity / Citizen expert credential) */}
            <VenueCertificationBanner
              account={data.account}
              publicProfile={data.publicProfile}
              certificationRequests={data.snapshot.certificationRequests}
              busy={busy}
              onRefresh={refreshSession}
              onFeedback={setFeedback}
            />

            {/* Certified Organization Workspace (Calendar / Dummy Members / Private Chat / Reports) */}
            {data.account.roleTrack === 'organization' && (
              <VenueOrganizationPanel
                account={data.account}
                publicProfile={data.publicProfile}
                orgChatMessages={data.orgChatMessages ?? []}
                snapshot={data.snapshot}
                busy={busy}
                onRefresh={refreshSession}
                onFeedback={setFeedback}
              />
            )}

            {/* Operator-only governance & mediated strict-review panel */}
            {data.account.roleTrack === 'operator' && (
              <VenueOperatorPanel
                snapshot={data.snapshot}
                busy={busy}
                onRefresh={refreshSession}
                onFeedback={setFeedback}
              />
            )}

            <VenueSocialHub
              account={data.account}
              publicProfile={data.publicProfile}
              notifications={data.notifications}
              snapshot={data.snapshot}
              busy={busy}
              onRefresh={refreshSession}
              onFeedback={setFeedback}
            />
          </div>
        )}
      </main>
    </>
  );
}
