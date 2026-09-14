// js/validator.js
export function cleanSQL(raw){
  return String(raw)
    .toUpperCase()
    .replace(/;/g,'')
    .replace(/[、，]/g,',')
    .replace(/\s*>=\s*/g,' >= ')
    .replace(/\s*<=\s*/g,' <= ')
    .replace(/\s*<>\s*/g,' <> ')
    .replace(/\s*!=\s*/g,' <> ')
    .replace(/\s*=\s*/g,' = ')
    .replace(/\s*,\s*/g,', ')
    .replace(/\s+/g,' ')
    .trim();
}

export function judge(built, answers){
  const c = cleanSQL(built);
  if(!c.replace(/\s/g,'').length) return { ok:false, empty:true };
  return { ok: answers.some(a => cleanSQL(a) === c), empty:false };
}