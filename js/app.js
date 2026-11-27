/* Manual Técnico do Engenheiro — Wen Technology — lógica do aplicativo */
(function () {
  'use strict';
  var VERSION = '3.5.0';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fold = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };

  // ---------------------------------------------------------------- armazenamento (tudo é salvo automaticamente)
  var mem = {};
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('wen.' + k); return v ? JSON.parse(v) : d; } catch (e) { return k in mem ? mem[k] : d; } },
    set: function (k, v) { mem[k] = v; try { localStorage.setItem('wen.' + k, JSON.stringify(v)); } catch (e) { } }
  };
  var DEF = { theme: 'auto', accent: 'blue', fs: 'm', dens: 'cozy', motion: 'auto', comma: true, fsGlobal: null, haptic: true, wake: false, resume: true, splash: true };
  var S = Object.assign({}, DEF, LS.get('settings', {}));
  var FAV = LS.get('fav', []);
  var REC = LS.get('recent', []);
  var INP = LS.get('inputs', {});
  function saveSettings() { LS.set('settings', S); }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }

  // ---------------------------------------------------------------- aparência
  var mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  var THEME_COLORS = { light: '#F3F5F9', dark: '#0B1322', black: '#000000' };
  function applyLook() {
    var h = document.documentElement;
    var th = S.theme === 'auto' ? (mqDark.matches ? 'dark' : 'light') : S.theme;
    h.dataset.theme = th; h.dataset.accent = S.accent; h.dataset.fs = S.fs; h.dataset.dens = S.dens === 'compact' ? 'compact' : 'cozy'; h.dataset.motion = S.motion === 'off' ? 'off' : 'auto';
    var m = $('meta[name="theme-color"]'); if (m) m.setAttribute('content', THEME_COLORS[th]);
  }
  if (mqDark.addEventListener) mqDark.addEventListener('change', function () { if (S.theme === 'auto') applyLook(); });
  applyLook();

  // ---------------------------------------------------------------- dados + motor
  var D, ENG, SHEETS, CHAP, BYNUM = {};
  var mediaUrl = function (n) { return (window.__MEDIA__ && window.__MEDIA__[n]) || ('media/' + n); };

  function boot(data) {
    D = data; SHEETS = D.sheets; CHAP = D.chapters;
    // tabelas de referência: "9.806,6500" vira "9 806,6500" (ponto de milhar lido como decimal já causou erro de 1000x)
    Object.keys(SHEETS).forEach(function (k) { var sh0 = SHEETS[k]; if (sh0.kind === 'calc') return; (sh0.blocks || []).forEach(function (b) { if (b.t !== 'table') return; b.rows.forEach(function (r) { for (var i = 0; i < r.length; i++) { var c = r[i]; if (typeof c === 'string') { var m = /^(-?\d{1,3}(?:\.\d{3})+)(,\d+)?$/.exec(c); if (m) r[i] = m[1].replace(/\./g, ' ') + (m[2] || ''); } } }); }); });
    Object.keys(SHEETS).forEach(function (k) { BYNUM[k] = SHEETS[k]; });
    var sh = {}; Object.keys(D.engine).forEach(function (k) { sh[k] = D.engine[k]; });
    Object.keys(SHEETS).forEach(function (k) { if (SHEETS[k].kind === 'calc') sh[SHEETS[k].name] = SHEETS[k].cells; });
    patchMatRange(sh); patchLists(sh); detectLib();
    MATS = LS.get('mat', null) || defaultMats();
    ENG = new Engine(sh, { comma: S.comma });
    applyMats(); applyLists();
    if (S.fsGlobal == null) S.fsGlobal = D.home.fs;
    ENG.setInput('Início', 'D16', Number(S.fsGlobal));
    Object.keys(INP).forEach(function (n) { Object.keys(INP[n]).forEach(function (a) { ENG.setInput(n, a, INP[n][a]); }); });
    fxBoot();
  }

  var BRAND_SVG = '<img class="brand-svg" src="icons/icon-192.png?v=5" alt="" width="52" height="52">';
  // ---------------------------------------------------------------- materiais personalizados
  var MAT_FIRST = 67, MAT_MAX = 100, MAT_LAST = 6 + 61 + MAT_MAX - 1 + 5; // linhas 67.. (até 172)
  MAT_LAST = MAT_FIRST + MAT_MAX + 5;
  var MATS = [];
  var MAT_COLS = 'ABCDEFGHIJKLM';
  var MAT_FIELDS = [['Material', 't', ''], ['Categoria', 't', ''], ['E', 'n', 'GPa', 1], ['G', 'n', 'GPa', 1], ['ν (Poisson)', 'n', '', 2], ['ρ (densidade)', 'n', 'kg/m³', 0], ['Sy (escoamento)', 'n', 'MPa', 0], ['Sut (ruptura)', 'n', 'MPa', 0], ['Suc (compressão)', 'n', 'MPa', 0], ['α (dilatação)', 'n', 'µm/m·°C', 1], ['Dureza', 'n', 'HB', 0], ['Alongamento', 'n', '%', 0], ['Observação / fonte', 't', '']];
  function patchMatRange(sh) {
    var re = /(\$[A-M]\$6:\$[A-M]\$)72\b/g;
    Object.keys(sh).forEach(function (n) {
      var cells = sh[n]; if (n === '2.1 Materiais') return;
      Object.keys(cells).forEach(function (a) { var v = cells[a]; if (typeof v === 'string' && v.charAt(0) === '=' && v.indexOf('2.1 Materiais') >= 0) cells[a] = v.replace(re, '$1' + MAT_LAST); });
    });
    Object.keys(SHEETS).forEach(function (k) { SHEETS[k].rows && SHEETS[k].rows.forEach(function (r) { if (r.dv && r.dv.ref && r.dv.ref[0] === '2.1 Materiais') r.dv.ref[4] = MAT_LAST; }); });
  }
  function defaultMats() {
    var m = D.engine['2.1 Materiais'], out = [];
    for (var r = MAT_FIRST; r < MAT_FIRST + 6; r++) { var row = []; for (var c = 0; c < 13; c++) { var v = m[MAT_COLS[c] + r]; row.push(v == null ? null : v); } out.push(row); }
    return out;
  }
  var MAT_DEF = null;
  function applyMats() {
    var m = D.engine['2.1 Materiais'];
    for (var i = 0; i < MAT_MAX + 5; i++) {
      var r = MAT_FIRST + i, row = MATS[i];
      for (var c = 0; c < 13; c++) { var a = MAT_COLS[c] + r; if (row && row[c] != null && row[c] !== '') m[a] = row[c]; else delete m[a]; }
    }
    ENG.setOpts({});
    Object.keys(SHEETS).forEach(function (k) { delete SHEETS[k]._m; });
    IDX = null;
  }
  function matFmt(v, c) {
    if (v == null || v === '') return '';
    if (typeof v !== 'number') return String(v);
    var d = MAT_FIELDS[c][3] || 0;
    return fmtGrp(v, d, Math.max(d, 2));
  }
  function matRows() { return MATS.map(function (row) { return row.map(function (v, c) { return matFmt(v, c); }); }); }
  function matSave() { LS.set('mat', MATS); applyMats(); }
  function matEdit(idx) {
    var isNew = idx >= MATS.length, row = isNew ? null : MATS[idx].slice();
    if (isNew) {
      var n = MATS.length + 1; var tpl = defaultMats()[0].slice(); tpl[0] = 'Personalizado ' + n;
      while (MATS.some(function (x) { return x[0] === tpl[0]; })) { n++; tpl[0] = 'Personalizado ' + n; }
      row = tpl;
    }
    var h = '<div class="matform" style="padding:4px 18px 8px;display:grid;gap:10px">' + MAT_FIELDS.map(function (f, c) {
      var v = row[c], val = f[1] === 'n' ? (v == null ? '' : numStr(v)) : (v == null ? '' : v);
      return '<label class="mf"><small style="display:block;font-size:.72rem;font-weight:650;color:var(--muted);margin:0 2px 4px">' + esc(f[0]) + '</small><span class="inp"><input data-c="' + c + '" ' + (f[1] === 'n' ? 'inputmode="decimal"' : 'type="text"') + ' value="' + esc(val) + '" autocomplete="off">' + (f[2] ? '<span class="u">' + esc(f[2]) + '</span>' : '') + '</span></label>';
    }).join('') + '<p id="mat-err" class="muted" style="color:var(--err);font-size:.8rem;margin:0" hidden></p></div>' +
      '<div class="actions" style="padding:0 18px 14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" data-m="save">' + ic('check', 's') + ' Salvar</button>' + (isNew ? '' : '<button class="btn sm" data-m="del">' + ic('trash', 's') + (idx < 6 ? ' Restaurar padrão' : ' Excluir') + '</button>') + '</div>';
    openSheet(isNew ? 'Novo material' : row[0], h, function (sh) {
      var err = $('#mat-err', sh);
      sh.addEventListener('click', function (e) {
        var b = e.target.closest('[data-m]'); if (!b) return;
        var oldName = isNew ? null : MATS[idx][0];
        if (b.dataset.m === 'save') {
          var nr = [], bad = null;
          $$('input[data-c]', sh).forEach(function (inp) {
            var c = +inp.dataset.c, f = MAT_FIELDS[c];
            if (f[1] === 't') nr[c] = inp.value.trim();
            else { var p = parseNum(inp.value); if (p !== null && isNaN(p)) bad = f[0]; nr[c] = p; }
          });
          if (!nr[0]) bad = 'Material (nome)';
          [2, 3, 4, 5, 6, 7].forEach(function (c) { if (!bad && nr[c] == null) bad = MAT_FIELDS[c][0] + ' (obrigatório)'; });
          if (!bad && MATS.some(function (x, i) { return i !== idx && String(x[0]).toLowerCase() === nr[0].toLowerCase(); }) || (!bad && D.engine['2.1 Materiais'] && matBase().some(function (x) { return x.toLowerCase() === nr[0].toLowerCase(); }))) bad = 'nome repetido';
          if (bad) { err.hidden = false; err.textContent = bad === 'nome repetido' ? 'Já existe um material com esse nome. Use outro nome.' : 'Valor inválido em: ' + bad; return; }
          if (isNew) MATS.push(nr); else MATS[idx] = nr;
          if (oldName && oldName !== nr[0]) renameMat(oldName, nr[0]);
          matSave(); buzz(); closeSheet(); render(); toast(isNew ? 'Material adicionado — já aparece nas calculadoras' : 'Material salvo');
        } else if (b.dataset.m === 'del') {
          if (idx < 6) { MATS[idx] = defaultMats()[idx]; if (oldName !== MATS[idx][0]) renameMat(oldName, MATS[idx][0]); }
          else { MATS.splice(idx, 1); dropMat(oldName); }
          matSave(); buzz(); closeSheet(); render(); toast(idx < 6 ? 'Linha restaurada' : 'Material excluído');
        }
      });
    });
  }
  function matBase() { var m = D.engine['2.1 Materiais'], o = []; for (var r = 6; r < MAT_FIRST; r++) if (m['A' + r]) o.push(String(m['A' + r])); return o; }
  function renameMat(a, b) {
    var ch = false;
    Object.keys(INP).forEach(function (n) { Object.keys(INP[n]).forEach(function (ad) { if (INP[n][ad] === a) { INP[n][ad] = b; ENG.setInput(n, ad, b); ch = true; } }); });
    if (ch) LS.set('inputs', INP);
  }
  function dropMat(a) {
    var ch = false;
    Object.keys(INP).forEach(function (n) { Object.keys(INP[n]).forEach(function (ad) { if (INP[n][ad] === a) { delete INP[n][ad]; ENG.setInput(n, ad, null); ch = true; } }); });
    if (ch) LS.set('inputs', INP);
  }

  // ---------------------------------------------------------------- utilidades
  var CH_HUE = { 1: 214, 2: 162, 3: 8, 4: 268, 5: 42, 6: 192, 7: 322, 8: 24, 9: 140, 10: 52, 11: 350, 12: 232 };
  var CH_ICON = { 1: 'ruler', 2: 'cube', 3: 'beam', 4: 'profile', 5: 'bolt', 6: 'gear', 7: 'tol', 8: 'wrench', 9: 'piston', 10: 'zap', 11: 'hook', 12: 'book' };
  function buzz(ms) { if (S.haptic && navigator.vibrate) { try { navigator.vibrate(ms || 8); } catch (e) { } } }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }
  function numStr(v) { var s = String(parseFloat(Number(v).toPrecision(12))); return S.comma ? s.replace('.', ',') : s; }
  // Lê o que a pessoa digita: aceita 9.53 e 9,53 (decimal), 1 000,5 / 1.000,5 / 1,000.5 (milhar + decimal) e 1.000 (= mil, padrão pt-BR).
  // Quando a leitura difere do que foi digitado, a tela mostra "lido como ..." (ver echoText).
  function parseNum(s) {
    s = String(s).trim().replace(/[\s  ']/g, ''); if (s === '' || s === '-') return null;
    var c = s.lastIndexOf(','), d = s.lastIndexOf('.');
    if (c >= 0 && d >= 0) { if (c > d) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); }
    else if (c >= 0) { if (/^-?\d{1,3}(,\d{3}){2,}$/.test(s)) s = s.replace(/,/g, ''); else s = s.replace(',', '.'); }
    else if (d >= 0) { if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); }
    var n = Number(s); return isNaN(n) ? NaN : n;
  }
  // Milhar SEMPRE com espaço (6 353), nunca ponto: ponto de milhar foi lido como decimal e deu erro de leitura 1000x.
  function grpInt(p) { return p.length > 3 ? p.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : p; }
  function fmtGrp(v, minD, maxD) {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    var s = v.toFixed(maxD), neg = s.charAt(0) === '-'; if (neg) s = s.slice(1);
    var p = s.split('.'), f = p[1] || ''; while (f.length > minD && f.charAt(f.length - 1) === '0') f = f.slice(0, -1);
    var o = grpInt(p[0]) + (f ? ',' + f : ''); return (neg && /[1-9]/.test(o) ? '-' : '') + o;
  }
  // Equivalência de unidades: mm⁴ → cm⁴ (÷ 10 000) e mm³ → cm³ (÷ 1 000)
  var UNIT_NOTE = 'mm⁴ → cm⁴: dividir por 10 000 · mm³ → cm³: dividir por 1 000';
  function eqOf(v, unit) {
    if (typeof v !== 'number' || !isFinite(v)) return '';
    var u = String(unit == null ? '' : unit).trim(), d, t;
    if (/^mm(⁴|4|\^4)$/.test(u)) { d = 10000; t = 'cm⁴'; } else if (/^mm(³|3|\^3)$/.test(u)) { d = 1000; t = 'cm³'; } else return '';
    var x = v / d, a = Math.abs(x), nf = a >= 1000 ? '#,##0' : a >= 100 ? '#,##0.0' : a >= 10 ? '#,##0.00' : '#,##0.000';
    return '= ' + (a !== 0 && a < 0.001 ? fmtSig(x) : Engine.fmtNum(x, nf, true)) + ' ' + t;
  }
  function sheetHasEq(s) { var c = s.cells || {}; for (var a in c) if (a.charAt(0) === 'D' && /^mm(⁴|³)$/.test(String(c[a]))) return true; return false; }
  function echoText(raw, n, unit) {
    var out = [], canon = numStr(n);
    if (String(raw).trim().replace(/\s/g, '') !== canon) out.push('lido como ' + fmtGrp(n, 0, 6) + (unit && unit !== '-' ? ' ' + unit : ''));
    var e = eqOf(n, unit); if (e) out.push('(' + e + ')');
    return out.join(' ');
  }
  function fmtSig(v) { if (!isFinite(v)) return '—'; var s = String(parseFloat(v.toPrecision(7))); if (s.indexOf('e') >= 0) s = v.toExponential(4); return S.comma ? s.replace('.', ',') : s; }
  function hi(text, terms) {
    var t = String(text); if (!terms || !terms.length) return esc(t);
    var f = fold(t); if (f.length !== t.length) return esc(t);
    var ranges = [];
    terms.forEach(function (q) { var i = 0; while (q && (i = f.indexOf(q, i)) >= 0) { ranges.push([i, i + q.length]); i += q.length; } });
    if (!ranges.length) return esc(t);
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var out = '', pos = 0;
    ranges.forEach(function (r) { if (r[0] < pos) { if (r[1] > pos) { out += '<mark>' + esc(t.slice(pos, r[1])) + '</mark>'; pos = r[1]; } return; } out += esc(t.slice(pos, r[0])) + '<mark>' + esc(t.slice(r[0], r[1])) + '</mark>'; pos = r[1]; });
    return out + esc(t.slice(pos));
  }
  function isFav(n) { return FAV.indexOf(n) >= 0; }
  function toggleFav(n) { var i = FAV.indexOf(n); if (i >= 0) FAV.splice(i, 1); else FAV.unshift(n); LS.set('fav', FAV); buzz(); }
  function pushRecent(n) { REC = REC.filter(function (x) { return x !== n; }); REC.unshift(n); REC = REC.slice(0, 12); LS.set('recent', REC); }
  function chOf(n) { return CHAP.filter(function (c) { return c.n === BYNUM[n].ch; })[0]; }
  function shortName(s) { return s.name.replace(/^\S+\s+/, ''); }
  var saveInputsT;
  function persistInputs() { clearTimeout(saveInputsT); saveInputsT = setTimeout(function () { LS.set('inputs', INP); }, 250); }

  // ---------------------------------------------------------------- roteador
  var cur = { route: '', sheet: null };
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, ''); var q = {}; var i = h.indexOf('?');
    if (i >= 0) { h.slice(i + 1).split('&').forEach(function (p) { var kv = p.split('='); q[kv[0]] = decodeURIComponent(kv[1] || ''); }); h = h.slice(0, i); }
    return { path: h, q: q, parts: h.split('/') };
  }
  function go(p) { location.hash = '#/' + p; }
  var scrollPos = {}, popping = false, SEGPREV = {}, SUMPREV = {};
  window.addEventListener('popstate', function () { popping = true; });
  window.addEventListener('hashchange', function () { render(); });

  function render() {
    var r = parseHash();
    scrollPos[cur.route] = window.scrollY;
    var el = $('#view'), p = r.parts, html = '', after = null, nav = 'home';
    cur.route = r.path;
    if (r.path !== '' && r.path !== 'home') LS.set('last', r.path + (location.hash.indexOf('?') >= 0 ? '?' + location.hash.split('?')[1] : ''));
    if (p[0] === '' || p[0] === 'home') { html = vHome(); nav = 'home'; }
    else if (p[0] === 'c' && !p[1]) { html = vChapters(); nav = 'c'; }
    else if (p[0] === 'c') { html = vChapter(+p[1]); nav = 'c'; }
    else if (p[0] === 's' && BYNUM[p[1]]) { var s = BYNUM[p[1]]; cur.sheet = s; pushRecent(s.num); html = s.kind === 'calc' ? vCalc(s) : vTables(s); after = function () { s.kind === 'calc' ? bindCalc(s) : bindTables(s, r.q); }; nav = 'c'; }
    else if (p[0] === 'search') { html = vSearch(r.q.q || ''); after = function () { bindSearch(r.q.q || ''); }; nav = 'search'; }
    else if (p[0] === 'fav') { html = vFav(); nav = 'fav'; }
    else if (p[0] === 'panel') { html = vPanel(); nav = 'fav'; }
    else if (p[0] === 'set') { html = vSettings(); nav = 'set'; }
    else if (p[0] === 'help') { html = vHelp(); nav = 'set'; }
    else { html = vHome(); }
    el.innerHTML = html; el.className = 'view';
    void el.offsetWidth;
    $$('.nav a').forEach(function (a) { if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $$('.listpane .row').forEach(function (a) { if (a.dataset.num && cur.sheet && p[0] === 's' && a.dataset.num === p[1]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var curRow = $('.listpane .row[aria-current="page"]'); if (curRow) { var ac = curRow.closest('.acc'); if (ac && !ac.classList.contains('open')) ac.classList.add('open'); }
    if (after) after();
    if (popping && scrollPos[r.path] != null) window.scrollTo(0, scrollPos[r.path]); else if (!(r.q && r.q.r != null)) window.scrollTo(0, 0);
    popping = false;
    document.title = (p[0] === 's' && BYNUM[p[1]] ? BYNUM[p[1]].name + ' · ' : '') + 'Manual Técnico Wen';
  }

  // ---------------------------------------------------------------- componentes
  function topbar(title, opts) {
    opts = opts || {};
    return '<header class="top">' + (opts.back === false ? '' : '<button class="ibtn" data-act="back" aria-label="Voltar">' + ic('back') + '</button>') +
      '<h1>' + (opts.kicker ? '<small>' + esc(opts.kicker) + '</small>' : '') + '<span class="t">' + esc(title) + '</span></h1>' + (opts.right || '') + '</header>';
  }
  function sheetRow(s, extra) {
    var calc = s.kind === 'calc';
    return '<button class="row" data-act="open" data-num="' + s.num + '"><span class="rn">' + s.num + '</span><span class="tx"><b>' + esc(shortName(s)) + '</b><small>' + esc(s.desc) + '</small></span>' +
      '<span class="kd ' + (calc ? 'calc' : '') + '">' + (calc ? 'ƒx' : 'tabela') + '</span></button>';
  }
  function chCard(c) {
    var n = c.sheets.length, k = c.sheets.filter(function (s) { return s.kind === 'calc'; }).length;
    return '<button class="card chcard" data-act="chap" data-n="' + c.n + '" style="--h:' + (CH_HUE[c.n] || 214) + '"><span class="ico">' + ic(CH_ICON[c.n] || 'grid', 'l') + '</span><span class="n">' + String(c.n).padStart(2, '0') + '</span><b>' + esc(c.title) + '</b><small>' + n + ' abas' + (k ? ' · ' + k + (k === 1 ? ' calculadora' : ' calculadoras') : '') + '</small></button>';
  }
  function openSheet(title, bodyHtml, onReady) {
    closeSheet(true);
    var sc = document.createElement('div'); sc.className = 'scrim'; sc.id = 'scrim'; sc.dataset.act = 'closesheet';
    var sh = document.createElement('div'); sh.className = 'sheet'; sh.id = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true');
    sh.innerHTML = '<div class="grab"></div><div class="sh-h"><h3>' + esc(title) + '</h3><button class="ibtn" data-act="closesheet" aria-label="Fechar">' + ic('close') + '</button></div><div class="sh-b">' + bodyHtml + '</div>';
    document.body.appendChild(sc); document.body.appendChild(sh);
    requestAnimationFrame(function () { sc.classList.add('on'); sh.classList.add('on'); });
    if (onReady) onReady(sh);
    return sh;
  }
  function closeSheet(now) {
    var sc = $('#scrim'), sh = $('#sheet'); if (!sh) return;
    sc.classList.remove('on'); sh.classList.remove('on');
    var rm = function () { sc.remove(); sh.remove(); };
    if (now) rm(); else setTimeout(rm, 260);
  }
  function lightbox(src) {
    var l = document.createElement('div'); l.className = 'lightbox'; l.innerHTML = '<button class="ibtn" data-act="closelb" aria-label="Fechar">' + ic('close') + '</button><img src="' + src + '" alt="">';
    l.addEventListener('click', function () { l.classList.remove('on'); setTimeout(function () { l.remove(); }, 200); });
    document.body.appendChild(l); requestAnimationFrame(function () { l.classList.add('on'); });
  }

  // ---------------------------------------------------------------- HOME
  function vHome() {
    var H = D.home, total = Object.keys(SHEETS).length, calcs = Object.keys(SHEETS).filter(function (k) { return SHEETS[k].kind === 'calc'; }).length;
    var checks = panelChecks(), bad = checks.filter(function (c) { return c.ok === false; }).length;
    var h = '<div class="top" style="min-height:0;padding-bottom:0"></div>' +
      '<section class="hero"><img class="logo" src="' + mediaUrl(D.logo) + '" alt="Wen Technology"><div class="in"><h2>Manual Técnico do Engenheiro Mecânico</h2><p>' + esc(H.sub.split(' — ')[0]) + '</p><span class="ver">' + ic('info', 's') + ' Versão ' + esc((H.ver.match(/Vers[ãa]o\s+([\d.]+)/i) || [0, '3.0'])[1]) + ' · funciona offline</span></div></section>' +
      '<button class="searchbar" data-act="gosearch">' + ic('search') + '<span>Buscar M12, 6205, H7/g6, 4140, O-ring…</span><kbd>/</kbd></button>' +
      quickHtml() +
      '<div class="stats"><div class="card stat"><b>' + total + '</b><span>Abas de consulta</span></div><div class="card stat"><b>' + calcs + '</b><span>Calculadoras</span></div><div class="card stat"><b>' + CHAP.length + '</b><span>Capítulos</span></div></div>' +
      '<button class="card alert-card ' + (bad ? 'err' : 'ok') + '" data-act="gopanel"><span class="ico">' + ic(bad ? 'warn' : 'okc') + '</span><span style="flex:1"><b>Painel de verificações</b><span>' + (bad ? bad + ' reprovada(s) de ' + checks.length + ' com os dados atuais' : 'Todas as ' + checks.length + ' verificações aprovadas') + '</span></span>' + ic('next', 's') + '</button>';
    var favs = FAV.filter(function (n) { return BYNUM[n]; });
    if (S.resume !== false) { var rc = REC.filter(function (n) { return BYNUM[n]; }).slice(0, 8); if (rc.length) h += '<div class="sect-t">' + ic('clock', 's') + 'Continuar</div><div class="rail-list">' + rc.map(miniCard).join('') + '</div>'; }
    if (favs.length) h += '<div class="sect-t">' + ic('star', 's') + 'Favoritos<span class="sp"></span><a href="#/fav">ver todos</a></div><div class="rail-list">' + favs.slice(0, 8).map(miniCard).join('') + '</div>';
    h += '<button class="card alert-card" data-act="gohelp" style="margin-top:12px"><span class="ico" style="background:var(--accent-soft2);color:var(--accent)">' + ic('bulb') + '</span><span style="flex:1"><b>Como usar</b><span>Busca, calculadoras, tabelas e legenda de cores</span></span>' + ic('next', 's') + '</button>';
    h += '<div class="sect-t">' + ic('grid', 's') + 'Capítulos</div><div class="chgrid">' + CHAP.map(chCard).join('') + '</div>';
    h += '<p class="footnote">' + esc(H.aviso || '') + ' ' + esc(H.aviso2 || '') + '</p>';
    return '<div class="view-in">' + h + '</div>';
  }
  var QUICK = ['3.3', '5.6', '8.4', '11.2', '11.4', '11.5', '11.6', '6.4', '5.11', '8.5', '3.5', '8.7'];
  function quickHtml() {
    var items = QUICK.filter(function (n) { return BYNUM[n]; });
    return '<div class="sect-t">Mais usadas<span class="sp"></span><a href="#/c">todos os capítulos</a></div><div class="quick">' + items.map(function (n) {
      var s = BYNUM[n]; return '<button class="qk" data-act="open" data-num="' + n + '"><span class="qn">' + n + '</span><b>' + esc(shortName(s).replace(/^Calc\.\s*/, '')) + '</b></button>';
    }).join('') + '</div>';
  }
  function miniCard(n) {
    var s = BYNUM[n]; if (!s) return '';
    return '<button class="card mini" data-act="open" data-num="' + n + '" style="--h:' + CH_HUE[s.ch] + '"><span class="badge ' + (s.kind === 'calc' ? 'calc' : '') + '">' + ic(s.kind === 'calc' ? 'calc' : 'table', 's') + ' ' + n + '</span><b>' + esc(shortName(s)) + '</b><small>' + esc(chOf(n).title) + '</small></button>';
  }
  function vChapters() {
    return topbar('Capítulos', { back: false }) + '<div style="margin-top:8px">' + CHAP.map(function (c) { return accordion(c, false); }).join('') + '</div>';
  }
  function accordion(c, open) {
    return '<div class="card acc' + (open ? ' open' : '') + '" style="--h:' + (CH_HUE[c.n] || 214) + '"><button class="hd" data-act="acc"><span class="rn">' + String(c.n).padStart(2, '0') + '</span><span style="flex:1"><b>' + esc(c.title) + '</b><small>' + c.sheets.length + ' abas</small></span>' + ic('down', 'chv') + '</button><div class="body"><div class="inner list">' + c.sheets.map(function (s) { return sheetRow(BYNUM[s.num]); }).join('') + '</div></div></div>';
  }
  function vChapter(n) {
    var c = CHAP.filter(function (x) { return x.n === n; })[0]; if (!c) return vHome();
    return topbar(c.title, { kicker: 'Capítulo ' + n }) + '<div class="card list" style="margin-top:8px">' + c.sheets.map(function (s) { return sheetRow(BYNUM[s.num]); }).join('') + '</div>';
  }
  function vFav() {
    var favs = FAV.filter(function (n) { return BYNUM[n]; }), rec = REC.filter(function (n) { return BYNUM[n]; });
    var h = topbar('Favoritos e recentes', { back: false });
    h += '<div class="sect-t">' + ic('star', 's') + 'Favoritos</div>';
    h += favs.length ? '<div class="card list">' + favs.map(function (n) { return sheetRow(BYNUM[n]); }).join('') + '</div>' : '<div class="card empty">Toque na estrela no topo de qualquer aba para fixá-la aqui.</div>';
    h += '<div class="sect-t">' + ic('clock', 's') + 'Vistos recentemente' + (rec.length ? '<span class="sp"></span><button data-act="clearrec">limpar</button>' : '') + '</div>';
    h += rec.length ? '<div class="card list">' + rec.map(function (n) { return sheetRow(BYNUM[n]); }).join('') + '</div>' : '<div class="card empty">Nada por aqui ainda.</div>';
    h += '<div class="sect-t">' + ic('gauge', 's') + 'Ferramentas</div><div class="card list"><button class="row" data-act="gopanel"><span class="ico calc">' + ic('gauge') + '</span><span class="tx"><b>Painel de verificações</b><small>Resumo de aprovação de todas as calculadoras</small></span>' + ic('next', 's chev') + '</button></div>';
    return h;
  }

  function vHelp() {
    var items = [['search', 'Busca em tudo', 'Digite qualquer termo (M12, 6205, H7/g6, 4140, O-ring, torque, NPT, W200, solda, inox). Ignora maiúsculas e acentos. Use dois termos para refinar.'],
      ['calc', 'Calculadoras', 'Preencha os campos destacados. O resumo no topo mostra os resultados e se cada verificação passou (fator de segurança calculado maior ou igual ao requerido). Seus valores ficam salvos.'],
      ['table', 'Tabelas', 'Role para os lados, toque numa linha para ver todos os dados dela, use o filtro nas tabelas longas e toque nas figuras para ampliar.'],
      ['cube', 'Materiais', 'Escolha o material nas listas das calculadoras. O banco completo está na aba 2.1 Materiais.'],
      ['gauge', 'Fator de segurança global', 'Em Ajustes você define o FS padrão usado por todas as calculadoras. Em cada uma ainda dá para digitar um FS próprio e voltar ao padrão no botão ao lado.'],
      ['star', 'Favoritos', 'Toque na estrela de qualquer aba para fixá-la. As últimas abas abertas aparecem em Continuar.']];
    var h = topbar('Como usar', { kicker: 'Ajuda', back: true });
    h += '<div class="card list" style="margin-top:8px">' + items.map(function (i) { return '<div class="row" style="cursor:default"><span class="ico calc">' + ic(i[0]) + '</span><span class="tx"><b>' + i[1] + '</b><small style="-webkit-line-clamp:6">' + i[2] + '</small></span></div>'; }).join('') + '</div>';
    h += '<div class="sect-t">Legenda</div><div class="card" style="padding:14px;display:grid;gap:12px;font-size:.84rem"><div style="display:flex;gap:10px;align-items:center"><span class="inp" style="width:64px;height:34px;flex:none"></span><span>Campo de entrada: digite ou escolha.</span></div><div style="display:flex;gap:10px;align-items:center"><span class="tag" style="font-size:.6rem;font-weight:750;padding:3px 7px;border-radius:99px;background:var(--ok-soft);color:var(--ok);flex:none">FS GLOBAL</span><span>Valor que vem das Configurações. Pode ser substituído.</span></div><div style="display:flex;gap:10px;align-items:center"><span class="status ok" style="flex:none">' + ic('okc') + 'APROVADO</span><span>Verificação automática dentro do limite.</span></div><div style="display:flex;gap:10px;align-items:center"><span class="status err" style="flex:none">' + ic('errc') + 'REPROVADO</span><span>Verificação fora do limite. Revise as dimensões ou o material.</span></div></div>';
    h += '<p class="footnote">' + esc(D.home.aviso || '') + ' ' + esc(D.home.aviso2 || '') + '</p>';
    return h;
  }

  // ---------------------------------------------------------------- TABELAS
  function vTables(s) {
    var c = chOf(s.num), fav = isFav(s.num), jumps = [];
    var h = '<div class="shead" style="--h:' + CH_HUE[s.ch] + '"></div>' + topbar(shortName(s), { kicker: s.num + ' · ' + c.title, right: '<button class="ibtn ' + (fav ? 'on' : '') + '" data-act="fav" data-num="' + s.num + '" aria-label="Favoritar" aria-pressed="' + fav + '">' + ic(fav ? 'starf' : 'star') + '</button>' });
    h += '<p class="muted" style="font-size:.84rem;margin:2px 4px 6px">' + esc(s.sub || s.desc) + '</p>';
    var secIdx = 0; s.blocks.forEach(function (b) { if (b.t === 'sec') jumps.push({ i: secIdx, t: b.text }); secIdx++; });
    if (jumps.length >= 3) h += '<nav class="jump"><div class="chips">' + jumps.map(function (j) { return '<button class="chip" data-act="jump" data-id="b' + j.i + '">' + esc(j.t.replace(/\s*\(.*$/, '').replace(/\s+—\s+.*?(?=\s—|$)/, function (m) { return m; }).slice(0, 30)) + '</button>'; }).join('') + '</div></nav>';
    var ti = 0;
    s.blocks.forEach(function (b, i) {
      if (b.t === 'sec') h += '<h2 class="blk-t" id="b' + i + '">' + esc(b.text) + '</h2>';
      else if (b.t === 'note') h += '<div class="note' + (b.bold ? ' b' : '') + '">' + esc(b.text) + '</div>';
      else if (b.t === 'img') h += '<figure class="fig"><button data-act="zoom" data-src="' + mediaUrl(b.src) + '" aria-label="Ampliar figura"><img decoding="async" width="' + b.w + '" height="' + b.h + '" src="' + mediaUrl(b.src) + '" alt="' + esc(b.cap || 'Figura') + '"></button>' + (b.cap ? '<figcaption>' + ic('expand', 's') + esc(b.cap) + '</figcaption>' : '') + '</figure>';
      else if (b.t === 'table') { h += b.inter ? interTable(s, b, i) : dataTable(s, b, i, ti); ti++; }
    });
    if (s.src) h += '<p class="footnote">' + esc(s.src) + '</p>';
    return h;
  }
  function dataTable(s, b, bi, ti) {
    var isMat = s.num === '2.1', isPt = !isMat && !b.inter, nStatic = isMat ? b.rows.length - 6 : b.rows.length;
    var rowsAll = isMat ? b.rows.slice(0, nStatic).concat(matRows()) : isPt ? b.rows.concat(ptRows(s, bi).map(function (r) { return b.heads.map(function (x, i) { return fnum(r[i]); }); })) : b.rows;
    var thumbs = b.thumbs || null, big = rowsAll.length > 12;
    var h = '<div id="b' + bi + '">', fl = Math.max.apply(null, rowsAll.map(function (r) { return (r[0] || '').length; }));
    if (big) h += '<div class="tbl-tools"><label class="filter">' + ic('filter', 's') + '<input type="search" inputmode="search" enterkeyhint="search" placeholder="Filtrar esta tabela (' + rowsAll.length + ' linhas)" data-act="tfilter" data-t="' + bi + '" aria-label="Filtrar tabela"><span class="fcount" id="tc' + bi + '"></span></label></div>';
    var wide = b.heads.map(function (x, i) { var mx = 0; rowsAll.forEach(function (r) { var l = String(r[i] || '').length; if (l > mx) mx = l; }); return i > 0 && !b.num[i] && mx > 40; });
    var cc = function (i) { return (b.num[i] && i > 0 ? 'n' : '') + (wide[i] ? ' w' : ''); };
    h += '<div class="tbl-wrap" id="tw' + bi + '"><table class="t' + (fl <= 24 ? ' nw1' : '') + '"><thead><tr>' + (thumbs ? '<th>' + esc(b.thumbHead || '') + '</th>' : '') + b.heads.map(function (x, i) { return '<th class="' + cc(i) + '" data-act="tsort" data-t="' + bi + '" aria-sort="none" tabindex="0"><span>' + esc(x) + '</span><i class="so"></i></th>'; }).join('') + '</tr></thead><tbody>';
    rowsAll.forEach(function (r, ri) {
      var th = thumbs && thumbs[ri], cust = (isMat || isPt) && ri >= nStatic;
      h += '<tr class="' + (cust ? 'cust' : '') + '" data-act="' + (cust ? (isMat ? 'matedit' : 'ptedit') : 'rowdetail') + '" data-b="' + bi + '" data-r="' + (cust ? ri - nStatic : ri) + '" data-o="' + ri + '">' + (thumbs ? '<td class="th-img">' + (th ? '<img loading="lazy" decoding="async" src="' + mediaUrl(th) + '" alt="">' : '') + '</td>' : '') + r.map(function (c, i) { return '<td class="' + cc(i) + '">' + esc(c) + '</td>'; }).join('') + '</tr>';
    });
    h += '</tbody></table></div>';
    if (isMat) h += '<div class="card addbar"><span class="muted">Linhas amarelas são suas: toque para editar. Entram automaticamente nas listas de todas as calculadoras e ficam salvas neste aparelho.</span>' + (MATS.length < MAT_MAX ? '<button class="btn pri sm" data-act="matadd">+ Adicionar material</button>' : '') + '</div>';
    else if (isPt) h += '<div class="card addbar"><span class="muted">' + (LIBTAB[s.num] && LIBTAB[s.num][bi] ? 'Linhas amarelas são suas e entram no catálogo de perfis das calculadoras (viga, flambagem, tração).' : 'Linhas amarelas são suas: toque para editar. Ficam salvas neste aparelho.') + '</span><button class="btn pri sm" data-act="ptadd" data-b="' + bi + '">+ Adicionar linha</button></div>';
    return h + '</div>';
  }
  function interTable(s, b, bi) {
    var h = '<div id="b' + bi + '">';
    if (b.heads[0] === 'Grandeza') {
      var groups = {}, order = [];
      b.rawrows.forEach(function (r, i) { if (!groups[r[0]]) { groups[r[0]] = []; order.push(r[0]); } groups[r[0]].push(i); });
      order.forEach(function (g) {
        h += '<div class="card cv-group"><h3>' + esc(g) + '</h3>';
        groups[g].forEach(function (i) {
          var r = b.rawrows[i], key = s.num + ':cv:' + i, saved = (LS.get('cv', {}) || {})[key];
          var v = saved != null ? saved : r[2];
          h += '<div class="cv" data-cv="' + i + '" data-b="' + bi + '" data-inv="0"><label class="inp"><input inputmode="decimal" value="' + numStr(v) + '" data-act="cvin" aria-label="Valor em ' + esc(r[1]) + '"><span class="u">' + esc(r[1]) + '</span></label><button class="sw" data-act="cvswap" aria-label="Inverter conversão">' + ic('swap', 's') + '</button><div class="res"><span class="rv"></span><small class="ru"></small></div></div>';
        });
        h += '</div>';
      });
    } else {
      h += '<div class="card cv-group"><h3>Conversão de temperatura</h3>';
      b.rawrows.forEach(function (r, i) {
        h += '<div class="cv" data-cv="' + i + '" data-b="' + bi + '" data-temp="1"><label class="inp"><input inputmode="decimal" value="' + numStr(r[1]) + '" data-act="cvin" aria-label="Valor em ' + esc(r[0]) + '"><span class="u">' + esc(r[0]) + '</span></label><span class="arrow" style="text-align:center">' + ic('arrow', 's') + '</span><div class="res"><span class="rv"></span><small class="ru"></small></div></div>';
      });
      h += '</div>';
    }
    return h + '</div>';
  }
  function cvUpdate(row, s) {
    var bi = +row.dataset.b, b = s.blocks[bi], i = +row.dataset.cv, inp = $('input', row), v = parseNum(inp.value);
    var rv = $('.rv', row), ru = $('.ru', row);
    if (v === null || isNaN(v)) { rv.textContent = '—'; return; }
    if (row.dataset.temp) {
      var expr = (b.fx[i][2] || '').replace(/^=/, '').replace(/\$?[A-Z]+\d+/, 'v');
      var out; try { out = Function('v', 'return ' + expr)(v); } catch (e) { out = NaN; }
      rv.textContent = fmtSig(out); ru.textContent = b.rawrows[i][3];
    } else {
      var f = b.rawrows[i][3], inv = row.dataset.inv === '1';
      rv.textContent = fmtSig(inv ? v / f : v * f); ru.textContent = inv ? b.rawrows[i][1] : b.rawrows[i][5];
      $('.u', row).textContent = inv ? b.rawrows[i][5] : b.rawrows[i][1];
    }
  }
  function bindTables(s, q) {
    $$('.cv').forEach(function (r) { cvUpdate(r, s); });
    if (q && q.b != null) {
      var tr = $('#tw' + q.b + ' tr[data-r="' + q.r + '"]');
      if (tr) { setTimeout(function () { tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); tr.classList.add('flash'); }, 80); }
    }
  }
  function rowDetail(s, bi, ri) {
    var b = s.blocks[bi], r = b.rows[ri], th = b.thumbs && b.thumbs[ri];
    var dl = '<dl class="dt">' + b.heads.map(function (hd, i) { return '<dt>' + esc(hd) + '</dt><dd>' + esc(r[i]) + '</dd>'; }).join('') + '</dl>';
    var body = (th ? '<div style="background:var(--fig-bg);padding:10px;text-align:center"><img style="margin:0 auto;max-height:180px;width:auto" src="' + mediaUrl(th) + '" alt=""></div>' : '') + dl +
      '<div class="actions" style="padding:0 18px"><button class="btn sm" data-act="copyrow">' + ic('copy', 's') + ' Copiar linha</button></div>';
    var sh = openSheet(r[0] || 'Detalhe', body);
    $('[data-act="copyrow"]', sh).addEventListener('click', function () { copyText(s.name + '\n' + b.heads.map(function (hd, i) { return hd + ': ' + r[i]; }).join('\n')); });
  }
  function copyText(t) {
    var done = function () { toast('Copiado para a área de transferência'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t); done(); });
    else { fallbackCopy(t); done(); }
  }
  function fallbackCopy(t) { var a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) { } a.remove(); }

  // ---------------------------------------------------------------- CALCULADORAS
  // parâmetros de decisão em linguagem simples, no topo da calculadora (linhas movidas para o cartão do topo)
  var DECISION = { '3.3': { title: 'Parâmetros de decisão', hint: 'O que muda o resultado: o esquema da viga (apoios e carga), o critério da flecha (L ÷ 800, 500, 300...), o fator de segurança e o material. Altere aqui; as fórmulas ficam no botão Fórmulas.', rows: [19, 25, 16, 7, 8] } };
  function calcModel(s) {
    if (s._m) return s._m;
    var rows = s.rows.map(function (r) {
      var o = Object.assign({}, r);
      if (r.k === 'f') {
        var raw = s.cells['C' + r.r];
        o.rawF = typeof raw === 'string' && raw.charAt(0) === '=';
        o.stt = o.rawF && raw.indexOf('✓') >= 0;
        if (r.dv) {
          if (r.dv.items) o.items = r.dv.items;
          else { var rf = r.dv.ref, sh = D.engine[rf[0]], col = rf[1]; o.items = []; for (var i = rf[2]; i <= rf[4]; i++) { var v = sh && sh[col + i]; if (v != null) o.items.push(v); } }
        }
      }
      return o;
    });
    s._m = rows; return rows;
  }
  function cellV(s, a) { return ENG.cell(s.name, a); }
  function txt(v) { return Engine.isErr(v) ? '' : (v == null ? '' : (typeof v === 'number' ? numStr(v) : String(v))); }
  function fmtOut(s, r, v) {
    if (Engine.isErr(v)) return { t: '—', err: v.e };
    if (typeof v === 'number') return { t: Engine.fmtNum(v, r.nf, S.comma) };
    if (v == null) return { t: '' };
    return { t: String(v) };
  }
  function statusHtml(t) {
    var ok = t.indexOf('✓') === 0 || /APROVADO/.test(t) && t.indexOf('REPROVADO') < 0;
    var clean = t.replace(/^[✓✗]\s*/, '');
    return '<span class="status ' + (ok ? 'ok' : 'err') + '">' + ic(ok ? 'okc' : 'errc') + esc(clean) + '</span>';
  }
  function vCalc(s) {
    var rows = calcModel(s), c = chOf(s.num), fav = isFav(s.num);
    var favBtn = '<button class="ibtn ' + (fav ? 'on' : '') + '" data-act="fav" data-num="' + s.num + '" aria-label="Favoritar" aria-pressed="' + fav + '">' + ic(fav ? 'starf' : 'star') + '</button>';
    var fsg = Number(S.fsGlobal != null ? S.fsGlobal : D.home.fs);
    var h = '<header class="top"><button class="ibtn" data-act="back" aria-label="Voltar">' + ic('back') + '</button><span class="crumb">Cap. ' + s.ch + ' · ' + esc(c.title) + '</span><span style="flex:1"></span>' + favBtn + '</header>' +
      '<div class="tb"><div class="tb-n"><b>' + esc(s.num) + '</b><span>calculadora</span></div><div class="tb-t"><h1>' + esc(shortName(s)) + '</h1><p>' + esc(s.desc || '') + '</p></div>' +
      '<div class="tb-c"><div><small>Unidades</small><b>N · mm · MPa</b></div><div><small>FS padrão</small><b>' + esc(numStr(fsg)) + '</b></div><div><small>Uso</small><b>Pré-dimensionamento</b></div><div><small>Revisão</small><b>v' + esc(VERSION) + '</b></div></div></div>';
    var sub = s.sub_f ? txt(cellV(s, 'B2')) : (s.sub || '');
    if (FX_LAST !== s.num) { FXMODE = false; FXEDIT = null; FX_LAST = s.num; }
    h += '<p class="fml" id="csub">' + esc(sub) + '</p>';
    if (sheetHasEq(s)) h += '<p class="unitnote"><b>Unidades:</b> ' + esc(UNIT_NOTE) + '. Milhar com espaço (6 353 = seis mil trezentos e cinquenta e três); a vírgula é sempre decimal.</p>';
    h += '<div class="fxbar' + (FXMODE ? ' on' : '') + (fxCount(s) ? ' has' : '') + '" id="fxbar" role="toolbar" aria-label="Fórmulas desta calculadora">' + fxBarHtml(s) + '</div>';
    h += '<div class="calc-grid"><aside class="card summary" id="sum"></aside><div class="form' + (FXMODE ? ' fxon' : '') + '">';
    var figs = (s.figs || []).slice().sort(function (a, b) { return a.r - b.r; }), fi = 0, open = false;
    function flushFigs(r) { var o = ''; while (fi < figs.length && figs[fi].r <= r) { var f = figs[fi++]; o += '<details class="figd" open><summary>' + ic('image', 's') + esc(f.cap || ('Figura de apoio ' + (fi))) + ic('down', 's chv') + '</summary><div class="fb"><button data-act="zoom" data-src="' + mediaUrl(f.src) + '" style="width:100%"><img decoding="async" width="' + f.w + '" height="' + f.h + '" src="' + mediaUrl(f.src) + '" alt="' + esc(f.cap || 'Figura') + '"></button></div></details>'; } return o; }
    var DEC = DECISION[s.num] || null, decSet = {};
    if (DEC) {
      h += '<section class="card sec decide" aria-label="Parâmetros de decisão"><h3>' + esc(DEC.title) + '</h3><p class="dc-hint">' + esc(DEC.hint) + '</p>';
      DEC.rows.forEach(function (rn) { var rr = rows.filter(function (x) { return x.r === rn; })[0]; if (!rr) return; decSet[rn] = 1; h += preCards(s, rn) + fieldHtml(s, rr); });
      h += '</section>';
    }
    rows.forEach(function (r) {
      if (decSet[r.r]) return;
      var f = flushFigs(r.r);
      if (r.k === 'sec') { if (open) h += '</section>'; h += f + '<section class="card sec"><h3>' + esc(r.text) + '</h3>'; open = true; }
      else { if (f) { if (open) { h += '</section>'; open = false; } h += f; } if (!open) { h += '<section class="card sec">'; open = true; } if (LIBSHEETS[s.num] && r.r === LIBSHEETS[s.num].typ) h += libCardHtml(s); h += preCards(s, r.r); h += r.k === 'note' ? '<div class="field"><div class="hint" data-n="' + r.r + '">' + esc(r.text) + '</div></div>' : fieldHtml(s, r); }
    });
    if (open) h += '</section>';
    h += flushFigs(9999);
    h += '<div class="actions"><button class="btn pri" data-act="copycalc">' + ic('copy', 's') + ' Copiar resultados</button><button class="btn" data-act="memorial">' + ic('book', 's') + ' Memorial (PDF)</button><button class="btn fxtog" data-act="fxtoggle"><span class="fxk" aria-hidden="true">ƒx</span> Fórmulas</button><button class="btn" data-act="resetcalc">' + ic('reset', 's') + ' Restaurar padrões</button></div>';
    h += '<p class="footnote">' + esc(D.home.aviso || '') + '</p></div></div><div class="livebar" id="livebar" aria-live="polite"></div>';
    return h;
  }
  function fieldHtml(s, r) {
    var k = r.kind, cls = 'field ' + (k === 'in' ? 'in' : k === 'main' ? 'mainr out-f' : 'out-f') + (r.stt ? ' stt' : '');
    var h = '<div class="' + cls + '" data-r="' + r.r + '">';
    if (k === 'in') {
      h += '<div class="lab"><span data-l></span><span class="tag" data-g hidden>FS global</span></div><div class="ctl" data-ctl></div><div class="echo" data-echo aria-live="polite"></div><div class="hint" data-nt></div>';
    } else {
      h += '<div class="out"><span class="lab" data-l></span><span class="val" data-v></span></div><div class="hint" data-nt></div>';
    }
    return h + '<div class="fxr" data-fxr hidden></div></div>';
  }
  function ctlHtml(s, r) {
    var v = cellV(s, 'C' + r.r), unit = txt(cellV(s, 'D' + r.r)), ov = ENG.hasOverride(s.name, 'C' + r.r), h = '';
    if (r.items) {
      var cvv = txt(v); if (isTypRow(s, r) && LIBSEL[s.num]) { var le2 = libFind(LIBSEL[s.num].id); if (le2) cvv = (LIBTYPES.filter(function (x) { return x[0] === le2.type; })[0] || ['', ''])[1] + ' · ' + le2.name; }
      if (r.items.length <= 3 && r.items.every(function (x) { return String(x).length <= 18; })) { var si = Math.max(0, r.items.map(String).indexOf(String(v))), sk = s.num + ':' + r.r, sf = (sk in SEGPREV) ? SEGPREV[sk] : si; SEGPREV[sk] = si;
        h = '<div class="seg" role="group" style="--n:' + r.items.length + ';--i:' + sf + '" data-to="' + si + '">' + r.items.map(function (it) { return '<button data-act="segpick" data-v="' + esc(it) + '" aria-pressed="' + (String(it) === String(v)) + '">' + esc(it) + '</button>'; }).join('') + '</div>'; }
      else h = '<button class="pick" data-act="pick" aria-haspopup="listbox"><span>' + esc(cvv) + '</span>' + ic('down', 's') + '</button>';
    } else if (r.num || typeof v === 'number') {
      h = '<label class="inp"><input inputmode="decimal" autocomplete="off" enterkeyhint="done" value="' + esc(typeof v === 'number' ? numStr(v) : txt(v)) + '" data-act="numin" aria-label="valor"><span class="u">' + esc(unit && unit !== '-' ? unit : '') + '</span><span class="stp"><button type="button" tabindex="-1" data-act="step" data-d="1" aria-label="Aumentar">+</button><button type="button" tabindex="-1" data-act="step" data-d="-1" aria-label="Diminuir">\u2212</button></span></label>';
    } else {
      h = '<label class="inp"><input value="' + esc(txt(v)) + '" data-act="numin" data-text="1" aria-label="valor"><span class="u">' + esc(unit) + '</span></label>';
    }
    if (r.rawF && ov) h += '<button class="rbtn" data-act="unglobal" aria-label="Voltar ao valor padrão" title="Voltar ao padrão">' + ic('reset', 's') + '</button>';
    return h;
  }
  function bindCalc(s) {
    refreshCalc(s, true);
    var lb = $('#livebar'), sm = $('#sum');
    if (lb && sm && 'IntersectionObserver' in window) { var io = new IntersectionObserver(function (en) { lb.classList.toggle('on', !en[0].isIntersecting && innerWidth < 720); }, { threshold: 0 }); io.observe(sm); }
    else if (lb && innerWidth < 720) lb.classList.add('on');
  }
  function stepInput(inp, dir, mult) {
    var n0 = parseNum(inp.value); if (n0 === null || isNaN(n0)) n0 = 0;
    var mag = n0 === 0 ? 1 : Math.pow(10, Math.floor(Math.log10(Math.abs(n0))) - 1), st = Math.max(mag, 0.001) * (mult || 1);
    var nv = parseFloat((n0 + dir * st).toPrecision(12)); inp.value = numStr(nv);
    inp.dispatchEvent(new Event('input', { bubbles: true })); buzz(4);
  }
  function refreshCalc(s, full) {
    var rows = calcModel(s), byR = {};
    rows.forEach(function (r) { if (r.k === 'f') byR[r.r] = r; });
    var sumRows = [];
    $$('.field[data-r]').forEach(function (el) {
      var r = byR[+el.dataset.r]; if (!r) return;
      var label = txt(cellV(s, 'B' + r.r)), v = cellV(s, 'C' + r.r), unit = txt(cellV(s, 'D' + r.r)), note = txt(cellV(s, 'E' + r.r));
      var hide = /^\(não usado\)$/i.test(label); el.classList.toggle('hide', hide);
      var L = $('[data-l]', el); if (L.textContent !== label) L.textContent = label;
      var N = $('[data-nt]', el); if (N) { if (N.textContent !== note) N.textContent = note; N.style.display = note ? '' : 'none'; }
      if (r.kind === 'in') {
        var ctl = $('[data-ctl]', el), focused = ctl.contains(document.activeElement);
        if (full || !focused) { var active = document.activeElement, typing = focused && active && /^(INPUT|TEXTAREA)$/.test(active.tagName); if (!focused || !typing) { ctl.innerHTML = ctlHtml(s, r); if (focused && active && active.tagName === 'BUTTON') { var nb = $('.seg [aria-pressed=\"true\"]', ctl) || $('button', ctl); if (nb) nb.focus({ preventScroll: true }); } var sgm = $('.seg', ctl); if (sgm) { requestAnimationFrame(function () { requestAnimationFrame(function () { sgm.style.setProperty('--i', sgm.dataset.to); }); }); } } }
        else { var u = $('.u', ctl); if (u) u.textContent = unit && unit !== '-' ? unit : ''; }
        if (!focused) { var ec = $('[data-echo]', el); if (ec) { var eq0 = typeof v === 'number' ? eqOf(v, unit) : ''; ec.textContent = eq0 ? '(' + eq0 + ')' : ''; } }
        var g = $('[data-g]', el); if (g) g.hidden = !(r.rawF && !ENG.hasOverride(s.name, 'C' + r.r));
      } else {
        var o = fmtOut(s, r, v), V = $('[data-v]', el);
        if (typeof v === 'string' && /^[✓✗]/.test(v)) { V.className = 'val'; V.innerHTML = statusHtml(v); }
        else if (o.err) { V.className = 'val errv'; V.textContent = '—'; V.title = o.err; }
        else if (typeof v === 'string' && v.length > 22) { V.className = 'val txt'; V.textContent = v; }
        else { V.className = 'val'; var eqs = eqOf(v, unit); V.innerHTML = esc(o.t) + (unit && unit !== '-' && o.t !== '' ? '<small>' + esc(unit) + '</small>' : '') + (eqs ? '<small class=\"eq\">(' + esc(eqs) + ')</small>' : ''); }
        var sig = (typeof v === 'string') ? v : o.t; if (r.kind !== 'in') { if (el.dataset.prev !== undefined && el.dataset.prev !== sig) { V.classList.remove('tick'); void V.offsetWidth; V.classList.add('tick'); } el.dataset.prev = sig; }
      }
      fxField(s, el, r);
      if (r.kind === 'main' || r.stt) sumRows.push({ label: label, v: v, o: fmtOut(s, r, v), unit: unit, stt: r.stt, eq: eqOf(v, unit) });
    });
    var S2 = $('#sum');
    if (S2) {
      var oks = sumRows.filter(function (x) { return x.stt && typeof x.v === 'string' && x.v.indexOf('✓') === 0; }).length, nst = sumRows.filter(function (x) { return x.stt; }).length;
      var open = S2.dataset.open === '1' || (S2.dataset.open == null && innerWidth >= 720);
      S2.classList.toggle('open', open);
      S2.innerHTML = '<button class="sum-h" data-act="sumtog" aria-expanded="' + open + '"><h3>' + ic('gauge', 's') + 'Resultados</h3>' + (nst ? '<span class="status ' + (oks === nst ? 'ok' : 'err') + '">' + ic(oks === nst ? 'okc' : 'errc') + oks + '/' + nst + ' ok</span>' : '') + ic('down', 's chv') + '</button><div class="sum-b">' + (sumRows.length ? sumRows.map(function (x) {
        if (x.stt && typeof x.v === 'string') return '<div class="sum-item"><span>' + esc(x.label) + '</span>' + statusHtml(x.v) + '</div>';
        var tk = (SUMPREV[s.num + x.label] !== undefined && SUMPREV[s.num + x.label] !== x.o.t) ? ' class="tick"' : ''; SUMPREV[s.num + x.label] = x.o.t;
        return '<div class="sum-item"><span>' + esc(x.label) + '</span><b' + tk + '>' + esc(x.o.t) + (x.unit && x.unit !== '-' && x.o.t !== '—' ? '<small>' + esc(x.unit) + '</small>' : '') + (x.eq ? '<small class=\"eq\">(' + esc(x.eq) + ')</small>' : '') + '</b></div>';
      }).join('') : '<div class="muted" style="font-size:.82rem">Preencha os campos para ver os resultados.</div>') + '</div>';
    }
    var LB = $('#livebar');
    if (LB) {
      var lbm = sumRows.filter(function (x) { return !x.stt; }).slice(0, 2), lbs = sumRows.filter(function (x) { return x.stt; });
      var lbok = lbs.filter(function (x) { return typeof x.v === 'string' && x.v.indexOf('\u2713') === 0; }).length;
      LB.innerHTML = lbm.map(function (m) { return '<div class="lb-i"><small>' + esc(m.label) + '</small><b>' + esc(m.o.t) + (m.unit && m.unit !== '-' ? '<i>' + esc(m.unit) + '</i>' : '') + (m.eq ? '<i class=\"eq\">(' + esc(m.eq) + ')</i>' : '') + '</b></div>'; }).join('') + (lbs.length ? '<span class="status ' + (lbok === lbs.length ? 'ok' : 'err') + '">' + ic(lbok === lbs.length ? 'okc' : 'errc') + lbok + '/' + lbs.length + '</span>' : '');
    }
    if (s.sub_f) { var cs = $('#csub'); if (cs) cs.textContent = txt(cellV(s, 'B2')); }
  }
  function setInput(s, addr, val) {
    if (!_libBusy && LIBSEL[s.num] && LIBSHEETS[s.num]) { var cf = LIBSHEETS[s.num]; if (addr === 'C' + cf.typ || cf.dims.some(function (x) { return addr === 'C' + x; })) { libClear(s); var lc = $('#libcard'); if (lc) lc.innerHTML = libCardInner(s); } }
    ENG.setInput(s.name, addr, val);
    (INP[s.name] = INP[s.name] || {})[addr] = val; persistInputs();
  }
  function clearInput(s, addr) {
    ENG.setInput(s.name, addr, null);
    if (INP[s.name]) { delete INP[s.name][addr]; persistInputs(); }
  }
  function resetCalc(s) { if (LIBSEL[s.num]) { delete LIBSEL[s.num]; LS.set('lib', LIBSEL); var lc = $('#libcard'); if (lc) lc.innerHTML = libCardInner(s); } ENG.clearSheet(s.name); delete INP[s.name]; LS.set('inputs', INP); ENG.setInput('Início', 'D16', Number(S.fsGlobal)); refreshCalc(s, true); toast('Valores restaurados'); }
  function calcSummaryText(s) {
    var rows = calcModel(s), out = [s.name, ''];
    rows.forEach(function (r) {
      if (r.k === 'sec') out.push('', '[' + r.text + ']');
      else if (r.k === 'f') {
        var l = txt(cellV(s, 'B' + r.r)); if (/^\(não usado\)$/i.test(l)) return;
        var v = cellV(s, 'C' + r.r), u = txt(cellV(s, 'D' + r.r)), o = fmtOut(s, r, v);
        out.push(l + ': ' + o.t.replace(/^[✓✗]\s*/, function (m) { return m; }) + (u && u !== '-' ? ' ' + u : '') + (eqOf(v, u) ? ' (' + eqOf(v, u) + ')' : ''));
      }
    });
    if (sheetHasEq(s)) out.push('', UNIT_NOTE); if (fxCount(s)) out.push('', 'ATENÇÃO: esta calculadora usa fórmulas alteradas pelo usuário (' + fxCount(s) + ').');
    out.push('', 'Wen Technology — Manual Técnico do Engenheiro');
    return out.join('\n');
  }
  function isTypRow(s, r) { return LIBSHEETS[s.num] && LIBSHEETS[s.num].typ === r.r; }
  function pickDialog(s, r) {
    var items = r.items, cur = String(cellV(s, 'C' + r.r)), cat = isTypRow(s, r), nBase = items.length;
    if (cat) { var base = items.filter(function (x) { return !/^Personalizado/.test(x); }), pers = items.filter(function (x) { return /^Personalizado/.test(x); }); items = base.concat(LIBTYPES.map(function (x) { return x[1] + ' (catálogo)'; }), pers); nBase = base.length; var le = LIBSEL[s.num] && libFind(LIBSEL[s.num].id); if (le) cur = (LIBTYPES.filter(function (x) { return x[0] === le.type; })[0] || ['', ''])[1] + ' (catálogo)'; }
    var big = items.length > 6, g = grpOfRow(r), isMat = r.dv && r.dv.ref && r.dv.ref[0] === '2.1 Materiais';
    var sub = {}; if (cat) LIBTYPES.forEach(function (x) { sub[x[1] + ' (catálogo)'] = 'Escolha o perfil na lista e as medidas vêm da tabela'; });
    if (g) groupAll(g).forEach(function (row) { sub[String(row[0])] = g.sub(row.map(fnum)); });
    if (isMat) { var mm = D.engine['2.1 Materiais']; for (var rr = 6; rr < 6 + 61 + MAT_MAX + 5; rr++) if (mm['A' + rr]) sub[String(mm['A' + rr])] = String(mm['B' + rr] || '') + ' · Sy ' + fnum(mm['G' + rr]) + ' MPa'; }
    var extra = g ? '<div class="pk-add"><button class="btn sm" data-act="grpadd" data-g="' + g.k + '">+ Cadastrar novo</button>' + ((LST[g.k] || []).length ? '<button class="btn sm" data-act="grpman" data-g="' + g.k + '">Meus (' + LST[g.k].length + ')</button>' : '') + '</div>' : isMat ? '<div class="pk-add"><button class="btn sm" data-act="matpick">+ Cadastrar / editar materiais</button></div>' : '';
    var body = (big ? '<div class="pk-fw"><label class="filter">' + ic('search', 's') + '<input type="search" placeholder="Digite para filtrar ' + items.length + ' opções" id="pk-f" autocomplete="off" enterkeyhint="search"></label></div>' : '') + extra +
      '<div role="listbox" id="pk-l">' + items.map(function (it, i) { var sb = sub[String(it)]; return '<button class="opt" role="option" data-i="' + i + '" aria-selected="' + (String(it) === cur) + '"><span>' + esc(it) + (sb ? '<small style="display:block">' + esc(sb) + '</small>' : '') + '</span>' + (String(it) === cur ? ic('check', 's') : '') + '</button>'; }).join('') + '</div><p class="muted" id="pk-none" style="padding:14px 18px" hidden>Nada encontrado.</p>';
    var sh = openSheet(txt(cellV(s, 'B' + r.r)) || 'Escolher', body, function (sh) {
      var f = $('#pk-f', sh);
      $('#pk-l', sh).addEventListener('click', function (e) {
        var b = e.target.closest('.opt'); if (!b) return;
        var ix = +b.dataset.i; buzz();
        if (cat && ix >= nBase && ix < nBase + LIBTYPES.length) { closeSheet(); setTimeout(function () { libPick(s, LIBTYPES[ix - nBase][0]); }, 260); return; }
        setInput(s, 'C' + r.r, items[ix]); closeSheet(); refreshCalc(s, true);
      });
      var mp = $('[data-act="matpick"]', sh); if (mp) mp.addEventListener('click', function () { closeSheet(true); go('s/2.1'); });
      if (f) { f.addEventListener('input', function () { var q = fold(f.value).split(/\s+/).filter(Boolean), n = 0; $$('.opt', sh).forEach(function (o) { var hide = q.length && !q.every(function (w) { return fold(o.textContent).indexOf(w) >= 0; }); o.hidden = hide; if (!hide) n++; }); $('#pk-none', sh).hidden = n > 0; }); if (matchMedia('(pointer:fine)').matches) setTimeout(function () { f.focus(); }, 300); }
      var sel = $('.opt[aria-selected="true"]', sh); if (sel) setTimeout(function () { sel.scrollIntoView({ block: 'center' }); }, 280);
    });
  }



  // ================================================================ CADASTROS PRÓPRIOS (listas, tabelas e catálogo de perfis)
  var LMAX = 80;
  var LGROUPS = [
    { k: 'rosca', t: 'Rosca métrica', cols: ['Z', 'AA', 'AB', 'AC'], head: ['Rosca', 'd (mm)', 'p (mm)', 'At (mm²)'], end: 28, sub: function (r) { return 'd ' + r[1] + ' · p ' + r[2] + ' · At ' + r[3] + ' mm²'; } },
    { k: 'classe', t: 'Classe de resistência', cols: ['AE', 'AF', 'AG', 'AH'], head: ['Classe', 'Sp (MPa)', 'Sy (MPa)', 'Sut (MPa)'], end: 12, sub: function (r) { return 'Sy ' + r[2] + ' · Sut ' + r[3] + ' MPa'; } },
    { k: 'cond', t: 'Condição do parafuso', cols: ['AM', 'AN'], head: ['Condição', 'K'], end: 6, sub: function (r) { return 'K ' + r[1]; } },
    { k: 'eletrodo', t: 'Eletrodo de solda', cols: ['AP', 'AQ', 'AR'], head: ['Eletrodo', 'Sut (MPa)', 'Sy (MPa)'], end: 7, sub: function (r) { return 'Sut ' + r[1] + ' · Sy ' + r[2] + ' MPa'; } },
    { k: 'rol', t: 'Rolamento', cols: ['AT', 'AU', 'AV', 'AW'], head: ['Rolamento', 'C (kN)', 'C0 (kN)', 'd (mm)'], end: 60, txt: [0], sub: function (r) { return 'd ' + r[3] + ' mm · C ' + r[1] + ' kN · C0 ' + r[2] + ' kN'; } },
    { k: 'corr', t: 'Corrente', cols: ['BC', 'BD', 'BE'], head: ['Corrente', 'p (mm)', 'Fu (kN)'], end: 18, sub: function (r) { return 'p ' + r[1] + ' mm · Fu ' + r[2] + ' kN'; } },
    { k: 'arame', t: 'Arame de mola', cols: ['BU', 'BV', 'BW'], head: ['Arame', 'A', 'm'], end: 7, sub: function (r) { return 'A ' + r[1] + ' · m ' + r[2]; } },
    { k: 'matusi', t: 'Material usinado', cols: ['DC', 'DD', 'DE', 'DF', 'DG'], head: ['Material', 'vc HSS torn.', 'vc MD torn.', 'vc HSS furação', 'kc (N/mm²)'], end: 9, sub: function (r) { return 'kc ' + r[4] + ' N/mm²'; } }
  ];
  var LST = LS.get('lst', {}), PTAB = LS.get('ptab', {}), LIBSEL = LS.get('lib', {});
  function grpOfRow(r) { return r && r.dv && r.dv.ref && r.dv.ref[0] === 'Listas' ? LGROUPS.filter(function (g) { return g.cols[0] === r.dv.ref[1]; })[0] : null; }
  function patchLists(sh) {
    var by = {}; LGROUPS.forEach(function (g) { g.cols.forEach(function (c) { by[c] = g; }); });
    var re = /Listas!\$([A-Z]+)\$2:\$([A-Z]+)\$(\d+)/g;
    var fix = function (v) { return v.replace(re, function (m, c1, c2, n) { var g = by[c1]; return g && by[c2] === g && +n === g.end ? 'Listas!$' + c1 + '$2:$' + c2 + '$' + (g.end + LMAX) : m; }); };
    Object.keys(sh).forEach(function (n) { if (n === 'Listas') return; var cells = sh[n]; Object.keys(cells).forEach(function (a) { var v = cells[a]; if (typeof v === 'string' && v.charAt(0) === '=' && v.indexOf('Listas!') >= 0) cells[a] = fix(v); }); });
    Object.keys(SHEETS).forEach(function (k) { var s = SHEETS[k]; s.rows && s.rows.forEach(function (r) { var g = grpOfRow(r); if (g && r.dv.ref[4] === g.end) r.dv.ref[4] = g.end + LMAX; }); });
  }
  function applyLists() {
    var L = D.engine['Listas'];
    LGROUPS.forEach(function (g) {
      var rows = LST[g.k] || [];
      for (var i = 0; i < LMAX; i++) { var r = g.end + 1 + i, row = rows[i]; g.cols.forEach(function (c, j) { var a = c + r; if (row && row[j] != null && row[j] !== '') L[a] = row[j]; else delete L[a]; }); }
    });
    if (ENG) ENG.setOpts({});
    Object.keys(SHEETS).forEach(function (k) { delete SHEETS[k]._m; });
    IDX = null;
  }
  function fnum(v) { if (v == null || v === '') return ''; return typeof v === 'number' ? fmtGrp(v, 0, 4) : String(v); }
  function rnum(x) { if (typeof x === 'number') return x; var n = parseNum(String(x == null ? '' : x)); return n == null || isNaN(n) ? null : n; }
  // formulário genérico: campos [{l, num, unit, req, v}] -> Promise-like callback
  function formSheet(title, fields, opts, onSave, onDel) {
    var h = '<div class="matform" style="padding:4px 18px 8px;display:grid;gap:10px">' + fields.map(function (f, c) {
      return '<label class="mf"><small style="display:block;font-size:.72rem;font-weight:650;color:var(--muted);margin:0 2px 4px">' + esc(f.l) + (f.req ? ' *' : '') + '</small><span class="inp"><input data-c="' + c + '" ' + (f.num ? 'inputmode="decimal"' : 'type="text"') + ' value="' + esc(f.v == null ? '' : (f.num ? numStr(f.v) : f.v)) + '" autocomplete="off"></span></label>';
    }).join('') + '<p id="mat-err" style="color:var(--err);font-size:.8rem;margin:0" hidden></p></div>' +
      '<div class="actions" style="padding:0 18px 14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" data-m="save">' + ic('check', 's') + ' Salvar</button>' + (onDel ? '<button class="btn sm" data-m="del">' + ic('trash', 's') + ' ' + (opts.delLabel || 'Excluir') + '</button>' : '') + '</div>';
    return openSheet(title, h, function (sh) {
      var err = $('#mat-err', sh);
      sh.addEventListener('click', function (e) {
        var b = e.target.closest('[data-m]'); if (!b) return;
        if (b.dataset.m === 'del') { onDel(); return; }
        var vals = [], bad = null;
        $$('input[data-c]', sh).forEach(function (inp) {
          var c = +inp.dataset.c, f = fields[c], raw = inp.value.trim();
          if (f.num) { var p = raw === '' ? null : parseNum(raw); if (raw !== '' && (p === null || isNaN(p))) bad = bad || ('Valor inválido em: ' + f.l); vals[c] = raw === '' ? null : p; }
          else vals[c] = raw;
          if (f.req && (raw === '' || vals[c] === null)) bad = bad || ('Preencha: ' + f.l);
        });
        if (!bad && opts.check) bad = opts.check(vals);
        if (bad) { err.hidden = false; err.textContent = bad; return; }
        onSave(vals);
      });
    });
  }
  // ---- listas (rosca, classe, rolamento...)
  function groupAll(g) { var L = D.engine['Listas'], out = []; for (var r = 2; r <= g.end; r++) { if (L[g.cols[0] + r] != null) out.push(g.cols.map(function (c) { return L[c + r]; })); } return out; }
  function groupEdit(g, idx) {
    var rows = LST[g.k] || [], isNew = idx >= rows.length, row = isNew ? [] : rows[idx];
    var fields = g.head.map(function (hd, j) { return { l: hd, num: j > 0 && !(g.txt && g.txt.indexOf(j) >= 0), req: true, v: row[j] }; });
    formSheet(isNew ? 'Novo: ' + g.t : String(row[0]), fields, {
      delLabel: 'Excluir', check: function (v) {
        var nm = String(v[0]).toLowerCase();
        if (groupAll(g).some(function (r) { return String(r[0]).toLowerCase() === nm && (isNew || r[0] !== row[0]); })) return 'Já existe um item com esse nome.';
        return null;
      }
    }, function (v) {
      var old = isNew ? null : row[0]; (LST[g.k] = LST[g.k] || []);
      if (isNew) LST[g.k].push(v); else LST[g.k][idx] = v;
      if (old && old !== v[0]) renameMat(old, v[0]);
      LS.set('lst', LST); applyLists(); closeSheet(); render(); toast('Salvo: já aparece na lista da calculadora');
    }, isNew ? null : function () { LST[g.k].splice(idx, 1); dropMat(row[0]); LS.set('lst', LST); applyLists(); closeSheet(); render(); toast('Item excluído'); });
  }
  function groupManage(g) {
    var rows = LST[g.k] || [];
    var body = '<div style="padding:4px 0">' + (rows.length ? rows.map(function (r, i) { return '<button class="opt" data-i="' + i + '"><span>' + esc(r[0]) + '<small style="display:block">' + esc(g.sub(r.map(fnum))) + '</small></span>' + ic('next', 's') + '</button>'; }).join('') : '<p class="muted" style="padding:10px 18px">Nenhum cadastro seu ainda.</p>') + '</div><div class="actions" style="padding:6px 18px 16px"><button class="btn pri" data-n="1">+ Cadastrar novo</button></div>';
    openSheet('Meus cadastros: ' + g.t, body, function (sh) {
      sh.addEventListener('click', function (e) { var o = e.target.closest('.opt'), n = e.target.closest('[data-n]'); if (o) groupEdit(g, +o.dataset.i); else if (n) groupEdit(g, rows.length); });
    });
  }
  // ---- linhas próprias em qualquer tabela
  function ptKey(s, bi) { return s.num + ':' + bi; }
  function ptRows(s, bi) { return PTAB[ptKey(s, bi)] || []; }
  function ptEdit(s, bi, idx) {
    var b = s.blocks[bi], rows = ptRows(s, bi), isNew = idx >= rows.length, row = isNew ? [] : rows[idx];
    var req = LIBTAB[s.num] && LIBTAB[s.num][bi] != null;
    var fields = b.heads.map(function (hd, i) { var isn = !!(b.num[i] && i > 0); return { l: hd, num: isn, req: i === 0 || (req && isn), v: row[i] == null ? '' : row[i] }; });
    formSheet(isNew ? 'Nova linha: ' + shortName(s) : String(row[0]), fields, {
      check: function (v) { var nm = String(v[0]).toLowerCase(); if (b.rows.some(function (r) { return String(r[0]).toLowerCase() === nm; }) || rows.some(function (r, i) { return i !== idx && String(r[0]).toLowerCase() === nm; })) return 'Já existe uma linha com esse nome nesta tabela.'; return null; }
    }, function (v) {
      var k = ptKey(s, bi); PTAB[k] = PTAB[k] || []; if (isNew) PTAB[k].push(v); else PTAB[k][idx] = v;
      LS.set('ptab', PTAB); LIB = null; closeSheet(); render(); toast('Linha salva');
    }, isNew ? null : function () { PTAB[ptKey(s, bi)].splice(idx, 1); LS.set('ptab', PTAB); LIB = null; closeSheet(); render(); toast('Linha excluída'); });
  }

  // ================================================================ CATÁLOGO DE PERFIS (W, U, cantoneira, tubos, barras)
  var LIBTAB = { '4.1': {}, '4.2': {}, '4.3': {}, '4.4': {} };
  var LIBTYPES = [['W', 'Perfil W / H'], ['U', 'Perfil U'], ['L', 'Cantoneira'], ['TR', 'Tubo quadrado / retangular'], ['TS', 'Tubo redondo (Schedule)'], ['BR', 'Barra redonda'], ['BQ', 'Barra quadrada']];
  var LIBSHEETS = {}, LIB = null;
  function detectLib() {
    Object.keys(SHEETS).forEach(function (n) {
      var s = SHEETS[n]; if (s.kind !== 'calc') return; var c = s.cells, typ = null, idx = null, J = null, k = null;
      Object.keys(c).forEach(function (a) { if (a.charAt(0) !== 'B') return; var v = c[a]; if (typeof v !== 'string') return; var r = +a.slice(1); if (v === 'Tipo de seção') typ = r; else if (v === 'Índice da seção') idx = r; else if (v.indexOf('Constante de torção J') === 0) J = r; else if (v.indexOf('Fator de cisalhamento') === 0) k = r; });
      if (typ && idx && J && k) LIBSHEETS[n] = { typ: typ, dims: [idx + 1, idx + 2, idx + 3, idx + 4], J: J, k: k };
    });
    // identifica os blocos de tabela que alimentam o catálogo (pelo cabeçalho)
    Object.keys(LIBTAB).forEach(function (num) {
      var s = SHEETS[num]; if (!s) return;
      s.blocks.forEach(function (b, i) { if (b.t !== 'table') return; var h0 = b.heads[0];
        if (num === '4.1' && h0 === 'Perfil') LIBTAB[num][i] = 'W';
        else if (num === '4.2' && /^Perfil/.test(h0)) LIBTAB[num][i] = 'U';
        else if (num === '4.2' && /^Cantoneira/.test(h0)) LIBTAB[num][i] = 'L';
        else if (num === '4.3' && /^Tubo/.test(h0)) LIBTAB[num][i] = 'TR';
        else if (num === '4.3' && /^Ø ou lado/.test(h0)) LIBTAB[num][i] = 'B';
        else if (num === '4.4' && h0 === 'NPS' && b.heads[2] === 'Ø externo (mm)' && /SCH/.test(b.heads[3])) LIBTAB[num][i] = 'S';
      });
    });
  }
  function libRows(num, bi) { var s = SHEETS[num]; return s.blocks[bi].rows.concat(ptRows(s, bi)); }
  function libBuild() {
    if (LIB) return LIB; var out = [], PI = Math.PI;
    var n = rnum, push = function (type, name, dims, m, A, Ix, Iy, cx, cy, J, k, cust) { if ([A, Ix, Iy, cx, cy, J, k].some(function (x) { return x == null || !isFinite(x) || x <= 0; })) return; out.push({ id: type + '|' + name, type: type, name: name, dims: dims, m: m, A: A, Ix: Ix, Iy: Iy, cx: cx, cy: cy, J: J, k: k, cust: cust }); };
    Object.keys(LIBTAB).forEach(function (num) {
      var s = SHEETS[num]; if (!s) return;
      Object.keys(LIBTAB[num]).forEach(function (bi) {
        var kind = LIBTAB[num][bi], base = s.blocks[bi].rows.length;
        libRows(num, +bi).forEach(function (r, ri) {
          var cust = ri >= base, name = String(r[0]);
          if (kind === 'W') {
            var d = n(r[2]), bf = n(r[3]), tw = n(r[4]), tf = n(r[5]), A = n(r[6]) * 100;
            push('W', name, 'd ' + fnum(d) + ' · bf ' + fnum(bf) + ' · tw ' + fnum(tw) + ' · tf ' + fnum(tf) + ' mm', n(r[1]), A, n(r[7]) * 1e4, n(r[10]) * 1e4, d / 2, bf / 2, (2 * bf * Math.pow(tf, 3) + (d - 2 * tf) * Math.pow(tw, 3)) / 3, A / (tw * d), cust);
          } else if (kind === 'U') {
            var d2 = n(r[2]), bf2 = n(r[3]), tw2 = n(r[4]), tf2 = n(r[5]), m2 = n(r[1]), A2 = m2 / 7850 * 1e6;
            var aw = tw2 * d2, af = (bf2 - tw2) * tf2, xw = tw2 / 2, xf = tw2 + (bf2 - tw2) / 2, xb = (aw * xw + 2 * af * xf) / (aw + 2 * af);
            var Iy2 = d2 * Math.pow(tw2, 3) / 12 + aw * Math.pow(xw - xb, 2) + 2 * (tf2 * Math.pow(bf2 - tw2, 3) / 12 + af * Math.pow(xf - xb, 2));
            push('U', name, 'd ' + fnum(d2) + ' · bf ' + fnum(bf2) + ' · tw ' + fnum(tw2) + ' mm', m2, A2, n(r[6]) * 1e4, Iy2, d2 / 2, Math.max(xb, bf2 - xb), (2 * bf2 * Math.pow(tf2, 3) + (d2 - 2 * tf2) * Math.pow(tw2, 3)) / 3, A2 / (tw2 * d2), cust);
          } else if (kind === 'L') {
            var b3 = n(r[1]), t3 = n(r[2]), A3 = n(r[4]) * 100, I3 = n(r[6]) * 1e4, c3 = n(r[6]) / n(r[7]) * 10;
            push('L', name, 'abas ' + fnum(b3) + ' × ' + fnum(t3) + ' mm', n(r[3]), A3, I3, I3, c3, c3, (2 * b3 - t3) * Math.pow(t3, 3) / 3, 1.5 * A3 / (b3 * t3), cust);
          } else if (kind === 'TR') {
            var H = n(r[1]), B = n(r[2]), t4 = n(r[3]), A4 = n(r[5]) * 100;
            push('TR', name, H + ' × ' + B + ' × ' + fnum(t4) + ' mm', n(r[4]), A4, n(r[6]) * 1e4, (H * Math.pow(B, 3) - (H - 2 * t4) * Math.pow(B - 2 * t4, 3)) / 12, H / 2, B / 2, 4 * Math.pow((B - t4) * (H - t4), 2) * t4 / (2 * ((B - t4) + (H - t4))), A4 / (2 * t4 * H), cust);
          } else if (kind === 'S') {
            var D = n(r[2]); if (!D) return;
            for (var j = 3; j < r.length; j++) {
              var tt = n(r[j]); if (!tt) continue;
              var lab = String(s.blocks[bi].heads[j]).replace(/\*/g, '').replace(/\s*\(.*\)/, '').trim(), di = D - 2 * tt, A5 = PI / 4 * (D * D - di * di), I5 = PI / 64 * (Math.pow(D, 4) - Math.pow(di, 4));
              push('TS', 'Tubo ' + name + ' ' + lab, 'Ø ' + fnum(D) + ' × ' + fnum(tt) + ' mm', A5 * 7.85e-3, A5, I5, I5, D / 2, D / 2, 2 * I5, 2, cust);
            }
          } else if (kind === 'B') {
            var dd = n(r[0]); if (!dd) return;
            push('BR', 'Barra redonda Ø' + fnum(dd), 'Ø ' + fnum(dd) + ' mm', PI / 4 * dd * dd * 7.85e-3, PI / 4 * dd * dd, PI / 64 * Math.pow(dd, 4), PI / 64 * Math.pow(dd, 4), dd / 2, dd / 2, PI / 32 * Math.pow(dd, 4), 4 / 3, cust);
            push('BQ', 'Barra quadrada ' + fnum(dd) + ' × ' + fnum(dd), 'lado ' + fnum(dd) + ' mm', dd * dd * 7.85e-3, dd * dd, Math.pow(dd, 4) / 12, Math.pow(dd, 4) / 12, dd / 2, dd / 2, 0.1406 * Math.pow(dd, 4), 1.5, cust);
          }
        });
      });
    });
    LIB = out; return out;
  }
  function libFind(id) { return libBuild().filter(function (e) { return e.id === id; })[0]; }
  var _libBusy = false;
  function libApply(s, e, axis) {
    var cfg = LIBSHEETS[s.num]; if (!cfg) return; _libBusy = true;
    var weak = axis === 'y', Ix = weak ? e.Iy : e.Ix, Iy = weak ? e.Ix : e.Iy, c = weak ? e.cy : e.cx;
    setInput(s, 'C' + cfg.typ, 'Personalizado (digite A, Ix, Iy, c)');
    [e.A, Ix, Iy, c].forEach(function (v, i) { setInput(s, 'C' + cfg.dims[i], +v.toPrecision(7)); });
    setInput(s, 'C' + cfg.J, +e.J.toPrecision(7)); setInput(s, 'C' + cfg.k, +e.k.toPrecision(5));
    _libBusy = false;
    LIBSEL[s.num] = { id: e.id, axis: weak ? 'y' : 'x' }; LS.set('lib', LIBSEL);
  }
  function libClear(s, keepDims) {
    var cfg = LIBSHEETS[s.num]; if (!cfg || !LIBSEL[s.num]) return; _libBusy = true;
    clearInput(s, 'C' + cfg.J); clearInput(s, 'C' + cfg.k); _libBusy = false;
    delete LIBSEL[s.num]; LS.set('lib', LIBSEL);
  }
  function libCardHtml(s) { return '<div class="libcard" id="libcard">' + libCardInner(s) + '</div>'; }
  function libCardInner(s) {
    var sel = LIBSEL[s.num], e = sel && libFind(sel.id);
    if (sel && !e) { delete LIBSEL[s.num]; sel = null; }
    var h = '<div class="lc-h">' + ic('profile', 's') + '<b>Perfil do catálogo</b><span>W, U, cantoneira, tubos, barras e os seus cadastros</span></div>';
    if (e) {
      var weak = sel.axis === 'y', Wx = (weak ? e.Iy / e.cy : e.Ix / e.cx);
      h += '<div class="lc-sel"><div class="nm">' + esc(e.name) + '</div><div class="pr"><span><small>Massa</small>' + fnum(+e.m.toFixed(2)) + ' kg/m</span><span><small>A</small>' + fnum(+(e.A / 100).toFixed(2)) + ' cm²</span><span><small>I (flexão)</small>' + fnum(+((weak ? e.Iy : e.Ix) / 1e4).toFixed(1)) + ' cm⁴</span><span><small>W</small>' + fnum(+(Wx / 1e3).toFixed(1)) + ' cm³</span></div>' +
        axisHelp(weak) +
        '<div class="actions"><button class="btn sm" data-act="libopen">' + ic('swap', 's') + ' Trocar perfil</button><button class="btn sm" data-act="libclear">' + ic('close', 's') + ' Remover</button></div></div>';
    } else h += '<div class="actions"><button class="btn pri" data-act="libopen">' + ic('search', 's') + ' Escolher perfil</button></div><p class="hint">Preenche área, inércias, distância à fibra, J e k automaticamente.</p>';
    return h;
  }

  function axisSvg(weak) {
    var st = 'fill="currentColor"', c = 'var(--accent)';
    var sh = weak ? '<rect x="8" y="26" width="46" height="5" ' + st + ' rx="1"/><rect x="8" y="9" width="46" height="5" ' + st + ' rx="1"/><rect x="29" y="14" width="5" height="12" ' + st + '/>' : '<rect x="20" y="6" width="5" height="48" ' + st + ' rx="1"/><rect x="39" y="6" width="5" height="48" ' + st + ' rx="1"/><rect x="25" y="28" width="14" height="5" ' + st + '/>';
    var h = weak ? '<g transform="translate(0,30)"><g transform="rotate(0)"></g></g>' : '';
    return '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' + (weak ? '<g transform="rotate(90 32 32)">' + '<rect x="12" y="8" width="40" height="5" ' + st + ' rx="1"/><rect x="12" y="51" width="40" height="5" ' + st + ' rx="1"/><rect x="29.5" y="13" width="5" height="38" ' + st + '/></g>' : '<rect x="12" y="8" width="40" height="5" ' + st + ' rx="1"/><rect x="12" y="51" width="40" height="5" ' + st + ' rx="1"/><rect x="29.5" y="13" width="5" height="38" ' + st + '/>') +
      '<path d="M32 0 V6 M29 3 L32 6 L35 3" stroke="' + c + '" stroke-width="1.6" fill="none" stroke-linecap="round" transform="' + (weak ? 'rotate(0)' : '') + '"/></svg>';
  }
  function axisHelp(weak) {
    return '<div class="axhelp"><div class="ax-t">Como o perfil trabalha?</div><div class="ax-g" role="group">' +
      '<button data-act="libaxis" data-v="x" aria-pressed="' + !weak + '"><span class="axi">' + axisSvg(false) + '</span><b>Em pé</b><small>A carga atua na direção da altura (o uso normal de uma viga). Usa o eixo forte x: Ix, o maior momento de inércia.</small></button>' +
      '<button data-act="libaxis" data-v="y" aria-pressed="' + weak + '"><span class="axi">' + axisSvg(true) + '</span><b>Deitado</b><small>A carga atua na direção da largura (perfil girado 90°). Usa o eixo fraco y: Iy, bem menor, então flete mais e resiste menos.</small></button></div>' +
      '<p class="hint">Na dúvida, deixe <b>Em pé</b>. Em coluna (flambagem) o cálculo usa sempre o menor I, então essa escolha não muda o resultado.</p></div>';
  }
  function libRefresh(s) { var el = $('#libcard'); if (el) el.innerHTML = libCardInner(s); refreshCalc(s, true); }
  function libPick(s, ty0) {
    var all = libBuild(), ty = ty0 || 'all', q = [], shown = 60, cur = LIBSEL[s.num] && LIBSEL[s.num].id;
    var counts = {}; all.forEach(function (e) { counts[e.type] = (counts[e.type] || 0) + 1; });
    var chips = '<div class="chips lc-chips"><button class="chip' + (ty === 'all' ? ' on' : '') + '" data-ty="all">Todos</button>' + LIBTYPES.filter(function (x) { return counts[x[0]]; }).map(function (x) { return '<button class="chip' + (ty === x[0] ? ' on' : '') + '" data-ty="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '<button class="chip" data-ty="cust">Meus</button></div>';
    var body = '<div class="pk-fw"><label class="filter">' + ic('search', 's') + '<input type="search" id="lp-q" placeholder="Digite: W310, 200x100, U 6, tubo 2 SCH40…" autocomplete="off" enterkeyhint="search"></label></div>' + chips + '<div id="lp-l" role="listbox"></div><div id="lp-m" class="actions" style="padding:8px 18px" hidden><button class="btn sm" data-more="1">Mostrar mais</button></div>' +
      '<p class="hint" style="padding:6px 18px 14px">Não achou? Cadastre o seu em <a data-go="4.1" href="#/s/4.1">4.1 W</a> · <a data-go="4.2" href="#/s/4.2">4.2 U/L</a> · <a data-go="4.3" href="#/s/4.3">4.3 tubos</a> · <a data-go="4.4" href="#/s/4.4">4.4 Schedule</a>.</p>';
    openSheet('Perfil do catálogo', body, function (sh) {
      var list = $('#lp-l', sh), more = $('#lp-m', sh), inp = $('#lp-q', sh);
      if (!sh._n) all.forEach(function (e) { e._s = fold(e.name + ' ' + e.dims + ' ' + (LIBTYPES.filter(function (x) { return x[0] === e.type; })[0] || ['', ''])[1] + ' ' + e.type + ' ' + fnum(e.m)); });
      function draw() {
        var res = all.filter(function (e) { return (ty === 'all' || (ty === 'cust' ? e.cust : e.type === ty)) && q.every(function (w) { return e._s.indexOf(w) >= 0; }); });
        list.innerHTML = res.slice(0, shown).map(function (e) { return '<button class="opt lib" role="option" data-id="' + esc(e.id) + '" aria-selected="' + (e.id === cur) + '"><span><b>' + esc(e.name) + '</b><small style="display:block">' + esc(e.dims) + ' · ' + fnum(+e.m.toFixed(2)) + ' kg/m · Ix ' + fnum(+(e.Ix / 1e4).toFixed(1)) + ' cm⁴ · Wx ' + fnum(+(e.Ix / e.cx / 1e3).toFixed(1)) + ' cm³</small></span>' + (e.id === cur ? ic('check', 's') : '') + '</button>'; }).join('') || '<p class="muted" style="padding:14px 18px">Nada encontrado. Tente outras palavras.</p>';
        more.hidden = res.length <= shown; if (!more.hidden) $('[data-more]', more).textContent = 'Mostrar mais (' + (res.length - shown) + ')';
      }
      sh.addEventListener('click', function (e) {
        var c = e.target.closest('[data-ty]'), o = e.target.closest('.opt'), m = e.target.closest('[data-more]'), a = e.target.closest('a[data-go]');
        if (c) { ty = c.dataset.ty; $$('.lc-chips .chip', sh).forEach(function (x) { x.classList.toggle('on', x === c); }); shown = 60; draw(); }
        else if (m) { shown += 80; draw(); }
        else if (a) { closeSheet(); }
        else if (o) { var en = libFind(o.dataset.id); if (en) { libApply(s, en, (LIBSEL[s.num] && LIBSEL[s.num].axis) || 'x'); buzz(); closeSheet(); libRefresh(s); toast('Perfil aplicado: ' + en.name); } }
      });
      inp.addEventListener('input', function () { q = fold(inp.value).split(/\s+/).filter(Boolean); shown = 60; draw(); });
      draw(); if (matchMedia('(pointer:fine)').matches) setTimeout(function () { inp.focus(); }, 300);
    });
  }


  // ---------------------------------------------------------------- PRESETS (campos preenchidos a partir das tabelas)
  function blk(num, re0, test) { var s = SHEETS[num]; if (!s) return null; for (var i = 0; i < s.blocks.length; i++) { var b = s.blocks[i]; if (b.t === 'table' && re0.test(b.heads[0]) && (!test || test(b))) return { s: s, bi: i, b: b, rows: b.rows.concat(ptRows(s, i)) }; } return null; }
  function pBars() { var k = blk('4.3', /^Ø ou lado/), n = rnum; if (!k) return []; return k.rows.map(function (r) { var d = n(r[0]); return d ? { name: 'Barra redonda Ø' + fnum(d), sub: 'Ø ' + fnum(d) + ' mm · ' + fnum(n(r[1])) + ' kg/m', D: d, t: 0 } : null; }).filter(Boolean); }
  function pSch() { var k = blk('4.4', /^NPS$/, function (b) { return b.heads[2] === 'Ø externo (mm)'; }), n = rnum, out = []; if (!k) return out; k.rows.forEach(function (r) { var D = n(r[2]); if (!D) return; for (var j = 3; j < r.length; j++) { var t = n(r[j]); if (!t) continue; var lab = String(k.b.heads[j]).replace(/\*/g, '').replace(/\s*\(.*\)/, '').trim(); out.push({ name: 'Tubo ' + r[0] + ' ' + lab, sub: 'Ø ' + fnum(D) + ' × ' + fnum(t) + ' mm (DN ' + r[1] + ')', D: D, t: t }); } }); return out; }
  function pTR() { var k = blk('4.3', /^Tubo/), n = rnum; if (!k) return []; return k.rows.map(function (r) { var H = n(r[1]), B = n(r[2]), t = n(r[3]); return H && B && t ? { name: 'Tubo ' + r[0], sub: H + ' × ' + B + ' × ' + fnum(t) + ' mm', H: H, B: B, t: t } : null; }).filter(Boolean); }
  var PRESETS = {
    '3.4': [{ at: 27, title: 'Eixo ou tubo da tabela', hint: 'Preenche D e d (barra redonda ou tubo Schedule).', srcs: [
      { ch: 'Barras', items: function () { return pBars().map(function (x) { x.vals = { 27: x.D, 28: 0 }; return x; }); } },
      { ch: 'Tubos Schedule', items: function () { return pSch().map(function (x) { x.vals = { 27: x.D, 28: +(x.D - 2 * x.t).toFixed(3) }; return x; }); } }] }],
    '3.9': [{ at: 20, title: 'Tubo da tabela Schedule', hint: 'Preenche Di e espessura t.', srcs: [
      { ch: 'Tubos Schedule', items: function () { return pSch().map(function (x) { x.vals = { 20: +(x.D - 2 * x.t).toFixed(3), 21: x.t }; return x; }); } }] }],
    '3.10': [{ at: 27, title: 'Eixo da tabela', hint: 'Preenche d (e Ø interno, se tubo).', srcs: [
      { ch: 'Barras', items: function () { return pBars().map(function (x) { x.vals = { 27: x.D, 28: 0 }; return x; }); } },
      { ch: 'Tubos Schedule', items: function () { return pSch().map(function (x) { x.vals = { 27: x.D, 28: +(x.D - 2 * x.t).toFixed(3) }; return x; }); } }] }],
    '6.4': [{ at: 25, title: 'Chaveta normalizada (DIN 6885)', hint: 'Escolhe b, h e t₁ pelo diâmetro do eixo.', srcs: [
      { ch: 'Chavetas', items: function () { var k = blk('6.3', /^Ø eixo/), n = rnum; if (!k) return []; return k.rows.map(function (r) { var b = n(r[1]), h = n(r[2]), t1 = n(r[3]); return b && h ? { name: 'Eixo ' + r[0] + ' mm  →  ' + b + ' × ' + h, sub: 'b ' + fnum(b) + ' · h ' + fnum(h) + ' · t₁ ' + fnum(t1) + ' mm', rng: String(r[0]), vals: { 25: b, 26: h, 27: t1 } } : null; }).filter(Boolean); } }] }],
    '6.8': [{ at: 20, title: 'Módulo normalizado (ISO 54)', hint: 'Série 1 é a preferencial.', srcs: [
      { ch: 'Série 1', items: function () { var k = blk('6.7', /^Série 1/); if (!k) return []; return k.rows.map(function (r) { var m = rnum(r[0]); return m ? { name: 'm = ' + fnum(m), sub: 'passo ' + r[3] + ' mm', vals: { 20: m } } : null; }).filter(Boolean); } },
      { ch: 'Série 2', items: function () { var k = blk('6.7', /^Série 1/); if (!k) return []; return k.rows.map(function (r) { var m = rnum(r[1]); return m ? { name: 'm = ' + fnum(m), sub: 'série 2', vals: { 20: m } } : null; }).filter(Boolean); } }] }],
    '8.5': [{ at: 7, title: 'Espessura de chapa da tabela', hint: 'Bitolas e espessuras comerciais.', srcs: [
      { ch: 'Chapas', items: function () { var k = blk('4.3', /^Bitola/); if (!k) return []; return k.rows.map(function (r) { var t = rnum(r[1]); return t ? { name: String(r[0]), sub: 't = ' + fnum(t) + ' mm', vals: { 7: t } } : null; }).filter(Boolean); } }] }],
    '9.3': [{ at: 7, title: 'Cilindro padronizado', hint: 'Preenche Ø do êmbolo e Ø da haste.', srcs: [
      { ch: 'Pneumático', items: function () { var k = blk('9.1', /^Ø êmbolo/); if (!k) return []; return k.rows.map(function (r) { var D = rnum(r[0]), d = rnum(r[1]); return D && d ? { name: 'Ø' + fnum(D) + ' / haste ' + fnum(d), sub: String(r[3] || ''), vals: { 7: D, 8: d } } : null; }).filter(Boolean); } },
      { ch: 'Hidráulico', items: function () { var k = blk('9.2', /^Ø êmbolo/); if (!k) return []; return k.rows.map(function (r) { var D = rnum(r[0]), d = rnum(r[1]); return D && d ? { name: 'Ø' + fnum(D) + ' / haste ' + fnum(d), sub: 'haste fina', vals: { 7: D, 8: d } } : null; }).filter(Boolean); } }] }],
    '10.3': [{ at: 8, title: 'Motor IEC da tabela', hint: 'Preenche a potência mecânica (kW).', srcs: [
      { ch: 'Motores', items: function () { var k = blk('10.1', /^Carcaça/); if (!k) return []; return k.rows.map(function (r) { var kw = rnum(r[2]); return kw ? { name: 'Carcaça ' + r[0] + ' · ' + fnum(kw) + ' kW', sub: r[3] + ' CV · In ' + r[6] + ' A (380 V)', vals: { 8: kw } } : null; }).filter(Boolean); } }] },
      { at: 12, title: 'Rotação nominal da tabela', hint: 'Por número de polos, 60 Hz.', srcs: [
      { ch: 'Polos', items: function () { var k = blk('10.1', /^Polaridade/); if (!k) return []; return k.rows.map(function (r) { var n = rnum(String(r[2]).split(/[–-]/)[0]); return n ? { name: r[0] + ' · ' + r[2] + ' rpm', sub: 'síncrona ' + r[1] + ' rpm', vals: { 12: n } } : null; }).filter(Boolean); } }] }]
  };

  function barsAt(row) { return { ch: 'Barras', items: function () { return pBars().map(function (x) { var v = {}; v[row] = x.D; x.vals = v; return x; }); } }; }
  function chapaAt(row) { return { ch: 'Chapas', items: function () { var k = blk('4.3', /^Bitola/); if (!k) return []; return k.rows.map(function (r) { var t = rnum(r[1]); if (!t) return null; var v = {}; v[row] = t; return { name: String(r[0]), sub: 't = ' + fnum(t) + ' mm', vals: v }; }).filter(Boolean); } }; }
  PRESETS['3.3'] = [{ at: 25, title: 'Critério da flecha admissível (L ÷ N)', hint: 'Escolha o divisor N. Para uma flecha fixa em mm, use Editar fórmulas e troque a fórmula de "Flecha admissível".', srcs: [{ ch: 'Critérios usuais', items: function () { return [[800, 'rigoroso (padrão desta calculadora)'], [500, 'equipamento sensível'], [360, 'pisos'], [300, 'estruturas em geral'], [250, 'uso geral'], [100, 'mínimo aceito (balanços, só informativo)']].map(function (x) { return { name: 'L ÷ ' + x[0], sub: x[1], vals: { 25: x[0] } }; }); } }] }];
  PRESETS['3.7'] = [{ at: 20, title: 'Diâmetro de barra da tabela', hint: 'Diâmetros comerciais de barras redondas.', srcs: [barsAt(20)] }];
  PRESETS['3.8'] = [{ at: 8, title: 'Diâmetro de barra da tabela', hint: 'Diâmetros comerciais de barras redondas.', srcs: [barsAt(8)] }];
  PRESETS['7.2'] = [{ at: 7, title: 'Diâmetro nominal da tabela', hint: 'Diâmetros comerciais de barras e pinos.', srcs: [barsAt(7), { ch: 'Pinos e furos', items: function () { var k = blk('5.9', /^Ø nominal/); if (!k) return []; return k.rows.map(function (r) { var d = rnum(r[0]); return d ? { name: 'Ø ' + fnum(d) + ' mm', sub: 'pinos e furos normalizados', vals: { 7: d } } : null; }).filter(Boolean); } }] }];
  PRESETS['8.2'] = [{ at: 10, title: 'Diâmetro da tabela', hint: 'Diâmetros comerciais de barras redondas.', srcs: [barsAt(10)] }];
  PRESETS['8.4'] = [{ at: 25, title: 'Espessura de chapa da tabela', hint: 'Bitolas e espessuras comerciais.', srcs: [chapaAt(25)] }];
  PRESETS['6.6'] = (PRESETS['6.6'] || []).concat([{ at: 9, title: 'Perfil de correia (Ø mínimo da polia)', hint: 'Preenche o Ø da polia menor com o mínimo do perfil.', srcs: [{ ch: 'Correias V', items: function () { var k = blk('6.5', /^Perfil$/); if (!k) return []; return k.rows.map(function (r) { var d = rnum(r[5]); return d ? { name: 'Perfil ' + r[0] + ' (' + r[1] + ')', sub: 'Ø mín. polia ' + fnum(d) + ' mm · ' + r[6], vals: { 9: d } } : null; }).filter(Boolean); } }] }]);
  PRESETS['6.2'] = [{ at: 8, title: 'Capacidade de carga da tabela', hint: 'Escolhe um rolamento de outra família e preenche C (kN).', srcs: [{ ch: 'Rolos / outros', items: function () { var out = []; [10, 12, 14, 16].forEach(function (bi) { var s6 = SHEETS['6.1'], b = s6 && s6.blocks[bi]; if (!b || b.t !== 'table') return; var ci = -1; b.heads.forEach(function (h, i) { if (/^C \(kN\)/.test(h)) ci = i; }); if (ci < 0) return; b.rows.concat(ptRows(s6, bi)).forEach(function (r) { var c = rnum(r[ci]); if (c) out.push({ name: String(r[0]), sub: 'd ' + r[1] + ' · D ' + r[2] + ' · C ' + fnum(c) + ' kN', vals: { 8: c } }); }); }); return out; } }] }];
  var PSEL = LS.get('psel', {});
  function preCards(s, r) { var a = PRESETS[s.num]; if (!a) return ''; var h = ''; a.forEach(function (p, i) { if (p.at === r) { var cur = PSEL[s.num + '|' + i]; h += '<div class="libcard pre"><div class="lc-h">' + ic('profile', 's') + '<b>' + esc(p.title) + '</b><span>' + esc(p.hint) + '</span></div>' + '<div class="nm" style="font-weight:700"' + (cur ? '' : ' hidden') + '>' + esc(cur || '') + '</div>' + '<div class="actions"><button class="btn pri" data-act="preopen" data-p="' + i + '">' + ic('search', 's') + (cur ? ' Trocar' : ' Escolher da tabela') + '</button></div></div>'; } }); return h; }
  function prePick(s, i, card) {
    var p = PRESETS[s.num][i], sr = 0, q = [], shown = 80, cache = {};
    function items() { if (!cache[sr]) { cache[sr] = p.srcs[sr].items(); cache[sr].forEach(function (e) { e._s = fold(e.name + ' ' + e.sub); }); } return cache[sr]; }
    var chips = p.srcs.length > 1 ? '<div class="chips lc-chips">' + p.srcs.map(function (x, k) { return '<button class="chip' + (k ? '' : ' on') + '" data-sr="' + k + '">' + esc(x.ch) + '</button>'; }).join('') + '</div>' : '';
    var body = '<div class="pk-fw"><label class="filter">' + ic('search', 's') + '<input type="search" id="pp-q" placeholder="Digite para filtrar…" autocomplete="off" enterkeyhint="search"></label></div>' + chips + '<div id="pp-l" role="listbox"></div><div id="pp-m" class="actions" style="padding:8px 18px" hidden><button class="btn sm" data-more="1">Mostrar mais</button></div>';
    openSheet(p.title, body, function (sh) {
      var list = $('#pp-l', sh), more = $('#pp-m', sh), inp = $('#pp-q', sh), d0 = s.num === '6.4' ? rnum(ENG.cell(s.name, 'C21')) : null, res = [];
      function draw() {
        res = items().filter(function (e) { return q.every(function (w) { return e._s.indexOf(w) >= 0; }); });
        if (d0) res = res.slice().sort(function (a, b) { return (b.hit ? 1 : 0) - (a.hit ? 1 : 0); });
        list.innerHTML = res.slice(0, shown).map(function (e, k) {
          var hit = false; if (d0 && e.rng) { var m = e.rng.split(/[–-]/); hit = d0 > +String(m[0]).replace(',', '.') && d0 <= +String(m[1]).replace(',', '.'); }
          return '<button class="opt lib" role="option" data-k="' + k + '"><span><b>' + esc(e.name) + '</b><small style="display:block">' + esc(e.sub) + (hit ? ' · serve para d = ' + fnum(d0) + ' mm' : '') + '</small></span></button>';
        }).join('') || '<p class="muted" style="padding:14px 18px">Nada encontrado.</p>';
        more.hidden = res.length <= shown;
      }
      sh.addEventListener('click', function (ev) {
        var c = ev.target.closest('[data-sr]'), o = ev.target.closest('.opt'), m = ev.target.closest('[data-more]');
        if (c) { sr = +c.dataset.sr; $$('.lc-chips .chip', sh).forEach(function (x) { x.classList.toggle('on', x === c); }); shown = 80; draw(); }
        else if (m) { shown += 120; draw(); }
        else if (o) { var e = res[+o.dataset.k]; if (e) { Object.keys(e.vals).forEach(function (r) { setInput(s, 'C' + r, e.vals[r]); }); PSEL[s.num + '|' + i] = e.name; LS.set('psel', PSEL); if (card) { var nm = $('.nm', card); nm.textContent = e.name; nm.hidden = false; var bt = $('[data-act=preopen]', card); bt.innerHTML = ic('search', 's') + ' Trocar'; } buzz(); closeSheet(); refreshCalc(s, true); toast('Aplicado: ' + e.name); } }
      });
      inp.addEventListener('input', function () { q = fold(inp.value).split(/\s+/).filter(Boolean); shown = 80; draw(); });
      draw();
    });
  }

  // ---------------------------------------------------------------- BUSCA
  var IDX = null;
  function buildIndex() {
    if (IDX) return IDX; IDX = [];
    Object.keys(SHEETS).forEach(function (k) {
      var s = SHEETS[k], c = chOf(k);
      IDX.push({ s: k, ty: 'sheet', t: s.name, d: s.desc, f: fold(s.name + ' ' + s.desc + ' ' + (s.title || '') + ' ' + c.title) });
      if (s.kind === 'calc') {
        calcModel(s).forEach(function (r) { if (r.k === 'f' || r.k === 'note') { var l = txt(ENG.cell(s.name, 'B' + r.r)), n = txt(ENG.cell(s.name, 'E' + r.r)); if (l) IDX.push({ s: k, ty: 'calc', t: l, d: n, f: fold(l + ' ' + n + ' ' + s.name) }); } });
      } else {
        var sec = '';
        s.blocks.forEach(function (b, bi) {
          if (b.t === 'sec') sec = b.text;
          else if (b.t === 'note') IDX.push({ s: k, ty: 'note', t: b.text, d: '', sec: sec, f: fold(b.text + ' ' + s.name) });
          else if (b.t === 'table') b.rows.forEach(function (r, ri) { IDX.push({ s: k, ty: 'row', b: bi, r: ri, t: r[0] || r[1] || '', d: r.slice(1).filter(Boolean).join(' · '), sec: sec, f: fold(r.join(' ') + ' ' + s.name + ' ' + sec) }); });
        });
      }
    });
    return IDX;
  }
  function vSearch(q) {
    return '<div class="sbox"><label class="filter">' + ic('search') + '<input id="q" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Buscar em todas as abas…" value="' + esc(q) + '" aria-label="Buscar"><button class="ibtn" data-act="qclear" aria-label="Limpar" style="width:40px;height:40px">' + ic('close', 's') + '</button></label></div>' +
      '<div class="chips" id="sfilters" style="margin-top:2px"><button class="chip on" data-act="sf" data-v="all">Tudo</button><button class="chip" data-act="sf" data-v="calc">Calculadoras</button><button class="chip" data-act="sf" data-v="tab">Tabelas</button></div><div id="sres"></div>';
  }
  var sFilter = 'all';
  function bindSearch(q0) {
    var inp = $('#q'), t;
    var run = function () {
      var q = inp.value.trim(), res = $('#sres'); var terms = fold(q).split(/\s+/).filter(Boolean);
      history.replaceState(null, '', '#/search' + (q ? '?q=' + encodeURIComponent(q) : ''));
      if (!terms.length) {
        res.innerHTML = '<div class="sect-t">Sugestões</div><div class="suggest">' + ['M12', '6205', 'H7/g6', 'SAE 4140', 'o-ring', 'chaveta', 'torque', 'NPT', 'W200', 'solda', 'inox', 'flambagem', 'engrenagem', 'cisalhamento'].map(function (x) { return '<button class="chip" data-act="sug" data-q="' + x + '">' + x + '</button>'; }).join('') + '</div>' +
          '<p class="footnote">A busca ignora maiúsculas e acentos e vasculha todas as tabelas, calculadoras e notas. Use mais de um termo para refinar (ex.: <b>M12 torque</b>).</p>'; return;
      }
      var idx = buildIndex(), out = [];
      for (var i = 0; i < idx.length && out.length < 400; i++) {
        var e = idx[i]; if (sFilter === 'calc' && SHEETS[e.s].kind !== 'calc') continue; if (sFilter === 'tab' && SHEETS[e.s].kind === 'calc') continue;
        var ok = true; for (var j = 0; j < terms.length; j++) if (e.f.indexOf(terms[j]) < 0) { ok = false; break; }
        if (ok) { var sc = e.ty === 'sheet' ? 0 : 1; if (fold(e.t).indexOf(terms[0]) === 0) sc -= .5; out.push({ e: e, sc: sc, i: i }); }
      }
      out.sort(function (a, b) { return a.sc - b.sc || a.i - b.i; });
      if (!out.length) { res.innerHTML = '<div class="empty">Nenhum resultado para “' + esc(q) + '”.</div>'; return; }
      res.innerHTML = '<div class="sect-t">' + out.length + (out.length >= 400 ? '+' : '') + ' resultado(s)</div><div class="card list">' + out.slice(0, 200).map(function (o) {
        var e = o.e, s = SHEETS[e.s], tag = e.ty === 'sheet' ? 'Aba' : e.ty === 'calc' ? 'Campo' : e.ty === 'note' ? 'Nota' : 'Linha';
        var href = e.ty === 'row' ? e.s + '?b=' + e.b + '&r=' + e.r : e.s;
        return '<button class="res-sheet" data-act="goresult" data-go="s/' + href + '"><div class="path"><span class="badge ' + (s.kind === 'calc' ? 'calc' : '') + '">' + tag + '</span>' + esc(s.num + ' ' + shortName(s)) + (e.sec ? ' › ' + esc(e.sec.slice(0, 40)) : '') + '</div><b>' + hi(e.t, terms) + '</b>' + (e.d ? '<small>' + hi(e.d.slice(0, 160), terms) + '</small>' : '') + '</button>';
      }).join('') + '</div>';
    };
    inp.addEventListener('input', function () { clearTimeout(t); t = setTimeout(run, 110); });
    $$('#sfilters .chip').forEach(function (c) { c.classList.toggle('on', c.dataset.v === sFilter); });
    run(); if (!q0) setTimeout(function () { inp.focus(); }, 60);
  }

  // ---------------------------------------------------------------- PAINEL
  function panelChecks() {
    return D.panel.map(function (p) {
      var val = p.val && ENG.cell(p.val[0], p.val[1]), req = p.req && ENG.cell(p.req[0], p.req[1]), st = p.st && ENG.cell(p.st[0], p.st[1]);
      var ok = typeof st === 'string' ? (st.indexOf('✓') === 0 ? true : st.indexOf('✗') === 0 ? false : null) : null;
      return { p: p, val: val, req: req, st: st, ok: ok };
    });
  }
  function vPanel() {
    var ch = panelChecks(), bad = ch.filter(function (c) { return c.ok === false; }).length, good = ch.filter(function (c) { return c.ok === true; }).length;
    var h = topbar('Painel de verificações', { kicker: 'Resumo' });
    h += '<div class="card" style="padding:14px;margin-top:8px"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:1.4rem">' + good + '<span class="muted" style="font-size:.9rem;font-weight:600"> / ' + ch.length + ' aprovadas</span></b>' + (bad ? '<span class="status err">' + ic('errc') + bad + ' reprovada(s)</span>' : '<span class="status ok">' + ic('okc') + 'Tudo aprovado</span>') + '</div><div class="bar"><i style="width:' + (ch.length ? good / ch.length * 100 : 0) + '%"></i></div><p class="muted" style="font-size:.76rem;margin-top:8px">Atualiza sozinho com os dados de cada calculadora. Toque em uma linha para abrir.</p></div>';
    h += '<div class="card list" style="margin-top:12px">' + ch.map(function (c) {
      var f = function (v) { return typeof v === 'number' ? Engine.fmtNum(v, '0.00', S.comma) : '—'; };
      return '<button class="pn-row" data-act="open" data-num="' + c.p.num + '"><div class="tx"><b>' + esc(c.p.label) + '</b><small>' + esc(c.p.sheet) + '</small></div><div class="fs"><b>' + f(c.val) + '</b><br>req. ' + f(c.req) + '</div>' + (c.ok === null ? '<span class="badge">—</span>' : '<span class="status ' + (c.ok ? 'ok' : 'err') + '">' + ic(c.ok ? 'okc' : 'errc') + (c.ok ? 'OK' : 'Falha') + '</span>') + '</button>';
    }).join('') + '</div>';
    return h;
  }

  // ---------------------------------------------------------------- CONFIGURAÇÕES
  var deferredInstall = null;
  function isStandalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  var ACC = [['blue', '#1F5FBF', 'Azul Wen'], ['cyan', '#0A7F9B', 'Ciano'], ['green', '#1B7F4C', 'Verde'], ['amber', '#C77700', 'Âmbar'], ['violet', '#6B46C1', 'Violeta'], ['graphite', '#3F4A5C', 'Grafite'], ['red', '#B3363F', 'Vermelho']];
  function tog(id, on) { return '<button class="sw-toggle" role="switch" aria-checked="' + !!on + '" data-act="tog" data-k="' + id + '" aria-label="' + id + '"></button>'; }
  function vSettings() {
    var h = topbar('Configurações', { back: false });
    h += '<div class="sect-t">Instalação</div><div class="card set">' +
      (isStandalone() ? '<div class="set-r"><span class="ico">' + ic('okc') + '</span><div class="tx"><b>App instalado</b><small>Você está usando a versão instalada, em tela cheia e offline.</small></div></div>'
        : '<div class="set-r"><span class="ico">' + ic('download') + '</span><div class="tx"><b>Instalar no celular</b><small>Cria o ícone na tela inicial e abre como um aplicativo, mesmo sem internet.</small></div><button class="btn pri sm" data-act="install">Instalar</button></div>') + '</div>';
    h += '<div class="sect-t">Aparência</div><div class="card set"><div class="set-r col"><div class="hd"><span class="ico">' + ic('sun') + '</span><div class="tx"><b>Tema</b><small>Automático acompanha o sistema do aparelho</small></div></div><div class="themes">' +
      [['auto', 'auto', 'Auto'], ['light', 'sun', 'Claro'], ['dark', 'moon', 'Escuro'], ['black', 'black', 'Preto']].map(function (t) { return '<button class="thm" data-act="theme" data-v="' + t[0] + '" aria-pressed="' + (S.theme === t[0]) + '">' + ic(t[1]) + t[2] + '</button>'; }).join('') + '</div></div>' +
      '<div class="set-r col"><div class="hd"><span class="ico">' + ic('layers') + '</span><div class="tx"><b>Cor de destaque</b><small id="accname">' + ACC.filter(function (a) { return a[0] === S.accent; })[0][2] + '</small></div></div><div class="swatches">' + ACC.map(function (a) { return '<button class="sw-btn" style="background:' + a[1] + '" data-act="accent" data-v="' + a[0] + '" aria-label="' + a[2] + '" aria-pressed="' + (S.accent === a[0]) + '">' + ic('check') + '</button>'; }).join('') + '</div></div>' +
      '<div class="set-r col"><div class="hd"><span class="ico">' + ic('textsize') + '</span><div class="tx"><b>Tamanho do texto</b><small>Ajuste para leitura confortável na oficina ou no campo</small></div></div><input class="range" type="range" min="0" max="3" step="1" value="' + ['s', 'm', 'l', 'xl'].indexOf(S.fs) + '" data-act="fs" aria-label="Tamanho do texto"><div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--text2)"><span>Pequeno</span><span>Normal</span><span>Grande</span><span>Extra</span></div></div>' +
      '<div class="set-r"><span class="ico">' + ic('density') + '</span><div class="tx"><b>Densidade compacta</b><small>Mais linhas por tela em tabelas e calculadoras</small></div>' + tog('dens', S.dens === 'compact') + '</div></div>';
    h += '<div class="sect-t">Cálculos</div><div class="card set"><div class="set-r col"><div class="hd"><span class="ico">' + ic('gauge') + '</span><div class="tx"><b>Fator de segurança global</b><small>Usado como FS requerido padrão nas calculadoras (ainda dá para ajustar em cada uma)</small></div></div><div class="ctl" style="margin:0"><label class="inp"><input id="fsg" inputmode="decimal" value="' + numStr(S.fsGlobal) + '" data-act="fsg" aria-label="FS global"><span class="u">FS</span></label></div></div>' +
      '<div class="set-r"><span class="ico">' + ic('list') + '</span><div class="tx"><b>Vírgula como separador decimal</b><small>Desligue para usar ponto (1.234,5 vira 1,234.5)</small></div>' + tog('comma', S.comma) + '</div></div>';
    h += '<div class="sect-t">Dispositivo</div><div class="card set">' +
      '<div class="set-r"><span class="ico">' + ic('vibrate') + '</span><div class="tx"><b>Resposta tátil</b><small>Vibração leve ao tocar em ações</small></div>' + tog('haptic', S.haptic) + '</div>' +
      '<div class="set-r"><span class="ico">' + ic('sun') + '</span><div class="tx"><b>Manter a tela ligada</b><small>Evita apagar enquanto você consulta ou calcula</small></div>' + tog('wake', S.wake) + '</div>' +
      '<div class="set-r"><span class="ico">' + ic('clock') + '</span><div class="tx"><b>Continuar de onde parei</b><small>Reabre a última aba usada ao abrir o app</small></div>' + tog('resume', S.resume) + '</div>' +
      '<div class="set-r"><span class="ico">' + ic('fold') + '</span><div class="tx"><b>Reduzir animações</b><small>Desliga transições e a animação de abertura</small></div>' + tog('motion', S.motion === 'off') + '</div>' +
      '<div class="set-r"><span class="ico">' + ic('cpu') + '</span><div class="tx"><b>Tela atual</b><small id="scrinfo"></small></div></div></div>';
    h += '<div class="sect-t">Dados</div><div class="card set"><div class="set-r"><span class="ico">' + ic('download') + '</span><div class="tx"><b>Exportar backup</b><small>Preferências, favoritos e valores das calculadoras</small></div><button class="btn sm" data-act="export">Exportar</button></div>' +
      '<div class="set-r"><span class="ico">' + ic('upload') + '</span><div class="tx"><b>Importar backup</b><small>Restaura um arquivo exportado antes</small></div><button class="btn sm" data-act="import">Importar</button></div>' +
      '<div class="set-r"><span class="ico">' + ic('trash') + '</span><div class="tx"><b>Apagar tudo</b><small>Volta o app ao estado original</small></div><button class="btn dng sm" data-act="wipe">Apagar</button></div></div>';
    h += '<div class="sect-t">Meus cadastros</div><div class="card list">' + [['mat', 'Materiais (aba 2.1)', MATS.filter(function (m, i) { return i >= 6 || m[0] !== defaultMats()[i][0]; }).length]].map(function (x) { return '<button class="row" data-act="open" data-num="2.1"><span class="ico calc">' + ic('cube') + '</span><span class="tx"><b>' + x[1] + '</b><small>Editar e adicionar materiais</small></span>' + ic('next', 's chev') + '</button>'; }).join('') + [['4.1', 'Perfis W / H'], ['4.2', 'Perfis U e cantoneiras'], ['4.3', 'Tubos retangulares'], ['4.4', 'Tubos Schedule']].map(function (x) { return '<button class="row" data-act="open" data-num="' + x[0] + '"><span class="ico calc">' + ic('profile') + '</span><span class="tx"><b>' + x[1] + '</b><small>Adicionar perfis (entram nas calculadoras)</small></span>' + ic('next', 's chev') + '</button>'; }).join('') + LGROUPS.map(function (g) { var n = (LST[g.k] || []).length; return '<button class="row" data-act="grpman" data-g="' + g.k + '"><span class="ico calc">' + ic('list') + '</span><span class="tx"><b>' + g.t + '</b><small>' + (n ? n + ' cadastro(s) seu(s)' : 'Adicionar novos itens à lista') + '</small></span>' + ic('next', 's chev') + '</button>'; }).join('') + '</div>';
    h += '<div class="sect-t">Ajuda</div><div class="card list"><button class="row" data-act="gohelp"><span class="ico calc">' + ic('bulb') + '</span><span class="tx"><b>Como usar o manual</b><small>Busca, calculadoras, tabelas e legenda</small></span>' + ic('next', 's chev') + '</button></div>';
    h += '<div class="sect-t">Sobre</div><div class="card set"><div class="set-r col"><div class="hd"><span class="ico">' + ic('info') + '</span><div class="tx"><b>Manual Técnico do Engenheiro Mecânico</b><small>' + esc(D.home.ver || '') + '</small></div></div><dl class="kv"><dt>App</dt><dd>' + VERSION + '</dd><dt>Dados</dt><dd>68 abas · 24 calculadoras</dd><dt>Armazenamento</dt><dd id="stinfo">local, neste aparelho</dd></dl><p class="muted" style="font-size:.76rem;line-height:1.5">' + esc(D.home.aviso || '') + ' ' + esc(D.home.aviso2 || '') + '</p></div></div>';
    h += '<p class="footnote">Wen Technology · todas as suas escolhas são salvas automaticamente neste aparelho.</p>';
    setTimeout(function () {
      var si = $('#scrinfo'); if (si) si.textContent = innerWidth + ' × ' + innerHeight + ' px · ' + (innerWidth < 600 ? 'compacto (celular / tela externa)' : innerWidth < 900 ? 'médio (dobrável aberto / tablet)' : 'expandido (painel duplo)');
      if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { var el = $('#stinfo'); if (el) el.textContent = ((e.usage || 0) / 1048576).toFixed(1).replace('.', ',') + ' MB em cache offline'; });
    }, 0);
    return h;
  }
  function iosSheet() { openSheet('Instalar no iPhone / iPad', '<div style="padding:4px 18px 16px;font-size:.9rem;line-height:1.6"><p>1. Toque no botão <b>Compartilhar</b> ' + ic('share', 's') + ' do Safari.</p><p>2. Escolha <b>Adicionar à Tela de Início</b>.</p><p>3. Confirme em <b>Adicionar</b>. O ícone da Wen Technology aparece na tela inicial.</p></div>'); }
  function installHelp() {
    openSheet('Instalar o aplicativo', '<div style="padding:4px 18px 16px;font-size:.9rem;line-height:1.6"><p>No <b>Chrome / Samsung Internet</b>: abra o menu <b>⋮</b> e toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).</p><p style="margin-top:8px">Depois de instalado, ele abre em tela cheia, com ícone próprio, e funciona sem internet.</p></div>');
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; var b = $('#install-fab'); if (b && !LS.get('fabx', false)) b.hidden = false; });
  window.addEventListener('appinstalled', function () { deferredInstall = null; toast('App instalado com sucesso'); var b = $('#install-fab'); if (b) b.hidden = true; if (cur.route === 'set') render(); });
  function doInstall() {
    if (deferredInstall) { deferredInstall.prompt(); deferredInstall.userChoice.then(function () { deferredInstall = null; var b = $('#install-fab'); if (b) b.hidden = true; }); }
    else if (isIOS()) iosSheet(); else installHelp();
  }

  function exportData() {
    var blob = new Blob([JSON.stringify({ app: 'wen-manual', v: VERSION, settings: S, fav: FAV, recent: REC, inputs: INP, cv: LS.get('cv', {}), mat: LS.get('mat', null), lst: LST, ptab: PTAB, lib: LIBSEL, fx: FX }, null, 1)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'manual-wen-backup.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function importData() {
    var f = document.createElement('input'); f.type = 'file'; f.accept = 'application/json,.json';
    f.onchange = function () {
      var rd = new FileReader(); rd.onload = function () {
        try { var d = JSON.parse(rd.result); if (d.app !== 'wen-manual') throw 0; if (d.settings) LS.set('settings', d.settings); LS.set('fav', d.fav || []); LS.set('recent', d.recent || []); LS.set('inputs', d.inputs || {}); LS.set('cv', d.cv || {}); if (d.mat) LS.set('mat', d.mat); LS.set('lst', d.lst || {}); LS.set('ptab', d.ptab || {}); LS.set('lib', d.lib || {}); LS.set('fx', d.fx || {}); toast('Backup restaurado'); setTimeout(function () { location.reload(); }, 600); }
        catch (e) { toast('Arquivo de backup inválido'); }
      }; rd.readAsText(f.files[0]);
    }; f.click();
  }

  // ---------------------------------------------------------------- MEMORIAL DE CÁLCULO (tela + impressão/PDF)
  function memorialForm(s) {
    var m = LS.get('memo', {});
    var f = function (id, l, v, ph) { return '<label class="mf"><small style="display:block;font-size:.72rem;font-weight:650;color:var(--text2);margin:0 2px 4px">' + esc(l) + '</small><span class="inp"><input id="memo-' + id + '" type="text" value="' + esc(v || '') + '" placeholder="' + esc(ph) + '" autocomplete="off"></span></label>'; };
    openSheet('Memorial de cálculo', '<div style="padding:2px 18px 6px;font-size:.84rem;color:var(--text2)">Gera uma folha com os dados, os resultados e as verificações desta calculadora. Use <b>Imprimir / salvar PDF</b> na tela seguinte.</div><div class="matform" style="padding:4px 18px 8px;display:grid;gap:10px">' +
      f('p', 'Projeto / OS', m.p, 'Ex.: 025036-1') + f('c', 'Cliente', m.c, '') + f('r', 'Responsável técnico', m.r, '') + f('a', 'ART / CREA', m.a, '') + f('o', 'Observações', m.o, 'Ex.: carga estática, material certificado') +
      '</div><div class="actions" style="padding:0 18px 14px"><button class="btn pri" data-act="memogen">' + ic('book', 's') + ' Gerar memorial</button></div>');
  }
  function memoCollect(s) {
    var rows = calcModel(s), sec = '', ins = [], outs = [];
    rows.forEach(function (r) {
      if (r.k === 'sec') { sec = r.text; return; }
      if (r.k !== 'f') return;
      var l = txt(cellV(s, 'B' + r.r)); if (/^\(não usado\)$/i.test(l)) return;
      var v = cellV(s, 'C' + r.r), u = txt(cellV(s, 'D' + r.r)), n = txt(cellV(s, 'E' + r.r)), o = fmtOut(s, r, v);
      var uu = (u && u !== '-') ? u : '', eqm = eqOf(v, u);
      var it = { mod: fxMod(s, 'C' + r.r), sec: sec, l: l, v: o.t, u: uu + (eqm ? ' (' + eqm + ')' : ''), n: n, st: typeof v === 'string' && /^[✓✗]/.test(v), ok: typeof v === 'string' && v.indexOf('✓') === 0, main: r.kind === 'main' };
      (r.kind === 'in' ? ins : outs).push(it);
    });
    return { ins: ins, outs: outs };
  }
  function memoTable(items, head) {
    if (!items.length) return '';
    var last = '', h = '<table class="mt"><thead><tr><th>' + head + '</th><th class="r">Valor</th><th>Unid.</th><th>Observação</th></tr></thead><tbody>';
    items.forEach(function (x) {
      if (x.sec && x.sec !== last) { h += '<tr class="ms"><td colspan="4">' + esc(x.sec) + '</td></tr>'; last = x.sec; }
      var modTag = x.mod ? '<b class="modn">Fórmula alterada pelo usuário.</b> ' : '';
      if (x.st) h += '<tr class="' + (x.ok ? 'okr' : 'errr') + (x.mod ? ' modr' : '') + '"><td>' + esc(x.l) + '</td><td colspan="3"><b>' + esc(x.v) + '</b>' + (x.mod ? ' <span class="modn">Fórmula alterada pelo usuário</span>' : '') + '</td></tr>';
      else h += '<tr class="' + (x.main ? 'mn' : '') + (x.mod ? ' modr' : '') + '"><td>' + esc(x.l) + '</td><td class="r">' + esc(x.v) + '</td><td>' + esc(x.u) + '</td><td class="nt">' + modTag + esc(x.n) + '</td></tr>';
    });
    return h + '</tbody></table>';
  }
  function memorialGen(s) {
    var g = function (id) { var e = $('#memo-' + id); return e ? e.value.trim() : ''; };
    var m = { p: g('p'), c: g('c'), r: g('r'), a: g('a'), o: g('o') }; LS.set('memo', m); closeSheet(true);
    var mods = fxModList(s), d = memoCollect(s), now = new Date(), when = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    var sts = d.outs.filter(function (x) { return x.st; }), bad = sts.filter(function (x) { return !x.ok; }).length;
    var fig = (s.figs && s.figs[0]) ? '<figure class="mfig"><img src="' + mediaUrl(s.figs[0].src) + '" alt=""><figcaption>' + esc(s.figs[0].cap || '') + '</figcaption></figure>' : '';
    var sub = s.sub_f ? txt(cellV(s, 'B2')) : (s.sub || '');
    var meta = [['Projeto / OS', m.p], ['Cliente', m.c], ['Responsável técnico', m.r], ['ART / CREA', m.a], ['Data', when], ['Aba', s.num + ' · ' + shortName(s)]];
    var h = '<div class="memo-bar"><b>Memorial de cálculo</b><button class="btn pri sm" data-act="memoprint">' + ic('download', 's') + ' Imprimir / salvar PDF</button><button class="btn sm" data-act="memoclose">' + ic('close', 's') + ' Fechar</button></div>' +
      '<article class="memo-page"><header><div class="mh1">MEMORIAL DE CÁLCULO</div><h1>' + esc(s.title || s.name) + '</h1></header>' +
      '<table class="mm">' + meta.map(function (x, i) { return (i % 2 === 0 ? '<tr>' : '') + '<th>' + esc(x[0]) + '</th><td>' + (x[1] ? esc(x[1]) : '&nbsp;') + '</td>' + (i % 2 === 1 ? '</tr>' : ''); }).join('') + '</table>' +
      (sub ? '<h2>Formulação</h2><p class="fm">' + esc(sub) + '</p>' : '') + fig +
      (mods.length ? '<p class="modbar"><b>Atenção:</b> este memorial usa ' + mods.length + (mods.length === 1 ? ' fórmula alterada' : ' fórmulas alteradas') + ' pelo usuário, diferente(s) da planilha original. As linhas afetadas estão marcadas com "fórmula alterada pelo usuário".</p>' : '') +
      '<h2>Dados de entrada</h2>' + memoTable(d.ins, 'Parâmetro') +
      '<h2>Resultados e verificações</h2>' + memoTable(d.outs, 'Resultado') +
      (sheetHasEq(s) ? '<p class="unitnote"><b>Unidades:</b> ' + esc(UNIT_NOTE) + '.</p>' : '') +
      fxpMemoHtml(s) + fxpMemoMods(s) +
      (sts.length ? '<p class="concl ' + (bad ? 'errr' : 'okr') + '"><b>' + (bad ? 'Atenção: ' + bad + ' verificação(ões) reprovada(s) de ' + sts.length + '.' : 'Todas as ' + sts.length + ' verificações atendem.') + '</b></p>' : '') +
      (m.o ? '<h2>Observações</h2><p>' + esc(m.o) + '</p>' : '') +
      '<div class="sig"><div><span></span>Responsável técnico</div><div><span></span>Verificação</div></div>' +
      '<footer>' + esc(D.home.aviso || '') + '<br>Gerado pelo Manual Técnico Wen v' + esc(VERSION) + ' em ' + esc(when) + '.</footer></article>';
    var ov = document.createElement('div'); ov.id = 'memorial'; ov.className = 'memo-ov'; ov.innerHTML = h; document.body.appendChild(ov);
  }
  function memorialPrint() { document.body.classList.add('printing-memo'); var done = function () { document.body.classList.remove('printing-memo'); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); window.print(); }
  function memorialClose() { var o = $('#memorial'); if (o) o.remove(); document.body.classList.remove('printing-memo'); }

  // ---------------------------------------------------------------- FÓRMULAS EDITÁVEIS (modo "Editar fórmulas")
  // As alterações ficam em localStorage ('wen.fx') por calculadora: { "<aba>": { c: {C50: "=..."|número|texto}, add: [{r,l,f,u}] } }.
  // Tudo passa pelo motor próprio (Engine): nada de eval/Function sobre texto livre.
  var FX = LS.get('fx', {}), FXORIG = {}, FXMODE = false, FXEDIT = null, FX_LAST = null, FX_ROW0 = 1000;
  function fxSave() {
    Object.keys(FX).forEach(function (k) { var d = FX[k]; if (!d || (!Object.keys(d.c || {}).length && !(d.add || []).length)) delete FX[k]; });
    LS.set('fx', FX);
  }
  function fxIsF(raw) { return typeof raw === 'string' && raw.charAt(0) === '='; }
  function fxData(s, create) { var d = FX[s.name]; if (!d && create) d = FX[s.name] = { c: {}, add: [] }; if (d) { d.c = d.c || {}; d.add = d.add || []; } return d; }
  function fxMod(s, a) { var d = FX[s.name]; if (!d) return false; if (d.c && (a in d.c)) return true; var r = +String(a).replace(/\D/g, ''); return r >= FX_ROW0 && (d.add || []).some(function (x) { return x.r === r; }); }
  function fxCount(s) { var d = FX[s.name]; return d ? Object.keys(d.c || {}).length + (d.add || []).length : 0; }
  function fxOrig(s, a) { var o = FXORIG[s.name] = FXORIG[s.name] || {}; if (!(a in o)) o[a] = { v: s.cells[a], had: (a in s.cells) }; return o[a]; }
  function fxTouch(s) { delete s._m; ENG.setOpts({}); }
  function fxSetCell(s, a, raw) {
    var o = fxOrig(s, a), d = fxData(s, true);
    if (o.had && raw === o.v) delete d.c[a]; else d.c[a] = raw;
    ENG.setRaw(s.name, a, raw); fxTouch(s); fxSave();
  }
  function fxRestoreCell(s, a) {
    var o = FXORIG[s.name] && FXORIG[s.name][a], d = fxData(s, false);
    if (o) ENG.setRaw(s.name, a, o.had ? o.v : undefined);
    if (d) delete d.c[a];
    fxTouch(s); fxSave();
  }
  function fxApplyAdd(s) {   // garante as linhas próprias no modelo e nas células
    var d = FX[s.name];
    s.rows = s.rows.filter(function (r) { return !(r.r >= FX_ROW0); });
    Object.keys(s.cells).forEach(function (a) { if (+a.replace(/\D/g, '') >= FX_ROW0) ENG.setRaw(s.name, a, undefined); });
    if (d && d.add && d.add.length) {
      s.rows.push({ k: 'sec', r: FX_ROW0, text: 'LINHAS PRÓPRIAS (fórmulas do usuário)' });
      d.add.forEach(function (x) {
        s.rows.push({ k: 'f', r: x.r, kind: 'calc', nf: 'General', bold: false, global: false, custom: true });
        ENG.setRaw(s.name, 'B' + x.r, x.l); ENG.setRaw(s.name, 'C' + x.r, x.f); ENG.setRaw(s.name, 'D' + x.r, x.u || '');
      });
    }
    fxTouch(s);
  }
  function fxRestoreAll(s) {
    var d = FX[s.name]; if (!d) return;
    Object.keys(d.c || {}).forEach(function (a) { var o = FXORIG[s.name] && FXORIG[s.name][a]; if (o) ENG.setRaw(s.name, a, o.had ? o.v : undefined); });
    delete FX[s.name]; fxApplyAdd(s); fxSave();
  }
  function fxBoot() {
    fxSheets().forEach(function (s) {
      var d = FX[s.name]; if (!d) return;
      Object.keys(d.c || {}).forEach(function (a) {
        var raw = d.c[a];
        if (fxIsF(raw) && !Engine.validate(raw).ok) { delete d.c[a]; return; }
        fxOrig(s, a); ENG.setRaw(s.name, a, raw);
      });
      d.add = (d.add || []).filter(function (x) { return x && x.r >= FX_ROW0 && fxIsF(x.f) && Engine.validate(x.f).ok; });
      fxApplyAdd(s);
    });
  }
  function fxSheets() { return Object.keys(SHEETS).map(function (k) { return SHEETS[k]; }).filter(function (s) { return s.kind === 'calc'; }); }
  function fxRaw(s, a) { var v = s.cells[a]; return v == null ? '' : String(v); }
  function fxLabel(s, rn) { var l = txt(cellV(s, 'B' + rn)).replace(/\s+/g, ' ').trim(); return l; }
  // "=$C$22*$C$21/4" -> "[Carga concentrada P] * [Vão L] / 4" (referências lidas pelo rótulo da linha)
  function fxHuman(s, f) {
    var re = /(^|[^\w.À-ÿ'])((?:'[^']+'!|[A-Za-zÀ-ÿ_][\w.À-ÿ]*!)?)\$?([A-Za-z]{1,3})\$?(\d+)(?![\w(])/g;
    return String(f).split(/("(?:[^"]|"")*")/).map(function (p, i) {
      if (i % 2) return p;
      return p.replace(re, function (m, pre, sh, col, row) {
        if (sh || pre === ':' || col.toUpperCase() !== 'C') return m;
        var l = fxLabel(s, row); if (!l || /^\(não usado\)$/i.test(l)) return m;
        if (l.length > 42) l = l.slice(0, 41) + '…';
        return pre + '[' + l + ']';
      });
    }).join('');
  }
  function fxValTxt(s, rn, v) {
    var r = calcModel(s).filter(function (x) { return x.r === rn; })[0] || { nf: 'General' }, o = fmtOut(s, r, v), u = txt(cellV(s, 'D' + rn));
    if (o.err) return o.err;
    var e = eqOf(v, u);
    return o.t + (u && u !== '-' && o.t !== '' && typeof v !== 'string' ? ' ' + u : '') + (e ? ' (' + e + ')' : '');
  }
  // texto digitado -> valor guardado: '=...' fórmula | número | texto
  function fxParse(text, wantNumber) {
    var t = String(text).trim();
    if (t === '') return { err: 'Digite uma fórmula (comece com =) ou um valor.' };
    if (t.charAt(0) === '=') return { raw: t, f: true };
    var n = parseNum(t);
    if (n !== null && !isNaN(n) && /^[-+]?[\d\s.,]+$/.test(t)) return { raw: n, f: false };
    if (wantNumber) return { err: 'Valor numérico inválido. Use 9.53 ou 9,53; para uma conta comece com =.' };
    return { raw: t, f: false };
  }
  function fxKindNum(s, r) { return r.kind === 'in' && !r.items && (r.num || typeof cellV(s, 'C' + r.r) === 'number'); }

  function fxBarHtml(s) {
    var n = fxCount(s), on = FXMODE;
    return '<button class="btn pri sm fxtog" data-act="fxtoggle"><span class="fxk" aria-hidden="true">ƒx</span> Fórmulas</button>' +
      '<span class="fxlead">Veja e altere todas as fórmulas desta calculadora, com nomes e símbolos.</span>' +
      (n ? '<span class="fxst" role="status"><i aria-hidden="true"></i>Fórmulas alteradas · ' + n + (n === 1 ? ' item' : ' itens') + '</span>' : '') +
      '<span class="fxsp"></span>' +
      '<button class="btn sm" data-act="fxio">Exportar / importar</button>' +
      (n ? '<button class="btn sm" data-act="fxrestoreall" data-arm="0">Restaurar original</button>' : '');
  }
  function fxBarRefresh(s) {
    var b = $('#fxbar'); if (b) { b.innerHTML = fxBarHtml(s); b.classList.toggle('on', FXMODE); b.classList.toggle('has', fxCount(s) > 0); }
    $$('[data-act="fxtoggle"]').forEach(function (x) { x.setAttribute('aria-pressed', FXMODE); });
    var f = $('.calc-grid .form'); if (f) f.classList.toggle('fxon', FXMODE);
  }
  // linha de fórmula sob cada campo (só no modo editar)
  function fxField(s, el, r) {
    var box = $('[data-fxr]', el); if (!box) return;
    if (!FXMODE) { if (!box.hidden) { box.hidden = true; box.innerHTML = ''; box.dataset.ed = ''; } el.classList.remove('fxm', 'fxmod'); return; }
    var a = 'C' + r.r, mod = fxMod(s, a); el.classList.add('fxm'); el.classList.toggle('fxmod', mod);
    if (box.dataset.ed === '1') return;
    var raw = fxRaw(s, a), isF = fxIsF(raw), lab = fxLabel(s, r.r);
    box.hidden = false;
    box.innerHTML = '<button type="button" class="fxl" data-act="fxedit" data-r="' + r.r + '" aria-label="Editar ' + esc(r.kind === 'in' ? 'valor padrão' : 'fórmula') + ' de ' + esc(lab) + '">' +
      '<span class="fxk" aria-hidden="true">' + (isF ? 'ƒx' : (r.kind === 'in' ? 'padrão' : 'valor')) + '</span><code>' + esc(raw === '' ? '(vazio)' : raw) + '</code>' +
      (mod ? '<span class="fxtag">' + (r.custom ? 'linha própria' : 'alterada') + '</span>' : '') + '</button>';
  }
  function fxRefList(s, selfR, q) {
    var out = [];
    calcModel(s).forEach(function (r) {
      if (r.k !== 'f' || r.r === selfR) return;
      var l = fxLabel(s, r.r); if (!l || /^\(não usado\)$/i.test(l)) return;
      out.push('<button type="button" class="fxref" data-act="fxins" data-ref="$C$' + r.r + '" data-f="' + esc(fold(l + ' c' + r.r)) + '"><b>C' + r.r + '</b><span>' + esc(l) + '</span><i>' + esc(fxValTxt(s, r.r, cellV(s, 'C' + r.r))) + '</i></button>');
    });
    return out.join('');
  }
  function fxOpen(s, rn) {
    var el = $('.field[data-r="' + rn + '"]'); if (!el) return;
    fxCloseEditor(false);
    var r = calcModel(s).filter(function (x) { return x.r === rn; })[0]; if (!r) return;
    var a = 'C' + rn, raw = fxRaw(s, a), mod = fxMod(s, a), box = $('[data-fxr]', el), o = FXORIG[s.name] && FXORIG[s.name][a];
    var lab = fxLabel(s, rn), d = FX[s.name], ce = r.custom && d ? d.add.filter(function (x) { return x.r === rn; })[0] : null;
    FXEDIT = { s: s.num, r: rn }; box.dataset.ed = '1'; box.hidden = false;
    box.innerHTML = '<div class="fxed" role="group" aria-label="Editar ' + esc(lab) + '">' +
      '<label class="fxlab" for="fxta">' + (r.kind === 'in' && !fxIsF(raw) ? 'Valor padrão de ' : 'Fórmula de ') + '<b>' + esc(lab) + '</b> <span class="fxcell">célula ' + a + '</span></label>' +
      (r.custom ? '<div class="fxrow2"><label>Rótulo<input id="fx-lab" type="text" value="' + esc(ce ? ce.l : lab) + '" autocomplete="off"></label><label>Unidade<input id="fx-un" type="text" value="' + esc(ce ? ce.u : '') + '" autocomplete="off"></label></div>' : '') +
      '<textarea id="fxta" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" data-act="fxin" aria-describedby="fxmsg fxread">' + esc(raw) + '</textarea>' +
      '<p class="fxread" id="fxread" aria-live="polite"></p><p class="fxmsg" id="fxmsg" role="alert" hidden></p>' +
      (mod && o && !r.custom ? '<p class="fxorig">Original: <code>' + esc(o.had ? String(o.v) : '(vazio)') + '</code></p>' : '') +
      '<div class="fxbtns"><button type="button" class="btn pri sm" data-act="fxapply">Aplicar</button><button type="button" class="btn sm" data-act="fxcancel">Cancelar</button>' +
      (mod && !r.custom ? '<button type="button" class="btn sm" data-act="fxrestore">Restaurar original</button>' : '') +
      (r.custom ? '<button type="button" class="btn sm dng" data-act="fxdelrow">Excluir linha</button>' : '') + '</div>' +
      '<details class="fxrefs"' + (innerWidth >= 720 ? ' open' : '') + '><summary>Variáveis desta calculadora (toque para inserir)</summary><label class="filter fxfind"><input type="search" id="fxf" data-act="fxfind" placeholder="Filtrar por nome ou célula (ex.: vão, C21)" autocomplete="off"></label><div class="fxrl" id="fxrl">' + fxRefList(s, rn) + '</div></details></div>';
    var ta = $('#fxta', box); ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { }
    fxLive(s);
  }
  function fxCloseEditor(refocus) {
    if (!FXEDIT) return; var s = BYNUM[FXEDIT.s], rn = FXEDIT.r; FXEDIT = null;
    var el = $('.field[data-r="' + rn + '"]'); if (el) { var box = $('[data-fxr]', el); if (box) box.dataset.ed = ''; }
    if (s) { refreshCalc(s, false); if (refocus && el) { var b = $('.fxl', el); if (b) b.focus({ preventScroll: true }); } }
  }
  function fxEvaluate(s, rn) {   // lê o formulário do editor e testa SEM aplicar
    var ta = $('#fxta'); if (!ta) return null;
    var r = calcModel(s).filter(function (x) { return x.r === rn; })[0], p = fxParse(ta.value, fxKindNum(s, r) && !/^\s*=/.test(ta.value));
    if (p.err) return { ok: false, error: p.err };
    var chk = ENG.check(s.name, 'C' + rn, p.raw);
    if (!chk.ok) return chk;
    chk.raw = p.raw; chk.isF = p.f; return chk;
  }
  function fxLive(s) {
    if (!FXEDIT) return; var rn = FXEDIT.r, c = fxEvaluate(s, rn), msg = $('#fxmsg'), rd = $('#fxread'), ap = $('[data-act="fxapply"]'), ta = $('#fxta');
    if (!msg || !rd) return;
    if (!c.ok) { msg.hidden = false; msg.className = 'fxmsg err'; msg.textContent = c.error; rd.textContent = ''; if (ta) ta.setAttribute('aria-invalid', 'true'); if (ap) ap.disabled = true; return; }
    if (ta) ta.removeAttribute('aria-invalid'); if (ap) ap.disabled = false;
    if (c.warn) { msg.hidden = false; msg.className = 'fxmsg warn'; msg.textContent = c.warn; } else { msg.hidden = true; msg.textContent = ''; }
    var human = c.isF ? fxHuman(s, c.raw) : '';
    rd.innerHTML = (human && human !== c.raw ? '<span class="fxh">' + esc(human) + '</span> ' : '') + '<span class="fxres">Resultado agora: <b>' + esc(fxValTxt(s, rn, c.value)) + '</b></span>';
  }
  function fxApply(s) {
    if (!FXEDIT) return; var rn = FXEDIT.r, c = fxEvaluate(s, rn);
    if (!c.ok) { fxLive(s); var ta = $('#fxta'); if (ta) ta.focus(); return; }
    var r = calcModel(s).filter(function (x) { return x.r === rn; })[0], d = fxData(s, true);
    if (r.custom) {
      var lb = ($('#fx-lab') || {}).value, un = ($('#fx-un') || {}).value, ce = d.add.filter(function (x) { return x.r === rn; })[0];
      if (!fxIsF(c.raw)) { var m0 = $('#fxmsg'); m0.hidden = false; m0.className = 'fxmsg err'; m0.textContent = 'A linha própria precisa de uma fórmula (comece com =).'; return; }
      if (ce) { ce.l = (lb || '').trim() || 'Linha própria'; ce.u = (un || '').trim(); ce.f = c.raw; } fxApplyAdd(s); fxSave();
    } else {
      fxSetCell(s, 'C' + rn, c.raw);
      if (r.kind === 'in') clearInput(s, 'C' + rn);   // valor novo vira o padrão e aparece na tela
    }
    FXEDIT = null; var el = $('.field[data-r="' + rn + '"]'); if (el) { var bx = $('[data-fxr]', el); if (bx) bx.dataset.ed = ''; }
    if (r.custom) { rerenderKeep(); } else { refreshCalc(s, true); fxBarRefresh(s); var b2 = el && $('.fxl', el); if (b2) b2.focus({ preventScroll: true }); }
    toast(r.kind === 'in' && !fxIsF(c.raw) ? 'Valor padrão alterado' : 'Fórmula aplicada e recalculada');
  }
  var fxT;
  function fxInsert(id, ref) {
    var ta = document.getElementById(id); if (!ta) return;
    var a = ta.selectionStart == null ? ta.value.length : ta.selectionStart, b = ta.selectionEnd == null ? a : ta.selectionEnd;
    if (!ta.value.trim()) { ta.value = '=' + ref; a = ta.value.length; } else { ta.value = ta.value.slice(0, a) + ref + ta.value.slice(b); a += ref.length; }
    ta.focus(); try { ta.setSelectionRange(a, a); } catch (e) { }
  }
  function rerenderKeep() { var y = window.scrollY; popping = true; render(); window.scrollTo(0, y); }
  function fxRestoreOne(s) {
    if (!FXEDIT) return; var rn = FXEDIT.r; fxRestoreCell(s, 'C' + rn); var r = calcModel(s).filter(function (x) { return x.r === rn; })[0];
    if (r && r.kind === 'in') clearInput(s, 'C' + rn);
    var el = $('.field[data-r="' + rn + '"]'); FXEDIT = null; if (el) { var bx = $('[data-fxr]', el); if (bx) bx.dataset.ed = ''; }
    refreshCalc(s, true); fxBarRefresh(s); toast('Original restaurado');
  }
  function fxDelRow(s) {
    if (!FXEDIT) return; var rn = FXEDIT.r, d = fxData(s, false); if (!d) return;
    d.add = d.add.filter(function (x) { return x.r !== rn; }); FXEDIT = null; fxApplyAdd(s); fxSave(); rerenderKeep(); toast('Linha própria excluída');
  }
  function fxToggle(s) {
    FXMODE = !FXMODE; if (!FXMODE) { FXEDIT = null; }
    $$('.field[data-r]').forEach(function (el) { var b = $('[data-fxr]', el); if (b) b.dataset.ed = ''; });
    refreshCalc(s, true); fxBarRefresh(s);
    toast(FXMODE ? 'Editar fórmulas ligado: toque numa linha' : 'Editar fórmulas desligado');
  }
  // ---- linha própria
  function fxAddRowForm(s) {
    openSheet('Adicionar linha própria', '<div class="matform fxform"><p class="fxhint2">Cria um resultado novo nesta calculadora. Use referências de célula (ex.: <code>$C$50</code>) ou os nomes das variáveis pela lista do editor. A linha entra no memorial.</p>' +
      '<label class="mf"><small>Rótulo</small><span class="inp"><input id="fxn-l" type="text" placeholder="Ex.: Flecha admissível fixa" autocomplete="off"></span></label>' +
      '<label class="mf"><small>Fórmula</small><span class="inp tall"><textarea id="fxn-f" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="=$C$21/300" data-act="fxnin"></textarea></span></label>' +
      '<label class="mf"><small>Unidade</small><span class="inp"><input id="fxn-u" type="text" placeholder="mm" autocomplete="off"></span></label>' +
      '<p class="fxmsg" id="fxn-m" role="alert" hidden></p>' +
      '<div class="fxrefs2"><small>Variáveis (toque para inserir)</small><div class="fxrl" id="fxn-rl">' + fxRefList(s, -1).replace(/data-act="fxins"/g, 'data-act="fxnins"') + '</div></div>' +
      '<div class="actions"><button class="btn pri" data-act="fxnadd">Adicionar linha</button></div></div>');
    var l = $('#fxn-l'); if (l) l.focus();
  }
  function fxAddRowDo(s) {
    var l = $('#fxn-l').value.trim(), f = $('#fxn-f').value.trim(), u = $('#fxn-u').value.trim(), m = $('#fxn-m'), d = fxData(s, true);
    function bad(t) { m.hidden = false; m.className = 'fxmsg err'; m.textContent = t; }
    if (!l) return bad('Dê um nome (rótulo) para a linha.');
    if (f.charAt(0) !== '=') f = '=' + f;
    var nr = FX_ROW0 + 1 + d.add.reduce(function (mx, x) { return Math.max(mx, x.r - FX_ROW0); }, 0);
    var c = ENG.check(s.name, 'C' + nr, f); if (!c.ok) return bad(c.error);
    d.add.push({ r: nr, l: l, f: f, u: u }); fxApplyAdd(s); fxSave(); closeSheet(true); rerenderKeep(); toast('Linha própria adicionada');
  }
  // ---- exportar / importar (JSON)
  function fxExportObj(all, s) {
    var out = { app: 'wen-manual-formulas', v: 1, versao: VERSION, data: new Date().toISOString().slice(0, 10), sheets: {} };
    Object.keys(FX).forEach(function (k) { if (all || (s && k === s.name)) { var d = FX[k]; if (d && (Object.keys(d.c || {}).length || (d.add || []).length)) out.sheets[k] = { c: d.c, add: d.add }; } });
    return out;
  }
  function fxIOForm(s) {
    openSheet('Exportar e importar fórmulas', '<div class="fxio">' +
      '<h4>Exportar</h4><p class="fxhint2">Leva as alterações para outro aparelho. Cole o texto lá em Importar.</p>' +
      '<div class="fxseg" role="group" aria-label="O que exportar"><button class="btn sm" data-act="fxscope" data-v="1" aria-pressed="true">Esta calculadora</button><button class="btn sm" data-act="fxscope" data-v="0" aria-pressed="false">Todas as calculadoras</button></div>' +
      '<textarea id="fxx" rows="6" readonly spellcheck="false" aria-label="Alterações em JSON"></textarea>' +
      '<div class="fxbtns"><button class="btn pri sm" data-act="fxcopy">Copiar</button><button class="btn sm" data-act="fxdl">Baixar arquivo</button></div>' +
      '<h4>Importar</h4><p class="fxhint2">Substitui as alterações das calculadoras que vierem no texto. Fórmulas inválidas são ignoradas e listadas.</p>' +
      '<textarea id="fxi" rows="5" spellcheck="false" placeholder="Cole aqui o texto exportado" aria-label="Texto para importar"></textarea>' +
      '<div class="fxbtns"><button class="btn pri sm" data-act="fximport">Importar texto</button><button class="btn sm" data-act="fxfile">Escolher arquivo</button></div>' +
      '<p class="fxmsg" id="fxio-m" role="status" hidden></p></div>');
    fxIOFill(s, true);
  }
  function fxIOFill(s, one) { var x = $('#fxx'); if (x) x.value = JSON.stringify(fxExportObj(!one, s), null, 1); $$('.fxseg .btn').forEach(function (b) { b.setAttribute('aria-pressed', (b.dataset.v === '1') === !!one); }); }
  function fxImportObj(obj, s0) {
    var rep = { ok: 0, skip: [], sheets: 0 };
    if (!obj || obj.app !== 'wen-manual-formulas' || !obj.sheets) throw new Error('Texto não reconhecido: não é uma exportação de fórmulas do Manual Wen.');
    Object.keys(obj.sheets).forEach(function (name) {
      var s = fxSheets().filter(function (x) { return x.name === name; })[0]; if (!s) { rep.skip.push(name + ': calculadora não existe nesta versão'); return; }
      var src = obj.sheets[name] || {}; fxRestoreAll(s); rep.sheets++;
      var d = fxData(s, true);
      (src.add || []).forEach(function (x) {
        if (!x || !(x.r >= FX_ROW0) || typeof x.f !== 'string' || d.add.some(function (y) { return y.r === x.r; })) return;
        var v = Engine.validate(x.f); if (!v.ok) { rep.skip.push(name + ' linha ' + x.l + ': ' + v.error); return; }
        d.add.push({ r: x.r, l: String(x.l || 'Linha própria'), f: x.f, u: String(x.u || '') });
      });
      fxApplyAdd(s);
      Object.keys(src.c || {}).forEach(function (a) {
        if (!/^[A-Z]{1,2}\d{1,4}$/.test(a)) return;
        var raw = src.c[a];
        if (a.charAt(0) !== 'C' || +a.slice(1) >= FX_ROW0) { rep.skip.push(name + ' ' + a + ': célula não editável'); return; }
        if (fxIsF(raw)) { var c = ENG.check(s.name, a, raw); if (!c.ok) { rep.skip.push(name + ' ' + a + ': ' + c.error); return; } }
        else if (typeof raw !== 'number' && typeof raw !== 'string') return;
        fxOrig(s, a); fxSetCell(s, a, raw); rep.ok++;
        var rr = calcModel(s).filter(function (x) { return x.r === +a.slice(1); })[0]; if (rr && rr.kind === 'in') clearInput(s, a);
      });
    });
    fxSave(); return rep;
  }
  function fxImportDo(text) {
    var m = $('#fxio-m'), s = cur.sheet;
    function show(t, cls) { if (m) { m.hidden = false; m.className = 'fxmsg ' + cls; m.textContent = t; } }
    var obj; try { obj = JSON.parse(text); } catch (e) { return show('Texto inválido: não é JSON. Copie de novo o texto inteiro da exportação.', 'err'); }
    var rep; try { rep = fxImportObj(obj, s); } catch (e) { return show(e.message, 'err'); }
    show('Importado: ' + rep.ok + ' fórmula(s)/valor(es) em ' + rep.sheets + ' calculadora(s).' + (rep.skip.length ? ' Ignorados (' + rep.skip.length + '): ' + rep.skip.slice(0, 5).join(' | ') : ''), rep.skip.length ? 'warn' : 'ok');
    if (FXP.open) fxpRefresh(false); else if (s) { rerenderKeep(); }
  }
  function fxModList(s) {
    var d = FX[s.name], out = []; if (!d) return out;
    Object.keys(d.c || {}).sort(function (a, b) { return +a.slice(1) - +b.slice(1); }).forEach(function (a) {
      var rn = +a.slice(1), o = FXORIG[s.name] && FXORIG[s.name][a];
      out.push({ l: fxLabel(s, rn), cur: String(d.c[a]), orig: o && o.had ? String(o.v) : '', custom: false, a: a });
    });
    (d.add || []).forEach(function (x) { out.push({ l: x.l, cur: x.f, orig: '', custom: true, a: 'C' + x.r }); });
    return out;
  }

  // ================================================================ PAINEL "FÓRMULAS" (v3.5)
  // Uma tela por calculadora com TODAS as fórmulas em nomes e símbolos, agrupadas por bloco, editáveis ali mesmo.
  var FXP = { open: false, s: null, M: null, sel: null, ed: null, filter: '', ac: null };
  function fxpBuild(s) {
    var model = calcModel(s), W = window.WenFx, rows = model.filter(function (r) { return r.k === 'f'; }), hide = {};
    var infos = [];
    var rowSet = {}, byR = {};
    rows.forEach(function (r) {
      rowSet[r.r] = 1; var l = txt(cellV(s, 'B' + r.r));
      if (/^\(não usado\)$/i.test(l)) { hide[r.r] = 1; l = W.labelFallback(W.ast(s.cells['B' + r.r])) || l; }   // rótulo muda com o tipo: usa o primeiro nome útil
      infos.push({ r: r.r, label: l || ('Linha ' + r.r), unit: txt(cellV(s, 'D' + r.r)) });
    });
    var aux = W.auxRows(s.cells, rowSet, s.name);   // cálculos intermediários que não aparecem na tela
    aux.forEach(function (n) { var l = s.cells['B' + n]; infos.push({ r: n, label: (typeof l === 'string' && l.charAt(0) !== '=' && l) ? l : 'Cálculo auxiliar ' + n, unit: txt(cellV(s, 'D' + n)) }); byR[n] = { k: 'f', r: n, kind: 'calc', nf: 'General', aux: true }; });
    var nm = W.buildNames(infos, (W.SYMS || {})[s.num]), blocks = [], cb = null;
    model.forEach(function (r) {
      if (r.k === 'sec') { cb = { title: r.text, rows: [] }; blocks.push(cb); }
      else if (r.k === 'f' && !hide[r.r]) { if (!cb) { cb = { title: 'DADOS', rows: [] }; blocks.push(cb); } cb.rows.push(r.r); }
    });
    if (aux.length) blocks.push({ title: 'CÁLCULOS AUXILIARES (usados pelas fórmulas acima)', rows: aux.slice() });
    var nums = infos.map(function (x) { return x.r; }), g = W.graph(nums, function (r) { return s.cells['C' + r]; }, s.name);
    model.forEach(function (r) { if (r.k === 'f') byR[r.r] = r; });
    blocks.forEach(function (b) { b.rows = W.order(b.rows, g); });
    return { s: s, nm: nm, g: g, byR: byR, blocks: blocks.filter(function (b) { return b.rows.length; }), ctx: { nm: nm, sheet: s.name } };
  }
  function fxpEvalExpr(s, raw) { var c = ENG.check(s.name, 'C2000', raw); return c.ok ? c.value : undefined; }
  function fxpCaseNames(M, head) {
    if (!head || head.k !== 'ref' || !head.single || (head.sh && head.sh !== M.s.name) || head.c1 !== 3) return null;
    var a = window.WenFx.ast(M.s.cells['C' + head.r1]);
    if (!a || a.k !== 'fn' || a.n !== 'MATCH' || a.a.length < 2 || a.a[1].k !== 'ref' || a.a[1].single) return null;
    var rg = a.a[1], out = [];
    for (var rr = rg.r1; rr <= rg.r2; rr++) { var v = ENG.raw(rg.sh || M.s.name, Engine.numToCol(rg.c1) + rr); out.push(v == null ? null : String(v).replace(/^\d+\s+/, '')); }
    return out;
  }
  function fxpView(M, rn) {
    var W = window.WenFx, raw = M.s.cells['C' + rn], v = { r: rn, raw: raw, isF: fxIsF(raw), info: M.nm.byRow[rn] };
    if (v.isF) {
      v.ast = W.ast(raw);
      if (v.ast) {
        var cs = W.cases(raw, { caseNames: function (h) { return fxpCaseNames(M, h); } });
        if (cs) {
          v.cs = cs;
          if (cs.kind === 'choose') { var k = fxpEvalExpr(M.s, '=' + W.serialize(cs.head)); v.act = typeof k === 'number' ? Math.floor(k) : null; }
          else { var c0 = fxpEvalExpr(M.s, '=' + W.serialize(cs.cases[0].ast)); v.act = c0 === true ? 1 : c0 === false ? 2 : null; }
        }
      }
    }
    return v;
  }
  function sbNum(v) {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    var s = String(parseFloat(v.toPrecision(6)));
    if (s.indexOf('e') >= 0) return s.replace('.', ',');
    var neg = s.charAt(0) === '-'; if (neg) s = s.slice(1);
    var p = s.split('.'); return (neg ? '-' : '') + grpInt(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function fxpSubVal(s, rr) { var v = cellV(s, 'C' + rr); if (typeof v === 'number') return sbNum(v); if (typeof v === 'string') return '“' + v + '”'; if (typeof v === 'boolean') return v ? 'verdadeiro' : 'falso'; return null; }
  function fxpMath(M, ast, withVals) { var ctx = { nm: M.nm, sheet: M.s.name }; if (withVals) ctx.val = function (rr) { return fxpSubVal(M.s, rr); }; return window.WenFx.toHtml(ast, ctx, 0); }
  function fxpSym(M, rn) { var W = window.WenFx; return M.nm.symOf[rn] ? W.symH(M.nm.symOf[rn]) : '<span class="mnm">' + esc(M.nm.nameOf[rn] || ('linha ' + rn)) + '</span>'; }
  function fxpValHtml(M, rn) {
    var s = M.s, v = cellV(s, 'C' + rn), r = M.byR[rn], o = fmtOut(s, r, v), u = txt(cellV(s, 'D' + rn)), e = eqOf(v, u);
    if (o.err) return '<span class="errv" title="' + esc(o.err) + '">—</span>';
    if (typeof v === 'string' && /^[✓✗]/.test(v)) return '<span class="fxst2 ' + (v.charAt(0) === '✓' ? 'ok' : 'err') + '">' + esc(v) + '</span>';
    return '<b>' + esc(o.t) + '</b>' + (u && u !== '-' && o.t !== '' && typeof v !== 'string' ? ' <small>' + esc(u) + '</small>' : '') + (e ? '<small class="eq">(' + esc(e) + ')</small>' : '');
  }
  function fxpCaseMod(s, rn, i) {
    var o = FXORIG[s.name] && FXORIG[s.name]['C' + rn], W = window.WenFx; if (!o || !fxMod(s, 'C' + rn)) return false;
    var a = W.ast(fxRaw(s, 'C' + rn)), b = W.ast(o.v); if (!a || !b || !a.a[i] || !b.a[i]) return false;
    return W.serialize(a.a[i]) !== W.serialize(b.a[i]);
  }
  function fxpRowHtml(M, rn) {
    var s = M.s, W = window.WenFx, V = fxpView(M, rn), info = V.info, r = M.byR[rn], mod = fxMod(s, 'C' + rn), unit = txt(cellV(s, 'D' + rn));
    var eq = '';
    if (!V.isF) { var cv = V.raw; eq = fxpSym(M, rn) + ' <span class="mop">=</span> <span class="fxk0">' + (typeof cv === 'number' ? esc(sbNum(cv)) : esc(cv == null ? '' : String(cv))) + (unit && unit !== '-' ? ' <small>' + esc(unit) + '</small>' : '') + '</span>'; }
    else if (!V.ast) eq = '<code>' + esc(V.raw) + '</code>';
    else if (V.cs) eq = fxpSym(M, rn) + ' <span class="mop">=</span> <span class="fxcs">' + (V.cs.kind === 'choose' ? 'depende do caso escolhido (' + V.cs.cases.length + ' casos)' : 'depende de uma condição') + '</span>';
    else eq = fxpSym(M, rn) + ' <span class="mop">=</span> ' + fxpMath(M, V.ast, false);
    var h = '<article class="fxrw' + (r.kind === 'in' ? ' in' : '') + (mod ? ' mod' : '') + (r.custom ? ' cust' : '') + '" data-r="' + rn + '" id="fxrw-' + rn + '">' +
      '<div class="fxrh"><div class="fxr-n"><button type="button" class="fxr-nm" data-act="fxp-sel" data-r="' + rn + '" aria-pressed="false">' + esc(info ? info.name : ('Linha ' + rn)) + '</button>' +
      (mod ? '<span class="fxtag">' + (r.custom ? 'linha própria' : 'alterada') + '</span>' : '') + '</div>' +
      '<div class="fxr-eq' + (eq.length > 700 ? ' long' : '') + '">' + eq + '</div>' +
      '<div class="fxr-v">' + fxpValHtml(M, rn) + '</div>' +
      '<button type="button" class="btn sm fxr-ed" data-act="fxp-edit" data-r="' + rn + '" aria-label="Editar ' + esc(info ? info.name : '') + '">Editar</button></div>';
    if (V.cs) {
      h += '<ul class="fxcases">';
      V.cs.cases.forEach(function (c) {
        var isAct = c.i === V.act, cm = fxpCaseMod(s, rn, c.i), cname = c.name;
        var head = V.cs.kind === 'if' && c.i === 0 ? '' : fxpSym(M, rn) + ' <span class="mop">=</span> ';
        h += '<li class="fxcase' + (isAct ? ' act' : '') + (cm ? ' mod' : '') + '"><div class="fxcb"><span class="fxcn">' + esc(cname) + (isAct ? '<i class="fxon">' + (V.cs.kind === 'choose' ? 'caso ativo' : 'ativo agora') + '</i>' : '') + (cm ? '<i class="fxtag">alterado</i>' : '') + '</span>' +
          '<span class="fxce">' + head + fxpMath(M, c.ast, false) + '</span><button type="button" class="btn sm fxr-ed" data-act="fxp-edit" data-r="' + rn + '" data-i="' + c.i + '" aria-label="Editar ' + esc(cname) + '">Editar</button></div></li>';
      });
      h += '</ul>';
    }
    return h + '<div class="fxslot" id="fxslot-' + rn + '"></div></article>';
  }
  function fxpBodyHtml(M) {
    var h = '';
    M.blocks.forEach(function (b) {
      h += '<section class="fxb"><h3 class="fxb-h">' + esc(b.title) + '<small>' + b.rows.length + (b.rows.length === 1 ? ' linha' : ' linhas') + '</small></h3>';
      b.rows.forEach(function (rn) { h += fxpRowHtml(M, rn); });
      h += '</section>';
    });
    return h + '<div class="fxslot" id="fxslot-new"></div>';
  }
  function fxpHeadHtml(s) {
    var n = fxCount(s);
    return '<header class="fxp-top"><div class="fxp-t"><h2>Fórmulas</h2><p>' + esc(s.name) + '</p></div>' +
      '<div class="fxp-tools"><label class="filter fxp-find"><input type="search" id="fxp-f" data-act="fxp-filter" placeholder="Buscar por nome ou símbolo (ex.: flecha, Ix, tensão)" autocomplete="off" value="' + esc(FXP.filter) + '"></label>' +
      '<button class="btn sm" data-act="fxp-addrow">+ Linha própria</button><button class="btn sm" data-act="fxio">Exportar / importar</button>' +
      '<button class="btn sm" data-act="fxrestoreall" data-arm="0"' + (n ? '' : ' hidden') + '>Restaurar original</button>' +
      '<button class="btn pri sm" data-act="fxp-close">Fechar</button></div>' +
      '<p class="fxp-leg"><span class="fxp-sw up"></span>de onde vem <span class="fxp-sw dn"></span>para onde vai. Toque no nome de uma linha para destacar. <span class="fxp-n">' + (n ? n + (n === 1 ? ' item alterado' : ' itens alterados') : 'Nada alterado: valores originais') + '</span></p></header>';
  }
  function fxpOpen(s) {
    if (FXP.open) fxpClose(false);
    FXP.open = true; FXP.s = s; FXP.sel = null; FXP.ed = null; FXP.ac = null; FXP.M = fxpBuild(s);
    var ov = document.createElement('div'); ov.id = 'fxpanel'; ov.className = 'fxp'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Fórmulas de ' + s.name);
    ov.innerHTML = fxpHeadHtml(s) + '<div class="fxp-body" id="fxp-body">' + fxpBodyHtml(FXP.M) + '</div>';
    document.body.appendChild(ov); document.body.classList.add('fxp-lock');
    fxpFilterApply(); var f = $('#fxp-f'); if (f) f.focus({ preventScroll: true });
  }
  function fxpClose(refresh) {
    var ov = $('#fxpanel'); if (ov) ov.remove(); document.body.classList.remove('fxp-lock');
    var s = FXP.s; FXP.open = false; FXP.ed = null;
    if (refresh !== false && s && cur.sheet === s) {
      var want = calcModel(s).filter(function (r) { return r.k === 'f' && r.r >= FX_ROW0; }).length, have = $$('.field[data-r]').filter(function (e) { return +e.dataset.r >= FX_ROW0; }).length;
      if (want !== have) rerenderKeep(); else { refreshCalc(s, true); fxBarRefresh(s); }
    }
  }
  function fxpRefresh(keepEd) {
    if (!FXP.open) return; var s = FXP.s, sc = $('#fxpanel'), y = sc ? sc.scrollTop : 0;
    FXP.M = fxpBuild(s);
    var ed = FXP.ed; $('#fxp-body').innerHTML = fxpBodyHtml(FXP.M);
    var top = $('.fxp-top'); if (top) top.outerHTML = fxpHeadHtml(s);
    fxpFilterApply(); fxpMark();
    if (sc) sc.scrollTop = y;
    if (keepEd && ed) { FXP.ed = null; fxpEdit(ed.r, ed.i == null ? null : ed.i, true); }
  }
  // ---- destaque "de onde vem / para onde vai"
  function fxpMark() {
    var M = FXP.M; $$('#fxpanel .fxrw').forEach(function (e) { e.classList.remove('sel', 'up', 'dn', 'up1', 'dn1'); var b = $('.fxr-nm', e); if (b) b.setAttribute('aria-pressed', 'false'); });
    if (FXP.sel == null || !M) return;
    var W = window.WenFx, up = W.closure(M.g, FXP.sel, 'deps'), dn = W.closure(M.g, FXP.sel, 'users'), d1 = M.g[FXP.sel] ? M.g[FXP.sel].deps : [], u1 = M.g[FXP.sel] ? M.g[FXP.sel].users : [];
    var se = $('#fxrw-' + FXP.sel); if (se) { se.classList.add('sel'); var sb = $('.fxr-nm', se); if (sb) sb.setAttribute('aria-pressed', 'true'); }
    up.forEach(function (r) { var e = $('#fxrw-' + r); if (e) { e.classList.add('up'); if (d1.indexOf(r) >= 0) e.classList.add('up1'); } });
    dn.forEach(function (r) { var e = $('#fxrw-' + r); if (e) { e.classList.add('dn'); if (u1.indexOf(r) >= 0) e.classList.add('dn1'); } });
  }
  function fxpSelect(rn) { FXP.sel = FXP.sel === rn ? null : rn; fxpMark(); }
  function fxpFilterApply() {
    var q = fold(FXP.filter).split(/\s+/).filter(Boolean), M = FXP.M; if (!M) return;
    $$('#fxpanel .fxrw').forEach(function (e) {
      var rn = +e.dataset.r, info = M.nm.byRow[rn], hay = fold((info ? info.name + ' ' + (M.nm.symOf[rn] || '') : '') + ' ' + e.textContent);
      e.hidden = !q.every(function (w) { return hay.indexOf(w) >= 0; });
    });
    $$('#fxpanel .fxb').forEach(function (b) { b.hidden = !$$('.fxrw', b).some(function (e) { return !e.hidden; }); });
  }
  // ---- editor
  function fxpInitText(M, rn, i) {
    var W = window.WenFx, raw = M.s.cells['C' + rn];
    if (!fxIsF(raw)) return typeof raw === 'number' ? numStr(raw) : String(raw == null ? '' : raw);
    var a = W.ast(raw); if (!a) return raw;
    return i == null ? W.toEdit(a, M.ctx) : W.toEdit(a.a[i], M.ctx);
  }
  function fxpEdit(rn, i, silent) {
    var M = FXP.M, s = FXP.s, r = M.byR[rn]; if (!r) return;
    fxpCloseEd();
    var slot = $('#fxslot-' + rn); if (!slot) return;
    var W = window.WenFx, info = M.nm.byRow[rn], raw = s.cells['C' + rn], V = fxpView(M, rn), cname = null;
    if (i != null && V.cs) { var cc = V.cs.cases.filter(function (c) { return c.i === i; })[0]; cname = cc ? cc.name : null; }
    FXP.ed = { r: rn, i: i == null ? null : i, kind: V.cs ? V.cs.kind : null };
    var mod = fxMod(s, 'C' + rn), isIn = r.kind === 'in' && !fxIsF(raw);
    var title = (i != null ? 'Caso “' + (cname || ('caso ' + i)) + '” de ' : (isIn ? 'Valor padrão de ' : 'Fórmula de ')) + (info ? info.name : '');
    slot.innerHTML = '<div class="fxe" role="group" aria-label="' + esc(title) + '"><label class="fxe-l" for="fxpt">' + esc(title) + '</label>' +
      (r.custom ? '<div class="fxrow2"><label>Nome da linha<input id="fxp-lab" type="text" value="' + esc(info ? info.name : '') + '" autocomplete="off"></label><label>Unidade<input id="fxp-un" type="text" value="' + esc(txt(cellV(s, 'D' + rn))) + '" autocomplete="off"></label></div>' : '') +
      fxpToolsHtml() + '<div class="fxe-f"><textarea id="fxpt" rows="2" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" data-act="fxp-in" aria-describedby="fxpmsg fxpnow" aria-autocomplete="list" aria-controls="fxpac">' + esc(fxpInitText(M, rn, i)) + '</textarea><div class="fxac" id="fxpac" role="listbox" hidden></div></div>' +
      '<p class="fxnow" id="fxpnow" aria-live="polite"></p><p class="fxmsg" id="fxpmsg" role="alert" hidden></p>' +
      '<div class="fxbtns"><button type="button" class="btn pri sm" data-act="fxp-apply">Aplicar</button><button type="button" class="btn sm" data-act="fxp-cancel">Cancelar</button>' +
      (mod && !r.custom ? '<button type="button" class="btn sm" data-act="fxp-restore">' + (i != null ? 'Restaurar este caso' : 'Restaurar original') + '</button>' : '') +
      (r.custom ? '<button type="button" class="btn sm dng" data-act="fxp-del">Excluir linha</button>' : '') + '</div>' +
      '<p class="fxe-h">Escreva com os nomes ou símbolos (digite <b>[</b> ou uma letra para ver a lista). Potência com ^, raiz com √( ), pi com π. Decimal com vírgula ou ponto. Enter aplica, Esc cancela.</p></div>';
    var ta = $('#fxpt'); fxpGrow(ta); fxpLive(); if (!silent) ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { }
    var rw = $('#fxrw-' + rn); if (rw && !silent) rw.scrollIntoView({ block: 'nearest' });
  }
  function fxpToolsHtml() {
    var b = [['^', '^', 'Potência'], ['√', '√(|)', 'Raiz quadrada'], ['π', 'π', 'Pi'], ['×', '·', 'Multiplicar'], ['÷', '/', 'Dividir'], ['(', '(', 'Abrir parêntese'], [')', ')', 'Fechar parêntese'], ['SE', 'SE(|; ; )', 'Se (condição; então; senão)'], ['MÍN', 'MÍN(|; )', 'Menor valor'], ['MÁX', 'MÁX(|; )', 'Maior valor'], ['ABS', 'ABS(|)', 'Valor absoluto']];
    return '<div class="fxtools" role="toolbar" aria-label="Operadores">' + b.map(function (x) { return '<button type="button" class="fxop" data-act="fxp-op" data-t="' + esc(x[1]) + '" title="' + esc(x[2]) + '" aria-label="' + esc(x[2]) + '">' + esc(x[0]) + '</button>'; }).join('') + '</div>';
  }
  function fxpGrow(ta) { if (!ta) return; ta.style.height = 'auto'; ta.style.height = Math.min(220, Math.max(56, ta.scrollHeight + 2)) + 'px'; }
  function fxpCloseEd() {
    if (!FXP.ed) return; var rn = FXP.ed.r, slot = $('#fxslot-' + rn); if (slot) slot.innerHTML = ''; FXP.ed = null; fxpAcClose();
  }
  // lê o editor e testa SEM aplicar
  function fxpEvaluate() {
    var ed = FXP.ed, M = FXP.M, s = FXP.s, W = window.WenFx, ta = $('#fxpt'); if (!ed || !ta) return null;
    if (ed.isNew) {
      if (!ta.value.trim()) return { ok: false, error: 'Digite a fórmula da nova linha.' };
      var cn = W.fromEdit(ta.value, M.nm); if (!cn.ok) return cn;
      var ck = ENG.check(s.name, 'C2001', cn.raw); if (!ck.ok) return ck;
      return { ok: true, raw: cn.raw, exprAst: cn.ast, exprValue: ck.value, value: ck.value, warn: ck.warn, isNew: true };
    }
    var rn = ed.r, r = M.byR[rn], addr = 'C' + rn, cur = s.cells[addr], text = ta.value, t = text.trim();
    if (!t) return { ok: false, error: 'Digite uma fórmula ou um valor.' };
    var isConstRow = !fxIsF(cur) && ed.i == null && t.charAt(0) !== '=';
    if (isConstRow) {
      var n = parseNum(t);
      if (n !== null && !isNaN(n) && /^[-+]?[\d\s.,]+$/.test(t)) return { ok: true, raw: n, constant: true, value: n };
      if (typeof cur === 'number' || r.num) { var tryF = W.fromEdit(t, M.nm); if (!tryF.ok) return { ok: false, error: 'Valor numérico inválido. Digite um número (9,53) ou uma fórmula que comece com =.' }; return fxpFormula(M, s, rn, tryF); }
      if (/[A-Za-z0-9]/.test(t) && !/[()\[\]]/.test(t) || (r.items && r.items.indexOf(t) >= 0)) return { ok: true, raw: t, constant: true, value: t };
    }
    var conv = W.fromEdit(t, M.nm); if (!conv.ok) return conv;
    if (ed.i != null) {
      var full = W.withCase(cur, ed.kind, ed.i, conv.raw); if (!full) return { ok: false, error: 'Não foi possível montar a fórmula com este caso.' };
      var ex = ENG.check(s.name, 'C2000', conv.raw); if (!ex.ok) return ex;
      var chk = ENG.check(s.name, addr, full); if (!chk.ok) return chk;
      return { ok: true, raw: full, exprAst: conv.ast, exprValue: ex.value, value: chk.value, warn: ex.warn || chk.warn, partial: true };
    }
    return fxpFormula(M, s, rn, conv);
  }
  function fxpFormula(M, s, rn, conv) {
    var chk = ENG.check(s.name, 'C' + rn, conv.raw); if (!chk.ok) return chk;
    return { ok: true, raw: conv.raw, exprAst: conv.ast, exprValue: chk.value, value: chk.value, warn: chk.warn };
  }
  function fxpLive() {
    var ed = FXP.ed; if (!ed) return; var M = FXP.M, s = FXP.s, c = fxpEvaluate(), msg = $('#fxpmsg'), now = $('#fxpnow'), ap = $('[data-act="fxp-apply"]'), ta = $('#fxpt');
    if (!msg || !now) return;
    if (!c.ok) { msg.hidden = false; msg.className = 'fxmsg err'; msg.textContent = c.error; now.innerHTML = ''; if (ta) ta.setAttribute('aria-invalid', 'true'); if (ap) ap.disabled = true; return; }
    if (ta) ta.removeAttribute('aria-invalid'); if (ap) ap.disabled = false;
    if (c.warn) { msg.hidden = false; msg.className = 'fxmsg warn'; msg.textContent = c.warn; } else { msg.hidden = true; msg.textContent = ''; }
    if (c.isNew) {
      var un0 = (($('#fxp-un') || {}).value || '').trim(), lb0 = (($('#fxp-lab') || {}).value || '').trim() || 'Nova linha', e0 = typeof c.value === 'number' ? eqOf(c.value, un0) : '';
      now.innerHTML = '<span class="fxnl">Valor agora</span> <span class="mnm">' + esc(lb0) + '</span> <span class="mop">=</span> ' + fxpMath(M, c.exprAst, true) + ' <span class="mop">=</span> <b class="fxres">' + esc(typeof c.value === 'number' ? sbNum(c.value) : String(c.value)) + (un0 ? ' ' + esc(un0) : '') + (e0 ? ' (' + esc(e0) + ')' : '') + '</b>'; return;
    }
    var rn = ed.r, unit = txt(cellV(s, 'D' + rn)), val = c.exprValue !== undefined ? c.exprValue : c.value, vt;
    function fmt(v) { var r = M.byR[rn], o = fmtOut(s, r, v), e = eqOf(v, unit); return (o.err ? o.err : o.t) + (unit && unit !== '-' && typeof v !== 'string' && !o.err ? ' ' + unit : '') + (e ? ' (' + e + ')' : ''); }
    if (c.constant) { now.innerHTML = '<span class="fxnl">Valor agora</span> ' + fxpSym(M, rn) + ' <span class="mop">=</span> <b>' + esc(typeof c.value === 'number' ? fmt(c.value) : c.value) + '</b>'; return; }
    now.innerHTML = '<span class="fxnl">Valor agora</span> ' + fxpSym(M, rn) + ' <span class="mop">=</span> ' + fxpMath(M, c.exprAst, true) + ' <span class="mop">=</span> <b class="fxres">' + esc(fmt(val)) + '</b>';
  }
  function fxpApply() {
    var ed = FXP.ed; if (!ed) return; var M = FXP.M, s = FXP.s, rn = ed.r, c = fxpEvaluate();
    if (!c || !c.ok) { fxpLive(); var t0 = $('#fxpt'); if (t0) t0.focus(); return; }
    var r = M.byR[rn], d = fxData(s, true);
    if (r.custom) {
      var lb = (($('#fxp-lab') || {}).value || '').trim() || 'Linha própria', un = (($('#fxp-un') || {}).value || '').trim(), ce = d.add.filter(function (x) { return x.r === rn; })[0];
      if (!fxIsF(c.raw)) { var m0 = $('#fxpmsg'); m0.hidden = false; m0.className = 'fxmsg err'; m0.textContent = 'A linha própria precisa de uma fórmula (use =, nomes e operadores).'; return; }
      if (ce) { ce.l = lb; ce.u = un; ce.f = c.raw; } fxApplyAdd(s); fxSave();
    } else {
      fxSetCell(s, 'C' + rn, c.raw);
      if (r.kind === 'in') clearInput(s, 'C' + rn);
    }
    FXP.ed = null; fxpRefresh(false); toast(r.kind === 'in' && c.constant ? 'Valor padrão alterado' : 'Fórmula aplicada e recalculada');
    var b = $('#fxrw-' + rn + ' .fxr-ed'); if (b) b.focus({ preventScroll: true });
  }
  function fxpRestore() {
    var ed = FXP.ed; if (!ed) return; var M = FXP.M, s = FXP.s, rn = ed.r, W = window.WenFx, addr = 'C' + rn;
    if (ed.i != null) {
      var o = FXORIG[s.name] && FXORIG[s.name][addr], oe = o ? W.caseExprRaw(o.v, ed.i) : null;
      if (oe) { var full = W.withCase(s.cells[addr], ed.kind, ed.i, oe); if (full) { var oa = W.ast(o.v), na = W.ast(full); if (W.serialize(oa) === W.serialize(na)) fxRestoreCell(s, addr); else fxSetCell(s, addr, full); } }
    } else { fxRestoreCell(s, addr); var r = M.byR[rn]; if (r && r.kind === 'in') clearInput(s, addr); }
    FXP.ed = null; fxpRefresh(false); toast(ed.i != null ? 'Caso restaurado' : 'Original restaurado');
  }
  function fxpDel() {
    var ed = FXP.ed; if (!ed) return; var s = FXP.s, d = fxData(s, false); if (!d) return;
    d.add = d.add.filter(function (x) { return x.r !== ed.r; }); FXP.ed = null; fxApplyAdd(s); fxSave(); fxpRefresh(false); toast('Linha própria excluída');
  }
  // ---- nova linha própria
  function fxpNew() {
    fxpCloseEd(); var slot = $('#fxslot-new'), M = FXP.M; if (!slot) return;
    FXP.ed = { r: -1, i: null, kind: null, isNew: true };
    slot.innerHTML = '<div class="fxe fxe-new" role="group" aria-label="Nova linha própria"><label class="fxe-l" for="fxpt">Nova linha própria</label>' +
      '<div class="fxrow2"><label>Nome da linha<input id="fxp-lab" type="text" placeholder="Ex.: Flecha fixa de 5 mm" autocomplete="off"></label><label>Unidade<input id="fxp-un" type="text" placeholder="mm" autocomplete="off"></label></div>' +
      fxpToolsHtml() + '<div class="fxe-f"><textarea id="fxpt" rows="2" spellcheck="false" autocapitalize="off" autocomplete="off" data-act="fxp-in" placeholder="Ex.: L/300" aria-describedby="fxpmsg fxpnow" aria-autocomplete="list" aria-controls="fxpac"></textarea><div class="fxac" id="fxpac" role="listbox" hidden></div></div>' +
      '<p class="fxnow" id="fxpnow" aria-live="polite"></p><p class="fxmsg" id="fxpmsg" role="alert" hidden></p>' +
      '<div class="fxbtns"><button type="button" class="btn pri sm" data-act="fxp-apply">Adicionar linha</button><button type="button" class="btn sm" data-act="fxp-cancel">Cancelar</button></div></div>';
    var lab = $('#fxp-lab'); if (lab) lab.focus(); slot.scrollIntoView({ block: 'nearest' });
  }
  function fxpApplyNew() {
    var M = FXP.M, s = FXP.s, W = window.WenFx, ta = $('#fxpt'), lab = (($('#fxp-lab') || {}).value || '').trim(), un = (($('#fxp-un') || {}).value || '').trim(), msg = $('#fxpmsg');
    function bad(t) { msg.hidden = false; msg.className = 'fxmsg err'; msg.textContent = t; }
    if (!lab) return bad('Dê um nome para a linha.');
    var conv = W.fromEdit(ta.value, M.nm); if (!conv.ok) return bad(conv.error);
    var d = fxData(s, true), nr = FX_ROW0 + 1 + d.add.reduce(function (mx, x) { return Math.max(mx, x.r - FX_ROW0); }, 0);
    var c = ENG.check(s.name, 'C' + nr, conv.raw); if (!c.ok) return bad(c.error);
    d.add.push({ r: nr, l: lab, f: conv.raw, u: un }); fxApplyAdd(s); fxSave(); FXP.ed = null; fxpRefresh(false); toast('Linha própria adicionada');
    var el = $('#fxrw-' + nr); if (el) el.scrollIntoView({ block: 'center' });
  }
  // ---- autocompletar
  function fxpToken(ta) {
    var p = ta.selectionStart, t = ta.value.slice(0, p), m = /\[([^\]\[]*)$/.exec(t);
    if (m) return { q: m[1], start: p - m[1].length - 1, end: p, br: true };
    m = /([A-Za-zÀ-ÿα-ωΑ-Ω_][A-Za-zÀ-ÿα-ωΑ-Ω0-9_]*)$/.exec(t);
    if (m && !/[0-9]$/.test(t.slice(0, t.length - m[0].length)) && !/[\]]$/.test(t.slice(0, t.length - m[0].length))) return { q: m[1], start: p - m[1].length, end: p, br: false };
    return null;
  }
  var FXFN = [['SE', 'SE(', 'se (condição; então; senão)'], ['MÍN', 'MÍN(', 'menor valor'], ['MÁX', 'MÁX(', 'maior valor'], ['ABS', 'ABS(', 'valor absoluto'], ['RAIZ', 'RAIZ(', 'raiz quadrada'], ['ARRED', 'ARRED(', 'arredondar (valor; casas)'], ['POTÊNCIA', 'POTÊNCIA(', 'potência (base; expoente)'], ['E', 'E(', 'todas verdadeiras'], ['OU', 'OU(', 'alguma verdadeira']];
  function fxpAcUpdate() {
    var ta = $('#fxpt'), box = $('#fxpac'); if (!ta || !box || !FXP.ed) return;
    var tk = fxpToken(ta); if (!tk || (!tk.br && tk.q.length < 1)) return fxpAcClose();
    var M = FXP.M, s = FXP.s, q = fold(tk.q), items = [];
    M.nm.rows.forEach(function (x) {
      if (x.r === FXP.ed.r) return; var sy = M.nm.symOf[x.r] || '', nmf = fold(x.name), hit = tk.br ? (!q || nmf.indexOf(q) >= 0 || fold(sy).indexOf(q) === 0) : (sy && fold(sy).indexOf(q) === 0) || nmf.split(/[^a-z0-9α-ω]+/).some(function (w) { return w.length > 1 && w.indexOf(q) === 0; });
      if (hit) items.push({ ins: sy || ('[' + (M.nm.nameOf[x.r]) + ']'), sym: sy, name: x.name, r: x.r, rank: (sy && fold(sy) === q ? 0 : sy && fold(sy).indexOf(q) === 0 ? 1 : 2) });
    });
    items.sort(function (a, b) { return a.rank - b.rank; });
    if (!tk.br) FXFN.forEach(function (f) { if (fold(f[0]).indexOf(q) === 0 && q.length >= 1 && !items.some(function (x) { return x.sym === f[0]; })) items.push({ ins: f[1], fn: true, sym: f[0], name: f[2], r: null, rank: 3 }); });
    items = items.slice(0, 8);
    if (!items.length) return fxpAcClose();
    FXP.ac = { tk: tk, items: items, i: 0 };
    box.innerHTML = items.map(function (x, k) {
      var v = x.r != null ? fxpValHtmlPlain(M, x.r) : '';
      return '<button type="button" class="fxai" role="option" id="fxai-' + k + '" data-act="fxp-pick" data-k="' + k + '" aria-selected="' + (k === 0) + '"><b>' + (x.sym ? window.WenFx.symH(x.sym) : '') + '</b><span>' + esc(x.name) + '</span><i>' + esc(v) + '</i></button>';
    }).join(''); box.hidden = false;
  }
  function fxpValHtmlPlain(M, rn) { var s = M.s, v = cellV(s, 'C' + rn), o = fmtOut(s, M.byR[rn], v), u = txt(cellV(s, 'D' + rn)); return (o.err ? '—' : o.t) + (u && u !== '-' && typeof v !== 'string' ? ' ' + u : ''); }
  function fxpAcClose() { var box = $('#fxpac'); if (box) { box.hidden = true; box.innerHTML = ''; } FXP.ac = null; }
  function fxpAcMove(d) {
    if (!FXP.ac) return; var n = FXP.ac.items.length; FXP.ac.i = (FXP.ac.i + d + n) % n;
    $$('#fxpac .fxai').forEach(function (b, k) { b.setAttribute('aria-selected', k === FXP.ac.i); if (k === FXP.ac.i) b.scrollIntoView({ block: 'nearest' }); });
  }
  function fxpAcPick(k) {
    var ac = FXP.ac, ta = $('#fxpt'); if (!ac || !ta) return; var it = ac.items[k == null ? ac.i : k], tk = ac.tk;
    var v = ta.value, ins = it.ins; ta.value = v.slice(0, tk.start) + ins + v.slice(tk.end); var pos = tk.start + ins.length; ta.focus(); try { ta.setSelectionRange(pos, pos); } catch (e) { }
    fxpAcClose(); fxpGrow(ta); fxpLive();
  }
  function fxpInsertOp(t) {
    var ta = $('#fxpt'); if (!ta) return; var a = ta.selectionStart, b = ta.selectionEnd, caret = t.indexOf('|'), text = t.replace('|', '');
    var sel = ta.value.slice(a, b); if (caret >= 0 && sel && /\|/.test(t)) text = t.replace('|', sel);
    ta.value = ta.value.slice(0, a) + text + ta.value.slice(b); var pos = a + (caret >= 0 ? caret + (sel || '').length : text.length);
    ta.focus(); try { ta.setSelectionRange(pos, pos); } catch (e) { } fxpGrow(ta); fxpLive(); fxpAcClose();
  }
  function fxpMemoMods(s) {
    var mods = fxModList(s); if (!mods.length) return '';
    var M = fxpBuild(s), W = window.WenFx, h = '<h2>Fórmulas alteradas pelo usuário</h2><table class="mt meq"><thead><tr><th>Grandeza / caso</th><th>Fórmula usada neste memorial</th><th>Fórmula original da planilha</th></tr></thead><tbody>';
    function row(name, a, b, extra) { return '<tr class="modr"><td>' + esc(name) + (extra || '') + '</td><td class="mth">' + a + '</td><td class="mth">' + b + '</td></tr>'; }
    function txtOf(raw) { return '<span class="nt">' + esc(raw === '' || raw == null ? '(vazio)' : String(raw)) + '</span>'; }
    mods.forEach(function (x) {
      var rn = +x.a.slice(1), sym = fxpSym(M, rn), curA = fxIsF(x.cur) ? W.ast(x.cur) : null, oriA = (!x.custom && fxIsF(x.orig)) ? W.ast(x.orig) : null;
      var curH = curA ? sym + ' = ' + fxpMath(M, curA, false) : sym + ' = ' + txtOf(x.cur);
      if (x.custom) { h += row(x.l, curH, '<span class="nt">não existe na planilha (linha própria)</span>'); return; }
      if (curA && oriA && curA.k === 'fn' && oriA.k === 'fn' && curA.n === oriA.n && curA.a.length === oriA.a.length && (curA.n === 'CHOOSE' || curA.n === 'IF')) {
        var cs = W.cases(x.cur, { caseNames: function (hd) { return fxpCaseNames(M, hd); } }), any = false;
        cs.cases.forEach(function (c) { var oa = oriA.a[c.i]; if (oa && W.serialize(c.ast) !== W.serialize(oa)) { any = true; h += row(x.l, sym + ' = ' + fxpMath(M, c.ast, false), sym + ' = ' + fxpMath(M, oa, false), '<br><span class="nt">' + esc(c.name) + '</span>'); } });
        if (any) return;
      }
      h += row(x.l, curH, oriA ? sym + ' = ' + fxpMath(M, oriA, false) : sym + ' = ' + txtOf(x.orig));
    });
    return h + '</tbody></table>';
  }
  // ---- memorial: equações usadas (caso ativo) com os números
  function fxpMemoEquations(s) {
    var M = fxpBuild(s), W = window.WenFx, out = [];
    M.blocks.forEach(function (b) {
      b.rows.forEach(function (rn) {
        var r = M.byR[rn]; if (r.kind === 'in') return; var raw = s.cells['C' + rn]; if (!fxIsF(raw)) return;
        var v = cellV(s, 'C' + rn); if (typeof v !== 'number') return;
        var V = fxpView(M, rn); if (!V.ast) return; var ast = V.ast, casename = null;
        if (V.cs && V.cs.kind === 'choose' && V.act) { var cc = V.cs.cases.filter(function (c) { return c.i === V.act; })[0]; if (cc) { ast = cc.ast; casename = cc.name; } }
        else if (V.cs) return;
        var trivial = ast.k === 'ref' && ast.single;
        if (trivial) return;
        out.push({ rn: rn, name: M.nm.byRow[rn].name, casename: casename, sym: fxpSym(M, rn), eq: fxpMath(M, ast, false), num: fxpMath(M, ast, true), val: fxpValHtmlPlain(M, rn), mod: fxMod(s, 'C' + rn), unit: txt(cellV(s, 'D' + rn)), v: v });
      });
    });
    return out;
  }
  function fxpMemoHtml(s) {
    var eqs = fxpMemoEquations(s); if (!eqs.length) return '';
    return '<h2>Equações usadas (caso selecionado, com os números)</h2><table class="mt meq"><thead><tr><th>Grandeza</th><th>Equação</th><th class="r">Com os números</th></tr></thead><tbody>' + eqs.map(function (x) {
      var e = eqOf(x.v, x.unit);
      return '<tr' + (x.mod ? ' class="modr"' : '') + '><td>' + esc(x.name) + (x.casename ? '<br><span class="nt">' + esc(x.casename) + '</span>' : '') + (x.mod ? '<br><span class="modn">fórmula alterada pelo usuário</span>' : '') + '</td><td class="mth">' + x.sym + ' = ' + x.eq + '</td><td class="mth">' + x.sym + ' = ' + x.num + ' = <b>' + esc(x.val) + '</b>' + (e ? ' <span class="nt">(' + esc(e) + ')</span>' : '') + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  // ---------------------------------------------------------------- eventos
  var wakeLock = null;
  function applyWake() {
    if (!('wakeLock' in navigator)) return;
    if (S.wake && document.visibilityState === 'visible') navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }, function () { });
    else if (wakeLock) { wakeLock.release().catch(function () { }); wakeLock = null; }
  }
  document.addEventListener('visibilitychange', applyWake);

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var a = t.dataset.act, s = cur.sheet;
    switch (a) {
      case 'back': if (history.length > 1 && document.referrer !== '' || history.state !== null) history.back(); else { var p = parseHash(); go(p.parts[0] === 's' ? 'c/' + BYNUM[p.parts[1]].ch : ''); } break;
      case 'open': buzz(); go('s/' + t.dataset.num); break;
      case 'chap': buzz(); go('c/' + t.dataset.n); break;
      case 'acc': t.parentNode.classList.toggle('open'); break;
      case 'gosearch': go('search'); break;
      case 'gopanel': go('panel'); break;
      case 'gohelp': go('help'); break;
      case 'goresult': go(t.dataset.go); break;
      case 'fav': toggleFav(t.dataset.num); t.classList.toggle('on', isFav(t.dataset.num)); t.setAttribute('aria-pressed', isFav(t.dataset.num)); t.innerHTML = ic(isFav(t.dataset.num) ? 'starf' : 'star'); toast(isFav(t.dataset.num) ? 'Adicionado aos favoritos' : 'Removido dos favoritos'); break;
      case 'clearrec': REC = []; LS.set('recent', REC); render(); break;
      case 'jump': var el = document.getElementById(t.dataset.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'zoom': lightbox(t.dataset.src); break;
      case 'tsort': (function () {
        var th = t, tb = th.closest('table'), body = $('tbody', tb), ci = th.cellIndex;
        var cur = th.getAttribute('aria-sort'), nx = cur === 'none' ? 'ascending' : cur === 'ascending' ? 'descending' : 'none';
        $$('th', tb).forEach(function (x) { x.setAttribute('aria-sort', 'none'); });
        th.setAttribute('aria-sort', nx);
        var rows = $$('tr', body), key = function (tr) { var s = tr.cells[ci].textContent.trim(), n = parseNum(s); return (n !== null && !isNaN(n) && /^[-\d.,\s]+$/.test(s)) ? n : s.toLowerCase(); };
        rows.sort(function (a, b2) {
          if (nx === 'none') return +a.dataset.o - +b2.dataset.o;
          var x = key(a), y = key(b2), d;
          if (typeof x === 'number' && typeof y === 'number') d = x - y; else if (typeof x === 'number') d = -1; else if (typeof y === 'number') d = 1; else d = String(x).localeCompare(String(y), 'pt-BR', { numeric: true });
          if (x === '' && y !== '') d = 1; else if (y === '' && x !== '') d = -1; else if (nx === 'descending') d = -d;
          return d || (+a.dataset.o - +b2.dataset.o);
        });
        rows.forEach(function (r) { body.appendChild(r); }); buzz(4);
      })(); break;
      case 'ptedit': if (s) ptEdit(s, +t.dataset.b, +t.dataset.r); break;
      case 'ptadd': if (s) ptEdit(s, +t.dataset.b, ptRows(s, +t.dataset.b).length); break;
      case 'libopen': if (s) libPick(s); break;
      case 'preopen': if (s) prePick(s, +t.dataset.p, t.closest('.libcard')); break;
      case 'libclear': if (s) { libClear(s); libRefresh(s); toast('Perfil removido'); } break;
      case 'libaxis': if (s && LIBSEL[s.num]) { var le = libFind(LIBSEL[s.num].id); if (le) { libApply(s, le, t.dataset.v); libRefresh(s); } } break;
      case 'grpadd': if (s) { var gg = LGROUPS.filter(function (x) { return x.k === t.dataset.g; })[0]; closeSheet(true); groupEdit(gg, (LST[gg.k] || []).length); } break;
      case 'grpman': if (s) { var g2 = LGROUPS.filter(function (x) { return x.k === t.dataset.g; })[0]; closeSheet(true); groupManage(g2); } break;
      case 'matedit': matEdit(+t.dataset.r); break;
      case 'matadd': matEdit(MATS.length); break;
      case 'rowdetail': if (s) rowDetail(s, +t.dataset.b, +t.dataset.r); break;
      case 'closesheet': closeSheet(); break;
      case 'qclear': var q = $('#q'); if (q) { q.value = ''; q.dispatchEvent(new Event('input')); q.focus(); } break;
      case 'sf': sFilter = t.dataset.v; $$('#sfilters .chip').forEach(function (c) { c.classList.toggle('on', c === t); }); var q2 = $('#q'); if (q2) q2.dispatchEvent(new Event('input')); break;
      case 'sug': var q3 = $('#q'); q3.value = t.dataset.q; q3.dispatchEvent(new Event('input')); break;
      case 'pick': if (s) { var r = calcModel(s).filter(function (x) { return x.r === +t.closest('.field').dataset.r; })[0]; pickDialog(s, r); } break;
      case 'segpick': if (s) { var rr = +t.closest('.field').dataset.r; setInput(s, 'C' + rr, t.dataset.v); buzz(); refreshCalc(s, true); } break;
      case 'unglobal': if (s) { clearInput(s, 'C' + t.closest('.field').dataset.r); refreshCalc(s, true); } break;
      case 'sumtog': var sm = $('#sum'); sm.dataset.open = sm.classList.contains('open') ? '0' : '1'; sm.classList.toggle('open'); t.setAttribute('aria-expanded', sm.classList.contains('open')); break;
      case 'copycalc': if (s) copyText(calcSummaryText(s)); break;
      case 'resetcalc': if (s) resetCalc(s); break;
      case 'step': (function () { var inp = t.closest('.inp').querySelector('input'); if (inp) stepInput(inp, +t.dataset.d, 1); })(); break;
      case 'fxtoggle': if (s) fxpOpen(s); break;
      case 'fxp-close': fxpClose(); break;
      case 'fxp-sel': fxpSelect(+t.dataset.r); break;
      case 'fxp-edit': fxpEdit(+t.dataset.r, t.dataset.i == null ? null : +t.dataset.i); break;
      case 'fxp-apply': if (FXP.ed && FXP.ed.isNew) fxpApplyNew(); else fxpApply(); break;
      case 'fxp-cancel': fxpCloseEd(); break;
      case 'fxp-restore': fxpRestore(); break;
      case 'fxp-del': fxpDel(); break;
      case 'fxp-addrow': fxpNew(); break;
      case 'fxp-op': fxpInsertOp(t.dataset.t); break;
      case 'fxp-pick': fxpAcPick(+t.dataset.k); break;
      case 'fxedit': if (s) fxOpen(s, +t.dataset.r); break;
      case 'fxapply': if (s) fxApply(s); break;
      case 'fxcancel': fxCloseEditor(true); break;
      case 'fxrestore': if (s) fxRestoreOne(s); break;
      case 'fxdelrow': if (s) fxDelRow(s); break;
      case 'fxins': fxInsert('fxta', t.dataset.ref); if (s) fxLive(s); break;
      case 'fxnins': fxInsert('fxn-f', t.dataset.ref); break;
      case 'fxaddrow': if (s) fxAddRowForm(s); break;
      case 'fxnadd': if (s) fxAddRowDo(s); break;
      case 'fxio': if (s) fxIOForm(s); break;
      case 'fxscope': fxIOFill(s, t.dataset.v === '1'); break;
      case 'fxcopy': (function () { var x = $('#fxx'); if (x) copyText(x.value); })(); break;
      case 'fxdl': (function () { var x = $('#fxx'); if (!x) return; var b = new Blob([x.value], { type: 'application/json' }); var a2 = document.createElement('a'); a2.href = URL.createObjectURL(b); a2.download = 'manual-wen-formulas.json'; document.body.appendChild(a2); a2.click(); a2.remove(); setTimeout(function () { URL.revokeObjectURL(a2.href); }, 2000); })(); break;
      case 'fximport': (function () { var x = $('#fxi'); fxImportDo(x ? x.value : ''); })(); break;
      case 'fxfile': (function () { var f = document.createElement('input'); f.type = 'file'; f.accept = 'application/json,.json,text/plain'; f.onchange = function () { var rd = new FileReader(); rd.onload = function () { fxImportDo(String(rd.result)); }; rd.readAsText(f.files[0]); }; f.click(); })(); break;
      case 'fxrestoreall': if (s) {
        if (t.dataset.arm !== '1') { t.dataset.arm = '1'; t.textContent = 'Confirmar: descartar alterações'; t.classList.add('dng'); setTimeout(function () { if (t.isConnected) { t.dataset.arm = '0'; t.textContent = 'Restaurar original'; t.classList.remove('dng'); } }, 4000); }
        else { fxRestoreAll(s); FXEDIT = null; FXP.ed = null; if (FXP.open) fxpRefresh(false); else rerenderKeep(); toast('Fórmulas originais restauradas'); } } break;
      case 'memorial': if (s) memorialForm(s); break;
      case 'memogen': if (s) memorialGen(s); break;
      case 'memoprint': memorialPrint(); break;
      case 'memoclose': memorialClose(); break;
      case 'cvswap': var row = t.closest('.cv'); row.dataset.inv = row.dataset.inv === '1' ? '0' : '1'; buzz(); cvUpdate(row, s); break;
      case 'theme': S.theme = t.dataset.v; saveSettings(); applyLook(); $$('.thm').forEach(function (b) { b.setAttribute('aria-pressed', b === t); }); break;
      case 'accent': S.accent = t.dataset.v; saveSettings(); applyLook(); $$('.sw-btn').forEach(function (b) { b.setAttribute('aria-pressed', b === t); }); $('#accname').textContent = t.getAttribute('aria-label'); break;
      case 'tog': var k = t.dataset.k, on = t.getAttribute('aria-checked') !== 'true'; t.setAttribute('aria-checked', on); buzz();
        if (k === 'dens') S.dens = on ? 'compact' : 'cozy'; else if (k === 'motion') S.motion = on ? 'off' : 'auto'; else S[k] = on;
        if (k === 'comma') ENG.setOpts({ comma: on }); saveSettings(); applyLook(); if (k === 'wake') applyWake(); break;
      case 'install': doInstall(); break;
      case 'export': exportData(); break;
      case 'import': importData(); break;
      case 'wipe': if (confirm('Apagar preferências, favoritos e valores salvos?')) { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('wen.') === 0) localStorage.removeItem(k); }); location.reload(); } break;
    }
  });
  document.addEventListener('input', function (e) {
    var t = e.target; if (!t.dataset || !t.dataset.act) return; var s = cur.sheet;
    if (t.dataset.act === 'numin' && s) {
      var field = t.closest('.field'), r = +field.dataset.r, wrap = t.closest('.inp');
      if (t.dataset.text) { setInput(s, 'C' + r, t.value); }
      else { var n = parseNum(t.value); if (n !== null && isNaN(n)) { wrap.classList.add('bad'); return; } wrap.classList.remove('bad'); setInput(s, 'C' + r, n === null ? 0 : n); }
      var ecx = field.querySelector('[data-echo]'); if (ecx) { var un = txt(cellV(s, 'D' + r)); ecx.textContent = (!t.dataset.text && n !== null && !isNaN(n)) ? echoText(t.value, n, un) : ''; }
      refreshCalc(s, false);
      var hasG = calcModel(s).filter(function (x) { return x.r === r; })[0]; if (hasG && hasG.rawF && !field.querySelector('.rbtn')) { field.querySelector('[data-ctl]').insertAdjacentHTML('beforeend', '<button class="rbtn" data-act="unglobal" aria-label="Voltar ao valor padrão">' + ic('reset', 's') + '</button>'); var g = field.querySelector('[data-g]'); if (g) g.hidden = true; }
    } else if (t.dataset.act === 'fxp-in') {
      fxpGrow(t); fxpAcUpdate(); clearTimeout(fxT); fxT = setTimeout(fxpLive, 120);
    } else if (t.dataset.act === 'fxp-filter') {
      FXP.filter = t.value; fxpFilterApply();
    } else if (t.dataset.act === 'fxin') {
      clearTimeout(fxT); fxT = setTimeout(function () { if (s) fxLive(s); }, 120);
    } else if (t.dataset.act === 'fxfind') {
      var qf = fold(t.value).split(/\s+/).filter(Boolean); $$('#fxrl .fxref').forEach(function (b) { b.hidden = !qf.every(function (w) { return b.dataset.f.indexOf(w) >= 0; }); });
    } else if (t.dataset.act === 'tfilter') {
      var q = fold(t.value).split(/\s+/).filter(Boolean), trs = $$('#tw' + t.dataset.t + ' tbody tr'), vis = 0;
      trs.forEach(function (tr) { if (tr._f == null) tr._f = fold(tr.textContent); tr.hidden = !q.every(function (w) { return tr._f.indexOf(w) >= 0; }); if (!tr.hidden) vis++; });
      var cn = $('#tc' + t.dataset.t); if (cn) cn.textContent = q.length ? vis + ' de ' + trs.length : '';
    } else if (t.dataset.act === 'cvin') {
      var row = t.closest('.cv'); cvUpdate(row, s);
      var cv = LS.get('cv', {}); cv[s.num + ':cv:' + row.dataset.cv] = parseNum(t.value); LS.set('cv', cv);
    } else if (t.dataset.act === 'fs') { S.fs = ['s', 'm', 'l', 'xl'][+t.value]; saveSettings(); applyLook(); }
    else if (t.dataset.act === 'fsg') { var n2 = parseNum(t.value); if (n2 && n2 > 0) { S.fsGlobal = n2; saveSettings(); ENG.setInput('Início', 'D16', n2); } }
  });
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (FXP.open) {
      if (e.target.id === 'fxpt') {
        if (FXP.ac && !($('#fxpac') || {}).hidden) {
          if (e.key === 'ArrowDown') { e.preventDefault(); fxpAcMove(1); return; }
          if (e.key === 'ArrowUp') { e.preventDefault(); fxpAcMove(-1); return; }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); fxpAcPick(); return; }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fxpAcClose(); return; }
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (FXP.ed && FXP.ed.isNew) fxpApplyNew(); else fxpApply(); return; }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fxpCloseEd(); return; }
      }
      if (e.key === 'Escape' && !$('#sheet')) { if (FXP.ed) fxpCloseEd(); else fxpClose(); return; }
    }
    if (e.target.id === 'fxta' && FXEDIT) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (cur.sheet) fxApply(cur.sheet); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fxCloseEditor(true); return; }
    }
    if (e.key === 'Escape' && FXEDIT && e.target.closest && e.target.closest('.fxed')) { fxCloseEditor(true); return; }
    if (e.key === '/'&& tag !== 'input' && tag !== 'textarea') { e.preventDefault(); go('search'); }
    if (e.key === 'Escape') { closeSheet(); memorialClose(); var lb = $('.lightbox'); if (lb) lb.click(); }
    if (e.key === 'Enter' && tag === 'input' && e.target.dataset.act === 'numin') e.target.blur();
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && tag === 'input' && e.target.dataset.act === 'numin' && !e.target.dataset.text) { e.preventDefault(); stepInput(e.target, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : (e.altKey ? 0.1 : 1)); }
  });

  // ---------------------------------------------------------------- estrutura da página
  function buildShell() {
    var nav = [['home', 'home', 'Início', ''], ['c', 'grid', 'Capítulos', 'c'], ['search', 'search', 'Buscar', 'search'], ['fav', 'star', 'Favoritos', 'fav'], ['set', 'sliders', 'Ajustes', 'set']];
    $('#app').innerHTML = '<nav class="nav" aria-label="Principal"><span class="brand" role="img" aria-label="Wen Technology">' + BRAND_SVG + '</span>' + nav.map(function (n) { return '<a href="#/' + n[3] + '" data-nav="' + n[0] + '"><span class="pill">' + ic(n[1]) + '</span>' + n[2] + '</a>'; }).join('') + '<span class="spacer"></span></nav>' +
      '<aside class="listpane" aria-label="Capítulos"><div class="lp-h">Capítulos</div>' + CHAP.map(function (c) { return accordion(c, false); }).join('') + '</aside>' +
      '<main class="main"><div id="view" class="view"></div></main>';
    $('#app').classList.add('split');
  }
  function start() {
    var sp = $('#splash');
    var minMs = (S.motion === 'off' || !S.splash) ? 0 : (LS.get('opened', 0) > 0 ? 900 : 1700);
    var t0 = performance.now();
    buildShell();
    var r = parseHash();
    if (r.path === '' && S.resume !== false) { var last = LS.get('last', ''); if (last && /^s\//.test(last)) { history.replaceState(null, '', '#/' + last); } }
    render();
    LS.set('opened', (LS.get('opened', 0) || 0) + 1);
    applyWake();
    var done = function () { if (sp) { sp.classList.add('off'); setTimeout(function () { sp.remove(); }, 450); } };
    setTimeout(done, Math.max(0, minMs - (performance.now() - t0)));
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) { try { navigator.serviceWorker.register('sw.js').catch(function () { }); } catch (e) { } }
    var fab = $('#install-fab'); if (fab && !isStandalone() && !LS.get('fabx', false)) { fab.innerHTML = ic('download', 's') + 'Instalar aplicativo<span class="x" data-x="1">' + ic('close', 's') + '</span>'; fab.hidden = !deferredInstall; fab.onclick = function (ev) { if (ev.target.closest('[data-x]')) { LS.set('fabx', true); fab.hidden = true; } else doInstall(); }; }
    // auto-expand current chapter in list pane
    $$('.listpane .acc').forEach(function (a) { a.classList.remove('open'); });
  }
  window.addEventListener('resize', function () { var si = $('#scrinfo'); if (si) si.textContent = innerWidth + ' × ' + innerHeight + ' px · ' + (innerWidth < 600 ? 'compacto (celular / tela externa)' : innerWidth < 900 ? 'médio (dobrável aberto / tablet)' : 'expandido (painel duplo)'); });

  // resposta visual a qualquer clique em botão/linha/cartão (anel que se expande)
  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest && e.target.closest('button, .row, .card[data-act], .qk, [role="button"]');
    if (!el || el.disabled || el.closest('.seg')) return;
    el.classList.remove('tapped'); void el.offsetWidth; el.classList.add('tapped');
    setTimeout(function () { el.classList.remove('tapped'); }, 520);
  }, { passive: true });
  // arranque
  var dataP = window.__DATA__ ? Promise.resolve(window.__DATA__) : fetch('data.json').then(function (r) { return r.json(); });
  dataP.then(function (d) { boot(d); start(); }).catch(function (err) { document.body.insertAdjacentHTML('beforeend', '<p style="padding:24px;font-family:system-ui;color:#fff">Não foi possível carregar os dados: ' + esc(err.message) + '</p>'); });
})();
