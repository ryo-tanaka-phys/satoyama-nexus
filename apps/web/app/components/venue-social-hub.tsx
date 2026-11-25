'use client';

import { useEffect, useState } from 'react';
import {
  VENUE_TAGS,
  type DemoAccountRecord,
  type PublicVenueProfileView,
  type VenueTag
} from '@satoyama/domain';
import type {
  VenueFoundationSnapshot,
  VenueNotificationCategory,
  VenueNotificationRecord
} from '../../../../db/venue-store';

interface VenueSocialHubProps {
  account: DemoAccountRecord;
  publicProfile: PublicVenueProfileView | null;
  notifications: readonly VenueNotificationRecord[];
  snapshot: VenueFoundationSnapshot;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onFeedback: (fb: { kind: 'ok' | 'error'; text: string }) => void;
}

const NOTIF_CATEGORY_LABEL: Record<VenueNotificationCategory, { label: string; cls: string }> = {
  matching: { label: 'マッチング', cls: 'badge-ok' },
  'corporate-offer': { label: '企業支援申し出', cls: 'badge-warn' },
  'government-action': { label: '自治体連絡', cls: 'badge-public' },
  certification: { label: '運営認証', cls: 'badge-ok' },
  social: { label: '交流コメント', cls: 'badge-sim' }
};

export function VenueSocialHub({
  account,
  publicProfile,
  notifications,
  snapshot,
  busy,
  onRefresh,
  onFeedback
}: VenueSocialHubProps) {
  const [submitting, setSubmitting] = useState(false);

  // Profile self-intro card & seeking-match toggle
  const [bioDraft, setBioDraft] = useState(publicProfile?.bio ?? '');
  const [seekingDraft, setSeekingDraft] = useState(Boolean(publicProfile?.seekingMatch));

  useEffect(() => {
    setBioDraft(publicProfile?.bio ?? '');
    setSeekingDraft(Boolean(publicProfile?.seekingMatch));
  }, [publicProfile?.actorId, publicProfile?.bio, publicProfile?.seekingMatch]);

  // New social post composer
  const [postChannel, setPostChannel] = useState<'horizontal' | 'public-offer'>('horizontal');
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postTags, setPostTags] = useState<VenueTag[]>(['竹林整備']);
  const [channelFilter, setChannelFilter] = useState<'all' | 'horizontal' | 'public-offer'>('all');

  // Inline comments & active connection notes
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [connectNotes, setConnectNotes] = useState<Record<string, string>>({});

  const isPublicPublisher = account.roleTrack === 'government' || account.roleTrack === 'operator';
  const actorMap = new Map(snapshot.actors.map((a) => [a.id, a]));
  const profileMap = new Map(snapshot.publicProfiles.map((p) => [p.actorId, p]));
  const dummyActorIds = new Set(snapshot.memberships.filter((m) => m.isDummy).map((m) => m.personActorId));

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const myConnections = snapshot.activeConnections.filter(
    (c) => c.fromActorId === account.actorId || c.toActorId === account.actorId
  );

  const visiblePosts = snapshot.initialPosts.filter((p) => {
    if (channelFilter === 'all') return true;
    return p.channel === channelFilter;
  });

  const directoryActors = snapshot.actors.filter(
    (a) => a.id !== account.actorId && !dummyActorIds.has(a.id)
  );

  function togglePostTag(tag: VenueTag) {
    setPostTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function runAction(fn: () => Promise<void>) {
    setSubmitting(true);
    try {
      await fn();
      await onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      const res = await fetch('/api/venue/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: bioDraft, seekingMatch: seekingDraft })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? 'プロフィール更新に失敗しました。' });
      } else {
        onFeedback({
          kind: 'ok',
          text: '自己紹介カード（AI非入力・能動マッチング用）と紹介希望設定を更新しました。'
        });
      }
    });
  }

  async function handleCreatePost(e: React.FormEvent) {
    e.preventDefault();
    await runAction(async () => {
      const res = await fetch('/api/venue/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: isPublicPublisher ? postChannel : 'horizontal',
          title: postTitle,
          body: postBody,
          tags: postTags,
          gridCellId: publicProfile?.gridCellId ?? 'grid-r1-c2'
        })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? '投稿に失敗しました。' });
      } else {
        setPostTitle('');
        setPostBody('');
        onFeedback({ kind: 'ok', text: 'タイムラインへ投稿しました（他端末へ自動同期されます）。' });
      }
    });
  }

  async function handleEndorse(postId: string) {
    await runAction(async () => {
      const res = await fetch(`/api/venue/posts/${encodeURIComponent(postId)}/endorse`, { method: 'POST' });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? '賛同に失敗しました。' });
      }
    });
  }

  async function handleAddComment(postId: string) {
    const text = (commentDrafts[postId] ?? '').trim();
    if (!text) return;
    await runAction(async () => {
      const res = await fetch(`/api/venue/posts/${encodeURIComponent(postId)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? 'コメントに失敗しました。' });
      } else {
        setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
        onFeedback({ kind: 'ok', text: 'コメントを送信しました（投稿者へ通知が届きます）。' });
      }
    });
  }

  async function handleConnect(toActorId: string, toName: string, postId?: string) {
    const note = connectNotes[toActorId] ?? '';
    await runAction(async () => {
      const res = await fetch('/api/venue/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toActorId, postId: postId ?? null, note })
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        onFeedback({ kind: 'error', text: json.message ?? '能動マッチング接続に失敗しました。' });
      } else {
        setConnectNotes((prev) => ({ ...prev, [toActorId]: '' }));
        onFeedback({
          kind: 'ok',
          text: `${toName} さんへ能動マッチング通知を送りました（※正式な活動申請・団体認証までは運営サポート対象外）。`
        });
      }
    });
  }

  async function handleMarkRead(notificationId: string) {
    await runAction(async () => {
      await fetch('/api/venue/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId })
      });
    });
  }

  const disabled = busy || submitting;

  return (
    <div className="social-hub">
      {/* Row 1: Notification Center + Self-Intro Editor */}
      <div className="grid-2">
        <section className="card">
          <h2>
            通知確認欄{' '}
            <span className={`badge ${unreadCount > 0 ? 'badge-warn' : 'badge-sim'}`}>
              未読 {unreadCount} 件
            </span>
          </h2>
          {notifications.length === 0 ? (
            <p className="muted-sm">
              まだ通知はありません。他端末からの能動マッチング、コメント、自治体オファー、企業支援申し出がここに届きます。
            </p>
          ) : (
            <div className="notif-list">
              {notifications.map((n) => {
                const meta = NOTIF_CATEGORY_LABEL[n.category];
                return (
                  <div key={n.id} className={`notif-item ${n.isRead ? 'notif-read' : 'notif-unread'}`}>
                    <div className="notif-head">
                      <span className={`badge ${meta.cls}`}>{meta.label}</span>
                      {!n.isRead && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleMarkRead(n.id)}
                          disabled={disabled}
                        >
                          既読にする
                        </button>
                      )}
                    </div>
                    <div className="notif-title">{n.title}</div>
                    <div className="muted-sm">{n.body}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card">
          <h2>
            自己紹介カード編集 <span className="badge badge-sim">AI非入力・能動マッチング用</span>
          </h2>
          <form onSubmit={handleSaveProfile} className="venue-form">
            <label className="field-group">
              <span>自己紹介テキスト（能動マッチングで相手に表示されます）</span>
              <textarea
                rows={3}
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                placeholder="やりたい活動・相談したいこと・得意なサポートなど"
              />
            </label>

            {account.roleTrack === 'citizen' && (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={seekingDraft}
                  onChange={(e) => setSeekingDraft(e.target.checked)}
                />
                <span>
                  宛てがないため運営からの仲介・おすすめ通知を希望する（厳格審査ルート対象）
                </span>
              </label>
            )}

            <button type="submit" disabled={disabled}>
              自己紹介・希望設定を保存
            </button>
          </form>
        </section>
      </div>

      {/* Row 2: Main SNS Timeline + Active Matching Directory */}
      <div className="social-main-grid">
        {/* Left: Omnidirectional SNS Timeline */}
        <section className="card">
          <div className="feed-header-bar">
            <h2>
              縦横無尽 交流タイムライン <span className="badge badge-sim">横の交流 × 縦の公的つながり</span>
            </h2>
            <div className="filter-pills">
              <button
                type="button"
                className={`btn-sm ${channelFilter === 'all' ? 'btn-active' : 'btn-secondary'}`}
                onClick={() => setChannelFilter('all')}
              >
                すべて
              </button>
              <button
                type="button"
                className={`btn-sm ${channelFilter === 'horizontal' ? 'btn-active' : 'btn-secondary'}`}
                onClick={() => setChannelFilter('horizontal')}
              >
                横の交流
              </button>
              <button
                type="button"
                className={`btn-sm ${channelFilter === 'public-offer' ? 'btn-active' : 'btn-secondary'}`}
                onClick={() => setChannelFilter('public-offer')}
              >
                公的オファー・縦
              </button>
            </div>
          </div>

          {/* Composer */}
          <form onSubmit={handleCreatePost} className="composer-box">
            <div className="composer-head">
              <strong>新規投稿を作成</strong>
              {isPublicPublisher && (
                <select
                  value={postChannel}
                  onChange={(e) => setPostChannel(e.target.value as 'horizontal' | 'public-offer')}
                  aria-label="投稿チャンネル"
                >
                  <option value="public-offer">公的オファー・支援案内（縦）</option>
                  <option value="horizontal">一般交流（横）</option>
                </select>
              )}
            </div>
            <input
              type="text"
              required
              value={postTitle}
              onChange={(e) => setPostTitle(e.target.value)}
              placeholder="タイトル（例：今週末の竹林整備を手伝ってくれる方募集！）"
            />
            <textarea
              rows={2}
              required
              value={postBody}
              onChange={(e) => setPostBody(e.target.value)}
              placeholder="現場の様子、困りごと、募集したいこと、公的案内などを書いて投稿"
            />
            <div className="tag-selector">
              {VENUE_TAGS.map((tag) => {
                const active = postTags.includes(tag);
                return (
                  <button
                    key={`post-tag-${tag}`}
                    type="button"
                    className={`tag-pill ${active ? 'tag-pill-active' : ''}`}
                    onClick={() => togglePostTag(tag)}
                  >
                    {active ? '✓ ' : '+ '}
                    {tag}
                  </button>
                );
              })}
            </div>
            <div>
              <button type="submit" disabled={disabled}>
                タイムラインに投稿する
              </button>
            </div>
          </form>

          {/* Feed Items */}
          <div className="feed-list">
            {visiblePosts.map((post) => {
              const author = actorMap.get(post.authorActorId);
              const authorProf = profileMap.get(post.authorActorId);
              const postComments = snapshot.comments.filter((c) => c.postId === post.id);
              return (
                <article key={post.id} className="feed-item">
                  <div className="feed-meta">
                    <span className={`badge ${post.channel === 'public-offer' ? 'badge-public' : 'badge-sim'}`}>
                      {post.channel === 'public-offer' ? '公的オファー・縦' : '横の交流'}
                    </span>{' '}
                    <strong>{author?.displayName ?? post.authorActorId}</strong>
                    {authorProf?.expertCertified && (
                      <>
                        {' '}
                        <span className="badge badge-ok">認証済み専門家</span>
                      </>
                    )}
                    {authorProf?.orgCertificationStatus === 'certified' && (
                      <>
                        {' '}
                        <span className="badge badge-ok">認証済み団体</span>
                      </>
                    )}
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
                  <div className="feed-actions">
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => handleEndorse(post.id)}
                      disabled={disabled}
                    >
                      賛同 ({post.endorsementCount})
                    </button>
                    {post.authorActorId !== account.actorId && (
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => handleConnect(post.authorActorId, author?.displayName ?? post.authorActorId, post.id)}
                        disabled={disabled}
                      >
                        能動マッチングでつながる
                      </button>
                    )}
                  </div>

                  {/* Comments */}
                  <div className="comment-section">
                    {postComments.map((c) => {
                      const cAuthor = actorMap.get(c.authorActorId);
                      return (
                        <div
                          key={c.id}
                          className={`comment-item ${c.isExpertAdvice ? 'comment-expert' : ''}`}
                        >
                          <div className="muted-sm">
                            <strong>{cAuthor?.displayName ?? c.authorActorId}</strong>
                            {c.isExpertAdvice && (
                              <>
                                {' '}
                                <span className="badge badge-ok">認証済み専門家の助言</span>
                              </>
                            )}
                          </div>
                          <div>{c.body}</div>
                        </div>
                      );
                    })}
                    <div className="comment-input-row">
                      <input
                        type="text"
                        value={commentDrafts[post.id] ?? ''}
                        onChange={(e) =>
                          setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                        }
                        placeholder="コメント・質問・助言を入力..."
                      />
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => handleAddComment(post.id)}
                        disabled={disabled || !(commentDrafts[post.id] ?? '').trim()}
                      >
                        送信
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Right: Active Matching Directory + Own Connections + Corporate Plans */}
        <div className="social-side-col">
          <section className="card">
            <h2>
              能動マッチング（自己紹介から探す）{' '}
              <span className="badge badge-warn">未申請サポート外</span>
            </h2>
            <p className="muted-sm">
              自己紹介カードを見て直接つながれます。正式な団体認証・活動申請を行うまではプラットフォームの公的サポート対象外（自己責任の交流）です。
            </p>
            <div className="directory-list">
              {directoryActors.map((actor) => {
                const prof = profileMap.get(actor.id);
                return (
                  <div key={actor.id} className="directory-card">
                    <div className="directory-head">
                      <strong>{actor.displayName}</strong>
                      {prof?.expertCertified && <span className="badge badge-ok">認証済み専門家</span>}
                      {prof?.orgCertificationStatus === 'certified' && (
                        <span className="badge badge-ok">認証済み団体</span>
                      )}
                      {prof?.seekingMatch && <span className="badge badge-warn">紹介希望</span>}
                    </div>
                    <div className="muted-sm">本拠地：{prof?.gridLabel ?? '未設定'}</div>
                    <p className="directory-bio">{prof?.bio || '（自己紹介未入力）'}</p>
                    <div className="feed-tags">
                      {prof?.interestTags.map((t) => (
                        <span key={`i-${t}`} className="badge badge-sim">
                          {t}
                        </span>
                      ))}
                      {prof?.strengthTags.map((t) => (
                        <span key={`s-${t}`} className="badge badge-public">
                          ★{t}
                        </span>
                      ))}
                    </div>
                    <div className="comment-input-row" style={{ marginTop: 8 }}>
                      <input
                        type="text"
                        value={connectNotes[actor.id] ?? ''}
                        onChange={(e) =>
                          setConnectNotes((prev) => ({ ...prev, [actor.id]: e.target.value }))
                        }
                        placeholder="ひとこと（任意）"
                      />
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={() => handleConnect(actor.id, actor.displayName)}
                        disabled={disabled}
                      >
                        つながる
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <h3>自分の能動マッチング履歴 ({myConnections.length})</h3>
            {myConnections.length === 0 ? (
              <p className="muted-sm">まだ能動マッチングの接続はありません。</p>
            ) : (
              <div className="notif-list">
                {myConnections.map((c) => {
                  const otherId = c.fromActorId === account.actorId ? c.toActorId : c.fromActorId;
                  const other = actorMap.get(otherId);
                  return (
                    <div key={c.id} className="notif-item notif-read">
                      <div className="notif-head">
                        <strong>{other?.displayName ?? otherId}</strong>
                        <span className="badge badge-warn">未申請・運営サポート対象外</span>
                      </div>
                      <div className="muted-sm">{c.note}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <h3>疑似企業 支援プラン（分離・自動通知対象）</h3>
            <div className="feed-list">
              {snapshot.corporatePlans.map((plan) => {
                const sponsor = snapshot.corporateSponsors.find((s) => s.id === plan.sponsorId);
                return (
                  <article key={plan.id} className="feed-item">
                    <div className="feed-meta">
                      <span className="badge badge-warn">{plan.supportType}</span>{' '}
                      <strong>{sponsor?.name}</strong>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{plan.title}</div>
                    <p className="muted-sm" style={{ marginBottom: 0 }}>{plan.summary}</p>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
