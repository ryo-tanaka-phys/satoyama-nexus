# 共同作業ガイド
状態：共同作業手順の提案。採用・main統合は所有者レビュー待ち。製品要件や技術選定を変更しない。

## 最初に読む資料
毎回、対象作業の原典と修正資料を全文確認する。
1. docs/product/requirements.md v0.1 と変更履歴
2. docs/decisions/0001-m0-foundation.md、docs/architecture/README.md、docs/architecture/m1-domain-design.md、data/fixtures/README.md
3. [PR #10のADR 0002](https://github.com/ryo-tanaka-phys/satoyama-nexus/blob/8aba5a1566d0890c6c33794f97b2a2f0fc2d70c5/docs/decisions/0002-m1-domain.md) と対象Issue/PRの本文・コメント・変更資料

mainのM1設計案にある過去の未確定表記は、ADR 0002に記録されたユーザー承認判断と区別する。ADRのmain未統合と設計判断の承認は別。矛盾を発見したら既存資料を置換せず所有者に報告し、該当判断を保留する。要件1〜11、M0〜M6、D/Q番号を維持する。

## 担当と作業開始
Issueに「担当希望・対象SHA・作業範囲・予定する成果」をコメントし、所有者が重複を確認して担当を割り当てる。ユーザー名未確認の人を勝手に招待・割当しない。
最初は #16（環境再現）、次に #17（独立レビュー）。#18/#19は修正版の計画を作成し、具体版の承認後に隔離試験へ進む。Issue作成は技術選定や既存依存変更の承認ではない。

## ブランチとPR
Issueの基点SHAから codex/issue-番号-短い目的 を作成し、1 Issueにつき1 Draft PRを提出する。mainや他人の既存PRへ直接pushしない。force push・rebase・base付け替えは依存担当と所有者の確認後。
新PRのbaseはIssue指定を使い、積み上げた差分がmain向けに膨らまないよう確認する。既存PRはレビューのみ。取り込み・既存PRの更新は所有者判断。

PRには Refs #番号、基点SHA、base/head、対象/非対象、再現手順、実測結果、最終headに対応するCI URL、残課題を記載する。広い既存Issue #3〜#9を自動closeしない。
作成者以外が要求適合・否定例・秘密情報・差分範囲を確認する。レビュー成功とCI成功だけではmergeしない。main/積み上げPRの統合と本採用はユーザーの明示承認後。

## 検証
Node.js 24 / pnpm 11.25.0。READMEの pnpm install --frozen-lockfile、pnpm typecheck、pnpm test、pnpm build を実施する。
DBが必要なら専用ローカルPostGISでREADME手順を実施し、通常はdocker compose stopで止める。既存データを消して復旧しない。
通常CIは型検査・テスト・build・独立PostGISスモークを行う。#14/#15系は専用受け入れも必要。同一最終headの結果を確認し、push/PRの別runと対象SHAを記録する。未実行は未検証と書き、CI成功を本番保証やsecurity受け入れとしない。

## データと秘密
実在情報と模擬データを分離する。実在情報の新規収集、実在団体への連絡、実依頼/合意、実AI、実アカウント、外部OAuth/メール運用は禁止。
.env・資格情報・実接続先・トークン・Cookie・DB dump・個人情報をコミット、Issue、PR、ログ、artifactへ含めない。.env.exampleはローカル専用例。履歴に漏れた秘密は削除だけで解決せず、所有者へ非公開で報告して失効/ローテーションを先に検討する。

## 変更提案
確定事項・未確定事項・検討候補・新規提案を区別する。既定事項を変更する必要がある場合は、変更対象 / 変更前 / 変更後案 / 変更理由 / 影響範囲 を提示し、承認前に確定扱いしない。
