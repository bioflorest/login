// ============================================================
//  SCA – Módulo de Máscaras e Validação v1.0
//  Arquivo: sca_masks.js
//  Carregue APÓS o index.html e APÓS o sca_supabase.js
//
//  O que faz:
//  ✅ Máscara automática de CPF (000.000.000-00)
//  ✅ Máscara automática de CNPJ (00.000.000/0000-00)
//  ✅ Campo saf-viv-cnpj-cpf: detecta automaticamente CPF ou CNPJ
//  ✅ Validação do dígito verificador (CPF e CNPJ)
//  ✅ Feedback visual inline (borda verde/vermelha + mensagem)
//  ✅ Validação nas funções de salvar do sca_supabase.js
//  ✅ Não altera nenhuma linha do index.html nem do sca_supabase.js
// ============================================================

(function () {
'use strict';

// ─── 1. ALGORITMOS DE VALIDAÇÃO ──────────────────────────────

function validarCPF(cpf) {
  const s = cpf.replace(/\D/g, '');
  if (s.length !== 11) return false;
  // Rejeita sequências repetidas (ex: 111.111.111-11)
  if (/^(\d)\1{10}$/.test(s)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(s[i]) * (10 - i);
  let r = (soma * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(s[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(s[i]) * (11 - i);
  r = (soma * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(s[10]);
}

function validarCNPJ(cnpj) {
  const s = cnpj.replace(/\D/g, '');
  if (s.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(s)) return false;
  const calc = (str, pesos) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) soma += parseInt(str[i]) * pesos[i];
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(s, [5,4,3,2,9,8,7,6,5,4,3,2]);
  if (d1 !== parseInt(s[12])) return false;
  const d2 = calc(s, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return d2 === parseInt(s[13]);
}

// ─── 2. FUNÇÕES DE MÁSCARA ───────────────────────────────────

function aplicarMascaraCPF(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 11);
  if (v.length > 9)       v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  else if (v.length > 6)  v = v.replace(/(\d{3})(\d{3})(\d{1,3})/,        '$1.$2.$3');
  else if (v.length > 3)  v = v.replace(/(\d{3})(\d{1,3})/,               '$1.$2');
  input.value = v;
}

function aplicarMascaraCNPJ(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 14);
  if (v.length > 12)      v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
  else if (v.length > 8)  v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/,        '$1.$2.$3/$4');
  else if (v.length > 5)  v = v.replace(/(\d{2})(\d{3})(\d{1,3})/,               '$1.$2.$3');
  else if (v.length > 2)  v = v.replace(/(\d{2})(\d{1,3})/,                      '$1.$2');
  input.value = v;
}

// Campo especial: CPF ou CNPJ (saf-viv-cnpj-cpf)
function aplicarMascaraCPFouCNPJ(input) {
  const digits = input.value.replace(/\D/g, '');
  if (digits.length <= 11) {
    // Trata como CPF enquanto não ultrapassa 11 dígitos
    aplicarMascaraCPF(input);
  } else {
    // Trata como CNPJ
    input.value = digits; // reseta para reaplicar
    aplicarMascaraCNPJ(input);
  }
}

// ─── 3. FEEDBACK VISUAL ──────────────────────────────────────

function mostrarFeedback(input, ok, msg) {
  // Remove feedback anterior
  const prev = input.parentElement.querySelector('._sca_val_msg');
  if (prev) prev.remove();
  input.style.borderColor = '';

  if (!msg) return; // sem mensagem = só limpa

  input.style.borderColor = ok ? '#27ae60' : '#ef4444';
  input.style.borderWidth = '2px';

  const el = document.createElement('span');
  el.className = '_sca_val_msg';
  el.style.cssText = [
    'display:block', 'font-size:.72rem', 'font-weight:700',
    'margin-top:3px', 'padding-left:4px',
    ok ? 'color:#27ae60' : 'color:#ef4444',
  ].join(';');
  el.textContent = msg;
  input.parentElement.appendChild(el);

  if (ok) {
    // Limpa o indicador de sucesso após 3s
    setTimeout(() => {
      input.style.borderColor = '';
      input.style.borderWidth = '';
      el.remove();
    }, 3000);
  }
}

function validarEMostrar(input, tipo) {
  const val = input.value.trim();
  const digits = val.replace(/\D/g, '');

  if (digits.length === 0) {
    mostrarFeedback(input, true, ''); // campo vazio: sem feedback
    return true;
  }

  if (tipo === 'cpf') {
    if (digits.length < 11) return true; // ainda digitando, sem validar
    const ok = validarCPF(digits);
    mostrarFeedback(input, ok, ok ? '✓ CPF válido' : '✗ CPF inválido');
    return ok;
  }

  if (tipo === 'cnpj') {
    if (digits.length < 14) return true; // ainda digitando
    const ok = validarCNPJ(digits);
    mostrarFeedback(input, ok, ok ? '✓ CNPJ válido' : '✗ CNPJ inválido');
    return ok;
  }

  if (tipo === 'cpf_cnpj') {
    if (digits.length === 11) {
      const ok = validarCPF(digits);
      mostrarFeedback(input, ok, ok ? '✓ CPF válido' : '✗ CPF inválido');
      return ok;
    }
    if (digits.length === 14) {
      const ok = validarCNPJ(digits);
      mostrarFeedback(input, ok, ok ? '✓ CNPJ válido' : '✗ CNPJ inválido');
      return ok;
    }
    return true; // tamanho intermediário, ainda digitando
  }

  return true;
}

// ─── 4. SOBRESCREVE mascararCPF (já usada no index.html) ─────
// A função original só aplicava máscara. Esta versão adiciona
// validação ao término da digitação, sem quebrar nada.

window.mascararCPF = function(input) {
  aplicarMascaraCPF(input);
  validarEMostrar(input, 'cpf');
};

// ─── 5. APLICA MÁSCARA E VALIDAÇÃO EM TODOS OS CAMPOS ────────

const CAMPOS_CPF = [
  'cl-cpf',            // cliente principal
  'conj-cpf',          // cônjuge
  'aval-cpf',          // avalista
  'arr-cpf',           // arrendante
  'mem-cpf',           // membro da equipe
  'saf-fm-cpf',        // SAF - financiado
  'prop-prop-cpf',     // proprietário da propriedade
  'prop-viz-cpf-norte','prop-viz-cpf-sul',
  'prop-viz-cpf-leste','prop-viz-cpf-oeste',
  'prop-viz-cpf1','prop-viz-cpf2','prop-viz-cpf3',
  'prop-rel-detentor-cpf',
];

const CAMPOS_CNPJ = [
  'emp-cnpj',       // empresa participante
  'empresa-cnpj',   // empresa consultora
];

const CAMPOS_CPF_CNPJ = [
  'saf-viv-cnpj-cpf', // viveirista (CPF ou CNPJ)
];

function configurarCampo(id, tipo) {
  // Aguarda o DOM estar pronto e tenta encontrar o campo
  const tentarVezes = (tentativas) => {
    const input = document.getElementById(id);
    if (input) {
      // Remove oninput anterior para não duplicar
      const novoInput = input.cloneNode(true);
      input.parentNode.replaceChild(novoInput, input);
      const el = document.getElementById(id);

      if (tipo === 'cpf') {
        el.setAttribute('placeholder', '000.000.000-00');
        el.setAttribute('maxlength', '14');
        el.addEventListener('input', function() {
          aplicarMascaraCPF(this);
          validarEMostrar(this, 'cpf');
        });
      } else if (tipo === 'cnpj') {
        el.setAttribute('placeholder', '00.000.000/0000-00');
        el.setAttribute('maxlength', '18');
        el.addEventListener('input', function() {
          aplicarMascaraCNPJ(this);
          validarEMostrar(this, 'cnpj');
        });
      } else if (tipo === 'cpf_cnpj') {
        el.setAttribute('placeholder', 'CPF ou CNPJ');
        el.setAttribute('maxlength', '18');
        el.addEventListener('input', function() {
          aplicarMascaraCPFouCNPJ(this);
          validarEMostrar(this, 'cpf_cnpj');
        });
      }

      // Valida ao sair do campo (blur)
      el.addEventListener('blur', function() {
        validarEMostrar(this, tipo === 'cpf_cnpj' ? 'cpf_cnpj' : tipo);
      });

    } else if (tentativas > 0) {
      // Campo pode estar em aba/seção ainda não renderizada; tenta de novo
      setTimeout(() => tentarVezes(tentativas - 1), 500);
    }
  };
  tentarVezes(10);
}

// ─── 6. INTERCEPTA AS FUNÇÕES DE SALVAR DO sca_supabase.js ───
// Adiciona validação antes de cada upsert com CPF/CNPJ crítico

function interceptarSalvar(nomeFuncao, campoCPF, labelErro) {
  const original = window[nomeFuncao];
  if (typeof original !== 'function') return;

  window[nomeFuncao] = async function(...args) {
    const input = document.getElementById(campoCPF);
    if (input) {
      const digits = input.value.replace(/\D/g, '');
      if (digits.length > 0 && digits.length < 11) {
        if (typeof window._scaToast === 'function') {
          window._scaToast(`${labelErro}: CPF incompleto (${digits.length}/11 dígitos).`, 'warn');
        } else {
          alert(`${labelErro}: CPF incompleto.`);
        }
        input.focus();
        return;
      }
      if (digits.length === 11 && !validarCPF(digits)) {
        mostrarFeedback(input, false, '✗ CPF inválido');
        if (typeof window._scaToast === 'function') {
          window._scaToast(`${labelErro}: CPF inválido. Verifique os números.`, 'err');
        } else {
          alert(`${labelErro}: CPF inválido.`);
        }
        input.focus();
        return;
      }
    }
    return original.apply(this, args);
  };
}

function interceptarSalvarCNPJ(nomeFuncao, campoCNPJ, labelErro) {
  const original = window[nomeFuncao];
  if (typeof original !== 'function') return;

  window[nomeFuncao] = async function(...args) {
    const input = document.getElementById(campoCNPJ);
    if (input) {
      const digits = input.value.replace(/\D/g, '');
      if (digits.length > 0 && digits.length < 14) {
        if (typeof window._scaToast === 'function') {
          window._scaToast(`${labelErro}: CNPJ incompleto.`, 'warn');
        } else {
          alert(`${labelErro}: CNPJ incompleto.`);
        }
        input.focus();
        return;
      }
      if (digits.length === 14 && !validarCNPJ(digits)) {
        mostrarFeedback(input, false, '✗ CNPJ inválido');
        if (typeof window._scaToast === 'function') {
          window._scaToast(`${labelErro}: CNPJ inválido. Verifique os números.`, 'err');
        } else {
          alert(`${labelErro}: CNPJ inválido.`);
        }
        input.focus();
        return;
      }
    }
    return original.apply(this, args);
  };
}

// ─── 7. EXPÕE FUNÇÕES GLOBAIS PARA USO EXTERNO ───────────────

window.validarCPF    = validarCPF;
window.validarCNPJ   = validarCNPJ;
window.mascararCNPJ  = function(input) {
  aplicarMascaraCNPJ(input);
  validarEMostrar(input, 'cnpj');
};

// ─── 8. INICIALIZAÇÃO ────────────────────────────────────────

function inicializar() {
  // Aplica máscara e validação em todos os campos mapeados
  CAMPOS_CPF.forEach(id     => configurarCampo(id, 'cpf'));
  CAMPOS_CNPJ.forEach(id    => configurarCampo(id, 'cnpj'));
  CAMPOS_CPF_CNPJ.forEach(id => configurarCampo(id, 'cpf_cnpj'));

  // Intercepta funções de salvar para bloquear CPF/CNPJ inválido
  // Aguarda o sca_supabase.js ter definido as funções
  setTimeout(() => {
    interceptarSalvar('salvarCliente',       'cl-cpf',       'Cliente');
    interceptarSalvar('salvarDadosPessoais', 'cl-cpf',       'Dados pessoais');
    interceptarSalvar('salvarMembro',        'mem-cpf',      'Membro da equipe');
    interceptarSalvar('salvarSafViveirista', 'saf-viv-cnpj-cpf', 'SAF Viveirista');
    interceptarSalvarCNPJ('salvarEmpresa',   'empresa-cnpj', 'Empresa consultora');

    // salvarParticipante é genérico — intercepta verificando a aba ativa
    const originalPart = window.salvarParticipante;
    if (typeof originalPart === 'function') {
      window.salvarParticipante = async function(...args) {
        const tab = document.querySelector('.part-tab.active')?.dataset?.tab
                 || document.querySelector('.part-tab.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];

        const camposMap = {
          conjugue:   { id: 'conj-cpf',  tipo: 'cpf', label: 'CPF do cônjuge' },
          avalista:   { id: 'aval-cpf',  tipo: 'cpf', label: 'CPF do avalista' },
          arrendante: { id: 'arr-cpf',   tipo: 'cpf', label: 'CPF do arrendante' },
          empresa:    { id: 'emp-cnpj',  tipo: 'cnpj',label: 'CNPJ da empresa participante' },
        };

        // Detecta aba ativa pelo botão marcado
        let abaAtiva = null;
        document.querySelectorAll('.part-tab').forEach(btn => {
          if (btn.classList.contains('active')) {
            const oc = btn.getAttribute('onclick') || '';
            const m = oc.match(/'([^']+)'/);
            if (m) abaAtiva = m[1];
          }
        });

        if (abaAtiva && camposMap[abaAtiva]) {
          const { id, tipo, label } = camposMap[abaAtiva];
          const input = document.getElementById(id);
          if (input) {
            const digits = input.value.replace(/\D/g, '');
            if (digits.length > 0) {
              const tamanhoEsperado = tipo === 'cnpj' ? 14 : 11;
              if (digits.length < tamanhoEsperado) {
                if (typeof toast === 'function') toast(`${label} incompleto.`, 'warn');
                input.focus();
                return;
              }
              const valido = tipo === 'cnpj' ? validarCNPJ(digits) : validarCPF(digits);
              if (!valido) {
                mostrarFeedback(input, false, `✗ ${tipo.toUpperCase()} inválido`);
                if (typeof toast === 'function') toast(`${label} inválido. Verifique os números.`, 'err');
                input.focus();
                return;
              }
            }
          }
        }

        return originalPart.apply(this, args);
      };
    }

    console.log('[SCA Masks] ✅ v1.0 — máscaras e validação de CPF/CNPJ ativas.');
  }, 300);
}

// Garante que roda após o DOM estar completo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializar);
} else {
  inicializar();
}

})();
