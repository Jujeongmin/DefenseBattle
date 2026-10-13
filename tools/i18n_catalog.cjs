// 번역 키 목록 - 코드의 tl('...') 첫 인자 + index.html 의 data-i18n 을 모아, 언어별 번역 표에 빠진 키를 알려 준다.
// 실행: node tools/i18n_catalog.cjs            → 언어별 빠진 개수
//       node tools/i18n_catalog.cjs --keys     → 전체 키를 JSON 으로
//       node tools/i18n_catalog.cjs --missing en → 그 언어에 빠진 키를 JSON 으로
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const GAME = path.join(__dirname, '..', 'game');
const SRC = path.join(GAME, 'src');
const keys = new Set();
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'i18n') walk(p); continue; }
    if (!p.endsWith('.ts') || p.endsWith('.d.ts')) continue;
    const sf = ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true);
    (function visit(n) {
      if (ts.isCallExpression(n) && n.expression.getText() === 'tl' && n.arguments[0] && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) keys.add(n.arguments[0].text);
      ts.forEachChild(n, visit);
    })(sf);
  }
})(SRC);
const html = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8');
for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1].replace(/&quot;/g, '"'));

const all = [...keys].sort();
const load = (lang) => {
  const file = path.join(SRC, 'i18n', `${lang}.ts`);
  const txt = fs.readFileSync(file, 'utf8');
  const body = txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1);
  // eslint-disable-next-line no-new-func
  return Function(`return (${body});`)();
};
const arg = process.argv[2];
if (arg === '--keys') { console.log(JSON.stringify(all, null, 1)); process.exit(0); }
if (arg === '--missing') { const d = load(process.argv[3]); console.log(JSON.stringify(all.filter((k) => !(k in d)), null, 1)); process.exit(0); }
console.log(`키 ${all.length}개`);
for (const l of ['en', 'ja', 'zh-hans', 'zh-hant']) {
  const d = load(l);
  const miss = all.filter((k) => !(k in d)).length;
  const extra = Object.keys(d).filter((k) => !keys.has(k)).length;
  console.log(`${l}: 빠짐 ${miss}${extra ? ` · 안 쓰는 키 ${extra}` : ''}`);
}
