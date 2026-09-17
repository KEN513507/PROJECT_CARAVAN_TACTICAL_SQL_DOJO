````markdown
# NEON RELAY ― CH1 Design Constitution

Status: **DESIGN_GUARDRAIL = ACTIVE**

Scope: **CH1**

Purpose:  
この文書は実装手順ではなく、CH1の物語・学習・UX設計で絶対に崩してはいけない原則を固定する。

---

## 1. Core Principle

NEON RELAYは、

**SQL教材に物語を付けるゲームではない。**

SQLで照会する行為そのものを、物語上の調査行為にする。

プレイヤー体験は、

```text
違和感
→ 操作
→ SQL照会
→ 生データ
→ 矛盾
→ 自分で解釈
````

の順で進む。

---

## 2. Player Role

主人公の成長は、

```text
AIの回答を受け取る人
↓
回答の根拠を自分で確認する人
```

である。

SQLは構文暗記ではなく、

**「自分で事実を確認する手段」**

として扱う。

---

## 3. CIVIS / RAW QUERY

CIVISの回答と元データは同一ではない。

```text
CIVISの回答
≠
元データ
≠
現実そのもの
```

RAW QUERY MODEは、
AIの解釈を介さず監査データを直接確認するためのREAD-ONLY経路である。

SQLを魔法やハッキングとして描かない。

---

## 4. NORA

NORAは教師ではない。

禁止:

* 正解を先回りして説明する
* プレイヤーが気づくべき矛盾を先に解釈する
* 世界設定を長文で解説する
* SQL講師として振る舞う

原則:

> プレイヤーが気づけることを、NORAが先に言わない。

---

## 5. CH1 Narrative Contract

CH1は単一テーブル `RESIDENT_CACHE` の WHERE を扱う。

目的:

```text
S4でMISSINGだった住民を確認する
```

正解結果:

```text
R003  UNKNOWN-07
R004  羽鳥イオ
R007  朝霧トウマ
```

重要なのは、

**R003が生データに存在することをプレイヤー自身が確認すること。**

NORAはこの矛盾を先に説明しない。

---

## 6. Evidence First

正解後はまず結果を見せる。

説明、評価、NORA、演出よりもEvidenceを優先する。

CH1では約800msのSilenceを設けてよい。

その間、

* 結果を主役にする
* 不要な入力UIを隠す
* 解釈を押し付けない
* 「SILENCE」等の説明ラベルを出さない

Silenceは待ち時間ではなく、
プレイヤーが結果を処理する時間である。

---

## 7. Hint Philosophy

Hintは答えを渡すためではなく、
思考を段階的に支援するために使う。

基本順序:

```text
通常の不正解
→ 概念ヒント
→ 構造ヒント
→ 穴埋め
→ 完全形
```

完全形を見た場合は、
自力Masteryとして扱わない。

---

## 8. Story Clear / Mastery

章を進められることと、
技能を習得したことを分離する。

```text
INDEPENDENT
= 自力

ASSISTED
= 支援あり

PRACTICE
= 完全形参照
```

`cleared === true` だけでMASTERED判定しない。

---

## 9. Mobile UX

CH1はiPhone縦持ちを基準とする。

固定原則:

```text
100dvh
zero page scroll
主要操作はviewport内
主要tap target >= 44px
```

SQL作業中に常時必要なのは原則、

```text
Mission
Schema
Query
Token Pad
Action
```

だけ。

NORA、Hint、Prediction、Timeout等は、
通常Workspaceを恒常的に圧迫しない。

---

## 10. Character Usage

キャラクターを常駐させない。

主人公画像は状態表現としてのみ使う。

SQL入力中は、
Schema / Query / Tokensを主役にする。

アヤはCH1で表示しない。

---

## 11. Aya Rule

アヤは希少なStory Rewardである。

CH1〜CH3では正体を視覚的に明示しない。

CH4 JOIN成功前に顔や正体を見せない。

時間だけで登場演出を発火させない。

必ず物語上の発見イベントと同期する。

---

## 12. No Gratuitous Gamification

監査権限や物語上の進展を、

```text
LEVEL UP
NEW ABILITY
+500 XP
```

のような演出で表現しない。

権限変更は無機質な監査ログとして扱う。

---

## 13. CH1 Scope Rule

CH1を安定させる前に、
CH2以降へ設計を横展開しない。

CH1の変更理由で、
CH2〜CH5のStory・SQL・UIを勝手に変更しない。

---

## 14. Final Design Test

CH1で最も重要な判定は一つ。

> プレイヤーが「SQL問題を解いた」と感じるより先に、
> 「R003が生データに存在することを自分で確かめた」と感じるか。

この原則に反する変更は、
自動テストがPASSしていても採用しない。

```
```
