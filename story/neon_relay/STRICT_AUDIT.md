# NEON RELAY Step 1 — Strict Parser Audit

## Decision

v2の「散文からテーブル名を推論する」方式は撤回。
テーブル名の意味付けは、Markdown上で直前の非空行に独立して置かれた
`UPPER_SNAKE` 識別子だけを許可する。

パーサは本文の意味を推測しない。

## Original source

- Named tables: 4
- Unbound Markdown tables: 7

Named:
- RESIDENT_CACHE
- PERSON_INDEX
- ACCESS_LOG
- TRANSIT_SHADOW

## Canonicalized source

原文中に既に実名が存在する2件だけを、表直前の独立行として重複配置した。

- `SUPPLY_TRANSFER_0911`
- `EVAC_BATCH_0911`

新しい物語上の名称は発明していない。

- Named tables: 6
- Unbound Markdown tables: 5

Named:
- RESIDENT_CACHE
- SUPPLY_TRANSFER_0911
- EVAC_BATCH_0911
- PERSON_INDEX
- ACCESS_LOG
- TRANSIT_SHADOW

## Remaining unbound tables

匿名Markdown表はパーサが勝手に命名しない。
`tables_canonicalized_strict.json` の `unbound_tables` に行番号・列名・直前行を保持する。

現状、少なくとも Chapter 3 の `sector / emergency_capacity` 表は
SQL問題用の入力データであるのに物語本文に正式テーブル名がない。
これは parser defect ではなく source-schema defect として扱う。

またSQL実行結果として本文中に掲載された表も anonymous のまま残る。
それらを自動的に入力テーブルへ昇格させない。

## Gate

PASS:
- CHAPTER や B09 をテーブル名に誤認しない。
- 散文から名前を推測しない。
- 原文で独立明示された名前だけを採用する。
- 原文中に既存の正式名がある2表は、canonicalized sourceで明示化できる。

BLOCKER BEFORE 75-PROBLEM CORPUS:
- Chapter 3 capacity table needs an explicit canonical table name in the content schema.
- Chapter 5 TRANSIT_SHADOW is abbreviated with `...`; 83-row executable fixture is not yet present.
