// js/missions.js
// 学習ミッションの宣言的定義。
//
// 期待結果(resultSet)は書かない。正解SQLを js/sql-engine.js で実行して生成する。
// 60問を手書きの期待結果で持つと必ずどこかがズレるため、単一の真実源を「正解SQL」に置く。
// これにより1問の追加は「指示文・正解SQL・ガイド文」の3つを書くだけで済む。

import { ONBOARDING_TABLES, queryTokens, tokenKind } from './onboarding.js';
import { executeSelect } from './sql-engine.js?v=20260928-missions';

// ---- 備品世界の追加データ（6〜8行。1画面に収まる大きさを保つ） ----
export const EXTRA_TABLES = {
  // 発注記録。status で状態を持ち、supplier で仕入先を持つ。
  ORDERS: { cols: ['order_id', 'item', 'supplier', 'quantity', 'status'], keys: [], rows: [
    ['O1', '鉛筆',   '北原商会', 20, '納品済'],
    ['O2', '消しゴム', '北原商会', 10, '手配中'],
    ['O3', '定規',   '南口文具', 15, '納品済'],
    ['O4', '鉛筆',   '南口文具', 30, '手配中'],
    ['O5', 'ノート',  '北原商会', 25, '納品済'],
    ['O6', 'ノート',  '東雲産業',  5, '欠品'],
    ['O7', '定規',   '東雲産業', 12, '手配中'],
    ['O8', '消しゴム', '南口文具', 18, '納品済']
  ] },
  // 担当者。desk が REQUESTS.desk と対応する。
  STAFF: { cols: ['staff_id', 'staff_name', 'desk'], keys: [], rows: [
    ['S1', '青木', '受付'],
    ['S2', '井上', '倉庫'],
    ['S3', '上野', '作業室'],
    ['S4', '遠藤', '受付'],
    ['S5', '大野', '倉庫'],
    ['S6', '加藤', '会議室']   // 補充依頼がまだ来ていない担当場所（外部結合で差が出る）
  ] }
};

export const MISSION_TABLES = { ...ONBOARDING_TABLES, ...EXTRA_TABLES };

const NOTES = {
  STOCK:    '一行は、一つの棚にある一種類の備品。在庫数を数量に記録しています。',
  REQUESTS: '一行は一件の補充依頼。数量は依頼された個数です。',
  ORDERS:   '一行は一件の発注。状態は 納品済 / 手配中 / 欠品 のいずれかです。',
  STAFF:    '一行は一人の担当者。担当場所が補充依頼の依頼元と対応します。'
};

// 正解SQLから、その問題で使う表名を拾う
function tablesOf(sql){
  // 語単位で照合する（正規表現のエスケープに依存しない）
  const words = new Set(sql.toUpperCase().split(/[^A-Z0-9_]+/));
  return Object.keys(MISSION_TABLES).filter(name => words.has(name));
}

// トークンパッドの語彙。正解に必要な語 + その表の列 + 少しの紛れ（distract）。
// 正解の語だけだと選ぶ余地が無くなり、多すぎると探せなくなるため上限を設ける。
// 正解に必要な語は必ず全部入れる。紛れ(distract)は上限まで。
const MAX_TOKENS = 20;
function padTokens(sql, tables, distract){
  const need = queryTokens(sql).map(t => t.t);
  const cols = tables.flatMap(n => MISSION_TABLES[n].cols);
  // 必要語 → 表名 → 列 → 紛れ の順。必要語は上限に関係なく残す。
  const uniqNeed = [];
  for(const w of need){ if(w !== ',' && !uniqNeed.includes(w)) uniqNeed.push(w); }
  const extras = [...tables, ...cols, ...(distract || [])];
  const list = [...uniqNeed];
  for(const w of extras){
    if(list.length >= MAX_TOKENS) break;
    if(w !== ',' && !list.includes(w)) list.push(w);
  }
  return list.map(t => ({ t, k: tokenKind(t) }));
}

// 宣言 → 実行可能なステージ。期待結果はここで計算する。
export function buildMission(spec, index){
  const { title, prompt, answer, guide, concept, starter, ordered, distract, reveal } = spec;
  const tables = tablesOf(answer);
  const computed = executeSelect(answer, MISSION_TABLES);
  const id = `M${String(index + 1).padStart(2, '0')}`;
  return {
    id, learning: true, time: 0,
    level: `${id} · ${title}`, chapterTitle: title,
    prompt, brief: prompt, concept, tables,
    note: NOTES[tables[0]] || '',
    guide, hint1: guide,
    hint2: `必要な操作：${concept}。表の見出しもタップできます。`,
    skeleton: starter || answer.replace(/SELECT .*? FROM/, 'SELECT □ FROM'),
    starter,
    answers: [answer],
    resultSet: { cols: computed.cols, rows: computed.rows.map(r => [...r]) },
    ordered: !!ordered,
    tokens: padTokens(answer, tables, distract),
    reveal: { text: reveal || '照会結果を作業記録に保存しました。' }
  };
}

// ============ 第2部: 条件と並べ替えを網羅する（備品世界） ============
// 1問につき増えるのは1つだけ。前問のSQLを引き継いで、差分だけを編集させる。
export const BLOCK_CONDITIONS = [
  { title:'一致しないものを探す', concept:'<> 不一致',
    prompt:'A棚ではない備品を表示してください。',
    answer:"SELECT item, shelf, quantity FROM STOCK WHERE shelf <> 'A'",
    guide:'= を <> に置き換えると「一致しない」条件になります。',
    starter:"SELECT item, shelf, quantity FROM STOCK WHERE shelf = 'A'", distract:['=','<>'] },

  { title:'以上で絞る', concept:'>= 以上',
    prompt:'数量が5以上の備品を表示してください。',
    answer:'SELECT item, shelf, quantity FROM STOCK WHERE quantity >= 5',
    guide:'棚を数量に、<> を >= に、値を5に置き換えます。', distract:['>','>=','<','<=','5'] },

  { title:'以下で絞る', concept:'<= 以下',
    prompt:'数量が5以下の備品を表示してください。',
    answer:'SELECT item, shelf, quantity FROM STOCK WHERE quantity <= 5',
    guide:'>= を <= に置き換えるだけです。境目の5がどちらに入るか確かめましょう。', distract:['>=','<=','5'] },

  { title:'範囲で絞る', concept:'ANDで範囲を作る',
    prompt:'数量が3以上8以下の備品を表示してください。',
    answer:'SELECT item, shelf, quantity FROM STOCK WHERE quantity >= 3 AND quantity <= 8',
    guide:'「以上」と「以下」をANDでつなぐと範囲になります。', distract:['AND','>=','<=','3','8'] },

  { title:'条件をひっくり返す', concept:'NOT',
    prompt:'数量が5以上ではない備品を表示してください。',
    answer:'SELECT item, shelf, quantity FROM STOCK WHERE NOT quantity >= 5',
    guide:'条件の前にNOTを置くと、その条件に当てはまらない行が残ります。',
    starter:'SELECT item, shelf, quantity FROM STOCK WHERE quantity >= 5', distract:['NOT','>=','5'] },

  { title:'いくつかの値から選ぶ', concept:'IN',
    prompt:'鉛筆か定規の在庫を表示してください。',
    answer:"SELECT item, shelf, quantity FROM STOCK WHERE item IN ('鉛筆','定規')",
    guide:'ORをいくつも書く代わりに、INで候補を並べられます。',
    distract:['IN','OR',"'鉛筆'","'定規'","'消しゴム'"] },

  { title:'候補から外す', concept:'NOT IN',
    prompt:'鉛筆でも定規でもない在庫を表示してください。',
    answer:"SELECT item, shelf, quantity FROM STOCK WHERE item NOT IN ('鉛筆','定規')",
    guide:'IN の前に NOT を置くと、候補以外が残ります。',
    starter:"SELECT item, shelf, quantity FROM STOCK WHERE item IN ('鉛筆','定規')",
    distract:['NOT','IN',"'鉛筆'","'定規'"] },

  { title:'多い順に並べる', concept:'ORDER BY DESC',
    prompt:'在庫を数量の多い順に表示してください。',
    answer:'SELECT item, shelf, quantity FROM STOCK ORDER BY quantity DESC', ordered:true,
    guide:'ORDER BY の後ろに DESC を付けると大きい順になります。', distract:['ORDER BY','ASC','DESC'] },

  { title:'二段階で並べる', concept:'ORDER BY 複数キー',
    prompt:'棚の順に並べ、同じ棚の中では数量の少ない順に表示してください。',
    answer:'SELECT item, shelf, quantity FROM STOCK ORDER BY shelf, quantity', ordered:true,
    guide:'ORDER BY に列を2つ書くと、1つ目が同じときだけ2つ目で並びます。',
    distract:['ORDER BY','shelf','quantity','ASC','DESC'] },

  { title:'全部で何件か', concept:'COUNT(*)',
    prompt:'在庫の記録は全部で何件ありますか。',
    answer:'SELECT COUNT(*) FROM STOCK',
    guide:'COUNT(*) は残っている行の数を返します。条件を付けなければ全件です。',
    starter:'SELECT □ FROM STOCK', distract:['COUNT(*)','SUM(quantity)'] },

  { title:'絞ってから数える', concept:'WHERE と COUNT の順番',
    prompt:'B棚の記録は何件ありますか。',
    answer:"SELECT COUNT(*) FROM STOCK WHERE shelf = 'B'",
    guide:'先に WHERE で行を絞り、残った行を COUNT(*) が数えます。',
    distract:['COUNT(*)','WHERE','=',"'A'","'B'"] },

  { title:'一番多い在庫', concept:'MAX',
    prompt:'在庫の数量で一番大きい値はいくつですか。',
    answer:'SELECT MAX(quantity) FROM STOCK',
    guide:'MAX は列の最大値を返します。行は1つにまとまります。',
    starter:'SELECT □ FROM STOCK', distract:['MAX(quantity)','MIN(quantity)','AVG(quantity)'] },

  { title:'一番少ない在庫', concept:'MIN',
    prompt:'在庫の数量で一番小さい値はいくつですか。',
    answer:'SELECT MIN(quantity) FROM STOCK',
    guide:'MAX を MIN に置き換えるだけです。', distract:['MAX(quantity)','MIN(quantity)'] },

  { title:'平均を出す', concept:'AVG',
    prompt:'在庫の数量の平均はいくつですか。',
    answer:'SELECT AVG(quantity) FROM STOCK',
    guide:'AVG は平均値を返します。合計(SUM)とは違うことを確かめましょう。',
    distract:['AVG(quantity)','SUM(quantity)','MIN(quantity)'] },

  { title:'合計と平均を並べる', concept:'集計を並べる',
    prompt:'在庫の合計数量と平均数量を一緒に表示してください。',
    answer:'SELECT SUM(quantity), AVG(quantity) FROM STOCK',
    guide:'集計も列と同じようにカンマで並べられます。',
    distract:['SUM(quantity)','AVG(quantity)','COUNT(*)'] }
];


// ============ 第3部: 集計をまとめる・別の表へ移す（備品世界） ============
export const BLOCK_GROUPING = [
  { title:'品目ごとに数える', concept:'GROUP BY + COUNT',
    prompt:'品目ごとに、在庫の記録が何件あるか表示してください。',
    answer:'SELECT item, COUNT(*) FROM STOCK GROUP BY item',
    guide:'GROUP BY で品目ごとにまとめると、COUNT(*) はまとまりごとの件数になります。',
    distract:['GROUP BY','COUNT(*)','SUM(quantity)'] },

  { title:'分類を変える', concept:'GROUP BY の列を選び直す',
    prompt:'棚ごとに、在庫の記録が何件あるか表示してください。',
    answer:'SELECT shelf, COUNT(*) FROM STOCK GROUP BY shelf',
    guide:'まとめる列を品目から棚に置き換えます。SELECT 側も合わせます。',
    distract:['GROUP BY','item','shelf'] },

  { title:'件数と合計を並べる', concept:'1つのまとまりから2つの集計',
    prompt:'棚ごとに、記録の件数と数量の合計を表示してください。',
    answer:'SELECT shelf, COUNT(*), SUM(quantity) FROM STOCK GROUP BY shelf',
    guide:'まとまりは同じまま、集計をカンマで増やします。',
    distract:['COUNT(*)','SUM(quantity)','AVG(quantity)'] },

  { title:'集計してから絞る', concept:'HAVING',
    prompt:'数量の合計が10を超える棚だけ表示してください。',
    answer:'SELECT shelf, SUM(quantity) FROM STOCK GROUP BY shelf HAVING SUM(quantity) > 10',
    guide:'WHERE は行を絞りますが、HAVING はまとめた後の集計値で絞ります。',
    distract:['HAVING','WHERE','>','10','SUM(quantity)'] },

  { title:'絞る場所で結果が変わる', concept:'WHERE と HAVING の違い',
    prompt:'数量が3以上の記録だけを対象に、棚ごとの合計を表示してください。',
    answer:'SELECT shelf, SUM(quantity) FROM STOCK WHERE quantity >= 3 GROUP BY shelf',
    guide:'今度は集計の前に行を落とします。HAVING を WHERE に移すと結果が変わります。',
    distract:['WHERE','HAVING','>=','3'] },

  { title:'集計結果を並べ替える', concept:'GROUP BY + ORDER BY',
    prompt:'品目ごとの数量合計を、少ない順に表示してください。',
    answer:'SELECT item, SUM(quantity) FROM STOCK GROUP BY item ORDER BY SUM(quantity)', ordered:true,
    guide:'GROUP BY の後ろに ORDER BY を足します。並べ替えの対象は集計値です。',
    distract:['ORDER BY','DESC','ASC','SUM(quantity)'] },

  { title:'発注の記録を見る', concept:'別の表へ転用',
    prompt:'発注の品目・仕入先・数量を表示してください。',
    answer:'SELECT item, supplier, quantity FROM ORDERS',
    guide:'表が変わっても操作は同じです。必要な列を選んで FROM に表名を置きます。',
    starter:'SELECT □ FROM ORDERS', distract:['ORDERS','STOCK','status','order_id'] },

  { title:'状態で絞る', concept:'新しい表でのWHERE',
    prompt:'まだ手配中の発注を表示してください。',
    answer:"SELECT item, supplier, quantity FROM ORDERS WHERE status = '手配中'",
    guide:'状態の列を条件に使います。値は表のセルをタップして入れられます。',
    distract:['WHERE','status',"'手配中'","'納品済'","'欠品'"] },

  { title:'仕入先ごとにまとめる', concept:'新しい表でのGROUP BY',
    prompt:'仕入先ごとの発注数量の合計を表示してください。',
    answer:'SELECT supplier, SUM(quantity) FROM ORDERS GROUP BY supplier',
    guide:'まとめる列を仕入先にします。集計は今までと同じです。',
    distract:['GROUP BY','supplier','item','SUM(quantity)'] },

  { title:'絞ってからまとめる', concept:'WHERE と GROUP BY の組み合わせ',
    prompt:'納品済の発注だけを対象に、仕入先ごとの数量合計を表示してください。',
    answer:"SELECT supplier, SUM(quantity) FROM ORDERS WHERE status = '納品済' GROUP BY supplier",
    guide:'WHERE で行を選んでから GROUP BY でまとめます。書く順番もこの通りです。',
    distract:['WHERE','GROUP BY','status',"'納品済'","'手配中'"] },

  { title:'まとまりを絞る', concept:'新しい表でのHAVING',
    prompt:'発注数量の合計が30以上の仕入先だけ表示してください。',
    answer:'SELECT supplier, SUM(quantity) FROM ORDERS GROUP BY supplier HAVING SUM(quantity) >= 30',
    guide:'まとめた後の合計で絞るので HAVING を使います。',
    distract:['HAVING','WHERE','>=','30','SUM(quantity)'] },

  { title:'担当者を見る', concept:'3つ目の表',
    prompt:'担当者の名前と担当場所を表示してください。',
    answer:'SELECT staff_name, desk FROM STAFF',
    guide:'担当場所は、補充依頼の依頼元と同じ言葉が入っています。',
    starter:'SELECT □ FROM STAFF', distract:['STAFF','staff_id','staff_name','desk'] },

  { title:'2つの表をつなぐ', concept:'INNER JOIN',
    prompt:'補充依頼の品目に、その依頼元の担当者名を付けて表示してください。',
    answer:'SELECT r.item, s.staff_name FROM REQUESTS AS r INNER JOIN STAFF AS s ON r.desk = s.desk',
    guide:'同じ意味の列（依頼元と担当場所）でつなぎます。表に短い別名を付けると書きやすくなります。',
    starter:'SELECT □ FROM REQUESTS AS r INNER JOIN STAFF AS s ON r.desk = s.desk',
    distract:['r.item','s.staff_name','r.desk','s.desk'] },

  { title:'つないでから絞る', concept:'JOIN + WHERE',
    prompt:'受付から出た補充依頼について、品目と担当者名を表示してください。',
    answer:"SELECT r.item, s.staff_name FROM REQUESTS AS r INNER JOIN STAFF AS s ON r.desk = s.desk WHERE r.desk = '受付'",
    guide:'つないだ後の表に対して WHERE を書きます。どちらの表の列でも条件にできます。',
    distract:['WHERE','r.desk',"'受付'","'倉庫'"] },

  { title:'つないでからまとめる', concept:'JOIN + GROUP BY',
    prompt:'担当者ごとに、担当した補充依頼の数量合計を表示してください。',
    answer:'SELECT s.staff_name, SUM(r.quantity) FROM REQUESTS AS r INNER JOIN STAFF AS s ON r.desk = s.desk GROUP BY s.staff_name',
    guide:'つないだ結果を、担当者名でまとめます。集計する列は依頼側の数量です。',
    distract:['GROUP BY','SUM(r.quantity)','s.staff_name'] }
];

// ============ 第4部: 重複排除・あいまい検索・範囲・外部結合（FE出題範囲） ============
export const BLOCK_FE_A = [
  { title:'同じものを1つにする', concept:'DISTINCT',
    prompt:'在庫にある品目の種類を、重複なく表示してください。',
    answer:'SELECT DISTINCT item FROM STOCK',
    guide:'SELECT の直後に DISTINCT を置くと、同じ内容の行が1つにまとまります。',
    starter:'SELECT item FROM STOCK', distract:['DISTINCT','item','shelf'] },

  { title:'組み合わせで重複を見る', concept:'DISTINCT 複数列',
    prompt:'発注に出てくる「品目と仕入先」の組み合わせを、重複なく表示してください。',
    answer:'SELECT DISTINCT item, supplier FROM ORDERS',
    guide:'列を2つ書くと、その組み合わせが同じ行だけがまとめられます。',
    starter:'SELECT DISTINCT □ FROM ORDERS', distract:['DISTINCT','item','supplier','status'] },

  { title:'絞ってから重複を消す', concept:'DISTINCT + WHERE',
    prompt:'納品済の発注に出てくる仕入先を、重複なく表示してください。',
    answer:"SELECT DISTINCT supplier FROM ORDERS WHERE status = '納品済'",
    guide:'先に WHERE で行を絞り、残った行から重複を消します。',
    distract:['DISTINCT','WHERE','status',"'納品済'","'手配中'"] },

  { title:'前が一致するものを探す', concept:'LIKE 前方一致',
    prompt:'仕入先が「北」で始まる発注を表示してください。',
    answer:"SELECT item, supplier, quantity FROM ORDERS WHERE supplier LIKE '北%'",
    guide:'LIKE は形で探します。% は「ここから先は何文字でもよい」という意味です。',
    distract:['LIKE',"'北%'","'%文具'","'%口%'"] },

  { title:'後ろが一致するものを探す', concept:'LIKE 後方一致',
    prompt:'仕入先が「文具」で終わる発注を表示してください。',
    answer:"SELECT item, supplier, quantity FROM ORDERS WHERE supplier LIKE '%文具'",
    guide:'% を前に置くと「ここまでは何文字でもよい」になります。',
    distract:['LIKE',"'%文具'","'北%'"] },

  { title:'途中に含むものを探す', concept:'LIKE 中間一致',
    prompt:'仕入先に「口」が含まれる発注を表示してください。',
    answer:"SELECT item, supplier, quantity FROM ORDERS WHERE supplier LIKE '%口%'",
    guide:'% で前後をはさむと「どこかに含まれる」になります。',
    distract:['LIKE',"'%口%'","'%文具'"] },

  { title:'含まないものを探す', concept:'NOT LIKE',
    prompt:'仕入先が「北」で始まらない発注を表示してください。',
    answer:"SELECT item, supplier, quantity FROM ORDERS WHERE supplier NOT LIKE '北%'",
    guide:'LIKE の前に NOT を置くと、形が合わないものが残ります。',
    starter:"SELECT item, supplier, quantity FROM ORDERS WHERE supplier LIKE '北%'",
    distract:['NOT LIKE','LIKE',"'北%'"] },

  { title:'1文字だけ自由にする', concept:'LIKE _（1文字）',
    prompt:'仕入先が「北」で始まり「商会」で終わる4文字の会社の発注を表示してください。',
    answer:"SELECT item, supplier, quantity FROM ORDERS WHERE supplier LIKE '北_商会'",
    guide:'_ は「ちょうど1文字」です。% との違いを確かめましょう。',
    distract:['LIKE',"'北_商会'","'北%'"] },

  { title:'範囲をまとめて書く', concept:'BETWEEN',
    prompt:'発注数量が10以上20以下のものを表示してください。',
    answer:'SELECT item, supplier, quantity FROM ORDERS WHERE quantity BETWEEN 10 AND 20',
    guide:'>= と <= を AND でつなぐ代わりに、BETWEEN で範囲を1つに書けます。境目は含みます。',
    distract:['BETWEEN','AND','>=','<=','10','20'] },

  { title:'範囲の外を探す', concept:'NOT BETWEEN',
    prompt:'発注数量が10以上20以下ではないものを表示してください。',
    answer:'SELECT item, supplier, quantity FROM ORDERS WHERE quantity NOT BETWEEN 10 AND 20',
    guide:'BETWEEN の前に NOT を置くと、範囲の外が残ります。',
    starter:'SELECT item, supplier, quantity FROM ORDERS WHERE quantity BETWEEN 10 AND 20',
    distract:['NOT BETWEEN','BETWEEN','10','20'] },

  { title:'範囲と並べ替えを合わせる', concept:'BETWEEN + ORDER BY',
    prompt:'発注数量が10以上20以下のものを、数量の少ない順に表示してください。',
    answer:'SELECT item, supplier, quantity FROM ORDERS WHERE quantity BETWEEN 10 AND 20 ORDER BY quantity',
    ordered:true,
    guide:'条件はそのまま。末尾に ORDER BY を足します。',
    distract:['ORDER BY','BETWEEN','DESC','ASC'] },

  { title:'いない相手も残す', concept:'LEFT JOIN',
    prompt:'受付以外の担当者について、担当者名と補充依頼の品目を表示してください。依頼が無い担当者も残します。',
    answer:"SELECT s.staff_name, r.item FROM STAFF AS s LEFT JOIN REQUESTS AS r ON s.desk = r.desk WHERE s.desk <> '受付'",
    guide:'INNER JOIN だと相手のいない行は消えます。LEFT JOIN は左の表の行を必ず残し、右側を空(NULL)にします。',
    starter:"SELECT s.staff_name, r.item FROM STAFF AS s INNER JOIN REQUESTS AS r ON s.desk = r.desk WHERE s.desk <> '受付'",
    distract:['LEFT JOIN','INNER JOIN','s.staff_name','r.item'] },

  { title:'欠けている側を探す', concept:'LEFT JOIN + IS NULL',
    prompt:'補充依頼が1件も来ていない担当者の名前を表示してください。',
    answer:'SELECT s.staff_name FROM STAFF AS s LEFT JOIN REQUESTS AS r ON s.desk = r.desk WHERE r.item IS NULL',
    guide:'LEFT JOIN で空になった行は、右側の列が NULL です。IS NULL でその行だけを取り出せます。',
    distract:['IS NULL','IS NOT NULL','LEFT JOIN','r.item'] },

  { title:'向きを逆にする', concept:'RIGHT JOIN',
    prompt:'担当場所が「室」で終わる担当者について、補充依頼の品目と担当者名を表示してください。依頼が無い担当者も残します。',
    answer:"SELECT r.item, s.staff_name FROM REQUESTS AS r RIGHT JOIN STAFF AS s ON r.desk = s.desk WHERE s.desk LIKE '%室'",
    guide:'RIGHT JOIN は右の表の行を必ず残します。どちらを残したいかで選びます。',
    distract:['RIGHT JOIN','LEFT JOIN'] },

  { title:'0件を0と数える', concept:'外部結合 + COUNT',
    prompt:'担当者ごとに、担当した補充依頼の件数を表示してください。1件も無い人は0と出します。',
    answer:'SELECT s.staff_name, COUNT(r.item) FROM STAFF AS s LEFT JOIN REQUESTS AS r ON s.desk = r.desk GROUP BY s.staff_name',
    guide:'COUNT は NULL を数えません。LEFT JOIN と組み合わせると、0件の人が0として出ます。',
    distract:['COUNT(r.item)','COUNT(*)','LEFT JOIN','GROUP BY'] }
];

// ============ 第5部: 副問合せと総合（FE出題範囲の仕上げ） ============
export const BLOCK_FE_B = [
  { title:'一番多い在庫の品目', concept:'副問合せ（スカラー）',
    prompt:'在庫の数量が最大の備品を表示してください。数量の最大値は自分で調べずに求めます。',
    answer:'SELECT item, shelf, quantity FROM STOCK WHERE quantity = (SELECT MAX(quantity) FROM STOCK)',
    guide:'条件の右側に SELECT を丸かっこで入れると、その結果を値として使えます。数字を手で書かずに済みます。',
    starter:'SELECT item, shelf, quantity FROM STOCK WHERE quantity = 12',
    distract:['MAX(quantity)','MIN(quantity)','(',')'] },

  { title:'一番少ない在庫の品目', concept:'副問合せの中身を変える',
    prompt:'在庫の数量が最小の備品を表示してください。',
    answer:'SELECT item, shelf, quantity FROM STOCK WHERE quantity = (SELECT MIN(quantity) FROM STOCK)',
    guide:'かっこの中の MAX を MIN に置き換えるだけです。',
    distract:['MAX(quantity)','MIN(quantity)'] },

  { title:'平均より多いもの', concept:'副問合せ + 比較',
    prompt:'在庫の数量が平均より多い備品を表示してください。',
    answer:'SELECT item, shelf, quantity FROM STOCK WHERE quantity > (SELECT AVG(quantity) FROM STOCK)',
    guide:'= を > に変えると「平均より多い」になります。平均値そのものは書きません。',
    distract:['AVG(quantity)','>','<','='] },

  { title:'別の表の値で絞る', concept:'副問合せ IN',
    prompt:'補充依頼が出ている担当場所の担当者名を表示してください。',
    answer:'SELECT staff_name, desk FROM STAFF WHERE desk IN (SELECT desk FROM REQUESTS)',
    guide:'IN のかっこに SELECT を入れると、別の表から候補を作れます。',
    distract:['IN','NOT IN','(',')','REQUESTS'] },

  { title:'別の表に無いものを探す', concept:'副問合せ NOT IN',
    prompt:'補充依頼が1件も出ていない担当場所の担当者名を表示してください。',
    answer:'SELECT staff_name, desk FROM STAFF WHERE desk NOT IN (SELECT desk FROM REQUESTS)',
    guide:'IN の前に NOT を置くと「候補に無いもの」になります。外部結合と同じ答えが別の書き方で出ます。',
    starter:'SELECT staff_name, desk FROM STAFF WHERE desk IN (SELECT desk FROM REQUESTS)',
    distract:['NOT IN','IN'] },

  { title:'条件付きの候補で絞る', concept:'副問合せに条件を付ける',
    prompt:'数量が4以上の補充依頼が出ている担当場所の担当者名を表示してください。',
    answer:'SELECT staff_name, desk FROM STAFF WHERE desk IN (SELECT desk FROM REQUESTS WHERE quantity >= 4)',
    guide:'かっこの中にも WHERE を書けます。中の照会だけを先に考えると組み立てやすくなります。',
    distract:['WHERE','>=','4','IN'] },

  { title:'発注済みの備品だけ', concept:'副問合せで表をまたぐ',
    prompt:'発注が出ている品目について、在庫の記録を表示してください。',
    answer:'SELECT item, shelf, quantity FROM STOCK WHERE item IN (SELECT item FROM ORDERS)',
    guide:'在庫の表と発注の表を、品目でつなぎます。結合でなくても候補として使えます。',
    distract:['IN','ORDERS','STOCK','item'] },

  { title:'在庫に無い品目', concept:'副問合せ NOT IN（表またぎ）',
    prompt:'発注されているが、在庫の記録には無い品目を表示してください。',
    answer:'SELECT item, supplier, quantity FROM ORDERS WHERE item NOT IN (SELECT item FROM STOCK)',
    guide:'NOT を付けると「相手の表に出てこないもの」になります。',
    starter:'SELECT item, supplier, quantity FROM ORDERS WHERE item IN (SELECT item FROM STOCK)',
    distract:['NOT IN','IN','STOCK'] },

  { title:'最大の発注を出した仕入先', concept:'副問合せ + 集計',
    prompt:'発注数量が最大の発注について、品目と仕入先を表示してください。',
    answer:'SELECT item, supplier FROM ORDERS WHERE quantity = (SELECT MAX(quantity) FROM ORDERS)',
    guide:'表を ORDERS に変えるだけで、同じ考え方が使えます。',
    distract:['MAX(quantity)','ORDERS','supplier'] },

  { title:'重複を消して数える', concept:'DISTINCT + COUNT',
    prompt:'発注に出てくる仕入先は何社ありますか。重複は1社と数えます。',
    answer:'SELECT COUNT(DISTINCT supplier) FROM ORDERS',
    guide:'COUNT のかっこの中に DISTINCT を置くと、重複を除いて数えます。',
    starter:'SELECT COUNT(supplier) FROM ORDERS',
    distract:['COUNT(DISTINCT supplier)','COUNT(supplier)','COUNT(*)'] },

  { title:'絞って・まとめて・並べる', concept:'総合（WHERE→GROUP BY→ORDER BY）',
    prompt:'納品済の発注について、仕入先ごとの数量合計を、少ない順に表示してください。',
    answer:"SELECT supplier, SUM(quantity) FROM ORDERS WHERE status = '納品済' GROUP BY supplier ORDER BY SUM(quantity)",
    ordered:true,
    guide:'WHERE → GROUP BY → ORDER BY の順に書きます。実行もこの順で行われます。',
    distract:['WHERE','GROUP BY','ORDER BY','DESC',"'納品済'"] },

  { title:'まとめてから絞って並べる', concept:'総合（GROUP BY→HAVING→ORDER BY）',
    prompt:'仕入先ごとの発注数量合計のうち30以上のものを、多い順に表示してください。',
    answer:'SELECT supplier, SUM(quantity) FROM ORDERS GROUP BY supplier HAVING SUM(quantity) >= 30 ORDER BY SUM(quantity) DESC',
    ordered:true,
    guide:'HAVING はまとめた後、ORDER BY はその後です。',
    distract:['HAVING','WHERE','ORDER BY','30'] },

  { title:'つないで絞ってまとめる', concept:'総合（JOIN→WHERE→GROUP BY）',
    prompt:'数量が3以上の補充依頼について、担当者ごとの件数を表示してください。',
    answer:'SELECT s.staff_name, COUNT(*) FROM REQUESTS AS r INNER JOIN STAFF AS s ON r.desk = s.desk WHERE r.quantity >= 3 GROUP BY s.staff_name',
    guide:'結合してから WHERE で絞り、最後にまとめます。',
    distract:['INNER JOIN','WHERE','GROUP BY','COUNT(*)'] },

  { title:'あいまい検索とまとめ', concept:'総合（LIKE + GROUP BY）',
    prompt:'仕入先が「商会」で終わる発注について、品目ごとの数量合計を表示してください。',
    answer:"SELECT item, SUM(quantity) FROM ORDERS WHERE supplier LIKE '%商会' GROUP BY item",
    guide:'LIKE で絞ってから GROUP BY でまとめます。',
    distract:['LIKE',"'%商会'",'GROUP BY','SUM(quantity)'] },

  { title:'最後の照会', concept:'総合（副問合せ + 並べ替え）',
    prompt:'平均より多く発注された品目を、数量の多い順に表示してください。',
    answer:'SELECT item, supplier, quantity FROM ORDERS WHERE quantity > (SELECT AVG(quantity) FROM ORDERS) ORDER BY quantity DESC',
    ordered:true,
    guide:'ここまでに覚えた、副問合せ・比較・並べ替えを1つにまとめます。',
    distract:['AVG(quantity)','ORDER BY','DESC'],
    reveal:'備品管理の照会はここまでです。次の章から、同じ考え方で人を追います。' }
];

// campaign へ差し込む学習ミッション（既存 M01〜M12 の後ろに続く）
export const EXTRA_MISSIONS = [...BLOCK_CONDITIONS, ...BLOCK_GROUPING, ...BLOCK_FE_A, ...BLOCK_FE_B];
