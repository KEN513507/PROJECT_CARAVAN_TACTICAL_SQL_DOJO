# NEON RELAY ― RELATIONAL TRUTH / DOCUMENT ARCHITECTURE AUDIT

Sprint: WORLD-AS-RELATION DOCUMENT ARCHITECTURE AUDIT
Mode: DISCOVERY / DOCUMENTATION ARCHITECTURE / PLAN ONLY
Date: 2026-09-17
Audit basis: local working tree (Source of Truth)

この文書は監査結果と編集計画のみを含む。ゲーム本文・設計・データ・コードは一切変更していない。

監査基準（まだどの既存文書にも書き込んでいない）:

> RAW DATA = 世界に保存された個々の事実。
> SQL = 保存された事実同士に関係を定義する操作。
> SQL RESULT = 保存済み事実の再表示ではなく、関係から導出された新しい事実になり得る。
> 表を何分眺めても、そこに直接書かれた値だけでは真相に到達できないこと。

以下この基準を **RTP (Relational Truth Principle)** と呼ぶ。

---

## 1. REPOSITORY MAP

```text
docs/
  NARRATIVE_SPINE.md                    231行
  NEON_RELAY_CH1_DESIGN_GATE.md         272行
  NEON_RELAY_CH1_CHANGE_PLAN.md        1819行
  要件定義書_UIUX実装仕様書.txt          350行
story/neon_relay/
  full_story.md                         765行
  full_story_canonicalized.md           769行
  STRICT_AUDIT.md                        64行
  tables_canonicalized_strict.json      488行
js/
  data.js  app.js  ui.js  chapter-session.js  validator.js  sound.js  bgm.js
css/
  style.css
tools/
  parse_neon_relay_tables_strict.py
  session-test.js  ch1-mobile-check.js  overlap-check.js  ux-check.js  bgm-check.js
  ux-contracts.json  ux-test-helpers.mjs
  ux-decoder-a.mjs  ux-decoder-b.mjs  ux-run-all.mjs
  MANUAL_UX_TEST.md  MANUAL_UX_TEST_RESULT.md
  ux-artifacts/            (生成物: report.json / ab-report.json / *.png)
backup/         17 files   (app.js.bak〜.sprint1 等の旧版スナップショット)
notepad tools/   1 file    (css-diag.ps1 の重複)
ogg_extracted/  24 files   (音源中間物)
assets/         19 files   (画像・音源)
README.md        0行       (空)
package.json
```

### ファイル別 ROLE / AUTHORITY / STATUS / RTP関係

| PATH | ROLE | AUTHORITY | CURRENT_OR_LEGACY | RELATION_TO_RTP |
|---|---|---|---|---|
| `docs/要件定義書_UIUX実装仕様書.txt` | A+C（学習アプリ憲章・UI/UX・Stage進行） | 最古の親。NEON RELAY命名前 | CURRENT（UI原則は生きている）/ 一部LEGACY（Stage5 BOSS） | **SILENT**。関係性の概念が無い |
| `docs/NARRATIVE_SPINE.md` | B+C+実装制約（混在） | 物語正史 v1.0「確定版」 | CURRENT | **PARTIALLY_ALIGNED**「答えを検証できる人」= 方向は同じだが関係演算の話は無い |
| `docs/NEON_RELAY_CH1_DESIGN_GATE.md` | A（ただしScope=CH1のみ）+E | CH1の絶対原則 | CURRENT / ACTIVE | **PARTIALLY_ALIGNED & 一部CONFLICT**（§14、後述） |
| `docs/NEON_RELAY_CH1_CHANGE_PLAN.md` | H（検証計画）+E | 前Sprintの実装指示書 | **ほぼEXECUTED → SUPERSEDE候補** | SILENT（UX検証のみ） |
| `story/neon_relay/full_story.md` | B（原文） | 物語の一次源 | CURRENT（原文） | **最強の先行例を含む**（CH5 FINAL QUERY） |
| `story/neon_relay/full_story_canonicalized.md` | B+J（表名を明示化した派生） | パーサ入力用の正規化版 | CURRENT | 同上 |
| `story/neon_relay/STRICT_AUDIT.md` | H+I（パーサ監査記録） | **BLOCKER宣言の権威** | CURRENT | **RTPの障害を明記している**（capacity表無名・83行未整備） |
| `story/neon_relay/tables_canonicalized_strict.json` | F+J（生成物） | パーサ出力 | CURRENT（派生物） | unbound_tablesにRTP鍵データを保持 |
| `js/data.js` | F+G（runtime DATA CANON） | 実行時の事実 | CURRENT | LEVEL1〜4のみ。RTP未到達 |
| `js/validator.js` | G | 21行・文字列一致のみ | CURRENT | **RTP実装不能の根源** |
| `js/app.js` / `ui.js` / `chapter-session.js` | G | 実装 | CURRENT | RAW QUERY MODE未実装 |
| `tools/session-test.js` | H | Domain遷移46件 | CURRENT | 中立 |
| `tools/ch1-mobile-check.js` | H | CH1 UX 43件 | CURRENT | **CH1の現行SQL/結果を固定**（変更影響大） |
| `tools/ux-decoder-*.mjs` `ux-contracts.json` | H | L1 UX Decoder | CURRENT（前Sprint成果） | CH1結果3行を固定 |
| `tools/MANUAL_UX_TEST*.md` | H+I | 2026-09-15「改修前」記録 | **LEGACY**（ベースライン記録） | 中立 |
| `tools/parse_neon_relay_tables_strict.py` | J（生成器） | story→JSON | CURRENT | RTP用データ拡張時に再実行が必要 |
| `backup/` `ogg_extracted/` `notepad tools/` | I | 旧版・中間物 | LEGACY | 中立（ARCHIVE候補） |
| `README.md` | ―（空） | なし | 欠落 | 入口文書が存在しない |

---

## 2. RELEVANT DOCUMENT INVENTORY（横断検索結果）

キーワード（NEON RELAY / 透明都市 / 53人 / 各表名 / NOT EXISTS / CIVIS / NORA / アヤ / Mastery / relationship 等）で 19ファイル・408箇所がヒット。設計判断に影響するのは上表の通り。

注記: `docs/要件定義書_UIUX実装仕様書.txt` は上記キーワードに **1件もヒットしない**。NEON RELAY の物語化前に書かれた文書であり、世界観語彙を一切持たない。にもかかわらず UI/UX とStage進行の最上位規範として現在も生きている。**これが文書階層の最大の断層である。**

---

## 3. SOURCE-OF-TRUTH GRAPH

```text
[手書き一次源]
full_story.md
        │  （表名を独立行として明示化。新名称の発明は禁止）
        ▼
full_story_canonicalized.md ──► tools/parse_neon_relay_tables_strict.py
                                        │
                                        ▼
                        tables_canonicalized_strict.json   [生成物 J]
                            ├─ tables (named: 6)
                            └─ unbound_tables (5)
                                        │
                                        │  ★機械的転記（手作業・自動化なし）
                                        ▼
                                   js/data.js  TABLES / STAGES   [手書き F]
                                        │
                                        ▼
                                   runtime (app.js)
```

### 判定

- **表データの真の手書きSource of Truthは `full_story.md`** であり、`js/data.js` はその孫派生。
- ただし `full_story_canonicalized.md` も**手書き編集される**（表名の独立行挿入）。二重の手書き層が存在。
- `json → js/data.js` の転記は**自動化されていない**。data.js冒頭コメントが「機械的に転記した」と宣言しているが、実行される生成スクリプトは存在しない（`npm run neon:parse` は json 生成までで停止）。

### RISK（今回は修正しない）

| # | RISK | 影響 |
|---|---|---|
| R1 | 同一表データが `full_story.md` / `full_story_canonicalized.md` / `json` / `js/data.js` の**4箇所**に存在し、うち3箇所が手編集可能 | RTPでデータ量を増やすと4箇所同時更新が必要になり、必ず乖離する |
| R2 | `json → data.js` のジェネレータが無い | 「機械的転記」は宣言のみ。実態は手作業 |
| R3 | `TRANSIT_SHADOW` は json に4行目として `...` プレースホルダを持ち、data.js はそれを除外して3行 | 派生層で意図的にデータが削られている（data.jsにコメントで明記済・現時点では正しい判断） |

---

## 4. CURRENT CHAPTER SQL PROGRESSION

playable STAGES = **4**（CH1〜CH4）。CH5はSTAGESに存在しない。

| | CH1 | CH2 | CH3 | CH4 | CH5 |
|---|---|---|---|---|---|
| LEARNING_TARGET | 行の絞り込み | 「〜ごとに」集計 | 集計後フィルタ | 2表結合 | （読み物） |
| CURRENT_SQL_CONCEPT | WHERE + AND | GROUP BY + SUM | HAVING | INNER JOIN + ON | JOIN+GROUP BY+HAVING |
| CURRENT_TABLES | RESIDENT_CACHE(7) | SUPPLY_TRANSFER_0911(10) | EVAC_BATCH_0911(9) | PERSON_INDEX(7) × ACCESS_LOG(6) | ACCESS_LOG × TRANSIT_SHADOW |
| CURRENT_QUESTION | S4でMISSINGの住民 | 宛先ごとの総量 | 合計30人超のセクター | S4-P6に入った人物 | 50人以上が向かった先 |
| CURRENT_RESULT | 3行（R003/R004/R007） | 4行（S4=86が突出） | 1行（S4, 83） | 3行（如月アヤを含む） | NORTH-LATTICE \| 53 |
| CURRENT_STORY_DISCOVERY | R003が生データに存在 | S4への物資集中 | 83-30=53 | UNKNOWN-07＝如月アヤ | 53人はNORTH-LATTICEに生存 |
| **CURRENT_RELATIONSHIP_LEVEL** | **LEVEL 1** | **LEVEL 2** | **LEVEL 2.5**※ | **LEVEL 4** | **LEVEL 4→5（未実装）** |

※ CH3は設計上LEVEL 3を狙っているが、閾値 `30` が**ハードコードされたリテラルトークン**であり、施設定員表との関係演算になっていない。関係としてはLEVEL 2＋定数比較に退化している（詳細 §8）。

---

## 5. RELATIONSHIP-DEPTH AUDIT（データ規模の実態）

| TABLE | ROWS | 目視可能性 |
|---|---|---|
| RESIDENT_CACHE | 7 | 全行が一望可能 |
| SUPPLY_TRANSFER_0911 | 10 | 全行が一望可能 |
| EVAC_BATCH_0911 | 9 | 全行が一望可能 |
| PERSON_INDEX | 7 | 全行が一望可能 |
| ACCESS_LOG | 6 | 全行が一望可能 |
| TRANSIT_SHADOW | 3 / 実データ83 | 全行が一望可能（80行欠落） |
| **合計** | **42行** | **世界全体が1画面に収まる** |

### 判定

現在のNEON RELAYの世界は **全6表42行**。最大表が10行。
RTPが要求する「人間が頭の中だけで関係を計算・照合・不存在確認できなくなる規模」に対して、**現在は全章すべて暗算可能**である。

- CH2のS4=86は `14+9+21+17+25` の5項加算 → 暗算可能
- CH3のS4=83は `21+19+16+27` の4項加算 → 暗算可能
- CH4のJOINは 7行×6行 → 目でキーを追える

さらに `tools/ch1-mobile-check.js` は「RESIDENT_CACHE 全7行が見える」ことを**PASS条件として固定**している。つまり現行の自動テストは「世界全体が目視可能であること」を積極的に保証している。

---

## 6. DIRECTLY-VISIBLE FACT AUDIT（最重要監査）

「SQLを一切実行せず、表示された表を根気よく読めばStory上の重要事実に到達できるか」

| STORY_FACT | 章 | VISIBLE_DIRECTLY_IN_RAW_TABLE | REQUIRES_FILTER | REQUIRES_AGGREGATION | REQUIRES_COMPARISON | REQUIRES_MULTI_TABLE_RELATION | REQUIRES_ABSENCE_QUERY |
|---|---|---|---|---|---|---|---|
| R003 UNKNOWN-07 が MISSING かつ S4 として台帳に存在する | CH1 | **YES（完全に目視可能）** | YES | NO | NO | NO | NO |
| S4 に物資が突出して集中している | CH2 | NO（合計値は非保存）／ただし暗算可能 | NO | YES | YES | NO | NO |
| S4 の移送人数合計が83人 | CH3 | NO（合計値は非保存）／ただし暗算可能 | NO | YES | YES | NO | NO |
| 83人 − 公式30人 = 53人 | CH3 | **NO**（30はどの実装表にも無い＝物語リテラル） | NO | YES | YES | 本来YES（未実装） | NO |
| UNKNOWN-07 の正体は如月アヤ | CH4 | **NO（単一表には存在しない）** | YES | NO | YES | **YES** | NO |
| 如月アヤは事故後に職員台帳から削除された | CH4 | NO（物語テキストのみ。表に無い） | ― | ― | ― | ― | 本来YES（未実装） |
| 53人はNORTH-LATTICEに隠されている | CH5 | NO | YES | YES | YES | **YES** | 実質YES |

### ★ SQLで取得しているが、実は元表の目視で完全に分かるケース

| 章 | 現行クエリ | 目視での到達可能性 |
|---|---|---|
| **CH1** | `WHERE status='MISSING' AND last_sector='S4'` | **7行中3行を指で数えれば同一結果。SQLの必然性ゼロ** |

**CH1は現在、RTPの「弱い設計」の定義（表に既に書いてある値をSQLで同じ値として取得し、発見と呼ぶ）に正確に該当する。**

これは批判ではなく現在地の記録である。なおCH1の設計意図（DESIGN_GATE §14）は「R003が生データに存在することを自分で確かめた」と感じさせることであり、**目視可能であることが意図的な設計**でもある。RTPとの緊張はここに集中している（§9 C1）。

---

## 7. DERIVED-FACT AUDIT（SQLで初めて生まれる事実）

RTPの先行例として既に成立しているもの。

### D1. CH4 — 名前の復元（playable / 実装済）

```text
DERIVED_FACT=        UNKNOWN-07（R003）の法的氏名は如月アヤであり、23:11にS4-P6を通過した
SOURCE_TABLES=       RESIDENT_CACHE / PERSON_INDEX / ACCESS_LOG
QUERY_RELATION=      resident_id で同一人物を跨ぎ、credential_id(C773) で行動記録へ結合
WHY_NOT_VISIBLE_DIRECTLY=
                     RESIDENT_CACHE は display_name='UNKNOWN-07' としか書いていない。
                     PERSON_INDEX は legal_name を持つが通過時刻を持たない。
                     ACCESS_LOG は時刻を持つが氏名を持たない。
                     「UNKNOWN-07 = 如月アヤ = 23:11 S4-P6通過」はどの1表にも存在しない。
STORY_EFFECT=        匿名化された存在に名前が戻る。CH1で見た空白が人物になる。
```

**これが現行実装における唯一のLEVEL 4到達点であり、RTPの最良の先行例。**

### D2. CH5 — 53人の所在（prose only / 未実装）

```text
DERIVED_FACT=        NORTH-LATTICE に53人が隠されている（＝53人は生存している）
SOURCE_TABLES=       ACCESS_LOG × TRANSIT_SHADOW
QUERY_RELATION=      credential_id で結合 → WHERE gate='S4-P6' → GROUP BY destination
                     → HAVING COUNT(DISTINCT credential_id) >= 50
WHY_NOT_VISIBLE_DIRECTLY=
                     「53」という数値は世界のどの表にも保存されていない。
                     83人の通過記録と秘密交通記録の交差集合の濃度としてのみ出現する。
STORY_EFFECT=        CASE RECOVERY 100%。都市図が書き換わる。物語の最終解。
```

**プロジェクト全体で最もRTPに合致するクエリが、(a) プレイ不可（NARRATIVE_SPINE §9で読み物化）、(b) データ未整備（TRANSIT_SHADOW 3/83行）という二重の理由で成立していない。**

### D3. 成立しかけているが実装されていないもの

```text
DERIVED_FACT=        S4は定員30に対し83人を受け入れた（超過53）
BLOCKER=             施設定員表（sector / emergency_capacity）が無名のため js/data.js に存在しない
CURRENT_WORKAROUND=  HAVING SUM(people) > 30 の「30」をリテラルトークンとして手打ちさせている
RTP_IMPACT=          関係演算（実績 vs 定員）が定数比較に退化。物語の中核数値53が
                     SQLの導出結果ではなく物語テキストの主張になっている
```

---

## 8. MULTI-TABLE RELATIONSHIP MAP

推測でrelationを作らず、現在のデータとStoryから確認できるものだけを記載。

```text
RESIDENT_CACHE                PERSON_INDEX                 ACCESS_LOG                TRANSIT_SHADOW
(resident_id PK)              (resident_id PK)             (log_id PK)               (credential_id PK)
resident_id ──────────────────► resident_id
                               credential_id ────────────► credential_id ──────────► credential_id
                                                            gate / event / time       destination / route_state

SUPPLY_TRANSFER_0911          EVAC_BATCH_0911              [UNBOUND: 施設定員表]
(transfer_id PK)              (batch_id PK)                (sector / emergency_capacity)
destination ─┐                sector ─┐                    sector ─┐
             └──────────── sector軸で相互比較可能（現在どのクエリも未実行）────┘
```

| TABLE | CHAPTER | PK/ID | IMPORTANT_COLUMNS | ROWS | RELATES_TO | RELATION_KEY | CAN_PRODUCE_DERIVED_FACT_WITH |
|---|---|---|---|---|---|---|---|
| RESIDENT_CACHE | CH1 | resident_id | display_name, status, last_sector | 7 | PERSON_INDEX | resident_id | PERSON_INDEX（匿名↔実名の乖離） |
| SUPPLY_TRANSFER_0911 | CH2 | transfer_id | item, quantity, destination | 10 | EVAC_BATCH_0911, 定員表 | destination=sector | EVAC_BATCH（物資と人数の相関）／定員表 |
| EVAC_BATCH_0911 | CH3 | batch_id | sector, people | 9 | 定員表, SUPPLY_TRANSFER | sector | **定員表（超過53の導出）** |
| PERSON_INDEX | CH4 | resident_id | legal_name, credential_id | 7 | RESIDENT_CACHE, ACCESS_LOG | resident_id / credential_id | ACCESS_LOG（氏名×行動）／RESIDENT_CACHE |
| ACCESS_LOG | CH4/CH5 | log_id | credential_id, gate, event, time | 6 | PERSON_INDEX, TRANSIT_SHADOW | credential_id | **TRANSIT_SHADOW（53人の所在）** |
| TRANSIT_SHADOW | CH5 | credential_id | destination, route_state | **3/83** | ACCESS_LOG | credential_id | ACCESS_LOG（同上・データ未整備） |
| 施設定員表（無名） | CH3 | sector | emergency_capacity | 4 | EVAC_BATCH_0911 | sector | **未実装。RTPの鍵** |

### 未活用の関係（確認済・推測なし）

1. **EVAC_BATCH_0911 × 施設定員表** — 物語の中核数値53の唯一の正当な導出経路。表が無名のため未実装。
2. **ACCESS_LOG × TRANSIT_SHADOW** — 53人所在の導出経路。CH5が読み物化されデータ未整備。
3. **RESIDENT_CACHE × PERSON_INDEX の不在関係** — RESIDENT_CACHEに存在しPERSON_INDEXに無い（または逆）を問う不在クエリは、現在どの章でも使われていない。現データでは両表とも同じ7 resident_id を持つため**不在が発生しない**。
4. **SUPPLY_TRANSFER × EVAC_BATCH** — 「人がいない場所に物資が送られた」型の矛盾を作れるが未使用。
5. **ACCESS_LOG の event 列（IN/OUT）** — C773 のみ ARCHIVE-04 に IN/OUT 両方を持つ。「INしてOUTしていない人物」型の不在クエリが可能だが未使用。

---

## 9. EXISTING-DOC CONFLICT MATRIX

RTP と既存記述の関係。

| # | 文書 / 記述 | 判定 | 詳細 |
|---|---|---|---|
| A1 | NARRATIVE_SPINE §1「答えを受け取る人から答えを検証できる人になる」「SQLは監査言語」 | **ALIGNED** | RTPの動機と完全に同方向。ただし「検証」＝再確認に留まり「導出」の語彙が無い |
| A2 | DESIGN_GATE §3「CIVISの回答 ≠ 元データ ≠ 現実そのもの」 | **ALIGNED** | 3層の区別はRTPの前提。RTPはこれに「元データ ≠ 導出可能な事実」の第4層を追加する |
| A3 | OPENING「答えと、記録は、別のものです」 | **ALIGNED** | 世界観として既に確立 |
| A4 | D1（CH4 JOIN）とD2（CH5 FINAL QUERY） | **ALIGNED（先行例）** | RTPは新概念ではなく既に物語に存在する。明文化されていないだけ |
| P1 | DESIGN_GATE §1「SQLで照会する行為そのものを物語上の調査行為にする」 | **PARTIALLY_ALIGNED** | 「照会」は lookup 寄りの語。関係構成の意味を持たない |
| P2 | DESIGN_GATE §1 体験順序「違和感→操作→SQL照会→生データ→矛盾→自分で解釈」 | **PARTIALLY_ALIGNED** | 「生データ」が終点になっている。RTPでは生データは**出発点**で、終点は導出事実 |
| P3 | NARRATIVE_SPINE §4 章表「WHERE=疑わしい行だけを残す」 | **PARTIALLY_ALIGNED** | CH2「個々では見えない異常」CH4「バラバラの情報から復元」はRTP的。CH1のみ lookup |
| P4 | 要件定義書 Stage進行（WHERE→GROUP BY→HAVING→JOIN→BOSS） | **PARTIALLY_ALIGNED** | **構文の難易度順**であり関係深度順ではない。結果的に近いが原理が違う |
| **C1** | **DESIGN_GATE §14 Final Design Test「R003が生データに存在することを自分で確かめた」** | **CONFLICT** | この判定基準は「目視可能な値の再確認」を最重要成功条件として固定している。RTPは「目視だけでは到達できないこと」を要求する。**CH1の存在意義そのものの衝突** |
| **C2** | **NARRATIVE_SPINE §9「CH5は読み物。プレイヤーは解かない」** | **CONFLICT** | RTP最良例（D2）をプレイ不可にしている |
| **C3** | **要件定義書 Stage 5「BOSS: JOIN+GROUP BY+HAVING 統合問題」** | **CONFLICT（文書間）** | 要件定義書はプレイ可能なBOSSを要求、NARRATIVE_SPINEは読み物化。**どちらがSource of Truthか未決** |
| **C4** | **ch1-mobile-check.js「RESIDENT_CACHE 全7行が見える」= PASS条件** | **CONFLICT（テスト）** | 「世界全体が目視可能」をテストが保証している |
| S1 | 要件定義書 全体 | **SILENT** | 関係性・導出・不在の概念が皆無。認知負荷とタップ効率の文書 |
| S2 | 全文書 | **SILENT** | 「データ量を増やす」の意味が定義されていない（§10参照） |
| S3 | 全文書 | **SILENT** | 試験問題とゲーム的調査の二層関係（§11）が未定義 |
| S4 | 全文書 | **SILENT** | 初心者/熟練者の二層体験（§12）が未定義 |
| S5 | 全文書 | **SILENT** | DESIGN_GATE §3 が定義する RAW QUERY MODE の仕様がどこにも無い（実装も無い） |

---

## 10. SCALE PRINCIPLE AUDIT（独立監査）

現在の文書に「row count増加」と「relational complexity」の区別があるか。

**結論: 区別は存在しない。そもそもデータ規模に関する記述が全文書に存在しない。**

| 観点 | 現状 |
|---|---|
| 悪いScale（7行→7000行で目視困難化）への言及 | なし |
| 良いScale（複数集合・時間・表・不存在を暗算不能にする）への言及 | なし |
| 現在の実データ規模 | 42行（全6表合計） |
| STRICT_AUDIT の言及 | 「83-row executable fixture is not yet present」= **行数不足をBLOCKERとして認識している唯一の記述** |

STRICT_AUDIT は TRANSIT_SHADOW 83行の不足を「75問コーパス前のBLOCKER」と書いている。これは行数の問題として書かれているが、実質は **D2（53人の導出）が成立しないという関係性の問題**である。この読み替えを新文書で行う必要がある。

配置提案: Scale原則は親文書（§13）の中核節に置く。章仕様やデータ定義に散らさない。

---

## 11. EXAM COEXISTENCE（配置計画）

現状:

- `EXAM_QUESTIONS` は **1問のみ**。IPA令和7年度 科目A 問6（`商品` 表 / `仕入先ID IN (...)`）。
- 題材は NEON RELAY の世界と**完全に無関係**（商品表・仕入先ID）。
- 出題タイミングは Mastery Report 内（章クリア後の別レイヤ）。

RTPが要求する第二層（`EXAM ANSWER → RESULT → PLAYER-GENERATED QUESTION → INVESTIGATIVE QUERY → DERIVED FACT`）は**現在まったく存在しない**。試験問題は一問一答で閉じている。

配置計画:

| 内容 | 配置先 |
|---|---|
| 「試験問題は一般教材として正当に成立してよい」「ただしゲームはそこで終わらない」という二層原則 | **親文書（Core Constitution）** |
| 第二層の具体的な作り方（結果→プレイヤー自身の問い→自由SQL→導出事実） | **SQL / INVESTIGATION DESIGN（新設・§13階層）** |
| 各章でどの試験項目に対応し、どの調査クエリへ接続するか | **CHAPTER SPEC** |

---

## 12. TWO-TIER EXPERIENCE（初心者/熟練者）配置計画

現在どこに書かれているか:

| 要素 | 現在の記述場所 | 状態 |
|---|---|---|
| 初心者導線（問題文→Hint→SQL→正解→Story） | DESIGN_GATE §7 Hint Philosophy / NARRATIVE_SPINE §7 チュートリアル / §10 assistLevel連動 | **実装済・文書化済** |
| 熟練者導線（即SQL→結果を読む→自分で問いを作る→自由SQL→Story前にDerived Factへ到達） | **どこにも無い** | **未定義・未実装** |
| assistLevel / clearType（INDEPENDENT/ASSISTED/PRACTICE） | DESIGN_GATE §8 + chapter-session.js | 実装済。ただし**計測するのは支援量のみで、到達深度は計測しない** |

判定: 二層性はUI仕様ではなくゲーム設計原則。現在は初心者層だけが設計されており、熟練者層は概念として存在しない。`clearType` は「どれだけ助けを借りずに解けたか」を測るが、「どれだけ深い関係を自力で導出したか」を測る軸が無い。

配置計画:

| 内容 | 配置先 |
|---|---|
| 二層体験が設計原則であること | **親文書（Core Constitution）** |
| 熟練者層の導線定義（自由SQL・プレイヤー生成の問い） | **SQL / INVESTIGATION DESIGN（新設）** |
| Hint段階・assistLevel の具体仕様 | DESIGN_GATE（現状維持） |
| 到達深度の計測軸（RELATIONSHIP LEVEL到達度）を評価に加えるか | **要人間判断。今回は提案のみ** |

---

## 13. PROPOSED DOCUMENTATION HIERARCHY

### 親文書の命名 3案（決定しない）

#### 案1: `docs/NEON_RELAY_CORE_DESIGN_CONSTITUTION.md`

```text
ROLE=   全章・全スプリントを拘束する最上位憲章
SCOPE=  NEON RELAY 全体（CH1〜CH5＋次作への接続）
WHAT_GOES_HERE=
        - RTP（関係が真実を作る）
        - Scale原則（row countではなくrelational complexity）
        - 試験問題との二層原則
        - 初心者/熟練者の二層体験
        - 「弱い設計/強い設計」の判定基準
        - 既存のCIVIS/RAW DATA/回答の3層区別（DESIGN_GATE §3から昇格）
WHAT_MUST_NOT_GO_HERE=
        - 章固有の表名・行データ・正解SQL
        - UI寸法・CSS・tap target
        - テスト手順
        - 物語本文・セリフ
```

長所: 「憲章」の語が既存 `DESIGN_GATE`（Design Constitution）と語彙的に接続する。
短所: `DESIGN_GATE` が既に "CH1 Design Constitution" を名乗っており、**名前が衝突して混乱する**。

#### 案2: `docs/NEON_RELAY_RELATIONAL_TRUTH_PRINCIPLE.md`

```text
ROLE=   RTP単一原則の定義文書（単一責務）
SCOPE=  「SQLで世界を見るとは何か」のみ
WHAT_GOES_HERE=
        - RTP本体（RAW DATA / SQL / SQL RESULT の定義）
        - RELATIONSHIP LEVEL 0〜5 の定義と判定基準
        - 弱い設計/強い設計の対比
        - Scale原則
WHAT_MUST_NOT_GO_HERE=
        - 二層体験・試験問題方針（設計方針であり本原則ではない）
        - 章仕様・データ・UI・テスト
        - 物語本文
```

長所: 単一責務。既存文書との名前衝突なし。今回正式化したい思想そのものを名前が表す。
短所: 二層体験・試験方針など「原則ではないが全章共通」の項目の置き場が別途必要になる。

#### 案3: `docs/NEON_RELAY_GAME_DESIGN_PILLARS.md`

```text
ROLE=   全章共通のゲーム設計柱（複数原則の並列置き場）
SCOPE=  ゲーム設計方針全般（物語・UI・テストを除く）
WHAT_GOES_HERE=
        - PILLAR 1: RTP
        - PILLAR 2: Scale = relational complexity
        - PILLAR 3: 試験問題の二層構造
        - PILLAR 4: 初心者/熟練者の二層体験
        - PILLAR 5: Evidence First（DESIGN_GATE §6から昇格）
WHAT_MUST_NOT_GO_HERE=
        - 章仕様・データ・UI寸法・テスト・物語本文
        - 実装手順
```

長所: 今回の4つのSILENT項目（S2〜S5）すべてを自然に収容できる。増築に強い。
短所: 「柱」が増えすぎると憲章としての拘束力が薄まる。RTPが他と同格に見える。

### 推奨（人間の承認待ち）

**案2 + 案3 の二段構成を推奨する。**

理由: RTPは今回「最上位原則」として正式化したい思想であり、他の設計方針と同列に並べると格が下がる（案3の短所）。一方で S2〜S5 の収容先も必要。よって:

1. `NEON_RELAY_RELATIONAL_TRUTH_PRINCIPLE.md` — RTP単独。最上位。短く（目標60〜100行）。
2. `NEON_RELAY_GAME_DESIGN_PILLARS.md` — RTPを参照しつつ、Scale/試験二層/体験二層/Evidence Firstを並置。

案1は `DESIGN_GATE` との名前衝突により**非推奨**。

### 提案階層（現repo構造に合わせる）

```text
docs/
  NEON_RELAY_RELATIONAL_TRUTH_PRINCIPLE.md   ★新設・最上位（RTP）
  NEON_RELAY_GAME_DESIGN_PILLARS.md          ★新設・全章共通方針
  NARRATIVE_SPINE.md                          B: 物語正史（実装制約を分離）
  NEON_RELAY_SQL_INVESTIGATION_DESIGN.md     ★新設・D: 関係発見/自由SQL/章別RELATIONSHIP LEVEL
  chapters/
    CH1_SPEC.md                               E: DESIGN_GATE から章固有部分を移設
    CH2_SPEC.md 〜 CH5_SPEC.md                E: 未整備
  DATA_CANON.md                              ★新設・F: 表・関係キー・不在関係の正式定義
  UI_UX_SPEC.md                               要件定義書から UI/UX 部分を継承
  archive/
    NEON_RELAY_CH1_CHANGE_PLAN.md             I: 実行済
    要件定義書_UIUX実装仕様書.txt              I: 歴史的原典として保存
story/neon_relay/       （現状維持: 一次源＋生成物）
tools/                  （現状維持: H）
```

注: これは提案であり、机上の理想での全面再編は行わない。§14 の EDIT PLAN では**段階的移行**を前提とする。

---

## 14. FILE-BY-FILE EDIT PLAN

本文はまだ書き換えない。ACTIONレベルまで。

### E1

```text
FILE=         docs/NEON_RELAY_RELATIONAL_TRUTH_PRINCIPLE.md （新規）
CURRENT_ROLE= なし
PROBLEM=      RTPがどの文書にも存在しない。CH4/CH5に実例があるのに原則が未明文化
ACTION=       CREATE_PARENT_DOC
ADD=          RTP本体 / RELATIONSHIP LEVEL 0〜5定義 / 弱い設計と強い設計の対比 /
              Scale原則（row countではなくrelational complexity）/
              判定テスト「この章の真実は目視で到達可能か？」
REMOVE=       ―
MOVE=         DESIGN_GATE §3（CIVIS/元データ/現実の3層）をここへ昇格し、DESIGN_GATEは参照に変更
KEEP=         ―
DEPENDENCY=   これが確定するまで E4/E5/E6 に着手しない
RISK=         低（新規・参照のみ）。ただし本文書が確定するとC1（CH1の存在意義）の再判断が必須になる
```

### E2

```text
FILE=         docs/NEON_RELAY_GAME_DESIGN_PILLARS.md （新規）
CURRENT_ROLE= なし
PROBLEM=      S2〜S5（Scale/試験二層/体験二層/RAW QUERY MODE）の置き場が無い
ACTION=       CREATE_PARENT_DOC
ADD=          試験問題との二層原則 / 初心者・熟練者の二層体験 /
              Evidence First（DESIGN_GATE §6から昇格）/ RAW QUERY MODEの位置づけ
MOVE=         DESIGN_GATE §6 → ここ（CH1固有ではなく全章共通のため）
DEPENDENCY=   E1
RISK=         低
```

### E3

```text
FILE=         docs/NEON_RELAY_CH1_DESIGN_GATE.md
CURRENT_ROLE= A（CH1 Design Constitution）+ E（CH1仕様）― 責務混在
PROBLEM=      (1) 全章共通原則（§3 CIVIS層 / §6 Evidence First / §7 Hint / §8 Mastery）が
                  CH1文書に閉じ込められている。§13が横展開を禁止しているため他章が参照できない
              (2) §14 Final Design Test が RTP と CONFLICT（C1）
              (3) 冒頭・末尾に ````markdown フェンスの混入
ACTION=       SPLIT + SHORTEN
KEEP=         §4 NORA / §5 CH1 Narrative Contract / §9 Mobile UX / §10 Character /
              §11 Aya Rule / §12 No Gratuitous Gamification / §13 Scope Rule
MOVE=         §3 → E1 / §6 → E2 / §7 §8 → E4（学習設計）
ADD=          冒頭に E1/E2 への参照。§14 を RTP と整合する形へ再定義する必要の明記
REMOVE=       ````markdown フェンス（体裁）
DEPENDENCY=   E1, E2
RISK=         **高**。§14 は「自動テストがPASSしていても採用しない」最終判定であり、
              これに触ると CH1 の設計思想が動く。C1 は人間判断を要する
```

### E4

```text
FILE=         docs/NEON_RELAY_SQL_INVESTIGATION_DESIGN.md （新規）
CURRENT_ROLE= なし（現在この役割の文書が存在しない）
PROBLEM=      章ごとの関係深度・自由SQL・プレイヤー生成の問いを定義する文書が無い。
              要件定義書のStage進行は構文難易度順であり関係深度順ではない（P4）
ACTION=       CREATE
ADD=          章別 RELATIONSHIP LEVEL 目標 / 自由SQL（熟練者層）の導線 /
              第二層（結果→自分の問い→調査クエリ→導出事実）/ 不在クエリの設計指針
MOVE=         NARRATIVE_SPINE §4章表の「獲得する能力」列 / 要件定義書のStage進行をここへ統合
DEPENDENCY=   E1
RISK=         中（NARRATIVE_SPINE と要件定義書の二重記述を解消する必要がある）
```

### E5

```text
FILE=         docs/DATA_CANON.md （新規）
CURRENT_ROLE= なし（F は js/data.js と json に分散）
PROBLEM=      表の関係キー・不在関係・未活用関係が文書化されていない（§8は今回の監査で初出）
              施設定員表が無名のまま（STRICT_AUDIT BLOCKER）
ACTION=       CREATE
ADD=          全表の関係キー一覧 / §8の関係マップ / 未活用関係5件 /
              施設定員表への正式名称付与の**提案**（命名は人間判断）/
              TRANSIT_SHADOW 83行整備の要件
DEPENDENCY=   E1。かつ full_story.md への表名追加は story 変更のため別Sprint
RISK=         中。命名は story 一次源に手を入れる必要があり、今Sprintでは禁止事項
```

### E6

```text
FILE=         docs/NARRATIVE_SPINE.md
CURRENT_ROLE= B（物語正史）+ C（学習設計）+ 実装制約 ― 責務混在
PROBLEM=      §4（章別SQL能力）§10（実装への制約）§11（実装優先順位）が物語文書に同居。
              §9（CH5読み物化）が RTP と CONFLICT（C2）
ACTION=       SPLIT
KEEP=         §1テーマ §2主人公 §3 NORA §5 NORAの進化 §6オープニング §7チュートリアル
              §8エンディング §12次作への伏線
MOVE=         §4 → E4 / §10 §11 → 実装計画文書（章仕様 or 新設） /
              §9 → C2 の判断を経てから E4 へ
ADD=          ―
DEPENDENCY=   E4。C2（CH5をプレイ可能にするか）は人間判断
RISK=         **高**。「確定版 v1.0」と明記された物語正史。§9 を動かすと CH5 の扱いが変わる
```

### E7

```text
FILE=         docs/NEON_RELAY_CH1_CHANGE_PLAN.md
CURRENT_ROLE= H（前SprintのUX Decoder実装指示書）
PROBLEM=      内容はほぼ実装完了（L1 UX Decoder 稼働中）。1819行が現役文書として残り、
              docs/ 直下で最大の文書になっている。かつ未実装Contract
              （WRONG / HINT / TIMEOUT）を含み、実装済 ux-contracts.json（5状態）と乖離
ACTION=       ARCHIVE（docs/archive/ へ移動）
KEEP=         未実装Contract（WRONG/HINT/TIMEOUT）の仕様は抽出して tools/ux-contracts.json の
              将来拡張メモとして残す
ADD=          冒頭に EXECUTED / SUPERSEDED BY: tools/ux-decoder-*.mjs の明記
DEPENDENCY=   なし（独立して実行可能）
RISK=         低
```

### E8

```text
FILE=         docs/要件定義書_UIUX実装仕様書.txt
CURRENT_ROLE= A（学習アプリ憲章）+ C（Stage進行）+ UI/UX仕様 ― 最古の原典
PROBLEM=      (1) NEON RELAY の語彙を一切持たない（世界観との断層）
              (2) Stage 5 BOSS がプレイ可能前提 → NARRATIVE_SPINE §9 と CONFLICT（C3）
              (3) .txt 形式で他文書と非対称
ACTION=       SPLIT + ARCHIVE
KEEP=         Cognitive Engineering 3ペイン / Zero-Scroll / Token-Based /
              Evaluation-Order-First / 五感フィードバック（いずれも現役の設計根拠）
MOVE=         上記UI/UX原則 → docs/UI_UX_SPEC.md（.md化）/ Stage進行 → E4
ADD=          archive 版冒頭に「NEON RELAY 命名前の原典。UI原則は UI_UX_SPEC.md が継承」
DEPENDENCY=   E4（Stage進行の移設先）。C3 は人間判断
RISK=         中。UI原則は現在も全実装の根拠であり、移設ミスは根拠喪失につながる
```

### E9

```text
FILE=         README.md
CURRENT_ROLE= なし（0行）
PROBLEM=      リポジトリの入口が空。どの文書から読むべきかが不明。
              新Sprint開始時に毎回全文書を探索する必要が生じている（本監査を含む）
ACTION=       CREATE
ADD=          文書階層の地図 / 各文書のROLEとAUTHORITY / 読む順序 /
              Source of Truth グラフ（§3）/ npm scripts 一覧
DEPENDENCY=   E1〜E8 の階層確定後
RISK=         低。ただし効果は大きい
```

### E10（記録のみ・実行対象外）

```text
FILE=         story/neon_relay/full_story.md / full_story_canonicalized.md
ACTION=       NO_ACTION（今Sprintでは禁止事項）
NOTE=         施設定員表への正式名称付与と TRANSIT_SHADOW 83行の整備は、
              一次源である本ファイルの変更を伴う。これは story 変更であり、
              専用Sprint（DATA CANON SPRINT）を要する。E5 で要件のみ記述する
```

---

## 15. RUNTIME / DESIGN GAPS

コードは一切変更していない。記録のみ。

```text
DESIGN_RUNTIME_GAP_1=
  js/validator.js は21行。cleanSQL による正規化後の文字列完全一致のみ。
  SQL実行エンジンは存在しない。resultSet は STAGES 内にハードコードされた固定値。
  → SQLは「実行」されておらず、正解文字列との照合後に用意された結果が表示される。
  → RTPの「関係を構成して観測する」は、現行アーキテクチャでは原理的に不可能。
     プレイヤーが書いたクエリが実際にデータへ適用されないため、
     設計者が事前に想定した1本の正解以外の関係は観測できない。

DESIGN_RUNTIME_GAP_2=
  トークンパッド方式のため、各章で提示されたトークンの組み合わせ以外のクエリを作れない。
  自由SQL（熟練者層・プレイヤー生成の問い）は入力手段が存在しない。

DESIGN_RUNTIME_GAP_3=
  DESIGN_GATE §3 が RAW QUERY MODE を「AIの解釈を介さず監査データを直接確認する
  READ-ONLY経路」として定義しているが、実装・仕様書ともに存在しない（S5）。

DESIGN_RUNTIME_GAP_4=
  TRANSIT_SHADOW は 3/83行。D2（53人の導出）に必要なデータが存在しない。

DESIGN_RUNTIME_GAP_5=
  施設定員表が js/data.js に存在しない。CH3 の閾値30はリテラルトークン。
  物語の中核数値53が SQL の導出結果になっていない。

DESIGN_RUNTIME_GAP_6=
  CH5（STAGES未収録）。playable stages = 4。
  ui.js の静的テンプレートに "STAGE 1/5" の残骸あり（実際は /4 で上書きされる）。

DESIGN_RUNTIME_GAP_7=
  clearType は支援量（INDEPENDENT/ASSISTED/PRACTICE）のみを測る。
  到達した関係深度（RELATIONSHIP LEVEL）を測る軸が無い。

FUTURE_REQUIREMENT_1=
  ブラウザ内SQL実行エンジン（例: sql.js / alasql 等のWASM or JS実装）。
  「正解文字列照合」から「実データへのクエリ適用」への転換。
  → これはアーキテクチャ変更であり、専用Sprintと技術選定を要する。
     新規依存の追加を伴うため、今Sprintでは判断しない。

FUTURE_REQUIREMENT_2=
  データ規模の拡張（relational complexity基準）。
  TRANSIT_SHADOW 83行 + ACCESS_LOG の対応拡張 + 施設定員表の正式化。
  一次源 full_story.md への表追加 → parser再実行 → data.js再生成の経路確立。

FUTURE_REQUIREMENT_3=
  json → js/data.js のジェネレータ（現在は手作業。R2）。

FUTURE_REQUIREMENT_4=
  自由SQL入力UI（熟練者層）。トークンパッドと併存させる設計。

FUTURE_REQUIREMENT_5=
  CH5 をプレイ可能にするか、CH1 を RTP 準拠に作り直すかの方針決定（C1/C2/C3）。
```

---

## 16. TEST DEPENDENCY MAP

設計文書変更後に影響を受けるテスト。**今回は変更しない。**

| TEST | 固定している前提 | RTP適用時の影響 |
|---|---|---|
| `tools/ch1-mobile-check.js` | ・CH1正解トークン列13個（`RIGHT`）<br>・結果3行 `R003/R004/R007`<br>・**「RESIDENT_CACHE 全7行が見える」がPASS条件**<br>・誤答用 `WRONG` 列<br>・予測選択肢 `[1,3,5]` と正解3行 | **最大。C4の通り「世界が目視可能」を保証している。CH1をRTP準拠に変えるなら全面改訂** |
| `tools/ux-decoder-a.mjs` | ・同 `RIGHT` / `WRONG` トークン列<br>・`rowChoices` 3行<br>・CH2遷移（`CH.2` 文字列）<br>・phase遷移順序 | 大。CH1のSQL・データが変わればトークン列と予測値が全滅 |
| `tools/ux-decoder-b.mjs` | ・`jumpToEvidence()` が CH1 正解順を内蔵（js/app.js 側）<br>・5状態のDOM契約 | 中。app.js の `_jumpToEvidenceForTest` の順序配列も同時修正が必要 |
| `tools/ux-contracts.json` | ・`#resultPanel` minAreaRatio 0.55（実測0.694/0.755基準）<br>・`#tokenPad` minHeight 180 | 中。結果行数が増えると面積比・スクロール契約が変わる |
| `tools/session-test.js` | ChapterSession の遷移のみ（データ非依存） | **小。Domain純粋なため影響なし** |
| `tools/overlap-check.js` | CH1正解トークン列 / 予測3行 | 中 |
| `tools/ux-check.js` | （旧UXチェック。現役か未確認） | 要確認 |
| `tools/MANUAL_UX_TEST.md` | 2026-09-15「改修前」手順 | 小（既にLEGACY） |

**重要**: `session-test.js` がデータ非依存であることは、ChapterSession の Domain 分離が正しく効いている証拠。RTP適用によるデータ・SQL変更は Domain を壊さない。

---

## 17. RECOMMENDED NEXT DOCUMENTATION SPRINT

依存順に並べる。各Sprintは独立して停止可能。

### SPRINT N+1: RELATIONAL TRUTH PRINCIPLE 制定（文書のみ）

```text
成果物=  docs/NEON_RELAY_RELATIONAL_TRUTH_PRINCIPLE.md （E1）
         docs/NEON_RELAY_GAME_DESIGN_PILLARS.md （E2）
前提=    親文書の命名を人間が決定（§13の3案から）
禁止=    既存文書の本文変更 / コード / データ / story
出口=    RTPとRELATIONSHIP LEVEL 0〜5が明文化され、全章がどのLEVELを目標とするかの
         判定基準が存在する状態
```

### SPRINT N+2: 衝突解決（人間判断が必須）

```text
議題=    C1: DESIGN_GATE §14「R003を自分で確かめた」をRTP下でどう再定義するか
             （CH1をLEVEL1のまま入口として温存 / LEVEL2以上へ作り直す）
         C2: CH5をプレイ可能にするか（NARRATIVE_SPINE §9の撤回可否）
         C3: 要件定義書 Stage5 BOSS と NARRATIVE_SPINE §9 のどちらを採用するか
         施設定員表の正式名称
成果物=  決定記録（ADR形式）
禁止=    決定前の実装
```

### SPRINT N+3: 文書階層の物理再編（移動・分割のみ）

```text
対象=    E3, E6, E7, E8, E9
内容=    SPLIT / MOVE / ARCHIVE / README作成
禁止=    原則の新規追加（N+1で確定した内容の移設のみ）
```

### SPRINT N+4: SQL INVESTIGATION DESIGN / DATA CANON 制定

```text
成果物=  docs/NEON_RELAY_SQL_INVESTIGATION_DESIGN.md （E4）
         docs/DATA_CANON.md （E5）
内容=    章別RELATIONSHIP LEVEL目標 / 未活用関係5件の設計 /
         施設定員表・TRANSIT_SHADOW 83行の要件定義
禁止=    story一次源の変更（N+5へ）
```

### SPRINT N+5: DATA CANON 実装Sprint（story変更を含む・要別承認）

```text
内容=    full_story.md への表名付与 → parser再実行 → data.js再生成経路の確立
         TRANSIT_SHADOW 83行整備
前提=    N+2の決定、N+4の要件定義
リスク=  story一次源の変更。物語正史への影響。別途承認が必要
```

### SPRINT N+6: SQL ENGINE 技術選定（アーキテクチャ判断・要別承認）

```text
議題=    GAP_1（文字列照合→実クエリ実行）の解決可否。新規依存の追加判断
前提=    N+1〜N+5完了。RTPが文書上確定していること
注記=    これを行わない限り、RTPは「設計原則としては正しいが実装できない原則」に留まる
```

---

## 18. 監査サマリ

### RTPの現在地

| 判定 | 内容 |
|---|---|
| RTPは新概念か | **いいえ。CH4（実装済）とCH5（散文）に既に存在する。明文化されていないだけ** |
| 最もRTP的な章 | CH4（INNER JOIN）― 単一表に存在しない事実を導出する唯一のplayable例 |
| 最もRTPから遠い章 | **CH1 ― 7行の表を目視すれば同一結果に到達できる。「弱い設計」の定義に該当** |
| 最大の損失 | **CH5 FINAL QUERY（53人の所在）がプレイ不可かつデータ未整備。プロジェクト最良のRTP例が死んでいる** |
| 構造的障害 | 施設定員表の無名化により、物語の中核数値53がSQLの導出結果になっていない |
| 実装上の障害 | SQL実行エンジンが無く、プレイヤーのクエリはデータに適用されない（GAP_1） |
| スケールの現状 | 全6表42行。最大10行。**全章すべて暗算可能** |

### 最上位原則をどこに置くべきか（§16への回答）

**推奨: `docs/NEON_RELAY_RELATIONAL_TRUTH_PRINCIPLE.md` を新設し、全章共通の親原則として置く。**

- CH1専用の設計（DESIGN_GATE）に置いてはならない。同文書 §13 が「CH1の変更理由でCH2〜CH5を変更しない」と明示的にスコープを閉じており、CH1文書に置いた原則は構造上他章へ届かない。
- NARRATIVE_SPINE に置いてはならない。RTPは物語正史ではなく設計原則であり、物語文書の責務混在（E6）をさらに悪化させる。
- 要件定義書に置いてはならない。同書はNEON RELAY以前の文書であり世界観語彙を持たない。
- 長さの目標は **60〜100行**。RTP本体 + RELATIONSHIP LEVEL 0〜5 + 弱い/強い設計の対比 + Scale原則 + 判定テスト1文のみ。章仕様・データ・UI・テストは書かない。

判定テストとして推奨する1文（案）:

> この章の重要事実は、表を何分眺めても、そこに直接書かれた値だけでは到達できないか。
> 到達できるなら、それはまだ LEVEL 1 である。

---

## APPENDIX: STOP CONDITION 該当事項

§25 の停止条件のうち、以下は**報告対象だが今Sprintを停止させるものではない**（いずれも判断を人間に委ねる形で記録済）。

```text
BLOCKER=   Source of Truth が実質的に二重（full_story.md と full_story_canonicalized.md が
           ともに手編集される）。かつ json → data.js のジェネレータが存在しない（R1/R2）
EVIDENCE=  js/data.js:4-8 が「機械的に転記した」と宣言しているが、
           package.json の neon:parse は json 生成で停止しており data.js を生成しない
CHOICES=   (a) canonicalized を生成物化し、表名付与をパーサ設定へ移す
           (b) data.js ジェネレータを追加し data.js を生成物化する
           (c) 現状維持（手作業の二重管理を明示的に受け入れる）
RECOMMENDED_DECISION= (b)。data.js を生成物化すれば手書き層が2→1に減り、
           RTPでデータ量を増やしたときの乖離リスク（R1）が構造的に消える。
           ただしこれは tools/ 追加を伴うため SPRINT N+5 で扱う

BLOCKER=   C3（要件定義書 Stage5 BOSS vs NARRATIVE_SPINE §9 CH5読み物化）は
           同一事項について二文書が矛盾しており、機械的に判定できない
EVIDENCE=  要件定義書 末尾「Stage 5: BOSS（JOIN + GROUP BY + HAVING の複合問合）」
           NARRATIVE_SPINE §9「CH5は読み物として提示。プレイヤーは解かない」
CHOICES=   (a) CH5をプレイ可能なBOSSに戻す（RTP最良例が生きる／CH5長文問題が再燃）
           (b) 読み物のまま維持（RTP最良例は死んだまま）
           (c) CH5を分割し、FINAL QUERY部分のみplayableにして物語は短縮維持
RECOMMENDED_DECISION= (c)。NARRATIVE_SPINE §9 の意図（長大テキストの解消）と
           RTP（最良例をプレイさせる）を両立できる。ただし物語構成の判断であり人間決定が必要
```
