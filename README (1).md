# NEON RELAY SQL DOJO v1

## Cloud Storage root
gs://<YOUR_BUCKET>/project-caravan/sql-dojo/neon-relay/v1/

## Why this layout
会話やLLMに毎回1万字超の本文を入れない。
通常ロードは以下だけ:
1. runtime/session_state.json
2. 完了済み章の summaries/*.json
3. 現在章の story/NN_chapter.md
4. 現在問題の questions/nr-NN.json

`story/full_story.md` は編集・監査用で、実行時にはロードしない。

## Object layout
manifest.json
story/
  00_prologue.md
  01_chapter.md ... 05_chapter.md
  full_story.md
questions/
  nr-01.json ... nr-05.json
summaries/
  00.json ... 05.json
runtime/
  context_recipe.json
  session_state.example.json
scripts/
  upload_to_gcs.ps1

## Runtime rule
章クリア後に session_state を保存し、次回は全文ではなく状態＋要約＋現在章だけをロードする。
未到達章の本文と問題正解は取得しない。
