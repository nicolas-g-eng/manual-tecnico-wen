/* Motor de fórmulas (subconjunto do Excel) — sem dependências.
 * Suporta as funções usadas nas calculadoras do Manual Técnico Wen Technology. */
(function (root) {
  'use strict';

  var E = function (c) { return { e: c }; };
  var isErr = function (v) { return v !== null && typeof v === 'object' && v.e !== undefined; };
  var isRange = function (v) { return v !== null && typeof v === 'object' && v.rg === true; };

  // ------------------------------------------------------------ utilidades
  function colToNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  function numToCol(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function parseAddr(a) { var m = /^\$?([A-Z]+)\$?(\d+)$/.exec(a); return { c: colToNum(m[1]), r: +m[2] }; }

  // ------------------------------------------------------------ tokenizer
  var TOK = /\s*(?:("(?:[^"]|"")*")|((?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|('(?:[^']|'')+'!|[A-Za-zÀ-ÿ_][\w.À-ÿ]*!)|(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)(?![\w(])|([A-Za-z_][\w.]*)(\()|([A-Za-z_][\w.]*)|(<=|>=|<>|[-+*\/^&=<>%(),]))/y;

  function tokenize(src) {
    var out = [], m; TOK.lastIndex = 0;
    var s = src, pos = 0;
    while (pos < s.length) {
      TOK.lastIndex = pos;
      m = TOK.exec(s);
      if (!m) { if (/^\s*$/.test(s.slice(pos))) break; throw new Error('token@' + pos + ' em ' + src); }
      pos = TOK.lastIndex;
      if (m[1] !== undefined) out.push({ t: 's', v: m[1].slice(1, -1).replace(/""/g, '"') });
      else if (m[2] !== undefined) out.push({ t: 'n', v: parseFloat(m[2]) });
      else if (m[3] !== undefined) { var nm = m[3].slice(0, -1); if (nm[0] === "'") nm = nm.slice(1, -1).replace(/''/g, "'"); out.push({ t: 'sh', v: nm }); }
      else if (m[4] !== undefined) out.push({ t: 'ref', v: m[4] });
      else if (m[5] !== undefined) out.push({ t: 'fn', v: m[5].toUpperCase() }), out.push({ t: '(' });
      else if (m[7] !== undefined) {
        var u = m[7].toUpperCase();
        if (u === 'TRUE') out.push({ t: 'b', v: true }); else if (u === 'FALSE') out.push({ t: 'b', v: false });
        else out.push({ t: 'name', v: m[7] });
      } else out.push({ t: m[8] });
    }
    return out;
  }

  // ------------------------------------------------------------ parser
  function parse(src) {
    var tk = tokenize(src), i = 0;
    function peek() { return tk[i]; }
    function next() { return tk[i++]; }
    function accept(t) { if (tk[i] && tk[i].t === t) { i++; return true; } return false; }
    function expr() { return cmp(); }
    function cmp() {
      var l = cat();
      for (;;) { var p = peek(); if (p && ['=', '<>', '<', '>', '<=', '>='].indexOf(p.t) >= 0) { next(); l = { k: 'bin', o: p.t, a: l, b: cat() }; } else return l; }
    }
    function cat() { var l = add(); while (peek() && peek().t === '&') { next(); l = { k: 'bin', o: '&', a: l, b: add() }; } return l; }
    function add() {
      var l = mul();
      for (;;) { var p = peek(); if (p && (p.t === '+' || p.t === '-')) { next(); l = { k: 'bin', o: p.t, a: l, b: mul() }; } else return l; }
    }
    function mul() {
      var l = pow();
      for (;;) { var p = peek(); if (p && (p.t === '*' || p.t === '/')) { next(); l = { k: 'bin', o: p.t, a: l, b: pow() }; } else return l; }
    }
    function pow() { var l = unary(); while (peek() && peek().t === '^') { next(); l = { k: 'bin', o: '^', a: l, b: unary() }; } return l; }
    function unary() {
      var p = peek();
      if (p && p.t === '-') { next(); return { k: 'neg', a: unary() }; }
      if (p && p.t === '+') { next(); return unary(); }
      return post();
    }
    function post() { var l = prim(); while (peek() && peek().t === '%') { next(); l = { k: 'bin', o: '/', a: l, b: { k: 'num', v: 100 } }; } return l; }
    function prim() {
      var p = next();
      if (!p) throw new Error('fim inesperado em ' + src);
      if (p.t === 'n') return { k: 'num', v: p.v };
      if (p.t === 's') return { k: 'str', v: p.v };
      if (p.t === 'b') return { k: 'bool', v: p.v };
      if (p.t === '(') { var e = expr(); if (!accept(')')) throw new Error('falta ) em ' + src); return e; }
      if (p.t === 'fn') {
        next(); // '('
        var args = [];
        if (!accept(')')) { for (;;) { args.push(expr()); if (accept(')')) break; if (!accept(',')) throw new Error('esperava , em ' + src); } }
        return { k: 'fn', n: p.v, a: args };
      }
      var sheet = null;
      if (p.t === 'sh') { sheet = p.v; p = next(); }
      if (p && p.t === 'ref') {
        var parts = p.v.replace(/\$/g, '').split(':');
        var a = parseAddr(parts[0]), b = parts[1] ? parseAddr(parts[1]) : a;
        return { k: 'ref', sh: sheet, c1: Math.min(a.c, b.c), r1: Math.min(a.r, b.r), c2: Math.max(a.c, b.c), r2: Math.max(a.r, b.r), single: !parts[1] };
      }
      throw new Error('símbolo inesperado ' + (p && p.t) + ' em ' + src);
    }
    var ast = expr();
    if (i < tk.length) throw new Error('sobra de tokens em ' + src);
    return ast;
  }

  // ------------------------------------------------------------ motor
  function Engine(sheets, opts) {
    this.sheets = sheets;           // { nome: { 'A1': valor | '=fórmula' } }
    this.over = {};                  // overrides: { 'nome!A1': valor }
    this.cache = {};
    this.asts = {};
    this.stack = {};
    this.opts = opts || {};
  }
  var P = Engine.prototype;

  P.setOpts = function (o) { for (var k in o) this.opts[k] = o[k]; this.cache = {}; };
  P.setInput = function (sheet, addr, v) {
    var k = sheet + '!' + addr;
    if (v === undefined || v === null) delete this.over[k]; else this.over[k] = v;
    this.cache = {};
  };
  P.hasOverride = function (sheet, addr) { return (sheet + '!' + addr) in this.over; };
  P.clearSheet = function (sheet) {
    var pre = sheet + '!';
    for (var k in this.over) if (k.indexOf(pre) === 0) delete this.over[k];
    this.cache = {};
  };
  P.raw = function (sheet, addr) {
    var s = this.sheets[sheet]; return s ? s[addr] : undefined;
  };

  P.cell = function (sheet, addr) {
    var key = sheet + '!' + addr;
    if (key in this.cache) return this.cache[key];
    if (key in this.over) return (this.cache[key] = this.over[key]);
    var raw = this.raw(sheet, addr);
    var val;
    if (raw === undefined || raw === null) val = null;
    else if (typeof raw === 'string' && raw.charAt(0) === '=') {
      if (this.stack[key]) return E('#REF!');
      this.stack[key] = true;
      try {
        var ast = this.asts[raw] || (this.asts[raw] = parse(raw.slice(1)));
        val = this.ev(ast, sheet);
        if (isRange(val)) val = this.rangeFirst(val);
      } catch (ex) { val = E('#NAME?'); if (typeof console !== 'undefined' && this.opts.debug) console.warn(key, ex.message); }
      delete this.stack[key];
    } else val = raw;
    this.cache[key] = val;
    return val;
  };
  P.rangeFirst = function (r) { return this.cell(r.sh, numToCol(r.c1) + r.r1); };

  P.flat = function (r) {
    var out = [];
    for (var rr = r.r1; rr <= r.r2; rr++) for (var cc = r.c1; cc <= r.c2; cc++) out.push(this.cell(r.sh, numToCol(cc) + rr));
    return out;
  };

  // ------------------------------------------------------------ conversões
  function toNum(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') { var t = v.trim().replace(',', '.'); if (t !== '' && !isNaN(Number(t))) return Number(t); return E('#VALUE!'); }
    return E('#VALUE!');
  }
  P.toText = function (v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') {
      var s = String(parseFloat(v.toPrecision(15)));
      if (s.indexOf('e') >= 0) s = v.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
      return this.opts.comma ? s.replace('.', ',') : s;
    }
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  };
  function toBool(v) {
    if (isErr(v)) return v;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (v === null || v === undefined || v === '') return false;
    if (typeof v === 'string') { var u = v.toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; }
    return E('#VALUE!');
  }
  function cmpVals(a, b) {
    function rank(x) { return typeof x === 'number' ? 0 : typeof x === 'string' ? 1 : 2; }
    if (a === null || a === undefined) a = (typeof b === 'string') ? '' : (typeof b === 'boolean' ? false : 0);
    if (b === null || b === undefined) b = (typeof a === 'string') ? '' : (typeof a === 'boolean' ? false : 0);
    var ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (ra === 1) { a = a.toLowerCase(); b = b.toLowerCase(); }
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // ------------------------------------------------------------ avaliação
  P.ev = function (n, sh) {
    switch (n.k) {
      case 'num': case 'str': case 'bool': return n.v;
      case 'ref':
        var r = { rg: true, sh: n.sh || sh, c1: n.c1, r1: n.r1, c2: n.c2, r2: n.r2 };
        if (n.single) return this.cell(r.sh, numToCol(r.c1) + r.r1);
        return r;
      case 'neg': { var a = this.ev(n.a, sh); if (isRange(a)) a = this.rangeFirst(a); a = toNum(a); return isErr(a) ? a : -a; }
      case 'bin': return this.bin(n, sh);
      case 'fn': return this.fn(n, sh);
    }
    return E('#VALUE!');
  };
  P.scalar = function (n, sh) { var v = this.ev(n, sh); return isRange(v) ? this.rangeFirst(v) : v; };

  P.bin = function (n, sh) {
    var a = this.scalar(n.a, sh), b = this.scalar(n.b, sh);
    if (isErr(a)) return a; if (isErr(b)) return b;
    var o = n.o;
    if (o === '&') return this.toText(a) + this.toText(b);
    if (o === '=' || o === '<>' || o === '<' || o === '>' || o === '<=' || o === '>=') {
      var c = cmpVals(a, b);
      return o === '=' ? c === 0 : o === '<>' ? c !== 0 : o === '<' ? c < 0 : o === '>' ? c > 0 : o === '<=' ? c <= 0 : c >= 0;
    }
    var x = toNum(a), y = toNum(b);
    if (isErr(x)) return x; if (isErr(y)) return y;
    switch (o) {
      case '+': return x + y;
      case '-': return x - y;
      case '*': return x * y;
      case '/': return y === 0 ? E('#DIV/0!') : x / y;
      case '^': { if (x === 0 && y === 0) return E('#NUM!'); var p = Math.pow(x, y); return (isNaN(p) || !isFinite(p)) ? E('#NUM!') : p; }
    }
    return E('#VALUE!');
  };

  function numArgs(eng, args, sh, direct) {
    // coleta números de argumentos (intervalos ignoram texto/vazio)
    var out = [];
    for (var i = 0; i < args.length; i++) {
      var v = eng.ev(args[i], sh);
      if (isRange(v)) {
        var vals = eng.flat(v);
        for (var j = 0; j < vals.length; j++) { var x = vals[j]; if (isErr(x)) return x; if (typeof x === 'number') out.push(x); }
      } else {
        if (isErr(v)) return v;
        var nn = toNum(v); if (isErr(nn)) return nn; out.push(nn);
      }
    }
    return out;
  }
  function boolArgs(eng, args, sh) {
    var out = [];
    for (var i = 0; i < args.length; i++) {
      var v = eng.ev(args[i], sh);
      if (isRange(v)) { var vals = eng.flat(v); for (var j = 0; j < vals.length; j++) { var x = vals[j]; if (isErr(x)) return x; if (typeof x === 'boolean' || typeof x === 'number') out.push(toBool(x)); } }
      else { var b = toBool(v); if (isErr(b)) return b; out.push(b); }
    }
    return out;
  }
  function round(x, d) {
    var p = Math.pow(10, d), s = x < 0 ? -1 : 1;
    return s * Math.round(Math.abs(x) * p + 1e-9) / p;
  }

  P.fn = function (n, sh) {
    var N = n.n, A = n.a, self = this, x, y, v;
    function one(i) { var q = self.scalar(A[i], sh); return q; }
    function num(i) { var q = one(i); return toNum(q); }
    function math1(f, dom) {
      x = num(0); if (isErr(x)) return x;
      if (dom && !dom(x)) return E('#NUM!');
      return f(x);
    }
    switch (N) {
      case 'IF': {
        var c = toBool(one(0)); if (isErr(c)) return c;
        if (c) return A.length > 1 ? this.scalar(A[1], sh) : true;
        return A.length > 2 ? this.scalar(A[2], sh) : false;
      }
      case 'IFERROR': { v = one(0); return isErr(v) ? one(1) : v; }
      case 'AND': { var ba = boolArgs(this, A, sh); if (isErr(ba)) return ba; return ba.every(Boolean); }
      case 'OR': { var bo = boolArgs(this, A, sh); if (isErr(bo)) return bo; return bo.some(Boolean); }
      case 'NOT': { var nb = toBool(one(0)); return isErr(nb) ? nb : !nb; }
      case 'MIN': { var m1 = numArgs(this, A, sh); if (isErr(m1)) return m1; return m1.length ? Math.min.apply(null, m1) : 0; }
      case 'MAX': { var m2 = numArgs(this, A, sh); if (isErr(m2)) return m2; return m2.length ? Math.max.apply(null, m2) : 0; }
      case 'SUM': { var s1 = numArgs(this, A, sh); if (isErr(s1)) return s1; return s1.reduce(function (a, b) { return a + b; }, 0); }
      case 'ABS': return math1(Math.abs);
      case 'SQRT': return math1(Math.sqrt, function (t) { return t >= 0; });
      case 'PI': return Math.PI;
      case 'RADIANS': return math1(function (t) { return t * Math.PI / 180; });
      case 'DEGREES': return math1(function (t) { return t * 180 / Math.PI; });
      case 'SIN': return math1(Math.sin);
      case 'COS': return math1(Math.cos);
      case 'TAN': return math1(Math.tan);
      case 'ASIN': return math1(Math.asin, function (t) { return t >= -1 && t <= 1; });
      case 'ACOS': return math1(Math.acos, function (t) { return t >= -1 && t <= 1; });
      case 'ATAN': return math1(Math.atan);
      case 'LOG10': return math1(Math.log10, function (t) { return t > 0; });
      case 'LN': return math1(Math.log, function (t) { return t > 0; });
      case 'EXP': return math1(Math.exp);
      case 'ATAN2': { x = num(0); y = num(1); if (isErr(x)) return x; if (isErr(y)) return y; if (x === 0 && y === 0) return E('#DIV/0!'); return Math.atan2(y, x); }
      case 'ROUND': { x = num(0); y = A.length > 1 ? num(1) : 0; if (isErr(x)) return x; if (isErr(y)) return y; return round(x, y); }
      case 'CEILING': { x = num(0); y = A.length > 1 ? num(1) : 1; if (isErr(x)) return x; if (isErr(y)) return y; if (y === 0) return 0; return Math.ceil(x / y - 1e-12) * y; }
      case 'FLOOR': { x = num(0); y = A.length > 1 ? num(1) : 1; if (isErr(x)) return x; if (isErr(y)) return y; if (y === 0) return E('#DIV/0!'); return Math.floor(x / y + 1e-12) * y; }
      case 'POWER': { x = num(0); y = num(1); if (isErr(x)) return x; if (isErr(y)) return y; return Math.pow(x, y); }
      case 'LOWER': { v = one(0); return isErr(v) ? v : this.toText(v).toLowerCase(); }
      case 'UPPER': { v = one(0); return isErr(v) ? v : this.toText(v).toUpperCase(); }
      case 'LEN': { v = one(0); return isErr(v) ? v : this.toText(v).length; }
      case 'CHOOSE': {
        var ix = num(0); if (isErr(ix)) return ix; ix = Math.floor(ix);
        if (ix < 1 || ix >= A.length) return E('#VALUE!');
        return this.scalar(A[ix], sh);
      }
      case 'INDEX': {
        var rg = this.ev(A[0], sh);
        if (!isRange(rg)) return E('#VALUE!');
        var rows = rg.r2 - rg.r1 + 1, cols = rg.c2 - rg.c1 + 1;
        var a1 = num(1); if (isErr(a1)) return a1;
        var a2 = A.length > 2 ? num(2) : null; if (isErr(a2)) return a2;
        var ri, ci;
        if (a2 === null) { if (cols === 1) { ri = a1; ci = 1; } else if (rows === 1) { ri = 1; ci = a1; } else { ri = a1; ci = 1; } }
        else { ri = a1; ci = a2; }
        ri = Math.floor(ri); ci = Math.floor(ci);
        if (ri < 1 || ci < 1 || ri > rows || ci > cols) return E('#REF!');
        v = this.cell(rg.sh, numToCol(rg.c1 + ci - 1) + (rg.r1 + ri - 1));
        return v === null ? 0 : v;
      }
      case 'MATCH': {
        var look = one(0); if (isErr(look)) return look;
        var rg2 = this.ev(A[1], sh); if (!isRange(rg2)) return E('#VALUE!');
        var mt = A.length > 2 ? num(2) : 1; if (isErr(mt)) return mt;
        var vals = this.flat(rg2), i;
        if (mt === 0) {
          for (i = 0; i < vals.length; i++) { if (vals[i] === null) continue; if (typeof look === typeof vals[i] ? cmpVals(look, vals[i]) === 0 : false) return i + 1; }
          return E('#N/A');
        }
        var best = -1;
        for (i = 0; i < vals.length; i++) {
          if (vals[i] === null || typeof vals[i] !== typeof look) continue;
          var cc = cmpVals(vals[i], look);
          if (mt > 0 ? cc <= 0 : cc >= 0) best = i; else break;
        }
        return best < 0 ? E('#N/A') : best + 1;
      }
      case 'COUNTIF': {
        var rg3 = this.ev(A[0], sh); if (!isRange(rg3)) return E('#VALUE!');
        var crit = one(1); if (isErr(crit)) return crit;
        var op = '=', rhs = crit;
        if (typeof crit === 'string') { var mm = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(crit); op = mm[1] || '='; rhs = mm[2]; var nn = Number(rhs.replace(',', '.')); if (rhs !== '' && !isNaN(nn)) rhs = nn; }
        var cnt = 0, vs = this.flat(rg3);
        for (var k = 0; k < vs.length; k++) {
          var cv = vs[k]; if (cv === null) continue;
          if (typeof rhs === 'number' && typeof cv !== 'number') continue;
          if (typeof rhs === 'string' && typeof cv !== 'string') continue;
          var c3 = cmpVals(cv, rhs);
          if (op === '=' ? c3 === 0 : op === '<>' ? c3 !== 0 : op === '<' ? c3 < 0 : op === '>' ? c3 > 0 : op === '<=' ? c3 <= 0 : c3 >= 0) cnt++;
        }
        return cnt;
      }
      case 'COUNT': { var cs = 0; for (var q = 0; q < A.length; q++) { var vv = this.ev(A[q], sh); if (isRange(vv)) this.flat(vv).forEach(function (z) { if (typeof z === 'number') cs++; }); else if (typeof vv === 'number') cs++; } return cs; }
      case 'ISNUMBER': return typeof one(0) === 'number';
      case 'ISERROR': return isErr(one(0));
    }
    return E('#NAME?');
  };

  // ------------------------------------------------------------ formatação
  function fmtNum(v, nf, comma) {
    if (typeof v !== 'number') return String(v);
    var dec = comma !== false;
    var s, mn = 0, mx = 0, thousands = false;
    if (!nf || nf === 'General') {
      s = String(parseFloat(v.toPrecision(10)));
      if (s.indexOf('e') >= 0) s = v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
      return dec ? s.replace('.', ',') : s;
    }
    var m = /\.([0#]+)/.exec(nf);
    if (m) { mn = (m[1].match(/0/g) || []).length; mx = m[1].length; }
    thousands = nf.split('.')[0].indexOf(',') >= 0;
    s = Math.abs(v) < 5e-13 ? '0' : v.toFixed(mx);
    var parts = s.split('.'), a = parts[0], b = parts[1] || '';
    if (mx > mn) { b = b.replace(/0+$/, ''); while (b.length < mn) b += '0'; }
    var neg = a.charAt(0) === '-'; if (neg) a = a.slice(1);
    if (thousands) a = a.replace(/\B(?=(\d{3})+(?!\d))/g, dec ? '.' : ',');
    var out = (neg ? '-' : '') + a + (b ? (dec ? ',' : '.') + b : '');
    if (out === '-0') out = '0';
    return out;
  }

  Engine.fmtNum = fmtNum; Engine.isErr = isErr; Engine.parse = parse; Engine.numToCol = numToCol; Engine.colToNum = colToNum;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine; else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
