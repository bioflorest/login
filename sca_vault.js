// ============================================================
//  SCA – Módulo Vault/Chave v1.0
//  Arquivo: sca_vault.js
//  Carregue APÓS sca_supabase.js e ANTES de sca_core.js
//
//  O que faz:
//  Gerenciamento da chave de criptografia AES-256-GCM.
//  Usa window._SCA_KEY_VAULT quando disponível,
//  com fallback ofuscado para compatibilidade.
// ============================================================

(function(){
  'use strict';

  /* ── Chave vem do Vault (window._SCA_KEY_VAULT) quando disponível.
        Fallback ofuscado usado apenas se Vault estiver indisponível. ── */
  var _xk2=[0x5A,0x3F,0x71,0xA2,0x18,0xC4,0x2D,0x9E];
  var _SCA_FALLBACK=[9,124,48,253,90,141,98,216,22,96,67,146,42,241,114,221,8,118,33,246,87,131,127,223,28,118,48,253,83,129,116,191].map(function(v,i){return String.fromCharCode(v^_xk2[i%_xk2.length]);}).join('');

  function _getSCASecret() {
    return window._SCA_KEY_VAULT || _SCA_FALLBACK;
  }

  /* Deriva CryptoKey AES-256-GCM a partir do segredo */
  async function _derivarChave() {
    var enc = new TextEncoder();
    var baseKey = await crypto.subtle.importKey(
      'raw', enc.encode(_getSCASecret()),
      { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('sca_salt_v1'), iterations: 100000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false, ['encrypt', 'decrypt']
    );
  }

  /* Cifra texto → string Base64(iv + ciphertext) */
  window.scaCifrar = async function(texto) {
    if (!texto) return texto;
    try {
      var chave = await _derivarChave();
      var iv = crypto.getRandomValues(new Uint8Array(12));
      var enc = new TextEncoder();
      var cifrado = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv }, chave, enc.encode(texto)
      );
      /* Concatena iv (12 bytes) + cifrado e converte para Base64 */
      var combined = new Uint8Array(iv.byteLength + cifrado.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(cifrado), iv.byteLength);
      return btoa(String.fromCharCode.apply(null, combined));
    } catch(e) {
      console.error('[SCA-Cripto] Erro ao cifrar:', e);
      return texto; /* fallback: salva sem cifrar se algo der errado */
    }
  };

  /* Decifra string Base64 → texto original */
  window.scaDecifrar = async function(b64) {
    if (!b64) return b64;
    /* Se não parece Base64 cifrado, retorna como está (retrocompatibilidade) */
    try {
      var bytes = Uint8Array.from(atob(b64), function(c){ return c.charCodeAt(0); });
      /* precisa ter ao menos 13 bytes (12 IV + 1 dado) */
      if (bytes.length < 13) return b64;
      var chave = await _derivarChave();
      var iv = bytes.slice(0, 12);
      var dados = bytes.slice(12);
      var decifrado = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv }, chave, dados
      );
      return new TextDecoder().decode(decifrado);
    } catch(e) {
      /* Senha antiga (texto plano) → retorna como está */
      return b64;
    }
  };

  console.log('[SCA-Cripto] ✅ Módulo AES-256-GCM carregado.');
})();
