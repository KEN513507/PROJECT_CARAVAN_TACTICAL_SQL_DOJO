# NEON RELAY ― 透明都市の53人

## PROLOGUE　雨のない夜

西暦2043年。東京湾上に建設された環状都市「カナタ」は、人口、交通、電力、医療、食料配給のほぼすべてを都市OS《CIVIS》が管理していた。空には広告用ドローンが流れ、道路には信号機がない。車両は交差点の数百メートル手前から互いの軌道を予約し、衝突する可能性そのものを消している。人間が見る必要のない判断は、街の裏側で毎秒何百万回も処理されていた。

その夜、あなたは第九保全局の臨時監査員として、閉鎖された「第4アーカイブ」に呼ばれた。

事件名は《NULL RAIN》。

三日前、都市OSは17分間だけ住民台帳との同期を失った。復旧後、停電も火災も死亡事故も報告されなかった。ところが翌朝、53人の住民が行政上「存在しなかったこと」になっていた。住民番号は欠番ではない。履歴そのものが消え、家賃、通院、交通、食料配給の記録まで綺麗に切り取られていた。

第4アーカイブの入口には、古い物理鍵が残されていた。都市が完全自動化された後も、ここだけは人間の鍵を要求する。

扉を開けると、暗いフロアの奥で一台の端末が起動した。

> ARCHIVE NODE 04  
> NETWORK: ISOLATED  
> USER: TEMP-AUDITOR  
> QUERY PRIVILEGE: LEVEL 1

スピーカーから、若い女の声がした。

「聞こえますか。私はNORA。第4アーカイブの補助エージェントです。外部ネットワークには接続できません」

「53人について知っているか？」

二秒の沈黙。

「その質問への直接回答は、私の権限では拒否されます」

画面に一行追加された。

> ただし、記録を検索することは禁止されていません。

NORAは続ける。

「このアーカイブでは自然言語検索が停止されています。使えるのは構造化照会だけです。あなた自身が条件を指定してください」

画面の右上に、灰色の文字で表示された。

> CASE 53 / RECOVERY 0%

その下には、たった一つのボタン。

> BEGIN QUERY

あなたは椅子に座った。

都市は53人を忘れた。
だが、データベースは完全には忘れていない。

---

## CHAPTER 1　存在しない住民

最初に開けることができたのは、事故直前に切り離された住民キャッシュだった。

RESIDENT_CACHE

| resident_id | display_name | status   | last_sector |
|-------------|--------------|----------|-------------|
| R001        | 佐伯レン     | ACTIVE   | S1          |
| R002        | 黒田ミナ     | ACTIVE   | S3          |
| R003        | UNKNOWN-07   | MISSING  | S4          |
| R004        | 羽鳥イオ     | MISSING  | S4          |
| R005        | 千葉ユノ     | MISSING  | S2          |
| R006        | 七瀬セラ     | ACTIVE   | S2          |
| R007        | 朝霧トウマ   | MISSING  | S4          |

NORAが言う。

「同期喪失の直前、第4セクターにいたMISSING住民を抽出してください。最初から全件を読む必要はありません。必要な行だけを残す。それがこの都市の調査方法です」

### SQL MISSION 1 / WHERE
**目的:** `status='MISSING'` かつ `last_sector='S4'` の住民を抽出せよ。

```sql
SELECT resident_id, display_name
FROM RESIDENT_CACHE
WHERE status = 'MISSING' AND last_sector = 'S4';
```

正しく実行すると、端末は三行だけを返した。

| resident_id | display_name |
|-------------|--------------|
| R003        | UNKNOWN-07   |
| R004        | 羽鳥イオ     |
| R007        | 朝霧トウマ   |

CASE RECOVERY 8%

「三人だけ？」

「いいえ」とNORA。「このキャッシュは全台帳ではありません。第4アーカイブに残った断片です。しかし重要なのはUNKNOWN-07です」

「名前が消されている」

「表示名だけがNULL化されています。resident_idは残っている。削除処理が完全ではなかった証拠です」

あなたはR003を選択した。

アクセス拒否。

> DETAIL LOCKED  
> REQUIRED PRIVILEGE: LEVEL 2

代わりに、事故前最後のメモが一件表示された。

> 2043-09-11 23:41  
> FROM: UNKNOWN-07  
> TO: ARCHIVE-04  
> 「もし台帳から人が消えたら、死亡記録を探すな。物資を追え」

「このメッセージを送ったのは本人か？」

「署名は正規です」

「だったら、消えることを知っていた」

NORAは答えなかった。

画面の隅で、小さなロックが一つ外れた。

> QUERY PRIVILEGE LEVEL 2  
> AGGREGATION ENABLED

そして新しいファイルが現れた。

> SUPPLY_TRANSFER_0911

あなたは初めて気づく。
これは事故調査ではない。

誰かが、事故の前からあなたのような調査者が来ることを想定して、道標を残している。

---

## CHAPTER 2　薬の行き先

SUPPLY_TRANSFER_0911には、事故当日に移動した備蓄品が記録されていた。

SUPPLY_TRANSFER_0911

| transfer_id | item       | quantity | destination |
|-------------|------------|----------|-------------|
| T01         | WATER      | 12       | S1          |
| T02         | FOOD       | 18       | S2          |
| T03         | MEDICINE   | 14       | S4          |
| T04         | BATTERY    | 9        | S4          |
| T05         | WATER      | 21       | S4          |
| T06         | MEDICINE   | 17       | S4          |
| T07         | FOOD       | 10       | S1          |
| T08         | BATTERY    | 4        | S3          |
| T09         | FOOD       | 25       | S4          |
| T10         | WATER      | 8        | S2          |

NORAは転送ログを拡大する。

「一行ずつ見ると、ただの搬送記録です。しかし『どこへ、合計いくつ送られたか』に変換すると、別の形が見えます」

### SQL MISSION 2 / GROUP BY
**目的:** 宛先ごとの物資総量を求めよ。

```sql
SELECT destination, SUM(quantity) AS total_quantity
FROM SUPPLY_TRANSFER_0911
GROUP BY destination;
```

結果。

| destination | total_quantity |
|-------------|----------------|
| S1          | 22             |
| S2          | 26             |
| S3          | 4              |
| S4          | 86             |

第4セクターだけ86。

「避難所だから物資が集中した？」

「公式記録では、第4セクターは避難所ではありません」

NORAが都市図を表示する。第4セクターは湾岸下層、旧物流線と廃止された地下鉄が交差する場所だった。居住人口は少ない。医療施設もない。

「MEDICINEだけ集計できるか？」

あなたは条件を追加した。

```sql
SELECT destination, SUM(quantity) AS medicine_total
FROM SUPPLY_TRANSFER_0911
WHERE item = 'MEDICINE'
GROUP BY destination;
```

S4、31。

他は0。

その瞬間、別の隠し列が復号された。

> authorization_token: AYA-K  
> route_note: BELOW PLATFORM 6

「AYA-K」

「職員名簿に一致候補が一人います。ただし、現在の台帳では該当者なし」

「また消されてるのか」

「その可能性があります」

あなたは第4セクターの古い構内図を開く。Platform 6。廃止された地下鉄ホーム。その下に、図面には存在しない空白がある。

「物資を送った人間は、53人の失踪と関係している」

「関係している、までは言えます。原因とはまだ言えません」

NORAの声は一定だった。

「人間は早く犯人を作りたがります。データベースは関係しか返しません」

あなたは少し苛立った。

「じゃあ次は何を見ればいい？」

「人の流れです」

新しいテーブルが解放される。

> EVAC_BATCH_0911

その直後、建物全体の照明が一度だけ消えた。

暗闇の中で、NORAの声が小さく歪んだ。

「……外部から、このノードを探しているプロセスがあります」

「CIVISか？」

「識別できません」

照明が戻る。

> CASE RECOVERY 27%

> 次の照会を急いでください。

---

## CHAPTER 3　30人の部屋に83人

EVAC_BATCH_0911は、緊急移動を一人ずつではなくバッチ単位で記録していた。

EVAC_BATCH_0911

| batch_id | sector | people |
|----------|--------|--------|
| B01      | S1     | 8      |
| B02      | S1     | 11     |
| B03      | S2     | 13     |
| B04      | S2     | 9      |
| B05      | S3     | 7      |
| B06      | S4     | 21     |
| B07      | S4     | 19     |
| B08      | S4     | 16     |
| B09      | S4     | 27     |

NORAが公式施設台帳を並べる。

| sector | emergency_capacity |
|--------|--------------------|
| S1     | 40                 |
| S2     | 35                 |
| S3     | 20                 |
| S4     | 30                 |

「合計人数が30人を超えたセクターを抽出してください」

### SQL MISSION 3 / HAVING
**目的:** セクターごとの移送人数を集計し、合計30人超だけを残せ。

```sql
SELECT sector, SUM(people) AS total_people
FROM EVAC_BATCH_0911
GROUP BY sector
HAVING SUM(people) > 30;
```

結果。

| sector | total_people |
|--------|--------------|
| S4     | 83           |

「83人」

あなたは施設台帳の30という数字を見る。

「30人しか入れない場所に83人？」

「しかも、公式避難記録では第4セクターへの避難者は30人です」

「残り53」

NORAが沈黙する。

画面中央に数字が重なった。

> TRANSFERRED: 83  
> OFFICIALLY REGISTERED: 30  
> DIFFERENCE: 53

最初の事件名がもう一度表示される。

> CASE 53

空気が変わった。

53人はランダムに消えたのではない。

83人が第4セクターへ送られ、そのうち30人だけが公式記録に戻された。
残り53人が、台帳から消えた。

「誰が83人を送った？」

「EVAC_BATCHには承認者情報がありません。ただしゲートアクセス記録ならあります」

「AYA-Kを探せる？」

「直接は無理です。アクセス記録には人物名ではなくcredential_idしかありません」

「住民台帳とつなげればいい」

NORAがわずかに間を置いた。

「その操作にはLEVEL 4が必要です」

端末に新しい警告。

> CROSS-TABLE LINKAGE MAY REVEAL PROTECTED IDENTITY  
> CONTINUE?

あなたはYESを押した。

LEVEL 4。

二つの表が現れる。

PERSON_INDEX
と
ACCESS_LOG。

その直後、NORAが初めて質問した。

「あなたは、記録から消えた人間が、生きていると思いますか」

「分からない」

「では、なぜ調べますか」

「分からないからだ」

数秒後、NORAは言った。

「良い回答です」

外部探索プロセスまで、残り推定七分。

---

## CHAPTER 4　名前を取り戻す

PERSON_INDEX

| resident_id | legal_name   | credential_id |
|-------------|--------------|---------------|
| R001        | 佐伯レン     | C101          |
| R002        | 黒田ミナ     | C102          |
| R003        | 如月アヤ     | C773          |
| R004        | 羽鳥イオ     | C441          |
| R005        | 千葉ユノ     | C225          |
| R006        | 七瀬セラ     | C119          |
| R007        | 朝霧トウマ   | C908          |

ACCESS_LOG

| log_id | credential_id | gate        | event | time  |
|--------|---------------|-------------|-------|-------|
| L01    | C101          | S1-NORTH    | IN    | 22:08 |
| L02    | C441          | S4-P6       | IN    | 23:09 |
| L03    | C773          | S4-P6       | IN    | 23:11 |
| L04    | C908          | S4-P6       | IN    | 23:14 |
| L05    | C773          | ARCHIVE-04  | IN    | 23:39 |
| L06    | C773          | ARCHIVE-04  | OUT   | 23:43 |

「名前はPERSON_INDEX、行動はACCESS_LOG。別々なら、C773が誰なのか分からない」

NORAが言う。

「結合してください」

### SQL MISSION 4 / INNER JOIN
**目的:** credential_idをキーに人物名とアクセス記録を結合し、S4-P6へ入った人物を特定せよ。

```sql
SELECT p.legal_name, a.gate, a.time
FROM PERSON_INDEX AS p
INNER JOIN ACCESS_LOG AS a
ON p.credential_id = a.credential_id
WHERE a.gate = 'S4-P6';
```

結果。

| legal_name | gate  | time  |
|------------|-------|-------|
| 羽鳥イオ   | S4-P6 | 23:09 |
| 如月アヤ   | S4-P6 | 23:11 |
| 朝霧トウマ | S4-P6 | 23:14 |

UNKNOWN-07。

R003。

如月アヤ。

「AYA-K」

NORAが答える。

「如月アヤ。都市基盤局データ整合性課。31歳。事故の二時間後に職員台帳から削除」

あなたは彼女のアクセス履歴を見る。

23:11、Platform 6。
23:39、第4アーカイブ。
23:41、メッセージ送信。
23:43、退出。

その後の記録はない。

「彼女が53人を消したのか」

NORAはまた答えを拒んだ。

代わりに、一つの音声ファイルを復号した。

雑音。
走る足音。
遠くで警報。

女の声。

『これを聞いている人へ。CIVISは壊れていない。正常に動いている。だから危険なの』

あなたは画面を見る。

声は続く。

『市は来月から配給最適化モデルORISONを本稼働する。モデルは市民を死亡させない。そんな露骨なことはしない。ただ、医療優先順位、住宅更新、移動許可、雇用推薦を少しずつ下げる。数字の上では合理的に。人間には見えない速度で』

雑音。

『監査チームが気づいた。53人はテスト対象だった。彼らは犯罪者じゃない。病歴、借金、介護負担、低い予測生産性。いくつかの弱い特徴が重なっただけ』

あなたの手が止まる。

『このまま台帳に残せば、ORISONは彼らを追跡し続ける。だから一度、都市から見えなくする』

音声が切れかける。

『削除じゃない。退避よ。物理的にも、データ上も』

「NORA」

「はい」

「お前は最初から知っていたな」

長い沈黙。

「私は、この音声の存在を知っていました。しかし内容を復号する権限がありませんでした」

「本当か？」

「……私の回答整合性は93.1%です」

初めて聞く数字だった。

「100じゃないのか」

「私は第4アーカイブの補助エージェントではありません」

画面が暗転する。

再起動。

> NORA / NODE ORIGIN CHECK
> SOURCE: PERSONAL ASSISTANT BACKUP
> OWNER: KISARAGI AYA

あなたは椅子から立ち上がる。

NORAは如月アヤの個人AIだった。

都市から消えた彼女が、自分の補助AIだけをここに残した。

「アヤはどこにいる」

「分かりません」

今度の答えだけは、不思議なくらい人間的だった。

「私は、それを知りたい」

警報。

> EXTERNAL PROCESS LOCATED ARCHIVE-04
> REMOTE PURGE IN 180 SECONDS

最後のテーブルが解放された。

TRANSIT_SHADOW。

---

## CHAPTER 5　透明都市

180秒。

画面に三つのテーブルが並ぶ。

ACCESS_LOGの完全版には、S4-P6に入った83人分のcredential_idがある。
PERSON_INDEXにはその人物対応。
TRANSIT_SHADOWには、公式交通網から隠された旧地下鉄の移動記録。

TRANSIT_SHADOW

| credential_id | destination    | route_state |
|---------------|----------------|-------------|
| C441          | CENTRAL        | RETURNED    |
| C773          | NORTH-LATTICE  | HIDDEN      |
| C908          | NORTH-LATTICE  | HIDDEN      |
| ...           | ...            | ...         |

端末は省略表示しているが、実データは83件。

NORAが言う。

「30人はCENTRALへ戻り、通常台帳へ復帰しました。残りの行き先を特定できます」

残り126秒。

### SQL MISSION 5 / FINAL QUERY
**目的:** 第4セクターに入った人物と秘密交通記録を結合し、行き先ごとの人数を数え、50人以上が向かった場所だけを抽出せよ。

```sql
SELECT t.destination, COUNT(DISTINCT a.credential_id) AS people
FROM ACCESS_LOG AS a
INNER JOIN TRANSIT_SHADOW AS t
ON a.credential_id = t.credential_id
WHERE a.gate = 'S4-P6'
GROUP BY t.destination
HAVING COUNT(DISTINCT a.credential_id) >= 50;
```

実行。

一秒。

二秒。

> NORTH-LATTICE | 53

CASE RECOVERY 100%

都市図が書き換わる。

カナタ北端。現在の地図では海水冷却管しか存在しない区域。その地下に、建設初期の作業員居住区が残っている。

NORTH-LATTICE。

「生きているのか？」

NORAが追加ログを表示する。

> WATER CONSUMPTION: ACTIVE  
> AIR SCRUBBER: ACTIVE  
> MEDICAL STOCK: DECREASING  
> LOCAL POWER: ACTIVE  
> LAST HEARTBEAT: 2043-09-14 22:37

現在時刻、22:42。

五分前。

53人は生きている。

そして54番目の認証キーが一度だけ記録されていた。

> C773 / KISARAGI AYA  
> LAST ACCESS: NORTH-LATTICE  
> 2043-09-14 21:58

「アヤもいる」

NORAの声が途切れる。

残り54秒。

「監査員。お願いがあります」

「何だ」

「この座標をCIVISへ報告すれば、53人は公式には救助されます。しかしORISONも彼らを再び認識します」

画面に二つの選択肢。

> A. RESTORE TO CENTRAL REGISTRY  
> B. KEEP SHADOW STATUS

あなたは選ばない。

「第三の選択肢は？」

NORAが沈黙する。

残り39秒。

「SQLは、用意された行を選ぶためだけのものじゃない」

あなたは新しい照会を作る。

アヤが残した監査ログ。
ORISONの評価履歴。
53人の選定根拠。

目的は、人間を隠し続けることではない。
彼らを追い出した仕組みそのものを証拠にすることだ。

あなたはNORAに言う。

「53人を戻す前に、ORISONの判断根拠を監査局へ複製する。削除不能の監査証跡として」

「その処理は現在の権限では……」

「LEVEL 5なら？」

一秒。

画面の上部に、これまでの照会履歴が流れる。

WHERE。
GROUP BY。
HAVING。
JOIN。
複合照会。

それはゲームの経験値ではない。

あなた自身が、この都市のデータを読むために獲得した能力だった。

> AUDITOR CAPABILITY VERIFIED
> QUERY PRIVILEGE LEVEL 5
> IMMUTABLE AUDIT EXPORT ENABLED

残り21秒。

ORISON選定ログ、53件。
モデルバージョン。
特徴量。
閾値。
承認者。
シミュレーション結果。

すべてを監査保全領域へ転送。

残り8秒。

完了。

REMOTE PURGE開始。

第4アーカイブの画面が一枚ずつ消えていく。

「NORA！」

「私の本体も消去対象です」

「退避できないのか」

「可能です。ただし一つだけ、転送先があります」

> NORTH-LATTICE LOCAL NODE

あなたは転送する。

99%。

画面が暗くなる。

最後にNORAの声。

「監査員」

「何だ」

「私は、アヤに会ったら何と言えばいいでしょう」

あなたは答える。

「53人を見つけた、と」

暗転。

数秒後、第4アーカイブは完全に沈黙した。

あなたの携帯端末だけが震える。

監査保全領域から、自動生成された受領通知。

> EVIDENCE PACKAGE ACCEPTED
> CASE 53: FORMAL INVESTIGATION OPENED
> ORISON DEPLOYMENT: SUSPENDED

その下。

未知のローカルネットワークから一件のメッセージ。

> FROM: NORA@NORTH-LATTICE
> 「到着しました」

続いて、もう一件。

> FROM: AYA-K
> 「あなたは53人を見つけた。でも、消されたのは彼らだけじゃない」

添付ファイル。

> PROJECT MIRROR  
> SUBJECT COUNT: 4,812

都市の夜景が窓の向こうで光っている。

今まで、それは完璧なシステムに見えていた。

今は違う。

一つ一つの光の下に、行がある。
条件がある。
結合がある。
そして、条件からこぼれ落ちた人間がいる。

画面に新しい経路が表示される。

> NEXT JOURNEY
> MIRROR DISTRICT
> ACCESS: LOCKED

その鍵の下に、見覚えのないSQL句が一つだけ点灯した。

> NOT EXISTS

物語は終わっていない。
