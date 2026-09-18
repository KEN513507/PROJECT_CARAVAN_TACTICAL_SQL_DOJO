import { TABLES as ORIGINAL_TABLES } from './data.js';

// 本編用の追加監査資料。既存の人物ID・確定済み行は変更しない。
// 完全版の乗員台帳は、従来省略されていた83人を具体化した今回の追加Story Fact。
export const LABELS = {
  RESIDENT_CACHE: '住民キャッシュ', SUPPLY_TRANSFER_0911: '物資搬送記録',
  EVAC_BATCH_0911: '避難移送記録', FACILITY_CAPACITY: '施設定員台帳',
  PERSON_INDEX: '人物索引', ACCESS_LOG: '入退場記録',
  EVAC_RECEPTION: '避難受付記録', TERMINAL_LOG: '端末認証記録',
  RECEPTION_AUDIT: '受付検証記録', EVAC_MANIFEST: '移送乗員台帳',
  OFFICIAL_EVAC_REGISTER: '公式避難者台帳', TRANSIT_SHADOW: '独立交通記録',
  resident_id: '住民ID', display_name: '表示名', status: '登録状態', last_sector: '最終登録区画',
  transfer_id: '搬送ID', item: '物資種別', quantity: '数量（箱）', destination: '行き先',
  batch_id: '移送便ID', sector: '区画', people: '人数', emergency_capacity: '緊急受入定員',
  legal_name: '戸籍名', credential_id: '認証ID', log_id: '入退場記録ID', gate: 'ゲート',
  event: '入退場種別', time: '記録時刻', reception_id: '受付ID', terminal_id: '端末ID',
  received_at: '受付時刻', session_id: '認証セッションID', authenticated_at: '認証時刻',
  verified_count: '確認済み人数', operator_note: '担当者メモ', registration_id: '公式登録ID',
  route_state: '経路状態', audit_id: '照合対象ID', cached_name: '記録上の名前',
  total_people: '合計人数', total_quantity: '合計数量（箱）',
  'COUNT(*)': '件数', 'SUM(quantity)': '合計数量（箱）', 'AVG(quantity)': '平均数量（箱）',
  'MAX(quantity)': '最大数量（箱）', 'MIN(quantity)': '最小数量（箱）', 'SUM(people)': '合計人数',
};

export const VALUE_LABELS = {
  ACTIVE: '登録あり', MISSING: '所在不明', WATER: '水', FOOD: '食料', MEDICINE: '医薬品',
  BATTERY: '電池', IN: '入場', OUT: '退場', RETURNED: '公式経路', HIDDEN: '独立経路',
  CENTRAL: '中央区', 'NORTH-LATTICE': 'ノース・ラティス',
  S1: '第1区画', S2: '第2区画', S3: '第3区画', S4: '第4区画',
};

const table = (cols, rows, keys, purpose) => ({ cols, rows, keys, purpose });
const id = n => `R${String(n).padStart(3, '0')}`;
const memberNumbers = [3, 4, 5, 7, ...Array.from({ length: 79 }, (_, i) => i + 8)];
const originalCredentials = { R003: 'C773', R004: 'C441', R005: 'C225', R007: 'C908' };
const credential = n => originalCredentials[id(n)] || `C${2000 + n}`;
const registeredNumbers = [4, ...Array.from({ length: 29 }, (_, i) => i + 8)];
export const ABSENT_IDS = memberNumbers.filter(n => !registeredNumbers.includes(n)).map(id);
const batchFor = i => i < 21 ? 'B06' : i < 40 ? 'B07' : i < 56 ? 'B08' : 'B09';

const additions = {
  FACILITY_CAPACITY: table(['sector', 'emergency_capacity'], [['S1', 40], ['S2', 35], ['S3', 20], ['S4', 30]], ['sector'],
    '都市施設部の事故当日版。定員と移送実績の照合に使う。定員は実在者数ではない。'),
  EVAC_RECEPTION: table(['reception_id', 'terminal_id', 'received_at', 'session_id'], [
    ['E442', 'T-S4-03', '23:09', 'S442'], ['E443', 'T-S4-03', '23:09', 'S443'],
    ['E444', 'T-S2-01', '23:10', 'S444'],
  ], ['reception_id'], '同期喪失で人物欄を失った受付票。認証セッションIDは残存。記録を更新せず照会結果として人物を復元する。'),
  TERMINAL_LOG: table(['session_id', 'terminal_id', 'resident_id', 'authenticated_at'], [
    ['S442', 'T-S4-03', 'R005', '23:09'], ['S443', 'T-S4-03', 'R004', '23:09'],
    ['S444', 'T-S2-01', 'R006', '23:10'],
  ], ['session_id'], '端末署名付きの認証履歴。同一分・同一端末にも複数認証があるため、時刻だけで人物を決められない。'),
  RECEPTION_AUDIT: table(['reception_id', 'verified_count', 'operator_note'], [
    ['E442', null, null], ['E443', 0, '検証対象なし'], ['E444', 1, ''],
  ], ['reception_id'], '受付復旧担当の検証欄。確認済み人数は検証作業の人数であり、移送人数ではない。NULLは未報告、0は報告済みゼロ、空文字は入力済みの空のメモ。'),
  EVAC_MANIFEST: table(['resident_id', 'credential_id', 'batch_id'], memberNumbers.map((n, i) => [id(n), credential(n), batchFor(i)]), ['resident_id'],
    'B06〜B09の署名済み全乗員83人。住民IDと認証IDはそれぞれ一意。各人は一便にのみ所属。21/19/16/27人で既存の移送集計に一致する。'),
  OFFICIAL_EVAC_REGISTER: table(['registration_id', 'resident_id', 'sector'], registeredNumbers.map((n, i) => [`O${String(i + 1).padStart(3, '0')}`, id(n), 'S4']), ['registration_id'],
    '9月11日のS4受入分を翌朝確定した全30人。住民IDも一意かつ非NULL。対象範囲・署名・全件取込を確認済みで、欠落ページではない。'),
};

export const TABLE_RELEASE = {
  RESIDENT_CACHE: 1, SUPPLY_TRANSFER_0911: 7, EVAC_BATCH_0911: 11, FACILITY_CAPACITY: 12,
  PERSON_INDEX: 14, ACCESS_LOG: 15, EVAC_RECEPTION: 16, TERMINAL_LOG: 16,
  RECEPTION_AUDIT: 17, EVAC_MANIFEST: 18, OFFICIAL_EVAC_REGISTER: 18, TRANSIT_SHADOW: 20,
};

export function tablesForMission(number) {
  const tables = {};
  for (const [name, release] of Object.entries(TABLE_RELEASE)) {
    if (number < release) continue;
    tables[name] = structuredClone(additions[name] || ORIGINAL_TABLES[name]);
  }
  if (number >= 20) {
    // 既知のL01〜L06は保持。事故当日のS4-P6入場記録の未収録80件を追加。
    const existing = new Set(['R003', 'R004', 'R007']);
    tables.ACCESS_LOG.rows.push(...memberNumbers.filter(n => !existing.has(id(n))).map((n, i) =>
      [`L${100 + i}`, credential(n), 'S4-P6', 'IN', '23:15']));
    tables.ACCESS_LOG.purpose = '9月11日分の全件復元版。S4-P6への入場は乗員1人につき1件。別ゲートへの記録は同一人物にも複数ある。時刻は同日の都市標準時。';
    tables.TRANSIT_SHADOW = table(['credential_id', 'destination', 'route_state'], memberNumbers.map(n => [
      credential(n), registeredNumbers.includes(n) ? 'CENTRAL' : 'NORTH-LATTICE',
      registeredNumbers.includes(n) ? 'RETURNED' : 'HIDDEN',
    ]), ['credential_id'], '独立交通設備が署名した9月11日の最終到着記録、全83件。認証IDごとに1件。現在の生存や現在位置まで証明する資料ではない。');
  }
  for (const [name, tb] of Object.entries(tables)) {
    tb.label = LABELS[name];
    tb.purpose ||= {
      RESIDENT_CACHE: '第4アーカイブに残った7人分の断片。全住民の台帳ではない。UNKNOWN-07は文字列の仮表示名で、SQLのNULLとは異なる。',
      SUPPLY_TRANSFER_0911: '9月11日の封印箱搬送10件。数量は品目によらず箱数で統一。1行は1人ではなく1搬送。',
      EVAC_BATCH_0911: '9月11日の移送便別人数。S4の各便に重複乗員はなく、合計は延べ人数ではなく83人。',
      PERSON_INDEX: '独立保管された人物と認証IDの対応。住民ID・認証IDは一意。',
      ACCESS_LOG: '9月11日の入退場記録、現在復元できた6件。入退場記録IDは一意。認証IDには複数の行動が対応する。',
    }[name];
  }
  return tables;
}

const rs = (cols, rows) => ({ cols, rows });
const cache = ORIGINAL_TABLES.RESIDENT_CACHE.rows;
const missing = cache.filter(r => r[2] === 'MISSING');
const s4Missing = missing.filter(r => r[3] === 'S4');
const defs = [
  {
    TITLE: '消えていない番号', STORY_NEED: 'CIVISは「所在不明0」と回答した。まず隔離キャッシュへ照会が届くことを確かめる。',
    INTERACTION_KIND: 'SQL_BUILD', NEW_CONCEPT: 'SELECT / FROM：列と表を指定する', SOURCE_TABLES: ['RESIDENT_CACHE'],
    PLAYER_PROMPT: '住民キャッシュから、残っている住民IDを取り出そう。',
    CANONICAL_SQL: 'SELECT resident_id FROM RESIDENT_CACHE;', EXPECTED_RESULT: rs(['resident_id'], cache.map(r => [r[0]])),
    EVIDENCE_TYPE: 'RAW FACT', EVIDENCE: '7件の住民IDを読み出せた。これは台帳の断片であり、失踪者の人数ではない。',
    HINT_1: 'SELECTは「取り出す列」、FROMは「調べる表」です。', HINT_2: 'SELECTの後に住民IDの列、FROMの後に住民キャッシュを書きます。',
    FINAL_HINT: 'SELECT resident_id\nFROM RESIDENT_CACHE;\nこの形を参照した実行は「練習」として記録します。',
    COMMUNICATION_AFTER_CLEAR: 'NORA「照会は届いています。」', NEXT_STORY_HOOK: '番号は残っている。その番号にどんな表示名が結び付いているか。',
    VALIDATION: '7行・住民ID1列。数値7だけ、SELECT *、存在しないIDは不可。', starter: 'SELECT \nFROM RESIDENT_CACHE;',
  },
  {
    TITLE: '名前を並べる', STORY_NEED: '番号だけでは住民を照合できない。同じ行の表示名を証拠に添える。',
    INTERACTION_KIND: 'SQL_BUILD', NEW_CONCEPT: '複数列の射影とカンマ', SOURCE_TABLES: ['RESIDENT_CACHE'],
    PLAYER_PROMPT: '住民IDと表示名を一緒に取り出そう。',
    CANONICAL_SQL: 'SELECT resident_id, display_name FROM RESIDENT_CACHE;', EXPECTED_RESULT: rs(['resident_id', 'display_name'], cache.map(r => r.slice(0, 2))),
    EVIDENCE_TYPE: 'RAW FACT', EVIDENCE: 'R003の表示名はUNKNOWN-07。戸籍名が分かったわけではない。',
    HINT_1: '1行から、必要な列をいくつか取り出せます。', HINT_2: '列名の間にカンマを置きます。行どうしをつなぐ操作ではありません。',
    FINAL_HINT: 'SELECT resident_id, □ FROM RESIDENT_CACHE;\n□には表示名の英語識別子を入れます。',
    COMMUNICATION_AFTER_CLEAR: 'NORA「この2列を照合の控えに残します。」', NEXT_STORY_HOOK: 'UNKNOWN-07を含む住民は、どんな状態で記録されているか。',
    VALIDATION: '全7人のIDと表示名の組が一致。列順は自由。',
  },
  {
    TITLE: '状態を見る窓', STORY_NEED: '公式回答と照合するため、登録状態と最終登録区画を読み出す。',
    INTERACTION_KIND: 'RESULT_PREDICTION', NEW_CONCEPT: '列を減らしても行は減らない', SOURCE_TABLES: ['RESIDENT_CACHE'],
    PLAYER_PROMPT: '住民ID・登録状態・最終登録区画を取り出そう。実行前に、返る行数を記録して。',
    CANONICAL_SQL: 'SELECT resident_id, status, last_sector FROM RESIDENT_CACHE;', EXPECTED_RESULT: rs(['resident_id', 'status', 'last_sector'], cache.map(r => [r[0], r[2], r[3]])),
    EVIDENCE_TYPE: 'RAW FACT', EVIDENCE: '列を変更しても7人分の行は残った。所在不明の記録も読める。',
    HINT_1: '表の1行が何を表すか見てください。', HINT_2: '取り出す列と、取り出す行は別です。今回は行を選別していません。',
    FINAL_HINT: 'SELECT resident_id, □, □ FROM RESIDENT_CACHE;\n予測は数字で入力し、実行結果と比較します。',
    COMMUNICATION_AFTER_CLEAR: 'NORA「ここで読めた状態を、公式回答と照合できます。」', NEXT_STORY_HOOK: '所在不明だけを取り出せば、公式回答を確認できる。',
    VALIDATION: '予測7行。誤予測でもSQL結果を隠さず、訂正後に進行できる。', prediction: 7,
  },
  {
    TITLE: 'ゼロという回答', STORY_NEED: '所在不明0という公式回答を、キャッシュの登録状態で検証する。',
    INTERACTION_KIND: 'SQL_BUILD', NEW_CONCEPT: 'WHERE / =：値が一致する行', SOURCE_TABLES: ['RESIDENT_CACHE'],
    PLAYER_PROMPT: '所在不明として記録された住民のIDと表示名を調べよう。',
    CANONICAL_SQL: "SELECT resident_id, display_name FROM RESIDENT_CACHE WHERE status = 'MISSING';", EXPECTED_RESULT: rs(['resident_id', 'display_name'], missing.map(r => r.slice(0, 2))),
    EVIDENCE_TYPE: 'RAW FACT', EVIDENCE: '断片に4人のMISSING記録がある。公式0件と一致しないが、全市の失踪人数はまだ分からない。',
    HINT_1: '列を選ぶだけでは、ACTIVEの行も残ります。', HINT_2: "WHERE status = 'MISSING' は、登録状態が所在不明の行を残します。文字列は一重引用符で囲みます。",
    FINAL_HINT: "SELECT resident_id, display_name FROM RESIDENT_CACHE\nWHERE □ = 'MISSING';",
    COMMUNICATION_AFTER_CLEAR: 'NORA「公式回答と照会結果を、別の記録として保存します。」', NEXT_STORY_HOOK: '事故地点S4に登録されていたのは、このうち誰か。',
    VALIDATION: 'R003/R004/R005/R007。ACTIVEを含めない。',
  },
  {
    TITLE: '事故地点の三人', STORY_NEED: '所在不明の中から、同期喪失の起点S4に登録されていた住民を絞る。',
    INTERACTION_KIND: 'SQL_BUILD', NEW_CONCEPT: 'AND：両方を満たす', SOURCE_TABLES: ['RESIDENT_CACHE'],
    PLAYER_PROMPT: '所在不明で、最終登録区画が第4区画の住民IDと表示名を調べよう。',
    CANONICAL_SQL: "SELECT resident_id, display_name FROM RESIDENT_CACHE WHERE status = 'MISSING' AND last_sector = 'S4';", EXPECTED_RESULT: rs(['resident_id', 'display_name'], s4Missing.map(r => r.slice(0, 2))),
    EVIDENCE_TYPE: 'RAW FACT', EVIDENCE: 'R003・R004・R007が両条件を満たす。R005を「無関係」とは断定できない。',
    HINT_1: '必要な条件は2つあります。', HINT_2: 'ANDは左も右も成り立つ行を残します。',
    FINAL_HINT: "WHERE status = 'MISSING' AND □ = 'S4'",
    COMMUNICATION_AFTER_CLEAR: '署名付きメモを受信：「もし台帳から人が消えたら、物資を追え。」送信表示名：UNKNOWN-07。',
    NEXT_STORY_HOOK: '物資経路にはS2もある。S4だけに絞って、別区画の住民を見落としていないか。',
    VALIDATION: '3人のIDと表示名。ORへの置換は結果が異なるため拒否。',
  },
  {
    TITLE: '調査範囲を広げる', STORY_NEED: '搬送経路に含まれるS2とS4を調査対象とし、登録ありの住民は除外する。',
    INTERACTION_KIND: 'QUERY_EQUIVALENCE', NEW_CONCEPT: '条件集合の選択・除外：OR / IN / NOT', SOURCE_TABLES: ['RESIDENT_CACHE'],
    PLAYER_PROMPT: '第2区画または第4区画にいる所在不明の住民IDを調べよう。同じ対象を別の条件表現でも確かめて。',
    CANONICAL_SQL: "SELECT resident_id FROM RESIDENT_CACHE WHERE status = 'MISSING' AND last_sector IN ('S2', 'S4');", EXPECTED_RESULT: rs(['resident_id'], missing.map(r => [r[0]])),
    EVIDENCE_TYPE: 'RAW FACT', EVIDENCE: '調査対象は4人。S2のR005も保留リストへ戻る。',
    HINT_1: 'ORはどちらか、INは列の値が一覧のいずれか、NOTは条件の否定です。',
    HINT_2: "まずINで区画を指定。次に (last_sector = 'S2' OR last_sector = 'S4') へ書き換えて比較します。括弧で区画条件をまとめます。",
    FINAL_HINT: "この表のstatusは非NULLでACTIVE/MISSINGの2種類だけです。NOT (status = 'ACTIVE') がMISSINGと同じ対象になることも確認します。他の状態がある表には一般化できません。",
    COMMUNICATION_AFTER_CLEAR: 'NORA「区画の違いを理由に、まだ誰も調査から外していません。」', NEXT_STORY_HOOK: 'メモが示した物資記録を開く。まず大きい搬送から確認する。',
    VALIDATION: 'IN版・OR版・NOT版を順に実行して同じ4人を得る。等価性はこの非NULL・2状態という制約下で検証。',
    equivalents: ["SELECT resident_id FROM RESIDENT_CACHE WHERE status = 'MISSING' AND (last_sector = 'S2' OR last_sector = 'S4');", "SELECT resident_id FROM RESIDENT_CACHE WHERE NOT (status = 'ACTIVE') AND last_sector IN ('S2', 'S4');"],
  },
  {
    TITLE: '大きな搬送から', STORY_NEED: '搬送担当の確認順を決める。箱数の大きい記録を先に見る。',
    INTERACTION_KIND: 'SQL_BUILD', NEW_CONCEPT: 'ORDER BY：結果の順序', SOURCE_TABLES: ['SUPPLY_TRANSFER_0911'],
    PLAYER_PROMPT: '搬送IDと数量を、数量が大きい順に並べよう。同数なら搬送IDの小さい順。',
    CANONICAL_SQL: 'SELECT transfer_id, quantity FROM SUPPLY_TRANSFER_0911 ORDER BY quantity DESC, transfer_id ASC;',
    EXPECTED_RESULT: rs(['transfer_id', 'quantity'], [['T09', 25], ['T05', 21], ['T02', 18], ['T06', 17], ['T03', 14], ['T01', 12], ['T07', 10], ['T04', 9], ['T10', 8], ['T08', 4]]),
    EVIDENCE_TYPE: 'DERIVED FACT', EVIDENCE: 'この搬送範囲でT09が最大。単独で最大の搬送と、総量が最大の行き先は別の問い。',
    HINT_1: 'どの行を残すかではなく、並び方を指定します。', HINT_2: 'ORDER BY quantity DESC は数量の降順。ASCは昇順です。',
    FINAL_HINT: 'ORDER BY quantity DESC, transfer_id ASC\n2つ目の列は数量が同じときだけ使います。',
    COMMUNICATION_AFTER_CLEAR: '搬送記録を確認順に保存した。', NEXT_STORY_HOOK: '上位にS4行きが見える。S4行きは何件あるのか。',
    VALIDATION: '10行を降順・同数ID昇順で比較。ORDER BYを省く偶然の一致は認めない。', ordered: true,
  },
  {
    TITLE: '五つの受領票', STORY_NEED: 'S4へ送った荷物の受領票を回収するため、必要な票の枚数を確かめる。',
    INTERACTION_KIND: 'RESULT_PREDICTION', NEW_CONCEPT: 'COUNT(*)：行の件数', SOURCE_TABLES: ['SUPPLY_TRANSFER_0911'],
    PLAYER_PROMPT: '第4区画行きの搬送は何件あるか。件数を返す照会を書き、結果の行数も予測して。',
    CANONICAL_SQL: "SELECT COUNT(*) FROM SUPPLY_TRANSFER_0911 WHERE destination = 'S4';", EXPECTED_RESULT: rs(['COUNT(*)'], [[5]]),
    EVIDENCE_TYPE: 'DERIVED FACT', EVIDENCE: '対象の搬送は5件。結果は5行ではなく、件数5を持つ1行。箱数や人数ではない。',
    HINT_1: 'COUNT(*)は条件を通った行を数えます。', HINT_2: '5件の搬送を、1つの件数へまとめます。', FINAL_HINT: "SELECT COUNT(*) FROM SUPPLY_TRANSFER_0911 WHERE □ = 'S4';",
    COMMUNICATION_AFTER_CLEAR: 'S4の受領票は5枚。その数量欄を読める。', NEXT_STORY_HOOK: '5回で、合計何箱が送られたのか。', VALIDATION: '値5・結果1行。SUMや数量列の列挙と区別。', prediction: 1,
  },
  {
    TITLE: '箱を足す', STORY_NEED: '5枚の受領票から、S4の保管負荷を見積もる。',
    INTERACTION_KIND: 'SQL_BUILD', NEW_CONCEPT: 'SUM：数量の合計', SOURCE_TABLES: ['SUPPLY_TRANSFER_0911'],
    PLAYER_PROMPT: '第4区画へ搬送された数量を合計しよう。数量の単位は、どの物資も封印箱。',
    CANONICAL_SQL: "SELECT SUM(quantity) FROM SUPPLY_TRANSFER_0911 WHERE destination = 'S4';", EXPECTED_RESULT: rs(['SUM(quantity)'], [[86]]),
    EVIDENCE_TYPE: 'DERIVED FACT', EVIDENCE: '5件を足すと86箱。どの1行にも86箱とは記録されていない。',
    HINT_1: '今回は件数ではなく、数量列の値を足します。', HINT_2: 'SUM(quantity)が数量の合計です。', FINAL_HINT: "SELECT SUM(□) FROM SUPPLY_TRANSFER_0911 WHERE destination = 'S4';",
    COMMUNICATION_AFTER_CLEAR: 'S4への搬送総量を86箱と記録した。', NEXT_STORY_HOOK: '86箱は、1回の巨大な搬送に偏っているのか。', VALIDATION: '9+14+17+21+25=86。COUNTの5を誤答として検出。',
  },
  {
    TITLE: '一度きりではない', STORY_NEED: 'S4への荷物が単発の搬送か、複数回に分かれた搬送かを数量の分布から確認する。',
    INTERACTION_KIND: 'ANOMALY_DETECTION', NEW_CONCEPT: '集合の代表値と幅：AVG / MIN / MAX', SOURCE_TABLES: ['SUPPLY_TRANSFER_0911'],
    PLAYER_PROMPT: 'S4行き1件あたりの平均・最小・最大の箱数を調べよう。異常の原因は、まだ断定しない。',
    CANONICAL_SQL: "SELECT AVG(quantity), MIN(quantity), MAX(quantity) FROM SUPPLY_TRANSFER_0911 WHERE destination = 'S4';", EXPECTED_RESULT: rs(['AVG(quantity)', 'MIN(quantity)', 'MAX(quantity)'], [[17.2, 9, 25]]),
    EVIDENCE_TYPE: 'DERIVED FACT', EVIDENCE: '平均17.2箱、最小9箱、最大25箱。最大の1件だけでは総量86箱を説明できない。',
    HINT_1: 'AVGは平均、MINは最小、MAXは最大です。同じ対象の数量を別の角度から読みます。',
    HINT_2: '3つの集約式を、取り出す列と同じようにカンマで並べます。', FINAL_HINT: 'SELECT AVG(quantity), MIN(□), MAX(□) ...\n対象は前回と同じS4です。',
    COMMUNICATION_AFTER_CLEAR: '受領票を複数回の搬送として保全した。', NEXT_STORY_HOOK: '他区画にも同程度の物資が届いたのか。比較のため全区画を集計する。', VALIDATION: '17.2/9/25。平均の整数切り捨て不可。',
  },
  {
    TITLE: '区画ごとの輪郭', STORY_NEED: 'S4への集中を他区画と比較する。物資と同時に回収された移送便の人数も、同じ区画単位で整理する。',
    INTERACTION_KIND: 'SQL_BUILD', NEW_CONCEPT: 'GROUP BY：同じキーごとの集合', SOURCE_TABLES: ['SUPPLY_TRANSFER_0911', 'EVAC_BATCH_0911'],
    PLAYER_PROMPT: '行き先ごとの物資総量を調べよう。次に移送記録を区画ごとにまとめ、人数を合計して。',
    CANONICAL_SQL: 'SELECT destination, SUM(quantity) FROM SUPPLY_TRANSFER_0911 GROUP BY destination;',
    EXPECTED_RESULT: rs(['destination', 'SUM(quantity)'], [['S1', 22], ['S2', 26], ['S3', 4], ['S4', 86]]),
    EVIDENCE_TYPE: 'DERIVED FACT', EVIDENCE: '物資はS4に86箱で最多。移送人数はS1=19、S2=22、S3=7、S4=83。箱数と人数を混同しない。',
    HINT_1: '全行を1つに足す代わりに、同じ行き先の行をまとめます。', HINT_2: 'SELECTにグループの名前とSUMを置き、GROUP BYにグループを作る列を書きます。',
    FINAL_HINT: '物資は destination と quantity。移送は sector と people。同じ集計の形を、別の記録へ適用します。',
    COMMUNICATION_AFTER_CLEAR: '区画ごとの物資量と人数が揃った。施設定員台帳を受信した。', NEXT_STORY_HOOK: 'S4の定員欄は30。移送人数との関係を確かめる。',
    VALIDATION: '物資4群=22/26/4/86、人数4群=19/22/7/83。2照会で同じ概念の転用を確認。',
    followup: { prompt: '避難移送記録を区画ごとにまとめ、人数を合計しよう。', sql: 'SELECT sector, SUM(people) FROM EVAC_BATCH_0911 GROUP BY sector;', result: rs(['sector', 'SUM(people)'], [['S1', 19], ['S2', 22], ['S3', 7], ['S4', 83]]) },
  },
  {
    TITLE: '三十人を超える集合', STORY_NEED: 'S4の定員30人を監査の比較基準にし、それを超える移送集合を確認する。',
    INTERACTION_KIND: 'ANOMALY_DETECTION', NEW_CONCEPT: 'HAVING：集計した集合を絞る', SOURCE_TABLES: ['EVAC_BATCH_0911', 'FACILITY_CAPACITY'],
    PLAYER_PROMPT: '区画別の移送人数を合計し、合計30人を超える区画だけを調べよう。定員30はS4の値で、全区画共通の定員ではない。',
    CANONICAL_SQL: 'SELECT sector, SUM(people) FROM EVAC_BATCH_0911 GROUP BY sector HAVING SUM(people) > 30;', EXPECTED_RESULT: rs(['sector', 'SUM(people)'], [['S4', 83]]),
    EVIDENCE_TYPE: 'DERIVED FACT', EVIDENCE: 'S4は83人。定員30との差は53人。ただし、この差だけでは53人の身元や行政上の不在はまだ証明できない。',
    HINT_1: 'WHEREは元の行、HAVINGは集計後のグループを絞ります。>は「より大きい」です。',
    HINT_2: 'WHERE people > 30だと30人を超える便だけを探します。今回は便を足した後で比べます。', FINAL_HINT: 'GROUP BY sector HAVING SUM(people) > 30',
    COMMUNICATION_AFTER_CLEAR: '差分53を監査メモへ保存。UNKNOWN-07の人物照合に必要な索引を申請した。', NEXT_STORY_HOOK: '匿名のメモを追うため、住民IDを照合用の列として整理する。',
    VALIDATION: 'S4/83のみ。全便は30人以下なのでWHERE people > 30は0行になる。',
  },
  {
    TITLE: '照合のための呼び名', STORY_NEED: '人物索引との照合を控え、住民IDとキャッシュの表示名を取り違えない控えを作る。',
    INTERACTION_KIND: 'SQL_BUILD', NEW_CONCEPT: 'AS：表と結果列の別名', SOURCE_TABLES: ['RESIDENT_CACHE'],
    PLAYER_PROMPT: 'S4で所在不明の住民IDと表示名を、照合対象ID・記録上の名前として取り出そう。表にはrという短い名前を付けて。',
    CANONICAL_SQL: "SELECT r.resident_id AS audit_id, r.display_name AS cached_name FROM RESIDENT_CACHE AS r WHERE r.status = 'MISSING' AND r.last_sector = 'S4';", EXPECTED_RESULT: rs(['audit_id', 'cached_name'], s4Missing.map(r => r.slice(0, 2))),
    EVIDENCE_TYPE: 'RAW FACT', EVIDENCE: '照合用の結果見出しを付けた。保存済みの列名・人物名を書き換えたわけではない。',
    HINT_1: 'ASはこの照会の中で使う別名を付けます。', HINT_2: 'FROM RESIDENT_CACHE AS r と書くと、r.resident_idはその表の住民IDです。',
    FINAL_HINT: 'SELECT r.resident_id AS audit_id, r.display_name AS cached_name ...\n結果の表示ラベルは全画面で「照合対象ID」「記録上の名前」です。',
    COMMUNICATION_AFTER_CLEAR: '照合の控えを保存。独立保管の人物索引が届いた。', NEXT_STORY_HOOK: 'キャッシュの住民IDと人物索引の住民IDを対応させる。',
    VALIDATION: '3人・別名audit_id/cached_nameが一致。元表は不変。ここは発見ではなく照合準備。', strictColumns: true,
  },
  {
    TITLE: 'UNKNOWN-07に名前を', STORY_NEED: 'キャッシュで仮表示になっている名前を、別保管の人物索引から復元する。',
    INTERACTION_KIND: 'RELATION_TRACE', NEW_CONCEPT: 'INNER JOIN / ON：キーが一致する行を対応させる', SOURCE_TABLES: ['RESIDENT_CACHE', 'PERSON_INDEX'],
    PLAYER_PROMPT: '住民キャッシュに残る人の住民ID・表示名・戸籍名を照合しよう。UNKNOWN-07から、同じ人物を指すキーをたどって。',
    CANONICAL_SQL: 'SELECT r.resident_id, r.display_name, p.legal_name FROM RESIDENT_CACHE AS r INNER JOIN PERSON_INDEX AS p ON r.resident_id = p.resident_id;',
    EXPECTED_RESULT: rs(['resident_id', 'display_name', 'legal_name'], cache.map(r => [r[0], r[1], ORIGINAL_TABLES.PERSON_INDEX.rows.find(p => p[0] === r[0])[1]])),
    EVIDENCE_TYPE: 'RECONSTRUCTED FACT', EVIDENCE: 'UNKNOWN-07は住民ID R003を介して如月アヤに対応する。表示名どうしの類似から推測したのではない。',
    HINT_1: '同じ人でも、2つの表の名前表記は違う場合があります。', HINT_2: 'INNER JOINは対応のある行を残します。ONには両方の表で一致させるキーを書きます。',
    FINAL_HINT: 'FROM RESIDENT_CACHE AS r INNER JOIN PERSON_INDEX AS p ON r.□ = p.□\n□には同じ人物を指す列を選びます。',
    COMMUNICATION_AFTER_CLEAR: '照合結果の表示後、人物記録「如月アヤ」が開く。NORA「名前を記録に戻せます。」', NEXT_STORY_HOOK: '索引には認証IDもある。その認証IDが、事故後のどのゲートに残っているか。',
    VALIDATION: '住民IDの一致で7人を照合。R003行→人物索引R003行の選択履歴も保存する。絞り込みは次問で扱う。',
    trace: [{ table: 'RESIDENT_CACHE', key: 'resident_id', value: 'R003' }, { table: 'PERSON_INDEX', key: 'resident_id', value: 'R003' }],
  },
  {
    TITLE: '名前と足取り', STORY_NEED: '人物索引の認証IDから、S4-P6へ入った人と時刻を確かめる。',
    INTERACTION_KIND: 'SQL_BUILD', NEW_CONCEPT: '結合した結果へWHEREを適用する', SOURCE_TABLES: ['PERSON_INDEX', 'ACCESS_LOG'],
    PLAYER_PROMPT: '第4区画のP6ゲートへ入場した人の戸籍名と記録時刻を調べよう。退場や別ゲートは含めない。',
    CANONICAL_SQL: "SELECT p.legal_name, a.time FROM PERSON_INDEX AS p INNER JOIN ACCESS_LOG AS a ON p.credential_id = a.credential_id WHERE a.gate = 'S4-P6' AND a.event = 'IN';",
    EXPECTED_RESULT: rs(['legal_name', 'time'], [['羽鳥イオ', '23:09'], ['如月アヤ', '23:11'], ['朝霧トウマ', '23:14']]),
    EVIDENCE_TYPE: 'DERIVED FACT', EVIDENCE: '人物対応と行動履歴を合わせると、この3人のP6入場時刻が得られる。アヤの別ゲート2件は対象外。',
    HINT_1: '人物と記録を結ぶ条件と、調べたい行動を選ぶ条件を分けます。', HINT_2: 'ONには認証IDの対応、WHEREにはゲートと入場種別を指定します。', FINAL_HINT: "ON p.credential_id = a.credential_id\nWHERE a.gate = □ AND a.event = □",
    COMMUNICATION_AFTER_CLEAR: 'P6の受付端末から破損した受付票E442を回収。人物欄は読めない。', NEXT_STORY_HOOK: '受付票に残るセッションIDから、認証履歴と住民キャッシュへたどれるか。',
    VALIDATION: '3行。C773のARCHIVE-04入退場を含めない。JOINによる一対多を既存ログで確認。',
  },
  {
    TITLE: '壊れた受付票', STORY_NEED: '人物欄を失った受付票E442の人物を復元し、その人の既存登録区画も照合する。',
    INTERACTION_KIND: 'RELATION_TRACE', NEW_CONCEPT: '3表のキー連鎖', SOURCE_TABLES: ['EVAC_RECEPTION', 'TERMINAL_LOG', 'RESIDENT_CACHE'],
    PLAYER_PROMPT: 'E442の認証から住民記録までたどり、住民IDと最終登録区画を復元しよう。受付場所と時刻も、元の票で確認して。',
    CANONICAL_SQL: "SELECT e.reception_id, r.resident_id, r.last_sector FROM EVAC_RECEPTION AS e INNER JOIN TERMINAL_LOG AS t ON e.session_id = t.session_id INNER JOIN RESIDENT_CACHE AS r ON t.resident_id = r.resident_id WHERE e.reception_id = 'E442';",
    EXPECTED_RESULT: rs(['reception_id', 'resident_id', 'last_sector'], [['E442', 'R005', 'S2']]),
    EVIDENCE_TYPE: 'RECONSTRUCTED FACT', EVIDENCE: 'E442→S442→R005。E442の受付はS4・23:09、キャッシュはS2。同一分の別認証S443と混同しない。時点の異なる記録なので、これだけで改ざんとは断定しない。',
    HINT_1: '最初の表と最後の表に、直接一致するキーがなくてもたどれます。', HINT_2: '受付票のセッションIDから認証行へ。その住民IDから住民行へ進みます。',
    FINAL_HINT: 'e.session_id = t.session_id → t.resident_id = r.resident_id\n各対応元の行を選んでから照会で確かめます。',
    COMMUNICATION_AFTER_CLEAR: 'NORA「復元結果を保全しました。」', NEXT_STORY_HOOK: 'E442の検証欄が空いている。ゼロ人を意味するのか、それとも未報告なのか。',
    VALIDATION: 'E442/R005/S2の1行。端末IDと分だけの結合は複数候補になり不正解。',
    trace: [{ table: 'EVAC_RECEPTION', key: 'reception_id', value: 'E442' }, { table: 'TERMINAL_LOG', key: 'session_id', value: 'S442' }, { table: 'RESIDENT_CACHE', key: 'resident_id', value: 'R005' }],
  },
  {
    TITLE: '空欄の意味', STORY_NEED: '復旧担当の未報告を、ゼロ人と誤って扱うと追加確認が止まってしまう。',
    INTERACTION_KIND: 'NULL_REASONING', NEW_CONCEPT: 'NULL / IS NULL：値が不明であること', SOURCE_TABLES: ['RECEPTION_AUDIT'],
    PLAYER_PROMPT: '確認済み人数が未報告の受付IDを調べよう。0人、空文字、未報告を区別して記録して。',
    CANONICAL_SQL: 'SELECT reception_id FROM RECEPTION_AUDIT WHERE verified_count IS NULL;', EXPECTED_RESULT: rs(['reception_id'], [['E442']]),
    EVIDENCE_TYPE: 'DERIVED FACT', EVIDENCE: 'E442は確認済み人数が未報告。E443は報告済み0人。E444のメモは長さ0の文字列。未報告を人数0とは数えられない。',
    HINT_1: 'NULLは不明を示す値です。数字の0や、長さ0の文字列とは別です。', HINT_2: 'NULLかどうかはIS NULLで調べます。= NULLでは一致を判定できません。',
    FINAL_HINT: 'WHERE verified_count IS NULL\n担当者メモの「空文字」と「NULL」も表示で区別します。',
    COMMUNICATION_AFTER_CLEAR: '未報告の受付を追加確認へ回す。署名済みの乗員台帳と公式避難者台帳を受信。', NEXT_STORY_HOOK: '人が乗員台帳にいるのに、公式避難者台帳に対応がない場合はどう観測するか。',
    VALIDATION: 'IS NULL→E442、=0→E443、operator_note=空文字→E444。=NULLは0行。',
    classifications: ['未報告', '報告済み0人', '空文字'],
  },
  {
    TITLE: '対応しない乗員', STORY_NEED: 'まずB06便の乗員を公式台帳と一人ずつ照合し、対応がない人を確認する。',
    INTERACTION_KIND: 'SQL_BUILD', NEW_CONCEPT: 'LEFT JOIN：対応がなくても左側を残す', SOURCE_TABLES: ['EVAC_MANIFEST', 'OFFICIAL_EVAC_REGISTER'],
    PLAYER_PROMPT: 'B06便の乗員で、公式避難者台帳に対応する住民IDがない人を調べよう。',
    CANONICAL_SQL: "SELECT m.resident_id FROM EVAC_MANIFEST AS m LEFT JOIN OFFICIAL_EVAC_REGISTER AS o ON m.resident_id = o.resident_id WHERE m.batch_id = 'B06' AND o.registration_id IS NULL;", EXPECTED_RESULT: rs(['resident_id'], [['R003'], ['R005'], ['R007']]),
    EVIDENCE_TYPE: 'DERIVED FACT', EVIDENCE: 'B06の21人中、R003/R005/R007に公式登録の対応がない。右側の非NULL主キーがNULLになることを観測した。',
    HINT_1: 'INNER JOINでは対応がない乗員が消えてしまいます。', HINT_2: 'LEFT JOINで乗員を残すと、対応がない右側の列はNULLになります。',
    FINAL_HINT: "LEFT JOIN OFFICIAL_EVAC_REGISTER AS o ON m.resident_id = o.resident_id\nWHERE m.batch_id = 'B06' AND o.registration_id IS NULL",
    COMMUNICATION_AFTER_CLEAR: '台帳の対象範囲と全件取込を再確認した。未取得ページによる不在ではない。', NEXT_STORY_HOOK: 'B06だけでなく全83人を照合すると、何人が公式記録にいないのか。',
    VALIDATION: '左21人、対応あり18人、不在3人。右側の主キーは実データでは必ず非NULL。',
  },
  {
    TITLE: '存在しない対応を証拠に', STORY_NEED: '全83人について、公式台帳に同じ住民IDが一件もない人を証拠化する。',
    INTERACTION_KIND: 'SQL_BUILD', NEW_CONCEPT: '相関NOT EXISTS：その人の対応が存在しない', SOURCE_TABLES: ['EVAC_MANIFEST', 'OFFICIAL_EVAC_REGISTER'],
    PLAYER_PROMPT: '全乗員のうち、公式避難者台帳に登録されていない住民IDを調べよう。各人について対応の有無を確かめて。',
    CANONICAL_SQL: 'SELECT m.resident_id FROM EVAC_MANIFEST AS m WHERE NOT EXISTS (SELECT 1 FROM OFFICIAL_EVAC_REGISTER AS o WHERE o.resident_id = m.resident_id);', EXPECTED_RESULT: rs(['resident_id'], ABSENT_IDS.map(x => [x])),
    EVIDENCE_TYPE: 'DERIVED FACT', EVIDENCE: '対象83人のうち公式台帳に対応がない住民IDは53件。Q12の人数差と一致し、今度は53人のIDまで再現できる。',
    HINT_1: '外側で一人を見るたび、内側でその人の対応を探す形です。', HINT_2: 'EXISTSは1行でもあるかを調べます。SELECT 1の1は、人数を数える値ではありません。NOT EXISTSは1行もないとき成立します。',
    FINAL_HINT: 'WHERE NOT EXISTS (SELECT 1 FROM OFFICIAL_EVAC_REGISTER AS o WHERE o.resident_id = m.resident_id)\n内側と外側を結ぶ条件を落とすと、一人ずつの確認になりません。',
    COMMUNICATION_AFTER_CLEAR: '不在の53人をID付きで保全。P6入場記録の全件復元版と、独立交通記録が届いた。', NEXT_STORY_HOOK: '乗員、公式登録、ゲート、交通。それぞれの記録だけでは説明できないことが残っている。',
    VALIDATION: 'R003/R005/R007/R037〜R086の53人。未相関NOT EXISTSは0人、LEFT JOINによる別解は同じ53人。',
  },
  {
    TITLE: 'あなたの照会', STORY_NEED: '行政上の不在は証拠になった。しかし、人が都市から消えたことと同じなのか。監査員自身が残る記録を検証する。',
    INTERACTION_KIND: 'FINAL_INVESTIGATION', NEW_CONCEPT: '新規構文なし：問い・資料・関係・証拠を自分で決める', SOURCE_TABLES: ['EVAC_MANIFEST', 'OFFICIAL_EVAC_REGISTER', 'ACCESS_LOG', 'TRANSIT_SHADOW'],
    PLAYER_PROMPT: '53人について、まだ確かめられていないことは何だろう。問いを記し、必要な記録を選び、再現できる証拠を残して。',
    CANONICAL_SQL: "SELECT t.destination, COUNT(*) AS people FROM EVAC_MANIFEST AS m INNER JOIN ACCESS_LOG AS a ON m.credential_id = a.credential_id INNER JOIN TRANSIT_SHADOW AS t ON a.credential_id = t.credential_id WHERE a.gate = 'S4-P6' AND a.event = 'IN' AND NOT EXISTS (SELECT 1 FROM OFFICIAL_EVAC_REGISTER AS o WHERE o.resident_id = m.resident_id) GROUP BY t.destination;",
    EXPECTED_RESULT: rs(['destination', 'people'], [['NORTH-LATTICE', 53]]),
    EVIDENCE_TYPE: 'DERIVED FACT', EVIDENCE: '全件取込済みの同じ監査期間において、公式登録に対応がない53人のP6入場と最終到着先が結び付く。到着先はNORTH-LATTICE。移動記録だけで現在の生存や消去の意図を断定しない。',
    HINT_1: 'いま言えることと、まだ証拠がないことを分けてみてください。', HINT_2: '選んだ記録の1行は何を表しますか。同じ人を指すキーと、資料の対象期間を確認してください。',
    FINAL_HINT: '調べたい人の集合、行動の記録、到着の記録を順に確認できます。不在を判定する資料も選びます。使う構文はこれまでの照会履歴から参照できます。',
    COMMUNICATION_AFTER_CLEAR: '結果を表示してから、監査記録を保全する。NORA「この証拠は、あなたの照会から得られました。」', NEXT_STORY_HOOK: 'CITY STATUS: NORMAL。NORA「何か異常がありますか？」監査員「……まだ分からない。」照会端末は開いたままになる。',
    VALIDATION: '4資料の関係から所在地と53人を再現。別名・JOIN順・LEFT JOINによる不在・不要なHAVINGの省略を許容。資料を変更した反例でも成立する照会で判定する。',
  },
];

export const MISSIONS = defs.map((mission, i) => ({
  MISSION_ID: `NR-SQL-${String(i + 1).padStart(2, '0')}`,
  KNOWN_CONCEPTS: defs.slice(0, i).map(d => d.NEW_CONCEPT),
  DISPLAY_LABELS: LABELS,
  DATA: { snapshot: i < 19 ? '2043-09-11-recovered' : '2043-09-11-complete', tables: mission.SOURCE_TABLES },
  ...mission,
}));

// 課題の答えを表示するためでなく、編集・検証・再開に同じデータ契約を使う。
export const REQUIRED_FIELDS = ['MISSION_ID', 'TITLE', 'STORY_NEED', 'INTERACTION_KIND', 'NEW_CONCEPT',
  'KNOWN_CONCEPTS', 'SOURCE_TABLES', 'DISPLAY_LABELS', 'PLAYER_PROMPT', 'DATA', 'CANONICAL_SQL',
  'EXPECTED_RESULT', 'EVIDENCE_TYPE', 'EVIDENCE', 'HINT_1', 'HINT_2', 'FINAL_HINT',
  'COMMUNICATION_AFTER_CLEAR', 'NEXT_STORY_HOOK', 'VALIDATION'];
