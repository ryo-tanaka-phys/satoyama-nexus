import { NextResponse } from 'next/server';
import {
  resolvePostalCodeToGridCell,
  toPublicVenueProfile,
  type VenueRoleTrack
} from '@satoyama/domain';
import { getActiveVenueFoundationStore } from '../../../../lib/venue-runtime';
import {
  buildSessionSetCookieHeader,
  findSpoofedClientAuthKey
} from '../../../../lib/venue-session';

export const dynamic = 'force-dynamic';

const VALID_ROLE_TRACKS: readonly VenueRoleTrack[] = ['citizen', 'organization', 'government', 'operator'];

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reasonCode: 'INVALID_JSON', message: 'リクエスト形式が不正です。' }, { status: 400 });
  }

  const spoofedKey = findSpoofedClientAuthKey(body);
  if (spoofedKey) {
    return NextResponse.json(
      {
        ok: false,
        reasonCode: 'SPOOFED_AUTH_FIELD',
        message: `クライアント指定の権限項目 (${spoofedKey}) は受け付けられません。`
      },
      { status: 400 }
    );
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!displayName) {
    return NextResponse.json(
      { ok: false, reasonCode: 'INVALID_DISPLAY_NAME', message: '表示名を入力してください。' },
      { status: 400 }
    );
  }

  const roleTrack = body.roleTrack as VenueRoleTrack;
  if (!VALID_ROLE_TRACKS.includes(roleTrack)) {
    return NextResponse.json(
      { ok: false, reasonCode: 'INVALID_ROLE_TRACK', message: '登録する立場を選択してください。' },
      { status: 400 }
    );
  }

  const postalCode = typeof body.postalCode === 'string' ? body.postalCode.trim() : '';
  let gridCellId = typeof body.gridCellId === 'string' ? body.gridCellId.trim() : '';
  if (!gridCellId && postalCode) {
    const resolvedCell = resolvePostalCodeToGridCell(postalCode);
    if (resolvedCell) {
      gridCellId = resolvedCell.id;
    }
  }
  if (!gridCellId) {
    return NextResponse.json(
      {
        ok: false,
        reasonCode: 'GRID_CELL_REQUIRED',
        message: '九州大学周辺の固定グリッドから本拠地区画を選択してください。'
      },
      { status: 400 }
    );
  }

  const interestTags = Array.isArray(body.interestTags)
    ? body.interestTags.filter((t): t is string => typeof t === 'string')
    : [];
  const strengthTags = Array.isArray(body.strengthTags)
    ? body.strengthTags.filter((t): t is string => typeof t === 'string')
    : [];
  const bio = typeof body.bio === 'string' ? body.bio : '';

  let ageInternal: number | null = null;
  if (body.ageInternal !== undefined && body.ageInternal !== null && body.ageInternal !== '') {
    const parsedAge = Number(body.ageInternal);
    if (!Number.isFinite(parsedAge) || parsedAge < 0 || parsedAge > 130) {
      return NextResponse.json(
        { ok: false, reasonCode: 'INVALID_AGE', message: '年齢は 0〜130 の数値で入力してください。' },
        { status: 400 }
      );
    }
    ageInternal = Math.trunc(parsedAge);
  }

  const genderInternal = typeof body.genderInternal === 'string' ? body.genderInternal.trim() || null : null;
  const seekingMatch = Boolean(body.seekingMatch);

  try {
    const store = getActiveVenueFoundationStore();
    const created = await store.registerAccountAndCreateSession({
      displayName,
      roleTrack,
      gridCellId,
      postalCode: postalCode || null,
      interestTags,
      strengthTags,
      bio,
      ageInternal,
      genderInternal,
      seekingMatch,
      mode: 'standard'
    });

    const isSecure = new URL(request.url).protocol === 'https:';
    const res = NextResponse.json({
      ok: true,
      account: created.account,
      publicProfile: toPublicVenueProfile(created.profile)
    });
    res.headers.set('Set-Cookie', buildSessionSetCookieHeader(created.rawToken, { secure: isSecure }));
    return res;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reasonCode: 'REGISTRATION_REJECTED',
        message: err instanceof Error ? err.message : 'アカウント登録に失敗しました。'
      },
      { status: 400 }
    );
  }
}
