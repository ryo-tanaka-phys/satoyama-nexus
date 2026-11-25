import {
  defaultGrantsForRoleTrack,
  resolveGridCellCoordinates,
  type Actor,
  type CorporateSponsorRecord,
  type CorporateSupportPlanRecord,
  type DemoAccountRecord,
  type VenueProfileRecord,
  type VenueTag
} from '@satoyama/domain';

export interface SeedDummyMembership {
  personActorId: string;
  organizationActorId: string;
  role: 'leader' | 'member';
  isDummy: boolean;
  certifiedByAccountId: string | null;
  certifiedAt: string | null;
}

export interface SeedSocialPost {
  id: string;
  authorActorId: string;
  channel: 'horizontal' | 'public-offer' | 'activity-log';
  title: string;
  body: string;
  tags: readonly VenueTag[];
  gridCellId: string;
  endorsementCount: number;
  createdAt: string;
}

export interface KyushuVenueSeed {
  actors: readonly Actor[];
  venueProfiles: readonly VenueProfileRecord[];
  actorCoordinatesById: Readonly<Record<string, { latitude: number; longitude: number } | null>>;
  demoAccounts: readonly DemoAccountRecord[];
  memberships: readonly SeedDummyMembership[];
  corporateSponsors: readonly CorporateSponsorRecord[];
  corporatePlans: readonly CorporateSupportPlanRecord[];
  initialPosts: readonly SeedSocialPost[];
}

const SEED_TIMESTAMP = '2026-11-25T09:00:00+09:00';

/**
 * Builds the simulated Kyushu University (Ito Campus & surrounding Itoshima/Nishi-ku)
 * demo community dataset. Every record is strictly simulated (`domain: 'simulation'`).
 * Corporate sponsors live exclusively in separated corporate arrays, never inside `actors`.
 */
export function buildKyushuVenueSeed(): KyushuVenueSeed {
  const actors: Actor[] = [
    // 1) 5-person live demo primary actors
    {
      id: 'sim-kyushu-cit-demo',
      domain: 'simulation',
      kind: 'person',
      displayName: '【模擬】伊都 みなみ（一般市民・デモ役）',
      expertise: [{ label: '自然観察会', evidence: null }]
    },
    {
      id: 'sim-kyushu-exp-demo',
      domain: 'simulation',
      kind: 'person',
      displayName: '【模擬】桑原 博士（専門家候補・市民枠）',
      expertise: [
        { label: '植生観察', evidence: '植物生態学研究歴（運営資格認証待ち）' },
        { label: '安全管理', evidence: '野外安全講習修了（運営資格認証待ち）' }
      ]
    },
    {
      id: 'sim-kyushu-org-demo',
      domain: 'simulation',
      kind: 'organization',
      displayName: '【模擬】伊都里山みらいの会（団体認証待ち・デモ役）',
      expertise: [
        { label: '竹林整備', evidence: null },
        { label: '歩道整備', evidence: null }
      ]
    },
    {
      id: 'sim-kyushu-gov-demo',
      domain: 'simulation',
      kind: 'government-body',
      displayName: '【模擬】福岡西・糸島 里山協働推進窓口（自治体役）',
      expertise: [
        { label: '地域調整', evidence: null },
        { label: '安全管理', evidence: null }
      ]
    },
    {
      id: 'sim-kyushu-op-demo',
      domain: 'simulation',
      kind: 'person',
      displayName: '【模擬】Satoyama Nexus 運営審査担当',
      expertise: [
        { label: '地域調整', evidence: null },
        { label: '記録/GIS', evidence: null }
      ]
    },

    // 2) Background simulated community members (so matching & feed feel alive)
    {
      id: 'sim-kyushu-org-bg-1',
      domain: 'simulation',
      kind: 'organization',
      displayName: '【模擬】元岡水辺とホタルを守る会（認証済み団体）',
      expertise: [
        { label: '水辺保全', evidence: null },
        { label: '自然観察会', evidence: null },
        { label: '広報', evidence: null }
      ]
    },
    {
      id: 'sim-kyushu-cit-bg-1',
      domain: 'simulation',
      kind: 'person',
      displayName: '【模擬】周船寺 けんた（九大生・GIS関心）',
      expertise: [
        { label: '記録/GIS', evidence: null },
        { label: '広報', evidence: null }
      ]
    },
    {
      id: 'sim-kyushu-cit-bg-2',
      domain: 'simulation',
      kind: 'person',
      displayName: '【模擬】今宿 あおい（里山トレイル愛好者）',
      expertise: [
        { label: '歩道整備', evidence: null },
        { label: '竹林整備', evidence: null }
      ]
    },

    // 3) Dummy organization members (strictly non-interactive dummy data; distinct from citizen role)
    {
      id: 'sim-kyushu-dummy-mem-1',
      domain: 'simulation',
      kind: 'person',
      displayName: '【ダミー団員】元岡 一郎（整備班）',
      expertise: [{ label: '竹林整備', evidence: null }]
    },
    {
      id: 'sim-kyushu-dummy-mem-2',
      domain: 'simulation',
      kind: 'person',
      displayName: '【ダミー団員】泊 さくら（会計・記録班）',
      expertise: [{ label: '記録/GIS', evidence: null }]
    }
  ];

  const venueProfiles: VenueProfileRecord[] = [
    {
      actorId: 'sim-kyushu-cit-demo',
      gridCellId: 'grid-r2-c2',
      postalCode: '819-0373',
      interestTags: ['自然観察会', '水辺保全', '竹林整備'],
      strengthTags: ['広報'],
      bio: '周船寺の近くに住んでいます。休日に里山の手入れや観察会に参加してみたいです！',
      ageInternal: 22,
      genderInternal: '未回答',
      seekingMatch: true,
      orgCertificationStatus: 'none',
      expertCertified: false,
      expertCertificationNote: null,
      updatedAt: SEED_TIMESTAMP
    },
    {
      actorId: 'sim-kyushu-exp-demo',
      gridCellId: 'grid-r1-c1',
      postalCode: '819-0395',
      interestTags: ['植生観察', '水辺保全', '自然観察会'],
      strengthTags: ['植生観察', '安全管理', '記録/GIS'],
      bio: '九大伊都キャンパス西側で里山植生と安全管理を研究しています。現場の調査設計や安全面の助言ができます。',
      ageInternal: 38,
      genderInternal: '未回答',
      seekingMatch: false,
      orgCertificationStatus: 'none',
      expertCertified: false,
      expertCertificationNote: null,
      updatedAt: SEED_TIMESTAMP
    },
    {
      actorId: 'sim-kyushu-org-demo',
      gridCellId: 'grid-r1-c2',
      postalCode: '819-0385',
      interestTags: ['竹林整備', '歩道整備', '安全管理'],
      strengthTags: ['竹林整備', '歩道整備', '地域調整'],
      bio: '元岡〜伊都キャンパス東側の放置竹林を整備し、学生と住民が安全に歩ける里山づくりを目指しています。',
      ageInternal: null,
      genderInternal: null,
      seekingMatch: false,
      // Starts uncertified (owner decision ④A): unlocked once operator certifies!
      orgCertificationStatus: 'none',
      expertCertified: false,
      expertCertificationNote: null,
      updatedAt: SEED_TIMESTAMP
    },
    {
      actorId: 'sim-kyushu-gov-demo',
      gridCellId: 'grid-r2-c1',
      postalCode: '819-0366',
      interestTags: ['地域調整', '安全管理', '水辺保全'],
      strengthTags: ['地域調整', '安全管理'],
      bio: '地域の里山保全団体の皆様からの要望・支援相談を受け付け、公有地活用や助成制度のご案内を行っています（模擬窓口）。',
      ageInternal: null,
      genderInternal: null,
      seekingMatch: false,
      orgCertificationStatus: 'none',
      expertCertified: false,
      expertCertificationNote: null,
      updatedAt: SEED_TIMESTAMP
    },
    {
      actorId: 'sim-kyushu-op-demo',
      gridCellId: 'grid-r1-c2',
      postalCode: '819-0395',
      interestTags: ['地域調整', '記録/GIS'],
      strengthTags: ['地域調整', '記録/GIS'],
      bio: 'Satoyama Nexus の運営・審査担当です。未接続の方の仲介審査、団体認証・専門家資格認証を担当します。',
      ageInternal: null,
      genderInternal: null,
      seekingMatch: false,
      orgCertificationStatus: 'none',
      expertCertified: false,
      expertCertificationNote: null,
      updatedAt: SEED_TIMESTAMP
    },
    {
      actorId: 'sim-kyushu-org-bg-1',
      gridCellId: 'grid-r0-c1',
      postalCode: '819-0385',
      interestTags: ['水辺保全', '自然観察会', '広報'],
      strengthTags: ['水辺保全', '自然観察会', '地域調整'],
      bio: '元岡北部の湿地と小川で毎月ゴミ拾いと水生生物観察会を実施している認証済み模擬団体です。',
      ageInternal: null,
      genderInternal: null,
      seekingMatch: false,
      orgCertificationStatus: 'certified',
      expertCertified: false,
      expertCertificationNote: null,
      updatedAt: SEED_TIMESTAMP
    },
    {
      actorId: 'sim-kyushu-cit-bg-1',
      gridCellId: 'grid-r1-c2',
      postalCode: '819-0395',
      interestTags: ['記録/GIS', '植生観察', '広報'],
      strengthTags: ['記録/GIS', '広報'],
      bio: '地図づくりや写真記録が得意です。里山活動の記録を手伝いたいです。',
      ageInternal: 21,
      genderInternal: '未回答',
      seekingMatch: true,
      orgCertificationStatus: 'none',
      expertCertified: false,
      expertCertificationNote: null,
      updatedAt: SEED_TIMESTAMP
    },
    {
      actorId: 'sim-kyushu-cit-bg-2',
      gridCellId: 'grid-r2-c3',
      postalCode: '819-0167',
      interestTags: ['歩道整備', '竹林整備', '安全管理'],
      strengthTags: ['歩道整備', '竹林整備'],
      bio: '今宿〜叶岳北麓の歩道整備に関心があります。体力作業歓迎です。',
      ageInternal: 45,
      genderInternal: '未回答',
      seekingMatch: false,
      orgCertificationStatus: 'none',
      expertCertified: false,
      expertCertificationNote: null,
      updatedAt: SEED_TIMESTAMP
    },
    {
      actorId: 'sim-kyushu-dummy-mem-1',
      gridCellId: 'grid-r1-c2',
      postalCode: null,
      interestTags: ['竹林整備'],
      strengthTags: ['竹林整備'],
      bio: 'ダミー登録メンバー（デモ中は操作対象外）',
      ageInternal: null,
      genderInternal: null,
      seekingMatch: false,
      orgCertificationStatus: 'none',
      expertCertified: false,
      expertCertificationNote: null,
      updatedAt: SEED_TIMESTAMP
    },
    {
      actorId: 'sim-kyushu-dummy-mem-2',
      gridCellId: 'grid-r1-c0',
      postalCode: null,
      interestTags: ['記録/GIS'],
      strengthTags: ['記録/GIS'],
      bio: 'ダミー登録メンバー（デモ中は操作対象外）',
      ageInternal: null,
      genderInternal: null,
      seekingMatch: false,
      orgCertificationStatus: 'none',
      expertCertified: false,
      expertCertificationNote: null,
      updatedAt: SEED_TIMESTAMP
    }
  ];

  const actorCoordinatesById: Record<string, { latitude: number; longitude: number } | null> = {};
  for (const prof of venueProfiles) {
    if (prof.gridCellId) {
      const coords = resolveGridCellCoordinates(prof.gridCellId);
      actorCoordinatesById[prof.actorId] = { latitude: coords.latitude, longitude: coords.longitude };
    } else {
      actorCoordinatesById[prof.actorId] = null;
    }
  }

  const demoAccounts: DemoAccountRecord[] = [
    {
      id: 'demo-acct-citizen',
      displayName: '【模擬】伊都 みなみ（一般市民役）',
      roleTrack: 'citizen',
      actorId: 'sim-kyushu-cit-demo',
      operatedActorIds: ['sim-kyushu-cit-demo'],
      grants: defaultGrantsForRoleTrack('citizen'),
      createdAt: SEED_TIMESTAMP,
      revokedAt: null
    },
    {
      id: 'demo-acct-expert',
      displayName: '【模擬】桑原 博士（専門家候補・市民枠）',
      roleTrack: 'citizen',
      actorId: 'sim-kyushu-exp-demo',
      operatedActorIds: ['sim-kyushu-exp-demo'],
      grants: defaultGrantsForRoleTrack('citizen'),
      createdAt: SEED_TIMESTAMP,
      revokedAt: null
    },
    {
      id: 'demo-acct-org',
      displayName: '【模擬】伊都里山みらいの会 代表（団体役）',
      roleTrack: 'organization',
      actorId: 'sim-kyushu-org-demo',
      operatedActorIds: ['sim-kyushu-org-demo'],
      grants: defaultGrantsForRoleTrack('organization'),
      createdAt: SEED_TIMESTAMP,
      revokedAt: null
    },
    {
      id: 'demo-acct-gov',
      displayName: '【模擬】福岡西・糸島 里山協働推進窓口（自治体役）',
      roleTrack: 'government',
      actorId: 'sim-kyushu-gov-demo',
      operatedActorIds: ['sim-kyushu-gov-demo'],
      grants: defaultGrantsForRoleTrack('government'),
      createdAt: SEED_TIMESTAMP,
      revokedAt: null
    },
    {
      id: 'demo-acct-operator',
      displayName: '【模擬】Satoyama Nexus 運営審査担当（運営役）',
      roleTrack: 'operator',
      actorId: 'sim-kyushu-op-demo',
      operatedActorIds: ['sim-kyushu-op-demo'],
      grants: defaultGrantsForRoleTrack('operator'),
      createdAt: SEED_TIMESTAMP,
      revokedAt: null
    }
  ];

  // Dummy organization members attached to the demo org (non-interactive dummy records)
  const memberships: SeedDummyMembership[] = [
    {
      personActorId: 'sim-kyushu-dummy-mem-1',
      organizationActorId: 'sim-kyushu-org-demo',
      role: 'member',
      isDummy: true,
      certifiedByAccountId: null,
      certifiedAt: null
    },
    {
      personActorId: 'sim-kyushu-dummy-mem-2',
      organizationActorId: 'sim-kyushu-org-demo',
      role: 'member',
      isDummy: true,
      certifiedByAccountId: null,
      certifiedAt: null
    }
  ];

  // Separated corporate sponsors (3 plans confirmed by owner on 2026-11-25)
  const corporateSponsors: CorporateSponsorRecord[] = [
    {
      id: 'corp-sponsor-genkai',
      name: '【模擬企業】玄海エコ資材株式会社',
      industry: '林業・環境資材',
      summary: '里山の竹林整備・歩道整備に取り組む地域活動へ資材・道具の無償貸与と提供を行っています。'
    },
    {
      id: 'corp-sponsor-itoshima-fund',
      name: '【模擬企業】糸島みらい地域基金',
      industry: '地域金融・ESG助成',
      summary: '活動実績の透明化レポートを作成・提出した認証済み市民団体へ活動資金を助成しています。'
    },
    {
      id: 'corp-sponsor-fukuoka-safety',
      name: '【模擬企業】ふくおか安全ワークス',
      industry: '安全装備・防災用品',
      summary: '認証済み専門家の助言を受けて安全配慮を行う里山活動へヘルメット・防護装備を支援します。'
    }
  ];

  const corporatePlans: CorporateSupportPlanRecord[] = [
    {
      id: 'corp-plan-materials',
      sponsorId: 'corp-sponsor-genkai',
      title: '【企業支援①】竹林・歩道整備 資材提供プラン',
      supportType: 'materials',
      summary: '「竹林整備」または「歩道整備」タグを持つ認証済み団体へ、ノコギリ・運搬資材セットを提供します。',
      requiredTags: ['竹林整備', '歩道整備'],
      requiresCertifiedOrg: true,
      requiresActivityReport: false,
      requiresExpertAdvice: false
    },
    {
      id: 'corp-plan-funding',
      sponsorId: 'corp-sponsor-itoshima-fund',
      title: '【企業支援②】透明化レポート連携 活動資金支援プラン',
      supportType: 'funding',
      summary: '運営認証済みで活動実績の簡易レポートを作成した団体へ、上限10万円相当の模擬活動資金を支援します。',
      requiredTags: [],
      requiresCertifiedOrg: true,
      requiresActivityReport: true,
      requiresExpertAdvice: false
    },
    {
      id: 'corp-plan-safety',
      sponsorId: 'corp-sponsor-fukuoka-safety',
      title: '【企業支援③】専門家助言連携 安全装備サポートプラン',
      supportType: 'safety-equipment',
      summary: '認証済み専門家の技術・安全助言が記録された活動へ、安全ヘルメット・応急キットを提供します。',
      requiredTags: [],
      requiresCertifiedOrg: true,
      requiresActivityReport: false,
      requiresExpertAdvice: true
    }
  ];

  const initialPosts: SeedSocialPost[] = [
    {
      id: 'post-kyushu-001',
      authorActorId: 'sim-kyushu-org-bg-1',
      channel: 'horizontal',
      title: '【模擬】元岡北部里山の水辺クリーン＆観察会（参加者ゆる募）',
      body: '来週末に元岡北部の小川沿いで水辺保全と生きもの観察を行います。初めての方も見学歓迎です！',
      tags: ['水辺保全', '自然観察会'],
      gridCellId: 'grid-r0-c1',
      endorsementCount: 3,
      createdAt: SEED_TIMESTAMP
    },
    {
      id: 'post-kyushu-002',
      authorActorId: 'sim-kyushu-gov-demo',
      channel: 'public-offer',
      title: '【模擬・自治体案内】令和8年度 里山保全団体向け・公有林活動バックアップ公募',
      body: '活動実績の簡易レポートを添えてご相談いただいた認証済み市民団体を対象に、資材保管場所・安全講習の支援相談を受け付けています。',
      tags: ['地域調整', '安全管理', '竹林整備'],
      gridCellId: 'grid-r2-c1',
      endorsementCount: 2,
      createdAt: SEED_TIMESTAMP
    },
    {
      id: 'post-kyushu-003',
      authorActorId: 'sim-kyushu-cit-bg-1',
      channel: 'horizontal',
      title: '【模擬】伊都キャンパス周辺の放置竹林マップを一緒に作りませんか？',
      body: 'スマホGPSと簡易グリッドを使って、整備が必要な竹林エリアを可視化してみたいです。現地を知る方・専門家の方のアドバイス歓迎！',
      tags: ['記録/GIS', '竹林整備', '植生観察'],
      gridCellId: 'grid-r1-c2',
      endorsementCount: 4,
      createdAt: SEED_TIMESTAMP
    }
  ];

  return {
    actors,
    venueProfiles,
    actorCoordinatesById,
    demoAccounts,
    memberships,
    corporateSponsors,
    corporatePlans,
    initialPosts
  };
}
