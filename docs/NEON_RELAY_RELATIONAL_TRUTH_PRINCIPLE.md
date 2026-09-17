# NEON RELAY ― RELATIONAL TRUTH PRINCIPLE (RTP)

```text
STATUS: ACTIVE
SCOPE:  ALL CHAPTERS
ROLE:   TOP-LEVEL GAME DESIGN PRINCIPLE
```

この文書は、NEON RELAYにおいて「データを調べること」が何を意味するかを定義する最上位のゲーム設計原則である。

Story Canon / Chapter Spec / FE Learning Spec / UI Spec / Data Canon / Runtime Implementation / Test Plan より上位に位置する。

ただし、この文書は物語上の具体的事実、章ごとの問題、表定義、UI、SQL Engine、実装方式を所有しない。

本原則に反する既存仕様が存在する場合、機械的に即時変更するのではなく、Alignment対象として扱う。

---

## 1. 中心命題

NEON RELAYでは、**表に保存された値そのものを読むことだけを「真実の発見」とは呼ばない。**

RAW DATAは世界の断片である。

SQLは、その断片同士に関係を定義し、比較・集計・結合・不存在判定・時系列比較などを行うための監査言語である。

また、SQLを書く前段階として、プレイヤー自身が複数の記録・表・制約の対応関係を直接たどり、欠損した情報を復元することもある。

NEON RELAYの中心にあるのは、

```text
VALUEを読むこと
```

ではなく、

```text
FACTとFACTの間にあるRELATIONを自分で確かめること
```

である。

---

## 2. FACT MODEL

NEON RELAYでは、Evidenceの性質を最低限3種類に分ける。

```text
RAW FACT
RECONSTRUCTED FACT
DERIVED FACT
```

### RAW FACT

```text
RAW FACT =
単一の行・単一の値として世界に保存されている事実
```

例:

```text
R005.last_sector = S2
```

この値自体は世界に保存されている。

### RECONSTRUCTED FACT

```text
RECONSTRUCTED FACT =
本来は記録されていたはずだが欠損・破損している値を、
複数のRAW FACT、対応関係、制約から復元した事実
```

抽象例:

```text
受付記録E442:
terminal_id = T-S4-03
received_at = 23:09
resident_id = 欠損

認証記録:
T-S4-03
authenticated_resident = R005
authenticated_at = 23:09

RECONSTRUCTED FACT:
E442.resident_id = R005
```

重要なのは、プレイヤーが単に候補から答えを当てることではない。

```text
TARGET RECORD
→ RELATION KEY
→ SOURCE RECORD
→ MATCH
→ RECONSTRUCT
```

という関係を自分でたどることに価値がある。

### DERIVED FACT

```text
DERIVED FACT =
複数のRAW FACTまたはRECONSTRUCTED FACTに
比較・集計・結合・不存在判定等の関係演算を行うことで
初めて成立する事実
```

DERIVED FACTは、それを構成するどの1行にも、そのまま書かれていない。

抽象例（ILLUSTRATIVE ONLY ― Story Canonではない）:

```text
RAW FACT:
Gate P6.closed_at = 23:00

RAW FACT:
R003 passed P6 at 23:11

DERIVED FACT:
R003は閉鎖後にP6を通過した
```

「閉鎖後に通過した」という命題は、どちらの行にも保存されていない。

2つの時点を関係づけた結果として初めて成立する。

---

## 3. RECONSTRUCTION と DERIVATION は別物

RECONSTRUCTED FACTとDERIVED FACTを混同しない。

```text
RECONSTRUCTION
= 欠けた記録を、関係から元の値へ戻す

DERIVATION
= 保存されていない新しい命題を、関係から成立させる
```

両方ともNEON RELAYの重要な調査行為である。

ただし、RTPの最も強い形はDERIVED FACTである。

RECONSTRUCTIONは、プレイヤーに「関係を読む」感覚を身体化させ、後続のSQL Investigationへ接続する重要な前段階となる。

---

## 4. EVIDENCE

Evidenceを「画面に表示された値」と同一視しない。

RAW FACTもEvidenceになり得る。

RECONSTRUCTED FACTもEvidenceになり得る。

しかし、NEON RELAY固有の核心的発見では、**関係から成立したEvidence**を重視する。

強いEvidenceの条件:

```text
- どの記録を使ったか追跡できる
- どの関係を使ったか説明できる
- 同じ操作を再実行すれば再現できる
- NORAの説明ではなく、プレイヤー自身が検証できる
```

---

## 5. WEAK PATTERN

### SQLの弱い形

```text
RAW TABLEに値が見えている
↓
SQLでその値を再取得する
↓
それを「真実の発見」と呼ぶ
```

これはSQL学習として価値を持つ場合があるが、RTPの完成形ではない。

### Relation Taskの弱い形

```text
表が表示されている
↓
3択・4択の候補Tokenから答えを選ぶ
↓
正解表示
```

プレイヤーが実際に関係を追わず、候補値を選ぶだけなら、Relation Taskは単なるクイズUIに退化する。

強いRelation Taskは、

```text
欠損レコードを選ぶ
↓
関係キーを確認する
↓
対応する別レコードをプレイヤー自身が選ぶ
↓
MATCH / MISMATCHを確認する
↓
欠損値を復元する
```

という操作自体がRelation Reasoningになっている。

---

## 6. SQL LEARNING VALUE / DATABASE COMPETENCY / RELATIONAL DISCOVERY VALUE

NEON RELAYはSQLだけを学ぶゲームではない。

また、RTPはWHERE、SELECT、ORDER BYなどの基礎問題を禁止しない。

最低限、3つの価値を区別する。

```text
SQL LEARNING VALUE
= SQL構文、評価順序、問い合わせ方法を習得する価値

DATABASE COMPETENCY
= 表、キー、参照、制約、NULL、欠損、Schema等を読み解く価値

RELATIONAL DISCOVERY VALUE
= 保存されていない事実・構造を関係によって導出する価値
```

単純なWHERE問題はSQL LEARNING VALUEを持つ。

表の参照関係から欠損値を復元する問題はDATABASE COMPETENCYを持つ。

複数表・集合・時点・不存在から新しい命題を導く問題はRELATIONAL DISCOVERY VALUEを持つ。

これらは別軸であり、一方が他方を代替しない。

---

## 7. RELATION DEPTH MODEL

設計と監査のための深度モデル。

XPでもランクでもプレイヤー評価でもない。

```text
LEVEL 0 — DIRECT VALUE
値そのもの

LEVEL 1 — ROW FILTER
WHERE等で対象行を抽出する

LEVEL 2 — SET RELATION
COUNT / SUM / GROUP BY等で集合を形成する

LEVEL 3 — ANOMALOUS SET
HAVING等で異常な集合を識別する

LEVEL 4 — CROSS-TABLE RELATION
JOIN等で複数表を関係づける

LEVEL 5 — ABSENCE / WORLD RECONSTRUCTION
NOT EXISTS / LEFT JOIN ... IS NULL / 時系列差分 /
欠落・不存在の証明 / 全体構造の再構成
```

注意:

```text
RECONSTRUCTED FACT
```

はEvidenceの種類であり、必ずLEVEL 5という意味ではない。

Evidence TypeとRelation Depthを混同しない。

---

## 8. SCALE PRINCIPLE

```text
SCALE ≠ ROW COUNT
```

悪いScale:

```text
7行なら目視できる
↓
7000行に増やして目視困難にする
```

これは同じ情報を隠しているだけであり、関係の深度は変わらない。

良いScale:

```text
複数集合
複数時点
複数表
多数の対応関係
制約
欠損
不存在
```

を組み合わせ、人間が頭の中だけでは正確に関係を計算できない状況を作る。

これを

```text
RELATIONAL COMPLEXITY
```

と定義する。

データ規模はRelational Complexityを支えるために使う。

行数の増加それ自体を目的にしない。

---

## 9. SQL AS LENS

SQLは「問題の答えを書くための構文」だけではない。

SQLは、**世界のどの断片を、どの条件で、どう関連づけるかをプレイヤー自身が定義するためのレンズ**である。

観測範囲は段階的に広がる。

```text
VALUE
→ ROW
→ SET
→ ANOMALOUS SET
→ RELATION
→ ABSENCE
→ WORLD STRUCTURE
```

SQL RESULTは、単なる「正解表示」ではない。

プレイヤーが定義した関係の結果として世界から返ってきたEvidenceである。

---

## 10. RELATION TASK

Relation Taskは、SQL Query Taskとは異なるInteractionである。

目的:

```text
- 表を読む
- 対応関係を見つける
- キーを追う
- 制約を使う
- 欠損値を復元する
- Schemaを理解する
```

Relation TaskはSQLの代替ではない。

```text
RELATION TASK
↓
RELATIONSHIP REASONING
↓
RECONSTRUCTED FACT
↓
PLAYER QUESTION
↓
SQL INVESTIGATION
↓
DERIVED FACT
```

という接続を許容する。

強い設計では、Relation Taskで復元した事実が、既存データとの新しい不一致・疑問を生み、次のSQL Investigationへ接続する。

---

## 11. STORY FACT と新規データ

RTPは、

```text
新しいStory Factを作ってはいけない
新しいTableを作ってはいけない
```

という原則ではない。

新しいFact / Table / Recordは、物語と調査を前進させるために必要なら追加してよい。

禁止するのは、

```text
- 同一人物に説明なく別IDを割り当てる
- 問題成立のためだけの無意味なダミーデータを作る
- 既存Canonとの矛盾に作者自身が気づいていない
```

ことである。

一方、

```text
既存Fact A
+
新Fact B
+
意図的な不一致
=
新しい調査
```

は、NEON RELAYに適したStory Designになり得る。

Canon整合性の詳細はStory / Data Canon側が所有する。

---

## 12. BEGINNER / EXPERT DUAL EXPERIENCE

同じゲームで両者が成立する。

```text
BEGINNER
問題・作業指示
→ Hint
→ Relation Task / SQL
→ Evidence
→ Story進行
```

これだけでも遊べる。

```text
EXPERT
Dataを見る
→ 自分で疑問を持つ
→ Relationを先に読む
→ SQLを試す
→ 問題文に指定されていない条件も調べる
→ Story説明より先にDerived Factへ到達する
```

初心者を罰しない。

熟練者専用Endingを要求する原則でもない。

両者で変わるのは主に:

```text
DISCOVERY TIMING
UNDERSTANDING DEPTH
AGENCY
```

である。

---

## 13. EXAM ANSWER / INVESTIGATIVE QUERY

```text
EXAM ANSWER
= FE等の一般的なDatabase / SQL教材として成立する正当な問題への正解

INVESTIGATIVE QUERY
= ゲームが直接要求していない、プレイヤー自身が立てた問い
```

NEON RELAYはEXAM ANSWERを終点にしない。

```text
EXAM / LEARNING TASK
↓
RESULT
↓
PLAYER-GENERATED QUESTION
↓
INVESTIGATIVE QUERY
↓
RECONSTRUCTED / DERIVED FACT
```

へ発展できる。

また、FE学習用の問題を物語の外に隔離しない。

NEON RELAYでは、学ぶ必要があるDatabase概念が、主人公の世界で本当に必要となる事件・監査・復旧作業として発生することを優先する。

---

## 14. HUMAN AGENCY

NORAやStoryが、

```text
この関係を見ろ
この行とこの行を結べ
このSQLを書け
```

と真相を先に説明するほど、プレイヤーの発見性は弱くなる。

可能な限り次を優先する。

```text
DATA
→ PLAYER NOTICE
→ PLAYER QUESTION
→ RELATION / SQL
→ EVIDENCE
→ INTERPRETATION
```

初心者Hintは存在してよい。

しかしHintは、プレイヤーが行うべき最終的な関係照合や結論を代行しない。

---

## 15. INTERACTION MUST EXPRESS THE THINKING

プレイヤーに要求する思考と、UI操作を一致させる。

悪い例:

```text
学ばせたいこと:
表Aと表Bの対応関係を見つける

実際の操作:
答え候補3つからR005を選ぶ
```

これは思考と操作が一致していない。

良い例:

```text
欠損セルを選ぶ
↓
対応するSOURCE RECORDを探す
↓
SOURCE ROWを選ぶ
↓
関係キーの一致を確認する
↓
復元する
```

Relation TaskではRELATIONSHIP REASONINGそのものをInteractionにする。

SQL TaskではQUERY CONSTRUCTION / QUERY EXECUTION / RESULT INTERPRETATIONそのものをInteractionにする。

---

## 16. RUNTIME LIMITATION ≠ PRINCIPLE

Runtimeの制約はRTPを再定義しない。

```text
RTP = DESIGN TARGET
```

現在のRuntimeがToken Pad、事前定義されたMission、限定SQL、固定UIを使っていても、本原則の意味は変わらない。

ただし、Runtimeが改善されて本物のSQL実行や別解受理が可能になった場合は、その能力をRTP実現のために積極的に使う。

---

## 17. CHAPTERS

この文書は章ごとの具体的問題やStory Progressionを所有しない。

ただし、全章へ次の原則を適用する。

### CH1

単純なSELECT / WHERE / AND学習を行ってよい。

LEVEL 1であること自体はRTP違反ではない。

ただし、

```text
表に既に見えている値を確認した
```

だけをNEON RELAY全体の最終的な成功基準にはしない。

### CH4

複数表の関係によって単一表に直接保存されていないStory Factを導く設計は、RTPの重要な先行例である。

### CH5

CH5を読み物にするか、プレイ可能にするか、この文書は決定しない。

ただし、終盤では複数表 / 集合 / 不存在 / 復元 / 時系列 / World Structureを使うDerived Factと高い親和性を持つ。

具体的構成はNARRATIVE SPINE / Chapter Specが所有する。

---

## 18. NON-GOALS

この文書は以下ではない。

```text
Story Bible
Chapter Spec
FE完全対策仕様
SQL教科書
UI仕様書
SQL Engine仕様書
Data Schema仕様書
Test Plan
Sprint Plan
```

具体的な実装方法を所有しない。

---

## 19. 判定テスト

### TEST A — RELATIONAL TRUTH

> この章の重要事実は、表に直接書かれた値を読むだけで到達できるか。

到達できる場合、それはSQL / Database Learningとして価値を持つ可能性はあるが、RTPの強い完成形ではない。

### TEST B — PLAYER ACTION

> プレイヤーは実際に関係を操作・照合・構成しているか。それとも候補から答えを選んでいるだけか。

後者ならInteractionを再設計する。

### TEST C — REPRODUCIBILITY

> どのRAW FACTを使い、どの関係によってEvidenceへ到達したか説明・再実行できるか。

できなければ監査ゲームとして弱い。

### TEST D — HUMAN AGENCY

> NORAやStoryが、プレイヤーより先に関係や結論を説明していないか。

先に説明している場合、Discovery Timingを見直す。

---

## 20. 一文定義

> **NEON RELAYは、データに書かれた答えを読むゲームではない。プレイヤーが記録同士の関係を自分で確かめ、欠けた事実を復元し、保存されていなかった事実を導出するゲームである。**
