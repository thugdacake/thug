Config = {}

-- Taxa de lavagem (30% = 0.30)
Config.DefaultRate = 0.30 -- 30% de taxa padrão

-- Grupos permitidos e suas taxas de comissão (sobrescreve a taxa padrão)
Config.Groups = {
    bope   = { rate = 0.02, label = "BOPE" },
    tatico = { rate = 0.02, label = "Tático" },
    prf1   = { rate = 0.03, label = "PRF Nível 1" },
    prf2   = { rate = 0.03, label = "PRF Nível 2" },
    vanilla= { rate = 0.10, label = "Vanilla" }
}

-- Locais de lavagem: cada um pode ter restrição de grupo
Config.Locations = {
    {
        label  = "Boate Vanilla",
        coords = vector3(96.22, -1293.1, 29.26),
        radius = 2.5,
        groups = { "vanilla" },
        prop = "prop_cash_pile_02", -- Prop que aparece durante a lavagem
        animation = {
            dict = "anim@mp_player_intupperraining_cash",
            anim = "idle_a",
            flags = 49
        },
        -- Prop da máquina de lavar dinheiro
        machine = {
            model = "bkr_prop_money_counter", -- Modelo da máquina
        }
    },
    {
        label  = "Galpão Abandonado",
        coords = vector3(3825.21, 4441.37, 2.8), -- Nova localização
        radius = 3.0,
        groups = { "bope", "tatico", "prf1", "prf2" },
        prop = "prop_money_bag_01",
        animation = {
            dict = "anim@heists@ornate_bank@grab_cash_heels",
            anim = "grab",
            flags = 49
        },
        -- Prop da máquina de lavar dinheiro
        machine = {
            model = "bkr_prop_money_counter", -- Modelo da máquina
        }
    },
}

-- Valores disponíveis para escolher na lavagem
Config.Amounts = { 1000, 5000, 10000, 50000 }

-- Cooldown em segundos entre lavagens
Config.Cooldown = 300  -- 5 minutos

-- Tempo de "processamento" (progress bar) em milissegundos
Config.WashTime = 10000  -- 10 segundos

-- Configurações de notificação
Config.Notification = {
    title = "Lavagem de Dinheiro",
    icon  = "hand-holding-usd"
}

-- Item que representa dinheiro sujo
Config.DirtyMoneyItem = "black_money"

-- Debug mode (para testes)
Config.Debug = true -- Ativado para identificar problemas

-- Configurações do painel administrativo
Config.AdminPanel = {
    command = "laundrypanel", -- Comando para abrir o painel
    requireJob = true, -- Requer job específico para acessar
    maxRecords = 100, -- Número máximo de registros a exibir
}
