// html/script.js

// Recupera dinamicamente o nome do resource (evita hardcode)
const RESOURCE_NAME = window.__cfx_nuiResourceName;

let currentJob = "unknown";
let allData = [];

// Helper para chamadas à API do resource
function api(path, options = {}) {
  return fetch(`https://${RESOURCE_NAME}/${path}`, options);
}

// Inicializar o painel ao receber mensagem do client.lua
window.addEventListener("message", (event) => {
  const data = event.data;
  if (data.action === "openPanel") {
    document.getElementById("panel").style.display = "flex";
    currentJob = data.job;
    document.getElementById("job-name").textContent = formatJobName(currentJob);
    fetchData();
  } else if (data.action === "closePanel") {
    closePanel();
  }
});

// Botão de fechar
document.getElementById("close-btn").addEventListener("click", closePanel);

function closePanel() {
  document.getElementById("panel").style.display = "none";
  api("closePanel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
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

  while (retryCount < maxRetries) {
    try {
      showLoading(true);
      const res = await api("fetchLaundryData", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: currentJob }),
        signal: AbortSignal.timeout(5000),
      });

      const response = await res.json();

      if (response.success) {
        allData = response.data;
        populateJobFilter(allData);
        filterData();
      } else {
        showNoData(response.message || "Erro ao carregar dados.");
      }
      showLoading(false);
      return;
    } catch (error) {
      retryCount++;
      console.error("Erro ao buscar dados:", error);
      let msg = "Erro ao conectar com o servidor.";
      if (error.name === "AbortError") msg = "A requisição excedeu o tempo limite.";
      else if (error.name === "NetworkError") msg = "Erro de conexão com o servidor.";
      else if (error instanceof TypeError) msg = "Erro na comunicação com o servidor.";

      if (retryCount >= maxRetries) {
        showNoData(msg);
        showLoading(false);
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

// Marca como módulo ESM para TS
export {};
