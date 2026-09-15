# NEON RELAY ― 透明都市の53人
## CH1 Design Gate / 正式設計確定版

Status: **DESIGN_GATE = PASS**  
Implementation scope: **CH1 only**  
Human Visual Gate: **NOT RUN**  
CH2+ implementation: **HOLD**

---

## 1. 開発方針

NEON RELAY は「SQL教材に物語を付ける」のではなく、**SQLで照会する行為そのものを物語上の調査行為にする**。

プレイヤーに説明して理解させるのではなく、

```text
違和感
→ 操作
→ SQL照会
→ 生データ
→ 矛盾
→ プレイヤー自身の解釈
```

の順で体験させる。

### 固定原則

- iPhone縦持ち専用
- 100dvh / ゼロスクロール維持
- キャラクター常駐なし
- 主人公は状態のみ視覚化
- アヤは希少な Story Reward
- 権限解放は無機質な監査ログ
- NORA は教師にしない
- 世界設定は説明せず症状で見せる
- SQL結果そのものを物語にする
- Story Clear と Mastery を分離する
- CH1だけを先に完成させ、実機検証が通るまでCH2以降へ展開しない

---

## 2. 世界設定の裏側

2043年の環状都市「カナタ」では、都市OS「CIVIS」が自然言語要求から内部データ操作まで自動化している。

人間は長期間にわたり、

```text
質問
→ CIVISが回答
→ 人間が受理
```

という仕事を続けてきた。

その結果、人間側ではSQLや生データ照会がほぼ忘れられている。

重要なのは、

```text
CIVISの回答
≠ 元データ
≠ 現実そのもの
```

であるが、社会全体がこの区別を意識しなくなっていること。

古いAI監査規則のため、AIを経由しないREAD-ONLYの監査照会経路だけは残っている。
主人公は通常その権限を持たないが、第4アーカイブの異常事態によって一時監査権限を得る。

---

## 3. Actor定義

| Actor | 種別 | 役割 |
|---|---|---|
| 主人公 | プレイヤー投影 | カナタ市の一般職員。CIVISの回答を疑わず働いてきた |
| NORA | 制約付きAI | 監査補助。直接答えを渡す教師ではない |
| CIVIS | 都市OS | 市民生活・行政を自動化。回答が「事実」として扱われている |
| 如月アヤ | 失踪者 | データを直接読む監査技術を保持していた人物 |
| 監査規則 | 旧制度 | AIを介さないRAW QUERY権限を段階的に許可する仕組み |

---

## 4. 主人公の成長

主人公はスーパーハッカーにはならない。

変化は、

```text
AIの回答を受け取る人
→
回答の根拠を自分で確認する人
```

である。

SQLの習得は構文暗記ではなく、世界を確認する方法を獲得する過程として扱う。

---

## 5. アヤの時間軸

アヤはCH1〜CH3では顔も存在も明示しない。

```text
CH1〜CH3
  顔を見せない

CH4 JOIN成功
  unmasked
  「この人だった」

CH4終盤
  resolved
  「この人が決めた」

CH5
  departing
  「この人は去った」

53人生存確認後
  smile
  「53人は生きていた」
```

### 禁止

- CH4開始時にアヤを表示しない
- JOIN成功前に人物画像から正体を推測させない
- smileを3秒タイマーなど時間だけで発火させない

アヤの表示は必ず物語イベントに同期させる。

---

## 6. Silence設計

Silence は全正解後の共通処理にしない。

データ側で必要な場面だけ、

```js
storyBeat.silenceMs
```

のように指定可能にする。

### 確定値

| Chapter | Silence |
|---|---:|
| CH1 | 800〜1000ms |
| CH2 | 0ms |
| CH3 | 1500ms |
| CH4 | 1500ms |

Silence は「待ち時間」ではなく、結果をプレイヤー自身が処理する時間。

---

## 7. CH3 段階表示

CH3では結果を一度に説明しない。

```text
0.0s

83
30


0.7s

83
30
──


1.5s

83
30
──
53
```

台詞なし。

プレイヤーが先に「53」と気づく余地を作り、その後システム表示で確認させる。

---

## 8. 失敗時Hint設計

完全解答を早期に渡さない。

```text
1回目失敗
  自力

2回目失敗
  概念ヒント

3回目失敗
  構造ヒント

4回目失敗
  穴埋めSQL

5回目失敗
  完全形
```

### CH1例

- 2回目: `WHEREは行を絞る句です`
- 3回目: `SELECT → FROM → WHERE の順で組み立てます`
- 4回目: 欠けたトークンを埋める形式
- 5回目: 完全形を提示

### 評価区分

- `INDEPENDENT CLEAR`
- `ASSISTED CLEAR`
- `PRACTICE CLEAR`

完全形を見た章は `MASTERED` に含めない。

---

# 9. CH1 Implementation Scope

**全章一括改修は禁止。**

CH1のみ新設計で完成させる。
CH2以降のデータ・ストーリー・ロジックは今回変更しない。

---

## 9.1 CIVIS FIELD CONSOLE 導入

CH1開始時:

```text
0.0s

CITY STATUS: NORMAL


1.5s

CIVIS FIELD CONSOLE
QUERY PRIVILEGE: LEVEL 0
```

その後、第4アーカイブ側の異常処理として、

```text
ARCHIVE INCIDENT DETECTED
AUTOMATED AUDIT LAYER: UNTRUSTED
HUMAN AUDITOR REQUIRED

TEMPORARY QUERY PRIVILEGE
LEVEL 1
```

を表示。

これは「レベルアップ演出」ではない。
無機質なシステムログとして扱う。

### 禁止

```text
LEVEL UP!
+500 XP
NEW ABILITY!
```

のようなゲーミフィケーション演出は禁止。

---

## 9.2 NORA導入台詞

説明的な世界設定を語らせない。

### 採用する方向

```text
NORA
「RECORD NOT FOUND と表示された場合、それは該当なしの意味ではありません」

主人公
「……どういう意味？」

NORA
「CIVISが『該当なし』と回答しただけです」

主人公
「記録がないの？」

NORA
「見ていません。答えを見ています」
```

その後、RAW QUERY MODEへ遷移する。

### 目的

「AIの回答とデータは違う」とテーマを説明するのではなく、プレイヤー自身がこの差を体験する。

---

## 9.3 CH1 SQL Result

WHERE照会に成功すると、まず結果を表示する。

```text
R003  UNKNOWN-07
R004  羽鳥イオ
R007  朝霧トウマ
```

CIVIS側の `RECORD NOT FOUND` とこの結果が矛盾していることを、NORAが先に説明してはいけない。

プレイヤーが自分で、

```text
「存在しないと言われたR003が、生データにはいる」
```

と気づく余地を残す。

---

## 9.4 CH1 Silence

正解時の重要Story Beatとしてのみ使用。

推奨:

```text
0.0s
  R003  UNKNOWN-07
  R004  羽鳥イオ
  R007  朝霧トウマ

0.8s
  一時的に操作をロック
  主人公 mood = thinking

約0.8〜1.0秒後
  通常のResult/次のStory Beatへ
```

### 注意

UIに `SILENCE:` などの説明ラベルを出さない。

沈黙はシステム内部状態であり、プレイヤーへ「今は沈黙です」と説明しない。

---

## 9.5 Story Clear / Mastery分離

既存進捗との互換を壊さない形で、CH1のクリア種別を記録する。

設計例:

```json
{
  "clearedStages": [
    {
      "stage": 0,
      "type": "INDEPENDENT"
    }
  ]
}
```

許可値:

```text
INDEPENDENT
ASSISTED
PRACTICE
```

Mastery Reportでは区別して表示する。

- INDEPENDENT: 自力達成
- ASSISTED: ヒント使用
- PRACTICE: 完全形参照

`cleared === true` だけで `MASTERED` 判定してはいけない。

---

# 10. CH5に関する将来仕様

現在の「EPILOGUEを読むだけ」の構造は正式に廃止対象。

CH5は最終的に、

```text
既習SQLを統合して
プレイヤー自身が
NORTH-LATTICE / 53人の生存へ到達する
```

**統合照会章**へ変更する。

ただし今回のCH1実装ではCH5を変更しない。

---

# 11. State設計原則

将来のMission実行状態は以下に整理する。

```text
BUILDING
↓
PREDICT
↓
EXECUTING
↓
EVALUATING
├─ INCORRECT → RETRY
└─ CORRECT
      ↓
   STORY_BEAT
   （必要な章だけSilence）
      ↓
   RESULT
      ↓
   REVEAL
      ↓
   CHAPTER_TRANSITION
```

Silenceを全Mission共通の判定状態として固定しない。

---

# 12. CH1 Claude Code 実装契約

## 変更対象

- `js/data.js` のCH1関連のみ
- `js/ui.js` のCH1で必要なUI追加
- `js/app.js` のCH1フロー
- `css/style.css` のCH1演出
- `tools/ch1-check.js` 新規

## 変更禁止

- `STAGES[1..]` の内容
- CH2以降のStoryロジック
- 既存BGM/SFX
- 既存フォント
- 100dvh
- ゼロスクロール
- 既存overlap対応

## Verification

```bash
node --check js/app.js
node --check js/ui.js
node --check js/data.js
npm run overlap
node tools/ch1-check.js
```

---

# 13. Human Visual Gate

CH1実装後、iPhone実機で以下を確認する。

| # | 確認 | PASS条件 |
|---|---|---|
| 1 | CIVIS FIELD CONSOLE | 普通のゲーム画面ではなく、市職員端末を触っている感覚がある |
| 2 | NORA | 教師ではなく、「回答」と「記録」の差を示す監査AIに感じる |
| 3 | WHERE実行 | 「問題に正解した」より「R003を自分で確認した」が先に来る |
| 4 | 3行の結果 | CIVISとの矛盾を説明される前に自分で気づく |
| 5 | Hint | 答えを渡された感覚ではなく、考える支援になっている |
| 6 | Clear評価 | 自力・補助・練習の違いが理解できる |

### Gate rule

1項目でも明確にFAILなら、CH2以降の新設計実装へ進まない。

---

# 14. Final Gate

```text
DESIGN_GATE = PASS
IMPLEMENTATION_SCOPE = CH1_ONLY
HUMAN_VISUAL_GATE = NOT_RUN
CH2_PLUS_IMPLEMENTATION = HOLD
```

次の正式工程:

```text
CH1実装
→
iPhone実機 Human Visual Gate
→
感覚が通れば CH2〜CH5 へ展開
```

最重要判定:

> プレイヤーが「SQL問題を解いている」のではなく、
> 「R003の存在を自分で確かめている」と感じるか。
