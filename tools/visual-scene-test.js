// tools/visual-scene-test.js
// VISUAL SCENE（一枚絵 + セリフ + テキスト入力）のDomainテスト。DOM非依存。
//   イベントフラグ: OFFの間は一切起動しない（スタブの安全装置）
//   状態遷移      : IMAGE_PENDING → LINE_REVEALING → LINE_PENDING
//                   → AWAITING_INPUT → INPUT_PENDING → SCENE_CLEARED
//   ペンディング  : 画像待ち / 次送り待ち / 入力確定待ち
//   マージ        : buildSceneView が画像とセリフを1つのViewModelに束ねる
// 実行: node tools/visual-scene-test.js

const { pathToFileURL } = require('url');
const path = require('path');

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}
function eq(label, actual, expected){
  check(label, actual === expected, actual === expected ? '' : `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

(async () => {
  const m = await import(pathToFileURL(path.resolve(__dirname, '../js/visual-scene.js')).href);
  const { ScenePhase, SceneFlag, isSceneEnabled, defineScene, STUB_SCENE,
          SceneTextInput, VisualSceneSession, buildSceneView, mountVisualScene } = m;

  const ON = { [SceneFlag.VISUAL_SCENE_STUB]: true };
  const fresh = (scene = STUB_SCENE, flags = ON) => new VisualSceneSession(scene, { flags });

  // ================= イベントフラグ =================
  {
    eq('[flag] 既定ではOFF', isSceneEnabled(SceneFlag.VISUAL_SCENE_STUB, {}), false);
    eq('[flag] 未知のフラグはOFF', isSceneEnabled('nope', ON), false);
    eq('[flag] 明示的にtrueならON', isSceneEnabled(SceneFlag.VISUAL_SCENE_STUB, ON), true);
    eq('[flag] 文字列"true"では有効化しない',
      isSceneEnabled(SceneFlag.VISUAL_SCENE_STUB, { [SceneFlag.VISUAL_SCENE_STUB]: 'true' }), false);

    const off = fresh(STUB_SCENE, {});
    eq('[flag] OFFではstart()が失敗する', off.start(), false);
    eq('[flag] OFFではINACTIVEのまま', off.phase, ScenePhase.INACTIVE);
    eq('[flag] OFFでは送りもできない', off.advance(), false);
    eq('[flag] OFFではViewがactive=false', buildSceneView(off).active, false);
    eq('[flag] OFFではmountがnullを返す（DOMも作らない）',
      mountVisualScene({ flags: {}, renderer: { handlers: {}, render(){ return this; } } }), null);
  }

  // ================= Definition =================
  {
    eq('[def] スタブは一枚絵を持つ', STUB_SCENE.image, 'itimaie_sixyuzinnkou_sasie.png');
    eq('[def] スタブは2行', STUB_SCENE.lines.length, 2);
    check('[def] スタブのセリフはプレースホルダ（Story Canonを増やさない）',
      STUB_SCENE.lines.every(l => /PLACEHOLDER/.test(l.text) && /PLACEHOLDER/.test(l.speaker)),
      JSON.stringify(STUB_SCENE.lines.map(l => l.text)));
    eq('[def] 2行目が入力を要求する', STUB_SCENE.lines[1].input.id, 'reply');
    eq('[def] 1行目は入力を要求しない', STUB_SCENE.lines[0].input, null);
    let threw = false;
    try { defineScene({ id: 'x', lines: [] }); } catch(e){ threw = true; }
    check('[def] セリフ無しのシーンは作れない', threw);
    threw = false;
    try { defineScene({ lines: [{ text: 'a' }] }); } catch(e){ threw = true; }
    check('[def] idの無いシーンは作れない', threw);
  }

  // ================= 状態遷移（画像あり） =================
  {
    const s = fresh();
    eq('[flow] 初期はINACTIVE', s.phase, ScenePhase.INACTIVE);
    eq('[flow] start()できる', s.start(), true);
    eq('[flow] 画像ありならIMAGE_PENDING', s.phase, ScenePhase.IMAGE_PENDING);
    eq('[flow] 画像待ちはペンディング', s.isPending, true);
    eq('[flow] 画像待ち中は送れない', s.advance(), false);
    eq('[flow] imageReady()でLINE_REVEALING', s.imageReady() && s.phase, ScenePhase.LINE_REVEALING);
    eq('[flow] 二重start()は失敗', s.start(), false);

    // タイプライタ
    const len = s.currentLine.text.length;
    s.revealStep(3);
    eq('[flow] revealStepで3文字進む', s.revealedChars, 3);
    eq('[flow] 途中はまだLINE_REVEALING', s.phase, ScenePhase.LINE_REVEALING);
    s.revealStep(len);
    eq('[flow] 全文表示でLINE_PENDING', s.phase, ScenePhase.LINE_PENDING);
    eq('[flow] 文字数は本文長で止まる', s.revealedChars, len);
    eq('[flow] 次送り待ちはペンディング', s.isPending, true);
    eq('[flow] LINE_PENDINGではrevealStep不可', s.revealStep(1), false);

    // 2行目へ
    eq('[flow] advanceで次のセリフへ', s.advance() && s.lineIndex, 1);
    eq('[flow] 次のセリフはLINE_REVEALING', s.phase, ScenePhase.LINE_REVEALING);
    eq('[flow] 文字送りはリセットされる', s.revealedChars, 0);
  }

  // ================= 画像読み込み失敗でも止まらない =================
  {
    const s = fresh();
    s.start();
    eq('[image] imageFailedToLoad()で進行できる', s.imageFailedToLoad() && s.phase, ScenePhase.LINE_REVEALING);
    eq('[image] 失敗した画像はViewに出さない', buildSceneView(s).image, null);
    const s2 = fresh(defineScene({ id: 'noimg', lines: [{ speaker: 'X', text: 'ABC' }] }));
    s2.start();
    eq('[image] 画像が無いシーンはIMAGE_PENDINGを経由しない', s2.phase, ScenePhase.LINE_REVEALING);
  }

  // ================= 途中タップで全文表示 =================
  {
    const s = fresh();
    s.start(); s.imageReady();
    s.revealStep(1);
    eq('[skip] advanceは送り中なら全文表示として働く', s.advance() && s.phase, ScenePhase.LINE_PENDING);
    eq('[skip] 全文が出ている', s.revealedChars, s.currentLine.text.length);
  }

  // ================= テキスト入力 =================
  {
    const input = new SceneTextInput({ id: 'reply', maxLength: 5, required: true });
    eq('[input] 初期値は空', input.value, '');
    eq('[input] 空では無効', input.isValid(), false);
    eq('[input] 空白だけでは無効', input.setValue('   ') && input.isValid(), false);
    eq('[input] 値を入れられる', input.setValue('ab') && input.value, 'ab');
    eq('[input] 有効になる', input.isValid(), true);
    eq('[input] maxLengthで切り詰める', input.setValue('abcdefgh') && input.value, 'abcde');
    eq('[input] clearで空に戻る', input.clear() && input.value, '');
    input.setValue('  ok  ');
    eq('[input] commitはtrimした値を返す', input.commit(), 'ok');
    eq('[input] commit後は変更できない', input.setValue('x'), false);
    eq('[input] commitは二度目はnull', input.commit(), null);
    eq('[input] reopenで再入力できる', input.reopen() && input.setValue('y'), true);

    const opt = new SceneTextInput({ id: 'o', maxLength: 10, required: false });
    eq('[input] required=falseなら空でも有効', opt.isValid(), true);
  }

  // ================= 入力の状態遷移とペンディング =================
  {
    const s = fresh();
    s.start(); s.imageReady();
    s.skipReveal(); s.advance();          // 2行目へ
    s.skipReveal();                       // 2行目を全文表示
    eq('[input-flow] 入力要求行の送りでAWAITING_INPUT', s.advance() && s.phase, ScenePhase.AWAITING_INPUT);
    check('[input-flow] 入力オブジェクトが生成される', !!s.input);
    eq('[input-flow] 空のままsubmitは失敗', s.submitInput(), false);
    eq('[input-flow] 空のままではAWAITING_INPUTのまま', s.phase, ScenePhase.AWAITING_INPUT);

    s.input.setValue('テスト入力');
    eq('[input-flow] submitでINPUT_PENDING', s.submitInput() && s.phase, ScenePhase.INPUT_PENDING);
    eq('[input-flow] 入力確定待ちはペンディング', s.isPending, true);
    eq('[input-flow] 保留中はsubmitできない', s.submitInput(), false);

    eq('[input-flow] rejectInputで差し戻せる', s.rejectInput('retry') && s.phase, ScenePhase.AWAITING_INPUT);
    eq('[input-flow] 差し戻し後も値は残る', s.input.value, 'テスト入力');
    s.submitInput();
    eq('[input-flow] acceptInputで確定し最終行なのでSCENE_CLEARED',
      s.acceptInput() && s.phase, ScenePhase.SCENE_CLEARED);
    eq('[input-flow] 確定値が記録される', s.inputs.reply, 'テスト入力');
    eq('[input-flow] 終了後は送れない', s.advance(), false);
    eq('[input-flow] 終了後はacceptできない', s.acceptInput(), false);
  }

  // ================= イベント =================
  {
    const s = fresh();
    const seen = [];
    s.on('PhaseChanged', p => seen.push(`${p.from}->${p.to}`));
    let cleared = null;
    s.on('SceneCleared', p => { cleared = p; });
    s.start(); s.imageReady(); s.skipReveal(); s.advance(); s.skipReveal(); s.advance();
    s.input.setValue('x'); s.submitInput(); s.acceptInput();
    check('[event] PhaseChangedが順に発火する',
      seen[0] === 'INACTIVE->IMAGE_PENDING' && seen[1] === 'IMAGE_PENDING->LINE_REVEALING'
      && seen.includes('AWAITING_INPUT->INPUT_PENDING') && seen[seen.length - 1].endsWith('->SCENE_CLEARED'),
      seen.join(' | '));
    check('[event] SceneClearedが入力値を渡す', !!cleared && cleared.inputs.reply === 'x', JSON.stringify(cleared));
  }

  // ================= リセット =================
  {
    const s = fresh();
    s.start(); s.imageReady(); s.skipReveal();
    eq('[reset] resetでINACTIVEへ', s.reset() && s.phase, ScenePhase.INACTIVE);
    eq('[reset] 行位置も戻る', s.lineIndex, 0);
    eq('[reset] 文字送りも戻る', s.revealedChars, 0);
    eq('[reset] 再度startできる', s.start(), true);
  }

  // ================= 画像とセリフのマージ（ViewModel） =================
  {
    const s = fresh();
    s.start();
    let v = buildSceneView(s);
    eq('[view] 画像待ちはimagePending', v.imagePending, true);
    eq('[view] 画像パスが含まれる', v.image, 'itimaie_sixyuzinnkou_sasie.png');
    s.imageReady();
    s.revealStep(4);
    v = buildSceneView(s);
    eq('[view] 話者が含まれる', v.speaker, 'PLACEHOLDER');
    eq('[view] 表示テキストは送られた分だけ', v.text, STUB_SCENE.lines[0].text.slice(0, 4));
    eq('[view] 全文も同時に持つ', v.fullText, STUB_SCENE.lines[0].text);
    eq('[view] 送り中はshowAdvance=false', v.showAdvance, false);
    eq('[view] 進捗を持つ', `${v.progress.index}/${v.progress.total}`, '0/2');
    s.skipReveal();
    v = buildSceneView(s);
    eq('[view] 次送り待ちでshowAdvance=true', v.showAdvance, true);
    eq('[view] 入力が無い行ではinput=null', v.input, null);

    s.advance(); s.skipReveal(); s.advance();
    v = buildSceneView(s);
    check('[view] 入力要求行ではinputを持つ', !!v.input && v.input.awaiting === true, JSON.stringify(v.input));
    eq('[view] 入力は初期状態で無効', v.input.valid, false);
    eq('[view] maxLengthが渡る', v.input.maxLength, 24);
    s.input.setValue('ok'); s.submitInput();
    v = buildSceneView(s);
    eq('[view] 保留中はinput.pending=true', v.input.pending, true);
    eq('[view] 保留中はawaiting=false', v.input.awaiting, false);
    s.acceptInput();
    v = buildSceneView(s);
    eq('[view] 終了でcleared=true', v.cleared, true);
  }

  // ================= 差し替え可能であること（有効化時に実台詞を入れる） =================
  {
    const real = defineScene({
      id: 'CUSTOM',
      image: 'assets/characters/aya.png',
      lines: [{ speaker: 'NORA', text: 'ABCDE' }]
    });
    const s = fresh(real);
    s.start();
    eq('[custom] 任意のシーンを流せる', s.phase, ScenePhase.IMAGE_PENDING);
    s.imageReady(); s.skipReveal();
    eq('[custom] 単一行なら送りで終了', s.advance() && s.phase, ScenePhase.SCENE_CLEARED);
    eq('[custom] 画像パスを差し替えられる', buildSceneView(s).image, 'assets/characters/aya.png');
  }

  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
