local QBCore = exports['qb-core']:GetCoreObject()

-- Cache para cooldowns
local playerCooldowns = {}

-- Função para debug
local function Debug(msg)
    if Config.Debug then
        print("[DEBUG] " .. msg)
    end
end

-- Função para formatar dinheiro
local function formatMoney(amount)
    local formatted = tostring(amount)
    local k = 3
    while true do
        formatted, k = string.gsub(formatted, "^(-?%d+)(%d%d%d)", '%1.%2')
        if k == 0 then break end
    end
    return formatted
end

-- Função para verificar cooldown
local function checkCooldown(citizenid)
    local lastTime = playerCooldowns[citizenid]
    if lastTime then
        local now = os.time()
        local diff = now - lastTime
        if diff < Config.Cooldown then
            return false, Config.Cooldown - diff
        end
    end
    return true, 0
end

-- Função para definir cooldown
local function setCooldown(citizenid)
    playerCooldowns[citizenid] = os.time()
end

-- Evento principal de solicitação de lavagem
QBCore.Functions.CreateCallback('qb-laundry:server:tryWash', function(source, cb, amount)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    
    if not Player then 
        Debug("Jogador não encontrado: " .. src)
        return cb(false, "Jogador não encontrado.") 
    end

    local cid = Player.PlayerData.citizenid
    local job = Player.PlayerData.job.name
    
    Debug("Solicitação de lavagem: Jogador " .. GetPlayerName(src) .. " (" .. cid .. "), Job: " .. job .. ", Valor: " .. amount)
    
    -- Verificar se o job tem taxa especial
    local rate = Config.DefaultRate -- Taxa padrão (30%)
    local grp = Config.Groups[job]
    
    if grp then
        rate = grp.rate
        Debug("Taxa especial para " .. job .. ": " .. (rate * 100) .. "%")
    else
        Debug("Usando taxa padrão: " .. (rate * 100) .. "%")
    end
    
    -- Verificar cooldown
    local canWash, timeLeft = checkCooldown(cid)
    if not canWash then
        Debug("Cooldown ativo: " .. timeLeft .. " segundos restantes")
        return cb(false, ("Aguarde %d segundos antes de lavar novamente."):format(timeLeft))
    end
    
    -- Verificar se o valor é válido
    if not amount or type(amount) ~= "number" or amount <= 0 then
        Debug("Valor inválido: " .. tostring(amount))
        return cb(false, "Valor inválido para lavagem.")
    end
    
    -- Verificar se o valor está na lista de valores permitidos
    local validAmount = false
    for _, amt in ipairs(Config.Amounts) do
        if amount == amt then
            validAmount = true
            break
        end
    end
    
    if not validAmount then
        Debug("Valor não permitido: " .. amount)
        return cb(false, "Valor não permitido para lavagem.")
    end

    -- Verificar se o jogador tem o item de dinheiro sujo
    local hasItem = Player.Functions.GetItemByName(Config.DirtyMoneyItem)
    
    if not hasItem then
        Debug("Jogador não tem o item " .. Config.DirtyMoneyItem)
        return cb(false, "Você não tem dinheiro sujo.")
    end
    
    if hasItem.amount < amount then
        Debug("Jogador não tem dinheiro sujo suficiente. Tem: " .. hasItem.amount .. ", Necessário: " .. amount)
        return cb(false, "Você não tem dinheiro sujo suficiente.")
    end

    -- Tudo ok: remove dinheiro sujo
    local success = Player.Functions.RemoveItem(Config.DirtyMoneyItem, amount)
    
    if not success then
        Debug("Falha ao remover item " .. Config.DirtyMoneyItem)
        return cb(false, "Erro ao processar dinheiro sujo.")
    end
    
    -- Notificar cliente sobre remoção do item
    TriggerClientEvent('inventory:client:ItemBox', src, QBCore.Shared.Items[Config.DirtyMoneyItem], "remove", amount)
    
    -- Calcular valor limpo (com taxa aplicada)
    local clean = math.floor(amount * (1 - rate))
    Debug("Valor sujo: " .. amount .. ", Taxa: " .. (rate * 100) .. "%, Valor limpo: " .. clean)
    
    -- Adicionar dinheiro limpo
    Player.Functions.AddMoney('cash', clean, 'money-laundering')
    
    -- Definir cooldown
    setCooldown(cid)
    
    -- Registrar no log do banco de dados
    exports.oxmysql:insert([[
        INSERT INTO laundry_logs (citizenid, amount_dirty, amount_clean, rate, date, job)
        VALUES (?, ?, ?, ?, NOW(), ?)
    ]], {cid, amount, clean, rate, job})
    
    -- Registrar no log do console
    print(string.format("[LAVAGEM] Jogador %s (%s) lavou R$%s para R$%s (taxa: %.1f%%)", 
        GetPlayerName(src), cid, formatMoney(amount), formatMoney(clean), rate * 100))
    
    -- Sucesso
    return cb(true, ("Lavagem concluída: R$%s limpos (taxa %.0f%%)"):format(formatMoney(clean), rate * 100))
end)

-- Callback para obter dados de lavagem para o painel administrativo
QBCore.Functions.CreateCallback('qb-laundry:server:getLaundryData', function(source, cb, job)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    
    if not Player then 
        return cb({success = false, message = "Jogador não encontrado."})
    end
    
    local playerJob = Player.PlayerData.job.name
    
    -- Verificar se o jogador tem permissão para acessar os dados
    if Config.AdminPanel.requireJob and not Config.Groups[playerJob] then
        return cb({success = false, message = "Você não tem permissão para acessar estes dados."})
    end
    
    -- Construir a consulta SQL
    local query = [[
        SELECT l.id, l.citizenid, p.charinfo, l.amount_dirty, l.amount_clean, l.rate, l.date, l.job
        FROM laundry_logs l
        LEFT JOIN players p ON l.citizenid = p.citizenid
    ]]
    
    local params = {}
    
    -- Se não for admin, filtrar apenas pelo job do jogador
    if playerJob ~= "admin" and playerJob ~= "god" then
        query = query .. " WHERE l.job = ?"
        params = {playerJob}
    elseif job and job ~= "all" then
        -- Se for admin e especificou um job, filtrar por esse job
        query = query .. " WHERE l.job = ?"
        params = {job}
    end
    
    query = query .. " ORDER BY l.date DESC LIMIT " .. Config.AdminPanel.maxRecords
    
    exports.oxmysql:execute(query, params, function(result)
        if result and #result > 0 then
            -- Processar os resultados
            local processedResults = {}
            
            for i, log in ipairs(result) do
                local charInfo = json.decode(log.charinfo)
                local name = charInfo and charInfo.firstname .. " " .. charInfo.lastname or "Desconhecido"
                
                table.insert(processedResults, {
                    id = log.id,
                    name = name,
                    citizenid = log.citizenid,
                    amountDirty = log.amount_dirty,
                    amountClean = log.amount_clean,
                    rate = log.rate,
                    date = log.date,
                    job = log.job
                })
            end
            
            cb({success = true, data = processedResults})
        else
            cb({success = true, data = {}})
        end
    end)
end)

-- Comando para administradores verificarem logs de lavagem
QBCore.Commands.Add('laundrylog', 'Ver logs de lavagem de dinheiro (Admin)', {{name = 'id', help = 'ID do jogador (opcional)'}}, true, function(source, args)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    
    if not Player.PlayerData.job.name == 'admin' and not IsPlayerAceAllowed(src, 'command') then
        TriggerClientEvent('QBCore:Notify', src, 'Você não tem permissão para usar este comando!', 'error')
        return
    end
    
    local query = [[
        SELECT l.citizenid, p.charinfo, l.amount_dirty, l.amount_clean, l.rate, l.date, l.job
        FROM laundry_logs l
        LEFT JOIN players p ON l.citizenid = p.citizenid
    ]]
    
    local params = {}
    
    if args[1] then
        local targetId = tonumber(args[1])
        local targetPlayer = QBCore.Functions.GetPlayer(targetId)
        
        if targetPlayer then
            query = query .. " WHERE l.citizenid = ?"
            params = {targetPlayer.PlayerData.citizenid}
        else
            TriggerClientEvent('QBCore:Notify', src, 'Jogador não encontrado!', 'error')
            return
        end
    end
    
    query = query .. " ORDER BY l.date DESC LIMIT 10"
    
    exports.oxmysql:execute(query, params, function(result)
        if result and #result > 0 then
            local logText = "^2=== LOGS DE LAVAGEM DE DINHEIRO ===^7\n"
            
            for i, log in ipairs(result) do
                local charInfo = json.decode(log.charinfo)
                local name = charInfo and charInfo.firstname .. " " .. charInfo.lastname or "Desconhecido"
                
                logText = logText .. string.format("^3#%d^7 | ^5%s^7 | ^6%s^7 | Sujo: ^1R$%s^7 | Limpo: ^2R$%s^7 | Taxa: ^3%.1f%%^7 | Job: ^4%s^7\n", 
                    i, name, log.date, formatMoney(log.amount_dirty), formatMoney(log.amount_clean), log.rate * 100, log.job)
            end
            
            TriggerClientEvent('chat:addMessage', src, {
                template = '<div style="padding: 0.5vw; background-color: rgba(0, 0, 0, 0.7); border-radius: 5px; margin: 0.5vw;">{0}</div>',
                args = {logText}
            })
        else
            TriggerClientEvent('QBCore:Notify', src, 'Nenhum log de lavagem encontrado!', 'error')
        end
    end)
end, 'admin')

-- Limpar cache de cooldowns ao reiniciar o recurso
AddEventHandler('onResourceStart', function(resourceName)
    if GetCurrentResourceName() == resourceName then
        Debug("Recurso iniciado: " .. resourceName)
        playerCooldowns = {}
        
        -- Verificar se a tabela tem a coluna 'job'
        exports.oxmysql:execute("SHOW COLUMNS FROM laundry_logs LIKE 'job'", {}, function(result)
            if not result or #result == 0 then
                -- Adicionar coluna 'job' se não existir
                exports.oxmysql:execute("ALTER TABLE laundry_logs ADD COLUMN job VARCHAR(50) DEFAULT 'unknown'", {})
                Debug("Coluna 'job' adicionada à tabela laundry_logs")
            end
        end)
    end
end)
