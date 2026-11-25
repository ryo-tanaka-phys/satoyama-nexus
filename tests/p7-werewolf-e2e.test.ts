import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildGuaranteedWerewolfRoles,
  drawShuffledWerewolfRoles,
  generateWerewolfRoomCode,
  WEREWOLF_MISSIONS
} from '@satoyama/domain';
import { InMemoryVenueFoundationStore } from '../db/venue-store';
import { setActiveVenueFoundationStoreForTest } from '../apps/web/lib/venue-runtime';
import { POST as loginPost } from '../apps/web/app/api/venue/login/route';

beforeEach(() => {
  setActiveVenueFoundationStoreForTest(new InMemoryVenueFoundationStore());
});
afterAll(() => {
  setActiveVenueFoundationStoreForTest(null);
});
import { GET as venueSessionGet } from '../apps/web/app/api/venue/session/route';
import { GET as werewolfStateGet } from '../apps/web/app/api/werewolf/state/route';
import { POST as werewolfRoomsPost } from '../apps/web/app/api/werewolf/rooms/route';
import { POST as werewolfJoinPost } from '../apps/web/app/api/werewolf/join/route';

async function loginAs(accountId: string): Promise<string> {
  const res = await loginPost(
    new Request('http://localhost:3000/api/venue/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId })
    })
  );
  expect(res.status).toBe(200);
  return res.headers.get('set-cookie')!.split(';')[0];
}

describe('P7 Separated Werewolf Demo Mode (Lobby, Minimum-Guarantee Shuffle, Kick, Late-Join & Session Sync)', () => {
  it('guarantees essential core roles across varying classroom group sizes and generates unambiguous 4-char room codes', () => {
    expect(buildGuaranteedWerewolfRoles(2)).toEqual(['government', 'organization']);
    expect(buildGuaranteedWerewolfRoles(3)).toEqual(['government', 'organization', 'citizen']);
    expect(buildGuaranteedWerewolfRoles(4).sort()).toEqual([
      'citizen',
      'expert-candidate',
      'government',
      'organization'
    ]);

    const fiveRoles = drawShuffledWerewolfRoles(5, () => 0.42);
    expect(fiveRoles).toHaveLength(5);
    expect(new Set(fiveRoles)).toEqual(new Set(['government', 'organization', 'expert-candidate', 'citizen']));

    const code = generateWerewolfRoomCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);

    // Every role provides actionable verification steps so players understand what mechanism they test
    for (const role of ['citizen', 'expert-candidate', 'organization', 'government'] as const) {
      expect(WEREWOLF_MISSIONS[role].steps.length).toBeGreaterThanOrEqual(3);
      for (const step of WEREWOLF_MISSIONS[role].steps) {
        expect(step.action.length).toBeGreaterThan(5);
        expect(step.verificationPoint.length).toBeGreaterThan(5);
      }
    }
  });

  it('runs a full classroom werewolf session: operator create -> join -> kick -> guaranteed shuffle -> session role switch -> late join -> close', async () => {
    const citizenCookie = await loginAs('demo-acct-citizen');
    const operatorCookie = await loginAs('demo-acct-operator');

    // Non-operator cannot create a room (403)
    const forbiddenCreate = await werewolfRoomsPost(
      new Request('http://localhost:3000/api/werewolf/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: citizenCookie },
        body: JSON.stringify({ action: 'create' })
      })
    );
    expect(forbiddenCreate.status).toBe(403);

    // Operator creates a room
    const createRes = await werewolfRoomsPost(
      new Request('http://localhost:3000/api/werewolf/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({ action: 'create' })
      })
    );
    expect(createRes.status).toBe(200);
    const { room } = (await createRes.json()) as { room: { id: string; code: string; status: string } };
    expect(room.status).toBe('lobby');
    expect(room.code).toHaveLength(4);

    // 4 real participants + 1 accidental participant join with roomCode + nickname
    const names = ['学生A', '学生B', '学生C', '講師D', '誤入室E'];
    const joined: { name: string; cookie: string; accountId: string }[] = [];
    for (const name of names) {
      const joinRes = await werewolfJoinPost(
        new Request('http://localhost:3000/api/werewolf/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode: room.code, displayName: name })
        })
      );
      expect(joinRes.status).toBe(200);
      const joinCookie = joinRes.headers.get('set-cookie')!.split(';')[0];
      const joinBody = (await joinRes.json()) as { account: { id: string }; lateJoined: boolean };
      expect(joinBody.lateJoined).toBe(false);
      joined.push({ name, cookie: joinCookie, accountId: joinBody.account.id });
    }

    // Operator kicks accidental 5th participant -> their session is revoked
    const kickRes = await werewolfRoomsPost(
      new Request('http://localhost:3000/api/werewolf/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({ action: 'kick', roomId: room.id, targetAccountId: joined[4].accountId })
      })
    );
    expect(kickRes.status).toBe(200);
    const kickedSession = await venueSessionGet(
      new Request('http://localhost:3000/api/venue/session', { headers: { cookie: joined[4].cookie } })
    );
    expect(((await kickedSession.json()) as { authenticated: boolean }).authenticated).toBe(false);

    // Operator triggers minimum-guarantee shuffle for the remaining 4 participants
    const assignRes = await werewolfRoomsPost(
      new Request('http://localhost:3000/api/werewolf/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({ action: 'assign', roomId: room.id })
      })
    );
    expect(assignRes.status).toBe(200);
    const assignBody = (await assignRes.json()) as {
      assignments: { accountId: string; assignedRole: string; missionHint: string }[];
    };
    expect(assignBody.assignments).toHaveLength(4);
    expect(assignBody.assignments.map((a) => a.assignedRole).sort()).toEqual([
      'citizen',
      'expert-candidate',
      'government',
      'organization'
    ]);

    // Each of the 4 devices polls /api/werewolf/state and /api/venue/session and sees their assigned role & mission
    const seenRoleTracks: string[] = [];
    for (const player of joined.slice(0, 4)) {
      const wwState = await werewolfStateGet(
        new Request('http://localhost:3000/api/werewolf/state', { headers: { cookie: player.cookie } })
      );
      const wwBody = (await wwState.json()) as {
        myRoom: { status: string };
        myAssignment: { assignedRole: string; missionHint: string };
      };
      expect(wwBody.myRoom.status).toBe('assigned');
      expect(wwBody.myAssignment.missionHint.length).toBeGreaterThan(10);

      const sessionRes = await venueSessionGet(
        new Request('http://localhost:3000/api/venue/session', { headers: { cookie: player.cookie } })
      );
      const sessionBody = (await sessionRes.json()) as {
        authenticated: boolean;
        mode: string;
        account: { roleTrack: string; actorId: string };
        publicProfile: { orgCertificationStatus: string };
        werewolfAssignment: { assignment: { assignedRole: string } };
        snapshot: { memberships: { organizationActorId: string; isDummy: boolean }[] };
      };
      expect(sessionBody.authenticated).toBe(true);
      expect(sessionBody.mode).toBe('werewolf');
      expect(sessionBody.werewolfAssignment.assignment.assignedRole).toBe(wwBody.myAssignment.assignedRole);
      seenRoleTracks.push(sessionBody.account.roleTrack);

      // Assigned organization starts uncertified with 2 auto-attached dummy members
      if (wwBody.myAssignment.assignedRole === 'organization') {
        expect(sessionBody.publicProfile.orgCertificationStatus).toBe('none');
        const dummyMembers = sessionBody.snapshot.memberships.filter(
          (m) => m.organizationActorId === sessionBody.account.actorId && m.isDummy
        );
        expect(dummyMembers).toHaveLength(2);
      }
    }
    expect(seenRoleTracks.sort()).toEqual(['citizen', 'citizen', 'government', 'organization']);

    // Late joiner after assignment gets automatically assigned 'citizen' without error
    const lateRes = await werewolfJoinPost(
      new Request('http://localhost:3000/api/werewolf/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: room.code, displayName: '遅刻参加F' })
      })
    );
    expect(lateRes.status).toBe(200);
    const lateBody = (await lateRes.json()) as { lateJoined: boolean; assignment: { assignedRole: string; missionHint: string } };
    expect(lateBody.lateJoined).toBe(true);
    expect(lateBody.assignment.assignedRole).toBe('citizen');
    expect(lateBody.assignment.missionHint.length).toBeGreaterThan(10);

    // Operator sees live 7-mechanism classroom verification coverage; participants do not
    const opStateRes = await werewolfStateGet(
      new Request('http://localhost:3000/api/werewolf/state', { headers: { cookie: operatorCookie } })
    );
    const opStateBody = (await opStateRes.json()) as {
      isOperator: boolean;
      verificationCoverage: { totalCount: number; items: { id: string }[] } | null;
    };
    expect(opStateBody.isOperator).toBe(true);
    expect(opStateBody.verificationCoverage?.totalCount).toBe(7);
    expect(opStateBody.verificationCoverage?.items).toHaveLength(7);

    // Operator closes the room cleanly
    const closeRes = await werewolfRoomsPost(
      new Request('http://localhost:3000/api/werewolf/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: operatorCookie },
        body: JSON.stringify({ action: 'close', roomId: room.id })
      })
    );
    expect(closeRes.status).toBe(200);
    expect(((await closeRes.json()) as { room: { status: string } }).room.status).toBe('closed');
  });
});
