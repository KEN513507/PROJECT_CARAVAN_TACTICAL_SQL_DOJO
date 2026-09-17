# NEON RELAY 物語の背骨（NARRATIVE SPINE）

```text
STATUS: ACTIVE
VERSION: v2.0
DATE: 2026-09-17
ROLE: STORY / CHARACTER / CHAPTER PROGRESSION CANON
```

この文書は、NEON RELAYの物語上の背骨を定義する。

所有するもの:

```text
- 物語テーマ
- 主人公の成長
- NORAの役割と変化
- 各章の中心疑問
- 各章で何がStory Factとして明らかになるか
- オープニング
- エンディング
- 次作への接続
```

所有しないもの:

```text
- RTPの定義
- SQL Engine仕様
- UI寸法
- CSS
- Tap Target
- Test Plan
- 各Missionの完全な問題文
- Data Schemaの完全定義
```

RTPは `NEON_RELAY_RELATIONAL_TRUTH_PRINCIPLE.md` を上位原則として参照する。

---

## 1. テーマ

> **AIがすべての答えを返す社会で、
> 「答えを受け取る人」から「答えを検証できる人」になる物語。**

さらに終盤では、

> **「答えを検証する人」から、
> 「データ同士の関係から、自分で新しい問いを作れる人」へ進む。**

SQLは、そのための**監査言語**である。

Relation Taskは、その前段階として、

```text
記録を読む
↓
関係を追う
↓
欠損した事実を復元する
```

ための調査行為である。

---

## 2. 主人公

- 第九保全局の臨時監査員
- SQLは初心者
- Database構造や関係の読み方も、実務を通して覚える
- 最初はNORAの指示を必要とする
- 章を追うごとに、NORAの回答よりもDataそのものを見るようになる
- 最終的には、Storyから問いを与えられる前に、自分でDataの不一致を見つける

主人公の成長は、

```text
ANSWER RECEIVER
↓
QUERY OPERATOR
↓
EVIDENCE CHECKER
↓
RELATIONSHIP INVESTIGATOR
```

として進む。

---

## 3. NORA

- 第4アーカイブの補助AI
- 無自覚にCIVISのフィルタを通している
- 嘘はつかない
- しかし「CIVISが返した答え」をそのまま返すことがある
- NORA自身は、それがどこまで加工された回答なのか証明できない
- 主人公はNORAを敵として疑うのではなく、NORAの背後にあるCIVISを疑う

### NORAの基本原則

NORAは初心者を支援する。

しかし、プレイヤーが自力で気づける関係を、NORAが先に説明しない。

特に中盤以降は、

```text
NORAが答えを言う
```

よりも、

```text
NORAが待つ
```

ことを優先する。

### canonical dialogue

CH1冒頭:

> 「私はあなたに回答できます。しかし、その回答が
> CIVISによって加工されていないことを、私は証明できません。」

> 「監査員。私の言葉を信じないでください。データを照会してください。」

CH4:

> 「あなたは、記録から消えた人間が、生きていると思いますか」

終盤:

> 「何か異常がありますか？」

主人公:

> 「……まだ分からない。」

---

## 4. 章ごとの中心疑問

| 章 | 中心疑問 | 主な能力 | Story上の意味 |
|---|---|---|---|
| CH1 | 公式報告は「MISSING: 0」。本当か？ | WHERE / AND | 公式回答とRAW DATAを分ける |
| CH2 | なぜS4に物資が集中した？ | GROUP BY / 集約 | 個々の行から集合を見る |
| CH3 | 83人と30人の差は何？ | HAVING / 集合比較 | 53という数が「差」として現れる |
| CH4 | 名前のないIDは誰？ | INNER JOIN | バラバラの情報から人物を復元する |
| CH5 | 復元した記録同士が食い違うのはなぜか。53人はどこへ行った？ | Relation Task / SQL Investigation / COUNT / NOT EXISTS / 複数表関係 | 世界の記録構造そのものを疑う |

CH1〜CH4で学んだSQLは、CH5で単なる学習項目ではなく、**主人公自身の調査手段**として再利用される。

---

## 5. CH1 — 公式報告を疑う

### 疑問

```text
CIVIS OFFICIAL REPORT:
MISSING: 0

しかし本当に0なのか？
```

### 学習

- SELECT
- FROM
- WHERE
- AND

### Story Function

CH1はRTPの最終形ではない。

役割は、

```text
CIVISの回答
≠
RAW DATA
```

をプレイヤー自身に体験させること。

主人公はここで初めて、

> 「回答を見る」のではなく
> 「条件を指定して記録を見る」

という行為を学ぶ。

CH1で高度なDerived Factは要求しない。

---

## 6. CH2 — 個々の記録から集合へ

### 疑問

> なぜS4に物資が集中している？

### 学習

- GROUP BY
- SUM
- 集合としてDataを見る

### Story Function

単独のtransfer rowには、

```text
S4は異常に多い
```

とは書かれていない。

複数のtransferを集約した結果として、

```text
S4への集中
```

が見える。

ここで主人公は、

```text
ROW
↓
SET
```

へ視野を広げる。

---

## 7. CH3 — 53という数

### 疑問

> 83人という移送実績は、何を意味する？

### 学習

- HAVING
- 集約後フィルタ
- 実績と基準の比較

### Story Function

S4に83人。

公式の受入容量30人。

差は53人。

重要なのは、

```text
53
```

が単なるStory Numberではなく、

```text
実績
−
基準
```

の関係から出現することである。

施設定員Dataの正式な表・構造はData Canon側で所有する。

CH3のStory上の役割は、

> **53人が偶然の人数ではない**

と示すこと。

---

## 8. CH4 — UNKNOWN-07に名前を戻す

### 疑問

> 名前のないIDは誰なのか？

### 学習

- INNER JOIN
- ON
- 複数表のキー関係

### Story Function

RESIDENT_CACHEだけを見ると、

```text
UNKNOWN-07
```

でしかない。

PERSON_INDEXとACCESS_LOGを関係づけることで、

```text
UNKNOWN-07
=
如月アヤ
=
事故後もS4-P6を通過した人物
```

という事実へ到達する。

これはNEON RELAYにおける最初の強いRTP先行例。

### Aya Reveal

CH1〜CH3では、アヤの顔や明示的正体を前面に出さない。

CH4 JOIN成功後に初めて、

```text
UNKNOWN-07
→ 如月アヤ
```

という人物として視覚・物語の報酬を与える。

---

## 9. CH5 — RECORD RECOVERY / RELATIONAL INVESTIGATION

CH5は**読み物ではない。プレイ可能な最終調査章**とする。

旧仕様:

```text
CH5 = 読み物
プレイヤーは解かない
```

は撤回する。

CH5では、

```text
復元
↓
不一致
↓
プレイヤー自身の疑問
↓
SQL Investigation
↓
53人の所在
```

を一本のStory Flowとして扱う。

---

## 10. CH5 PHASE 1 — 壊れた記録を復元する

同期喪失後、第4セクター避難受付端末から破損した記録が回収される。

例:

```text
EVAC_RECEPTION
E442
resident_id = 欠損
terminal_id = T-S4-03
received_at = 23:09
```

別の認証記録には、

```text
TERMINAL_LOG
T-S4-03
authenticated_resident = R005
authenticated_at = 23:09
```

が残っている。

プレイヤーはRelation Taskによって、

```text
E442
→ T-S4-03 / 23:09
→ TERMINAL_LOG
→ R005
```

と関係をたどり、

```text
E442.resident_id = R005
```

をRECONSTRUCTED FACTとして復元する。

### 重要

これは三択クイズとして扱わない。

Story上では、

```text
答えを選ぶ
```

のではなく、

```text
破損記録
→ 対応するSOURCE RECORD
→ 照合
→ 復元
```

という監査作業である。

---

## 11. CH5 PHASE 2 — R005の不一致

R005は既存記録上、

```text
RESIDENT_CACHE
resident_id = R005
status = MISSING
last_sector = S2
```

として存在する。

しかし復元された新しい記録では、

```text
EVAC_RECEPTION
R005
S4受付端末
23:09
```

に現れる。

これをNORAは即座に説明しない。

NORAは、

```text
「S2なのにS4です。異常です」
```

とは言わない。

プレイヤー自身が既存Dataを見たとき、

> 「R005はS2だったはずでは？」

と気づく余地を残す。

この不一致をCH5最初の**PLAYER-GENERATED QUESTION**の種とする。

---

## 12. CH5 PHASE 3 — PLAYER QUESTION

主人公の調査は、Storyから直接SQLを命令される形から離れる。

理想的な流れ:

```text
RECONSTRUCTED FACT:
R005はS4受付に存在した

↓

既存RAW FACT:
R005.last_sector = S2

↓

PLAYER NOTICE:
「記録が食い違っている」

↓

PLAYER QUESTION:
「同じような人物は他にもいるのか？」
「どちらの記録が後に書き換わった？」
「S4にいたのにS2扱いされた人物は何人いる？」
```

NORAは必要なら操作支援を行うが、問いそのものを先に奪わない。

---

## 13. CH5 PHASE 4 — SQL INVESTIGATION

CH5では、CH1〜CH4で覚えたSQLを再利用する。

目的は、

```text
新しい構文を覚えること
```

だけではなく、

```text
自分の疑問をDataへ投げること
```

へ移る。

使う可能性のある能力:

```text
WHERE
GROUP BY
HAVING
JOIN
COUNT
LEFT JOIN
NOT EXISTS
```

すべてを一度に強制する必要はない。

Missionごとの具体的SQLはChapter Spec / Learning Spec側で所有する。

---

## 14. CH5 PHASE 5 — 53人の所在

最終調査では、

```text
ACCESS_LOG
×
TRANSIT_SHADOW
```

の関係から、53人の所在へ進む。

物語上の目標:

```text
NORTH-LATTICE
53
```

という結論を、Story Textから先に教えない。

プレイヤー自身のQuery Resultとして出現させる。

重要:

```text
「53人はNORTH-LATTICEにいる」
```

という命題は、単一の表にそのまま保存しない。

複数記録の交差・集計・存在 / 不存在の関係から成立するDerived Factとする。

---

## 15. CH5 PHASE 6 — 物語解決

53人の所在がDataから確定した後に、Storyが意味を与える。

ここで初めて、

- ORISON
- 如月アヤの判断
- 53人がなぜ行政上消されたのか
- NORAの起源
- PROJECT MIRROR

を物語として回収する。

順番は必ず、

```text
PLAYER DISCOVERY
↓
DATA RESULT
↓
STORY INTERPRETATION
```

を優先する。

StoryがQueryより先に真相を説明しない。

---

## 16. NORAの進化

| 章 | NORAの役割 |
|---|---|
| CH1 | 手取り足取り教える。「まずWHEREを使ってください」 |
| CH2 | 半分黙る。「集計が必要です」まで |
| CH3 | 主人公に質問される側になる |
| CH4 | 主人公の判断そのものを問う |
| CH5前半 | Relation / SQLの操作支援はするが、Dataの意味を先に説明しない |
| CH5後半 | 主人公が何に気づくかを待つ |

CH5終盤では、

> 「何か異常がありますか？」

とNORAが主人公に問う。

主人公:

> 「……まだ分からない。」

この返答は、

```text
「異常はない」
```

でも、

```text
「答えはこれだ」
```

でもない。

主人公が、回答を受け取るのではなく、自分で調査を続ける人間になったことを示す。

---

## 17. オープニング

起動時に表示。

所要2〜3分を上限目安とする。

### 画面1：タイトル

```text
CASE 53 — NULL RAIN
西暦2043年 東京湾上 環状都市カナタ
```

Button:

```text
▶ 第4アーカイブへ
```

### 画面2：プロローグ

- 「西暦2043年。カナタは都市OS《CIVIS》が管理していた。」
- 「その夜、あなたは第九保全局の臨時監査員として呼ばれた。」
- 「三日前、都市OSは17分間だけ住民台帳との同期を失った。翌朝、53人の住民が行政上『存在しなかったこと』になっていた。」

### 画面3：NORA起動

```text
ARCHIVE NODE 04
NETWORK: ISOLATED
USER: TEMP-AUDITOR
QUERY PRIVILEGE: LEVEL 1
```

NORA:

> 「聞こえますか。私はNORA。第4アーカイブの補助エージェントです。」

### 画面4：CIVIS公式報告

```text
CIVIS OFFICIAL REPORT

CASUALTIES: 0
MISSING: 0
DATA INTEGRITY: RESTORED
```

NORA:

> 「これが都市の回答です」

主人公:

> 「じゃあ53人は？」

NORA:

> 「分かりません」

主人公:

> 「調べられないのか？」

NORA:

> 「いいえ。私に質問するのではなく、
> データベースに質問してください」

---

## 18. CH1チュートリアル

CH1はSQL初心者の導入として、NORAが手取り足取り教えてよい。

### Tutorial Sequence

1. NORA「まず、条件を指定する命令がWHEREです」
2. SELECT
3. resident_id
4. display_name
5. FROM
6. RESIDENT_CACHE
7. WHERE
8. status = 'MISSING'
9. AND
10. last_sector = 'S4'
11. NORA「▶ 実行 をタップしてください」
12. 実行

初回Tutorial Assistanceは、通常のassistLevel評価から除外してよい。

TutorialのStory上の目的は、

```text
NORAが教える
```

体験を明確に作ること。

CH5でNORAが黙るための対比になる。

---

## 19. 学習問題と世界観

NEON RELAYでは、

```text
STORY MODE
CERTIFICATION MODE
FE PRACTICE MODE
```

のように、学習問題を物語から切り離さない。

FEで問われるDatabase / SQL能力を扱う場合も、

```text
主人公がこの世界で
そのDataを調べる必要がある
```

という状況として発生させる。

したがって、

```text
商品表
仕入先ID
A社
現実世界の試験問題をそのまま表示
```

など、NEON RELAYと無関係な教材用世界を本編に挿入しない。

試験問題の**構造**は利用してよい。

しかし題材とStory FunctionはNEON RELAY世界へ統合する。

---

## 20. 新しいStory Fact

新しいStory Factの追加を禁止しない。

新しいFactが、

```text
既存Dataとの不一致
新しい疑問
新しいMission
新しいSQL Investigation
```

へ繋がるなら積極的に利用できる。

ただし、

- 同一人物へ説明なく別IDを付ける
- 既存設定と無自覚に衝突する
- 問題を成立させるだけでStory上の意味を持たない

ものは避ける。

矛盾はErrorではない。

**意図された矛盾はMysteryになる。**

---

## 21. エンディング

旧仕様:

```text
CH4クリア後にEnding
```

は撤回する。

EndingはCH5の最終調査後。

53人の所在がQuery Resultとして成立した後、Story Resolutionを経てEndingへ進む。

### Ending Scene

都市は表面上正常化する。

```text
CITY STATUS: NORMAL
```

主人公はRAW QUERY MODEを開く。

NORA:

> 「何か異常がありますか？」

主人公:

> 「……まだ分からない。」

END。

このEndingで説明文を追加しすぎない。

特に、

```text
「だから調べる」
「答えを疑うことが大事だ」
```

等のテーマ解説を主人公に言わせない。

行動そのものをEndingにする。

---

## 22. Mastery / Assist

assistLevelは、

```text
どれだけ支援を借りたか
```

を見る。

Story上の主人公の価値やEndingを変えるための道徳スコアにはしない。

章ごとの支援傾向:

```text
CH1: Tutorial中心
CH2: Hintあり
CH3: Hint削減
CH4: 自力推奨
CH5: プレイヤーの問いを待つ
```

初心者がHintを使ってもStoryは最後まで到達できる。

---

## 23. 章末の情報量

章頭・章末の長文を避ける。

基本:

```text
Mission
→ Player Action
→ Evidence
→ Story Beat
```

章末では、

```text
「わかったこと」
```

を短く表示してよい。

ただし、プレイヤー自身が気づくべき不一致まで自動解説しない。

特にCH5のR005 S2/S4不一致は、復元直後にNORAが説明しない。

---

## 24. 実装へのStory制約

- CH1〜CH5のNORA台詞は、この成長曲線に沿う
- NORAは章を追うごとに説明量を減らす
- Relation Taskを「クイズ」「正解」「三択問題」としてStory上扱わない
- Relation Taskは記録復旧・照合・監査として存在する
- SQL ResultはStory Textより先に重要Factを見せられる
- StoryはDataから得たEvidenceに意味を与える
- Playerが気づけることをNORAが先に言わない
- 新しいStory Factは、調査を前進させるなら追加可能
- CH5はplayable final investigation
- CH5最終Queryより前に53人の所在を明示しない

---

## 25. 現在の章進行

```text
OPENING

↓

CH1
公式報告を疑う
WHERE / AND

↓

CH2
物資集中
GROUP BY

↓

CH3
83 / 30 / 53
HAVING / SET COMPARISON

↓

CH4
UNKNOWN-07 = 如月アヤ
JOIN

↓

CH5
RECORD RECOVERY
R005 S2/S4 discrepancy
RELATIONAL INVESTIGATION
FINAL QUERY
53 people / NORTH-LATTICE

↓

STORY RESOLUTION

↓

ENDING
CITY STATUS: NORMAL
RAW QUERY MODE
「……まだ分からない。」
```

---

## 26. 次作への伏線

- PROJECT MIRROR
- 4,812人の消失
- NOT EXISTS / absence reasoning
- MIRROR DISTRICT

次作への伏線は、NEON RELAY本編の最終QueryとEndingを食わない量に抑える。

---

## 27. 一文での物語

> **53人が消えた都市で、AIの答えを受け取っていた臨時監査員が、記録を照合し、SQLで関係を確かめ、自分自身の問いを持つ人間になる物語。**
