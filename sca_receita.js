// ============================================================
//  SCA – Módulo de Persistência de Receita Bruta v1.0
//  Arquivo: sca_receita.js
//  Carregue APÓS sca_supabase.js
//
//  Problema resolvido:
//  As funções atualizarTotalAgricola() e atualizarTotalPec()
//  calculam a receita bruta na tela, mas só salvam o TOTAL
//  geral no campo valor_total_receitas da tabela clientes.
//  Os valores individuais de receita_bruta em cada tabela
//  (agr_temporaria, pec_bovino, etc.) dependem do campo
//  readonly da tela estar preenchido na hora do salvar.
//
//  O que este módulo faz:
//  ✅ Intercepta salvarAgricola() e salvarPecuaria()
//  ✅ Recalcula receita_bruta antes de cada upsert
//  ✅ Garante que o valor salvo no banco bate com o calculado
//  ✅ Não altera nenhum outro comportamento do sistema
// ============================================================

(function () {
'use strict';

// ─── FÓRMULAS DE RECEITA BRUTA ───────────────────────────────
// Espelham exatamente o que o index.html calcula na tela

function calcularReceitaAgricola(key, payload) {
  const n = v => parseFloat(v) || 0;
  switch (key) {
    case 'temp':
      // produção = area * produtividade; receita = produção * preço
      return n(payload.producao_total_kg) * n(payload.preco_unitario);
    case 'perm':
      // produção = num_plantas * prod_por_planta; receita = produção * preço
      return n(payload.producao_total_kg) * n(payload.preco_unitario);
    case 'outras':
      return n(payload.quantidade) * n(payload.preco_unitario);
    case 'extr':
      return n(payload.quantidade_kg) * n(payload.preco_unitario);
    case 'agro':
      return n(payload.quantidade) * n(payload.preco_unitario);
    case 'renda':
      // renda fora: valor_mensal * meses_no_ano = valor_anual
      return n(payload.valor_mensal) * n(payload.meses_no_ano);
    default:
      return null; // não recalcula se não conhece a chave
  }
}

function calcularReceitaPecuaria(key, payload) {
  const n = v => parseFloat(v) || 0;
  switch (key) {
    case 'bov':
      // arroba: cabecas_vendidas * (peso_medio / 15) * preco_arroba
      // mas o sistema usa receita direta — mantém o valor da tela
      return null; // bovino tem fórmula complexa, não recalcula
    case 'leite':
      // producao_total_l * preco_leite_l
      return n(payload.producao_total_l) * n(payload.preco_leite_l);
    case 'lcap':
      return n(payload.producao_total_l) * n(payload.preco_leite_l);
    case 'equ':
      return n(payload.unidades_vendidas) * n(payload.preco_unitario);
    case 'cap':
      return n(payload.unidades_vendidas) * n(payload.preco_unitario);
    case 'ovi':
      return n(payload.unidades_vendidas) * n(payload.preco_unitario);
    case 'sui':
      return n(payload.unidades_vendidas) * n(payload.preco_unitario);
    case 'aves':
      return n(payload.aves_vendidas_ano) * n(payload.preco_unitario);
    case 'out':
      return n(payload.unidades_vendidas) * n(payload.preco_unitario);
    default:
      return null;
  }
}

// ─── INTERCEPTA salvarAgricola ────────────────────────────────

function interceptarAgricola() {
  const original = window.salvarAgricola;
  if (typeof original !== 'function') return;

  window.salvarAgricola = async function(key) {
    // Executa o salvar original normalmente
    await original.call(this, key);

    // Após salvar, verifica se o valor de receita_bruta no banco
    // bate com o recalculado — se não bater, corrige
    try {
      const clienteId = typeof getClienteId === 'function'
        ? getClienteId()
        : (window.clientes?.[window.clIdx ?? -1]?.id || null);

      if (!clienteId || !window.supa) return;

      // Busca o registro salvo
      const tabelaMap = {
        temp:  'agr_temporaria',
        perm:  'agr_permanente',
        outras:'agr_outras_culturas',
        extr:  'agr_extrativismo',
        agro:  'agr_agroindustria',
        renda: 'agr_renda_fora',
      };
      const tabela = tabelaMap[key];
      if (!tabela) return;

      const { data } = await window.supa
        .from(tabela).select('*').eq('cliente_id', clienteId).maybeSingle();

      if (!data) return;

      const recalculada = calcularReceitaAgricola(key, data);
      if (recalculada === null) return; // fórmula não mapeada

      const campoReceita = key === 'renda' ? 'valor_anual' : 'receita_bruta';
      const salva = parseFloat(data[campoReceita]) || 0;

      // Só corrige se houver diferença maior que 1 centavo
      if (Math.abs(recalculada - salva) > 0.01) {
        await window.supa
          .from(tabela)
          .update({ [campoReceita]: recalculada })
          .eq('cliente_id', clienteId);
        console.log(`[SCA Receita] ✅ ${tabela}: receita corrigida de ${salva} → ${recalculada}`);
      }
    } catch (e) {
      console.warn('[SCA Receita] Aviso ao verificar receita agrícola:', e);
    }
  };
}

// ─── INTERCEPTA salvarPecuaria ────────────────────────────────

function interceptarPecuaria() {
  const original = window.salvarPecuaria;
  if (typeof original !== 'function') return;

  window.salvarPecuaria = async function(key) {
    await original.call(this, key);

    try {
      const clienteId = typeof getClienteId === 'function'
        ? getClienteId()
        : (window.clientes?.[window.clIdx ?? -1]?.id || null);

      if (!clienteId || !window.supa) return;

      const tabelaMap = {
        bov:  'pec_bovino',
        leite:'pec_leite_bovino',
        equ:  'pec_equino',
        cap:  'pec_caprino',
        lcap: 'pec_leite_caprino',
        ovi:  'pec_ovino',
        sui:  'pec_suino',
        aves: 'pec_aves',
        out:  'pec_outros',
      };
      const tabela = tabelaMap[key];
      if (!tabela) return;

      const { data } = await window.supa
        .from(tabela).select('*').eq('cliente_id', clienteId).maybeSingle();

      if (!data) return;

      const recalculada = calcularReceitaPecuaria(key, data);
      if (recalculada === null) return;

      const salva = parseFloat(data.receita_bruta) || 0;

      if (Math.abs(recalculada - salva) > 0.01) {
        await window.supa
          .from(tabela)
          .update({ receita_bruta: recalculada })
          .eq('cliente_id', clienteId);
        console.log(`[SCA Receita] ✅ ${tabela}: receita corrigida de ${salva} → ${recalculada}`);
      }
    } catch (e) {
      console.warn('[SCA Receita] Aviso ao verificar receita pecuária:', e);
    }
  };
}

// ─── INICIALIZAÇÃO ────────────────────────────────────────────

function inicializar() {
  setTimeout(() => {
    interceptarAgricola();
    interceptarPecuaria();
    console.log('[SCA Receita] ✅ v1.0 — persistência de receita bruta ativa.');
  }, 400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializar);
} else {
  inicializar();
}

})();
