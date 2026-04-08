// ============================================================
//  SCA – Assistente Inteligente de Documentos  v2.0
//  Arquivo: sca_assistente.js
//
//  Como usar:
//  Adicione no seu index.html, APÓS o sca_supabase.js:
//  <script src="sca_assistente.js"></script>
//
//  Melhorias v2.0:
//  ✅ Busca completa e direta do Supabase via JOIN automático
//  ✅ Normalização inteligente antes de enviar à Edge Function
//  ✅ Preview expandido dos dados cadastrais antes de gerar
//  ✅ Validação campo a campo com dicas de preenchimento
//  ✅ Retry automático com refresh de token
//  ✅ Campos extras persistidos no sessionStorage
//  ✅ Log detalhado do payload enviado à Edge Function
//  ✅ Detecção automática de seção "elaboração" (#doc-grid)
// ============================================================

(function () {
  'use strict';

  // ─── VERSÃO ──────────────────────────────────────────────
  const VERSION = '2.0.0';

  // ─── SEÇÕES E VALIDAÇÕES ─────────────────────────────────
  // Define quais campos são esperados em cada seção,
  // com dicas para exibir quando estiver incompleto.
  const SECOES = [
    {
      key: 'cliente',
      label: 'Dados Básicos',
      icone: '👤',
      obrigatorio: true,
      dica: 'Verifique CPF e Nome no cadastro.',
      checar: (c) => !!(c?.cpf && c?.nome),
      resumir: (c) => c?.nome ? `${c.nome} — CPF: ${_fmtCPF(c.cpf)}` : null,
    },
    {
      key: 'dados_pessoais',
      label: 'Dados Pessoais',
      icone: '📋',
      obrigatorio: true,
      dica: 'Preencha Estado Civil ou Data de Nascimento.',
      checar: (c) => !!(c?.dados_pessoais?.estado_civil || c?.dados_pessoais?.data_nascimento),
      resumir: (c) => {
        const d = c?.dados_pessoais;
        if (!d) return null;
        const partes = [];
        if (d.estado_civil) partes.push(d.estado_civil);
        if (d.data_nascimento) partes.push(`Nasc: ${d.data_nascimento}`);
        return partes.join(' · ') || null;
      },
    },
    {
      key: 'endereco',
      label: 'Endereço / Contato',
      icone: '📍',
      obrigatorio: true,
      dica: 'Preencha ao menos Cidade ou Celular.',
      // clientes_endereco: cidade, uf, celular1 (já formatado), email
      checar: (c) => !!(c?.endereco?.cidade || c?.endereco?.celular1 || c?.endereco?.uf),
      resumir: (c) => {
        const e = c?.endereco;
        if (!e) return null;
        const partes = [];
        if (e.cidade) partes.push(e.cidade);
        if (e.uf || e.estado) partes.push(e.uf || e.estado);
        if (e.celular1) partes.push(e.celular1);
        return partes.join(' · ') || null;
      },
    },
    {
      key: 'bancarios',
      label: 'Dados Bancários',
      icone: '🏦',
      obrigatorio: true,
      dica: 'Preencha Linha de Crédito ou Banco do Projeto.',
      checar: (c) => !!(c?.bancarios?.linha_credito || c?.bancarios?.banco_projeto),
      resumir: (c) => {
        const b = c?.bancarios;
        if (!b) return null;
        const partes = [];
        if (b.linha_credito)  partes.push(b.linha_credito);
        if (b.banco_projeto)  partes.push(b.banco_projeto);
        if (b.tipo_projeto)   partes.push(b.tipo_projeto);
        return partes.join(' · ') || null;
      },
    },
    {
      key: 'conjugue',
      label: 'Cônjuge',
      icone: '💑',
      obrigatorio: false,
      dica: 'Opcional. Preencha se o cliente for casado.',
      checar: (c) => !!(c?.participantes?.conjugue?.nome || c?.conjugue?.nome),
      resumir: (c) => c?.participantes?.conjugue?.nome || c?.conjugue?.nome || null,
    },
    {
      key: 'avalista',
      label: 'Avalista',
      icone: '🤝',
      obrigatorio: false,
      dica: 'Opcional. Necessário em alguns documentos.',
      checar: (c) => !!(c?.participantes?.avalista?.nome || c?.avalista?.nome),
      resumir: (c) => c?.participantes?.avalista?.nome || c?.avalista?.nome || null,
    },
    {
      key: 'propriedade',
      label: 'Propriedade',
      icone: '🌾',
      obrigatorio: true,
      dica: 'Preencha Nome da Propriedade ou Área Total.',
      // propriedades: nome_propriedade, area_total_ha, ger_municipio, ger_uf
      checar: (c) => !!(c?.propriedade?.nome_propriedade || c?.propriedade?.area_total_ha),
      resumir: (c) => {
        const p = c?.propriedade;
        if (!p) return null;
        const partes = [];
        if (p.nome_propriedade) partes.push(p.nome_propriedade);
        if (p.area_total_ha) partes.push(`${p.area_total_ha} ha`);
        // municipio: alias de ger_municipio (normalizado)
        if (p.municipio || p.ger_municipio) partes.push(p.municipio || p.ger_municipio);
        return partes.join(' · ') || null;
      },
    },
    {
      key: 'operacao_atual',
      label: 'Operação Atual',
      icone: '📑',
      obrigatorio: false,
      dica: 'Opcional. Contrato anterior ou operação vigente.',
      checar: (c) => !!(c?.operacao_atual?.banco || c?.operacao_atual?.num_contrato),
      resumir: (c) => {
        const o = c?.operacao_atual;
        if (!o) return null;
        const partes = [];
        if (o.banco) partes.push(o.banco);
        if (o.num_contrato) partes.push(`Contrato: ${o.num_contrato}`);
        return partes.join(' · ') || null;
      },
    },
    {
      key: 'agricola',
      label: 'Produção Agrícola',
      icone: '🌱',
      obrigatorio: false,
      dica: 'Opcional. Útil para documentos de custeio agrícola.',
      checar: (c) => {
        const a = c?.agricola || {};
        return Object.values(a).some(v => v && typeof v === 'object' && Object.values(v).some(x => x));
      },
      resumir: (c) => {
        const a = c?.agricola || {};
        const culturas = Object.keys(a).filter(k => {
          const v = a[k];
          return v && typeof v === 'object' && Object.values(v).some(x => x);
        });
        return culturas.length ? culturas.join(', ') : null;
      },
    },
    {
      key: 'pecuaria',
      label: 'Pecuária',
      icone: '🐄',
      obrigatorio: false,
      dica: 'Opcional. Necessário para documentos de pecuária.',
      checar: (c) => {
        const p = c?.pecuaria || {};
        return Object.values(p).some(v => v && typeof v === 'object' && Object.values(v).some(x => x));
      },
      resumir: (c) => {
        const p = c?.pecuaria || {};
        const tipos = Object.keys(p).filter(k => {
          const v = p[k];
          return v && typeof v === 'object' && Object.values(v).some(x => x);
        });
        return tipos.length ? tipos.join(', ') : null;
      },
    },
  ];

  // ─── CAMPOS EXTRAS ───────────────────────────────────────
  const EXTRAS_CAMPOS = [
    { id: 'z_vizinho_leste',               label: 'Vizinho Leste (nome)',              placeholder: 'Nome do vizinho leste' },
    { id: 'z_vizinho_leste_cpf',           label: 'Vizinho Leste (CPF)',               placeholder: 'CPF' },
    { id: 'z_vizinho_norte',               label: 'Vizinho Norte (nome)',              placeholder: 'Nome do vizinho norte' },
    { id: 'z_vizinho_norte_cpf',           label: 'Vizinho Norte (CPF)',               placeholder: 'CPF' },
    { id: 'z_vizinho_sul',                 label: 'Vizinho Sul (nome)',                placeholder: 'Nome do vizinho sul' },
    { id: 'z_vizinho_sul_cpf',             label: 'Vizinho Sul (CPF)',                 placeholder: 'CPF' },
    { id: 'z_vizinho_oeste',               label: 'Vizinho Oeste (nome)',              placeholder: 'Nome do vizinho oeste' },
    { id: 'z_vizinho_oeste_cpf',           label: 'Vizinho Oeste (CPF)',               placeholder: 'CPF' },
    { id: 'z_testemunha_1_nome',           label: 'Testemunha 1 (nome)',               placeholder: 'Nome completo' },
    { id: 'z_testemunha_1_cpf',            label: 'Testemunha 1 (CPF)',                placeholder: 'CPF' },
    { id: 'z_testemunha_2_nome',           label: 'Testemunha 2 (nome)',               placeholder: 'Nome completo' },
    { id: 'z_testemunha_2_cpf',            label: 'Testemunha 2 (CPF)',                placeholder: 'CPF' },
    { id: 'e_comissao_ater_extenso',       label: 'Comissão ATER (por extenso)',        placeholder: 'Ex: quinhentos reais' },
    { id: 'e_comissao_percentual_extenso', label: 'Comissão Percentual (por extenso)', placeholder: 'Ex: dois por cento' },
    { id: 'e_particular_ater_extenso',     label: 'ATER Particular (por extenso)',      placeholder: 'Ex: duzentos reais' },
    { id: 'e_particular_percentual_extenso', label: 'ATER Particular % (por extenso)', placeholder: 'Ex: um por cento' },
    { id: 'z_data_assinatura',             label: 'Data de Assinatura',                placeholder: 'Ex: 08 de abril de 2025' },
    { id: 'z_local_assinatura',            label: 'Local de Assinatura',               placeholder: 'Ex: Palmas, TO' },
  ];

  // ─── EXTRAS: persistência em sessionStorage ───────────────
  const EXTRAS_KEY = '_sca_extras_v2';

  function _carregarExtras() {
    try {
      const raw = sessionStorage.getItem(EXTRAS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function _salvarExtrasStorage(obj) {
    try { sessionStorage.setItem(EXTRAS_KEY, JSON.stringify(obj)); } catch {}
  }

  // Expõe no window para compatibilidade
  window._scaExtras = _carregarExtras();

  // ─── HELPERS DE FORMATAÇÃO ───────────────────────────────
  function _fmtCPF(v) {
    if (!v) return '';
    const n = v.replace(/\D/g, '');
    return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  // ─── OBTER TOKEN SUPABASE ────────────────────────────────
  async function _getToken() {
    try {
      // Tenta sessão atual
      const sess = window.supa?.auth?.currentSession;
      if (sess?.access_token) return sess.access_token;

      // Tenta via getSession (Supabase v2)
      const { data } = await window.supa?.auth?.getSession?.() || {};
      if (data?.session?.access_token) return data.session.access_token;

      // Tenta via refreshSession como último recurso (Supabase v2)
      const { data: rd } = await window.supa?.auth?.refreshSession?.() || {};
      if (rd?.session?.access_token) return rd.session.access_token;
    } catch (e) {
      console.warn('[SCA Assistente] Não conseguiu obter token:', e);
    }
    return '';
  }

  // ─── BUSCAR CLIENTE COMPLETO DO SUPABASE ─────────────────
  // Faz um SELECT com JOIN em TODAS as tabelas relacionadas.
  // Retorna o objeto bruto do Supabase ou null em caso de falha.
  async function _buscarClienteCompleto(clienteId) {
    if (!window.supa) {
      console.error('[SCA] window.supa não está disponível.');
      return null;
    }
    if (!clienteId) {
      console.error('[SCA] clienteId inválido:', clienteId);
      return null;
    }

    console.group(`[SCA] 🔍 Buscando cliente completo — id: ${clienteId}`);

    // Tenta até 3 vezes com refresh de token entre tentativas
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const { data, error } = await window.supa
          .from('clientes')
          .select(`
            *,
            dados_pessoais:clientes_dados_pessoais(*),
            endereco:clientes_endereco(*),
            bancarios:clientes_bancarios(*),
            propriedade:propriedades(*),
            conjugue:conjuges(*),
            avalista:avalistas(*),
            arrendante:arrendantes(*),
            participante_empresa:participante_empresa(*),
            elaboracao:elaboracao_projetos(*),
            operacao_atual:operacao_atual(*),
            operacoes_em_ser:operacoes_em_ser(*),
            agr_temporaria:agr_temporaria(*),
            agr_permanente:agr_permanente(*),
            agr_outras_culturas:agr_outras_culturas(*),
            agr_extrativismo:agr_extrativismo(*),
            agr_agroindustria:agr_agroindustria(*),
            agr_renda_fora:agr_renda_fora(*),
            pec_bovino:pec_bovino(*),
            pec_leite_bovino:pec_leite_bovino(*),
            pec_leite_caprino:pec_leite_caprino(*),
            pec_caprino:pec_caprino(*),
            pec_equino:pec_equino(*),
            pec_ovino:pec_ovino(*),
            pec_suino:pec_suino(*),
            pec_aves:pec_aves(*),
            pec_outros:pec_outros(*)
          `)
          .eq('id', clienteId)
          .single();

        if (error) {
          console.warn(`[SCA] Tentativa ${tentativa}/3 — erro Supabase:`, error.message, error);
          if (tentativa < 3) {
            // Tenta renovar token antes de tentar novamente
            try { await window.supa.auth.refreshSession(); } catch {}
            await new Promise(r => setTimeout(r, 600 * tentativa));
            continue;
          }
          console.groupEnd();
          return null;
        }

        if (!data) {
          console.warn(`[SCA] Tentativa ${tentativa}/3 — sem dados retornados para id: ${clienteId}`);
          console.groupEnd();
          return null;
        }

        console.log('[SCA] ✅ Dados brutos recebidos do Supabase:', data);
        console.groupEnd();
        return data;

      } catch (e) {
        console.warn(`[SCA] Tentativa ${tentativa}/3 — exceção:`, e);
        if (tentativa < 3) {
          await new Promise(r => setTimeout(r, 600 * tentativa));
          continue;
        }
        console.groupEnd();
        return null;
      }
    }

    console.groupEnd();
    return null;
  }

  // ─── NORMALIZAR PAYLOAD PARA A EDGE FUNCTION ─────────────
  // Converte o objeto bruto do Supabase para o formato flat
  // que os templates da Edge Function esperam.
  // Regras:
  //   • Supabase pode retornar relações 1-para-1 como objeto OU array[0]
  //   • Relações 1-para-N (operacoes_em_ser) ficam como array
  //   • Campos id/cliente_id/created_at/updated_at são removidos
  //   • Extras manuais (z_* e_*) são mesclados no nível raiz
  function _normalizarPayload(clienteRaw, extras) {
    if (!clienteRaw) return null;

    // Resolve relação 1-para-1: aceita objeto ou array[0]
    const _uno = (v) => {
      if (!v) return null;
      if (Array.isArray(v)) return v[0] || null;
      return v;
    };

    // Resolve relação 1-para-N: garante sempre array (filtra nulls)
    const _multi = (v) => {
      if (!v) return [];
      if (Array.isArray(v)) return v.filter(Boolean);
      return [v];
    };

    // ── Sub-tabelas 1-para-1 (nomes exatos conforme schema SQL)
    const dados_pessoais_raw   = _uno(clienteRaw.dados_pessoais)        || {};
    const endereco_raw         = _uno(clienteRaw.endereco)              || {};
    const bancarios_raw        = _uno(clienteRaw.bancarios)             || {};
    const propriedade_raw      = _uno(clienteRaw.propriedade)           || {};
    const operacao_atual_raw   = _uno(clienteRaw.operacao_atual)        || {};
    const arrendante           = _uno(clienteRaw.arrendante)            || {};
    const participante_empresa = _uno(clienteRaw.participante_empresa)  || {};
    const elaboracao           = _uno(clienteRaw.elaboracao)            || {};

    // ── DADOS PESSOAIS (tabela: clientes_dados_pessoais)
    // Campos reais: numero_di, data_emissao_di, orgao_emissor, uf_orgao_emissor,
    //   data_nascimento, uf_nascimento, naturalidade, estado_civil, regime_casamento,
    //   nome_pai, nome_mae, numero_caf, escolaridade, sexo, apelido, tipo_identidade,
    //   numero_titulo, ja_fez_financiamento, exposto_politicamente, beneficiario_pol_publicas
    const dados_pessoais = {
      ...dados_pessoais_raw,
      // Aliases para templates (campo real → alias)
      rg:              dados_pessoais_raw.numero_di       || '',
      data_emissao_rg: dados_pessoais_raw.data_emissao_di || '',
    };

    // ── ENDEREÇO (tabela: clientes_endereco)
    // Campos reais: logradouro, numero, bairro, uf, cidade, cep,
    //   ddd_cel1, celular1, ddd_cel2, celular2, ddd_residencial, tel_residencial, email
    const celular1_fmt = endereco_raw.ddd_cel1 && endereco_raw.celular1
      ? `(${endereco_raw.ddd_cel1}) ${endereco_raw.celular1}`
      : (endereco_raw.celular1 || '');
    const celular2_fmt = endereco_raw.ddd_cel2 && endereco_raw.celular2
      ? `(${endereco_raw.ddd_cel2}) ${endereco_raw.celular2}`
      : (endereco_raw.celular2 || '');
    const endereco = {
      ...endereco_raw,
      // Aliases para templates
      estado:       endereco_raw.uf     || '',   // campo real é "uf"
      cidade:       endereco_raw.cidade || '',
      celular1:     celular1_fmt,
      celular2:     celular2_fmt,
      ddd_celular1: endereco_raw.ddd_cel1 || '',
      ddd_celular2: endereco_raw.ddd_cel2 || '',
    };

    // ── BANCÁRIOS (tabela: clientes_bancarios)
    // Campos reais: banco_projeto, agencia_projeto, uf_agencia, cidade_agencia,
    //   linha_credito, tipo_projeto, tipo_cliente, porte_cliente, aptidao,
    //   cultura_especie, experiencia_anos, banco_conta, agencia_conta,
    //   conta_digito, uf_conta, cidade_conta
    const bancarios = {
      ...bancarios_raw,
      // Aliases para templates
      banco:          bancarios_raw.banco_projeto   || '',
      agencia:        bancarios_raw.agencia_projeto || '',
      valor_total_financiamento: operacao_atual_raw.valor_total || '',
    };

    // ── PROPRIEDADE (tabela: propriedades)
    // Campos reais: nome_propriedade, denominacao, inscricao_estadual, nirf, incra,
    //   ger_logradouro, ger_bairro, ger_uf, ger_municipio, ger_cep,
    //   viz_norte, viz_sul, viz_leste, viz_oeste,
    //   testemunha1_nome, testemunha1_cpf, testemunha2_nome, testemunha2_cpf,
    //   tipo_solo, textura_solo, relevo, drenagem, precipitacao_mm, temperatura_media_c,
    //   area_total_ha, area_agricultavel_ha, area_pastagem_ha, area_reserva_ha,
    //   area_aproveitada_ha, area_projeto_ha, area_app_ha, area_inapta_ha,
    //   doc_tipo, doc_numero, doc_data, doc_cartorio, doc_num_car, doc_num_ccir, doc_num_itr,
    //   tipo_propriedade, prop_nome, prop_cpf, ...
    const propriedade = {
      ...propriedade_raw,
      // Aliases para templates (ger_municipio → municipio, ger_uf → estado)
      municipio: propriedade_raw.ger_municipio || propriedade_raw.municipio || '',
      estado:    propriedade_raw.ger_uf        || propriedade_raw.estado    || propriedade_raw.uf || '',
      // Vizinhos: aliases do banco → nomes usados nos extras
      vizinho_norte: propriedade_raw.viz_norte || '',
      vizinho_sul:   propriedade_raw.viz_sul   || '',
      vizinho_leste: propriedade_raw.viz_leste || '',
      vizinho_oeste: propriedade_raw.viz_oeste || '',
      // Testemunhas: campos nativos do banco (priority sobre extras z_*)
      testemunha1_nome: propriedade_raw.testemunha1_nome || '',
      testemunha1_cpf:  propriedade_raw.testemunha1_cpf  || '',
      testemunha2_nome: propriedade_raw.testemunha2_nome || '',
      testemunha2_cpf:  propriedade_raw.testemunha2_cpf  || '',
    };

    // ── OPERAÇÃO ATUAL (tabela: operacao_atual)
    // Campos reais: banco, num_contrato, finalidade, valor_total, data_emissao,
    //   comissao_banco_pct, comissao_banco_rs, comissao_part_pct, comissao_part_rs,
    //   data_1a_parcela, data_parcela_final, carencia_meses, prazo_meses, ano_safra
    const operacao_atual = { ...operacao_atual_raw };

    // ── Participantes
    const conjugue  = _uno(clienteRaw.conjugue)  || null;
    const avalista  = _uno(clienteRaw.avalista)  || null;
    const participantes = {
      conjugue: conjugue || {},
      avalista:  avalista  || {},
    };

    // ── Relação 1-para-N
    const operacoes_em_ser = _multi(clienteRaw.operacoes_em_ser);

    // ── Agrícola — cada tabela agr_* vira uma chave no objeto
    const agricola = {};
    const _agr = (src, key) => {
      const v = _uno(src);
      if (v && Object.keys(v).length > 0) agricola[key] = v;
    };
    _agr(clienteRaw.agr_temporaria,      'temporaria');
    _agr(clienteRaw.agr_permanente,      'permanente');
    _agr(clienteRaw.agr_outras_culturas, 'outras_culturas');
    _agr(clienteRaw.agr_extrativismo,    'extrativismo');
    _agr(clienteRaw.agr_agroindustria,   'agroindustria');
    _agr(clienteRaw.agr_renda_fora,      'renda_fora');

    // ── Pecuária — cada tabela pec_* vira uma chave no objeto
    const pecuaria = {};
    const _pec = (src, key) => {
      const v = _uno(src);
      if (v && Object.keys(v).length > 0) pecuaria[key] = v;
    };
    _pec(clienteRaw.pec_bovino,        'bovino');
    _pec(clienteRaw.pec_leite_bovino,  'leite_bovino');
    _pec(clienteRaw.pec_leite_caprino, 'leite_caprino');
    _pec(clienteRaw.pec_caprino,       'caprino');
    _pec(clienteRaw.pec_equino,        'equino');
    _pec(clienteRaw.pec_ovino,         'ovino');
    _pec(clienteRaw.pec_suino,         'suino');
    _pec(clienteRaw.pec_aves,          'aves');
    _pec(clienteRaw.pec_outros,        'outros');

    // ── Monta payload final
    const payload = {
      // Tabela clientes (campos raiz)
      cpf:          clienteRaw.cpf          || '',
      nome:         clienteRaw.nome         || '',
      codigo:       clienteRaw.codigo       || '',
      data_cadastro: clienteRaw.data_cadastro || '',
      valor_total_receitas: clienteRaw.valor_total_receitas || '',
      foto_url:     clienteRaw.foto_url     || '',

      // Aliases de raiz (extraídos de sub-tabelas para acesso direto nos templates)
      rg:               dados_pessoais.rg               || '',   // ← numero_di de clientes_dados_pessoais
      tipo_identidade:  dados_pessoais.tipo_identidade  || '',
      orgao_emissor:    dados_pessoais.orgao_emissor     || '',
      uf_orgao_emissor: dados_pessoais.uf_orgao_emissor  || '',
      data_emissao_rg:  dados_pessoais.data_emissao_rg   || '',
      data_nascimento:  dados_pessoais.data_nascimento   || '',
      estado_civil:     dados_pessoais.estado_civil      || '',
      naturalidade:     dados_pessoais.naturalidade      || '',
      uf_nascimento:    dados_pessoais.uf_nascimento     || '',
      sexo:             dados_pessoais.sexo              || '',
      apelido:          dados_pessoais.apelido           || '',
      escolaridade:     dados_pessoais.escolaridade      || '',
      nome_pai:         dados_pessoais.nome_pai          || '',
      nome_mae:         dados_pessoais.nome_mae          || '',
      numero_caf:       dados_pessoais.numero_caf        || '',
      numero_titulo:    dados_pessoais.numero_titulo     || '',

      // E-mail e telefone de clientes_endereco
      email:    endereco.email    || '',   // ← campo "email" de clientes_endereco
      celular:  endereco.celular1 || '',
      telefone: endereco.ddd_residencial && endereco.tel_residencial
        ? `(${endereco.ddd_residencial}) ${endereco.tel_residencial}`
        : (endereco.tel_residencial || ''),

      // Sub-seções
      dados_pessoais,
      endereco,
      bancarios,
      propriedade,
      participantes,
      conjugue,             // acesso direto também
      avalista,             // acesso direto também
      operacao_atual,
      operacoes_em_ser,
      arrendante,
      participante_empresa,
      elaboracao,
      agricola,
      pecuaria,

      // Extras manuais (z_* e e_*) mesclados no nível raiz
      ...(extras || {}),
    };

    // ── Remove campos internos do banco (não poluem o template)
    const CAMPOS_INTERNOS = new Set(['id', 'cliente_id', 'created_at', 'updated_at', 'deleted_at']);
    function _limpar(obj) {
      if (obj === null || obj === undefined) return obj;
      if (Array.isArray(obj)) return obj.map(_limpar);
      if (typeof obj === 'object') {
        const r = {};
        for (const [k, v] of Object.entries(obj)) {
          if (CAMPOS_INTERNOS.has(k)) continue;
          r[k] = _limpar(v);
        }
        return r;
      }
      return obj;
    }

    const payloadLimpo = _limpar(payload);

    console.group('[SCA] 📦 Payload normalizado para Edge Function');
    console.log(JSON.stringify(payloadLimpo, null, 2));
    console.groupEnd();

    return payloadLimpo;
  }

  // ─── CHAMAR EDGE FUNCTION ────────────────────────────────
  // Envia o payload completo para a função gerar-documento.
  // Faz até 2 tentativas: na falha de autenticação renova o token.
  async function _chamarEdgeFunction(cpf, template, payloadCompleto) {
    const baseUrl = (window.SUPA_URL || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('[SCA] window.SUPA_URL não configurado.');

    const url    = `${baseUrl}/functions/v1/gerar-documento`;
    const apiKey = window.SUPA_KEY || '';
    if (!apiKey) console.warn('[SCA] window.SUPA_KEY não configurado — a requisição pode falhar.');

    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const token = await _getToken();

      const body = JSON.stringify({
        cpf,
        template,
        dados:  payloadCompleto,
        extras: window._scaExtras || {}, // campos extras da sessão (z_* e e_*)
      });

      console.group(`[SCA] 📤 Edge Function — tentativa ${tentativa}/2 → ${template}`);
      console.log('URL:', url);
      console.log('CPF:', cpf);
      console.log('Body size:', body.length, 'bytes');
      console.groupEnd();

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey':        apiKey,
        },
        body,
      });

      // Sucesso
      if (resp.ok) return resp;

      // Falha de autenticação → renova token e tenta de novo
      if (resp.status === 401 && tentativa === 1) {
        console.warn('[SCA] 401 — tentando renovar token...');
        try { await window.supa?.auth?.refreshSession(); } catch {}
        continue;
      }

      // Qualquer outro erro: lê mensagem e lança
      let errMsg = `HTTP ${resp.status}`;
      try {
        const errBody = await resp.text();
        try {
          const j = JSON.parse(errBody);
          errMsg = j.error || j.message || errMsg;
        } catch {
          if (errBody) errMsg += ` — ${errBody.substring(0, 200)}`;
        }
      } catch {}
      throw new Error(`Edge Function: ${errMsg}`);
    }

    throw new Error('Edge Function: falha após 2 tentativas.');
  }

  // ─── GERAR DOCUMENTO — FLUXO COMPLETO ────────────────────
  // 1. Busca dados 100% frescos do Supabase (todas as tabelas)
  // 2. Normaliza para o formato que os templates esperam
  // 3. Envia para a Edge Function com retry automático
  // 4. Abre o HTML retornado em nova aba
  async function _gerarDocumento(cpf, template, clienteId) {
    // ── Passo 1: buscar dados no Supabase
    let clienteRaw = null;

    if (clienteId) {
      // Invalida cache para garantir dados frescos na geração
      _limparCacheCliente(clienteId);
      clienteRaw = await _buscarClienteCompleto(clienteId);
    }

    // Fallback: dados em memória (último recurso, com aviso claro)
    if (!clienteRaw) {
      const idx = _getClienteIdx();
      clienteRaw = (idx >= 0 && window.clientes) ? window.clientes[idx] : null;
      if (clienteRaw) {
        console.warn('[SCA] ⚠️ Supabase não retornou dados — usando objeto em memória. Os documentos podem estar incompletos!');
        _astToast('⚠️ Usando dados em memória. Verifique a conexão com o Supabase.', 'warn');
      }
    }

    if (!clienteRaw) {
      throw new Error('Não foi possível obter os dados do cliente. Verifique a conexão.');
    }

    // ── Passo 2: normalizar payload
    const extras  = window._scaExtras || {};
    const payload = _normalizarPayload(clienteRaw, extras);

    if (!payload) throw new Error('Falha ao montar o payload do cliente.');

    // Valida campos mínimos antes de chamar a Edge Function
    if (!payload.cpf || !payload.nome) {
      throw new Error(`Payload inválido — CPF: "${payload.cpf}", Nome: "${payload.nome}".`);
    }

    // ── Passo 3: chamar Edge Function
    const resp = await _chamarEdgeFunction(cpf, template, payload);

    // ── Passo 4: abrir documento
    const html    = await resp.text();

    if (!html || html.trim().length === 0) {
      throw new Error('Edge Function retornou documento vazio.');
    }

    const blob    = new Blob([html], { type: 'text/html; charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const janela  = window.open(blobUrl, '_blank');
    if (!janela) _astToast('⚠️ Popup bloqueado. Permita pop-ups para este site.', 'warn');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

    return true;
  }

  // ─── HELPERS INTERNOS ────────────────────────────────────
  function _getClienteIdx() {
    if (typeof window.clIdx !== 'undefined' && window.clIdx >= 0) return window.clIdx;
    if (typeof clIdx !== 'undefined' && clIdx >= 0) return clIdx; // eslint-disable-line
    return -1;
  }

  function _getClienteAtual() {
    const idx = _getClienteIdx();
    return (idx >= 0 && window.clientes) ? window.clientes[idx] : null;
  }

  // ─── ESTILOS ─────────────────────────────────────────────
  function injetarEstilos() {
    if (document.getElementById('_sca_assist_style')) return;
    const st = document.createElement('style');
    st.id = '_sca_assist_style';
    st.textContent = `
      /* ── PAINEL ASSISTENTE ─────────────────────────────── */
      #sca-assistente {
        background: linear-gradient(135deg, #f0f7f3 0%, #e8f5ee 100%);
        border: 1.5px solid #c3dccb;
        border-radius: 14px;
        padding: 16px 18px;
        margin-bottom: 18px;
        font-family: 'Nunito', 'DM Sans', sans-serif;
        box-shadow: 0 4px 16px rgba(26,92,56,.08);
      }

      #sca-assistente .ast-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
        flex-wrap: wrap;
      }

      #sca-assistente .ast-titulo {
        font-size: 1rem;
        font-weight: 800;
        color: #1a5c38;
        flex: 1;
      }

      #sca-assistente .ast-versao {
        font-size: .65rem;
        color: #6b7280;
        font-weight: 600;
        align-self: flex-end;
        margin-bottom: 2px;
      }

      #sca-assistente .ast-cliente-badge {
        background: #1a5c38;
        color: #fff;
        border-radius: 20px;
        padding: 4px 12px;
        font-size: .78rem;
        font-weight: 700;
        max-width: 260px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #sca-assistente .ast-cliente-badge.vazio {
        background: #94a3b8;
      }

      /* ── DIAGNÓSTICO ───────────────────────────────────── */
      #sca-assistente .ast-diag {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 14px;
      }

      #sca-assistente .ast-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: 20px;
        font-size: .72rem;
        font-weight: 700;
        cursor: default;
        transition: transform .15s;
        user-select: none;
        position: relative;
      }

      #sca-assistente .ast-chip:hover { transform: scale(1.05); }
      #sca-assistente .ast-chip:hover .ast-chip-tooltip { display: block; }

      #sca-assistente .ast-chip-tooltip {
        display: none;
        position: absolute;
        bottom: calc(100% + 6px);
        left: 50%;
        transform: translateX(-50%);
        background: #1e293b;
        color: #fff;
        font-size: .68rem;
        font-weight: 600;
        padding: 5px 10px;
        border-radius: 7px;
        white-space: nowrap;
        z-index: 99;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,.2);
      }

      #sca-assistente .ast-chip-tooltip::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: #1e293b;
      }

      #sca-assistente .ast-chip.ok         { background:#d1fae5; color:#065f46; border:1px solid #6ee7b7; }
      #sca-assistente .ast-chip.warn        { background:#fef3c7; color:#92400e; border:1px solid #fcd34d; }
      #sca-assistente .ast-chip.vazio       { background:#f1f5f9; color:#94a3b8; border:1px solid #e2e8f0; }
      #sca-assistente .ast-chip.obrig-vazio { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }

      /* ── RESUMO DO CHIP ─────────────────────────────────── */
      #sca-assistente .ast-chip-resumo {
        font-size: .65rem;
        font-weight: 400;
        opacity: .75;
        margin-left: 2px;
      }

      /* ── BARRA DE PROGRESSO ────────────────────────────── */
      #sca-assistente .ast-prog-label {
        font-size: .74rem;
        color: #1a5c38;
        font-weight: 700;
        margin-bottom: 5px;
      }

      #sca-assistente .ast-prog-bar {
        width: 100%;
        height: 8px;
        background: #d1e8da;
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 14px;
      }

      #sca-assistente .ast-prog-fill {
        height: 100%;
        background: linear-gradient(90deg, #1a5c38, #38a169);
        border-radius: 10px;
        transition: width .5s ease;
      }

      /* ── ALERTAS ───────────────────────────────────────── */
      #sca-assistente .ast-alertas { margin-bottom: 12px; }

      #sca-assistente .ast-alerta {
        background: #fff7ed;
        border: 1px solid #fed7aa;
        border-radius: 8px;
        padding: 8px 12px;
        font-size: .78rem;
        color: #9a3412;
        font-weight: 600;
        margin-bottom: 6px;
        display: flex;
        align-items: flex-start;
        gap: 6px;
        line-height: 1.4;
      }

      /* ── EXTRAS BADGE ──────────────────────────────────── */
      #sca-assistente .ast-extras-badge {
        background: #dbeafe;
        color: #1e40af;
        border-radius: 8px;
        padding: 5px 10px;
        font-size: .73rem;
        font-weight: 700;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      /* ── BOTÕES AÇÃO ───────────────────────────────────── */
      #sca-assistente .ast-acoes {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      #sca-assistente .ast-btn {
        padding: 9px 16px;
        border: none;
        border-radius: 8px;
        font-family: inherit;
        font-size: .8rem;
        font-weight: 800;
        cursor: pointer;
        transition: all .18s;
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }

      #sca-assistente .ast-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0,0,0,.15);
      }

      #sca-assistente .ast-btn:disabled { opacity:.5; cursor:not-allowed; transform:none; }

      #sca-assistente .ast-btn-primary   { background:#1a5c38; color:#fff; }
      #sca-assistente .ast-btn-secondary { background:#fff; color:#1a5c38; border:1.5px solid #1a5c38; }
      #sca-assistente .ast-btn-info      { background:#dbeafe; color:#1e3a8a; border:1px solid #93c5fd; }
      #sca-assistente .ast-btn-warn      { background:#fef9c3; color:#854d0e; border:1px solid #fde68a; }

      /* ── SPINNER ───────────────────────────────────────── */
      @keyframes _ast_spin { to { transform: rotate(360deg); } }
      .ast-spin {
        display: inline-block;
        width: 14px; height: 14px;
        border: 2px solid rgba(255,255,255,.4);
        border-top-color: #fff;
        border-radius: 50%;
        animation: _ast_spin .7s linear infinite;
      }

      /* ── SEM CLIENTE ───────────────────────────────────── */
      #sca-assistente .ast-sem-cliente {
        text-align: center;
        padding: 10px 0;
        color: #94a3b8;
        font-size: .82rem;
        font-style: italic;
      }

      /* ── MODAL GENÉRICO ────────────────────────────────── */
      .sca-modal-overlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,.5);
        z-index: 9990;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }

      .sca-modal-box {
        background: #fff;
        border-radius: 16px;
        padding: 28px;
        max-width: 520px;
        width: 100%;
        box-shadow: 0 20px 60px rgba(0,0,0,.25);
        font-family: 'Nunito', 'DM Sans', sans-serif;
        max-height: 88vh;
        overflow-y: auto;
      }

      .sca-modal-box h3 {
        color: #1a5c38;
        font-size: 1rem;
        font-weight: 800;
        margin: 0 0 4px 0;
      }

      .sca-modal-box .sca-modal-sub {
        font-size: .78rem;
        color: #6b7280;
        margin: 0 0 18px 0;
      }

      .sca-modal-box .sca-campo { margin-bottom: 12px; }

      .sca-modal-box .sca-campo label {
        display: block;
        font-size: .78rem;
        font-weight: 700;
        color: #374151;
        margin-bottom: 4px;
      }

      .sca-modal-box .sca-campo input,
      .sca-modal-box .sca-campo select {
        width: 100%;
        padding: 8px 10px;
        border: 1.5px solid #d1d5db;
        border-radius: 8px;
        font-family: inherit;
        font-size: .85rem;
        box-sizing: border-box;
        transition: border-color .2s;
      }

      .sca-modal-box .sca-campo input:focus,
      .sca-modal-box .sca-campo select:focus {
        outline: none;
        border-color: #1a5c38;
      }

      .sca-modal-acoes {
        display: flex;
        gap: 8px;
        margin-top: 18px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }

      /* ── PREVIEW DE DADOS ──────────────────────────────── */
      .sca-preview-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin: 12px 0;
      }

      @media (max-width: 480px) {
        .sca-preview-grid { grid-template-columns: 1fr; }
      }

      .sca-preview-item {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 8px 10px;
      }

      .sca-preview-item.ok    { border-color: #6ee7b7; background: #f0fdf4; }
      .sca-preview-item.empty { border-color: #fca5a5; background: #fff5f5; }
      .sca-preview-item.opt   { border-color: #e2e8f0; background: #f8fafc; }

      .sca-preview-item .pi-label {
        font-size: .68rem;
        font-weight: 800;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: .03em;
        margin-bottom: 3px;
      }

      .sca-preview-item .pi-valor {
        font-size: .8rem;
        font-weight: 600;
        color: #1e293b;
      }

      .sca-preview-item.empty .pi-valor { color: #dc2626; font-style: italic; }
      .sca-preview-item.opt   .pi-valor { color: #94a3b8; font-style: italic; }

      /* ── GRUPOS DE EXTRAS ──────────────────────────────── */
      .sca-extras-grupo {
        font-size: .72rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: .05em;
        color: #6b7280;
        margin: 16px 0 8px 0;
        padding-bottom: 4px;
        border-bottom: 1px solid #e5e7eb;
      }
    `;
    document.head.appendChild(st);
  }

  // ─── MONTAR PAINEL ───────────────────────────────────────
  function criarPainel() {
    if (document.getElementById('sca-assistente')) return;

    const docGrid = document.getElementById('doc-grid');
    if (!docGrid) return;

    const painel = document.createElement('div');
    painel.id = 'sca-assistente';
    painel.innerHTML = `
      <div class="ast-header">
        <span style="font-size:1.3rem;">🤖</span>
        <span class="ast-titulo">Assistente de Documentos</span>
        <span class="ast-versao">v${VERSION}</span>
        <span class="ast-cliente-badge vazio" id="ast-cliente-nome">Nenhum cliente</span>
      </div>
      <div id="ast-corpo">
        <div class="ast-sem-cliente">Selecione um cliente para ver o diagnóstico dos dados.</div>
      </div>
    `;

    docGrid.parentNode.insertBefore(painel, docGrid);
  }

  // ─── ATUALIZAR DIAGNÓSTICO ───────────────────────────────
  // Busca dados COMPLETOS do Supabase (com cache) para avaliar
  // corretamente todas as seções, incluindo sub-tabelas.
  async function atualizarDiagnostico() {
    const painel = document.getElementById('sca-assistente');
    if (!painel) return;

    const clienteBasico = _getClienteAtual();

    // Badge nome (atualiza imediatamente com dados básicos)
    const badge = document.getElementById('ast-cliente-nome');
    if (badge) {
      if (clienteBasico?.nome) {
        badge.textContent = '👤 ' + clienteBasico.nome;
        badge.className = 'ast-cliente-badge';
      } else {
        badge.textContent = 'Nenhum cliente';
        badge.className = 'ast-cliente-badge vazio';
      }
    }

    const corpo = document.getElementById('ast-corpo');
    if (!corpo) return;

    if (!clienteBasico) {
      corpo.innerHTML = `<div class="ast-sem-cliente">Selecione um cliente para ver o diagnóstico dos dados.</div>`;
      return;
    }

    // Mostra "carregando" enquanto busca do Supabase (só se não tiver cache)
    const temCache = !!(clienteBasico.id && _cacheCompleto[clienteBasico.id]);
    if (!temCache) {
      corpo.innerHTML = `<div class="ast-sem-cliente">🔄 Carregando dados do Supabase...</div>`;
    }

    // Busca dados completos com todas as sub-tabelas (JOIN)
    let cliente = clienteBasico;
    if (clienteBasico.id) {
      try {
        const completo = await _getClienteCompletoComCache(clienteBasico.id);
        if (completo) {
          // Normaliza para o mesmo formato que as funções checar() esperam
          cliente = _normalizarPayloadParaDiagnostico(completo);
        }
      } catch (e) {
        console.warn('[SCA Assistente] Falha ao buscar dados completos, usando memória:', e);
      }
    }

    // Avaliar seções com dados completos
    let preenchidas = 0;
    let obrigFaltando = [];
    let chips = '';

    SECOES.forEach(s => {
      const ok     = s.checar(cliente);
      const resumo = ok ? (s.resumir(cliente) || '') : '';

      if (ok) preenchidas++;
      else if (s.obrigatorio) obrigFaltando.push(s.label);

      let cls = 'vazio';
      let iconeStatus = '○';
      let tooltipTxt = s.dica;

      if (ok) {
        cls = 'ok';
        iconeStatus = '✓';
        tooltipTxt = resumo || 'Preenchido';
      } else if (s.obrigatorio) {
        cls = 'obrig-vazio';
        iconeStatus = '!';
      }

      const resumoHtml = (ok && resumo)
        ? `<span class="ast-chip-resumo">— ${resumo.substring(0, 30)}${resumo.length > 30 ? '…' : ''}</span>`
        : '';

      chips += `
        <span class="ast-chip ${cls}">
          ${s.icone} ${s.label} <b>${iconeStatus}</b>${resumoHtml}
          <span class="ast-chip-tooltip">${tooltipTxt}</span>
        </span>`;
    });

    const pct = Math.round((preenchidas / SECOES.length) * 100);

    // Alertas
    let alertasHtml = '';
    if (obrigFaltando.length > 0) {
      alertasHtml = `
        <div class="ast-alertas">
          <div class="ast-alerta">
            ⚠️ <span>Campos obrigatórios incompletos: <b>${obrigFaltando.join(', ')}</b>.<br>
            Os documentos serão gerados com espaços em branco nesses campos.</span>
          </div>
        </div>`;
    }

    // Badge de extras salvos
    const extras = window._scaExtras || {};
    const qtdExtras = Object.keys(extras).filter(k => extras[k]).length;
    const extrasBadge = qtdExtras > 0
      ? `<div class="ast-extras-badge">✏️ ${qtdExtras} campo${qtdExtras > 1 ? 's' : ''} extra${qtdExtras > 1 ? 's' : ''} preenchido${qtdExtras > 1 ? 's' : ''} e prontos para os documentos.</div>`
      : '';

    const temCPF = !!(clienteBasico?.cpf);
    const dis = !temCPF ? 'disabled' : '';

    corpo.innerHTML = `
      <div class="ast-prog-label">Completude do cadastro: ${pct}% (${preenchidas}/${SECOES.length} seções preenchidas)</div>
      <div class="ast-prog-bar"><div class="ast-prog-fill" style="width:${pct}%"></div></div>
      <div class="ast-diag">${chips}</div>
      ${alertasHtml}
      ${extrasBadge}
      <div class="ast-acoes">
        <button class="ast-btn ast-btn-secondary" ${dis} onclick="window.scaAssistenteVerificarDados()" id="ast-btn-verificar">
          🔄 Atualizar Dados
        </button>
        <button class="ast-btn ast-btn-info" ${dis} onclick="window.scaAssistentePreview()" id="ast-btn-preview">
          👁 Preview
        </button>
        <button class="ast-btn ast-btn-warn" onclick="window.scaAssistenteAbrirExtras()" id="ast-btn-extras">
          ✏️ Extras
        </button>
      </div>
    `;
  }

  // ─── NORMALIZAR PARA DIAGNÓSTICO ─────────────────────────
  // Converte o objeto bruto do Supabase (com sub-tabelas aninhadas)
  // para o formato que as funções checar() das SECOES esperam.
  // ─── NORMALIZAR PARA DIAGNÓSTICO ─────────────────────────
  // Usa os nomes de campos EXATOS do schema SQL para garantir
  // que checar() encontre os dados corretamente.
  function _normalizarPayloadParaDiagnostico(raw) {
    if (!raw) return null;
    const _uno = (v) => Array.isArray(v) ? (v[0] || null) : (v || null);

    // Resolve cada sub-tabela (aceita objeto ou array[0])
    const dp  = _uno(raw.dados_pessoais) || {};   // clientes_dados_pessoais
    const end = _uno(raw.endereco)       || {};   // clientes_endereco
    const ban = _uno(raw.bancarios)      || {};   // clientes_bancarios
    const pro = _uno(raw.propriedade)    || {};   // propriedades
    const oat = _uno(raw.operacao_atual) || {};   // operacao_atual

    // Celular montado com DDD real (ddd_cel1 + celular1 da tabela)
    const cel1 = end.ddd_cel1 && end.celular1
      ? `(${end.ddd_cel1}) ${end.celular1}`
      : (end.celular1 || '');

    return {
      // ── Raiz (tabela: clientes)
      cpf:  raw.cpf  || '',
      nome: raw.nome || '',
      codigo: raw.codigo || '',

      // ── Aliases diretos (para checar() e preview)
      rg:    dp.numero_di || '',         // clientes_dados_pessoais.numero_di
      email: end.email    || '',         // clientes_endereco.email

      // ── Dados Pessoais (tabela: clientes_dados_pessoais)
      // campos exatos: sexo, apelido, tipo_identidade, numero_di, data_emissao_di,
      //   orgao_emissor, uf_orgao_emissor, numero_titulo, data_nascimento, idade,
      //   uf_nascimento, naturalidade, estado_civil, regime_casamento,
      //   nome_pai, nome_mae, numero_caf, escolaridade,
      //   ja_fez_financiamento, exposto_politicamente, beneficiario_pol_publicas
      dados_pessoais: {
        ...dp,
        rg:              dp.numero_di      || '',   // alias
        data_emissao_rg: dp.data_emissao_di || '',  // alias
      },

      // ── Endereço (tabela: clientes_endereco)
      // campos exatos: logradouro, numero, bairro, uf, cidade, cep,
      //   ddd_cel1, celular1, ddd_cel2, celular2,
      //   ddd_residencial, tel_residencial, email
      endereco: {
        ...end,
        estado:       end.uf    || '',    // alias (campo real é "uf")
        celular1:     cel1,               // formatado com DDD
        ddd_celular1: end.ddd_cel1 || '',
        ddd_celular2: end.ddd_cel2 || '',
      },

      // ── Bancários (tabela: clientes_bancarios)
      // campos exatos: banco_projeto, agencia_projeto, uf_agencia, cidade_agencia,
      //   linha_credito, tipo_projeto, tipo_cliente, porte_cliente,
      //   aptidao, cultura_especie, experiencia_anos,
      //   banco_conta, agencia_conta, conta_digito, uf_conta, cidade_conta
      bancarios: {
        ...ban,
        banco: ban.banco_projeto || '',   // alias
      },

      // ── Propriedade (tabela: propriedades)
      // campos exatos: nome_propriedade, ger_municipio, ger_uf, area_total_ha,
      //   viz_norte/sul/leste/oeste, testemunha1_nome/cpf, testemunha2_nome/cpf,
      //   nirf, incra, doc_num_car, doc_num_ccir, tipo_propriedade, ...
      propriedade: {
        ...pro,
        municipio: pro.ger_municipio || pro.municipio || '',  // alias (campo real: ger_municipio)
        estado:    pro.ger_uf        || pro.estado    || '',  // alias (campo real: ger_uf)
        // Vizinhos — campo real no banco
        vizinho_norte: pro.viz_norte || '',
        vizinho_sul:   pro.viz_sul   || '',
        vizinho_leste: pro.viz_leste || '',
        vizinho_oeste: pro.viz_oeste || '',
      },

      // ── Operação Atual (tabela: operacao_atual)
      // campos exatos: banco, num_contrato, finalidade, valor_total, data_emissao,
      //   comissao_banco_pct, comissao_banco_rs, comissao_part_pct, comissao_part_rs,
      //   data_1a_parcela, data_parcela_final, carencia_meses, prazo_meses, ano_safra
      operacao_atual: { ...oat },

      // ── Participantes (tabelas: conjuges, avalistas)
      // conjuges: cpf, nome, data_nascimento, tipo_identidade, numero_di,
      //   data_emissao, orgao_emissor, uf_orgao, sexo, escolaridade, profissao,
      //   nome_pai, nome_mae, ddd_celular, celular, email
      //   + v2: naturalidade, uf_nascimento, exposto_politicamente
      // avalistas: mesmos campos + v2: logradouro, cidade, uf, cep, estado_civil,
      //   regime_casamento, nome_conjuge, cpf_conjuge, ...
      participantes: {
        conjugue: _uno(raw.conjugue) || {},
        avalista:  _uno(raw.avalista) || {},
      },
      conjugue: _uno(raw.conjugue) || null,
      avalista:  _uno(raw.avalista) || null,

      // ── Agrícola (tabelas: agr_temporaria, agr_permanente, agr_outras_culturas,
      //   agr_extrativismo, agr_agroindustria, agr_renda_fora)
      agricola: {
        temporaria:      _uno(raw.agr_temporaria)     || null,
        permanente:      _uno(raw.agr_permanente)     || null,
        outras_culturas: _uno(raw.agr_outras_culturas)|| null,
        extrativismo:    _uno(raw.agr_extrativismo)   || null,
        agroindustria:   _uno(raw.agr_agroindustria)  || null,
        renda_fora:      _uno(raw.agr_renda_fora)     || null,
      },

      // ── Pecuária (tabelas: pec_bovino, pec_leite_bovino, pec_equino,
      //   pec_caprino, pec_leite_caprino, pec_ovino, pec_suino, pec_aves, pec_outros)
      pecuaria: {
        bovino:        _uno(raw.pec_bovino)        || null,
        leite_bovino:  _uno(raw.pec_leite_bovino)  || null,
        leite_caprino: _uno(raw.pec_leite_caprino) || null,
        caprino:       _uno(raw.pec_caprino)       || null,
        equino:        _uno(raw.pec_equino)        || null,
        ovino:         _uno(raw.pec_ovino)         || null,
        suino:         _uno(raw.pec_suino)         || null,
        aves:          _uno(raw.pec_aves)          || null,
        outros:        _uno(raw.pec_outros)        || null,
      },
    };
  }

  // ─── GERAR TODOS OS DOCUMENTOS ───────────────────────────
  // ─── VERIFICAR / ATUALIZAR DADOS ─────────────────────────
  window.scaAssistenteVerificarDados = async function () {
    const cliente = _getClienteAtual();
    if (!cliente) { _astToast('Nenhum cliente selecionado.', 'warn'); return; }

    // Limpa cache para forçar nova busca no Supabase
    if (cliente.id) _limparCacheCliente(cliente.id);

    _astToast('🔄 Buscando dados atualizados do Supabase...', 'info');

    try {
      // Tenta atualizar via função do sistema principal
      if (typeof window.carregarDadosClienteSupabase === 'function' && cliente.id) {
        await window.carregarDadosClienteSupabase(cliente.id);
        await atualizarDiagnostico();
        _astToast('✅ Dados sincronizados com o Supabase!', 'ok');
        return;
      }

      // Fallback: busca direta (cache já foi limpo acima)
      const dados = await _getClienteCompletoComCache(cliente.id);
      if (dados) {
        // Tenta mesclar no array de clientes em memória
        const idx = _getClienteIdx();
        if (idx >= 0 && window.clientes) {
          window.clientes[idx] = { ...window.clientes[idx], ...dados };
        }
        await atualizarDiagnostico();
        _astToast('✅ Dados atualizados!', 'ok');
      } else {
        _astToast('⚠️ Não foi possível buscar dados do Supabase.', 'warn');
      }
    } catch (e) {
      console.error('[SCA Assistente] Erro ao verificar dados:', e);
      _astToast('Erro ao buscar dados. Veja o console.', 'err');
    }
  };

  // ─── PREVIEW DE DADOS CADASTRAIS ─────────────────────────
  window.scaAssistentePreview = async function () {
    const cliente = _getClienteAtual();
    if (!cliente) { _astToast('Nenhum cliente selecionado.', 'warn'); return; }

    // Busca fresco para garantir dados completos
    _astToast('🔍 Carregando preview...', 'info');
    let dadosCompletos = null;

    try {
      dadosCompletos = await _buscarClienteCompleto(cliente.id);
    } catch {}

    if (!dadosCompletos) dadosCompletos = cliente;

    const extras  = window._scaExtras || {};
    const payload = _normalizarPayload(dadosCompletos, extras);

    // Monta itens do preview — campos com nomes EXATOS do schema SQL
    const _dp  = payload?.dados_pessoais || {};
    const _end = payload?.endereco       || {};
    const _ban = payload?.bancarios      || {};
    const _pro = payload?.propriedade    || {};
    const _oat = payload?.operacao_atual || {};
    const itens = [
      // Tabela clientes
      { label: 'Nome',           val: payload?.nome },
      { label: 'CPF',            val: _fmtCPF(payload?.cpf) },
      // clientes_dados_pessoais.numero_di
      { label: 'RG / Nº DI',    val: _dp.numero_di },
      { label: 'Tipo Ident.',    val: _dp.tipo_identidade },
      { label: 'Órgão Emissor',  val: _dp.orgao_emissor ? `${_dp.orgao_emissor}/${_dp.uf_orgao_emissor || ''}` : null },
      // clientes_dados_pessoais.data_nascimento
      { label: 'Nascimento',     val: _dp.data_nascimento },
      { label: 'Estado Civil',   val: _dp.estado_civil },
      { label: 'Naturalidade',   val: _dp.naturalidade },
      { label: 'UF Nascimento',  val: _dp.uf_nascimento },
      { label: 'Sexo',           val: _dp.sexo },
      { label: 'Escolaridade',   val: _dp.escolaridade },
      { label: 'Nome do Pai',    val: _dp.nome_pai },
      { label: 'Nome da Mãe',    val: _dp.nome_mae },
      { label: 'Nº CAF',         val: _dp.numero_caf },
      // clientes_endereco
      { label: 'Cidade',         val: _end.cidade },
      { label: 'UF',             val: _end.uf },
      { label: 'Logradouro',     val: _end.logradouro },
      { label: 'Celular',        val: _end.celular1   // já formatado com DDD no normalize
          || (_end.ddd_cel1 ? `(${_end.ddd_cel1}) ${_end.celular1 || ''}` : null) },
      { label: 'E-mail',         val: _end.email },
      // clientes_bancarios
      { label: 'Banco Projeto',  val: _ban.banco_projeto },
      { label: 'Linha Crédito',  val: _ban.linha_credito },
      { label: 'Tipo Projeto',   val: _ban.tipo_projeto },
      // propriedades
      { label: 'Propriedade',    val: _pro.nome_propriedade },
      { label: 'Área Total (ha)',val: _pro.area_total_ha },
      { label: 'Município',      val: _pro.ger_municipio || _pro.municipio },
      { label: 'UF Propriedade', val: _pro.ger_uf        || _pro.estado },
      // operacao_atual
      { label: 'Banco Contrato', val: _oat.banco,       optional: true },
      { label: 'Nº Contrato',    val: _oat.num_contrato, optional: true },
      // participantes
      { label: 'Cônjuge',        val: payload?.participantes?.conjugue?.nome, optional: true },
      { label: 'Avalista',       val: payload?.participantes?.avalista?.nome, optional: true },
    ];

    // Extras preenchidos
    const extrasPreenchidos = Object.entries(extras).filter(([, v]) => v);

    const gridHtml = itens.map(i => {
      const cls = i.val ? 'ok' : (i.optional ? 'opt' : 'empty');
      const valTxt = i.val || (i.optional ? '— opcional' : '⚠ não preenchido');
      return `
        <div class="sca-preview-item ${cls}">
          <div class="pi-label">${i.label}</div>
          <div class="pi-valor">${valTxt}</div>
        </div>`;
    }).join('');

    const extrasHtml = extrasPreenchidos.length > 0
      ? `<div class="sca-extras-grupo">✏️ Campos Extras</div>
         <div class="sca-preview-grid">
           ${extrasPreenchidos.map(([k, v]) => `
             <div class="sca-preview-item ok">
               <div class="pi-label">${k}</div>
               <div class="pi-valor">${v}</div>
             </div>`).join('')}
         </div>`
      : '';

    const modal = document.createElement('div');
    modal.className = 'sca-modal-overlay';
    modal.id = 'sca-modal-preview';
    modal.innerHTML = `
      <div class="sca-modal-box">
        <h3>👁 Preview — Dados que serão enviados ao documento</h3>
        <p class="sca-modal-sub">Cliente: <b>${payload?.nome || '—'}</b> · CPF: ${_fmtCPF(payload?.cpf)}</p>
        <div class="sca-preview-grid">${gridHtml}</div>
        ${extrasHtml}
        <div class="sca-modal-acoes">
          <button class="ast-btn ast-btn-info" onclick="window.scaAssistenteAbrirExtras(); document.getElementById('sca-modal-preview')?.remove()">✏️ Editar Extras</button>
          <button class="ast-btn ast-btn-secondary" onclick="this.closest('.sca-modal-overlay').remove()">Fechar</button>
        </div>
      </div>
    `;

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  };

  // ─── CAMPOS EXTRAS ───────────────────────────────────────
  window.scaAssistenteAbrirExtras = function () {
    if (document.getElementById('sca-modal-extras')) return;

    const extras = window._scaExtras || {};

    const grupos = [
      { label: '🏡 Vizinhos da Propriedade', ids: ['z_vizinho_leste', 'z_vizinho_leste_cpf', 'z_vizinho_norte', 'z_vizinho_norte_cpf', 'z_vizinho_sul', 'z_vizinho_sul_cpf', 'z_vizinho_oeste', 'z_vizinho_oeste_cpf'] },
      { label: '✍️ Testemunhas',              ids: ['z_testemunha_1_nome', 'z_testemunha_1_cpf', 'z_testemunha_2_nome', 'z_testemunha_2_cpf'] },
      { label: '💰 Comissões e ATER',         ids: ['e_comissao_ater_extenso', 'e_comissao_percentual_extenso', 'e_particular_ater_extenso', 'e_particular_percentual_extenso'] },
      { label: '📅 Assinatura',               ids: ['z_data_assinatura', 'z_local_assinatura'] },
    ];

    const camposPorId = Object.fromEntries(EXTRAS_CAMPOS.map(c => [c.id, c]));

    const gruposHtml = grupos.map(g => {
      const campos = g.ids.map(id => {
        const c = camposPorId[id];
        if (!c) return '';
        return `
          <div class="sca-campo">
            <label>${c.label}</label>
            <input type="text" id="ext-${c.id}" value="${extras[c.id] || ''}" placeholder="${c.placeholder}">
          </div>`;
      }).join('');
      return `<div class="sca-extras-grupo">${g.label}</div>${campos}`;
    }).join('');

    const modal = document.createElement('div');
    modal.className = 'sca-modal-overlay';
    modal.id = 'sca-modal-extras';
    modal.innerHTML = `
      <div class="sca-modal-box">
        <h3>✏️ Campos Extras para Documentos</h3>
        <p class="sca-modal-sub">Campos especiais não presentes no cadastro principal. Incluídos em todos os documentos gerados e salvos enquanto a sessão estiver aberta.</p>
        ${gruposHtml}
        <div class="sca-modal-acoes">
          <button class="ast-btn ast-btn-secondary" onclick="this.closest('.sca-modal-overlay').remove()">Cancelar</button>
          <button class="ast-btn ast-btn-primary" onclick="window.scaAssistenteSalvarExtras()">💾 Salvar e Fechar</button>
        </div>
      </div>
    `;

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  };

  window.scaAssistenteSalvarExtras = function () {
    const extras = {};
    EXTRAS_CAMPOS.forEach(c => {
      const el = document.getElementById('ext-' + c.id);
      if (el && el.value.trim()) extras[c.id] = el.value.trim();
    });

    window._scaExtras = extras;
    _salvarExtrasStorage(extras);

    const modal = document.getElementById('sca-modal-extras');
    if (modal) modal.remove();

    atualizarDiagnostico();
    _astToast('✅ Campos extras salvos! Serão incluídos nos próximos documentos.', 'ok');
  };

  // ─── EXPOR GERADOR PÚBLICO (compatível com gerarDocHTML) ──
  // A função abaixo pode ser chamada pelos botões do #doc-grid
  // como alternativa ao gerarDocHTML original, garantindo o
  // payload completo e normalizado.
  window.scaGerarDocumento = async function (template, btnEl) {
    const cliente = _getClienteAtual();
    if (!cliente?.cpf) {
      _astToast('Nenhum cliente selecionado.', 'warn');
      return;
    }

    // Feedback visual no botão
    const textoOriginal = btnEl?.innerHTML;
    if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<span class="ast-spin"></span> Gerando...'; }

    try {
      _astToast(`🔄 Gerando: ${template}...`, 'info');
      await _gerarDocumento(cliente.cpf, template, cliente.id);
      _astToast(`✅ Documento "${template}" gerado com sucesso!`, 'ok');
    } catch (e) {
      console.error(`[SCA] ❌ Erro ao gerar "${template}":`, e);
      _astToast(`❌ Erro ao gerar "${template}": ${e.message}`, 'err');
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = textoOriginal; }
    }
  };

  // ─── TOAST ───────────────────────────────────────────────
  function _astToast(msg, tipo) {
    if (typeof window.toast === 'function') { window.toast(msg, tipo); return; }

    const prev = document.getElementById('_ast_toast');
    if (prev) prev.remove();

    const cores = { ok: '#1a5c38', err: '#dc2626', warn: '#d97706', info: '#1e3a8a' };

    const el = document.createElement('div');
    el.id = '_ast_toast';
    el.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:9999',
      `background:${cores[tipo] || cores.info}`, 'color:#fff',
      'border-radius:10px', 'padding:12px 20px',
      'font-family:Nunito,sans-serif', 'font-size:.88rem', 'font-weight:700',
      'box-shadow:0 8px 28px rgba(0,0,0,.25)', 'max-width:380px',
      'pointer-events:none', 'transition:opacity .3s',
    ].join(';');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; }, 3000);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 3400);
  }

  // ─── PATCH exibirCliente ──────────────────────────────────
  function patchExibirCliente() {
    const original = window.exibirCliente;
    window.exibirCliente = function (...args) {
      // Limpa cache do cliente atual para garantir dados frescos
      const clienteAtual = _getClienteAtual();
      if (clienteAtual?.id) _limparCacheCliente(clienteAtual.id);

      if (typeof original === 'function') original.apply(this, args);
      setTimeout(atualizarDiagnostico, 350);
    };
  }

  // ─── CACHE DE DADOS COMPLETOS POR clienteId ─────────────
  // Evita múltiplas chamadas ao Supabase para o mesmo cliente.
  const _cacheCompleto = {};   // { [clienteId]: dadosCompletos }
  let   _carregandoId  = null; // id sendo buscado no momento

  async function _getClienteCompletoComCache(clienteId) {
    if (!clienteId) return null;

    // Já está em cache → retorna imediatamente
    if (_cacheCompleto[clienteId]) return _cacheCompleto[clienteId];

    // Já está sendo buscado → aguarda até ficar disponível (poll)
    if (_carregandoId === clienteId) {
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 150));
        if (_cacheCompleto[clienteId]) return _cacheCompleto[clienteId];
      }
      return null;
    }

    // Busca no Supabase
    _carregandoId = clienteId;
    try {
      const dados = await _buscarClienteCompleto(clienteId);
      if (dados) _cacheCompleto[clienteId] = dados;
      return dados;
    } finally {
      _carregandoId = null;
    }
  }

  // Limpa cache quando o cliente muda (força nova busca)
  function _limparCacheCliente(clienteId) {
    if (clienteId) delete _cacheCompleto[clienteId];
  }

  // ─── POLLING clIdx ───────────────────────────────────────
  let _lastIdx = -99;
  function watchClienteIdx() {
    setInterval(() => {
      const idx = _getClienteIdx();
      if (idx !== _lastIdx) {
        // Limpa cache do cliente anterior para forçar re-busca
        const clienteAnterior = (window.clientes && _lastIdx >= 0) ? window.clientes[_lastIdx] : null;
        if (clienteAnterior?.id) _limparCacheCliente(clienteAnterior.id);

        _lastIdx = idx;
        setTimeout(atualizarDiagnostico, 400);
      }
    }, 600);
  }

  // ─── INIT ─────────────────────────────────────────────────
  function init() {
    injetarEstilos();
    criarPainel();
    patchExibirCliente();
    watchClienteIdx();
    atualizarDiagnostico();
    console.log(`[SCA Assistente] ✅ v${VERSION} inicializado.`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }

})();
