(() => {
  const form = document.querySelector('#brief-form');
  const fields = Array.from(form.querySelectorAll('fieldset'));
  const back = document.querySelector('#brief-voltar');
  const next = document.querySelector('#brief-avancar');
  const copy = document.querySelector('#brief-copiar');
  const summary = document.querySelector('#brief-resumo');
  const status = document.querySelector('#brief-status');
  const e = form.elements;
  const addressStatus = document.querySelector('#brief-endereco-status');
  const cepButton = document.querySelector('#brief-buscar-cep');
  const gpsButton = document.querySelector('#brief-localizar');
  const clearGps = document.querySelector('#brief-remover-localizacao');
  const map = document.querySelector('#brief-mapa');
  const send = document.querySelector('#brief-enviar');
  let coordinates = '';
  function mapUrl() {
    const address = [e.logradouro.value, e.numero.value, e.bairro.value, e.cidade.value, e.uf.value, e.cep.value, 'Brasil'].filter(Boolean).join(', ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(coordinates || address);
  }
  function updateCombo() {
    const combo = e.modalidade.value === 'Combo offline';
    e.combo.closest('label').hidden = !combo;
    e.combo.required = combo;
    if (!combo) e.combo.value = '';
  }
  e.modalidade.addEventListener('change', updateCombo);
  updateCombo();
  cepButton.addEventListener('click', async () => {
    const cep = e.cep.value.replace(/\D/g, '');
    if (cep.length !== 8) { addressStatus.textContent = 'Informe um CEP com 8 dígitos.'; e.cep.focus(); return; }
    cepButton.disabled = true;
    addressStatus.textContent = 'Consultando CEP…';
    try {
      const response = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
      if (!response.ok) throw Error('CEP');
      const data = await response.json();
      if (e.cep.value.replace(/\D/g, '') !== cep) { addressStatus.textContent = 'O CEP mudou. Faça uma nova consulta.'; return; }
      if (data.erro) { addressStatus.textContent = 'CEP não encontrado. Preencha o endereço manualmente.'; return; }
      for (const [field, key] of [['logradouro','logradouro'],['bairro','bairro'],['cidade','localidade'],['uf','uf']]) e[field].value = data[key] || '';
      addressStatus.textContent = 'Confira o endereço e complete o número.';
      e.numero.focus();
    } catch { addressStatus.textContent = 'Consulta indisponível. Preencha o endereço manualmente.'; }
    finally { cepButton.disabled = false; }
  });
  gpsButton.addEventListener('click', () => {
    if (!navigator.geolocation) { addressStatus.textContent = 'Localização indisponível. O mapa será pesquisado pelo endereço.'; return; }
    gpsButton.disabled = true;
    addressStatus.textContent = 'Aguardando a localização do dispositivo…';
    navigator.geolocation.getCurrentPosition(({coords}) => {
      coordinates = coords.latitude.toFixed(6) + ',' + coords.longitude.toFixed(6);
      clearGps.hidden = false;
      gpsButton.disabled = false;
      addressStatus.textContent = 'Localização adicionada. O mapa do pedido usará esse ponto.';
    }, () => {
      gpsButton.disabled = false;
      addressStatus.textContent = coordinates ? 'Não foi possível atualizar o ponto. A localização anterior foi mantida.' : 'Não foi possível obter a localização. O mapa usará o endereço.';
    }, {timeout:10000, enableHighAccuracy:true});
  });
  clearGps.addEventListener('click', () => {
    coordinates = '';
    clearGps.hidden = true;
    addressStatus.textContent = 'O mapa do pedido usará o endereço.';
  });
  document.querySelector('#brief-ver-endereco').addEventListener('click', () => {
    if (!coordinates && (!e.logradouro.value.trim() || !e.cidade.value.trim())) {
      addressStatus.textContent = 'Informe a rua e a cidade ou use sua localização.';
      return;
    }
    window.open(mapUrl(), '_blank', 'noopener,noreferrer');
  });
  let step = 0;
  const labels = [
    ['ramo', 'Ramo'], ['oferta', 'Atividade'], ['objetivo', 'Objetivo'],
    ['conexao', 'Conectividade'], ['modalidade', 'Tipo de pedido'], ['pessoa', 'Tipo de pessoa'], ['cliente', 'Nome ou razão social'], ['negocio', 'Negócio'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['cep', 'CEP'], ['logradouro', 'Endereço'], ['numero', 'Número'], ['complemento', 'Complemento'], ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['uf', 'UF'],
    ['observacoes', 'Observações']
  ];
  function render(focus) {
    const final = step === fields.length - 1;
    fields.forEach((field, index) => {
      field.hidden = index !== step;
      field.disabled = index !== step;
    });
    back.hidden = step === 0;
    next.hidden = final;
    next.textContent = step === fields.length - 2 ? 'Revisar briefing' : 'Continuar';
    copy.hidden = !final;
    send.hidden = !final;
    status.textContent = '';
    document.querySelector('#brief-etapa').textContent = 'Etapa ' + (step + 1) + ' de ' + fields.length;
    if (final) {
      const values = labels.map(([name, label]) => label + ': ' + (form.elements.namedItem(name).value.trim() || '—'));
      if (e.modalidade.value === 'Combo offline') values.push('Combo: ' + e.combo.value);
      map.href = mapUrl();
      const features = Array.from(form.querySelectorAll('[name=recursos]:checked'), input => input.value);
      summary.value = ['Fábrica de Apps — NFSF', '', ...values, 'Recursos: ' + (features.join(', ') || 'A definir'), 'Mapa: ' + map.href].join('\n');
      send.href = 'https://wa.me/5592984925493?text=' + encodeURIComponent(summary.value);
    }
    if (focus) fields[step].querySelector('legend').focus();
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (step < fields.length - 1) {
      const requiredText = fields[step].querySelectorAll('input[required]');
      for (const input of requiredText) {
        if (!input.value.trim()) {
          input.value = '';
          input.reportValidity();
          return;
        }
      }
      step += 1;
      render(true);
    }
  });
  back.addEventListener('click', () => {
    if (step > 0) {
      step -= 1;
      render(true);
    }
  });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(summary.value);
      status.textContent = 'Resumo copiado.';
    } catch {
      summary.focus();
      summary.select();
      status.textContent = 'Resumo selecionado. Use a opção de copiar do seu dispositivo.';
    }
  });
  render(false);
})();