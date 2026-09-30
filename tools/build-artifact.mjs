// tools/build-artifact.mjs
// ============================================================
// Claude Artifact 用のビルド。
//   - ?v=... のキャッシュ用クエリを落とす（アーティファクトは実パスで配信される）
//   - BGM は .m4a を配信できないので .mp4 として公開する。参照名もそこへ書き換える。
//   - 立ち絵は軽量シート(webp)だけを載せる。元のPNG(2MB超)は載せない。
// 出力先はスクラッチパッドの build/。引数で変えられる。
//   node tools/build-artifact.mjs <outDir>
// ============================================================
import { mkdirSync, rmSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SRC = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = process.argv[2];
if(!OUT){ console.error('usage: node tools/build-artifact.mjs <outDir>'); process.exit(1); }

const TEXT = [
  'index.html',
  'css/style.css',
  ...readdirSync(join(SRC, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)
];
const BINARY = [
  ...readdirSync(join(SRC, 'assets/title/audio')).filter(f => f.endsWith('.m4a')).map(f => 'assets/title/audio/' + f),
  ...readdirSync(join(SRC, 'assets/characters')).filter(f => f.endsWith('.webp')).map(f => 'assets/characters/' + f)
];

rmSync(OUT, { recursive: true, force: true });

const dest = rel => { const d = join(OUT, rel); mkdirSync(dirname(d), { recursive: true }); return d; };
const putText = (rel, text) => writeFileSync(dest(rel), text);
// .m4a は配信できないので .mp4 という名前で出す。ビルド物をそのまま検証・公開できるよう、
// 参照名(bgm.js)とファイル名を一致させる。
const outName = rel => rel.replace(/\.m4a$/, '.mp4');
const putFile = rel => copyFileSync(join(SRC, rel), dest(outName(rel)));

for(const rel of TEXT){
  let s = readFileSync(join(SRC, rel), 'utf8');
  s = s.replace(/\?v=[^'"` )]*/g, '');          // キャッシュ用クエリを落とす
  if(rel === 'js/bgm.js') s = s.replace(/\.m4a/g, '.mp4');   // 配信できる形式へ
  putText(rel, s);
}
for(const rel of BINARY) putFile(rel);

// 公開パス → ビルド内のパス。ビルド内も .mp4 で出しているので同じ名前になる。
const files = {};
for(const rel of [...TEXT.filter(r => r !== 'index.html'), ...BINARY]){
  files[outName(rel)] = outName(rel);
}
writeFileSync(join(OUT, 'files.json'), JSON.stringify(files, null, 2));

console.log(`built ${TEXT.length + BINARY.length} files -> ${OUT}`);
console.log(`files map: ${join(OUT, 'files.json')}`);

// アーティファクトのページ本体は <!doctype>/<html>/<head>/<body> を自分で書かない。
// index.html から中身だけを取り出して page.html として出す。
{
  let s = readFileSync(join(OUT, 'index.html'), 'utf8');
  s = s.replace(/<!DOCTYPE[^>]*>/i, '')
       .replace(/<\/?html[^>]*>/gi, '')
       .replace(/<\/?head[^>]*>/gi, '')
       .replace(/<\/?body[^>]*>/gi, '')
       .replace(/<meta charset[^>]*>/i, '')
       .split('\n').map(l => l.trimEnd()).filter(l => l.trim()).join('\n');
  writeFileSync(join(OUT, 'page.html'), s + '\n');
  console.log('page: ' + join(OUT, 'page.html'));
}
