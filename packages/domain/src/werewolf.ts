export type WerewolfAssignedRole =
  | 'citizen'
  | 'expert-candidate'
  | 'organization'
  | 'government';

export interface WerewolfChecklistStep {
  readonly id: string;
  readonly action: string;
  readonly verificationPoint: string;
}

export interface WerewolfMissionDescriptor {
  readonly role: WerewolfAssignedRole;
  readonly label: string;
  readonly shortBadge: string;
  readonly mission: string;
  readonly steps: readonly WerewolfChecklistStep[];
}

export const WEREWOLF_MISSIONS: Readonly<Record<WerewolfAssignedRole, WerewolfMissionDescriptor>> = {
  citizen: {
    role: 'citizen',
    label: '一般市民',
    shortBadge: '市民役',
    mission:
      '自己紹介カードを見て能動マッチングで繋がるか、「紹介希望」をONにして運営の厳格審査仲介通知を受け取ってみましょう。',
    steps: [
      {
        id: 'cit-social',
        action: 'タイムラインに投稿、または他の投稿へコメント・賛同する',
        verificationPoint: '横の交流が4秒ポーリングで他端末へリアルタイム共有されること'
      },
      {
        id: 'cit-active-match',
        action: '右側の参加者一覧で自己紹介カードを見て「つながる」を押す',
        verificationPoint: '能動マッチングは即接続できる一方「未申請・運営サポート対象外」と明示されること'
      },
      {
        id: 'cit-mediated',
        action: '「紹介希望」ONのまま、運営の厳格審査（AI一次評価→人間二次審査）による仲介通知を受け取る',
        verificationPoint: '宛てがない人は自己紹介非入力の構造化評価＋人間審査を経て安全に接続されること'
      }
    ]
  },
  'expert-candidate': {
    role: 'expert-candidate',
    label: '専門家候補（市民枠）',
    shortBadge: '専門家候補',
    mission:
      'まず運営へ「専門家資格認証」を申請し、承認されたらタイムラインの投稿へ安全・技術助言をコメントしてみましょう。',
    steps: [
      {
        id: 'exp-apply',
        action: '上部の「専門家資格認証を申請する」から根拠メモ付きで運営へ申請する',
        verificationPoint: '専門家は区分上「一般市民枠」であり、自称だけでは認証扱いにならないこと'
      },
      {
        id: 'exp-certified',
        action: '運営の承認後、「運営による専門家資格認証済み」バッジの表示を確認する',
        verificationPoint: '運営による資格確認と監査ログ記録を経て初めて専門性が付与されること'
      },
      {
        id: 'exp-advice',
        action: '市民団体の投稿へ技術・安全助言をコメントする',
        verificationPoint: '認証後のコメントに自動で「認証済み専門家の助言」が付き、団体の実績レポートと企業安全装備支援へ連動すること'
      }
    ]
  },
  organization: {
    role: 'organization',
    label: '市民団体（未認証スタート）',
    shortBadge: '市民団体役',
    mission:
      'まず運営へ「市民団体認証（法人格・責任者認証）」を申請し、解放後にカレンダー実施記録→簡易レポート作成→自治体へ支援申請を出してみましょう。',
    steps: [
      {
        id: 'org-cert',
        action: 'ロック表示を確認し、運営へ「市民団体認証（法人格・責任者権限）」を申請→承認を受ける',
        verificationPoint: '法人格モデルにより未認証団体は専用機能がロックされ、認証と同時に企業①（資材）自動通知が届くこと'
      },
      {
        id: 'org-calendar',
        action: '解放されたカレンダーへ活動予定を登録して「実施済みにする」を押し、ダミー団員・非公開チャットを確認する',
        verificationPoint: '団体専用の活動管理・ダミーメンバー管理・外部非公開チャットが機能すること'
      },
      {
        id: 'org-report',
        action: '「サイト上の活動ログから簡易レポートを自動生成する」を押す',
        verificationPoint: '実施記録・投稿・専門家助言が透明化レポートへ自動集計され、企業②（資金）自動通知が飛ぶこと'
      },
      {
        id: 'org-petition',
        action: '生成した簡易レポートを添付して「自治体への要望・公的支援申請」を提出する',
        verificationPoint: '横の活動実績が縦の公的申請へ接続され、自治体画面へ即座に届くこと'
      }
    ]
  },
  government: {
    role: 'government',
    label: '自治体（公的機関）',
    shortBadge: '自治体役',
    mission:
      '団体から届く要望・簡易レポートを確認して回答（承認・支援決定）し、気になるアカウントへ自治体からの公的オファーを送ってみましょう。',
    steps: [
      {
        id: 'gov-review',
        action: 'パネル①で団体から届いた要望・簡易レポートを確認し、理由付きで「所管確認中」→「支援決定（または承認）」を実行する',
        verificationPoint: '公的判断の全ステップが追記型履歴と監査ログに残り、団体へ即通知されること'
      },
      {
        id: 'gov-visibility',
        action: '「デモ公開：過程すべて表示」と「本番想定プレビュー：結果のみ表示」を切り替えて見え方の差を確認する',
        verificationPoint: '内部監査ログを保持しつつ、一般公開粒度をポリシー切替できる設計であること'
      },
      {
        id: 'gov-offer',
        action: 'パネル②「各アカウントへアクションをかける」から任意の市民・団体へ公的オファーを送信する',
        verificationPoint: '受け皿だけでなく、自治体側から特定アカウントへ支援誘導・提携申し出を行えること'
      }
    ]
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
