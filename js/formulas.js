/* Fórmulas em NOMES (v3.5): lógica pura, sem DOM, testável em Node.
 * - nomes e símbolos das linhas  - texto digitado <-> referências do motor
 * - fórmula em notação matemática (HTML)  - casos de CHOOSE/SE  - dependências
 * Nada de eval/Function: o texto vira fórmula do Engine e passa pelo parser dele. */
(function (root) {
  'use strict';
  var Engine = root.Engine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fold = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  var W = {};

  // ------------------------------------------------------------------ símbolos e nomes
  var TAILS0 = 1;
  var STOP = { de: 1, da: 1, do: 1, em: 1, no: 1, na: 1, ao: 1, os: 1, as: 1, um: 1, ou: 1, se: 1, por: 1, com: 1, sem: 1, que: 1, dos: 1, das: 1, tem: 1, nos: 1, nas: 1, pelo: 1, pela: 1, para: 1, caso: 1, ate: 1, até: 1, max: 1, min: 1, mm: 1, cm: 1, kg: 1, ex: 1, tipo: 1, via: 1, vão: 1, sem2: 1 };
  var SYMRE = /^[A-Za-zα-ωΑ-Ω][A-Za-zα-ωΑ-Ω0-9₀-₉′]*$/;
  function symTok(w, lastTok) {
    w = w.replace(/^[(\[]+|[)\],.:;]+$/g, '');
    if (!w || w.length > 7 || !SYMRE.test(w)) return false;
    if (STOP[w.toLowerCase()] && w.length > 1) return false;
    if (/^[a-zà-öø-ÿ]{3,}$/.test(w)) return false;          // palavra comum
    if (/^[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]{3,}$/.test(w) && !TAILS.test(w.slice(1))) return false;  // palavra capitalizada
    if (/^[A-Z]{4,}$/.test(w)) return false;
    if (w.length === 1 && /[a-z]/.test(w) && !lastTok) return false;
    if (w.length === 2 && /^[a-zà-öø-ÿ]{2}$/.test(w)) return false;
    return true;
  }
  var TAILS = /^(max|min|adm|vm|nec|ef|tot|med|ref|lim)$/;
  W.deriveSymbol = function (label) {
    var l = String(label || '').replace(/\s+/g, ' ').trim();
    var mm = /^(\S{1,6}) [–-] /.exec(l); if (mm && /^[A-Za-zα-ωΑ-Ω]/.test(mm[1]) && !STOP[mm[1].toLowerCase()]) return mm[1];
    l = l.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    var lhs = l, eq = l.indexOf(' = '); if (eq > 0) lhs = l.slice(0, eq);
    var toks = lhs.split(' '), pick = null, i;
    for (i = toks.length - 1; i >= 0; i--) { if (symTok(toks[i], i === toks.length - 1)) { pick = toks[i]; break; } }
    if (!pick) return null;
    return pick.replace(/^[(\[]+|[)\],.:;]+$/g, '');
  };
  function shortOf(label) { var s2 = String(label).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').replace(/[?:]+$/, '').trim(); return s2 && s2.length < label.length ? s2 : label; }
  // rows: [{r, label, unit}] -> modelo de nomes. over: {linha: 'símbolo' | null} (ajustes manuais por calculadora)
  W.buildNames = function (rows, over) {
    over = over || {};
    var m = { rows: rows, byRow: {}, bySym: {}, byName: {}, symOf: {}, nameOf: {} }, used = {}, seenFull = {}, shortCnt = {};
    rows.forEach(function (x) { x.name = String(x.label || '').replace(/\s+/g, ' ').trim() || ('Linha ' + x.r); x.sym = (x.r in over) ? over[x.r] : W.deriveSymbol(x.name); m.byRow[x.r] = x; x.short = shortOf(x.name); shortCnt[fold(x.short)] = (shortCnt[fold(x.short)] || 0) + 1; });
    var firstOf = {};
    rows.forEach(function (x) {
      if (x.sym && /^(PI)$/i.test(x.sym)) x.sym = null;
      if (!x.sym) { x.symOk = false; return; }
      if (!(x.sym in firstOf) && !used[x.sym]) { firstOf[x.sym] = x.r; used[x.sym] = 1; x.symOk = true; return; }
      var q = /\(([^)\s,;]+)/.exec(x.name), cand = null;
      if (q) { var qq = fold(q[1]).replace(/[^a-z0-9]/g, '').slice(0, 5); if (qq) cand = x.sym + '_' + qq; }
      if (cand && !used[cand]) { x.sym = cand; used[cand] = 1; x.symOk = true; } else { x.symOk = false; }
    });
    rows.forEach(function (x) {
      var nm = x.name; if (seenFull[nm]) { nm = nm + ' · ' + (x.unit || ('linha ' + x.r)); if (seenFull[nm]) nm += ' #' + x.r; } seenFull[nm] = 1;
      x.uname = nm; m.nameOf[x.r] = (shortCnt[fold(x.short)] === 1 && nm === x.name) ? x.short : nm;
      m.byName[fold(nm)] = x.r; if (shortCnt[fold(x.short)] === 1) m.byName[fold(x.short)] = x.r;
      if (x.symOk) { m.bySym[x.sym] = x.r; m.symOf[x.r] = x.sym; }
    });
    return m;
  };
  W.refName = function (nm, r) { return nm.symOf[r] ? nm.symOf[r] : '[' + (nm.nameOf[r] || ('linha ' + r)) + ']'; };

  // ------------------------------------------------------------------ AST -> texto de edição (em nomes)
  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  function numT(v) {
    if (v === Math.PI) return 'π';
    var s = String(parseFloat(Number(v).toPrecision(12)));
    return s.replace('.', ',');
  }
  var PREC = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
  var FNPT = { IF: 'SE', IFERROR: 'SEERRO', AND: 'E', OR: 'OU', NOT: 'NÃO', SQRT: 'RAIZ', SUM: 'SOMA', MIN: 'MÍN', MAX: 'MÁX', ROUND: 'ARRED', CEILING: 'TETO', FLOOR: 'ASSOALHO', POWER: 'POTÊNCIA', SIN: 'SEN', ASIN: 'ASEN', RADIANS: 'RADIANOS', DEGREES: 'GRAUS', INDEX: 'ÍNDICE', MATCH: 'CORRESP', COUNTIF: 'CONT.SE', COUNT: 'CONT.NÚM', AVERAGE: 'MÉDIA', CHOOSE: 'ESCOLHER', MOD: 'RESTO' };
  function addrOf(n) {
    var a = '$' + Engine.numToCol(n.c1) + '$' + n.r1; if (!n.single) a += ':$' + Engine.numToCol(n.c2) + '$' + n.r2; return a;
  }
  function shortSheet(sh) { return String(sh).replace(/^\d+(\.\d+)*\s+/, ''); }
  function colRange(n) { return Engine.numToCol(n.c1) + n.r1 + (n.single ? '' : ':' + Engine.numToCol(n.c2) + n.r2); }
  // ctx: {nm, sheet, selfRows}
  W.toEdit = function (n, ctx, up) {
    up = up || 0;
    function wrap(p, t) { return p < up ? '(' + t + ')' : t; }
    switch (n.k) {
      case 'num': return n.v < 0 ? '(' + numT(n.v) + ')' : numT(n.v);
      case 'str': return '"' + n.v.replace(/"/g, '""') + '"';
      case 'bool': return n.v ? 'VERDADEIRO' : 'FALSO';
      case 'ref':
        if (n.single && (!n.sh || n.sh === ctx.sheet) && n.c1 === 3) return W.refName(ctx.nm, n.r1);
        return (n.sh && n.sh !== ctx.sheet ? "'" + n.sh.replace(/'/g, "''") + "'!" : '') + colRange(n);
      case 'neg': return wrap(6, '-' + W.toEdit(n.a, ctx, 6));
      case 'bin':
        var p = PREC[n.o], a = W.toEdit(n.a, ctx, p), b = W.toEdit(n.b, ctx, p + (n.o === '^' ? 1 : 1));
        if (n.o === '*') return wrap(p, a + '·' + b);
        if (n.o === '/' || n.o === '^') return wrap(p, a + n.o + b);
        return wrap(p, a + ' ' + n.o + ' ' + b);
      case 'fn':
        if (n.n === 'PI' && !n.a.length) return 'π';
        if (n.n === 'SQRT' && n.a.length === 1) return '√(' + W.toEdit(n.a[0], ctx, 0) + ')';
        return (FNPT[n.n] || n.n) + '(' + n.a.map(function (x) { return W.toEdit(x, ctx, 0); }).join('; ') + ')';
    }
    return '?';
  };

  // ------------------------------------------------------------------ AST -> notação matemática (HTML)
  var SUBRE = /^([A-Za-zα-ωΑ-Ω])([a-z]{1,4})$/;
  function symH(s) { var p = String(s).split('_'), main = p.shift(), rest = p.join(','), m = SUBRE.exec(main) || (/^([A-Za-zα-ωΑ-Ω])(max|min|adm|vm|nec)$/.exec(main)), sub = (m ? m[2] : '') + (rest ? (m ? ',' : '') + rest : ''); return (m ? esc(m[1]) : esc(main)) + (sub ? '<sub>' + esc(sub) + '</sub>' : ''); }
  W.symH = symH;
  function numH(v) {
    if (v === Math.PI) return 'π';
    var s = String(parseFloat(Number(v).toPrecision(8)));
    var m = /^(-?[\d.]+)e([+-]?\d+)$/.exec(s); if (m) return m[1].replace('.', ',') + '·10<sup>' + (+m[2]) + '</sup>';
    return s.replace('.', ',');
  }
  var OPH = { '=': '=', '<>': '≠', '<': '&lt;', '>': '&gt;', '<=': '≤', '>=': '≥' };
  var FNH = { MIN: 'mín', MAX: 'máx', ROUND: 'arred', SUM: 'soma', COUNT: 'cont', AVERAGE: 'média', CEILING: 'teto', FLOOR: 'piso', SIN: 'sen', COS: 'cos', TAN: 'tan', ASIN: 'asen', ACOS: 'acos', ATAN: 'atan', LN: 'ln', LOG10: 'log', EXP: 'exp', LOWER: 'minúsc', UPPER: 'maiúsc', LEN: 'comp', MOD: 'resto', INT: 'int', CHOOSE: 'escolher', IFERROR: 'seerro', ATAN2: 'atan2', RADIANS: 'rad', DEGREES: 'graus', COUNTIF: 'cont.se', ISNUMBER: 'énum', ISERROR: 'éerro' };
  // ctx: {nm, sheet, val(r) -> string|null (modo "com números")}
  W.toHtml = function (n, ctx, up) {
    up = up || 0;
    function wrap(p, t) { return p < up ? '<span class="mp">(</span>' + t + '<span class="mp">)</span>' : t; }
    function sub(x, u) { return W.toHtml(x, ctx, u); }
    switch (n.k) {
      case 'num': return n.v < 0 ? '<span class="mp">(</span>' + numH(n.v) + '<span class="mp">)</span>' : numH(n.v);
      case 'str': return '<span class="mstr">“' + esc(n.v) + '”</span>';
      case 'bool': return n.v ? 'verdadeiro' : 'falso';
      case 'ref':
        if (n.single && (!n.sh || n.sh === ctx.sheet) && n.c1 === 3) {
          var rr = n.r1;
          if (ctx.val) { var v = ctx.val(rr); if (v != null) { var nv = '<span class="mnum" title="' + esc(ctx.nm.nameOf[rr] || '') + '">' + esc(v) + '</span>'; return v.charAt(0) === '-' ? '<span class="mp">(</span>' + nv + '<span class="mp">)</span>' : nv; } }
          var sy = ctx.nm.symOf[rr];
          return sy ? '<span class="msym" title="' + esc(ctx.nm.nameOf[rr] || '') + '">' + symH(sy) + '</span>' : '<span class="mnm">' + esc(ctx.nm.nameOf[rr] || ('linha ' + rr)) + '</span>';
        }
        return '<span class="mtab">' + esc(shortSheet(n.sh || ctx.sheet)) + '<small> col. ' + esc(Engine.numToCol(n.c1)) + (n.single ? '' : '' ) + '</small></span>';
      case 'neg': return wrap(6, '−' + sub(n.a, 6));
      case 'bin':
        var p = PREC[n.o];
        if (n.o === '/') return wrap(4, '<span class="mfr"><span class="mfn">' + sub(n.a, 0) + '</span><span class="mfd">' + sub(n.b, 0) + '</span></span>');
        if (n.o === '^') return wrap(5, sub(n.a, 6) + '<sup>' + sub(n.b, 0) + '</sup>');
        if (n.o === '*') return wrap(4, sub(n.a, 4) + '<span class="mop">·</span>' + sub(n.b, 5));
        if (n.o === '+' || n.o === '-') return wrap(3, sub(n.a, 3) + '<span class="mop">' + (n.o === '-' ? '−' : '+') + '</span>' + sub(n.b, 4));
        if (n.o === '&') return wrap(2, sub(n.a, 2) + '<span class="mop">&amp;</span>' + sub(n.b, 3));
        return wrap(1, sub(n.a, 2) + '<span class="mop">' + OPH[n.o] + '</span>' + sub(n.b, 2));
      case 'fn':
        if (n.n === 'PI' && !n.a.length) return 'π';
        if (n.n === 'SQRT' && n.a.length === 1) return '<span class="msq"><span class="mrt">√</span><span class="mrd">' + sub(n.a[0], 0) + '</span></span>';
        if (n.n === 'ABS' && n.a.length === 1) return '<span class="mp">|</span>' + sub(n.a[0], 0) + '<span class="mp">|</span>';
        if (n.n === 'POWER' && n.a.length === 2) return sub(n.a[0], 6) + '<sup>' + sub(n.a[1], 0) + '</sup>';
        if (n.n === 'IF') return wrap(1, '<span class="mkw">se</span> ' + sub(n.a[0], 0) + ' <span class="mkw">então</span> ' + sub(n.a[1], 1) + (n.a.length > 2 ? ' <span class="mkw">senão</span> ' + sub(n.a[2], 1) : ''));
        if (n.n === 'AND' || n.n === 'OR') return wrap(1, n.a.map(function (x) { return sub(x, 2); }).join(' <span class="mkw">' + (n.n === 'AND' ? 'e' : 'ou') + '</span> '));
        if (n.n === 'NOT') return '<span class="mkw">não</span> ' + sub(n.a[0], 6);
        if (n.n === 'INDEX' && n.a.length === 2 && n.a[0].k === 'ref' && n.a[1].k === 'fn' && n.a[1].n === 'MATCH') {
          var m = n.a[1];
          return '<span class="mtab">' + esc(shortSheet(n.a[0].sh || ctx.sheet)) + '<small> col. ' + esc(Engine.numToCol(n.a[0].c1)) + '</small></span><span class="mp">[</span><span class="mkw">linha de</span> ' + sub(m.a[0], 0) + '<span class="mp">]</span>';
        }
        return '<span class="mfname">' + esc(FNH[n.n] || n.n.toLowerCase()) + '</span><span class="mp">(</span>' + n.a.map(function (x) { return sub(x, 0); }).join('<span class="mp">; </span>') + '<span class="mp">)</span>';
    }
    return '?';
  };

  // ------------------------------------------------------------------ AST -> texto do motor (Excel)
  W.serialize = function (n, up) {
    up = up || 0;
    function wrap(p, t) { return p < up ? '(' + t + ')' : t; }
    switch (n.k) {
      case 'num': return n.v < 0 ? '(' + String(n.v) + ')' : String(n.v);
      case 'str': return '"' + n.v.replace(/"/g, '""') + '"';
      case 'bool': return n.v ? 'TRUE' : 'FALSE';
      case 'ref': return (n.sh ? "'" + n.sh.replace(/'/g, "''") + "'!" : '') + addrOf(n);
      case 'neg': return wrap(6, '-' + W.serialize(n.a, 6));
      case 'bin': var p = PREC[n.o]; return wrap(p, W.serialize(n.a, p) + n.o + W.serialize(n.b, p + 1));
      case 'fn': return n.n + '(' + n.a.map(function (x) { return W.serialize(x, 0); }).join(',') + ')';
    }
    return '0';
  };
  W.ast = function (raw) { var v = Engine.validate(raw); return v.ok ? v.ast : null; };

  // ------------------------------------------------------------------ texto digitado (nomes) -> fórmula do motor
  var IDRE = /^[A-Za-zÀ-ÖØ-öø-ÿα-ωΑ-Ω_][A-Za-zÀ-ÖØ-öø-ÿα-ωΑ-Ω0-9_₀-₉′]*/;
  var SUPD = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
  // nm: modelo de nomes. Devolve { ok, raw:'=...' } ou { ok:false, error }
  var SINGLEFN = { SQRT: 1, RAIZ: 1, ABS: 1, LOG10: 1, LN: 1, EXP: 1, SIN: 1, COS: 1, TAN: 1, SEN: 1, ASIN: 1, ACOS: 1, ATAN: 1, ASEN: 1, RADIANS: 1, RADIANOS: 1, DEGREES: 1, GRAUS: 1, INT: 1, LOWER: 1, UPPER: 1, LEN: 1, NOT: 1, 'NÃO': 1, NAO: 1, PI: 1 };
  W.fromEdit = function (text, nm, opts) {
    opts = opts || {};
    var s = String(text == null ? '' : text).trim();
    if (s.charAt(0) === '=') s = s.slice(1);
    if (!s.trim()) return { ok: false, error: 'Digite a fórmula.' };
    var hasSemi = s.indexOf(';') >= 0, out = '', i = 0, stack = [], m;
    function sugg(q) {
      var f = fold(q), best = [];
      nm.rows.forEach(function (x) { if (fold(x.uname).indexOf(f) >= 0 || (x.sym && fold(x.sym).indexOf(f) === 0)) best.push(x); });
      return best.slice(0, 4).map(function (x) { return x.symOk ? x.sym + ' (' + x.name + ')' : '[' + x.uname + ']'; }).join('; ');
    }
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === '[') {
        var j = s.indexOf(']', i); if (j < 0) return { ok: false, error: 'Falta fechar o colchete ] do nome.' };
        var nmx = s.slice(i + 1, j).trim(), key = fold(nmx), r = nm.byName[key];
        if (r == null && nm.bySym[nmx] != null) r = nm.bySym[nmx];
        if (r == null) { var sg = sugg(nmx); return { ok: false, error: 'Variável não encontrada: [' + nmx + '].' + (sg ? ' Parecidas: ' + sg + '.' : ' Digite [ para ver a lista.') }; }
        out += '$C$' + r; i = j + 1; continue;
      }
      if (c === '"') { var k = i + 1; while (k < s.length) { if (s.charAt(k) === '"') { if (s.charAt(k + 1) === '"') { k += 2; continue; } break; } k++; } if (k >= s.length) return { ok: false, error: 'Texto entre aspas sem fechar (falta ").' }; out += s.slice(i, k + 1); i = k + 1; continue; }
      if (c === "'") { var q2 = s.indexOf("'", i + 1); var ex = /^'[^']+'![$A-Za-z0-9:]+/.exec(s.slice(i)); if (ex) { out += ex[0]; i += ex[0].length; continue; } return { ok: false, error: "Aspa simples sem fechar." }; }
      if (/\d/.test(c) || (c === '.' && /\d/.test(s.charAt(i + 1)))) {
        m = /^(\d+(?:[.,]\d+)?|[.,]\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i)); var tok = m[0];
        if (tok.indexOf(',') >= 0) { var inFn = stack.length && stack[stack.length - 1] === 'f'; if (inFn && !hasSemi) { tok = tok.slice(0, tok.indexOf(',')); } else tok = tok.replace(',', '.'); }
        out += tok; i += tok.length; if (tok.length < m[0].length && !(inFn && !hasSemi)) { } continue;
      }
      if (/[A-Za-zÀ-ÖØ-öø-ÿα-ωΑ-Ω_$]/.test(c)) {
        // referência crua? $C$12, C12, 'Aba'!C1
        var rawRef = /^\$?[A-Za-z]{1,2}\$?\d+(?::\$?[A-Za-z]{1,2}\$?\d+)?(?![A-Za-zÀ-ÖØ-öø-ÿ0-9_(])/.exec(s.slice(i));
        var idm = IDRE.exec(s.slice(i));
        var sheetRef = idm && s.charAt(i + idm[0].length) === '!' ? /^[A-Za-zÀ-ÖØ-öø-ÿ_][\w.À-ÖØ-öø-ÿ]*![$A-Za-z0-9:]+/.exec(s.slice(i)) : null;
        if (sheetRef) { out += sheetRef[0]; i += sheetRef[0].length; continue; }
        if (!idm) { out += c; i++; continue; }
        var id = idm[0]; var dm = /^(\.[A-Za-zÀ-ÖØ-öø-ÿ]+)+(?=\()/.exec(s.slice(i + id.length)); if (dm) id += dm[0];
        var after = s.charAt(i + id.length);
        if (after === '(') { stack.push(SINGLEFN[id.toUpperCase()] ? 'g' : 'f'); out += id + '('; i += id.length + 1; continue; }
        var up = id.toUpperCase();
        if (id === 'π' || up === 'PI') { out += 'PI()'; i += id.length; continue; }
        if (up === 'VERDADEIRO' || up === 'TRUE') { out += 'TRUE'; i += id.length; continue; }
        if (up === 'FALSO' || up === 'FALSE') { out += 'FALSE'; i += id.length; continue; }
        var rr = nm.bySym[id];
        if (rr == null) rr = nm.byName[fold(id)];
        if (rr != null) { out += '$C$' + rr; i += id.length; continue; }
        if (rawRef && !opts.noRaw) { out += rawRef[0]; i += rawRef[0].length; continue; }
        var sg2 = sugg(id); return { ok: false, error: 'Variável desconhecida: ' + id + '.' + (sg2 ? ' Parecidas: ' + sg2 + '.' : ' Digite [ ou uma letra para ver a lista.') };
      }
      if (c === '(') { stack.push('g'); out += c; i++; continue; }
      if (c === ')') { stack.pop(); out += c; i++; continue; }
      if (c === '·' || c === '×' || c === '∙' || c === '⋅') { out += '*'; i++; continue; }
      if (c === '÷') { out += '/'; i++; continue; }
      if (c === '−' || c === '–') { out += '-'; i++; continue; }
      if (c === '≥') { out += '>='; i++; continue; }
      if (c === '≤') { out += '<='; i++; continue; }
      if (c === '≠') { out += '<>'; i++; continue; }
      if (c === '√') { out += 'SQRT'; i++; if (s.charAt(i) !== '(') { var mm2 = /^[\w$.\[\]À-ÖØ-öø-ÿα-ωΑ-Ω]+/.exec(s.slice(i)); if (mm2) { /* √x: trata como SQRT(x) */ var sub1 = W.fromEdit(mm2[0], nm, opts); if (!sub1.ok) return sub1; out += '(' + sub1.raw.slice(1) + ')'; i += mm2[0].length; } } else { stack.push('g'); out += '('; i++; } continue; }
      if (SUPD[c] !== undefined) { var sp = ''; while (i < s.length && SUPD[s.charAt(i)] !== undefined) { sp += SUPD[s.charAt(i)]; i++; } out += '^' + sp; continue; }
      out += c; i++;
    }
    var raw = '=' + out, v = Engine.validate(raw);
    if (!v.ok) return { ok: false, error: v.error };
    return { ok: true, raw: raw, ast: v.ast };
  };

  // ------------------------------------------------------------------ dependências
  // refs de coluna C da mesma aba usadas por uma fórmula
  W.depsOfRaw = function (raw, sheet) {
    var set = {}; if (typeof raw !== 'string' || raw.charAt(0) !== '=') return [];
    var a = W.ast(raw); if (!a) return [];
    Engine.refsOf(a).forEach(function (r) { if (!r.sh || r.sh === sheet) for (var rr = r.r1; rr <= r.r2; rr++) for (var cc = r.c1; cc <= r.c2; cc++) if (cc === 3) set[rr] = 1; });
    return Object.keys(set).map(Number);
  };
  // graph: {r: {deps:[], users:[]}} para as linhas informadas
  W.graph = function (rowNums, getRaw, sheet) {
    var g = {}; rowNums.forEach(function (r) { g[r] = { deps: [], users: [] }; });
    rowNums.forEach(function (r) { W.depsOfRaw(getRaw(r), sheet).forEach(function (d) { if (g[d] && d !== r) { g[r].deps.push(d); g[d].users.push(r); } }); });
    return g;
  };
  W.closure = function (g, r, dir) {
    var seen = {}, st = [r], out = [];
    while (st.length) { var x = st.pop(); (g[x] ? g[x][dir] : []).forEach(function (y) { if (!seen[y]) { seen[y] = 1; out.push(y); st.push(y); } }); }
    return out;
  };
  // ordem de cálculo dentro de um bloco (estável): dependências primeiro
  W.order = function (rowNums, g) {
    var inSet = {}, done = {}, out = []; rowNums.forEach(function (r) { inSet[r] = 1; });
    function visit(r, depth) { if (done[r] || depth > 80) return; done[r] = 1; (g[r] ? g[r].deps : []).forEach(function (d) { if (inSet[d]) visit(d, depth + 1); }); out.push(r); }
    rowNums.forEach(function (r) { visit(r, 0); });
    return out;
  };

  // ------------------------------------------------------------------ casos (CHOOSE / SE)
  // devolve { kind:'choose'|'if', idx: refNode|null, cases:[{i, ast, name}] } ou null
  W.cases = function (raw, ctx) {
    var a = W.ast(raw); if (!a || a.k !== 'fn') return null;
    if (a.n === 'CHOOSE' && a.a.length >= 3) {
      var names = ctx.caseNames ? ctx.caseNames(a.a[0]) : null, cs = [];
      for (var i = 1; i < a.a.length; i++) cs.push({ i: i, ast: a.a[i], name: (names && names[i - 1]) || ('Caso ' + i) });
      return { kind: 'choose', ast: a, head: a.a[0], cases: cs };
    }
    if (a.n === 'IF' && a.a.length >= 2) {
      var cs2 = [{ i: 0, ast: a.a[0], name: 'Condição' }, { i: 1, ast: a.a[1], name: 'Se for verdadeira' }];
      if (a.a.length > 2) cs2.push({ i: 2, ast: a.a[2], name: 'Se for falsa' });
      return { kind: 'if', ast: a, head: null, cases: cs2 };
    }
    return null;
  };
  // troca o argumento i de CHOOSE/IF (i = índice no array de args) e devolve o novo raw
  W.withCase = function (raw, kind, i, exprRaw) {
    var a = W.ast(raw), e = W.ast(exprRaw); if (!a || !e) return null;
    var args = a.a.slice(); args[i] = e;
    return '=' + W.serialize({ k: 'fn', n: a.n, a: args });
  };
  W.caseExprRaw = function (raw, i) { var a = W.ast(raw); return a && a.a[i] ? '=' + W.serialize(a.a[i]) : null; };

  // células C usadas por fórmulas mas que não são linhas da tela (cálculos auxiliares)
  W.auxRows = function (cells, rowSet, sheet) {
    var set = {};
    Object.keys(cells).forEach(function (a) { if (a.charAt(0) !== 'C') return; var v = cells[a]; if (typeof v !== 'string' || v.charAt(0) !== '=') return;
      W.depsOfRaw(v, sheet).forEach(function (d) { if (!rowSet[d] && ('C' + d) in cells) set[d] = 1; }); });
    return Object.keys(set).map(Number).sort(function (x, y) { return x - y; });
  };
  // rótulo estável para linhas cujo rótulo muda com o tipo (ex.: "(não usado)"): primeira alternativa útil do CHOOSE do rótulo
  W.labelFallback = function (ast) {
    if (!ast || ast.k !== 'fn' || ast.n !== 'CHOOSE') return null;
    for (var i = 1; i < ast.a.length; i++) { var x = ast.a[i]; if (x.k === 'str' && !/^\(não usado\)$/i.test(x.v)) return x.v; }
    return null;
  };
  // símbolos ajustados à mão (por calculadora): linha -> símbolo (null = sem símbolo, usa o nome)
  W.SYMS = {
    '3.3': { 16: 'FS', 20: 'caso', 24: 'a', 25: 'N', 30: 'tipo', 36: 'Ix', 40: 'Wx', 43: 'k', 44: null, 47: 'qp', 48: 'wef', 50: 'Mmax', 51: 'M', 52: 'Vmax', 54: 'σ', 55: 'τmax', 56: 'σvm', 57: 'FSf', 58: 'FSvm', 60: 'δadm', 62: 'Wx_nec', 63: 'Ix_nec', 66: 'σadm', 67: 'Ures', 68: 'Uflecha', 70: 'Ix_cm4', 71: 'Wx_cm3', 74: null, 75: null, 76: null, 77: null, 78: null, 79: 'Ix_nec_cm4', 80: 'Wx_nec_cm3', 72: null }
  };
  W.esc = esc; W.fold = fold;
  if (typeof module !== 'undefined' && module.exports) module.exports = W; else root.WenFx = W;
})(typeof window !== 'undefined' ? window : globalThis);
