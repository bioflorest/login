// ============================================================
//  SCA – Sincronização de Receita Total no Card do Cliente
//  Arquivo: sca_receita_cliente.js
//  Carregue APÓS sca_agricola.js (último script da página)
//
//  O que faz:
//  ✅ Intercepta atualizarTotalAgricola() e atualizarTotalPec()
//  ✅ Sempre que qualquer total muda, soma agr-total + pec-total
//  ✅ Atualiza cl-receita (card do cliente) em tempo real
//  ✅ Também atualiza ao carregar o cliente (exibirCliente)
//  ✅ Persiste o valor em valor_total_receitas no Supabase
// ============================================================

(function () {
  'use strict';

  // ─── Lê o valor numérico de um elemento pelo id ──────────────
  function lerValorEl(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    // Remove "R$", pontos de milhar e troca vírgula por ponto
    const txt = el.textContent || el.innerText || '';
    return parseFloat(txt.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
  }

  // ─── Formata número para "R$ 1.234,56" ───────────────────────
  function fmtBRL(v) {
    return 'R$ ' + (parseFloat(v) || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // ─── Atualiza cl-receita somando agrícola + pecuária ─────────
  function sincronizarReceitaCliente() {
    const agr = lerValorEl('agr-total');
    const pec = lerValorEl('pec-total');
    const total = agr + pec;

    // Atualiza o display do card do cliente
    const elClReceita = document.getElementById('cl-receita');
    if (elClReceita) {
      elClReceita.textContent = fmtBRL(total);
    }

    // Persiste no objeto do cliente em memória e no Supabase
    try {
      const lista = window.clientes || [];
      const idx = window.clIdx ?? -1;
      if (idx >= 0 && lista[idx]) {
        lista[idx].valor_total_receitas = total;
        window.clientes = lista;

        // Salva no Supabase silenciosamente
        const clienteId = lista[idx].id;
        if (clienteId && window.supa) {
          window.supa
            .from('clientes')
            .update({ valor_total_receitas: total })
            .eq('id', clienteId)
            .then(() => {
              console.log('[SCA Receita Cliente] ✅ valor_total_receitas salvo:', fmtBRL(total));
            })
            .catch(e => {
              console.warn('[SCA Receita Cliente] Aviso ao salvar receita:', e);
            });
        }
      }
    } catch (e) {
      console.warn('[SCA Receita Cliente] Erro ao persistir:', e);
    }
  }

  // ─── Intercepta atualizarTotalAgricola ───────────────────────
  function interceptarTotalAgricola() {
    const orig = window.atualizarTotalAgricola;
    if (typeof orig !== 'function') return false;

    window.atualizarTotalAgricola = function () {
      orig.apply(this, arguments);
      // Pequeno delay para o DOM atualizar agr-total antes de ler
      setTimeout(sincronizarReceitaCliente, 50);
    };
    return true;
  }

  // ─── Intercepta atualizarTotalPec ────────────────────────────
  function interceptarTotalPec() {
    const orig = window.atualizarTotalPec;
    if (typeof orig !== 'function') return false;

    window.atualizarTotalPec = function () {
      orig.apply(this, arguments);
      setTimeout(sincronizarReceitaCliente, 50);
    };
    return true;
  }

  // ─── Intercepta exibirCliente para carregar receita salva ────
  function interceptarExibirCliente() {
    const orig = window.exibirCliente;
    if (typeof orig !== 'function') return false;

    window.exibirCliente = function (i) {
      orig.apply(this, arguments);

      // Após carregar o cliente, preenche cl-receita com o valor salvo
      setTimeout(function () {
        const lista = window.clientes || [];
        if (i >= 0 && lista[i]) {
          const total = lista[i].valor_total_receitas || 0;
          const el = document.getElementById('cl-receita');
          if (el) el.textContent = fmtBRL(total);
        }
      }, 80);
    };
    return true;
  }

  // ─── Inicialização com retentativas ──────────────────────────
  // As funções dos outros módulos podem não estar prontas ainda,
  // então tenta algumas vezes antes de desistir.
  function inicializar() {
    let tentativas = 0;
    const maxTentativas = 20; // tenta por até 4 segundos
    const intervalo = 200;

    const timer = setInterval(function () {
      tentativas++;

      const okAgr = interceptarTotalAgricola();
      const okPec = interceptarTotalPec();
      const okExibir = interceptarExibirCliente();

      if (okAgr && okPec && okExibir) {
        clearInterval(timer);
        // Sincroniza imediatamente com o cliente atual
        sincronizarReceitaCliente();
        console.log('[SCA Receita Cliente] ✅ Sincronização de receita ativa.');
      } else if (tentativas >= maxTentativas) {
        clearInterval(timer);
        // Mesmo sem interceptar tudo, aplica o que conseguiu
        sincronizarReceitaCliente();
        console.warn('[SCA Receita Cliente] ⚠️ Inicialização parcial após ' + tentativas + ' tentativas.',
          { okAgr, okPec, okExibir });
      }
    }, intervalo);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }

})();
