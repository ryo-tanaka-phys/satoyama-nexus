export type WerewolfAssignedRole =
  | 'citizen'
  | 'expert-candidate'
  | 'organization'
  | 'government';

export interface WerewolfMissionDescriptor {
  readonly role: WerewolfAssignedRole;
  readonly label: string;
  readonly shortBadge: string;
  readonly mission: string;
}

export const WEREWOLF_MISSIONS: Readonly<Record<WerewolfAssignedRole, WerewolfMissionDescriptor>> = {
  citizen: {
    role: 'citizen',
    label: '一般市民',
    shortBadge: '市民役',
    mission:
      '自己紹介カードを見て他アカウントと能動マッチングで繋がるか、「紹介希望」をONにして運営の厳格審査仲介通知を受け取ってみましょう。'
  },
  'expert-candidate': {
    role: 'expert-candidate',
    label: '専門家候補（市民枠）',
    shortBadge: '専門家候補',
    mission:
      'まず運営へ「専門家資格認証」を申請し、承認されたらタイムラインの投稿へ安全・技術助言をコメントしてみましょう。'
  },
  organization: {
    role: 'organization',
    label: '市民団体（未認証スタート）',
    shortBadge: '市民団体役',
    mission:
      'まず運営へ「市民団体認証（法人格・責任者認証）」を申請し、解放後にカレンダー実施記録→簡易レポート作成→自治体へ支援申請を出してみましょう。'
  },
  government: {
    role: 'government',
    label: '自治体（公的機関）',
    shortBadge: '自治体役',
    mission:
      '団体から届く要望・簡易レポートを確認して回答（承認・支援決定）し、気になるアカウントへ自治体からの公的オファーを送ってみましょう。'
  }
};

/**
 * Builds a role pool with guaranteed coverage of essential core roles so live demos
 * never stall due to 0 municipalities or 0 organizations.
 */
export function buildGuaranteedWerewolfRoles(participantCount: number): WerewolfAssignedRole[] {
  if (!Number.isInteger(participantCount) || participantCount <= 0) {
    return [];
  }
  const coreOrder: readonly WerewolfAssignedRole[] = [
    'government',
    'organization',
    'citizen',
    'expert-candidate'
  ];
  const overflowOrder: readonly WerewolfAssignedRole[] = [
    'citizen',
    'expert-candidate',
    'organization',
    'citizen'
  ];

  const roles: WerewolfAssignedRole[] = [];
  for (let i = 0; i < participantCount; i++) {
    if (i < coreOrder.length) {
      roles.push(coreOrder[i]);
    } else {
      roles.push(overflowOrder[(i - coreOrder.length) % overflowOrder.length]);
    }
  }
  return roles;
}

/** Fisher-Yates shuffle over the minimum-guarantee role pool. */
export function drawShuffledWerewolfRoles(
  participantCount: number,
  rng: () => number = Math.random
): WerewolfAssignedRole[] {
  const roles = buildGuaranteedWerewolfRoles(participantCount);
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = roles[i];
    roles[i] = roles[j];
    roles[j] = tmp;
  }
  return roles;
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Generates an unambiguous 4-character room code (excludes 0/O/1/I) for projector display. */
export function generateWerewolfRoomCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
