/* ==========================================================================
   MCMI-III — js/app.js
   Flujo del paciente: consentimiento → identificación → bloques → revisión → cierre.
   Esta vista NO calcula ni muestra puntajes, escalas ni interpretaciones.
   El texto de los ítems se inserta con textContent (literal, sin tocar un carácter).
   ========================================================================== */
(function () {
  'use strict';

  var ITEMS = window.MCMI_ITEMS, META = window.MCMI_META, Store = window.MCMIStore;
  var $ = function (id) { return document.getElementById(id); };
  var live = $('live');

  /* ---- Comprobación de carga: nunca trabajar con un banco incompleto ---- */
  if (!Array.isArray(ITEMS) || !META || ITEMS.length !== META.total || !Store) {
    $('error-fatal').hidden = false;
    $('error-fatal-txt').textContent = 'No se encontró el banco de preguntas completo (data/items.js). Pide ayuda a tu profesional.';
    return;
  }

  var TOTAL = ITEMS.length;                 /* 175 */
  var TAM = META.tamanoBloque;              /* 15 */
  var NBLOQ = Math.ceil(TOTAL / TAM);       /* 12 */
  var PANTALLAS = ['consentimiento', 'identificacion', 'cuestionario', 'revision', 'cierre'];

  var s = Store.cargar();
  var retomado = !!(s && (s.consentimiento || Object.keys(s.respuestas).length));
  if (!s) { s = Store.sesionNueva(); }

  /* ---------------- Utilidades ---------------- */
  function respondidas() { return Object.keys(s.respuestas).length; }
  function anuncio(t) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 50); }
  function pluralAfirm(n) { return n === 1 ? '1 afirmación' : n + ' afirmaciones'; }
  function bloqueDe(n) { return Math.floor((n - 1) / TAM) + 1; }
  function rangoBloque(b) { return { ini: (b - 1) * TAM + 1, fin: Math.min(b * TAM, TOTAL) }; }
  function faltantesBloque(b) {
    var r = rangoBloque(b), f = [];
    for (var n = r.ini; n <= r.fin; n++) if (!s.respuestas[n]) f.push(n);
    return f;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hoyLocal() {
    var d = new Date();
    return { fecha: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), hora: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
  }
  function setBar(barEl, n) {                /* CSSOM: permitido por la política CSP */
    barEl.setAttribute('aria-valuenow', String(n));
    barEl.setAttribute('aria-valuetext', n + ' de ' + TOTAL + ' respondidos');
    barEl.firstElementChild.style.width = (n / TOTAL * 100).toFixed(2) + '%';
  }
  function marcarDeshabilitado(el, si) { el.setAttribute('aria-disabled', si ? 'true' : 'false'); }
  function marcarInvalido(el, si) { if (si) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }
  function guardar() {
    if (!s.consentimiento && !respondidas()) return;      /* no se escribe nada antes del consentimiento */
    var ok = Store.guardar(s);
    $('aviso-memoria').hidden = ok;
  }

  /* ---------------- Navegación entre pantallas ---------------- */
  function mostrar(p, opts) {
    opts = opts || {};
    PANTALLAS.forEach(function (id) { $(id).hidden = (id !== p); });
    s.pantalla = p;
    guardar();
    if (p === 'cuestionario') renderBloque(s.bloque);
    if (p === 'revision') renderRevision();
    if (p === 'identificacion') prepararIdent();
    if (p === 'cierre') $('msg-arch').textContent = '';
    window.scrollTo(0, 0);
    if (!opts.sinFoco) {
      var h = $(p).querySelector('h1');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
  }

  /* ---------------- 1. Consentimiento ---------------- */
  $('btn-consent').addEventListener('click', function () {
    if (!$('acepto').checked) {
      $('err-acepto').hidden = false;
      marcarInvalido($('acepto'), true);
      $('acepto').focus();
      return;
    }
    $('err-acepto').hidden = true;
    marcarInvalido($('acepto'), false);
    s.consentimiento = { aceptado: true, ts: new Date().toISOString() };
    mostrar('identificacion');
  });
  $('acepto').addEventListener('change', function () {
    if ($('acepto').checked) { $('err-acepto').hidden = true; marcarInvalido($('acepto'), false); }
  });

  /* ---------------- 2. Identificación ---------------- */
  function prepararIdent() {
    var h = hoyLocal();
    $('fecha').value = h.fecha + '  ' + h.hora;
    if (s.ident) { $('codigo').value = s.ident.codigo || ''; $('edad').value = s.ident.edad || ''; }
  }
  $('btn-id-atras').addEventListener('click', function () { mostrar('consentimiento'); });
  $('btn-id-sig').addEventListener('click', function () {
    var cod = $('codigo').value.trim(), edad = parseInt($('edad').value, 10);
    var okC = /^[A-Za-z0-9_\-ÁÉÍÓÚÜÑáéíóúüñ.]{1,20}$/.test(cod);
    var okE = isFinite(edad) && edad >= 18 && edad <= 99;
    $('err-codigo').hidden = okC; marcarInvalido($('codigo'), !okC);
    $('err-edad').hidden = okE;   marcarInvalido($('edad'), !okE);
    if (!okC) { $('codigo').focus(); return; }
    if (!okE) { $('edad').focus(); return; }
    var h = hoyLocal();
    s.ident = { codigo: cod, edad: edad, fecha: s.ident && s.ident.fecha ? s.ident.fecha : h.fecha, hora: s.ident && s.ident.hora ? s.ident.hora : h.hora };
    s.bloque = s.bloque || 1;
    mostrar('cuestionario');
  });

  /* ---------------- 3. Bloques de ítems ---------------- */
  function crearItem(it) {
    var n = it.id, resp = s.respuestas[n];
    var fs = document.createElement('fieldset'); fs.className = 'item'; fs.id = 'item-' + n;
    var lg = document.createElement('legend'); lg.className = 'item__q'; lg.tabIndex = -1;
    var num = document.createElement('span'); num.className = 'item__n'; num.textContent = n + '.';
    var tx = document.createElement('span'); tx.className = 'item__t'; tx.textContent = it.texto;   /* literal */
    lg.appendChild(num); lg.appendChild(document.createTextNode(' ')); lg.appendChild(tx);
    var vf = document.createElement('div'); vf.className = 'vf';
    [['V', 'Verdadero'], ['F', 'Falso']].forEach(function (o) {
      var inp = document.createElement('input');
      inp.type = 'radio'; inp.name = 'i' + n; inp.id = 'i' + n + o[0].toLowerCase(); inp.value = o[0];
      inp.checked = (resp === o[0]);
      inp.addEventListener('change', function () { alResponder(n, o[0], fs); });
      var lb = document.createElement('label'); lb.htmlFor = inp.id; lb.textContent = o[1];
      vf.appendChild(inp); vf.appendChild(lb);
    });
    fs.appendChild(lg); fs.appendChild(vf);
    return fs;
  }

  function renderBloque(b) {
    s.bloque = b;
    var r = rangoBloque(b), form = $('form-items');
    form.textContent = '';
    for (var n = r.ini; n <= r.fin; n++) form.appendChild(crearItem(ITEMS[n - 1]));
    $('t-bloque').textContent = 'Bloque ' + b + ' de ' + NBLOQ + ' · Ítems ' + r.ini + ' a ' + r.fin;
    $('aviso-bloque').hidden = true;
    marcarDeshabilitado($('btn-ant'), b === 1);
    $('btn-sig').textContent = b === NBLOQ ? 'Revisar mis respuestas' : 'Siguiente';
    actualizarProgreso();
  }

  function actualizarProgreso() {
    var n = respondidas();
    $('prog-txt').textContent = n + ' de ' + TOTAL + ' respondidos';
    setBar($('prog-bar'), n);
  }

  function alResponder(n, v, fs) {
    s.respuestas[n] = v;
    fs.classList.remove('item--pendiente');
    guardar();
    actualizarProgreso();
    /* Si había un aviso de pendientes en esta página, se actualiza o se oculta */
    if (!$('aviso-bloque').hidden) {
      var f = faltantesBloque(s.bloque);
      if (f.length === 0) $('aviso-bloque').hidden = true;
      else { $('aviso-bloque-txt').textContent = 'Falta responder ' + pluralAfirm(f.length) + ' en esta página.'; }
    }
  }

  function avisarPendientes(f, aviso, txtEl, subEl) {
    f.forEach(function (n) { var e = $('item-' + n); if (e) e.classList.add('item--pendiente'); });
    txtEl.textContent = 'Falta responder ' + pluralAfirm(f.length) + ' en esta página.';
    if (subEl) subEl.textContent = 'No pasa nada: puedes continuar cuando las completes. Las pendientes están marcadas “sin responder”.';
    aviso.hidden = false;
    var primera = $('item-' + f[0]);
    if (primera) {
      primera.scrollIntoView({ block: 'center' });
      var lg = primera.querySelector('legend'); if (lg) lg.focus({ preventScroll: true });
    }
  }

  $('btn-ant').addEventListener('click', function () {
    if (s.bloque > 1) { renderBloque(s.bloque - 1); guardar(); window.scrollTo(0, 0); $('t-bloque').focus({ preventScroll: true }); }
  });
  $('btn-sig').addEventListener('click', function () {
    var f = faltantesBloque(s.bloque);
    if (f.length) { avisarPendientes(f, $('aviso-bloque'), $('aviso-bloque-txt'), $('aviso-bloque-sub')); return; }
    if (s.bloque < NBLOQ) { renderBloque(s.bloque + 1); guardar(); window.scrollTo(0, 0); $('t-bloque').focus({ preventScroll: true }); anuncio($('t-bloque').textContent); }
    else mostrar('revision');
  });

  /* ---------------- 4. Revisión ---------------- */
  function renderRevision() {
    var n = respondidas(), falta = TOTAL - n, ul = $('lista-rev');
    $('rev-txt').textContent = n + ' de ' + TOTAL + ' respondidos';
    $('rev-falta').textContent = falta ? 'Faltan ' + falta : 'Todo respondido';
    setBar($('rev-bar'), n);
    $('aviso-rev').hidden = true;
    marcarDeshabilitado($('btn-enviar'), falta > 0);
    ul.textContent = '';
    for (var b = 1; b <= NBLOQ; b++) {
      (function (b) {
        var r = rangoBloque(b), f = faltantesBloque(b).length;
        var li = document.createElement('li');
        var t = document.createElement('span'); t.textContent = 'Bloque ' + b + ' · ítems ' + r.ini + '–' + r.fin;
        var st = document.createElement('span'); st.className = 'st ' + (f ? 'st--falta' : 'st--ok');
        st.textContent = f ? 'Faltan ' + f + (f === 1 ? ' respuesta' : ' respuestas') : 'Completo';
        var bt = document.createElement('button'); bt.type = 'button'; bt.className = 'btn btn--ghost';
        bt.textContent = 'Revisar'; bt.setAttribute('aria-label', 'Revisar bloque ' + b + ', ítems ' + r.ini + ' a ' + r.fin);
        bt.addEventListener('click', function () { s.bloque = b; mostrar('cuestionario'); });
        li.appendChild(t); li.appendChild(st); li.appendChild(bt); ul.appendChild(li);
      })(b);
    }
  }
  $('btn-rev-volver').addEventListener('click', function () { mostrar('cuestionario'); });
  $('btn-enviar').addEventListener('click', function () {
    var falta = TOTAL - respondidas();
    if (falta > 0) {
      $('aviso-rev-txt').textContent = 'Todavía ' + (falta === 1 ? 'falta 1 afirmación' : 'faltan ' + falta + ' afirmaciones') + '. Usa “Revisar” en los bloques marcados para completarlas.';
      $('aviso-rev').hidden = false;
      return;
    }
    s.enviado = new Date().toISOString();
    mostrar('cierre');
  });

  /* ---------------- 5. Cierre y archivo de respuestas ---------------- */
  $('btn-descargar').addEventListener('click', function () {
    var pkt = Store.paquete(s), clave = $('clave-arch').value, msg = $('msg-arch');
    if (clave) {
      if (!Store.hayCripto()) { msg.textContent = 'Este navegador no permite proteger el archivo con clave. Descárgalo sin clave o usa otro navegador.'; return; }
      Store.cifrar(pkt, clave).then(function (env) {
        Store.descargar(Store.nombreArchivo(pkt, true), JSON.stringify(env));
        msg.textContent = 'Archivo protegido descargado. Entrégaselo a tu profesional junto con la clave.';
      }).catch(function () { msg.textContent = 'No se pudo proteger el archivo. Intenta de nuevo sin clave.'; });
    } else {
      Store.descargar(Store.nombreArchivo(pkt, false), JSON.stringify(pkt));
      msg.textContent = 'Archivo descargado. Entrégaselo a tu profesional.';
    }
  });

  /* ---------------- Salir y borrar (siempre disponible) ---------------- */
  var dlg = $('dlg-borrar');
  function pedirBorrado() {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else if (window.confirm('¿Borrar tus respuestas de este dispositivo? No se puede deshacer.')) borrarYReiniciar();
  }
  function borrarYReiniciar() {
    var ok = Store.borrarTodo();
    s = Store.sesionNueva();
    $('acepto').checked = false; $('codigo').value = ''; $('edad').value = ''; $('clave-arch').value = '';
    $('form-items').textContent = '';
    $('aviso-retomar').hidden = true;
    $('aviso-borrado').hidden = !ok;
    mostrar('consentimiento', { sinFoco: true });
    anuncio(ok ? 'Se borraron tus respuestas y tus datos de este dispositivo.' : 'No se pudo confirmar el borrado.');
    $('t-cons').focus({ preventScroll: true });
  }
  dlg.addEventListener('close', function () { if (dlg.returnValue === 'borrar') borrarYReiniciar(); dlg.returnValue = ''; });
  $('btn-salir').addEventListener('click', pedirBorrado);
  $('btn-salir-2').addEventListener('click', pedirBorrado);

  /* ---------------- Arranque y reanudación ---------------- */
  (function iniciar() {
    $('aviso-memoria').hidden = Store.persistente();
    var p = PANTALLAS.indexOf(s.pantalla) >= 0 ? s.pantalla : 'consentimiento';
    /* Salvaguardas: no se puede saltar el consentimiento ni la identificación */
    if (p !== 'consentimiento' && !s.consentimiento) p = 'consentimiento';
    if ((p === 'cuestionario' || p === 'revision' || p === 'cierre') && !s.ident) p = 'identificacion';
    if (p === 'cierre' && !s.enviado) p = 'revision';
    if (s.enviado) p = 'cierre';
    if (retomado && p !== 'consentimiento') {
      var n = respondidas();
      $('aviso-retomar-txt').textContent = s.enviado
        ? 'Tus respuestas ya fueron enviadas.'
        : 'Retomaste tu avance: ' + n + ' de ' + TOTAL + ' afirmaciones respondidas.';
      $('aviso-retomar').hidden = false;
    }
    mostrar(p, { sinFoco: true });
  })();
})();
