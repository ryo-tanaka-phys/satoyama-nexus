import { NextResponse } from 'next/server';
import {
  checkCertifiedOrganizationAccess,
  type DemoAccountRecord,
  type VenueProfileRecord
} from '@satoyama/domain';
import type { VenueFoundationStorePort } from '../../../db/venue-store';
import { getActiveVenueFoundationStore } from './venue-runtime';
import { extractSessionTokenFromCookieHeader } from './venue-session';

export type CertifiedOrgGateResult =
  | {
      ok: true;
      store: VenueFoundationStorePort;
      account: DemoAccountRecord;
      profile: VenueProfileRecord;
    }
  | {
      ok: false;
      response: NextResponse;
    };

/**
 * Enforces server-side authentication + legal-entity organization certification gate.
 * Records denied attempts to ops_audit.venue_audit_event.
 */
export async function requireCertifiedOrganizationSession(
  request: Request,
  actionName: string
): Promise<CertifiedOrgGateResult> {
  const store = getActiveVenueFoundationStore();
  const rawToken = extractSessionTokenFromCookieHeader(request.headers.get('cookie'));
  const resolved = await store.resolveSessionByToken(rawToken);

  if (!resolved.authenticated || !resolved.account || !resolved.authContext.authenticated) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, reasonCode: 'UNAUTHENTICATED', message: '市民団体専用機能の利用にはログインが必要です。' },
        { status: 401 }
      )
    };
  }

  const check = checkCertifiedOrganizationAccess(resolved.authContext, resolved.profile);
  if (!check.ok || !resolved.profile) {
    const reasonCode = check.ok ? 'ORGANIZATION_NOT_CERTIFIED' : check.reasonCode;
    const message = check.ok ? '団体認証が必要です。' : check.message;
    await store.recordVenueAuditEvent({
      actorAccountId: resolved.account.id,
      action: actionName,
      targetId: resolved.account.actorId,
      outcome: 'denied',
      reasonCode,
      detailSummary: { roleTrack: resolved.account.roleTrack }
    });
    return {
      ok: false,
      response: NextResponse.json({ ok: false, reasonCode, message }, { status: 403 })
    };
  }

  return {
    ok: true,
    store,
    account: resolved.account,
    profile: resolved.profile
  };
}
