/* ==========================================================================
   MCMI-III — js/storage.js
   Persistencia LOCAL (localStorage), borrado total y archivo de respuestas.
   Nada sale del dispositivo: no hay red, ni cookies, ni telemetría.
   Este archivo no contiene claves de puntuación ni nombres de escalas.
   ========================================================================== */
(function (global) {
  'use strict';

  var CLAVE = 'mcmi.sesion.v1';
  var persistente = (function () {
    try { var k = '__mcmi_t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; }
    catch (e) { return false; }
  })();
  var memoria = null;               /* respaldo si localStorage no está disponible */

  function ahora() { return new Date().toISOString(); }

  function sesionNueva() {
    return {
      v: 1, creada: ahora(), actualizada: ahora(),
      consentimiento: null,         /* { aceptado: true, ts } */
      ident: null,                  /* { codigo, edad, fecha, hora } */
      respuestas: {},               /* { "1": "V" | "F", ... } */
      pantalla: 'consentimiento',
      bloque: 1,
      enviado: null                 /* ISO al enviar */
    };
  }

  function cargar() {
    var s = null;
    if (persistente) {
      try { var t = localStorage.getItem(CLAVE); if (t) s = JSON.parse(t); } catch (e) { s = null; }
    } else { s = memoria; }
    if (!s || s.v !== 1 || typeof s.respuestas !== 'object') return null;
    return s;
  }

  function guardar(s) {
    s.actualizada = ahora();
    if (persistente) {
      try { localStorage.setItem(CLAVE, JSON.stringify(s)); return true; }
      catch (e) { persistente = false; }
    }
    memoria = s;
    return false;
  }

  /* Borrado total y verificable: devuelve true si no queda nada. */
  function borrarTodo() {
    memoria = null;
    try { localStorage.removeItem(CLAVE); } catch (e) { /* sin acceso */ }
    try { sessionStorage.clear(); } catch (e) { /* sin acceso */ }
    return cargar() === null;
  }

  /* ---------------- Archivo de respuestas ---------------- */
  /* Contiene SOLO respuestas e identificación: ningún resultado. */
  function paquete(s) {
    return {
      mcmi: 1, formato: 'respuestas', version: 1,
      items: Object.keys(s.respuestas).length,
      consentimiento: s.consentimiento,
      ident: s.ident,
      inicio: s.creada, envio: s.enviado,
      respuestas: s.respuestas
    };
  }

  function nombreArchivo(pkt, cifrado) {
    var cod = String((pkt.ident && pkt.ident.codigo) || 'sin-codigo').replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 20) || 'sin-codigo';
    var f = (pkt.ident && pkt.ident.fecha) || 'sin-fecha';
    return 'respuestas-' + cod + '-' + f + (cifrado ? '.cifrado' : '') + '.mcmi.json';
  }

  /* ---- Cifrado opcional con Web Crypto (PBKDF2 + AES-GCM), todo local ---- */
  function hayCripto() { return !!(global.crypto && global.crypto.subtle); }
  function b64(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function deB64(t) { var s = atob(t), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
  var ITER = 200000;

  function derivar(clave, sal) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: ITER, hash: 'SHA-256' }, base,
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }

  function cifrar(obj, clave) {
    var sal = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return derivar(clave, sal).then(function (k) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(JSON.stringify(obj)));
    }).then(function (ct) {
      return { mcmi: 1, formato: 'respuestas', cifrado: true, kdf: 'PBKDF2-SHA256', iter: ITER, sal: b64(sal), iv: b64(iv), datos: b64(ct) };
    });
  }

  function descifrar(env, clave) {
    return derivar(clave, deB64(env.sal)).then(function (k) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(env.iv) }, k, deB64(env.datos));
    }).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
  }

  /* Descarga un archivo mediante Blob (sin red). */
  function descargar(nombre, texto) {
    var blob = new Blob([texto], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  global.MCMIStore = {
    CLAVE: CLAVE, persistente: function () { return persistente; },
    sesionNueva: sesionNueva, cargar: cargar, guardar: guardar, borrarTodo: borrarTodo,
    paquete: paquete, nombreArchivo: nombreArchivo,
    hayCripto: hayCripto, cifrar: cifrar, descifrar: descifrar, descargar: descargar
  };
})(typeof window !== 'undefined' ? window : globalThis);
