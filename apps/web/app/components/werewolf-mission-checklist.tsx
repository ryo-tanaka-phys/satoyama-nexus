'use client';

import Link from 'next/link';
import {
  WEREWOLF_MISSIONS,
  type DemoAccountRecord,
  type PublicVenueProfileView,
  type WerewolfAssignedRole
} from '@satoyama/domain';
import type {
  VenueFoundationSnapshot,
  VenueNotificationRecord,
  WerewolfAssignmentRecord,
  WerewolfRoomRecord
} from '../../../../db/venue-store';

interface WerewolfMissionChecklistProps {
  room: WerewolfRoomRecord;
  assignment: WerewolfAssignmentRecord;
  account: DemoAccountRecord;
  publicProfile: PublicVenueProfileView | null;
  notifications: readonly VenueNotificationRecord[];
  snapshot: VenueFoundationSnapshot;
}

function evaluateStepCompletion(
  role: WerewolfAssignedRole,
  stepId: string,
  account: DemoAccountRecord,
  publicProfile: PublicVenueProfileView | null,
  notifications: readonly VenueNotificationRecord[],
  snapshot: VenueFoundationSnapshot
): boolean {
  const actorId = account.actorId;
  switch (role) {
    case 'citizen':
      if (stepId === 'cit-social') {
        return (
          snapshot.initialPosts.some((p) => p.authorActorId === actorId) ||
          snapshot.comments.some((c) => c.authorActorId === actorId)
        );
      }
      if (stepId === 'cit-active-match') {
        return snapshot.activeConnections.some((c) => c.fromActorId === actorId);
      }
      if (stepId === 'cit-mediated') {
        return notifications.some(
          (n) => n.category === 'matching' && n.title.includes('運営仲介')
        );
      }
      return false;

    case 'expert-candidate':
      if (stepId === 'exp-apply') {
        return snapshot.certificationRequests.some(
          (r) => r.targetActorId === actorId && r.kind === 'expert'
        );
      }
      if (stepId === 'exp-certified') {
        return Boolean(publicProfile?.expertCertified);
      }
      if (stepId === 'exp-advice') {
        return snapshot.comments.some(
          (c) => c.authorActorId === actorId && c.isExpertAdvice
        );
      }
      return false;

    case 'organization':
      if (stepId === 'org-cert') {
        return publicProfile?.orgCertificationStatus === 'certified';
      }
      if (stepId === 'org-calendar') {
        return snapshot.orgCalendarEvents.some(
          (e) => e.organizationActorId === actorId && e.status === 'completed'
        );
      }
      if (stepId === 'org-report') {
        return snapshot.activityReports.some((r) => r.organizationActorId === actorId);
      }
      if (stepId === 'org-petition') {
        return snapshot.publicInteractions.some(
          (p) => p.direction === 'to-government' && p.fromActorId === actorId
        );
      }
      return false;

    case 'government':
      if (stepId === 'gov-review') {
        return snapshot.publicInteractions.some(
          (p) => p.direction === 'to-government' && p.status !== 'submitted'
        );
      }
      if (stepId === 'gov-visibility') {
        // Considered verified once the municipality has seen or acted on any public process
        return snapshot.publicInteractions.some(
          (p) => p.direction === 'to-government' && p.status !== 'submitted'
        );
      }
      if (stepId === 'gov-offer') {
        return snapshot.publicInteractions.some(
          (p) => p.direction === 'from-government' && p.fromActorId === actorId
        );
      }
      return false;

    default:
      return false;
  }
}

export function WerewolfMissionChecklist({
  room,
  assignment,
  account,
  publicProfile,
  notifications,
  snapshot
}: WerewolfMissionChecklistProps) {
  const descriptor = WEREWOLF_MISSIONS[assignment.assignedRole];
  const statuses = descriptor.steps.map((step) => ({
    step,
    done: evaluateStepCompletion(
      assignment.assignedRole,
      step.id,
      account,
      publicProfile,
      notifications,
      snapshot
    )
  }));
  const doneCount = statuses.filter((s) => s.done).length;

  return (
    <section className="werewolf-mission-card">
      <div className="dashboard-hero-head">
        <div>
          <span className="badge badge-ok">
            人狼モード検証中 · ルーム {room.code}
          </span>{' '}
          <span className="badge badge-public">配役：{descriptor.label}</span>{' '}
          <span className={`badge ${doneCount === statuses.length ? 'badge-ok' : 'badge-warn'}`}>
            検証ステップ {doneCount} / {statuses.length} 完了
          </span>
          <div style={{ fontWeight: 700, marginTop: 6 }}>
            あなたの目的：{assignment.missionHint || descriptor.mission}
          </div>
        </div>
        <Link href="/werewolf" className="btn-link">
          人狼ロビーへ戻る
        </Link>
      </div>

      <div className="werewolf-checklist">
        {statuses.map(({ step, done }, idx) => (
          <div key={step.id} className={`werewolf-check-item ${done ? 'werewolf-check-done' : ''}`}>
            <div className="werewolf-check-title">
              <span className={`badge ${done ? 'badge-ok' : 'badge-sim'}`}>
                {done ? '✓ 達成' : `Step ${idx + 1}`}
              </span>{' '}
              <strong>{step.action}</strong>
            </div>
            <div className="muted-sm">
              仕組みの検証ポイント：{step.verificationPoint}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
