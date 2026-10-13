// 한국어 문구를 tl() 로 감싼다 (다국어). 여러 번 돌려도 이미 감싼 것은 건드리지 않는다.
//  - 'text' / `text`            → tl('text')
//  - `텍스트 ${a} 텍스트`        → tl('텍스트 {0} 텍스트', a)
//  - HTML 이 섞인 템플릿(`<b>..`)은 건드리지 않고 목록만 출력 → 손으로 ${tl('..')} 를 넣는다
//  - console.* 인자, import 경로, 객체 키, 타입은 제외
// 실행: node tools/i18n_wrap.cjs [--dry]
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'game', 'src');
const DRY = process.argv.includes('--dry');
const H = /[가-힣]/;
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'i18n') walk(p); } else if (p.endsWith('.ts') && !p.endsWith('.d.ts') && f !== 'i18n.ts') files.push(p);
  }
})(ROOT);

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const inConsole = (node) => { for (let p = node.parent; p && !ts.isSourceFile(p); p = p.parent) if (ts.isCallExpression(p) && /^console\./.test(p.expression.getText())) return true; return false; };
const isT = (call) => ts.isCallExpression(call) && call.expression.getText() === 'tl';
const htmlTpl = (n) => [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].some((x) => /</.test(x));

let changed = 0;
const manual = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  let edits = 0;

  // node 의 바뀐 소스 (자식까지 재귀로)
  const render = (node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && H.test(node.text) && !inConsole(node)) {
      const p = node.parent;
      if (isT(p) && p.arguments[0] === node) return node.getText();
      if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p)) && p.name === node) return node.getText();
      if (ts.isLiteralTypeNode(p) || ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return node.getText();
      edits++;
      return `tl(${q(node.text)})`;
    }
    if (ts.isTemplateExpression(node) && !inConsole(node)) {
      const lits = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      if (lits.some((x) => H.test(x))) {
        if (htmlTpl(node)) {
          // HTML 템플릿: 태그 밖 글자 덩어리와 태그 안 속성값(title 등)만 ${tl('..')} 로 바꾼다
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          const where = `${path.relative(ROOT, file)}:${line + 1}`;
          // 템플릿 전체를 따라가며 태그 안/밖을 기억한다 (변수 때문에 태그가 여러 조각에 걸쳐도 맞게)
          let inTag = false;
          const wrapText = (seg, atStart, atEnd) => {
            if (!H.test(seg)) return seg;
            const m = seg.match(/^(\s*)([\s\S]*?)(\s*)$/);
            // 변수 바로 옆에 붙은 조각은 문장이 끊긴 것 - 목록에 남겨 손으로 다듬는다
            if ((atStart && !m[1]) || (atEnd && !m[3])) manual.push(`${where}  "${m[2]}"`);
            edits++;
            return `${m[1]}\${tl(${q(m[2])})}${m[3]}`;
          };
          const wrapAttr = (seg) => seg.replace(/="([^"$]*[가-힣][^"$]*)"/g, (m0, v) => { edits++; return `="\${tl(${q(v)})}"`; });
          const conv = (raw, prevExpr, nextExpr) => {
            const segs = [];
            let cur = { tag: inTag, s: '' };
            for (const ch of raw) {
              if (!inTag && ch === '<') { segs.push(cur); inTag = true; cur = { tag: true, s: '<' }; continue; }
              if (inTag && ch === '>') { cur.s += '>'; segs.push(cur); inTag = false; cur = { tag: false, s: '' }; continue; }
              cur.s += ch;
            }
            segs.push(cur);
            return segs.map((g, i) => (g.tag ? wrapAttr(g.s) : wrapText(g.s, i === 0 && prevExpr, i === segs.length - 1 && nextExpr))).join('');
          };
          let out = '`' + conv(node.head.rawText, false, node.templateSpans.length > 0);
          node.templateSpans.forEach((sp, i) => {
            out += '${' + render(sp.expression) + '}' + conv(sp.literal.rawText, true, i < node.templateSpans.length - 1);
          });
          return out + '`';
        } else if (!(isT(node.parent) && node.parent.arguments[0] === node)) {
          let key = node.head.text;
          node.templateSpans.forEach((s, i) => { key += `{${i}}` + s.literal.text; });
          edits++;
          return `tl(${q(key)}, ${node.templateSpans.map((s) => render(s.expression)).join(', ')})`;
        }
      }
    }
    // 자식 중 바뀐 것만 갈아 끼운다
    const start = node.getStart(sf);
    let out = '';
    let pos = start;
    const kids = [];
    ts.forEachChild(node, (c) => { kids.push(c); });
    if (!kids.length) return node.getText(sf);
    for (const c of kids) {
      const cs = c.getStart(sf);
      const r = render(c);
      out += src.slice(pos, cs) + r;
      pos = c.getEnd();
    }
    out += src.slice(pos, node.getEnd());
    return out;
  };

  // 파일 전체: 최상위 문장마다 render (머리말 주석·공백 보존)
  let out = '';
  let pos = 0;
  for (const st of sf.statements) {
    const s = st.getStart(sf);
    out += src.slice(pos, s) + render(st);
    pos = st.getEnd();
  }
  out += src.slice(pos);

  if (edits) {
    changed += edits;
    if (!/import \{ tl \} from '[./]+i18n';/.test(out)) {
      const rel = path.relative(path.dirname(file), path.join(ROOT, 'i18n')).replace(/\\/g, '/');
      const spec = rel.startsWith('.') ? rel : `./${rel}`;
      const lastImport = [...out.matchAll(/^import [^;]+;\s*$/gm)].pop();
      const at = lastImport ? lastImport.index + lastImport[0].length : 0;
      out = out.slice(0, at) + `\nimport { tl } from '${spec}';` + out.slice(at);
    }
    if (!DRY) fs.writeFileSync(file, out);
    console.log(`${path.relative(ROOT, file)}: ${edits}`);
  }
}
console.log(`감싼 곳 ${changed}`);
if (manual.length) console.log(`손으로 처리할 HTML 템플릿 ${manual.length}:\n${manual.join('\n')}`);
