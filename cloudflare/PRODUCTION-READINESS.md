# 親子同期の本番公開・初回同期

更新日: 2026-11-20

## 公開方針と実データ保護

ユーザー確認により、現在のハルキ本番アプリには保護対象の学習記録がありません。実端末JSONバックアップの取得、隔離復元、既存学習履歴の移行は、今回の本番公開・初回同期の前提条件から除外します。JSONバックアップ・復元機能は今後のために維持します。

公開前のWorker検証ではD1の `family_snapshot` が `revision=0 / body=NULL` であることを再確認します。端末の初回同期時、クラウドが空で端末にも学習記録がないことを確認できれば空の状態から開始します。端末に想定外の記録がある場合、空のクラウドへ自動送信せず同期を停止します。双方に記録がある初回接続は従来どおり比較・競合解決を行います。

既存端末の記録を初期化・削除する処理は行いません。公開後に記録を追加した後は、必要に応じてJSONバックアップを使います。

## Cloudflare

- 専用Worker: `haruki-production-inactive-44733572133`
- 既存D1: `haruki-sync-qa-44663546163`
- D1 UUID: `31dc86e4-3cc5-42dc-a738-5a9a6259747f`
- Workerの `DB` バインディングは上記D1を参照。Cloudflare APIとWorker runtimeで確認済み。
- D1は直接SELECTで `revision=0 / body=NULL`。ほかのD1の削除・初期化・改名は行っていない。
- Workerは現在、家族コード未設定のため同期APIが `not_configured` を返す。本番デプロイworkflowが `haruki-production` Environment Secret `HARUKI_FAMILY_CODE` をWorker Secretとして登録し、5桁形式・テスト値でないこととD1の空状態を検証する。
- アカウントD1数は10件、新規作成はHTTP 403 / 7406で拒否。既存の空D1を使うため、今回の作業で追加課金・DB削除は不要。Billing Read権限がないためCloudflare契約プラン自体はAPIから確定できていない。
- 全D1の一覧・UUID・用途は [D1 inventory](D1-INVENTORY-2026-11-20.md)。

## GitHub Pages とアプリ

- 同期API URLは `cloudflare/sync-config.js` に本番Workerを設定済み。GitHub Pages公開後に利用可能になる。
- 家族コードはソース・PR・Actionsログに出さず、Environment SecretからWorker Secretへ渡す。
- アプリは初回接続後も端末内保存を維持する。空のクラウドに対して、空と判定された新規端末だけ同期を開始できる。想定外のローカル記録を見つけた場合は自動アップロードせず停止する。
- 親子の初回接続後、クエスト、完了履歴、XP・レベル、英検・ゲーム進捗を既存の同期・競合処理で共有する。
- Service Workerのキャッシュバージョンを更新し、公開後に新しい同期設定を読み直す。

## 回帰試験

- PR #15の単体、同期安全、ブラウザ統合、バックアップ比較、復元、英検、ゲーム、試合オープニングのGitHub Actions回帰が成功した後にマージする。
- 合成データによる2ブラウザ試験で、親のクエスト追加・編集・削除、相手側への反映、完了履歴・XP・レベルの同期、オフライン再送、同時編集の手動解決を確認する。
- 実Android端末での本番アプリ操作はこの環境からは実施しない。公開後、親子それぞれのAndroid Chromeでの手順を案内し、実機で未確認の結果は未検証と報告する。

## 公開後の初回操作

1. GitHub Actionsの `Deploy configured production sync API` を `work/cloudflare-parent-sync` ブランチから手動実行する。Worker `haruki-production-inactive-44733572133` と上記D1名・UUIDを指定する。Environment Secretの値をログ・チャットに表示しない。
2. Action成功後、Workerの認証付きGETが空のsnapshotを返すことを確認する。
3. PR #15をmainへマージし、GitHub Pagesのデプロイ完了と本番URLを確認する。
4. 親の端末で「管理・バックアップ」から親子同期を開き、家族コードを入力して同期を開始する。ハルキの端末も同じコードで同期を開始する。初回接続時は差分・競合画面の内容を確認する。想定外の端末記録が検出された場合は操作を続けず、同期を停止する。
5. 親側で合成でない通常のクエストを1件追加し、ハルキ側で表示されることを確認する。ハルキ側でそのクエストを完了し、親側で完了・履歴・XPの反映とページ更新後の保持を確認する。オフライン復帰と同時編集も実機で確認する。
6. 不具合時はアプリの「同期を停止」を両端末で使い、端末内記録は維持する。Cloudflare D1を削除・初期化しない。

## 現在の未完了項目

- 本番用家族コードのWorker Secret設定と認証付きAPI確認（GitHub Actions）。
- PR #15の最終マージ。
- GitHub Pages公開と公開後確認。
- 親子2台のAndroid Chromeでの本番同期テスト。Work側では実機未検証。
