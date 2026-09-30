// tools/cutout-repro-check.mjs
// ============================================================
// CUTOUT CONTRACT のゲート (SSOT: tools/cutout-character.mjs + assets/characters/cutout.manifest.json)
//
//   出力された webp は真実ではない。真実は 元PNG + 引数 + アルゴリズム。
//   だから毎回それを確かめる:
//     - マニフェストの引数がそろっている
//     - 元PNGが在る
//     - 作り直すと今の webp と同じものが出る（バイト一致）
//     - 同じ入力なら二度やっても同じ（決定性）
//     - 人物の内側に穴が開いていない（色キーで壊れる失敗の再発防止）
//     - 背景の四隅が透明になっている（切り抜けている）
// ============================================================
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build, cutout, readRGBA, sha256, loadManifest, ffmpegVersion } from './cutout-character.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
let failed = 0;
const check = (name, ok, detail = '') => {
  if(ok) console.log(`  PASS  ${name}`);
  else { failed++; console.log(`  FAIL  ${name}${detail ? '  -- ' + detail : ''}`); }
};

const manifest = loadManifest();
console.log(`[マニフェスト]  algorithm=${manifest.algorithm}`);
console.log(`                ${ffmpegVersion()}`);
check('アルゴリズム名が記録されている', !!manifest.algorithm, String(manifest.algorithm));
check('出力が1件以上ある', Array.isArray(manifest.outputs) && manifest.outputs.length > 0);

const REQUIRED = ['src', 'out', 'grid', 'size', 'lo', 'hi', 'blur', 'despill', 'q'];
for(const entry of manifest.outputs){
  console.log(`\n[${entry.out}]`);
  const missing = REQUIRED.filter(k => entry[k] === undefined);
  check('引数がすべて書いてある', missing.length === 0, missing.join(','));
  check('元のPNGが在る', existsSync(join(ROOT, entry.src)), entry.src);
  if(missing.length || !existsSync(join(ROOT, entry.src))) continue;

  // ---- 作り直して今のものと突き合わせる ----
  const made = build(entry, { write: false });
  const current = existsSync(join(ROOT, entry.out)) ? readFileSync(join(ROOT, entry.out)) : null;
  check('出力が在る', !!current, entry.out);
  if(current){
    const same = sha256(current) === sha256(made.bytes);
    check('引数から作り直すと今の出力と一致する（バイト単位）', same,
      same ? '' : `made=${sha256(made.bytes).slice(0, 12)} current=${sha256(current).slice(0, 12)} / ffmpeg が違うと差が出ます`);
  }

  // ---- 決定性: 同じ入力を二度通しても同じ ----
  const a = readRGBA(join(ROOT, entry.src));
  const b = readRGBA(join(ROOT, entry.src));
  cutout(a.px, a.W, a.H, entry);
  cutout(b.px, b.W, b.H, entry);
  let diff = 0;
  for(let k = 3; k < a.px.length; k += 4) if(a.px[k] !== b.px[k]) diff++;
  check('二度やっても同じ不透明度になる（決定性）', diff === 0, `差のあった画素 ${diff}`);

  // ---- 切り抜けているか / 穴が開いていないか ----
  // 「穴」とは、周りを人物に囲まれた透明の島のこと。色キーで壊れたときに大量に出た。
  // コマの縁から透明をたどって到達できない透明画素が1つでもあれば、それが穴。
  const [GX, GY] = String(entry.grid).split('x').map(Number);
  const CW = Math.floor(a.W / GX), CH = Math.floor(a.H / GY);
  const alphaAt = (x, y) => a.px[(y * a.W + x) * 4 + 3];
  const CLEAR = 8;     // これ以下を透明とみなす
  const SOLID = 250;   // これ以上を人物（通れない）とみなす。ぼかしの中間値は通す
  let holes = 0, clearedPx = 0, totalPx = 0, edgeCleared = 0;

  for(let gy = 0; gy < GY; gy++){
    for(let gx = 0; gx < GX; gx++){
      const x0 = gx * CW, y0 = gy * CH;
      const seen = new Uint8Array(CW * CH);
      const stack = [];
      const push = (x, y) => {
        const k = (y - y0) * CW + (x - x0);
        if(seen[k] || alphaAt(x, y) >= SOLID) return;
        seen[k] = 1; stack.push(x, y);
      };
      for(let x = x0; x < x0 + CW; x++){ push(x, y0); push(x, y0 + CH - 1); }
      for(let y = y0; y < y0 + CH; y++){ push(x0, y); push(x0 + CW - 1, y); }
      edgeCleared += stack.length / 2;
      while(stack.length){
        const y = stack.pop(), x = stack.pop();
        if(x > x0)          push(x - 1, y);
        if(x < x0 + CW - 1) push(x + 1, y);
        if(y > y0)          push(x, y - 1);
        if(y < y0 + CH - 1) push(x, y + 1);
      }
      for(let y = y0; y < y0 + CH; y++){
        for(let x = x0; x < x0 + CW; x++){
          totalPx++;
          const transparent = alphaAt(x, y) <= CLEAR;
          if(transparent) clearedPx++;
          if(transparent && !seen[(y - y0) * CW + (x - x0)]) holes++;   // 囲まれた透明 = 穴
        }
      }
    }
  }
  const ratio = clearedPx / totalPx;
  check('背景が実際に抜けている（コマの縁から透明が始まっている）', edgeCleared > 0, `縁の透明画素 ${edgeCleared}`);
  check('抜けた割合がまともな範囲（5%〜70%）', ratio >= 0.05 && ratio <= 0.70, `${(ratio * 100).toFixed(1)}%`);
  check('人物の内側に穴が開いていない（囲まれた透明の島がゼロ）', holes === 0, `穴の画素 ${holes}`);
}

console.log(failed ? `\nCUTOUT REPRO GATE: FAIL (${failed})` : '\nCUTOUT REPRO GATE: PASS');
process.exit(failed ? 1 : 0);
