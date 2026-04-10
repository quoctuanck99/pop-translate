let translatedText = '';

window.api.onTranslationResult((data) => {
  const content = document.getElementById('content');
  const langLabel = document.getElementById('lang-label');
  const btnCopy = document.getElementById('btn-copy');

  if (data.loading) {
    content.className = 'loading';
    content.textContent = 'Translating...';
    btnCopy.style.display = 'none';
    return;
  }

  if (data.error) {
    content.className = 'error';
    content.textContent = data.error;
    btnCopy.style.display = 'none';
    return;
  }

  langLabel.textContent = data.langLabel || 'Translation';
  content.className = 'translation';
  content.textContent = data.translation;
  translatedText = data.translation;
  btnCopy.style.display = 'inline';
});

document.getElementById('btn-copy').addEventListener('click', () => {
  window.api.copyText(translatedText);
  const btn = document.getElementById('btn-copy');
  btn.textContent = '✓ Copied';
  setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500);
});

document.getElementById('btn-dismiss').addEventListener('click', () => {
  window.api.closePopup();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.api.closePopup();
});
