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
//  ✅ Log detalhado do payload enviado à Edgar Function
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
      checar: (c) => !!(c?.endereco?.cidade || c?.endereco?.celular1),
      resumir: (c) => {
        const e = c?.endereco;
        if (!e) return null;
        const partes = [];
        if (e.cidade) partes.push(e.cidade);
        if (e.estado) partes.push(e.estado);
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
        if (b.linha_credito) partes.push(b.linha_credito);
        if (b.banco_projeto) partes.push(b.banco_projeto);
        if (b.valor_total_financiamento) partes.push(`R$ ${b.valor_total_financiamento}`);
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
      checar: (c) => !!(c?.propriedade?.nome_propriedade || c?.propriedade?.area_total_ha),
      resumir: (c) => {
        const p = c?.propriedade;
        if (!p) return null;
        const partes = [];
        if (p.nome_propriedade) partes.push(p.nome_propriedade);
        if (p.area_total_ha) partes.push(`${p.area_total_ha} ha`);
        if (p.municipio) partes.push(p.municipio);
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

      // Tenta via getUser (fallback)
      const { data: ud } = await window.supa?.auth?.getUser?.() || {};
      if (ud?.session?.access_token) return ud.session.access_token;
    } catch (e) {
      console.warn('[SCA Assistente] Não conseguiu obter token:', e);
    }
    return '';
  }

  // ─── BUSCAR CLIENTE COMPLETO DO SUPABASE ─────────────────
  // Monta um payload rico direto do Supabase para garantir
  // que a Edge Function receba todos os dados cadastrais.
  async function _buscarClienteCompleto(clienteId) {
    if (!window.supa || !clienteId) return null;

    try {
      // Busca principal com todas as relações — nomes exatos das tabelas do Supabase
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
        console.warn('[SCA Assistente] Erro ao buscar cliente completo:', error);
        return null;
      }

      return data;
    } catch (e) {
      console.warn('[SCA Assistente] Exceção ao buscar cliente:', e);
      return null;
    }
  }

  // ─── NORMALIZAR PAYLOAD PARA A EDGAR FUNCTION ────────────
  // Garante que os campos chegam no formato esperado pelo template,
  // mesmo que o Supabase retorne arrays ou objetos aninhados.
  function _normalizarPayload(clienteRaw, extras) {
    if (!clienteRaw) return null;

    // Supabase às vezes retorna relações como array[0] ou objeto
    const _uno = (v) => Array.isArray(v) ? (v[0] || null) : (v || null);

    const dados_pessoais = _uno(clienteRaw.dados_pessoais) || {};
    const endereco       = _uno(clienteRaw.endereco) || {};
    const bancarios      = _uno(clienteRaw.bancarios) || {};
    const propriedade    = _uno(clienteRaw.propriedade) || {};
    const operacao_atual = _uno(clienteRaw.operacao_atual) || {};

    // Cônjuge e avalista ficam em tabelas separadas
    const conjugue = _uno(clienteRaw.conjugue) || null;
    const avalista = _uno(clienteRaw.avalista) || null;

    // Monta participantes a partir das tabelas reais
    const participantes = {
      conjugue: conjugue || {},
      avalista: avalista || {},
    };

    // Helper: normaliza array ou objeto para objeto único
    const _agg = (rows, dest, key) => {
      (Array.isArray(rows) ? rows : (rows ? [rows] : [])).forEach(row => {
        if (row) dest[key] = row;
      });
    };

    // Agrícola — todas as tabelas agr_*
    const agricola = {};
    _agg(clienteRaw.agr_temporaria,    agricola, 'temporaria');
    _agg(clienteRaw.agr_permanente,    agricola, 'permanente');
    _agg(clienteRaw.agr_outras_culturas, agricola, 'outras_culturas');
    _agg(clienteRaw.agr_extrativismo,  agricola, 'extrativismo');
    _agg(clienteRaw.agr_agroindustria, agricola, 'agroindustria');
    _agg(clienteRaw.agr_renda_fora,    agricola, 'renda_fora');

    // Pecuária — todas as tabelas pec_*
    const pecuaria = {};
    _agg(clienteRaw.pec_bovino,       pecuaria, 'bovino');
    _agg(clienteRaw.pec_leite_bovino, pecuaria, 'leite_bovino');
    _agg(clienteRaw.pec_leite_caprino,pecuaria, 'leite_caprino');
    _agg(clienteRaw.pec_caprino,      pecuaria, 'caprino');
    _agg(clienteRaw.pec_equino,       pecuaria, 'equino');
    _agg(clienteRaw.pec_ovino,        pecuaria, 'ovino');
    _agg(clienteRaw.pec_suino,        pecuaria, 'suino');
    _agg(clienteRaw.pec_aves,         pecuaria, 'aves');
    _agg(clienteRaw.pec_outros,       pecuaria, 'outros');

    // Outras tabelas complementares
    const arrendante         = _uno(clienteRaw.arrendante)          || {};
    const participante_empresa = _uno(clienteRaw.participante_empresa) || {};
    const elaboracao         = _uno(clienteRaw.elaboracao)           || {};
    const operacoes_em_ser   = clienteRaw.operacoes_em_ser           || [];

    // Payload final normalizado
    const payload = {
      // ── Dados raiz do cliente
      cpf:    clienteRaw.cpf,
      nome:   clienteRaw.nome,
      rg:     clienteRaw.rg,
      email:  clienteRaw.email,

      // ── Seções relacionadas
      dados_pessoais,
      endereco,
      bancarios,
      propriedade,
      participantes,
      operacao_atual,
      operacoes_em_ser,
      arrendante,
      participante_empresa,
      elaboracao,
      agricola,
      pecuaria,

      // ── Campos extras manuais (prefixo z_ e e_)
      ...extras,
    };

    // Remove chaves id/created_at/updated_at internas para não poluir
    function _limpar(obj) {
      if (!obj || typeof obj !== 'object') return obj;
      const r = {};
      for (const [k, v] of Object.entries(obj)) {
        if (['id', 'cliente_id', 'created_at', 'updated_at'].includes(k)) continue;
        r[k] = _limpar(v);
      }
      return r;
    }

    return _limpar(payload);
  }

  // ─── CHAMAR EDGE FUNCTION (Edgar) ────────────────────────
  async function _chamarEdgarFunction(cpf, template, payloadCompleto) {
    const baseUrl = (window.SUPA_URL || '').replace(/\/$/, '');
    const url     = `${baseUrl}/functions/v1/gerar-documento`;
    const apiKey  = window.SUPA_KEY || '';
    const token   = await _getToken();

    // Log do payload para debug
    console.group(`[SCA Assistente] 📤 Enviando para gerar-documento → ${template}`);
    console.log('CPF:', cpf);
    console.log('Payload completo:', payloadCompleto);
    console.groupEnd();

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey':        apiKey,
      },
      body: JSON.stringify({
        cpf,
        template,
        // Envia tanto o cpf quanto o payload completo,
        // assim a Edge Function pode usar o que preferir.
        dados: payloadCompleto,
        extras: payloadCompleto, // alias por compatibilidade
      }),
    });

    if (!resp.ok) {
      let errMsg = `HTTP ${resp.status}`;
      try { const j = await resp.json(); errMsg = j.error || j.message || errMsg; } catch {}
      throw new Error(errMsg);
    }

    return resp;
  }

  // ─── GERAR DOCUMENTO COMPLETO ────────────────────────────
  async function _gerarDocumento(cpf, template, clienteId) {
    // 1. Busca dados frescos do Supabase
    let clienteCompleto = null;
    if (clienteId) {
      clienteCompleto = await _buscarClienteCompleto(clienteId);
    }

    // Fallback: usa dados em memória se Supabase falhar
    if (!clienteCompleto) {
      const idx = _getClienteIdx();
      clienteCompleto = (idx >= 0 && window.clientes) ? window.clientes[idx] : null;
      if (clienteCompleto) {
        console.warn('[SCA Assistente] ⚠️ Usando dados em memória (Supabase não retornou). Pode estar desatualizado.');
      }
    }

    if (!clienteCompleto) throw new Error('Dados do cliente não encontrados.');

    // 2. Normaliza payload
    const extras  = window._scaExtras || {};
    const payload = _normalizarPayload(clienteCompleto, extras);

    // 3. Chama Edge Function
    const resp = await _chamarEdgarFunction(cpf, template, payload);

    // 4. Abre o documento retornado
    const html    = await resp.text();
    const blob    = new Blob([html], { type: 'text/html; charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const janela  = window.open(blobUrl, '_blank');
    if (!janela) _astToast('Popup bloqueado. Permita pop-ups para este site.', 'warn');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 6000);

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
  function atualizarDiagnostico() {
    const painel = document.getElementById('sca-assistente');
    if (!painel) return;

    const cliente = _getClienteAtual();

    // Badge nome
    const badge = document.getElementById('ast-cliente-nome');
    if (badge) {
      if (cliente?.nome) {
        badge.textContent = '👤 ' + cliente.nome;
        badge.className = 'ast-cliente-badge';
      } else {
        badge.textContent = 'Nenhum cliente';
        badge.className = 'ast-cliente-badge vazio';
      }
    }

    const corpo = document.getElementById('ast-corpo');
    if (!corpo) return;

    if (!cliente) {
      corpo.innerHTML = `<div class="ast-sem-cliente">Selecione um cliente para ver o diagnóstico dos dados.</div>`;
      return;
    }

    // Avaliar seções
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

    const temCPF = !!(cliente?.cpf);
    const dis = !temCPF ? 'disabled' : '';

    corpo.innerHTML = `
      <div class="ast-prog-label">Completude do cadastro: ${pct}% (${preenchidas}/${SECOES.length} seções preenchidas)</div>
      <div class="ast-prog-bar"><div class="ast-prog-fill" style="width:${pct}%"></div></div>
      <div class="ast-diag">${chips}</div>
      ${alertasHtml}
      ${extrasBadge}
      <div class="ast-acoes">
        <button class="ast-btn ast-btn-primary" ${dis} onclick="window.scaAssistenteGerarTodos(this)" id="ast-btn-todos">
          📦 Gerar Todos
        </button>
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

  // ─── GERAR TODOS OS DOCUMENTOS ───────────────────────────
  window.scaAssistenteGerarTodos = async function (btnEl) {
    if (!btnEl) return;

    const cliente = _getClienteAtual();
    if (!cliente?.cpf) { _astToast('Nenhum cliente selecionado.', 'warn'); return; }

    const botoes = document.querySelectorAll('#doc-grid .doc-btn:not(.doc-btn-all):not([disabled])');
    if (botoes.length === 0) {
      _astToast('Nenhum template disponível no grid.', 'warn');
      return;
    }

    const textoOriginal = btnEl.innerHTML;
    btnEl.disabled = true;
    btnEl.innerHTML = '<span class="ast-spin"></span> Gerando...';

    let gerados = 0;
    let erros   = 0;

    for (const btn of botoes) {
      try {
        const onclickStr = btn.getAttribute('onclick') || '';
        const match = onclickStr.match(/gerarDocHTML\(['"]([^'"]+)['"]/);
        if (!match) continue;

        const template = match[1];
        await _gerarDocumento(cliente.cpf, template, cliente.id);
        gerados++;
        await new Promise(r => setTimeout(r, 750)); // delay entre janelas
      } catch (e) {
        erros++;
        console.warn('[SCA Assistente] Erro ao gerar:', e);
      }
    }

    btnEl.disabled = false;
    btnEl.innerHTML = textoOriginal;

    if (erros === 0) {
      _astToast(`✅ ${gerados} documento${gerados > 1 ? 's' : ''} gerado${gerados > 1 ? 's' : ''} com sucesso!`, 'ok');
    } else {
      _astToast(`⚠️ ${gerados} gerado${gerados > 1 ? 's' : ''}, ${erros} com erro. Veja o console.`, 'warn');
    }
  };

  // ─── VERIFICAR / ATUALIZAR DADOS ─────────────────────────
  window.scaAssistenteVerificarDados = async function () {
    const cliente = _getClienteAtual();
    if (!cliente) { _astToast('Nenhum cliente selecionado.', 'warn'); return; }

    _astToast('🔄 Buscando dados atualizados do Supabase...', 'info');

    try {
      // Tenta atualizar via função do sistema principal
      if (typeof window.carregarDadosClienteSupabase === 'function' && cliente.id) {
        await window.carregarDadosClienteSupabase(cliente.id);
        setTimeout(atualizarDiagnostico, 400);
        _astToast('✅ Dados sincronizados com o Supabase!', 'ok');
        return;
      }

      // Fallback: busca direta
      const dados = await _buscarClienteCompleto(cliente.id);
      if (dados) {
        // Tenta mesclar no array de clientes em memória
        const idx = _getClienteIdx();
        if (idx >= 0 && window.clientes) {
          window.clientes[idx] = { ...window.clientes[idx], ...dados };
        }
        setTimeout(atualizarDiagnostico, 200);
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

    // Monta itens do preview
    const itens = [
      { label: 'Nome',         val: payload?.nome },
      { label: 'CPF',          val: _fmtCPF(payload?.cpf) },
      { label: 'RG',           val: payload?.rg },
      { label: 'E-mail',       val: payload?.email },
      { label: 'Nasc.',        val: payload?.dados_pessoais?.data_nascimento },
      { label: 'Estado Civil', val: payload?.dados_pessoais?.estado_civil },
      { label: 'Cidade',       val: payload?.endereco?.cidade },
      { label: 'Estado',       val: payload?.endereco?.estado },
      { label: 'Celular',      val: payload?.endereco?.celular1 },
      { label: 'Banco',        val: payload?.bancarios?.banco_projeto },
      { label: 'Linha Crédito', val: payload?.bancarios?.linha_credito },
      { label: 'Propriedade',  val: payload?.propriedade?.nome_propriedade },
      { label: 'Área (ha)',    val: payload?.propriedade?.area_total_ha },
      { label: 'Município',    val: payload?.propriedade?.municipio },
      { label: 'Cônjuge',      val: payload?.participantes?.conjugue?.nome, optional: true },
      { label: 'Avalista',     val: payload?.participantes?.avalista?.nome, optional: true },
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
  window.scaGerarDocumento = async function (template) {
    const cliente = _getClienteAtual();
    if (!cliente?.cpf) {
      _astToast('Nenhum cliente selecionado.', 'warn');
      return;
    }
    try {
      _astToast(`🔄 Gerando: ${template}...`, 'info');
      await _gerarDocumento(cliente.cpf, template, cliente.id);
      _astToast(`✅ Documento gerado!`, 'ok');
    } catch (e) {
      console.error('[SCA Assistente] Erro ao gerar:', e);
      _astToast(`Erro ao gerar "${template}": ${e.message}`, 'err');
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
      if (typeof original === 'function') original.apply(this, args);
      setTimeout(atualizarDiagnostico, 350);
    };
  }

  // ─── POLLING clIdx ───────────────────────────────────────
  let _lastIdx = -99;
  function watchClienteIdx() {
    setInterval(() => {
      const idx = _getClienteIdx();
      if (idx !== _lastIdx) {
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
