# NEON RELAY CH1 Change Plan
## Claude Code CLI 実装用・探索最小化版

Status: **READY_FOR_IMPLEMENTATION**  
Scope: **CH1 only**  
Source of truth: `docs/NEON_RELAY_CH1_DESIGN_GATE.md`

---

## 0. 目的

この計画の目的は、Claude Code CLI が以下を繰り返さないようにすること。

- リポジトリ全体を何度も探索する
- 既に確定した設計判断を再検討する
- CH2以降を誤って変更する
- UI全体を再設計する
- 同じファイルを何度も読み直す
- 不要な検証や全体リファクタを始める

**設計の再議論は禁止。実装だけ行う。**

---

# 1. 参照順序

Claude Code は最初に以下だけ読む。

1. `docs/NEON_RELAY_CH1_DESIGN_GATE.md`
2. `js/app.js`
3. `js/ui.js`
4. `js/data.js`
5. `css/style.css`
6. `package.json`
7. 既存の overlap / Playwright テスト関連ファイル

必要が出るまで、それ以外のファイルを探索しない。

---

# 2. 変更対象

変更してよいファイル:

- `js/app.js`
- `js/ui.js`
- `js/data.js` の CH1 部分のみ
- `css/style.css`
- `package.json` は `ch1:test` script 追加が必要な場合のみ
- `tools/ch1-check.js` 新規作成

必要なら小さなCH1専用ヘルパーを追加してよいが、まず既存構造内で解決する。

---

# 3. 変更禁止

以下は変更禁止。

- CH2以降の `STAGES`
- CH2以降のStory文
- BGM/SFX仕様
- フォント
- 100dvh
- ゼロスクロール
- overlap対策
- 既存評価順ドロワー
- 既存SQLトークン方式の根本構造
- CH2〜CH5のリファクタ
- アヤの本実装
- 横向き対応
- 新フレームワーク導入
- TypeScript化
- ビルドシステム変更

---

# 4. 実装フェーズ

## Phase 1: 現状把握

目的:
CH1に必要な既存フックだけ特定する。

確認項目:

- App初期化関数
- CH1ロード箇所
- 正解分岐
- 不正解分岐
- timeout
- hint / 模範形処理
- Mastery Report生成
- Story Overlay生成
- localStorage保存形式
- run button制御
- Result表示関数

このフェーズでは変更しない。

### 出力メモ

Claude Codeは短く以下だけ内部メモする。

```text
BOOT_ENTRY=
CH1_LOAD=
RUN_CORRECT=
RUN_WRONG=
HINT=
SAVE_PROGRESS=
BUILD_REPORT=
OVERLAY=
```

---

## Phase 2: CH1データ変更

`js/data.js` の CH1 のみ変更。

追加/変更するもの:

- CIVIS側の初期表示用テキスト
- NORA導入会話
- CH1 result story beat
- CH1 `silenceMs`
- CH1 hint text
- CH1専用のstory metadata

### 原則

UI文言はデータへ寄せる。

`app.js` に物語文をハードコードしない。

---

## Phase 3: UI API追加

`js/ui.js` にCH1で必要な最小APIを追加。

必要候補:

```js
showSystemBoot(...)
showAuditPrivilege(...)
showRawQueryMode(...)
showStoryBeat(...)
setRunBtnEnabled(...)
showCh1Hint(...)
```

既存APIで代用できるものは新設しない。

### 禁止

- UIManager全体の再設計
- overlayシステム全面書き換え
- DOM構造の大規模変更

---

## Phase 4: CH1起動フロー

`js/app.js` で CH1 のみ新フローへ。

順序:

```text
CITY STATUS: NORMAL
↓
CIVIS FIELD CONSOLE
QUERY PRIVILEGE: LEVEL 0
↓
ARCHIVE INCIDENT DETECTED
↓
TEMPORARY QUERY PRIVILEGE LEVEL 1
↓
NORA会話
↓
RAW QUERY MODE
↓
CH1 mission
```

### 注意

- 世界設定説明文を追加しない
- SQLが忘れられた社会を説明しない
- プレイヤーが症状から理解する設計を維持する

---

## Phase 5: CH1正解Story Beat

CH1正解時:

```text
R003 UNKNOWN-07
R004 羽鳥イオ
R007 朝霧トウマ
```

を先に表示。

その後、約800〜1000msのStory Beat。

- run button disabled
- 主人公 mood = thinking を使える場合のみ使用
- 「SILENCE」などのラベルは画面に出さない
- CIVISとの矛盾をNORAが説明しない

その後、既存の正解フローへ戻す。

### 重要

Silenceを全章共通化しない。

CH1専用、または `storyBeat.silenceMs` で opt-in にする。

---

## Phase 6: Hint段階化

CH1の失敗回数を記録する。

```text
1失敗: 通常エラー
2失敗: 概念ヒント
3失敗: 構造ヒント
4失敗: 穴埋め
5失敗: 完全形
```

CH1以外の既存hint挙動は今回変更しない。

### 評価分類

- 0〜1回程度で自力成功: `INDEPENDENT`
- ヒント使用後成功: `ASSISTED`
- 完全形参照: `PRACTICE`

実装では「失敗回数」と「どの支援段階を表示したか」を分けて持つ方が安全。

---

## Phase 7: Story Clear / Mastery分離

既存progressを壊さずにCH1へclear typeを追加。

優先方針:

既存キーを残し、追加フィールドで拡張する。

例:

```json
{
  "clearedStages": [
    {"stage":0,"type":"INDEPENDENT"}
  ]
}
```

### Masteryルール

- INDEPENDENT: mastered候補
- ASSISTED: clearだがmasteredではない
- PRACTICE: clearだがmasteredではない

既存の `cleared[stage] === true` だけでMastery判定しない。

ただしCH2以降の既存保存データを壊さない。

---

## Phase 8: CSS

追加はCH1演出に必要な最小限。

必要候補:

- system boot panel
- privilege log
- raw query transition
- story beat result emphasis
- disabled state
- reduced motion fallback

### 禁止

- 全テーマ再設計
- 色設計全面変更
- 既存Token UI再配置
- 100dvh破壊

---

# 5. 実装順序

Claude Codeは以下の順で作業する。

```text
1. 現状把握
2. data.js CH1
3. ui.js API
4. app.js CH1 flow
5. hint段階化
6. progress/mastery
7. CSS
8. ch1-check.js
9. syntax check
10. targeted CH1 test
11. overlap
12. 差分監査
```

順番を飛ばして全体変更しない。

---

# 6. テスト計画

## Static

```bash
node --check js/app.js
node --check js/ui.js
node --check js/data.js
```

## CH1 Playwright

`tools/ch1-check.js` で最低限確認:

1. 起動時に `CITY STATUS: NORMAL`
2. `CIVIS FIELD CONSOLE`
3. `QUERY PRIVILEGE: LEVEL 0`
4. 監査異常ログ
5. `LEVEL 1`
6. RAW QUERY MODEへ到達
7. CH1を正解させる
8. R003 / R004 / R007 が表示
9. Story Beat中 run disabled
10. Story Beat後に通常フローへ戻る
11. 失敗回数に応じてCH1 hintが段階化
12. 完全形参照時は `PRACTICE`
13. 自力成功時は `INDEPENDENT`

## Existing Regression

```bash
npm run overlap
```

既存テストがあれば、CH1変更による破壊がない範囲で実行。

---

# 7. Human Visual Gate

自動テストPASSだけでは完了にしない。

iPhone実機で次を確認する。

1. 市職員端末を触っている感覚がある
2. NORAが教師に見えない
3. WHERE成功時、「正解した」より「R003がいた」が先に来る
4. CIVISとの矛盾に自分で気づく
5. Hintが思考支援になっている
6. 自力・補助・練習の差が納得できる

### Gate

```text
AUTO_TEST = PASS
HUMAN_VISUAL_GATE = PASS
```

の両方が揃うまでCH2以降へ進めない。

---

# 8. Claude Code 出力制約

完了報告は長文にしない。

以下だけ出す。

```text
CH1_IMPLEMENTATION = PASS/FAIL
SYNTAX = PASS/FAIL
CH1_TEST = PASS/FAIL
OVERLAP = PASS/FAIL
CH2_PLUS_CHANGED = NO/YES

Changed:
- ...
- ...

Human Visual Gate:
- NOT RUN
```

問題があれば、推測で修正を広げず、

```text
BLOCKER=
EVIDENCE=
MINIMUM_NEXT_ACTION=
```

で止める。

---

# 9. Stop Conditions

以下が起きたら作業を止める。

- CH2以降の変更が必要になった
- 既存データ形式を破壊しないと進められない
- 100dvh維持が不可能
- overlap regressionsが出た
- CH1だけでは解決できない設計矛盾を発見した
- アヤ実装が必要になった
- 新規依存ライブラリが必要になった

勝手にスコープ拡大しない。

---

# 10. Definition of Done

```text
DESIGN_GATE = PASS
IMPLEMENTATION_SCOPE = CH1_ONLY

Required:
- CH1 boot flow implemented
- RAW QUERY transition implemented
- R003 discovery story beat implemented
- CH1 staged hints implemented
- Story Clear / Mastery distinction implemented
- ch1-check.js PASS
- syntax checks PASS
- overlap PASS
- CH2+ untouched

After code completion:
HUMAN_VISUAL_GATE = NOT_RUN
```

コード実装完了は最終完了ではない。
次工程はiPhone実機でHuman Visual Gateを行うこと。
