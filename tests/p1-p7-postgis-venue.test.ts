import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { PgVenueFoundationStore } from '../db/venue-store';

const DB_URL = process.env.DATABASE_URL;

describe.runIf(Boolean(DB_URL))(
  'P1-P7 Simulated Venue <-> PostgreSQL/PostGIS real-DB persistence & restart survival',
  () => {
    it('auto-applies migrations 0001-0005, persists sessions/certifications/org workspace/gov interactions/corporate auto-offers/werewolf rooms across restarts', async () => {
      const baseUrl = new URL(DB_URL!);
      const tempDb = `satoyama_venue_${randomBytes(4).toString('hex')}`;
      const adminUrl = new URL(baseUrl.toString());
      adminUrl.pathname = '/postgres';
      const adminPool = new pg.Pool({ connectionString: adminUrl.toString() });

      await adminPool.query(`CREATE DATABASE "${tempDb}"`);
      const targetUrl = new URL(baseUrl.toString());
      targetUrl.pathname = `/${tempDb}`;
      const pool = new pg.Pool({ connectionString: targetUrl.toString() });
      pool.on('error', (err: Error & { code?: string }) => {
        if (err.code !== '57P01') throw err;
      });

      try {
        const store1 = new PgVenueFoundationStore(pool);

        // 1) Initial seed applies 0001..0005 and seeds Kyushu University community + separated 3 corporate plans
        const snap0 = await store1.getFoundationSnapshot();
        expect(snap0.corporateSponsors).toHaveLength(3);
        expect(snap0.corporatePlans).toHaveLength(3);
        expect(snap0.actors.every((a) => !a.id.startsWith('corp-'))).toBe(true);
        expect(snap0.demoAccounts.length).toBeGreaterThanOrEqual(5);

        // 2) Register a new organization with 4x4 grid + private internal demographics
        const regOrg = await store1.registerAccountAndCreateSession({
          displayName: '【模擬】PostGIS実DBテスト団体',
          roleTrack: 'organization',
          gridCellId: 'grid-r1-c2',
          interestTags: ['竹林整備', '歩道整備'],
          strengthTags: ['竹林整備'],
          bio: '能動マッチング用自己紹介（AI非入力）',
          ageInternal: 25,
          genderInternal: '非公開テスト'
        });
        const orgActorId = regOrg.account.actorId;

        // 3) Certify organization & expert via operator -> triggers corporate materials offer automatically
        const orgCertReq = await store1.submitCertificationRequest({
          kind: 'organization',
          applicantAccountId: regOrg.account.id,
          targetActorId: orgActorId,
          summary: 'PostGIS団体認証テスト'
        });
        const orgCertRev = await store1.reviewCertificationRequest({
          requestId: orgCertReq.id,
          reviewerAccountId: 'demo-acct-operator',
          reviewerOperatedActorIds: ['sim-kyushu-op-demo'],
          decision: 'approved',
          reason: '実DB団体認証承認'
        });
        expect(orgCertRev.ok).toBe(true);

        const expCertReq = await store1.submitCertificationRequest({
          kind: 'expert',
          applicantAccountId: 'demo-acct-expert',
          targetActorId: 'sim-kyushu-exp-demo',
          summary: 'PostGIS専門家認証テスト'
        });
        const expCertRev = await store1.reviewCertificationRequest({
          requestId: expCertReq.id,
          reviewerAccountId: 'demo-acct-operator',
          reviewerOperatedActorIds: ['sim-kyushu-op-demo'],
          decision: 'approved',
          reason: '実DB専門家認証承認'
        });
        expect(expCertRev.ok).toBe(true);

        // 4) Org calendar -> complete -> dummy member -> private chat -> social post + certified expert advice -> report
        const cal = await store1.createOrgCalendarEvent({
          organizationActorId: orgActorId,
          title: '伊都竹林整備（実DBテスト）',
          scheduledDate: '2026-12-06',
          gridCellId: 'grid-r1-c2',
          participantCount: 10
        });
        await store1.updateOrgCalendarEventStatus(cal.id, orgActorId, 'completed');
        await store1.addDummyOrgMember({ organizationActorId: orgActorId, displayName: '元岡 テスト団員', roleNote: '安全班' });
        await store1.postOrgChatMessage({
          organizationActorId: orgActorId,
          senderAccountId: regOrg.account.id,
          senderDisplayName: regOrg.account.displayName,
          body: '団体内秘密チャット（実DB保存）'
        });
        const post = await store1.createSocialPost({
          authorActorId: orgActorId,
          channel: 'horizontal',
          title: '竹林整備の実DBテスト投稿',
          body: '専門家の助言を募集します',
          tags: ['竹林整備', '安全管理']
        });
        const advice = await store1.addSocialComment({
          postId: post.id,
          authorActorId: 'sim-kyushu-exp-demo',
          body: 'ヘルメット着用と安全距離を確保してください'
        });
        expect(advice.isExpertAdvice).toBe(true);

        const { report } = await store1.generateActivityReport({
          organizationActorId: orgActorId,
          createdByAccountId: regOrg.account.id,
          title: '実DB簡易透明化レポート',
          periodLabel: '2026年12月'
        });
        expect(report.calendarEventCount).toBe(1);
        expect(report.socialLogCount).toBe(1);
        expect(report.expertAdviceCount).toBe(1);

        // 5) Vertical public interaction -> Municipality supports it
        const { interaction } = await store1.createPublicInteraction({
          direction: 'to-government',
          kind: 'support-request',
          fromActorId: orgActorId,
          toActorId: 'sim-kyushu-gov-demo',
          actorAccountId: regOrg.account.id,
          reportId: report.id,
          title: '公有林資材保管の相談',
          body: '実DBレポートを添付しました'
        });
        const govDecision = await store1.respondPublicInteraction({
          interactionId: interaction.id,
          actorAccountId: 'demo-acct-gov',
          actorId: 'sim-kyushu-gov-demo',
          roleTrack: 'government',
          nextStatus: 'supported',
          reason: '実績を確認したため支援決定します'
        });
        expect(govDecision.ok).toBe(true);

        // 6) Werewolf room create -> join 4 -> assign -> close
        const room = await store1.createWerewolfRoom('demo-acct-operator');
        for (const name of ['P1', 'P2', 'P3', 'P4']) {
          await store1.joinWerewolfRoom({ roomCode: room.code, displayName: name });
        }
        const assigned = await store1.assignWerewolfRoomRoles({
          roomId: room.id,
          operatorAccountId: 'demo-acct-operator'
        });
        expect(assigned.assignments.map((a) => a.assignedRole).sort()).toEqual([
          'citizen',
          'expert-candidate',
          'government',
          'organization'
        ]);
        await store1.closeWerewolfRoom(room.id, 'demo-acct-operator');

        // 7) Simulate full server restart with a brand-new PgVenueFoundationStore against the same DB
        const storeAfterRestart = new PgVenueFoundationStore(pool);
        const resolvedOrg = await storeAfterRestart.resolveSessionByToken(regOrg.rawToken);
        expect(resolvedOrg.authenticated).toBe(true);
        expect(resolvedOrg.profile?.orgCertificationStatus).toBe('certified');

        const reloaded = await storeAfterRestart.getFoundationSnapshot();
        const reloadedOffers = reloaded.corporateOffers.filter((o) => o.targetActorId === orgActorId);
        expect(reloadedOffers.map((o) => o.planId).sort()).toEqual([
          'corp-plan-funding',
          'corp-plan-materials',
          'corp-plan-safety'
        ]);
        expect(reloaded.publicInteractions.find((i) => i.id === interaction.id)?.status).toBe('supported');
        expect(reloaded.publicInteractionEvents.filter((e) => e.interactionId === interaction.id)).toHaveLength(2);
        const reloadedChat = await storeAfterRestart.listOrgChatMessages(orgActorId);
        expect(reloadedChat).toHaveLength(1);
        const reloadedRooms = await storeAfterRestart.listWerewolfRooms();
        expect(reloadedRooms.find((r) => r.room.id === room.id)?.room.status).toBe('closed');
      } finally {
        await pool.end();
        await adminPool.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [tempDb]
        );
        await adminPool.query(`DROP DATABASE IF EXISTS "${tempDb}"`);
        await adminPool.end();
      }
    }, 45_000);
  }
);
