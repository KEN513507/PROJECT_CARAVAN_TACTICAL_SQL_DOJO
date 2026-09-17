````markdown
# NEON RELAY CH1 Validation & UX Decoder Plan

## Claude Code CLI 実装用・探索最小化版

Status: **READY_FOR_IMPLEMENTATION**

Scope: **CH1 validation / UX automation only**

Current phase: **PHASE 2 VALIDATION**

Source of truth:

- `docs/NEON_RELAY_CH1_DESIGN_GATE.md`
- current CH1 runtime implementation
- current `ChapterSession` behavior
- current CH1 mobile UI behavior
- current automated tests

---

# 0. 目的

この計画の目的は、既に実装済みの CH1 を再実装することではない。

現在の CH1 を壊さずに、

- モバイルUIの機械検証
- 状態遷移の機械検証
- UI Contract の機械検証
- スクリーンショット証拠保存
- FAIL / WARN の自動集約
- 人間による長時間テストの削減

を実現する。

最終目標は、

```text
人間が毎回30分以上かけて
スクリーンショット確認・操作確認・言語化
↓
機械が20〜30秒程度で大部分を監査
↓
人間は最終的な体験判断だけ行う
````

という開発フローへ移行すること。

---

# 1. 現在地

現在の全体ロードマップは以下。

```text
PHASE 1
FOUNDATION REPAIR
= DONE

PHASE 2
CH1 IMPLEMENTATION / MOBILE UI
= IMPLEMENTED
= CURRENTLY VALIDATING

CURRENT TASK
L1 UX DECODER
├─ Transition Audit
├─ Contract Audit
├─ Screenshot Artifacts
└─ Combined Report

NEXT
Human UX Gate

AFTER
CH2
```

今回の作業では CH1 の物語・SQL仕様・レイアウトを再設計しない。

---

# 2. 既に実装済みとして扱うもの

以下は今回の TODO ではない。

* `ChapterSession`
* CH1 の Domain state
* CH1 の staged hints
* Story Clear / Mastery 分離
* INDEPENDENT / ASSISTED / PRACTICE
* CH1 の Query Workspace
* CH1 の Evidence Workspace
* Prediction Overlay
* Prediction Cancel
* Token Pad の残余領域化
* NORA / Hint の一時 Overlay / Sheet 化
* Evidence時の Token Pad 非表示
* CH1 mobile layout
* iPhone SE / iPhone 16e 対応
* CH1 timeout / retry
* CH1 Evidence flow
* CH1 result rows
* CH1 → CH2 transition

これらは新規実装対象ではなく、
**Regression Contract** として扱う。

---

# 3. 今回の原則

## 3.1 再設計禁止

以下を再議論・再実装しない。

* CH1 Story
* CH1 Mission
* CH1 SQL semantics
* CH1 Token構造
* CH1 Mastery仕様
* NORAの人格
* Evidence内容
* Predictionの存在
* CH1 2-Workspace設計
* UI theme
* 色設計
* BGM/SFX
* フォント
* 100dvh
* zero-scroll

---

## 3.2 CH2以降変更禁止

今回の対象は CH1 の検証基盤のみ。

以下を変更しない。

* CH2〜CH5 `STAGES`
* CH2〜CH5 Story
* CH2〜CH5 Mission
* CH2〜CH5 Hint
* CH2〜CH5 Mastery
* CH2〜CH5 UI
* CH2 SQL redesign
* real SQL engine
* sql.js
* Aya 本実装

---

## 3.3 Domain汚染禁止

`ChapterSession` にテスト専用メソッドを追加しない。

禁止例:

```js
session.forceTimeout()
session.jumpToEvidence()
session.setTestMode()
```

テスト事情は、

```text
App layer
Effects layer
Test harness
```

だけが知る。

---

# 4. 参照順序

Claude Code は最初に以下だけ読む。

```text
1. docs/NEON_RELAY_CH1_DESIGN_GATE.md
2. js/chapter-session.js
3. js/app.js
4. js/ui.js
5. css/style.css
6. tools/ch1-mobile-check.js
7. tools/overlap-check.js
8. tools/session-test.js
9. package.json
```

必要になるまでリポジトリ全体を探索しない。

CH2以降の詳細ファイルを探索しない。

---

# 5. 今回変更してよいファイル

```text
js/app.js

tools/ux-contracts.json
tools/ux-test-helpers.mjs
tools/ux-decoder-a.mjs
tools/ux-decoder-b.mjs
tools/ux-run-all.mjs

package.json
```

必要なら、

```text
tools/ux-artifacts/
```

を実行時生成する。

---

# 6. 原則変更禁止ファイル

以下は今回変更しない。

```text
js/chapter-session.js
js/data.js
js/ui.js
css/style.css

tools/ch1-mobile-check.js
tools/overlap-check.js
tools/session-test.js
```

ただし、実装上どうしても既存DOM selectorとの不一致が見つかった場合は、
勝手に修正せず Stop Condition で止める。

---

# 7. Git禁止

今回、Git操作を一切しない。

禁止:

```text
git add
git commit
git push
git pull
git merge
git rebase
git reset
git checkout
git switch
git stash
git clean
```

Claude Code自身、
sub-agent、
hook、
補助スクリプトを含めて禁止。

作業ツリー編集とテスト実行だけ行う。

---

# 8. L1 UX Decoder の構成

今回、2種類の Decoder を常設する。

競争ではない。

役割が異なる。

```text
A = Transition Audit
B = Contract Audit
```

両方の検出結果を UNION する。

---

# 9. Decoder A: Transition Audit

ファイル:

```text
tools/ux-decoder-a.mjs
```

目的:

実プレイヤーに近い順序で CH1 を進め、
状態遷移が正しい順番で発生することを監査する。

主な確認:

```text
AWAITING_QUERY
↓
QUERY_DRAFTING
↓
AWAITING_PREDICTION
↓
QUERY_EXECUTING
↓
EVIDENCE_REVEALED
↓
CHAPTER_CLEARED
```

また、誤答経路も確認する。

```text
QUERY_EXECUTING
↓
QUERY_REJECTED
↓
QUERY_DRAFTING
```

確認項目:

* Phase順序
* `body.dataset.phase`
* `body.dataset.workspace`
* Prediction出現
* Prediction Cancel
* wrong → retry
* Hint state
* Timeout path
* Evidence transition
* Evidence silence
* Chapter clear
* CH1 → CH2 minimum regression

---

# 10. Decoder B: Contract Audit

ファイル:

```text
tools/ux-decoder-b.mjs
```

目的:

各状態で UI Contract が守られているかを高速検査する。

主な確認:

```text
visible
hidden
position
size
tap target
viewport
scroll
overlay
layout shift
area ratio
```

遷移順序は B の責務ではない。

---

# 11. Observability

## 11.1 body.dataset.phase

`App` が `ChapterSession` の PhaseChanged を購読し、
観測用として DOM に出す。

例:

```js
this.session.on('PhaseChanged', ({ to }) => {
  document.body.dataset.phase = to;

  if(this.stage === 0){
    document.body.dataset.workspace =
      WORKSPACE_BY_PHASE[to] || 'query';
  }
});
```

---

## 11.2 責務

```text
data-phase
= observability / test only

data-workspace
= presentation
```

CSS は `data-phase` を参照してはいけない。

禁止:

```css
body[data-phase="QUERY_DRAFTING"] ...
```

Presentation は `data-workspace` のみ使う。

---

# 12. Test Mode

テスト時のみ App 層へ test hook を公開してよい。

本番ユーザー向け機能ではない。

有効条件:

```js
window.__NEON_TEST_CONFIG__?.enabled === true
```

---

# 13. Test Hook

`js/app.js` にテストモード時のみ以下を公開してよい。

```js
window.__NEON_TEST__ = {
  forceTimeout: () => {
    this.stopTimer();
    this.timeLeft = 0;
    this.timeout();
  },

  jumpToEvidence: () => {
    this._jumpToEvidenceForTest();
  },

  getPhase: () => this.session.phase,

  getWorkspace: () => document.body.dataset.workspace
};
```

`getSession()` は原則公開しない。

Decoder が Domain object を直接操作しないため。

---

# 14. jumpToEvidenceForTest

必要な場合だけ App 層に CH1専用 test helper を追加する。

条件:

* CH1限定
* 本番と同じ public flow を通す
* Domain field を直接書き換えない
* ChapterSession内部状態を直接 mutate しない

概念:

```js
_jumpToEvidenceForTest(){
  // CH1 正解Queryを通常の token API 経由で構築
  // submit
  // prediction submit
  // executeRun
}
```

直接、

```js
this.session.phase = ...
```

のような操作は禁止。

---

# 15. Timeout高速化

60秒待たない。

Decoderでは、

```js
window.__NEON_TEST__.forceTimeout()
```

を使用する。

ただし呼ばれる本体処理は必ず既存の、

```js
this.timeout()
```

であること。

Timeout専用の別ロジックを作らない。

---

# 16. Evidence Silence

本番仕様:

```text
800ms
```

を維持する。

本番値は変更しない。

テスト時のみ、

```js
window.__NEON_TEST_CONFIG__ = {
  enabled: true,
  evidenceSilenceMs: 5000
};
```

を許可する。

App / Effects側でのみ使用する。

例:

```js
const silenceMs =
  window.__NEON_TEST_CONFIG__?.enabled
    ? window.__NEON_TEST_CONFIG__.evidenceSilenceMs ?? 800
    : 800;
```

---

# 17. Production Silence Contract

`ux-contracts.json` に、

```json
{
  "productionSilenceMs": 800,
  "testSilenceMs": 5000
}
```

を明記する。

Test実行時の5000msと、
本番仕様800msを混同しない。

---

# 18. Contract ファイル

ファイル:

```text
tools/ux-contracts.json
```

役割:

```text
Contract = What
Decoder = How
```

期待値だけを書く。

測定アルゴリズムを書かない。

---

# 19. Viewports

最低限:

```json
{
  "iphone-se": {
    "width": 375,
    "height": 667
  },
  "iphone-16e": {
    "width": 393,
    "height": 852
  }
}
```

必要なら将来、

```text
430x932
```

を追加できる構造にする。

今回は必須ではない。

---

# 20. State Contracts

最低限以下を持つ。

```text
INSPECT
COMPOSE
PREDICTION
WRONG
HINT
TIMEOUT
EVIDENCE_SILENCE
EVIDENCE_FINAL
CH2_ENTRY
```

---

# 21. INSPECT Contract

期待:

```text
phase = AWAITING_QUERY
workspace = query
```

表示必須:

```text
#schemaPanel
#monitor
#tokenPad
#runBtn
```

非表示:

```text
#resultPanel
prediction overlay
```

条件:

```text
Token Pad height >= 180px
page scroll = false
primary tap targets >= 44px
```

---

# 22. COMPOSE Contract

期待:

```text
phase = QUERY_DRAFTING
workspace = query
```

表示:

```text
Schema
Query Monitor
Token Pad
Run
```

条件:

```text
Token Pad >= 180px
Query Monitor visible
page scroll = false
tap target >= 44px
```

---

# 23. PREDICTION Contract

期待:

```text
workspace = query
```

表示必須:

```text
Prediction overlay
Prediction choices
Cancel
```

条件:

```text
all choices >= 44px
all choices inside viewport
all choices topmost
background input blocked
page scroll = false
```

---

# 24. WRONG Contract

1回目の誤答状態。

確認:

```text
Query remains visible
Correction path exists
Retry possible
No full answer shown
No page scroll
```

誤答1回で PRACTICE にしない。

---

# 25. HINT Contract

中間Hint。

確認:

```text
Hint visible
Query remains inspectable
Schema remains available when expected
Hint does not permanently consume layout
No full model answer unless assistanceLevel = 4
```

---

# 26. TIMEOUT Contract

確認:

```text
Timeout sheet visible
Full SQL visible
Retry visible
PRACTICE state preserved
Main layout not permanently collapsed
```

Timeout後にRetryして正解しても、

```text
PRACTICE
```

であること。

---

# 27. EVIDENCE_SILENCE Contract

期待:

```text
phase = EVIDENCE_REVEALED
workspace = evidence
```

表示:

```text
Result
Executed Query if current design shows it
```

非表示:

```text
Token Pad
Utility
Hint
```

条件:

```text
page scroll = false
Result is dominant
NORA interpretive text not yet visible
```

Result area ratio は現行UIを実測してから契約値を確定する。

勝手に 0.4 と決め打ちしない。

---

# 28. EVIDENCE_FINAL Contract

期待:

```text
phase = CHAPTER_CLEARED
workspace = evidence or current intended final workspace
```

確認:

```text
R003 visible
R004 visible
R007 visible
clear result readable
continue path visible
Token Pad hidden
```

---

# 29. CH2 Entry Regression

CH2の詳細検証は今回しない。

CH1変更がCH2を壊していないことだけ確認する。

最低限:

```text
CH2 title visible
CH2 Token Pad visible
SELECT token tappable
CH1-only workspace CSS not leaking
```

CH2 SQLを最後まで解かない。

---

# 30. Tap Target

基本条件:

```text
minimum touch target = 44px
recommended = 48px
```

測定対象:

```text
enabled tokens
run
hint
undo
prediction choices
prediction cancel
retry
continue
```

disabled要素はtap対象判定から除外する。

---

# 31. Topmost 判定

ボタンが見えているだけではPASSにしない。

中央座標等で、

```js
document.elementFromPoint(...)
```

を使用し、

実際に対象要素が最前面でクリック可能か確認する。

Predictionで特に必須。

---

# 32. Viewport 判定

各主要操作要素について、

```text
top >= 0
left >= 0
right <= viewport width
bottom <= viewport height
```

を検査する。

Safe Areaを考慮した実測が必要な場合は、
Browser Context上の実際のviewportを基準にする。

---

# 33. Page Scroll

基本契約:

```text
document.documentElement.scrollHeight
<=
window.innerHeight + tolerance
```

tolerance:

```text
1〜2px
```

程度。

---

# 34. NORA Layout Shift

NORAの面積比では判定しない。

目的は、

```text
NORAが通常Workspaceを押し潰していないか
```

を見ること。

表示前に保存:

```text
schema rect
monitor rect
tokenPad rect
actionBar rect
```

NORA表示後に再計測。

契約:

```text
max position shift <= 1px
max height shift <= 1px
```

NORA自体がOverlayとして大きく表示されることは問題にしない。

---

# 35. Screenshot

スクリーンショットは比較対象ではない。

L1では pixel diff を行わない。

DOM全文diffも行わない。

用途:

```text
FAIL/WARNの証拠
```

保存先:

```text
tools/ux-artifacts/
```

---

# 36. Screenshot States

最低限:

```text
INSPECT
COMPOSE_START
COMPOSE_COMPLETE
PREDICTION
WRONG
HINT
TIMEOUT
EVIDENCE_SILENCE
EVIDENCE_FINAL
CH2_ENTRY
```

各viewportで保存する。

---

# 37. Artifact policy

人間は毎回すべての画像を見ない。

原則:

```text
PASS screenshot
→ 見ない

WARN screenshot
→ 必要時のみ見る

FAIL screenshot
→ 確認する
```

Human workload を増やさない。

---

# 38. Shared Helper

ファイル:

```text
tools/ux-test-helpers.mjs
```

最低限提供:

```js
measureRect()
isVisible()
isInViewport()
isTopmost()
measureTapTarget()
checkPageScroll()
checkContract()
captureArtifact()
summarize()
```

必要なら、

```js
waitForPhase()
waitForWorkspace()
```

も追加。

---

# 39. Contract evaluation

`checkContract()` は以下を解釈する。

```text
phase
workspace
mustBeVisible
mustBeHidden
minHeight
minAreaRatio
minTapHeight
pageScroll
overlayBlocksBackground
```

未定義項目はスキップ。

---

# 40. FAIL / WARN

FAIL と WARN を分離する。

## FAIL

明確な契約違反。

例:

```text
button not tappable
viewport overflow
page scroll
required element missing
wrong phase
wrong workspace
Token Pad below minimum
Prediction background interactive
Mastery mismatch
```

## WARN

人間確認候補。

例:

```text
disabled token contrast low
result area only slightly above threshold
text density high
```

L1では主観評価をFAILにしない。

---

# 41. Exit Code

```text
FAIL_COUNT > 0
→ exit 1

FAIL_COUNT = 0
→ exit 0
```

WARNだけなら exit 0。

---

# 42. Decoder A Output

保存:

```text
tools/ux-artifacts/a/
```

例:

```text
tools/ux-artifacts/a/iphone-se/
tools/ux-artifacts/a/iphone-16e/
tools/ux-artifacts/a/report.json
tools/ux-artifacts/a/report.md
```

---

# 43. Decoder B Output

保存:

```text
tools/ux-artifacts/b/
```

例:

```text
tools/ux-artifacts/b/iphone-se/
tools/ux-artifacts/b/iphone-16e/
tools/ux-artifacts/b/report.json
tools/ux-artifacts/b/report.md
```

---

# 44. Combined Runner

ファイル:

```text
tools/ux-run-all.mjs
```

A → B を実行し、
結果を統合する。

競争判定はしない。

---

# 45. Combined classification

分類:

```text
bothDetected
aOnly
bOnly
```

意味:

```text
bothDetected
= A/B両方が検出

aOnly
= Transition Auditのみ検出

bOnly
= Contract Auditのみ検出
```

---

# 46. neither は今回実装しない

現在、既知bug injection集合が存在しない。

そのため、

```text
neither
```

を正確に算出できない。

今回のreportに `neither` を作らない。

---

# 47. 将来の検出率テスト

今回は実装しない。

将来Sprintで、

```text
tools/ux-bug-injection.mjs
```

を検討する。

目的:

```text
known bugs = N

detection rate
=
detected known bugs / N
```

また、

```text
false positive rate
```

も測定する。

現在はTODOコメントだけ残してよい。

---

# 48. Server

Decoder自身はHTTP serverを起動しない。

外部で起動済みであることを前提にする。

デフォルト:

```text
http://127.0.0.1:8000/
```

環境変数:

```text
UX_BASE_URL
```

を許可する。

---

# 49. Server unavailable

接続不能の場合、

長いstack traceだけを出さない。

明示的に:

```text
UX_DECODER = FAIL
REASON = server unavailable
URL = ...
```

を出して exit 1。

---

# 50. Test Mode Injection

重要:

`window.__NEON_TEST_CONFIG__` は
App起動前に存在していなければならない。

Playwrightでは、

```js
page.addInitScript(...)
```

を優先する。

`goto()` 後にsetしてreloadする方式は避ける。

例:

```js
await page.addInitScript(() => {
  window.__NEON_TEST_CONFIG__ = {
    enabled: true,
    evidenceSilenceMs: 5000
  };

  localStorage.setItem('caravan_intro_seen', 'true');
  localStorage.setItem('caravan_tutorial_seen', 'true');
});
```

その後、

```js
await page.goto(BASE_URL);
```

---

# 51. Existing test compatibility

既存:

```text
tools/ch1-mobile-check.js
tools/overlap-check.js
tools/session-test.js
```

は今回変更しない。

Decoder実装後も一度実行する。

新Decoderが既存検査を置換したと即断しない。

---

# 52. package.json

追加:

```json
{
  "scripts": {
    "ux:decode:a": "node tools/ux-decoder-a.mjs",
    "ux:decode:b": "node tools/ux-decoder-b.mjs",
    "ux:decode:all": "node tools/ux-run-all.mjs"
  }
}
```

既存 script は削除しない。

`"type": "module"` は追加しない。

---

# 53. Module format

今回追加するtoolsは `.mjs`。

```text
tools/ux-test-helpers.mjs
tools/ux-decoder-a.mjs
tools/ux-decoder-b.mjs
tools/ux-run-all.mjs
```

本番コード:

```text
js/*.js
```

は変更しない。

---

# 54. 実装順序

Claude Codeは以下の順で作業する。

```text
1. current-state audit
2. selector確認
3. data-phase observability追加
4. App test hook追加
5. silence timing injection
6. ux-contracts.json
7. ux-test-helpers.mjs
8. ux-decoder-a.mjs
9. ux-decoder-b.mjs
10. ux-run-all.mjs
11. package.json
12. syntax validation
13. existing tests
14. Decoder A
15. Decoder B
16. Combined runner
17. diff audit
18. stop
```

---

# 55. current-state audit

最初に短く確認する。

```text
PHASE_SOURCE=
WORKSPACE_SOURCE=
TIMEOUT_ENTRY=
EVIDENCE_ENTRY=
EVIDENCE_DELAY=
PREDICTION_SELECTOR=
TOKEN_SELECTOR=
RESULT_SELECTOR=
NORA_OVERLAY_SELECTOR=
ACTION_BAR_SELECTOR=
CH2_ENTRY_SIGNAL=
```

このメモを根拠に実装する。

同じファイルを何度も探索しない。

---

# 56. Selector Drift

計画中のselector名をそのまま信じない。

現在DOMを確認する。

例えば、

```text
#predictModal
```

ではなく、

```text
#predictBar
```

等が現行の場合は、
現行DOMをSource of Truthとする。

ただしDOMを計画に合わせるために変更しない。

Decoder側を現行DOMへ合わせる。

---

# 57. Syntax validation

本番JS:

```bash
node --check js/app.js
```

Tools `.mjs`:

```bash
node --check tools/ux-test-helpers.mjs
node --check tools/ux-decoder-a.mjs
node --check tools/ux-decoder-b.mjs
node --check tools/ux-run-all.mjs
```

Nodeが `.mjs` の `--check` を受け付ける環境ならそのまま使用する。

不要な代替コマンドを作らない。

---

# 58. Existing regression

最低限:

```bash
node tools/session-test.js
node tools/ch1-mobile-check.js
npm run overlap
```

既存script名が違う場合は `package.json` を確認し、
存在するものだけ実行。

---

# 59. Decoder execution

前提:

HTTP server 起動済み。

実行:

```bash
npm run ux:decode:a
npm run ux:decode:b
npm run ux:decode:all
```

---

# 60. Human UX Gate

L1 Decoder PASS後のみ実行。

人間テストは長文化しない。

最終的に以下3問だけ。

```text
1. SQL入力は苦痛だったか？
   YES / NO

2. R003を見て、自分で違和感に気づいたか？
   YES / NO

3. 続きを調べたいと思ったか？
   YES / NO
```

補足が必要な場合だけ1〜2行書く。

---

# 61. Human Gate 判定

目標:

```text
1 = NO
2 = YES
3 = YES
```

ただしこれは自動判定しない。

人間の体験評価として残す。

---

# 62. L2 Vision

今回実装しない。

将来必要になった場合のみ、

```text
npm run ux:vision
```

相当を別系統で作る。

Vision API は、

```text
PASS / FAIL判定者
```

にはしない。

役割:

```text
WARN候補生成
```

のみ。

---

# 63. Definition of Done

今回のL1 Decoder作業完了条件:

```text
DATA_PHASE_OBSERVABILITY = PASS

TEST_HOOK = PASS

PRODUCTION_SILENCE_800MS = PRESERVED

UX_CONTRACTS = PASS

DECODER_A_TRANSITION_AUDIT = PASS

DECODER_B_CONTRACT_AUDIT = PASS

COMBINED_REPORT = PASS

EXISTING_SESSION_TEST = PASS

EXISTING_CH1_MOBILE_TEST = PASS

OVERLAP = PASS

CH2_PLUS_CHANGED = NO

GIT_WRITE = NO
```

---

# 64. 今回の完了後

コード完了時点では、

```text
HUMAN_UX_GATE = NOT_RUN
```

とする。

次工程は人間による最終3問のみ。

CH2へ自動的に進まない。

---

# 65. Stop Conditions

以下の場合は勝手に修正範囲を広げず停止する。

```text
ChapterSession変更が必要
CH2以降変更が必要
DOM大規模変更が必要
CSS再設計が必要
新規依存追加が必要
100dvh変更が必要
既存Mastery仕様変更が必要
SQL engine変更が必要
Git操作が必要
```

その場合:

```text
BLOCKER=
EVIDENCE=
MINIMUM_NEXT_ACTION=
```

だけ報告。

---

# 66. Claude Code 完了報告

長文禁止。

以下のみ出す。

```text
L1_UX_DECODER = PASS/FAIL

DATA_PHASE = PASS/FAIL
TEST_HOOK = PASS/FAIL
PRODUCTION_SILENCE = PASS/FAIL

DECODER_A = PASS/FAIL
DECODER_B = PASS/FAIL
COMBINED_REPORT = PASS/FAIL

SESSION_TEST = PASS/FAIL
CH1_MOBILE_TEST = PASS/FAIL
OVERLAP = PASS/FAIL

CH2_PLUS_CHANGED = NO/YES
GIT_WRITE = NO/YES

Changed:
- ...
- ...

Artifacts:
- ...

Human UX Gate:
- NOT RUN
```

問題がある場合だけ:

```text
BLOCKER=
EVIDENCE=
MINIMUM_NEXT_ACTION=
```

を追加。

---

# 67. 最終原則

今回の目的は、

```text
CH1をもう一度作ること
```

ではない。

目的は、

```text
CH1を機械的に監査できるようにすること
```

である。

また、

```text
AとBのどちらが優秀か決める
```

ことも目的ではない。

```text
A = 遷移の盲点を減らす
B = 状態契約の盲点を減らす
```

この2つを併用する。

最終的に、

```text
機械:
操作性
状態遷移
UI契約
回帰

人間:
没入感
発見感
継続意欲
```

へ責務を分離する。

---

# 68. 最終状態

このPlanが完了した時点で、

```text
CH1_IMPLEMENTATION
= COMPLETE

CH1_L1_AUTOMATED_VALIDATION
= COMPLETE

CH1_HUMAN_UX_GATE
= NOT_RUN
```

とする。

Human UX Gate PASS後に、
初めて CH1 を正式FIX扱いにする。

その後に CH2 へ進む。

```
```
