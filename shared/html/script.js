// Recupera dinamicamente o nome do resource (evita hardcode)
const RESOURCE_NAME = GetParentResourceName();

// Detecta se está rodando em ambiente de desenvolvimento ou produção
const isDev = window.location.hostname === 'localhost' || 
              window.location.hostname === '127.0.0.1' || 
              window.location.hostname.includes('cfx.re');

// URLs alternativas para tentar em caso de erro
// Esta técnica permite maior flexibilidade na conexão com o Express
const EXPRESS_URLS = [
  // Usar o mesmo protocolo (http/https) que a página atual
  `${window.location.protocol}//${window.location.hostname}:8000/api/laundry`,
  
  // Tentativas alternativas - mesclando HTTP e HTTPS
  'https://127.0.0.1:8000/api/laundry',
  'http://127.0.0.1:8000/api/laundry',
  
  // URLs específicas do FiveM
  `https://cfx-nui-${GetParentResourceName()}/proxy/express/api/laundry`, // Usar proxy via FiveM
  `https://${window.location.hostname}/proxy/express/api/laundry`,     // Alternativa via hostname
  
  // HTTPS direto da URL original
  'https://localhost:8000/api/laundry',
  
  // Última tentativa com porta FiveM
  'https://127.0.0.1:30120/api/laundry'
];

// URL inicial do servidor Express - será ajustada em caso de erro
let API_URL = EXPRESS_URLS[0];

// Função para testar URLs alternativas
async function testApiUrls() {
  console.log("Testando URLs alternativas do Express...");
  
  for (const url of EXPRESS_URLS) {
    try {
      const baseUrl = url.split('/api/laundry')[0];
      console.log(`Testando URL: ${baseUrl}/api/health`);
      
      const response = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        // Timeout curto para não travar
        signal: AbortSignal.timeout(1000)
      });
      
      if (response.ok) {
        console.log(`Conexão bem-sucedida com: ${url}`);
        API_URL = url;
        return true;
      }
    } catch (error) {
      console.log(`Falha ao conectar com ${url}: ${error.message}`);
    }
  }
  
  console.error("Não foi possível conectar a nenhum dos servidores Express!");
  return false;
}

let currentJob = "unknown";
let allData = [];

// Helper para chamadas à API NUI do FiveM
function apiNui(endpoint, data = {}) {
  // Para comandos que não buscam dados, use a API do FiveM
  if (endpoint === "closePanel") {
    return fetch(`https://${RESOURCE_NAME}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
    .then(response => response.json())
    .catch(error => {
      console.error(`Erro na chamada NUI para ${endpoint}:`, error);
      throw error;
    });
  }
  
  // Callback para informar o resultado do teste de conexão
  if (endpoint === "expressConnectionResult") {
    // Tratamento para lidar com falhas na comunicação com o cliente Lua
    try {
      return fetch(`https://${RESOURCE_NAME}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        // Adiciona um timeout mais curto para mensagens de status
        signal: AbortSignal.timeout(1500) // 1.5 segundos
      })
      .catch(error => {
        // Registra o erro mas não quebra a execução (falha silenciosa)
        console.warn(`Aviso: Erro ao enviar resultado de conexão:`, error);
        console.warn(`Este erro é esperado no ambiente de desenvolvimento e não impede o funcionamento`);
        // Retorna um objeto simulando resposta bem-sucedida
        return { ok: true, json: () => Promise.resolve({ success: true }) };
      });
    } catch (e) {
      console.warn(`Aviso: Erro ao tentar comunicação com cliente Lua:`, e);
      // Retorna um objeto simulando resposta bem-sucedida
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
    }
  }
  
  // Para verificar estado de conexão com o Express
  if (endpoint === "checkExpressConnectionStatus") {
    return fetch(`https://${RESOURCE_NAME}/getExpressConnectionStatus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    })
    .then(response => response.json())
    .catch(error => {
      console.error(`Erro ao verificar status de conexão:`, error);
      return { connected: false };
    });
  }
  
  // Para buscar dados, use o servidor Express
  if (endpoint === "fetchLaundryData") {
    // Primeiro verifica se o servidor Express está online
    return fetch(`${API_URL.split('/api/laundry')[0]}/api/health`, {
      method: "GET", 
      headers: { "Content-Type": "application/json" },
      // Adiciona um timeout para evitar que a requisição fique pendente por muito tempo
      signal: AbortSignal.timeout(3000) // 3 segundos
    })
    .then(healthResponse => {
      if (!healthResponse.ok) {
        throw new Error("Servidor Express indisponível");
      }
      
      return healthResponse.json().then(healthData => {
        console.log("Servidor Express online:", healthData);
        
        // Notificar cliente Lua que a conexão está funcionando
        apiNui("expressConnectionResult", { 
          success: true, 
          message: `Online desde ${healthData.serverTime}`,
          isManualCheck: false
        });
        
        // Se o servidor estiver online, então faz a requisição real
        return fetch(`${API_URL}/data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          // Adiciona um timeout para a requisição de dados também
          signal: AbortSignal.timeout(5000) // 5 segundos
        });
      });
    })
    .then(response => response.json())
    .catch(error => {
      console.error(`Erro na chamada API para ${endpoint}:`, error);
      
      // Notificar cliente Lua sobre a falha (silenciosamente para não spammar)
      apiNui("expressConnectionResult", { 
        success: false, 
        message: error.message,
        isManualCheck: false
      });
      
      throw error;
    });
  }
}

// Inicializar o painel ao receber mensagem do client.lua
window.addEventListener("message", (event) => {
  const data = event.data;
  
  if (data.action === "openPanel") {
    document.getElementById("panel").style.display = "flex";
    currentJob = data.job;
    document.getElementById("job-name").textContent = formatJobName(currentJob);
    
    // Tentar encontrar a melhor URL antes de fazer qualquer requisição
    (async function() {
      try {
        const success = await testApiUrls();
        console.log(`Inicialização do painel: teste de URLs ${success ? 'bem-sucedido' : 'falhou'}, usando ${API_URL}`);
      } catch (error) {
        console.error("Erro durante teste de URLs:", error);
      } finally {
        // Sempre tenta fetchData, mesmo se o teste falhar
        fetchData();
      }
    })();
  } 
  else if (data.action === "closePanel") {
    closePanel();
  }
  else if (data.action === "testExpressConnection") {
    // Teste de conexão com o servidor Express
    console.log("Testando conexão com o servidor Express:", data.url);
    
    // Função para testar uma URL específica
    const testUrl = async (url) => {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(2000) // 2 segundos de timeout
        });
        
        if (!response.ok) {
          throw new Error(`Status: ${response.status}`);
        }
        
        const responseData = await response.json();
        console.log("Conexão com Express bem-sucedida:", responseData);
        
        // Informar o resultado ao cliente lua
        apiNui("expressConnectionResult", { 
          success: true, 
          message: `Online desde ${responseData.serverTime}`,
          isManualCheck: data.isManualCheck || false
        });
        
        return true;
      } catch (error) {
        console.error(`Falha na conexão com o Express (${url}):`, error);
        return false;
      }
    };
    
    // Função assíncrona para o teste completo
    const runTests = async () => {
      // Se uma URL específica foi fornecida, testar apenas essa
      if (data.url) {
        const success = await testUrl(data.url);
        if (!success) {
          apiNui("expressConnectionResult", { 
            success: false, 
            message: `Falha na conexão com ${data.url}`,
            isManualCheck: data.isManualCheck || false
          });
        }
      } else {
        // Caso contrário, testar a URL atual
        const currentUrl = `${API_URL.split('/api/laundry')[0]}/api/health`;
        const success = await testUrl(currentUrl);
        
        // Se falhou, testar URLs alternativas
        if (!success && data.isManualCheck) {
          console.log("Testando URLs alternativas após falha...");
          const foundWorkingUrl = await testApiUrls();
          
          if (!foundWorkingUrl) {
            // Se nenhuma URL funcionar, informar o erro
            apiNui("expressConnectionResult", { 
              success: false, 
              message: "Falha na conexão com todas as URLs testadas. Verifique se o servidor Express está rodando na porta 8000.",
              isManualCheck: data.isManualCheck || false
            });
          }
        } else if (!success) {
          // Reportar falha sem tentar URLs alternativas (para verificações automáticas)
          apiNui("expressConnectionResult", { 
            success: false, 
            message: `Falha na conexão com ${currentUrl}`,
            isManualCheck: data.isManualCheck || false
          });
        }
      }
    };
    
    // Executar os testes
    runTests();
  }
});

// Botão de fechar
document.getElementById("close-btn").addEventListener("click", closePanel);

function closePanel() {
  document.getElementById("panel").style.display = "none";
  
  // Este try-catch previne erros ao testar fora do ambiente FiveM
  try {
    // Se estivermos em um ambiente FiveM, notifica o cliente Lua
    apiNui("closePanel", {}).catch(error => {
      // Falha silenciosa, apenas registra no console
      console.warn("Aviso: Erro ao tentar fechar painel via NUI:", error);
      console.warn("Este erro é esperado ao testar fora do ambiente FiveM");
    });
  } catch (e) {
    console.warn("Falha ao tentar comunicar com cliente Lua ao fechar painel:", e);
  }
}

// Fechar com ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePanel();
});

// Botões de refresh e filtros
document.getElementById("refresh-btn").addEventListener("click", fetchData);
document.getElementById("job-filter").addEventListener("change", filterData);
document.getElementById("date-filter").addEventListener("change", filterData);

// Requisição de dados com retry e tratamento de erro
async function fetchData() {
  const maxRetries = 3;
  let retryCount = 0;
  let connectionTested = false;

  while (retryCount < maxRetries) {
    try {
      showLoading(true);
      
      // Se tivermos erro de conexão na primeira tentativa, testa URLs alternativas
      if (retryCount === 1 && !connectionTested) {
        connectionTested = true;
        console.log("Testando URLs alternativas devido a falha na primeira tentativa...");
        await testApiUrls();
      }
      
      // Aviso de debug para ajudar a identificar qual API está sendo chamada
      console.log(`Tentando buscar dados no servidor: ${API_URL}/data`, { job: currentJob });
      
      // Utilizando o método apiNui modificado
      const response = await apiNui("fetchLaundryData", { job: currentJob });
      console.log("Resposta recebida:", response);

      if (response && response.success) {
        allData = response.data || [];
        populateJobFilter(allData);
        filterData();
      } else {
        showNoData((response && response.message) || "Erro ao carregar dados.");
      }
      showLoading(false);
      return;
    } catch (error) {
      retryCount++;
      console.error("Erro ao buscar dados:", error);
      
      // Detalhamento mais específico dos erros para facilitar debug
      let msg = "Erro ao conectar com o servidor.";
      
      // Se for erro de conexão "Failed to fetch", tenta outras URLs
      if (error.name === "TypeError" && error.message.includes("Failed to fetch") && !connectionTested) {
        connectionTested = true;
        console.log("Erro 'Failed to fetch' detectado. Testando URLs alternativas...");
        const success = await testApiUrls();
        
        if (success) {
          msg = `Reconectando ao Express usando URL alternativa: ${API_URL}`;
          retryCount--; // Não conta esta tentativa se conseguimos uma URL alternativa
        } else {
          msg = `Falha na conexão com todos os servidores Express testados. Verifique se o servidor está rodando na porta 8000.`;
        }
      } else if (error.name === "AbortError") {
        msg = "A requisição excedeu o tempo limite.";
      } else if (error.name === "TypeError" && error.message.includes("Failed to fetch")) {
        msg = `Falha na conexão com o servidor Express em ${API_URL}. Verifique se o servidor está rodando na porta 8000.`;
      } else if (error instanceof TypeError) {
        msg = `Erro na comunicação com o servidor: ${error.message}`;
      }

      console.log(`Tentativa ${retryCount}/${maxRetries}: ${msg}`);

      if (retryCount >= maxRetries) {
        showNoData(msg);
        showLoading(false);
      } else {
        // Tempo de espera aumenta a cada tentativa
        const waitTime = 500 * retryCount;
        console.log(`Aguardando ${waitTime}ms antes da próxima tentativa...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
}

// Filtrar dados carregados
function filterData() {
  const jobFilter = document.getElementById("job-filter").value;
  const dateFilter = document.getElementById("date-filter").value;
  let filtered = [...allData];

  if (jobFilter !== "all") {
    filtered = filtered.filter((item) => item.job === jobFilter);
  }

  if (dateFilter !== "all") {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    filtered = filtered.filter((item) => {
      const itemDate = new Date(item.date);
      if (dateFilter === "today") return itemDate >= today;
      if (dateFilter === "week") {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return itemDate >= weekStart;
      }
      if (dateFilter === "month") {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return itemDate >= monthStart;
      }
      return true;
    });
  }

  displayData(filtered);
}

// Exibe dados na tabela
function displayData(data) {
  const tbody = document.getElementById("laundry-data");
  tbody.innerHTML = "";
  if (data.length === 0) {
    showNoData("Nenhum registro encontrado com os filtros atuais.");
    updateStats(data);
    return;
  }
  document.getElementById("no-data").classList.add("hidden");

  data.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.id}</td>
      <td>${item.name}</td>
      <td>R$ ${formatMoney(item.amountDirty)}</td>
      <td>R$ ${formatMoney(item.amountClean)}</td>
      <td>${(item.rate * 100).toFixed(1)}%</td>
      <td>${formatDate(item.date)}</td>
      <td>${formatJobName(item.job)}</td>
    `;
    tbody.appendChild(row);
  });

  updateStats(data);
}

// Atualiza estatísticas
function updateStats(data) {
  const totalDirty = data.reduce((sum, i) => sum + i.amountDirty, 0);
  const totalClean = data.reduce((sum, i) => sum + i.amountClean, 0);
  const avgRate = data.length ? data.reduce((sum, i) => sum + i.rate, 0) / data.length : 0;

  document.getElementById("total-laundered").textContent = `R$ ${formatMoney(totalDirty)}`;
  document.getElementById("total-clean").textContent = `R$ ${formatMoney(totalClean)}`;
  document.getElementById("avg-rate").textContent = `${(avgRate * 100).toFixed(1)}%`;
  document.getElementById("total-operations").textContent = data.length;
}

// Popula filtro de jobs
function populateJobFilter(data) {
  const filter = document.getElementById("job-filter");
  const sel = filter.value;
  while (filter.options.length > 1) filter.remove(1);

  const jobs = [...new Set(data.map((i) => i.job))];
  jobs.forEach((job) => {
    const opt = document.createElement("option");
    opt.value = job;
    opt.textContent = formatJobName(job);
    filter.appendChild(opt);
  });

  filter.value = sel;
}

// Loading e sem dados
function showLoading(show) {
  document.getElementById("loading").classList.toggle("hidden", !show);
}

function showNoData(msg) {
  const el = document.getElementById("no-data");
  el.querySelector("p").textContent = msg;
  el.classList.remove("hidden");
}

// Formatação
function formatJobName(job) {
  if (!job) return "Desconhecido";
  const names = {
    vanilla: "Vanilla Unicorn",
    bope: "BOPE",
    tatico: "Tático",
    prf1: "PRF Nível 1",
    prf2: "PRF Nível 2",
    admin: "Administrador",
    unknown: "Desconhecido",
  };
  return names[job] || job.charAt(0).toUpperCase() + job.slice(1);
}

function formatMoney(val) {
  return val.toLocaleString("pt-BR");
}

function formatDate(s) {
  return new Date(s).toLocaleString("pt-BR");
}

// Helper para obter o nome do resource
function GetParentResourceName() {
  let resourceName = window.__cfx_nuiResourceName || 'unknown';
  
  // Fallback para caso o __cfx_nuiResourceName não exista
  if (resourceName === 'unknown' && window.parent) {
    try {
      // Tenta extrair da URL
      const parentUrl = window.parent.location.href;
      const match = parentUrl.match(/\/([^\/]+)\/nui-p/);
      if (match && match[1]) {
        resourceName = match[1];
      }
    } catch (e) {
      console.error('Não foi possível acessar o parent frame:', e);
    }
  }
  
  // Modo de debug - se estiver rodando diretamente no navegador
  // permite testar sem estar no FiveM
  if (resourceName === 'unknown' && window.location.hostname === 'localhost') {
    console.log('Modo de debug ativado - simulando FiveM');
    resourceName = 'testmode';
    
    // Inicializa automaticamente para testes
    if (!window.__debugInitialized) {
      window.__debugInitialized = true;
      setTimeout(() => {
        console.log('Inicializando painel no modo de teste');
        document.getElementById("panel").style.display = "flex";
        currentJob = "admin";
        document.getElementById("job-name").textContent = formatJobName(currentJob);
        fetchData();
      }, 500);
    }
  }
  
  console.log(`Resource detectado: ${resourceName}`);
  return resourceName;
}
