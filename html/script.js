let currentJob = null;

// Nome do resource (NUI), separado do host da API
const RESOURCE_NAME = window.__cfx_nuiResourceName || GetParentResourceName() || 'thug';

// Host/api já setados via index.html ou fallback para window.location
const API_HOST = window.__apiHost || window.location.hostname;
const API_PORT = window.__apiPort || '3000';
const PROTOCOL = window.location.protocol;
const BASE_URL = `${PROTOCOL}//${API_HOST}:${API_PORT}`;
console.log(`[CONFIG] API em: ${BASE_URL}`);

// Helper para chamadas à API do servidor
function api(path, options = {}) {
  return fetch(`${BASE_URL}/${path}`, options);
}

// Função principal para requisição de dados com retry e tratamento de erro
async function fetchData() {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await api('api/laundry/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ job: currentJob }),
        mode: 'cors',
        credentials: 'same-origin', // Alterado de 'include' para 'same-origin'
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (json.success) {
        allData = json.data;
        populateJobFilter(allData);
        filterData();
      } else {
        showNoData(json.message || "Erro ao carregar dados.");
      }

      showLoading(false);
      return;

    } catch (err) {
      clearTimeout(timeoutId);
      retryCount++;
      console.error(`Tentativa ${retryCount} falhou:`, err.name, err.message);

      if (retryCount >= maxRetries) {
        showNoData("Erro ao conectar com o servidor após várias tentativas.");
        showLoading(false);
        return;
      }

      // Exponential backoff
      await new Promise(r => setTimeout(r, 2 ** retryCount * 1000));
    }
  }
}
