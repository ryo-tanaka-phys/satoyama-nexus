import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import type { Actor, LocationConditionsGraph, SourceDocument } from '../packages/domain/src';
import {
  computeDistanceMeters4326,
  geographicFit,
  recommendSimulationCandidates,
  type ActorMatchingProfile
} from '../packages/matching/src';
import { applyMigrations, loadMigrationFiles } from '../db/migrator';
import { PgM1Repository } from '../db/repository';

const MIGRATIONS_DIR = resolve(process.cwd(), 'db/migrations');
const DB_URL = process.env.DATABASE_URL;

const src: SourceDocument = {
  id: 'src-m2',
  url: 'https://example.invalid/m2',
  publisher: '架空テスト発行者',
  title: 'M2テスト出典',
  accessedOn: '2026-11-25',
  publishedOn: null,
  updatedOn: null,
  summary: 'M2推薦テスト専用出典',
  urlStatus: 'unchecked',
  usage: { status: 'unchecked', evidence: null }
};

const pubOrg: Actor = {
  id: 'pub-org-1',
  domain: 'public-catalog',
  kind: 'organization',
  displayName: '公開団体（推薦対象外）',
  expertise: [{ label: '竹林整備', evidence: '公開資料' }]
};
const simNearSkilled: Actor = {
  id: 'sim-near-skilled',
  domain: 'simulation',
  kind: 'person',
  displayName: '模擬参加者（近距離・技能一致・意欲あり）',
  expertise: [{ label: '竹林整備', evidence: null }]
};
const simFarUnskilled: Actor = {
  id: 'sim-far-unskilled',
  domain: 'simulation',
  kind: 'person',
  displayName: '模擬参加者（遠距離・技能未一致・意欲不明）',
  expertise: []
};
const simNoCoord: Actor = {
  id: 'sim-no-coord',
  domain: 'simulation',
  kind: 'organization',
  displayName: '模擬団体（位置未登録・技能一致）',
  expertise: [{ label: '竹林整備', evidence: null }]
};

const makeGraph = (): LocationConditionsGraph => ({
  actors: [pubOrg, simNearSkilled, simFarUnskilled, simNoCoord],
  actorRevisions: [
    { actor: pubOrg, revision: 1 },
    { actor: simNearSkilled, revision: 1 },
    { actor: simFarUnskilled, revision: 1 },
    { actor: simNoCoord, revision: 1 }
  ],
  actorAssertions: (['displayName', 'kind', 'expertise'] as const).map((field) => ({
    id: `aa-${field}`,
    target: { actorId: pubOrg.id, revision: 1, field },
    sourceId: src.id,
    value: field === 'expertise' ? JSON.stringify(pubOrg.expertise) : pubOrg[field],
    status: 'unverified',
    checkedBy: null,
    checkedAt: null
  })),
  memberships: [],
  activities: [{ id: 'act-1', domain: 'public-catalog', revision: 1, title: 'テスト里山保全活動' }],
  activityRevisions: [{ id: 'act-1', domain: 'public-catalog', revision: 1, title: 'テスト里山保全活動' }],
  activityParties: [{ activityId: 'act-1', actorId: pubOrg.id, role: 'organizer' }],
  cases: [
    {
      mode: 'simulation',
      id: 'case-1',
      activity: { id: 'act-1', domain: 'public-catalog', revision: 1 },
      revision: 1,
      stage: 'draft',
      parties: [{ actorId: simNearSkilled.id, role: 'candidate' }]
    }
  ],
  interests: [{ mode: 'simulation', caseId: 'case-1', actorId: simNearSkilled.id, kind: 'interest' }],
  needs: [],
  sources: [src],
  assertions: [
    {
      id: 'asrt-1',
      target: { activityId: 'act-1', revision: 1, field: 'title' },
      sourceId: src.id,
      value: 'テスト里山保全活動',
      status: 'unverified',
      checkedBy: null,
      checkedAt: null
    }
  ],
  locations: [
    {
      id: 'loc-kyoto',
      activityId: 'act-1',
      activityRevision: 1,
      label: '京都テスト拠点',
      coordinates: { srid: 4326, latitude: 35.0116, longitude: 135.7681 },
      precision: 'approximate',
      publicGranularity: 'municipality',
      acquisitionBasis: '公開資料記載',
      confirmedOn: '2026-11-25',
      sourceId: src.id
    },
    {
      id: 'loc-unknown',
      activityId: 'act-1',
      activityRevision: 1,
      label: '支線作業地（位置未特定）',
      coordinates: null,
      precision: 'unknown',
      publicGranularity: 'withheld',
      acquisitionBasis: '記載なし',
      confirmedOn: null,
      sourceId: src.id
    }
  ],
  participationConditions: [
    {
      id: 'cond-1',
      target: { activityId: 'act-1', activityRevision: 1 },
      schedule: { timeZone: 'Asia/Tokyo', dates: { state: 'unknown' }, timeWindowNote: { state: 'not-stated' } },
      skills: {
        state: 'specified',
        value: [
          { label: '竹林整備', required: true },
          { label: '植生観察', required: false }
        ]
      },
      qualifications: { state: 'specified', value: [{ name: '刈払機取扱', verificationRequired: true }] },
      capacity: { state: 'specified', value: { min: 2, max: 10 } },
      fee: { state: 'no-restriction' },
      itemsToBring: { state: 'specified', value: ['軍手'] },
      transport: { state: 'specified', value: { modes: ['bus', 'car'], accessNote: '徒歩15分' } },
      ageOrOtherConstraints: { state: 'unknown' },
      itemsToConfirm: ['雨天時対応', '資格証の提示要否'],
      sourceId: src.id
    }
  ],
  resourceRequirements: [],
  actorSkills: [
    {
      id: 'sk-1',
      actorId: simNearSkilled.id,
      label: '植生観察',
      declarationType: 'self-declared',
      qualificationStatus: 'unverified',
      evidence: null
    }
  ]
});

describe('M2 Matching: geographic suitability, skill/interest alignment, and strict non-determination', () => {
  it('excludes public-catalog actors, ranks simulation candidates transparently, and never asserts eligibility or verified qualifications', () => {
    const g = makeGraph();
    const profiles: ActorMatchingProfile[] = [
      {
        actorId: simNearSkilled.id,
        baseCoordinates: { srid: 4326, latitude: 35.0116, longitude: 135.7681 }, // 0m from loc-kyoto
        availableTransportModes: ['bus'],
        willingness: 'explicit-interest'
      },
      {
        actorId: simFarUnskilled.id,
        baseCoordinates: { srid: 4326, latitude: 35.6812, longitude: 139.7671 }, // Tokyo (~370km)
        availableTransportModes: ['train'],
        willingness: 'unknown'
      },
      {
        actorId: simNoCoord.id,
        baseCoordinates: null,
        availableTransportModes: [],
        willingness: 'open'
      }
    ];

    const recs = recommendSimulationCandidates({
      graph: g,
      activityId: 'act-1',
      activityRevision: 1,
      actorProfiles: profiles
    });

    // Only the 3 simulation actors appear; public-catalog actor is strictly excluded
    expect(recs.map((r) => r.actorId)).toEqual([
      simNearSkilled.id,
      simNoCoord.id,
      simFarUnskilled.id
    ]);
    expect(recs.some((r) => r.actorId === pubOrg.id)).toBe(false);

    // Top candidate at 0m distance still NEVER gets canParticipate=true or qualificationVerified=true
    const top = recs[0];
    expect(top.status).toBe('requires-ai-and-human-review');
    expect(top.canParticipate).toBeNull();
    expect(top.qualificationVerified).toBe(false);
    expect(top.impliesAgreement).toBe(false);
    expect(top.geographic.distanceMeters).toBe(0);
    expect(top.geographic.coarsePrecisionCaveat).toBe(true);
    expect(top.geographic.travelFeasibilityConfirmed).toBe(false);
    expect(top.geographic.missingLocationCount).toBe(1);
    expect(top.skill.matchedRequiredSkills).toEqual(['竹林整備']);
    expect(top.skill.matchedOptionalSkills).toEqual(['植生観察']);
    expect(top.skill.qualificationVerificationRequired).toBe(true);
    expect(top.interest.hasRecordedCaseInterest).toBe(true);
    expect(top.itemsToConfirm).toEqual(['雨天時対応', '資格証の提示要否']);

    // Missing-location actor preserves distanceMeters=null (never forged as 0m)
    const noCoord = recs.find((r) => r.actorId === simNoCoord.id)!;
    expect(noCoord.geographic.status).toBe('missing-location');
    expect(noCoord.geographic.distanceMeters).toBeNull();

    // Distant actor captures transport mismatch and beyond-extended distance
    const far = recs.find((r) => r.actorId === simFarUnskilled.id)!;
    expect(far.geographic.status).toBe('beyond-extended');
    expect(far.geographic.distanceMeters).toBeGreaterThan(300_000);
    expect(far.geographic.transportStatus).toBe('no-overlap');
    expect(far.skill.missingRequiredSkills).toEqual(['竹林整備']);
  });

  it('rejects explicit recommendation requests targeting public-catalog actors and preserves M0 geographicFit', () => {
    const g = makeGraph();
    expect(() =>
      recommendSimulationCandidates({
        graph: g,
        activityId: 'act-1',
        activityRevision: 1,
        candidateActorIds: [pubOrg.id]
      })
    ).toThrow('Public catalog actors cannot be recommended');

    expect(computeDistanceMeters4326({ srid: 4326, latitude: 35, longitude: 135 }, { srid: 4326, latitude: 35, longitude: 135 })).toBe(0);

    // M0 regression check
    expect(
      geographicFit({
        activity: { kind: 'public-activity', id: 'a', title: 't', source: { url: 'https://example.invalid', publisher: 'p', accessedOn: '2026-11-25', summary: 's' } },
        profile: { kind: 'simulated-profile', id: 'sim-1', displayName: 'd', skills: [] }
      }).status
    ).toBe('not-evaluated');
  });
});

describe.runIf(Boolean(DB_URL))('M2 Matching + M1 PostGIS distance bridge', () => {
  it('consumes PostGIS queryLocationsByDistance results directly into M2 recommendations', async () => {
    const dbName = `m2_match_${randomBytes(4).toString('hex')}`;
    const admin = new pg.Client({ connectionString: DB_URL!, connectionTimeoutMillis: 10000 });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE ${dbName}`);
    } finally {
      await admin.end();
    }

    const dbUrl = new URL(DB_URL!);
    dbUrl.pathname = `/${dbName}`;
    const pool = new pg.Pool({ connectionString: dbUrl.href, connectionTimeoutMillis: 10000 });
    try {
      const files = await loadMigrationFiles(MIGRATIONS_DIR);
      const client = await pool.connect();
      try {
        await applyMigrations(client, files);
      } finally {
        client.release();
      }

      const g = makeGraph();
      const repo = new PgM1Repository(pool);
      await repo.saveSourceDocument(src);
      await repo.savePublicActivityRevision(g.activities[0], g.assertions);
      for (const loc of g.locations) await repo.saveActivityLocation(loc);

      const postgisDistancesNear = await repo.queryLocationsByDistance({ latitude: 35.0116, longitude: 135.7681 });
      const postgisDistancesFar = await repo.queryLocationsByDistance({ latitude: 35.6812, longitude: 139.7671 });

      const recs = recommendSimulationCandidates({
        graph: g,
        activityId: 'act-1',
        activityRevision: 1,
        candidateActorIds: [simNearSkilled.id, simFarUnskilled.id],
        precomputedDistancesByActor: {
          [simNearSkilled.id]: postgisDistancesNear,
          [simFarUnskilled.id]: postgisDistancesFar
        }
      });

      expect(recs[0].actorId).toBe(simNearSkilled.id);
      expect(recs[0].geographic.distanceMeters).toBe(0);
      expect(recs[0].geographic.missingLocationCount).toBe(1);
      expect(recs[1].actorId).toBe(simFarUnskilled.id);
      expect(recs[1].geographic.distanceMeters).toBeGreaterThan(300_000);
    } finally {
      await pool.end();
    }
  });
});
