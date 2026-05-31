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
  // Converte qualquer formato numérico → number JS
  // Suporta: "1.000,36" | "1000,36" | "100,36" | "1000.36" | 1000.36
  function parseNumero(v) {
    if (v === null || v === undefined || v === '') return null;
    let s = String(v).trim();
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  const brToNum = parseNumero; // alias para compatibilidade

  // Formata número JS → string BR com casas decimais (ex: 19443.5 → "19.443,50")
  function numToBR(v, casas = 2) {
    const n = Number(v);
    if (isNaN(n)) return '';
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    });
  }

  // Aplica máscara decimal BR durante digitação
  // ✅ 100,36 → 100,36  |  1000,36 → 1.000,36  |  não transforma 100,36 em 100.360,00
  function aplicarMascaraDecimal(input) {
    let valor = input.value;
    valor = valor.replace(/[^\d,]/g, '');

    const partes = valor.split(',');
    if (partes.length > 2) {
      valor = partes[0] + ',' + partes.slice(1).join('');
    }

    const inteiro    = (partes[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const temDecimal = valor.includes(',');
    const decimal    = temDecimal ? partes[1].slice(0, 2) : null;

    input.value = temDecimal ? inteiro + ',' + decimal : inteiro;
  }

  // Aplica máscara simples para percentuais (sem milhar, com vírgula decimal, máx 2 casas)
  function aplicarMascaraPct(input) {
    let v = input.value;
    // Permite dígitos, vírgula e ponto
    v = v.replace(/[^\d,\.]/g, '');
    // Substitui ponto por vírgula
    v = v.replace('.', ',');
    // Garante só uma vírgula
    const partes = v.split(',');
    if (partes.length > 2) v = partes[0] + ',' + partes.slice(1).join('');
    // Limita parte decimal a 2 casas
    const p = v.split(',');
    if (p.length === 2 && p[1].length > 2) v = p[0] + ',' + p[1].slice(0, 2);
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
        aplicarMascaraDecimal(this);
      });

      // Ao sair do campo: normaliza (ex: "5," → "5,00")
      el.addEventListener('blur', function () {
        const num = parseNumero(this.value);
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

      // Ao sair do campo: normaliza para 2 casas decimais (ex: "4,7286" → "4,73")
      el.addEventListener('blur', function () {
        const num = parseFloat(this.value.replace(',', '.'));
        if (!isNaN(num) && num > 0) {
          this.value = num.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        } else {
          this.value = '';
        }
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
    // Campos percentuais
    const camposPct = new Set(CAMPOS_PCT);

    window.setVal = function (id, val) {
      // Chama o setVal original primeiro (preenche o campo)
      original.call(this, id, val);

      // Formata campos decimais (área, valor)
      if (camposDecimais2.has(id) || camposReadonly.has(id)) {
        const el = document.getElementById(id);
        if (!el) return;
        const num = parseNumero(val);
        if (!isNaN(num) && num !== 0) {
          el.value = numToBR(num, 2);
        }
      }

      // Formata campos percentuais para 2 casas decimais BR
      if (camposPct.has(id)) {
        const el = document.getElementById(id);
        if (!el) return;
        const num = parseNumero(val);
        if (!isNaN(num) && num !== 0) {
          el.value = num.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        }
      }
    };

    return true;
  }

  // ─── TAMBÉM FORMATA calcComissoes() PARA CAMPOS READONLY ─────
  // calcComissoes já usa toLocaleString('pt-BR') — sem necessidade de interceptar.
  // calcAreas() idem — os campos readonly já saem formatados.
  // O que faltava era a ENTRADA, o CARREGAMENTO do banco e o TIMING de instalação.

  // ─── REFORMATA campos numéricos após carregar do banco ────────
  // Garante formatação BR mesmo quando setVal foi chamado antes do interceptor
  // estar instalado (race condition entre carregarDadosClienteSupabase e setInterval).

  function reformatarCamposNumericos() {
    // Campos de área (ha)
    CAMPOS_AREA.forEach(id => {
      const el = document.getElementById(id);
      if (!el || !el.value) return;
      const num = parseNumero(el.value);
      if (!isNaN(num) && num !== 0) el.value = numToBR(num, 2);
    });

    // Campos de valor monetário
    CAMPOS_VALOR.forEach(id => {
      const el = document.getElementById(id);
      if (!el || !el.value) return;
      const num = parseNumero(el.value);
      if (!isNaN(num) && num !== 0) el.value = numToBR(num, 2);
    });

    // Campos readonly calculados (comissões e áreas calculadas)
    ['prop-area-aprov', 'prop-area-nutil', 'prop-area-perc', 'prop-area-saldo',
     'oat-comis-banc-rs', 'oat-comis-part-rs'].forEach(id => {
      const el = document.getElementById(id);
      if (!el || !el.value) return;
      // prop-area-perc já vem com " %" — não reformata
      if (id === 'prop-area-perc') return;
      const num = parseNumero(el.value);
      if (!isNaN(num) && num !== 0) el.value = numToBR(num, 2);
    });
    // Campos percentuais (%) — formata para 2 casas decimais BR
    CAMPOS_PCT.forEach(id => {
      const el = document.getElementById(id);
      if (!el || !el.value) return;
      const num = parseNumero(el.value);
      if (!isNaN(num) && num !== 0) {
        el.value = num.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
    });
  }

  // ─── INTERCEPTA carregarOperacaoAtual e carregarPropriedade ───
  // Executa reformatação logo após as funções de carregar do banco serem chamadas.

  function interceptarCarregadores() {
    const fnOat = window.carregarOperacaoAtual;
    if (typeof fnOat === 'function') {
      window.carregarOperacaoAtual = function () {
        fnOat.apply(this, arguments);
        // Aguarda o DOM atualizar, formata os campos E recalcula comissões
        setTimeout(() => {
          // 1. Formata valor total e comissões R$
          ['oat-valor', 'oat-comis-banc-rs', 'oat-comis-part-rs'].forEach(id => {
            const el = document.getElementById(id);
            if (!el || !el.value) return;
            const num = parseNumero(el.value);
            if (!isNaN(num) && num !== 0) el.value = numToBR(num, 2);
          });

          // 1b. Formata percentuais para 2 casas decimais BR
          CAMPOS_PCT.forEach(id => {
            const el = document.getElementById(id);
            if (!el || !el.value) return;
            const num = parseNumero(el.value);
            if (!isNaN(num) && num !== 0) {
              el.value = num.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
            }
          });

          // 2. Recalcula comissões com os valores já formatados em BR
          // Isso sobrescreve qualquer cálculo errado disparado pelo oninput durante o carregamento
          };
          const valor = parseNumero(document.getElementById('oat-valor')?.value) || 0;
          const pBanc = parseNumero(document.getElementById('oat-comis-banc-pct')?.value) || 0 || 0;
          const pPart = parseNumero(document.getElementById('oat-comis-part-pct')?.value) || 0 || 0;
          const fmtBR = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const elBancRs = document.getElementById('oat-comis-banc-rs');
          const elPartRs = document.getElementById('oat-comis-part-rs');
          if (elBancRs && valor > 0 && pBanc > 0) elBancRs.value = fmtBR(valor * pBanc / 100);
          if (elPartRs && valor > 0 && pPart > 0) elPartRs.value = fmtBR(valor * pPart / 100);
        }, 50);
      };
    }

    const fnProp = window.carregarPropriedade;
    if (typeof fnProp === 'function') {
      window.carregarPropriedade = function () {
        fnProp.apply(this, arguments);
        setTimeout(() => {
          CAMPOS_AREA.forEach(id => {
            const el = document.getElementById(id);
            if (!el || !el.value) return;
            const num = parseNumero(el.value);
            if (!isNaN(num) && num !== 0) el.value = numToBR(num, 2);
          });
          // Recalcula áreas derivadas com formatação correta
          if (typeof calcAreas === 'function') calcAreas();
        }, 0);
      };
    }
  }

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
        // Após instalar o interceptor, reformata campos já preenchidos
        reformatarCamposNumericos();
        console.log('[SCA NumFormat] ✅ v2.0 — formatação numérica BR ativa.');
      } else if (tentativas >= 20) {
        clearInterval(timer);
        console.warn('[SCA NumFormat] ⚠️ setVal não encontrado após 20 tentativas.');
      }
    }, 200);

    // Intercepta os carregadores independentemente do setVal
    // (resolve a race condition quando carregarDadosClienteSupabase roda antes do interceptor)
    let tentativasCarreg = 0;
    const timerCarreg = setInterval(() => {
      tentativasCarreg++;
      const prontoOat  = typeof window.carregarOperacaoAtual !== 'undefined';
      const prontoProp = typeof window.carregarPropriedade   !== 'undefined';
      if (prontoOat && prontoProp) {
        clearInterval(timerCarreg);
        interceptarCarregadores();
        console.log('[SCA NumFormat] ✅ Carregadores interceptados para reformatação BR.');
      } else if (tentativasCarreg >= 30) {
        clearInterval(timerCarreg);
        console.warn('[SCA NumFormat] ⚠️ Carregadores não encontrados após 30 tentativas.');
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }

})();
