// tools/ux-run-all.mjs
// UX Decoder A (遷移監査) と B (契約監査) を両方実行し、結果を UNION で統合する。
// AとBは競合ではなく相補的な2つの監査であり、「FAIL数が少ない方が優秀」という判定はしない。
// 統合はあくまで「両方が検出したもの / Aだけが検出したもの / Bだけが検出したもの」の可視化。
//
//   node tools/ux-run-all.mjs

import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.join(ROOT, 'tools/ux-artifacts');

function runDecoder(scriptName){
  return new Promise(resolve => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(__dirname, scriptName)], { cwd: ROOT });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); process.stdout.write(`[${scriptName}] ${d}`); });
    child.stderr.on('data', d => { stderr += d.toString(); process.stderr.write(`[${scriptName}] ${d}`); });
    child.on('close', code => {
      resolve({ code, stdout, stderr, timeMs: Date.now() - t0 });
    });
  });
}

function keyOf(r){ return `${r.viewport}::${r.state}::${r.check}`; }

function loadReport(file){
  if(!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function main(){
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  console.log('=== Running UX Decoder A (transition audit) then B (contract audit) ===');
  const startedAt = Date.now();
  // 直列実行。ブラウザ2つを同時に走らせるとテストサーバ側でESモジュール取得が落ち、
  // アプリが起動しないままの偽FAILが混入するため、Gateの決定性を優先する。
  const aRun = await runDecoder('ux-decoder-a.mjs');
  const bRun = await runDecoder('ux-decoder-b.mjs');

  const aReport = loadReport(path.join(ARTIFACT_DIR, 'a', 'report.json'));
  const bReport = loadReport(path.join(ARTIFACT_DIR, 'b', 'report.json'));

  if(!aReport || !bReport){
    console.error('ERROR: report.json が生成されていません (a:', !!aReport, ' b:', !!bReport, ')');
    process.exit(1);
  }

  // 子プロセスが異常終了した場合、前回のreport.jsonを今回の結果として読んでしまうと
  // 偽のPASSを報告する。実行の成否とレポートの鮮度を必ず検証する。
  const staleErrors = [];
  const checkRun = (name, run, report) => {
    if(run.code !== 0) staleErrors.push(`${name} が異常終了しました (exit=${run.code})`);
    const gen = Date.parse(report.generatedAt || 0);
    if(!(gen >= startedAt - 1000)) staleErrors.push(`${name} の report.json が今回の実行で更新されていません (generatedAt=${report.generatedAt})`);
  };
  checkRun('Decoder A', aRun, aReport);
  checkRun('Decoder B', bRun, bReport);
  if(staleErrors.length){
    console.error('');
    console.error('=== UX DECODER RUN FAILED ===');
    staleErrors.forEach(e => console.error('  ' + e));
    console.error('過去のレポートを今回の結果として扱わないため、ここで停止します。');
    process.exit(1);
  }

  const aFails = new Map((aReport.results || []).filter(r => !r.pass).map(r => [keyOf(r), r]));
  const bFails = new Map((bReport.results || []).filter(r => !r.pass).map(r => [keyOf(r), r]));

  const bothDetected = [];
  const aOnly = [];
  const bOnly = [];

  for(const [key, r] of aFails){
    if(bFails.has(key)) bothDetected.push({ key, a: r, b: bFails.get(key) });
    else aOnly.push({ key, a: r });
  }
  for(const [key, r] of bFails){
    if(!aFails.has(key)) bOnly.push({ key, b: r });
  }

  const abReport = {
    timestamp: new Date().toISOString(),
    a: { time: aRun.timeMs, exitCode: aRun.code, summary: aReport.summary },
    b: { time: bRun.timeMs, exitCode: bRun.code, summary: bReport.summary },
    union: { bothDetected, aOnly, bOnly }
  };
  writeFileSync(path.join(ARTIFACT_DIR, 'ab-report.json'), JSON.stringify(abReport, null, 2));

  console.log('');
  console.log('=== UNION SUMMARY (A と B は相補的な2監査。優劣判定はしない) ===');
  console.log(`A (transition audit): ${aReport.summary.pass}/${aReport.summary.total} pass, ${aReport.summary.fail} fail  (${aRun.timeMs}ms)`);
  console.log(`B (contract audit):   ${bReport.summary.pass}/${bReport.summary.total} pass, ${bReport.summary.fail} fail  (${bRun.timeMs}ms)`);
  console.log(`bothDetected: ${bothDetected.length}  (同じ箇所をA/B両方が検出 = 高確度の欠陥)`);
  console.log(`aOnly:        ${aOnly.length}  (遷移監査だけが検出 = 状態機械/タイミング由来の可能性)`);
  console.log(`bOnly:        ${bOnly.length}  (契約監査だけが検出 = DOM構造由来の可能性)`);
  if(bothDetected.length){
    console.log('');
    console.log('-- bothDetected --');
    bothDetected.forEach(x => console.log(`  ${x.key}`));
  }
  if(aOnly.length){
    console.log('');
    console.log('-- aOnly --');
    aOnly.forEach(x => console.log(`  ${x.key}  ${x.a.message || ''}`));
  }
  if(bOnly.length){
    console.log('');
    console.log('-- bOnly --');
    bOnly.forEach(x => console.log(`  ${x.key}  ${x.b.message || ''}`));
  }

  const totalIssues = bothDetected.length + aOnly.length + bOnly.length;
  console.log('');
  console.log(`ab-report.json written to ${path.relative(ROOT, path.join(ARTIFACT_DIR, 'ab-report.json'))}`);
  console.log(`TOTAL_UNIQUE_ISSUES: ${totalIssues}`);
  process.exit(totalIssues === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

// TODO(Sprint-Future): ux-bug-injection.mjs
//
// 真のA/B比較には「検出率」の測定が必要:
//   1. 既知のバグを N 個注入した版を生成
//   2. A と B を buggy 版に対して実行
//   3. 各変種の「検出率 = 検出したバグ数 / N」を比較
//   4. bug-free 版で「偽陽性率」を比較
//
// この時点で初めて union.neither（両方とも検出しなかったバグ）が
// 算出可能になる。それまでは bothDetected / aOnly / bOnly の3分類に留める。
