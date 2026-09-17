# NEON RELAY ― FE + RTP IMPLEMENTATION ALIGNMENT

```text
SPRINT: FE + RTP IMPLEMENTATION ALIGNMENT GATE v2
STATUS: SSOT (この文書の内容が現行の正。これ以前の章編成・問題数の記述は上書きされる)
DATE:   2026-09-17
```

---

## 1. USER INTENT

ユーザー本人が近いうちに基本情報技術者試験（FE）を受験する。したがってNEON RELAYは独自性のあるゲームであるだけでは不十分であり、FEのSQL / Database理解に実際の学習価値を持つ必要がある。

ただし `NEON RELAY ≠ FE試験全体の完全対策アプリ`。役割は二層。

```text
LAYER A : FE SQL COMPETENCY          試験で通用するSQL能力
LAYER B : RELATIONAL INVESTIGATION   関係を構成して事実を導出するゲーム性
```

両層は対立しない（§7）。

---

## 2. OFFICIAL FE SCOPE（IPA公式で確認した事実）

過去のLLM説明は根拠として採用していない。以下はIPA公式ページで今回確認した内容。

| 確認項目 | 結果 | 出典 |
|---|---|---|
| FE現行シラバス版 | **Ver.9.2**（2026年1月8日掲載・現在有効） | IPA 試験要綱・シラバスについて |
| Ver.9.1 → 9.2 の変更内容 | 「下請法」削除／「中小受託取引適正化法」追加のみ。**Database / SQL 範囲に変更なし** | 同上 |
| データベース分野の構成 | 中分類9 データベース ＝ データベース方式 / データベース設計 / **データ操作** / トランザクション処理 / データベース応用 | IPA シラバス |
| 新試験制度 | **2027年度**開始予定。FEのシラバス案は「準備中」で未公開 | IPA 新試験制度のシラバス案について（2026-06-30） |
| 受験への影響 | ユーザーの直近受験は**現行シラバス（Ver.9.2）が適用**される | 同上 |

### 検証の限界（正直な記録）

IPA公式シラバスPDF（`syllabus_fe_ver9_1.pdf` / `shiken_yougo_ver4_3.pdf`）は `/Encrypt /Filter/Standard /V 2`（コピー制限付き）であり、本環境ではテキスト抽出できなかった。DRM回避は行っていない。

したがって**小分類「データ操作」配下の 用語例 の完全な逐語リストは未検証**である。

対応方針: 本Sprintの実装対象は、FE Level 2のデータ操作範囲として疑義のない中核項目のみに限定する。疑義のある項目（相関副問合せ等）は `NOT_COVERED` に置き、スコープ判断が未検証情報に依存しないようにした。

補強証拠として、リポジトリ内に実在のFE出題が1件ある（`js/data.js` EXAM_QUESTIONS）。

```text
基本情報技術者試験 令和7年度 科目A 問6
SELECT * FROM 商品 WHERE 仕入先ID IN ('M002','M004')
→ 同じ結果になるSELECT文を選ぶ（正解: OR による書き換え）
```

これはFEが `WHERE` / `IN` / 論理演算子 / 同値なクエリの判断 を実際に問うことの直接証拠である。

---

## 3. RTP SCOPE

`docs/NEON_RELAY_RELATIONAL_TRUTH_PRINCIPLE.md`（STATUS: ACTIVE / SCOPE: ALL CHAPTERS）を本Sprintで書き直さない。維持する中核:

```text
RAW DATA     = 世界の断片
SQL          = 断片同士に関係を定義する操作
DERIVED FACT = 関係演算によって初めて成立する事実
SCALE        ≠ ROW COUNT   /   SCALE = RELATIONAL COMPLEXITY
```

**RTPの本質は「行数が多くて目視できないこと」ではない。** 複数行・複数集合・複数時点・複数表・対応関係・不存在をSQLで構成しないと確定できない事実を作ることである。データ規模は補助要素にすぎない。

---

## 4. FE COVERAGE CONTRACT

各STEPは以下の契約を持つ。`NOT_COVERED` は未実装一覧ではなく **Chapter Scope Contract** であり、スコープ膨張を防ぐために使う。

```text
STEP:
  FE_SYLLABUS:   その STEP で実際に学習対象とするFE能力
  RTP_TARGET:    そのSQL概念を「世界を見るレンズ」としてどう扱うか
  NOT_COVERED:   その STEP では意図的に扱わない概念
```

---

## 5. STEP LADDER（SSOT・ステップバイステップ level design）

**4問編成の固定を解除する。** 学習は1ステップ1概念で積み上げる。

全STEPは**既存の正史テーブル6表のみ**を使う。新しい物語事実・新テーブルを発明しないため Story Canon 変更を伴わない。

| STEP | FE_SYLLABUS（新規に1つだけ増える概念） | 表 | RTP DEPTH |
|---|---|---|---|
| 1 | `SELECT` / `FROM`（列の選択） | RESIDENT_CACHE | LEVEL 0 |
| 2 | `WHERE` + 比較演算子 `=` | RESIDENT_CACHE | LEVEL 1 |
| 3 | `AND`（論理演算子の結合） | RESIDENT_CACHE | LEVEL 1 |
| 4 | `OR` / `NOT` | RESIDENT_CACHE | LEVEL 1 |
| 5 | `IN`（＝FE令和7科目A問6と同型） | RESIDENT_CACHE | LEVEL 1 |
| 6 | `ORDER BY`（並び替え） | SUPPLY_TRANSFER_0911 | LEVEL 1 |
| 7 | `COUNT(*)`（集約関数の導入） | RESIDENT_CACHE | LEVEL 2 |
| 8 | `SUM` / `AVG` / `MAX` / `MIN` | SUPPLY_TRANSFER_0911 | LEVEL 2 |
| 9 | `GROUP BY`（集合の形成） | SUPPLY_TRANSFER_0911 | LEVEL 2 |
| 10 | `HAVING`（集約後の絞り込み・WHEREとの相違） | EVAC_BATCH_0911 | LEVEL 3 |
| 11 | `INNER JOIN` / `ON` | PERSON_INDEX × ACCESS_LOG | LEVEL 4 |
| 12 | 結合後の `WHERE` | PERSON_INDEX × ACCESS_LOG | LEVEL 4 |
| 13 | `JOIN` + `GROUP BY` + `HAVING` 複合 | ACCESS_LOG × TRANSIT_SHADOW | LEVEL 4 |
| 14 | 3表結合（関係の連鎖） | RESIDENT_CACHE × PERSON_INDEX × ACCESS_LOG | LEVEL 4 |
| 15 | `LEFT JOIN` + `IS NULL`（不在の観測） | RESIDENT_CACHE × TRANSIT_SHADOW | LEVEL 5 |
| 16 | `NOT EXISTS`（不在の証明） | 同上 | LEVEL 5 |

現行の物語章（CH1〜CH4）は STEP 3 / 9 / 10 / 11 に対応する。**STEP ladder は章を置き換えるのではなく、章の間を埋める学習段差を定義する。**

### STEP 1〜5 の FE COVERAGE CONTRACT（Vertical Slice対象範囲）

```text
FE_SYLLABUS:
  - SELECT による列の選択
  - FROM による表の指定
  - WHERE による行の選択
  - 比較演算子 (= <> > >= < <=)
  - 論理演算子 (AND / OR / NOT)
  - IN による集合条件
  - 同じ結果を返す別クエリの判断（FE令和7科目A問6の形式）

RTP_TARGET:
  - ROW FILTER を「世界を見る最初のレンズ」として理解する
  - RAW TABLE の目視と、条件を明示して再現可能に抽出することを区別する
  - STEP 1〜5 単体では高度な Derived Fact の完成を要求しない（RTPは§12の通りこれを違反としない）

NOT_COVERED:
  - 集約関数 / GROUP BY / HAVING （STEP 7〜10）
  - JOIN / 3表結合 （STEP 11〜14）
  - LEFT JOIN / IS NULL / NOT EXISTS （STEP 15〜16）
  - 副問合せ / 相関副問合せ （FE用語例が未検証。ladderにも入れない）
  - DDL (CREATE TABLE / 制約) / DML書き込み (INSERT / UPDATE / DELETE)
  - transaction / 排他制御 / 正規化 / index / NULL演算の詳細
```

---

## 6. REPOSITORY REALITY（Runtime再監査）

| 確認項目 | 実態 |
|---|---|
| A. validator の実体 | `js/validator.js` 21行。`cleanSQL()` で正規化した文字列を `answers[]` と**完全一致比較**するだけ |
| B. Player Query は実データへ適用されるか | **されない。** SQLは一度も実行されていない |
| C. ResultSet | `js/data.js` の各STAGEに**ハードコード**。実計算ではない |
| D. 自由SQL入力 | **存在しない** |
| E. Token Pad の自由度 | `computeEnabled()` が文脈で次に置けるトークンを制限。提示トークンの組み合わせ以外は作れない |
| F. CH1〜CH5の判定 | CH1〜CH4のみ `STAGES` に存在（4件）。CH5は読み物でSTAGES未収録 |
| G. 既存テストが固定している旧仕様 | §9 参照 |

統合ポイントは1箇所に集約されている。

```text
js/app.js:604   const r = judge(built, st.answers);      ← 正誤判定
js/app.js:631   this.ui.renderResultSet(st.resultSet);   ← 結果表示(hardcoded)
js/app.js:590   st.resultSet.rows.length                 ← 行数予測の正解
```

---

## 7. FE COMPETENCY と RTP GAMEPLAY を対立させない

| SQL概念 | FE_COMPETENCY | RTP_GAMEPLAY |
|---|---|---|
| `WHERE` | 条件に一致する行を正しく選択できる | 世界に対して明示的な観測条件を与える最初のレンズ |
| `GROUP BY` | グループ化と集計結果を理解する | 個々の行を見るだけでは分からない集合の特徴を観測する |
| `HAVING` | WHEREとの適用順序の相違を理解する | 正常範囲を外れた集合だけを識別する |
| `JOIN` | 正しい結合条件を理解し結果を判断できる | 単一表に保存されていない Derived Fact を導出する |
| `LEFT JOIN` / `NOT EXISTS` | 外部結合と存在判定を理解する | 記録の**不在**そのものを証拠として扱う |

同じ1つのSQLが、試験では「正しく書けるか」を、ゲームでは「何が見えるか」を問う。

---

## 8. GAP MATRIX

### FE_COVERAGE_GAP（FE範囲にあるがNEON RELAYに無い）

```text
NULL の扱い / 三値論理
DDL         : CREATE TABLE / PRIMARY KEY / FOREIGN KEY / 参照制約
DML書き込み : INSERT / UPDATE / DELETE
ビュー
副問合せ / 相関副問合せ
トランザクション / 排他制御 / コミット / ロールバック / ACID
正規化（第1〜第3正規形）
インデックス
E-R図 / データベース設計
```

**このアプリだけでFE SQL全範囲に対応できるとは主張しない。** 本アプリの担当はデータ操作（問合せ）に限定する。

### RTP_GAP

```text
RTP_GAP_1  Player Query が実データに適用されないため、
           設計者が用意した1本の正解以外の関係を観測できない（= RTP実装不能の根源）
RTP_GAP_2  自由SQL入力が無いため「自分自身の問いを投げる」層が成立しない
RTP_GAP_3  施設定員表 (sector/emergency_capacity) が無名のため data.js に無く、
           物語の中核数値53がSQLの導出結果になっていない
RTP_GAP_4  TRANSIT_SHADOW が 3/83 行のため CH5 の 53人導出が成立しない
RTP_GAP_5  現CH1は7行の目視で同一結論に到達できる（LEVEL 1）
```

### REQUIRED_FUTURE_CAPABILITY

```text
実SQL実行エンジン（READ-ONLY）        ← 本Sprintで着手
結果ベースの正誤判定（別解の受理）     ← 本Sprintで着手
自由SQL入力UI                          ← 将来
施設定員表の正式命名（Data Canon決定） ← 人間判断が必要
TRANSIT_SHADOW 83行整備                ← Story変更を伴うため別Sprint
```

---

## 9. TEST IMPACT

| TEST | 固定している前提 | 影響 |
|---|---|---|
| `tools/session-test.js` | ChapterSessionの遷移のみ（データ非依存） | **影響なし** |
| `tools/ch1-mobile-check.js` | CH1正解トークン列 / 結果3行 / RESIDENT_CACHE全7行表示 / 誤答列 | 結果ベース判定でも正解・誤答の判定結果は不変 → **PASS維持見込み** |
| `tools/overlap-check.js` | CH1正解トークン列 / 予測3行 | 同上 |
| `tools/ux-decoder-a.mjs` / `b.mjs` | トークン列 / phase遷移 / DOM契約 | 同上 |
| `tools/ux-contracts.json` | 結果面積比・最小高さ | 結果行数が変わらないため影響なし |

`TEST_CHANGE_REQUIRED`: 本Sprintの範囲では**なし**。ただし旧テストをPASSさせるために新設計を曲げない方針は維持する。

---

## 10. VERTICAL SLICE DECISION

§17の選定基準（FE学習価値 / Coverage Contract明確 / RTP検証可能 / Real SQL検証可能 / Mobile成立 / Human Test可能 / 手戻り小）で評価した結果。

```text
VERTICAL SLICE =
  READ-ONLY SQL実行エンジンの導入と、結果ベース正誤判定への置換。
  既存 STAGES（CH1=WHERE+AND / CH2=GROUP BY / CH3=HAVING / CH4=JOIN）に適用する。
```

選定理由:

- 1ファイル追加 + `judge` 呼び出し1箇所の置換で、**4つの関係深度（LEVEL 1/2/3/4）すべてを実データで検証できる**
- 新しい問題・物語・テーブルを作らないため Story Canon / Data Canon を変更しない
- `ALTERNATIVE_QUERY_GATE`（別の合法クエリが実データから正しい結果を返す）を初めて成立させられる
- STEP ladder（§5）の全STEPは、このエンジンが無いと1つも実装できない。**ladderの前提インフラである**

除外したもの:

- STEP 1〜16 の問題本体の作成（エンジン確立後の次Sprint。既存正史テーブルのみで実装可能なことは§5で確認済み）
- 自由SQL入力UI（UI改修を伴うため §20 に従い Alignment 後）
- 施設定員表の命名・TRANSIT_SHADOW 83行（人間判断 / Story変更が必要）

```text
MINIMUM_SQL_FEATURES（READ-ONLY・§19準拠）
  SELECT   列 / 修飾列(p.col) / AS別名 / *
  集約     COUNT / SUM / AVG / MAX / MIN
  FROM     単一表 / AS別名
  JOIN     INNER JOIN ... ON a.x = b.y
  WHERE    = <> > >= < <= / AND / OR / NOT / IN
  GROUP BY / HAVING
  ORDER BY ASC / DESC
禁止      INSERT / UPDATE / DELETE / CREATE / DROP / ALTER（READ-ONLY）

DATA_CONTRACT
  既存 js/data.js TABLES の6表をそのまま入力とする。行の追加・改変・捏造をしない。
  数値は文字列で保持されているため、集約・数値比較時のみ数値として解釈する。

UI_IMPACT
  なし。100dvh / zero page scroll / Query・Evidence workspace / overlay を維持する。
  表示経路 renderResultSet() は変更しない（渡す resultSet が実計算結果になるだけ）。
```

---

## 11. ALIGNMENT GATE

```text
USER_INTENT_ALIGNED         YES  FE受験価値(LAYER A)とRTP(LAYER B)を二層として定義した
FE_SCOPE_VERIFIED           YES  現行Ver.9.2・DB範囲不変・2027年度新制度を公式確認。
                                 用語例の逐語検証は不能だが、実装対象を疑義なき中核に限定した(§2)
RTP_ALIGNED                 YES  RTPを書き換えず、実SQL実行がRTP_GAP_1の直接解消であることを確認
FE_COVERAGE_CONTRACT_DEFINED YES §4 形式を定義し §5 でSTEP 1〜5に適用
DOCUMENT_AUTHORITY_CLEAR    YES  本文書=SSOT / RTP=ACTIVE親原則 / 旧章編成記述は上書き
CH1_ROLE_CLEAR              YES  CH1=STEP 3相当のROW FILTER学習。RTP§12によりRTP違反ではない
CHAPTER_PROGRESSION_CLEAR   YES  §5 の16 STEP ladder（4問固定を解除）
DATA_REQUIREMENTS_CLEAR     YES  既存6表のみ。追加・改変なし
RUNTIME_LIMITATIONS_CLEAR   YES  §6 でA〜Gを実コードから確認
FIRST_VERTICAL_SLICE_CLEAR  YES  §10
TEST_IMPACT_CLEAR           YES  §9

IMPLEMENTATION_GATE = PASS
```

---

## 12. CODING後のGATE（§24）

```text
FE_LEARNING_GATE      問題がFE SQL教材として成立している
REAL_SQL_GATE         正解SQLが実データに適用され、結果が計算される
ALTERNATIVE_QUERY_GATE 別の合法Queryも実データから正しい結果を返す
RTP_GATE              SQLによる関係操作が実際に新しい理解へ繋がる
STORY_GATE            Story進行の破壊なし
MOBILE_GATE           iPhone portrait UIの破壊なし
TEST_GATE             関連テストPASS
```
