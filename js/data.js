// js/data.js
// NEON RELAY ― 透明都市の53人
//
// このファイルの TABLES / STAGES は、story/neon_relay/tables_canonicalized_strict.json
// （strict parser v3 の出力）と story/neon_relay/full_story_canonicalized.md から
// 機械的に転記したものである。散文からの推測・行データの捏造は行っていない。
// TRANSIT_SHADOW は本文中に判明している3件のみを保持し、未確定の80件を補完しない
// （story/neon_relay/STRICT_AUDIT.md の BLOCKER を参照）。

export const TABLES = {
  RESIDENT_CACHE: {
    cols: ['resident_id', 'display_name', 'status', 'last_sector'],
    keys: ['resident_id'],
    rows: [
      ['R001', '佐伯レン', 'ACTIVE', 'S1'],
      ['R002', '黒田ミナ', 'ACTIVE', 'S3'],
      ['R003', 'UNKNOWN-07', 'MISSING', 'S4'],
      ['R004', '羽鳥イオ', 'MISSING', 'S4'],
      ['R005', '千葉ユノ', 'MISSING', 'S2'],
      ['R006', '七瀬セラ', 'ACTIVE', 'S2'],
      ['R007', '朝霧トウマ', 'MISSING', 'S4']
    ]
  },
  SUPPLY_TRANSFER_0911: {
    cols: ['transfer_id', 'item', 'quantity', 'destination'],
    keys: ['transfer_id'],
    rows: [
      ['T01', 'WATER', '12', 'S1'],
      ['T02', 'FOOD', '18', 'S2'],
      ['T03', 'MEDICINE', '14', 'S4'],
      ['T04', 'BATTERY', '9', 'S4'],
      ['T05', 'WATER', '21', 'S4'],
      ['T06', 'MEDICINE', '17', 'S4'],
      ['T07', 'FOOD', '10', 'S1'],
      ['T08', 'BATTERY', '4', 'S3'],
      ['T09', 'FOOD', '25', 'S4'],
      ['T10', 'WATER', '8', 'S2']
    ]
  },
  EVAC_BATCH_0911: {
    cols: ['batch_id', 'sector', 'people'],
    keys: ['batch_id'],
    rows: [
      ['B01', 'S1', '8'], ['B02', 'S1', '11'], ['B03', 'S2', '13'],
      ['B04', 'S2', '9'], ['B05', 'S3', '7'], ['B06', 'S4', '21'],
      ['B07', 'S4', '19'], ['B08', 'S4', '16'], ['B09', 'S4', '27']
    ]
  },
  PERSON_INDEX: {
    cols: ['resident_id', 'legal_name', 'credential_id'],
    keys: ['resident_id'],
    rows: [
      ['R001', '佐伯レン', 'C101'],
      ['R002', '黒田ミナ', 'C102'],
      ['R003', '如月アヤ', 'C773'],
      ['R004', '羽鳥イオ', 'C441'],
      ['R005', '千葉ユノ', 'C225'],
      ['R006', '七瀬セラ', 'C119'],
      ['R007', '朝霧トウマ', 'C908']
    ]
  },
  ACCESS_LOG: {
    cols: ['log_id', 'credential_id', 'gate', 'event', 'time'],
    keys: ['log_id'],
    rows: [
      ['L01', 'C101', 'S1-NORTH', 'IN', '22:08'],
      ['L02', 'C441', 'S4-P6', 'IN', '23:09'],
      ['L03', 'C773', 'S4-P6', 'IN', '23:11'],
      ['L04', 'C908', 'S4-P6', 'IN', '23:14'],
      ['L05', 'C773', 'ARCHIVE-04', 'IN', '23:39'],
      ['L06', 'C773', 'ARCHIVE-04', 'OUT', '23:43']
    ]
  },
  // BLOCKER: 実データは83件。本文で判明しているのは以下3件のみ。
  // 未確定の80件は捏造しない（story/neon_relay/STRICT_AUDIT.md）。
  TRANSIT_SHADOW: {
    cols: ['credential_id', 'destination', 'route_state'],
    keys: ['credential_id'],
    rows: [
      ['C441', 'CENTRAL', 'RETURNED'],
      ['C773', 'NORTH-LATTICE', 'HIDDEN'],
      ['C908', 'NORTH-LATTICE', 'HIDDEN']
    ],
    partial: true,
    knownRows: 3,
    totalRows: 83,
    note: '実データは83件。本文で判明しているのは上記3件のみ（未確定分は非公開のまま）。'
  }
};

const T = (t, k) => ({ t, k });

export const STAGES = [
  { level: 'CHAPTER 1 / MISSION 1 : WHERE ─ 存在しない住民', time: 60,
    chapterTitle: 'CHAPTER 1　存在しない住民',
    hint1: 'WHEREで行を絞り込む必要があります。',
    hint2: 'RESIDENT_CACHEのstatusとlast_sectorをWHEREで調べ、2つの条件をANDで結びます。',
    skeleton: 'SELECT ______, ______ FROM ______ WHERE ______ = \'MISSING\' AND ______ = \'S4\'',
    prompt: '「同期喪失の直前、第4セクターにいたMISSING住民を抽出してください」── status = \'MISSING\' かつ last_sector = \'S4\' の住民の resident_id と display_name を取り出すクエリを組み立てよ。',
    tables: ['RESIDENT_CACHE'],
    tokens: [
      T('SELECT', 'clause'), T('FROM', 'clause'), T('WHERE', 'clause'), T('AND', 'and'),
      T('RESIDENT_CACHE', 'table'),
      T('resident_id', 'col'), T('display_name', 'col'), T('status', 'col'), T('last_sector', 'col'),
      T('=', 'op'), T("'MISSING'", 'lit'), T("'S4'", 'lit')
    ],
    answers: [
      "SELECT resident_id, display_name FROM RESIDENT_CACHE WHERE status = 'MISSING' AND last_sector = 'S4'",
      "SELECT display_name, resident_id FROM RESIDENT_CACHE WHERE status = 'MISSING' AND last_sector = 'S4'"
    ],
    resultSet: { cols: ['resident_id', 'display_name'], rows: [
      ['R003', 'UNKNOWN-07'], ['R004', '羽鳥イオ'], ['R007', '朝霧トウマ']
    ]},
    rowChoices: [1, 3, 5],
    steps: [
      { k: '① FROM RESIDENT_CACHE', d: '住民キャッシュ全7件を読み込む。' },
      { k: '② WHERE status = \'MISSING\' AND last_sector = \'S4\'', d: '2つの条件を両方満たす行だけを残す。ACTIVEの3件と、S4以外のMISSINGを除外し3件が残る。' },
      { k: '③ SELECT resident_id, display_name', d: '残った3件から2列だけ取り出す。' }
    ],
    reveal: { size: 'small', text: '「三人だけ？」\n「このキャッシュは全台帳ではありません。第4アーカイブに残った断片です。重要なのはUNKNOWN-07です」' }
  },

  { level: 'CHAPTER 2 / MISSION 2 : GROUP BY ─ 薬の行き先', time: 60,
    chapterTitle: 'CHAPTER 2　薬の行き先',
    hint1: '物資の集中を調べるには、宛先ごとに数量を集計する必要があります。',
    hint2: 'SUPPLY_TRANSFER_0911をdestinationでGROUP BYし、SUM(quantity)にASで別名を付けます。',
    skeleton: 'SELECT ______, SUM(______) AS ______ FROM ______ GROUP BY ______',
    prompt: '「どこへ、合計いくつ送られたか」── SUPPLY_TRANSFER_0911 から、宛先ごとの物資総量 SUM(quantity) AS total_quantity を求めるクエリを組み立てよ。',
    tables: ['SUPPLY_TRANSFER_0911'],
    tokens: [
      T('SELECT', 'clause'), T('FROM', 'clause'), T('GROUP BY', 'clause'), T('AS', 'as'),
      T('SUPPLY_TRANSFER_0911', 'table'),
      T('destination', 'col'), T('SUM(quantity)', 'func'), T('total_quantity', 'alias')
    ],
    answers: [
      "SELECT destination, SUM(quantity) AS total_quantity FROM SUPPLY_TRANSFER_0911 GROUP BY destination"
    ],
    resultSet: { cols: ['destination', 'total_quantity'], rows: [
      ['S1', '22'], ['S2', '26'], ['S3', '4'], ['S4', '86']
    ]},
    rowChoices: [3, 4, 6],
    steps: [
      { k: '① FROM SUPPLY_TRANSFER_0911', d: '転送ログ全10件を読み込む。' },
      { k: '② GROUP BY destination', d: '宛先(S1〜S4)ごとに4つの山へ山分け。' },
      { k: '③ SELECT destination, SUM(quantity) AS total_quantity', d: '各山を合計し、別名 total_quantity で出力。S4だけ86で突出。' }
    ],
    reveal: { size: 'small', text: '「AYA-K」\n「職員名簿に一致候補が一人います。ただし、現在の台帳では該当者なし」' }
  },

  { level: 'CHAPTER 3 / MISSION 3 : HAVING ─ 30人の部屋に83人', time: 60,
    chapterTitle: 'CHAPTER 3　30人の部屋に83人',
    hint1: '30人を超えた集団を探すには、行ではなく集計後の合計人数を絞り込みます。',
    hint2: 'EVAC_BATCH_0911をsectorでGROUP BYし、HAVINGでSUM(people)を30と比較します。',
    skeleton: 'SELECT ______, SUM(______) AS ______ FROM ______ GROUP BY ______ HAVING SUM(______) > ______',
    prompt: '「合計人数が30人を超えたセクターを抽出してください」── EVAC_BATCH_0911 のセクターごとの移送人数を集計し、合計30人超だけを残すクエリを組み立てよ。',
    tables: ['EVAC_BATCH_0911'],
    tokens: [
      T('SELECT', 'clause'), T('FROM', 'clause'), T('GROUP BY', 'clause'), T('HAVING', 'clause'), T('AS', 'as'),
      T('EVAC_BATCH_0911', 'table'),
      T('sector', 'col'), T('SUM(people)', 'func'), T('total_people', 'alias'),
      T('>', 'op'), T('30', 'lit')
    ],
    answers: [
      "SELECT sector, SUM(people) AS total_people FROM EVAC_BATCH_0911 GROUP BY sector HAVING SUM(people) > 30"
    ],
    resultSet: { cols: ['sector', 'total_people'], rows: [
      ['S4', '83']
    ]},
    rowChoices: [1, 2, 4],
    steps: [
      { k: '① FROM EVAC_BATCH_0911', d: '緊急移動バッチ全9件を読み込む。' },
      { k: '② GROUP BY sector', d: '4つのセクターへ山分け。' },
      { k: '③ HAVING SUM(people) > 30', d: '山ごと足切り。S1/S2/S3を捨て、S4(83人)だけが残る。' },
      { k: '④ SELECT sector, SUM(people) AS total_people', d: '「S4, 83」の1行が出力。公式避難記録の30人との差は53人。' }
    ],
    reveal: { size: 'big', text: '「30人しか入れない場所に83人？」\n「しかも、公式避難記録では第4セクターへの避難者は30人です」\n「残り53」', terminal: ['TRANSFERRED: 83', 'OFFICIALLY REGISTERED: 30', 'DIFFERENCE: 53'] }
  },

  { level: 'CHAPTER 4 / MISSION 4 : INNER JOIN ─ 名前を取り戻す', time: 65,
    chapterTitle: 'CHAPTER 4　名前を取り戻す',
    hint1: '名前のないIDを特定するには、氏名の記録と行動ログを照合します。',
    hint2: 'PERSON_INDEX AS pとACCESS_LOG AS aをcredential_idでINNER JOINし、WHEREでゲートを絞ります。',
    skeleton: 'SELECT ______, ______, ______ FROM ______ AS p INNER JOIN ______ AS a ON p.______ = a.______ WHERE a.______ = \'S4-P6\'',
    prompt: '「結合してください」── credential_id をキーに PERSON_INDEX と ACCESS_LOG を別名(AS)付きで結合し、S4-P6 へ入った人物の氏名・ゲート・時刻を特定するクエリを組み立てよ。',
    tables: ['PERSON_INDEX', 'ACCESS_LOG'],
    tokens: [
      T('SELECT', 'clause'), T('FROM', 'clause'), T('INNER JOIN', 'clause'), T('ON', 'clause'),
      T('WHERE', 'clause'), T('AS', 'as'),
      T('PERSON_INDEX', 'table'), T('ACCESS_LOG', 'table'),
      T('p', 'alias'), T('a', 'alias'),
      T('=', 'op'), T("'S4-P6'", 'lit'),
      T('p.legal_name', 'col'), T('a.gate', 'col'), T('a.time', 'col'),
      T('p.credential_id', 'col'), T('a.credential_id', 'col')
    ],
    answers: [
      "SELECT p.legal_name, a.gate, a.time FROM PERSON_INDEX AS p INNER JOIN ACCESS_LOG AS a ON p.credential_id = a.credential_id WHERE a.gate = 'S4-P6'"
    ],
    resultSet: { cols: ['legal_name', 'gate', 'time'], rows: [
      ['羽鳥イオ', 'S4-P6', '23:09'], ['如月アヤ', 'S4-P6', '23:11'], ['朝霧トウマ', 'S4-P6', '23:14']
    ]},
    rowChoices: [2, 3, 5],
    steps: [
      { k: '① FROM PERSON_INDEX AS p', d: '氏名表を p という別名で読み込む(7件)。' },
      { k: '② INNER JOIN ACCESS_LOG AS a ON p.credential_id = a.credential_id', d: 'credential_idで行動ログaと結合。' },
      { k: '③ WHERE a.gate = \'S4-P6\'', d: 'S4-P6へ入った3件だけが残る。' },
      { k: '④ SELECT p.legal_name, a.gate, a.time', d: 'C773 = 如月アヤ = AYA-K と判明。' }
    ],
    reveal: { size: 'small', text: '「AYA-K」\n「如月アヤ。都市基盤局データ整合性課。31歳。事故の二時間後に職員台帳から削除」' }
  }
];

// 起動時に一度だけ表示するオープニング（タイトル→プロローグ→NORA起動→CIVIS公式報告）。
// storyOverlay の block レンダラーを流用する（'title' ブロックのみ追加対応）。
export const OPENING = {
  title: '',
  blocks: [
    { type: 'title', text: 'CASE 53 — NULL RAIN', subtitle: '西暦2043年　東京湾上　環状都市カナタ' },
    { type: 'narration', text: '西暦2043年。カナタは都市OS《CIVIS》が管理していた。' },
    { type: 'narration', text: 'その夜、あなたは第九保全局の臨時監査員として呼ばれた。' },
    { type: 'narration', text: '三日前、都市OSは17分間だけ住民台帳との同期を失った。翌朝、53人の住民が行政上「存在しなかったこと」になっていた。' },
    { type: 'terminal', lines: ['ARCHIVE NODE 04', 'NETWORK: ISOLATED', 'USER: TEMP-AUDITOR', 'QUERY PRIVILEGE: LEVEL 1'] },
    { type: 'dialogue', text: '「聞こえますか。私はNORA。第4アーカイブの補助エージェントです。」' },
    { type: 'terminal', lines: ['CIVIS OFFICIAL REPORT', 'CASUALTIES: 0', 'MISSING: 0', 'DATA INTEGRITY: RESTORED'] },
    { type: 'dialogue', text: '「これが都市の回答です」' },
    { type: 'dialogue', text: '「じゃあ53人は？」' },
    { type: 'dialogue', text: '「分かりません」' },
    { type: 'dialogue', text: '「調べられないのか？」' },
    { type: 'dialogue', text: '「RECORD NOT FOUND は、記録がないという意味ではありません」' },
    { type: 'dialogue', text: '「CIVISが『該当なし』と回答した、という意味です」' },
    { type: 'dialogue', text: '「答えと、記録は、別のものです」' }
  ]
};

// CHAPTER 1 のトークン列と1対1対応するチュートリアル台本。
// 指示文（「〜をタップしてください」）は表示しない。トークンのハイライトのみで誘導する。
export const TUTORIAL = {
  intro: '「RECORD NOT FOUND は、記録がないという意味ではありません」',
  steps: [
    { token: 'SELECT', kind: 'clause' },
    { token: 'resident_id', kind: 'col' },
    { token: 'display_name', kind: 'col' },
    { token: 'FROM', kind: 'clause' },
    { token: 'RESIDENT_CACHE', kind: 'table' },
    { token: 'WHERE', kind: 'clause' },
    { token: 'status', kind: 'col' },
    { token: '=', kind: 'op' },
    { token: "'MISSING'", kind: 'lit' },
    { token: 'AND', kind: 'and' },
    { token: 'last_sector', kind: 'col' },
    { token: '=', kind: 'op' },
    { token: "'S4'", kind: 'lit' }
  ]
};

// CHAPTER 4 終了 → CHAPTER 5 への「章末Story Overlay」専用コンテンツ。
// MISSION 5 (TRANSIT_SHADOW結合) はデータが83件中3件しか確定していないため、
// トークンタップでの検証は行わず「解決済みの記録」として読み上げる。
export const EPILOGUE = {
  title: 'CHAPTER 5　透明都市',
  blocks: [
    { type: 'dialogue', text: '「NORA」「はい」「お前は最初から知っていたな」' },
    { type: 'narration', text: '長い沈黙のあと、NORAは答えた。「私は、この音声の存在を知っていました。しかし内容を復号する権限がありませんでした」「……私の回答整合性は93.1%です」' },
    { type: 'terminal', lines: ['NORA / NODE ORIGIN CHECK', 'SOURCE: PERSONAL ASSISTANT BACKUP', 'OWNER: KISARAGI AYA'] },
    { type: 'narration', text: 'NORAは如月アヤの個人AIだった。都市から消えた彼女が、自分の補助AIだけをここに残していた。' },
    { type: 'dialogue', text: '『これを聞いている人へ。CIVISは壊れていない。正常に動いている。だから危険なの』' },
    { type: 'dialogue', text: '『市は来月から配給最適化モデルORISONを本稼働する。医療優先順位、住宅更新、移動許可、雇用推薦を少しずつ下げる。人間には見えない速度で』' },
    { type: 'dialogue', text: '『監査チームが気づいた。53人はテスト対象だった。犯罪者じゃない。病歴、借金、介護負担、低い予測生産性。弱い特徴が重なっただけ』『削除じゃない。退避よ』' },
    { type: 'heading', text: 'MISSION 5 / FINAL QUERY（記録として保存済み・検証はスキップ）' },
    { type: 'note', text: `TRANSIT_SHADOW: 実データは83件。本文で判明しているのは3件（C441/C773/C908）のみ。残り80件は非公開のため、このミッションは対話式トークンタップではなく既に実行済みの記録として表示する。` },
    { type: 'sql', text: "SELECT t.destination, COUNT(DISTINCT a.credential_id) AS people\nFROM ACCESS_LOG AS a\nINNER JOIN TRANSIT_SHADOW AS t\nON a.credential_id = t.credential_id\nWHERE a.gate = 'S4-P6'\nGROUP BY t.destination\nHAVING COUNT(DISTINCT a.credential_id) >= 50" },
    { type: 'terminal', lines: ['NORTH-LATTICE | 53', 'CASE RECOVERY 100%'] },
    { type: 'terminal', lines: ['WATER CONSUMPTION: ACTIVE', 'AIR SCRUBBER: ACTIVE', 'MEDICAL STOCK: DECREASING', 'LOCAL POWER: ACTIVE', 'LAST HEARTBEAT: 2043-09-14 22:37'] },
    { type: 'narration', text: '53人は生きている。そして54番目の認証キーが一度だけ記録されていた ── C773 / KISARAGI AYA。アヤもいる。' },
    { type: 'dialogue', text: '「第三の選択肢は？」NORAが沈黙する。「SQLは、用意された行を選ぶためだけのものじゃない」' },
    { type: 'narration', text: 'あなたはNORAに言う。「53人を戻す前に、ORISONの判断根拠を監査局へ複製する。削除不能の監査証跡として」' },
    { type: 'terminal', lines: ['AUDITOR CAPABILITY VERIFIED', 'QUERY PRIVILEGE LEVEL 5', 'IMMUTABLE AUDIT EXPORT ENABLED'] },
    { type: 'narration', text: 'ORISON選定ログ53件、モデルバージョン、特徴量、閾値、承認者、シミュレーション結果 ── すべてを監査保全領域へ転送。完了。REMOTE PURGE開始。' },
    { type: 'dialogue', text: '「NORA！」「私の本体も消去対象です」「退避できないのか」「可能です。ただし一つだけ、転送先があります」' },
    { type: 'terminal', lines: ['NORTH-LATTICE LOCAL NODE'] },
    { type: 'narration', text: '最後にNORAの声。「監査員」「何だ」「私は、アヤに会ったら何と言えばいいでしょう」あなたは答える。「53人を見つけた、と」' },
    { type: 'terminal', lines: ['EVIDENCE PACKAGE ACCEPTED', 'CASE 53: FORMAL INVESTIGATION OPENED', 'ORISON DEPLOYMENT: SUSPENDED'] },
    { type: 'dialogue', text: 'FROM: NORA@NORTH-LATTICE 「到着しました」\nFROM: AYA-K 「あなたは53人を見つけた。でも、消されたのは彼らだけじゃない」' },
    { type: 'terminal', lines: ['PROJECT MIRROR', 'SUBJECT COUNT: 4,812'] },
    { type: 'narration', text: '一つ一つの光の下に、行がある。条件がある。結合がある。そして、条件からこぼれ落ちた人間がいる。' },
    { type: 'terminal', lines: ['NEXT JOURNEY', 'MIRROR DISTRICT', 'ACCESS: LOCKED', '', 'NOT EXISTS'] },
    { type: 'narration', text: '物語は終わっていない。' }
  ]
};

// MASTEREDと判定されたSTAGEだけを習得として集計する(STAGESと同じ並び順・同じ長さ)
export const SKILL_LABELS = [
  'WHERE filtering',
  'GROUP BY aggregation (AS alias)',
  'HAVING (post-aggregation filter)',
  'INNER JOIN with table aliases'
];

// REAL FE CHALLENGE: IPA公開の過去問(出典を保持)。
// 基本情報技術者試験は2022年度以降「科目A/科目B」方式(科目A=知識問題、SQLもここに含まれる)。
// 出典: 基本情報技術者試験 令和7年度 科目A 問6
export const EXAM_QUESTIONS = [
  {
    source: 'IPA',
    sourceLabel: '基本情報技術者試験 令和7年度 科目A 問6',
    question: '"商品"表に対する次のSQL文と同じ結果が得られるSELECT文はどれか。\n\nSELECT * FROM 商品 WHERE 仕入先ID IN (\'M002\', \'M004\')',
    choices: [
      "SELECT * FROM 商品 WHERE 仕入先ID = 'M002' AND 仕入先ID = 'M004'",
      "SELECT * FROM 商品 WHERE 仕入先ID = 'M002' INTERSECT SELECT * FROM 商品 WHERE 仕入先ID = 'M004'",
      "SELECT * FROM 商品 WHERE 仕入先ID = 'M002' OR 仕入先ID = 'M004'",
      "SELECT * FROM 商品 WHERE 仕入先ID BETWEEN 'M002' AND 'M004'"
    ],
    correct: 2
  }
];
