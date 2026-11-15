(() => {
  const selector = document.querySelector('#skin');
  const allowed = new Set(Array.from(selector.options, option => option.value));
  const key = 'nfsf-fabrica-skin';
  function apply(value) {
    const skin = allowed.has(value) ? value : 'nfsf';
    document.documentElement.dataset.skin = skin;
    selector.value = skin;
    return skin;
  }
  let saved;
  try { saved = localStorage.getItem(key); } catch {}
  apply(saved);
  selector.addEventListener('change', () => {
    const skin = apply(selector.value);
    try { localStorage.setItem(key, skin); } catch {}
  });
})();