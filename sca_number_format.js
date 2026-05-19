// ============================================================
//  SCA – Módulo de Formatação Numérica Brasileira v1.0
//  Arquivo: sca_number_format.js
//  Carregue APÓS sca_core.js e sca_supabase.js
//
//  Problema resolvido:
//  Campos de área (prop-area-total, prop-area-res, etc.) e
//  comissão (oat-valor, oat-comis-banc-pct, oat-comis-part-pct)
//  exibem números no formato inglês (ex: 19443, 191.8, 195948).
//
//  O que este módulo faz:
//  ✅ Converte campos de type="number" para type="text"
//  ✅ Aplica máscara BR (ponto milhar, vírgula decimal) durante digitação
//  ✅ Formata valores ao carregar do banco (intercepta setVal)
//  ✅ Não quebra nd() / gd() — eles já tratam o formato BR corretamente
//  ✅ Não altera nenhuma outra lógica do sistema
// ============================================================

(function () {
  'use strict';

  // ─── CAMPOS QUE RECEBEM FORMATAÇÃO ───────────────────────────

  // Campos de área (ha) — suportam casas decimais
  const CAMPOS_AREA = [
    'prop-area-total',
    'prop-area-agri',
    'prop-area-past',
    'prop-area-res',
    'prop-area-app',
    'prop-area-inapta',
    'prop-area-proj',
    'prop-area-nutil',
  ];

  // Campos de valor monetário (R$) — suportam casas decimais
  const CAMPOS_VALOR = [
    'oat-valor',
  ];

  // Campos de percentual (%) — apenas números, sem milhar, com vírgula decimal
  const CAMPOS_PCT = [
    'oat-comis-banc-pct',
    'oat-comis-part-pct',
  ];

  // ─── UTILITÁRIOS ─────────────────────────────────────────────

  // Converte string BR → número JS (ex: "19.443,50" → 19443.5)
  function brToNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const num = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
    return isNaN(num) ? null : num;
  }

  // Formata número JS → string BR com casas decimais (ex: 19443.5 → "19.443,50")
  function numToBR(v, casas) {
    const n = parseFloat(v);
    if (isNaN(n) || n === 0) return '';
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: casas ?? 2,
      maximumFractionDigits: casas ?? 2,
    });
  }

  // Aplica máscara de número decimal BR durante a digitação
  // Mantém apenas dígitos e uma vírgula, formata milhar automaticamente
  function aplicarMascaraDecimal(input, casasDecimais) {
    const posAntes = input.selectionStart;
    const valorAntes = input.value;

    // Extrai apenas dígitos
    let digits = input.value.replace(/[^\d]/g, '');
    if (!digits) { input.value = ''; return; }

    // Limita a 12 dígitos inteiros + casas decimais para evitar overflow
    const maxDigits = 12 + casasDecimais;
    if (digits.length > maxDigits) digits = digits.slice(0, maxDigits);

    // Divide em parte inteira e decimal
    let intPart, decPart;
    if (casasDecimais > 0) {
      // Última N posições são decimais
      if (digits.length <= casasDecimais) {
        intPart = '0';
        decPart = digits.padStart(casasDecimais, '0');
      } else {
        intPart = digits.slice(0, digits.length - casasDecimais);
        decPart = digits.slice(digits.length - casasDecimais);
      }
      // Formata milhar na parte inteira
      const intFormatado = parseInt(intPart, 10).toLocaleString('pt-BR');
      input.value = intFormatado + ',' + decPart;
    } else {
      // Sem decimais (ex: percentual inteiro)
      const num = parseInt(digits, 10);
      input.value = num.toLocaleString('pt-BR');
    }
  }

  // Aplica máscara simples para percentuais (sem milhar, com vírgula decimal)
  function aplicarMascaraPct(input) {
    let v = input.value;
    // Permite dígitos, vírgula e ponto
    v = v.replace(/[^\d,\.]/g, '');
    // Substitui ponto por vírgula
    v = v.replace('.', ',');
    // Garante só uma vírgula
    const partes = v.split(',');
    if (partes.length > 2) v = partes[0] + ',' + partes.slice(1).join('');
    input.value = v;
  }

  // ─── CONFIGURAÇÃO DOS CAMPOS ──────────────────────────────────

  function configurarCampoDecimal(id, casasDecimais) {
    const tentar = (tentativas) => {
      const input = document.getElementById(id);
      if (!input) {
        if (tentativas > 0) setTimeout(() => tentar(tentativas - 1), 400);
        return;
      }

      // Converte de type="number" para type="text" para ter controle da formatação
      if (input.type === 'number') {
        input.type = 'text';
        input.inputMode = 'numeric';
      }

      // Remove listener anterior clonando o nó (evita duplicação)
      const novo = input.cloneNode(true);
      input.parentNode.replaceChild(novo, input);
      const el = document.getElementById(id);

      el.addEventListener('input', function () {
        // Salva a posição do cursor para campos pequenos (percentual)
        aplicarMascaraDecimal(this, casasDecimais);
      });

      // Ao sair do campo: normaliza (ex: "5," → "5,00")
      el.addEventListener('blur', function () {
        const num = brToNum(this.value);
        if (num !== null && num > 0) {
          this.value = numToBR(num, casasDecimais);
        } else {
          this.value = '';
        }
      });
    };
    tentar(15);
  }

  function configurarCampoPct(id) {
    const tentar = (tentativas) => {
      const input = document.getElementById(id);
      if (!input) {
        if (tentativas > 0) setTimeout(() => tentar(tentativas - 1), 400);
        return;
      }

      const novo = input.cloneNode(true);
      input.parentNode.replaceChild(novo, input);
      const el = document.getElementById(id);

      el.addEventListener('input', function () {
        aplicarMascaraPct(this);
      });
    };
    tentar(15);
  }

  // ─── INTERCEPTA setVal PARA FORMATAR AO CARREGAR DO BANCO ────

  function interceptarSetVal() {
    const original = window.setVal;
    if (typeof original !== 'function') return false;

    // Conjunto dos campos que precisam de formatação BR ao exibir
    const camposDecimais2 = new Set([...CAMPOS_AREA, ...CAMPOS_VALOR]);
    // Campos readonly calculados também precisam de formatação
    const camposReadonly  = new Set([
      'prop-area-aprov', 'prop-area-nutil', 'prop-area-perc', 'prop-area-saldo',
      'oat-comis-banc-rs', 'oat-comis-part-rs',
    ]);

    window.setVal = function (id, val) {
      // Chama o setVal original primeiro (preenche o campo)
      original.call(this, id, val);

      // Agora formata o valor se for um campo numérico mapeado
      if (camposDecimais2.has(id) || camposReadonly.has(id)) {
        const el = document.getElementById(id);
        if (!el) return;
        const num = parseFloat(String(val).replace(/\./g, '').replace(',', '.'));
        if (!isNaN(num) && num !== 0) {
          el.value = numToBR(num, 2);
        }
      }
    };

    return true;
  }

  // ─── TAMBÉM FORMATA calcComissoes() PARA CAMPOS READONLY ─────
  // calcComissoes já usa toLocaleString('pt-BR') — sem necessidade de interceptar.
  // calcAreas() idem — os campos readonly já saem formatados.
  // O que faltava era apenas a ENTRADA e o CARREGAMENTO do banco.

  // ─── INICIALIZAÇÃO ────────────────────────────────────────────

  function inicializar() {
    // Configura máscara nos campos de entrada
    CAMPOS_AREA.forEach(id => configurarCampoDecimal(id, 2));
    CAMPOS_VALOR.forEach(id => configurarCampoDecimal(id, 2));
    CAMPOS_PCT.forEach(id => configurarCampoPct(id));

    // Intercepta setVal após os outros módulos carregarem
    let tentativas = 0;
    const timer = setInterval(() => {
      tentativas++;
      if (interceptarSetVal()) {
        clearInterval(timer);
        console.log('[SCA NumFormat] ✅ v1.0 — formatação numérica BR ativa.');
      } else if (tentativas >= 20) {
        clearInterval(timer);
        console.warn('[SCA NumFormat] ⚠️ setVal não encontrado após 20 tentativas.');
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }

})();
