const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 8000; // Usar porta do ambiente ou 8000 como fallback

// Configuração do banco de dados
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123123',
  database: process.env.DB_NAME || 'tokyo-edge'
};

// Middleware
app.use(express.json());
app.use(cors({
  origin: '*', // Permite todas as origens, importante para o FiveM
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // Permite credenciais
  preflightContinue: true // Melhora compatibilidade com clientes diferentes
}));

// Adiciona headers específicos para cada resposta
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Responde imediatamente a solicitações OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Função para conectar ao banco de dados
async function getConnection() {
  try {
    return await mysql.createConnection(dbConfig);
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados:', error);
    throw error;
  }
}

// Rota para obter dados de lavagem
app.post('/api/laundry/data', async (req, res) => {
  const { job } = req.body;
  
  try {
    const connection = await getConnection();
    
    // Construir a consulta SQL para o QBCore
    let query = `
      SELECT l.id, l.citizenid, p.charinfo, 
             l.amount_dirty as amountDirty, 
             l.amount_clean as amountClean, 
             l.rate, l.date, l.job
      FROM laundry_logs l
      LEFT JOIN players p ON l.citizenid = p.citizenid
    `;
    
    const params = [];
    
    // Se não for admin, filtra por job
    if (job && job !== 'admin' && job !== 'god') {
      query += ' WHERE l.job = ?';
      params.push(job);
    } else if (job && job !== 'all') {
      // Se for admin e especificou um job, filtrar por esse job
      query += ' WHERE l.job = ?';
      params.push(job);
    }
    
    query += ' ORDER BY l.date DESC LIMIT 100';
    
    const [rows] = await connection.execute(query, params);
    await connection.end();
    
    // Processar os resultados para incluir o nome dos jogadores
    const processedResults = rows.map(row => {
      let charInfo;
      try {
        charInfo = typeof row.charinfo === 'string' ? JSON.parse(row.charinfo) : row.charinfo;
      } catch (e) {
        charInfo = null;
      }
      
      const name = (charInfo && charInfo.firstname && charInfo.lastname) 
        ? `${charInfo.firstname} ${charInfo.lastname}` 
        : "Desconhecido";
      
      return {
        id: row.id,
        name: name,
        citizenid: row.citizenid,
        amountDirty: row.amountDirty,
        amountClean: row.amountClean,
        rate: row.rate,
        date: row.date,
        job: row.job
      };
    });
    
    res.json({
      success: true,
      data: processedResults
    });
  } catch (error) {
    console.error('Erro ao buscar dados:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar dados do banco de dados: ' + error.message
    });
  }
});

// Rota para adicionar um registro
app.post('/api/laundry/add', async (req, res) => {
  const { citizenid, amountDirty, amountClean, rate, job } = req.body;
  
  // Validações básicas
  if (!citizenid || !amountDirty || !amountClean || !rate || !job) {
    return res.status(400).json({
      success: false,
      message: 'Dados incompletos'
    });
  }
  
  try {
    const connection = await getConnection();
    
    // Verificar se a tabela existe
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'laundry_logs'"
    );
    
    // Se a tabela não existir, criar
    if (tables.length === 0) {
      console.log("Criando tabela laundry_logs...");
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS laundry_logs (
          id INT NOT NULL AUTO_INCREMENT,
          citizenid VARCHAR(50) NOT NULL,
          amount_dirty INT NOT NULL,
          amount_clean INT NOT NULL,
          rate FLOAT NOT NULL,
          date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          job VARCHAR(50) NOT NULL DEFAULT 'unknown',
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }
    
    // Inserir o registro
    await connection.execute(
      'INSERT INTO laundry_logs (citizenid, amount_dirty, amount_clean, rate, date, job) VALUES (?, ?, ?, ?, NOW(), ?)',
      [citizenid, amountDirty, amountClean, rate, job]
    );
    
    await connection.end();
    
    // Log no console
    console.log(`[LAVAGEM API] Registro adicionado: Jogador ${citizenid} lavou R$${amountDirty} (taxa: ${rate * 100}%)`);
    
    res.json({
      success: true,
      message: 'Registro adicionado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao adicionar registro:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao adicionar registro no banco de dados: ' + error.message
    });
  }
});

// Rota para verificar a saúde do servidor (healthcheck)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    serverTime: new Date().toLocaleString('pt-BR')
  });
});

// Rota para compatibilidade com "thug-lavagem2"
app.get('/api/thug-lavagem2/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    serverTime: new Date().toLocaleString('pt-BR'),
    resource: 'thug-lavagem2'
  });
});

// Aliasing /api/laundry para /api/thug-lavagem2 para compatibilidade
app.post('/api/thug-lavagem2/data', async (req, res) => {
  // Redirecionar para a rota existente
  req.url = '/api/laundry/data';
  app._router.handle(req, res);
});

app.post('/api/thug-lavagem2/add', async (req, res) => {
  // Redirecionar para a rota existente
  req.url = '/api/laundry/add';
  app._router.handle(req, res);
});

// Rota raiz para evitar erro 404
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Servidor Express para FiveM está funcionando',
    endpoints: [
      '/api/health - Verificar status do servidor',
      '/api/laundry/data - Obter dados de lavagem (POST)',
      '/api/laundry/add - Adicionar registro de lavagem (POST)',
      '/api/thug-lavagem2/health - Verificar status para thug-lavagem2',
      '/api/thug-lavagem2/data - Compatibilidade com thug-lavagem2',
      '/api/thug-lavagem2/add - Compatibilidade com thug-lavagem2'
    ],
    timestamp: new Date().toISOString()
  });
});

// Configurar CORS para lidar com preflight OPTIONS
// Não usamos wildcard '*' que pode causar problemas com path-to-regexp
app.options('/api/laundry/data', cors());
app.options('/api/laundry/add', cors());
app.options('/api/health', cors());

// Configurações CORS para as novas rotas
app.options('/api/thug-lavagem2/data', cors());
app.options('/api/thug-lavagem2/add', cors());
app.options('/api/thug-lavagem2/health', cors());

// Iniciar o servidor
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor Express rodando em http://0.0.0.0:${port}`);
  console.log(`Para verificar a conexão, acesse: http://localhost:${port}/api/health`);
});
