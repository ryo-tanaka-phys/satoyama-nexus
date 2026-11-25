'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  VENUE_TAGS,
  type DemoAccountRecord,
  type PublicVenueProfileView,
  type VenueRoleTrack,
  type VenueTag
} from '@satoyama/domain';
import type { VenueFoundationSnapshot } from '../../../db/venue-store';
import { KyushuGridPicker } from './components/kyushu-grid-picker';

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
  snapshot: VenueFoundationSnapshot;
}

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

  async function refreshSession() {
    const res = await fetch('/api/venue/session', { cache: 'no-store' });
    const next = (await res.json()) as InitialVenuePageData;
    startTransition(() => setData(next));
  }

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
  const actorMap = new Map(data.snapshot.actors.map((a) => [a.id, a]));
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
            {/* Mode separation strip */}
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
              {/* Left: Quick login for 5-person live demo */}
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

              {/* Right: New registration form */}
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
          /* Logged-in Role Dashboard Shell (P2 verified session view; P3-P6 interactive modules attach here) */
          <div className="dashboard-shell">
            <section className="card dashboard-hero">
              <div className="dashboard-hero-head">
                <div>
                  <span className="badge badge-ok">{roleBadgeLabel(data.account, data.publicProfile)}</span>{' '}
                  <span className="badge badge-sim">
                    サーバー認証済み ({data.authSummary?.userAccountId})
                  </span>
                  <h2 style={{ marginTop: 8 }}>{data.account.displayName} のダッシュボード</h2>
                </div>
                <div className="dashboard-hero-actions">
                  {data.account.roleTrack === 'operator' && (
                    <Link href="/workbench" className="btn-link">
                      M1-M4 裏方厳格審査ワークベンチを開く →
                    </Link>
                  )}
                  <button type="button" className="btn-secondary" onClick={handleLogout} disabled={busy}>
                    ログアウトして別役へ
                  </button>
                </div>
              </div>

              {data.account.roleTrack === 'organization' &&
                data.publicProfile?.orgCertificationStatus !== 'certified' && (
                  <div className="feedback-box feedback-warn" style={{ marginTop: 12 }}>
                    <strong>団体専用機能ロック中（法人格モデル）：</strong>
                    運営による市民団体認証・責任者権限付与が完了するまで、カレンダー活動管理・メンバー管理・メンバーチャット・簡易レポート作成・公的申請はロックされます（P4/P5 で申請・解放フローを接続）。
                  </div>
                )}

              <div className="grid-2" style={{ marginTop: 14 }}>
                <div className="card card-muted">
                  <h3>自己紹介カード（能動マッチング専用・AI非入力）</h3>
                  <p>{data.publicProfile?.bio || '（未入力）'}</p>
                  <p className="muted-sm">
                    本拠地：<strong>{data.publicProfile?.gridLabel ?? '未設定'}</strong>（
                    <code>{data.publicProfile?.gridCellId ?? 'none'}</code>）
                  </p>
                  <p className="muted-sm">
                    ※年齢・性別は内部データ扱いのため、他ユーザー向け画面には一切表示されません。
                  </p>
                </div>
                <div className="card card-muted">
                  <h3>マッチング用 構造化タグ</h3>
                  <p>
                    <strong>興味のある分野：</strong>
                    {data.publicProfile?.interestTags.length
                      ? data.publicProfile.interestTags.map((t) => (
                          <span key={t} className="badge badge-sim" style={{ marginRight: 4 }}>
                            {t}
                          </span>
                        ))
                      : '未選択'}
                  </p>
                  <p>
                    <strong>自信のある分野：</strong>
                    {data.publicProfile?.strengthTags.length
                      ? data.publicProfile.strengthTags.map((t) => (
                          <span key={t} className="badge badge-public" style={{ marginRight: 4 }}>
                            {t}
                          </span>
                        ))
                      : '未選択'}
                  </p>
                  <p className="muted-sm">
                    サーバー付与ロール：<code>{data.authSummary?.roles.join(', ')}</code>
                  </p>
                </div>
              </div>
            </section>

            {/* Preview of Kyushu community feed & separated corporate plans */}
            <div className="grid-2">
              <section className="card">
                <h2>
                  九州大学周辺 交流フィード（初期シード）{' '}
                  <span className="badge badge-sim">縦横無尽タイムライン</span>
                </h2>
                <div className="feed-list">
                  {data.snapshot.initialPosts.map((post) => {
                    const author = actorMap.get(post.authorActorId);
                    return (
                      <article key={post.id} className="feed-item">
                        <div className="feed-meta">
                          <span className={`badge ${post.channel === 'public-offer' ? 'badge-public' : 'badge-sim'}`}>
                            {post.channel === 'public-offer' ? '公的オファー・縦' : '横の交流'}
                          </span>{' '}
                          <strong>{author?.displayName ?? post.authorActorId}</strong>
                        </div>
                        <h3>{post.title}</h3>
                        <p>{post.body}</p>
                        <div className="feed-tags">
                          {post.tags.map((t) => (
                            <span key={t} className="badge badge-sim">
                              #{t}
                            </span>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="card">
                <h2>
                  疑似企業 支援プラン（操作なし・分離テーブル）{' '}
                  <span className="badge badge-warn">3プラン稼働準備</span>
                </h2>
                <p className="muted-sm">
                  企業アカウントは <code>simulation.actor</code> から完全分離されており、条件を満たした団体・活動へ自動で支援申し出通知を送ります。
                </p>
                <div className="feed-list">
                  {data.snapshot.corporatePlans.map((plan) => {
                    const sponsor = data.snapshot.corporateSponsors.find((s) => s.id === plan.sponsorId);
                    return (
                      <article key={plan.id} className="feed-item">
                        <div className="feed-meta">
                          <span className="badge badge-warn">{plan.supportType}</span>{' '}
                          <strong>{sponsor?.name}</strong>
                        </div>
                        <h3>{plan.title}</h3>
                        <p className="muted-sm">{plan.summary}</p>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
