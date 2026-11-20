# 親子同期の本番公開・初回同期

更新日: 2026-11-20

## 公開状況

- GitHub Pages: [HARUKI BASKETBALL QUEST](https://kota0317.github.io/haruki-basketball-quest/)。公開ページをブラウザで確認済み。
- PR #15 は main へマージ済み（merge commit `e03685a7215b92ad14b438d13f62effd5127ecb7`）。
- 本番Worker: `haruki-production-inactive-44733572133`。
- 本番API: `https://haruki-production-inactive-44733572133.schef07apremium-c.workers.dev`。
- 再利用D1: `haruki-sync-qa-44663546163` / UUID `31dc86e4-3cc5-42dc-a738-5a9a6259747f`。
- GitHub Environment `haruki-production` の `HARUKI_FAMILY_CODE` は本番Worker secretとして設定済み。デプロイworkflowの形式検証と認証付きGETを通過。[本番Workerデプロイ](https://github.com/kota0317/haruki-basketball-quest/actions/runs/44741067054)
- D1はデプロイ前後の直接読取で `revision=0 / body=NULL`。本番初回同期データはまだ投入していない。
- 本番デプロイに追加課金や既存D1の削除・初期化は行っていない。D1棚卸しは [D1-INVENTORY-2026-11-20.md](D1-INVENTORY-2026-11-20.md)。

## データと初回同期の安全性

ユーザー確認により、現時点のハルキ本番アプリに保護対象の学習記録はありません。実端末JSONバックアップの取得、隔離復元、既存履歴の移行は今回の公開条件から除外しました。JSONバックアップ・復元機能は今後のために維持します。

アプリは学習メニュー・履歴・XP/レベル・英検・ゲーム進捗を端末内に保存し、同じ家族コードでWorkers＋D1に同期します。空のD1と、記録のない新規端末なら空の状態から同期できます。端末に想定外の記録がある状態でD1が空の場合は、自動アップロードせず初回同期を停止します。双方に記録があれば既存の比較・手動解決を使います。削除・初期化は行いません。

## 検証結果

- [PR #15 regression audit](https://github.com/kota0317/haruki-basketball-quest/actions/runs/44740563248) 成功。クエスト、学習履歴、XP、英検、ゲーム、オープニング動画、バックアップ比較・復元、同期を合成データで回帰確認。
- [2ブラウザ親子同期](https://github.com/kota0317/haruki-basketball-quest/actions/runs/44740285044) 成功。親側追加・編集、子側完了、XP/履歴、更新後保持、オフライン復帰、競合手動解決を確認。
- [本番Worker認証確認](https://github.com/kota0317/haruki-basketball-quest/actions/runs/44741067054) 成功。Secretをログ表示せず、Family Codeで空のD1 snapshotを読み戻した。
- Android実機2台での今回の本番公開後操作は未検証。Workから実機を操作していない。

## 親子Androidでの初回操作

1. 親とハルキのAndroid Chromeで本番Pages URLを開く。
2. 「GROWTH」→「管理・バックアップ」を開き、「親子同期」欄を確認する。
3. ユーザーが保管している5桁の家族コードを両端末に入力し、「同期を開始」を押す。コードはチャット、PR、画面共有へ記載しない。空の新規端末ならJSONバックアップ確認なしで開始できる。
4. 同期ステータスが「同期済み」になり、両端末のメニュー一覧が同じであることを確認する。
5. 親側でテスト用ではない通常のクエストを1件追加し、ハルキ側で表示されることを確認する。ハルキ側で完了し、親側で完了履歴・XP/レベルが反映されることを確認する。ページを更新し、記録が維持されることも確認する。
6. その後オフライン復帰と同時編集の動作を確認する。想定外の記録差分が出た場合は空D1へ無理に同期せず、比較・手動解決へ進む。

## 未完了項目

- 親子それぞれのAndroid Chromeで家族コード入力・本番同期を実行すること。
- 親のクエスト追加がハルキに、ハルキの完了・学習結果が親に反映されることを実機で確認すること。
- 実機でのオフライン復帰・同時編集・ページ再読み込みを確認すること。
- Workの合成データ試験は上記実機確認の代替ではない。
