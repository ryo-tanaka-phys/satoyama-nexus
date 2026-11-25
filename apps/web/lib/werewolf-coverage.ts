import type { VenueFoundationSnapshot } from '../../../db/venue-store';

export interface ClassroomVerificationItem {
  readonly id: string;
  readonly label: string;
  readonly mechanism: string;
  readonly verified: boolean;
  readonly detail: string;
}

export interface ClassroomVerificationCoverage {
  readonly verifiedCount: number;
  readonly totalCount: number;
  readonly items: readonly ClassroomVerificationItem[];
}

/**
 * Summarizes live classroom verification coverage across all 7 core system
 * mechanisms during Part 2 (Werewolf Mode) so the operator / lecturer can see
 * at a glance which architectural properties participants have exercised.
 */
export function buildClassroomVerificationCoverage(
  snapshot: VenueFoundationSnapshot
): ClassroomVerificationCoverage {
  const activeConnCount = snapshot.activeConnections.length;
  const commentCount = snapshot.comments.length;

  const approvedOrgCerts = snapshot.certificationRequests.filter(
    (r) => r.kind === 'organization' && r.status === 'approved'
  ).length;

  const approvedExpertCerts = snapshot.certificationRequests.filter(
    (r) => r.kind === 'expert' && r.status === 'approved'
  ).length;
  const expertAdviceComments = snapshot.comments.filter((c) => c.isExpertAdvice).length;

  const mediatedApprovedCount = snapshot.auditEvents.filter(
    (e) => e.action === 'mediated-match.human-review' && e.outcome === 'allowed'
  ).length;

  const reportCount = snapshot.activityReports.length;

  const govDecisions = snapshot.publicInteractions.filter(
    (p) => p.direction === 'to-government' && p.status !== 'submitted'
  ).length;
  const govOffers = snapshot.publicInteractions.filter(
    (p) => p.direction === 'from-government'
  ).length;

  const triggeredPlanIds = new Set(snapshot.corporateOffers.map((o) => o.planId));

  const items: ClassroomVerificationItem[] = [
    {
      id: 'cov-social-active',
      label: '① 横の交流＆能動マッチング',
      mechanism: '4秒同期＋「未申請・運営サポート対象外」境界',
      verified: activeConnCount > 0,
      detail: `能動接続 ${activeConnCount}件 / コメント ${commentCount}件`
    },
    {
      id: 'cov-org-cert',
      label: '② 市民団体認証（法人格ロック解放）',
      mechanism: '未認証403遮断→運営承認で専用4機能解放',
      verified: approvedOrgCerts > 0,
      detail: `承認済み団体申請 ${approvedOrgCerts}件`
    },
    {
      id: 'cov-expert-cert',
      label: '③ 専門家資格認証＆助言付与',
      mechanism: '市民枠のまま運営認証→サーバ自動isExpertAdvice付与',
      verified: approvedExpertCerts > 0 && expertAdviceComments > 0,
      detail: `認証 ${approvedExpertCerts}名 / 専門家助言 ${expertAdviceComments}件`
    },
    {
      id: 'cov-mediated-review',
      label: '④ 運営の厳格仲介審査（AI→人間）',
      mechanism: '自己紹介非入力の構造化AI評価→人間二次審査→通知',
      verified: mediatedApprovedCount > 0,
      detail: `人間二次審査完了 ${mediatedApprovedCount}件`
    },
    {
      id: 'cov-org-report',
      label: '⑤ 活動ログ透明化・簡易レポート生成',
      mechanism: 'カレンダー実績・投稿・専門家助言の自動集計',
      verified: reportCount > 0,
      detail: `生成済みレポート ${reportCount}件`
    },
    {
      id: 'cov-gov-vertical',
      label: '⑥ 自治体回答＆双方向公的オファー',
      mechanism: '追記型履歴・公開粒度切替・自治体からの直接オファー',
      verified: govDecisions > 0 && govOffers > 0,
      detail: `要望判断 ${govDecisions}件 / 自治体発オファー ${govOffers}件`
    },
    {
      id: 'cov-corporate-sep',
      label: '⑦ 分離企業支援の自動通知（3プラン）',
      mechanism: '主体分離テーブルによる資材・資金・安全装備の自動連携',
      verified: triggeredPlanIds.size > 0,
      detail: `発火 ${triggeredPlanIds.size} / 3 プラン（計 ${snapshot.corporateOffers.length}件）`
    }
  ];

  return {
    verifiedCount: items.filter((i) => i.verified).length,
    totalCount: items.length,
    items
  };
}
