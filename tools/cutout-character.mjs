// tools/cutout-character.mjs
// ============================================================
// CUTOUT CONTRACT (SSOT)
// ------------------------------------------------------------
// 真実は「元のPNG + assets/characters/cutout.manifest.json の引数 + ここのアルゴリズム」。
// 出力された webp は真実ではない。いつでもここから作り直せる副産物として扱う。
// 作り直せることは tools/cutout-repro-check.mjs が毎回確かめる。
//
// アルゴリズム: edge-flood-alpha
//   単純な色キーでは、髪や服の暗部まで背景と同じ色域に入っていて穴が開く。
//   そこで「コマの縁からつながっている背景色の領域」だけを塗りつぶす。
//   人物の内側は縁とつながっていないので、どれだけ暗くても残る。
//
//   1. コマの上辺3点（左上・中央・右上）の平均を背景色とする
//   2. コマの縁から4近傍で塗りつぶす。背景色からの距離が hi 以内の画素だけ通る
//   3. 塗りつぶせた画素の不透明度を距離で決める
//        距離 <= lo → 0 / 距離 >= hi → 255 / 間は線形
//   4. despill が真なら、塗りつぶせた画素の緑かぶりを落とす
//      （グリーンバック素材の縁に残る緑を、赤と青の平均まで下げる）
//   5. 不透明度だけを半径 blur の箱ぼかしにかける（色は触らない）
//
// 決定性: 入力・引数・ffmpeg が同じなら同じ画素が出る。乱数も時刻も使わない。
//
//   node tools/cutout-character.mjs            マニフェスト通りに全部作り直す
//   node tools/cutout-character.mjs --check    作り直して既存と一致するか見る（書かない）
//   node tools/cutout-character.mjs <in> <out> [--grid 2x2] [--size 768x768] [--lo 12] [--hi 46] [--blur 1] [--q 88]
// ============================================================
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
export const MANIFEST = join(ROOT, 'assets/characters/cutout.manifest.json');

export const sha256 = buf => createHash('sha256').update(buf).digest('hex');
export const ffmpegVersion = () =>
  execFileSync('ffmpeg', ['-version']).toString().split('\n')[0].trim();

// 画像を生の RGBA で読む。
export function readRGBA(file){
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file]).toString().trim();
  const [W, H] = probe.split('x').map(Number);
  const raw = join(tmpdir(), `cutout-read-${process.pid}.rgba`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', file, '-vf', 'format=rgba', '-f', 'rawvideo', raw]);
  const px = readFileSync(raw);
  try { unlinkSync(raw); } catch(e){}
  return { W, H, px };
}

// ---- アルゴリズム本体。画素だけを見る純粋な処理。px を書き換え、抜けた画素数を返す ----
export function cutout(px, W, H, { grid = '2x2', lo = 12, hi = 46, blur = 1, despill = false } = {}){
  const [GX, GY] = String(grid).split('x').map(Number);
  const CW = Math.floor(W / GX), CH = Math.floor(H / GY);
  const at = (x, y) => (y * W + x) * 4;
  const dist = (i, bg) => {
    const dr = px[i] - bg[0], dg = px[i + 1] - bg[1], db = px[i + 2] - bg[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  let cleared = 0;
  for(let gy = 0; gy < GY; gy++){
    for(let gx = 0; gx < GX; gx++){
      const x0 = gx * CW, y0 = gy * CH;
      // 1. 背景色（上辺は人物が入りにくい）
      const samples = [[x0 + 2, y0 + 2], [x0 + (CW >> 1), y0 + 2], [x0 + CW - 3, y0 + 2]];
      const bg = [0, 0, 0];
      for(const [sx, sy] of samples){
        const i = at(sx, sy);
        bg[0] += px[i] / samples.length; bg[1] += px[i + 1] / samples.length; bg[2] += px[i + 2] / samples.length;
      }

      // 2. 縁からの塗りつぶし
      const seen = new Uint8Array(CW * CH);
      const stack = [];
      const push = (x, y) => {
        const k = (y - y0) * CW + (x - x0);
        if(seen[k]) return;
        if(dist(at(x, y), bg) > hi) return;
        seen[k] = 1; stack.push(x, y);
      };
      for(let x = x0; x < x0 + CW; x++){ push(x, y0); push(x, y0 + CH - 1); }
      for(let y = y0; y < y0 + CH; y++){ push(x0, y); push(x0 + CW - 1, y); }
      while(stack.length){
        const y = stack.pop(), x = stack.pop();
        if(x > x0)          push(x - 1, y);
        if(x < x0 + CW - 1) push(x + 1, y);
        if(y > y0)          push(x, y - 1);
        if(y < y0 + CH - 1) push(x, y + 1);
      }

      // 3. 距離から不透明度 / 4. 緑かぶりを落とす
      for(let y = y0; y < y0 + CH; y++){
        for(let x = x0; x < x0 + CW; x++){
          if(!seen[(y - y0) * CW + (x - x0)]) continue;
          const i = at(x, y);
          const d = dist(i, bg);
          const a = d <= lo ? 0 : d >= hi ? 255 : Math.round(((d - lo) / (hi - lo)) * 255);
          px[i + 3] = a;
          if(a === 0) cleared++;
          // グリーンバックの縁に残る緑を落とす。赤と青の平均を超えた分だけ削る。
          if(despill && a > 0){
            const mid = Math.round((px[i] + px[i + 2]) / 2);
            if(px[i + 1] > mid) px[i + 1] = mid;
          }
        }
      }
    }
  }

  // 4. 不透明度だけを箱ぼかし
  if(blur > 0){
    const src = new Uint8Array(W * H);
    for(let k = 0; k < W * H; k++) src[k] = px[k * 4 + 3];
    const dst = new Uint8Array(W * H);
    for(let y = 0; y < H; y++){
      for(let x = 0; x < W; x++){
        let sum = 0, n = 0;
        for(let dy = -blur; dy <= blur; dy++){
          const yy = y + dy; if(yy < 0 || yy >= H) continue;
          for(let dx = -blur; dx <= blur; dx++){
            const xx = x + dx; if(xx < 0 || xx >= W) continue;
            sum += src[yy * W + xx]; n++;
          }
        }
        dst[y * W + x] = Math.round(sum / n);
      }
    }
    for(let k = 0; k < W * H; k++) px[k * 4 + 3] = dst[k];
  }
  return cleared;
}

// 1件を作る。write:false なら書かずに中身だけ返す。
export function build(entry, { write = true } = {}){
  const src = join(ROOT, entry.src);
  const { W, H, px } = readRGBA(src);
  const cleared = cutout(px, W, H, entry);
  const [OW, OH] = String(entry.size).includes('x')
    ? String(entry.size).split('x').map(Number)
    : [Number(entry.size), Number(entry.size)];

  const rawOut = join(tmpdir(), `cutout-write-${process.pid}.rgba`);
  const target = write ? join(ROOT, entry.out) : join(tmpdir(), `cutout-probe-${process.pid}.webp`);
  writeFileSync(rawOut, px);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', rawOut,
    '-vf', `scale=${OW}:${OH}`, '-c:v', 'libwebp', '-q:v', String(entry.q ?? 88),
    '-compression_level', '6', target]);
  try { unlinkSync(rawOut); } catch(e){}

  const bytes = readFileSync(target);
  if(!write){ try { unlinkSync(target); } catch(e){} }
  return { W, H, OW, OH, cleared, bytes, srcSha: sha256(readFileSync(src)) };
}

export const loadManifest = () => JSON.parse(readFileSync(MANIFEST, 'utf8'));

// ---- CLI ----
const invokedDirectly = process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if(invokedDirectly){
  const argv = process.argv.slice(2);
  const arg = (name, def) => {
    const i = argv.indexOf('--' + name);
    return i >= 0 ? argv[i + 1] : def;
  };
  const positional = [];
  for(let i = 0; i < argv.length; i++){
    if(argv[i].startsWith('--')){ i++; continue; }
    positional.push(argv[i]);
  }

  if(positional.length >= 2){
    // 単発モード（引数を試すとき用。確定した値は必ずマニフェストへ書き戻すこと）
    const entry = { src: positional[0], out: positional[1],
      grid: arg('grid', '2x2'), size: arg('size', '768x768'),
      lo: Number(arg('lo', 12)), hi: Number(arg('hi', 46)),
      blur: Number(arg('blur', 1)), q: Number(arg('q', 88)),
      despill: argv.includes('--despill') };
    const r = build(entry);
    console.log(`${entry.src} -> ${entry.out}  (${r.W}x${r.H} -> ${r.OW}x${r.OH}, 抜けた画素 ${(r.cleared / (r.W * r.H) * 100).toFixed(1)}%, ${Math.round(r.bytes.length / 1024)}KB)`);
  } else {
    const manifest = loadManifest();
    const check = argv.includes('--check');
    console.log(`algorithm: ${manifest.algorithm}  /  ${ffmpegVersion()}`);
    let bad = 0;
    for(const entry of manifest.outputs){
      const r = build(entry, { write: !check });
      const label = `${entry.out}  ${Math.round(r.bytes.length / 1024)}KB  抜けた画素 ${(r.cleared / (r.W * r.H) * 100).toFixed(1)}%`;
      if(!check){ console.log('  built  ' + label); continue; }
      const cur = existsSync(join(ROOT, entry.out)) ? readFileSync(join(ROOT, entry.out)) : null;
      const same = cur && sha256(cur) === sha256(r.bytes);
      if(!same) bad++;
      console.log(`  ${same ? 'same  ' : 'DIFF  '}${label}`);
    }
    if(check && bad) process.exit(1);
  }
}
