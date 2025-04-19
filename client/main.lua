local QBCore = exports['qb-core']:GetCoreObject()
local IsBusy = false
local propObject = nil
local activeZones = {}
local machineObjects = {}

-- Variável para controlar se o painel está aberto
local isPanelOpen = false

-- Função para debug
local function Debug(msg)
    if Config.Debug then
        print("[DEBUG] " .. msg)
    end
end

-- Função utilitária para checar se um valor existe em tabela
local function contains(tbl, val)
    for _, v in ipairs(tbl) do 
        if v == val then 
            return true 
        end 
    end
    return false
end

-- Função para carregar animação
local function loadAnimDict(dict)
    Debug("Carregando dicionário de animação: " .. dict)
    while not HasAnimDictLoaded(dict) do
        RequestAnimDict(dict)
        Wait(5)
    end
end

-- Função para tocar som
local function playSound(name, dict)
    if name and dict then
        Debug("Tocando som: " .. name .. " do dicionário: " .. dict)
        PlaySoundFrontend(-1, name, dict, false)
    end
end

-- Função para criar objeto prop
local function createProp(propName, coords)
    if not propName then return end
    
    Debug("Criando prop: " .. propName)
    local playerPed = PlayerPedId()
    
    RequestModel(GetHashKey(propName))
    while not HasModelLoaded(GetHashKey(propName)) do
        Wait(10)
    end
    
    propObject = CreateObject(GetHashKey(propName), coords.x, coords.y, coords.z - 1.0, true, true, true)
    AttachEntityToEntity(propObject, playerPed, GetPedBoneIndex(playerPed, 57005), 0.13, 0.02, -0.05, 270.0, 175.0, 20.0, true, true, false, true, 1, true)
    SetModelAsNoLongerNeeded(GetHashKey(propName))
    
    return propObject
end

-- Função para remover prop
local function deleteProp()
    if propObject then
        Debug("Removendo prop")
        DetachEntity(propObject, true, true)
        DeleteObject(propObject)
        propObject = nil
    end
end

-- Função para limpar animação
local function clearAnimation()
    Debug("Limpando animação")
    ClearPedTasks(PlayerPedId())
    deleteProp()
end

-- Função para criar um objeto no mundo
local function createWorldObject(modelName, coords, heading)
    local model = GetHashKey(modelName)
    
    -- Verificar se o modelo existe
    if not IsModelValid(model) then
        Debug("Modelo inválido: " .. modelName)
        return nil
    end
    
    -- Carregar modelo
    RequestModel(model)
    local timeout = 0
    while not HasModelLoaded(model) and timeout < 100 do
        Wait(10)
        timeout = timeout + 1
    end
    
    if HasModelLoaded(model) then
        -- Criar objeto
        local obj = CreateObject(model, coords.x, coords.y, coords.z, false, false, false)
        
        if DoesEntityExist(obj) then
            Debug("Objeto criado com sucesso: " .. modelName)
            
            -- Definir rotação
            SetEntityHeading(obj, heading or 0.0)
            
            -- Congelar posição
            FreezeEntityPosition(obj, true)
            SetEntityAsMissionEntity(obj, true, true)
            
            -- Liberar modelo
            SetModelAsNoLongerNeeded(model)
            
            return obj
        else
            Debug("Falha ao criar objeto: " .. modelName)
        end
    else
        Debug("Falha ao carregar modelo: " .. modelName)
    end
    
    SetModelAsNoLongerNeeded(model)
    return nil
end

-- Função para limpar todos os objetos
local function cleanupObjects()
    for _, obj in pairs(machineObjects) do
        if DoesEntityExist(obj) then
            DeleteObject(obj)
        end
    end
    machineObjects = {}
end

-- Função para criar as máquinas de lavar dinheiro nos locais
local function createMoneyMachines()
    Debug("Criando máquinas de lavar dinheiro")
    
    -- Limpar objetos existentes
    cleanupObjects()
    
    -- Criar novas máquinas
    for i, loc in ipairs(Config.Locations) do
        if loc.machine and loc.machine.model then
            local coords = loc.coords
            local heading = 0.0
            
            -- Criar a máquina
            local machineObj = createWorldObject(
                loc.machine.model, 
                vector3(coords.x, coords.y, coords.z - 0.5), 
                heading
            )
            
            if machineObj and DoesEntityExist(machineObj) then
                table.insert(machineObjects, machineObj)
            end
        end
    end
    
    Debug("Total de máquinas criadas: " .. #machineObjects)
end

-- Função simplificada para criar marcadores visuais
local function createMarkers()
    Debug("Criando marcadores")
    
    -- Criar máquinas de lavar dinheiro
    createMoneyMachines()
    
    -- Thread para desenhar marcadores
    CreateThread(function()
        while true do
            local sleep = 500
            local playerPed = PlayerPedId()
            local playerCoords = GetEntityCoords(playerPed)
            local playerJob = QBCore.Functions.GetPlayerData().job.name
            
            for i, loc in ipairs(Config.Locations) do
                -- Verificar se o jogador tem permissão para este local
                if contains(loc.groups, playerJob) then
                    local distance = #(playerCoords - loc.coords)
                    
                    -- Desenhar marcador quando próximo
                    if distance < 15.0 then
                        sleep = 0
                        DrawMarker(1, loc.coords.x, loc.coords.y, loc.coords.z - 1.0, 
                            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 
                            0.8, 0.8, 0.3, -- Tamanho reduzido
                            255, 0, 0, 100, false, true, 2, false, nil, nil, false)
                        
                        -- Mostrar texto de ajuda
                        if distance < 1.5 and not IsBusy then -- Reduzido para 1.5
                            QBCore.Functions.DrawText3D(loc.coords.x, loc.coords.y, loc.coords.z, "[E] " .. loc.label)
                            
                            -- Verificar tecla E
                            if IsControlJustReleased(0, 38) then
                                TriggerEvent('qb-laundry:client:openMenu', i)
                            end
                        end
                    end
                end
            end
            
            Wait(sleep)
        end
    end)
end

-- Ao abrir menu, lista valores configurados
RegisterNetEvent('qb-laundry:client:openMenu', function(locationIndex)
    if IsBusy then 
        Debug("Não pode abrir menu: ocupado")
        return 
    end
    
    local location = Config.Locations[locationIndex]
    if not location then 
        Debug("Localização inválida: " .. locationIndex)
        return 
    end
    
    Debug("Abrindo menu para localização: " .. location.label)
    
    -- Criar menu usando qb-menu
    local menuItems = {
        {
            header = "Lavagem de Dinheiro - " .. location.label,
            isMenuHeader = true
        }
    }
    
    for _, amt in ipairs(Config.Amounts) do
        table.insert(menuItems, {
            header = "R$ " .. amt,
            txt = "Converter R$ " .. amt .. " de dinheiro sujo",
            params = {
                event = "qb-laundry:client:startWash",
                args = {
                    amount = amt,
                    locationIndex = locationIndex
                }
            }
        })
    end
    
    table.insert(menuItems, {
        header = "Fechar",
        txt = "",
        params = {
            event = "qb-menu:client:closeMenu"
        }
    })
    
    exports['qb-menu']:openMenu(menuItems)
end)

-- Inicia progress bar e depois chama o servidor
RegisterNetEvent('qb-laundry:client:startWash', function(data)
    if IsBusy then 
        Debug("Não pode iniciar lavagem: ocupado")
        return 
    end
    
    local amount = data.amount
    local locationIndex = data.locationIndex
    local location = Config.Locations[locationIndex]
    
    if not location then 
        Debug("Localização inválida: " .. locationIndex)
        return 
    end
    
    Debug("Iniciando lavagem de R$ " .. amount .. " na localização: " .. location.label)
    
    IsBusy = true
    
    -- Tocar som de início
    playSound("Counting", "GTAO_Money_Laundering_Counting_Sounds")
    
    -- Virar jogador para a máquina
    local playerPed = PlayerPedId()
    TaskTurnPedToFaceCoord(playerPed, location.coords.x, location.coords.y, location.coords.z, 1000)
    Wait(1000)
    
    -- Carregar animação
    local anim = location.animation
    if anim and anim.dict and anim.anim then
        loadAnimDict(anim.dict)
        TaskPlayAnim(playerPed, anim.dict, anim.anim, 8.0, 8.0, -1, anim.flags or 0, 0, false, false, false)
    end
    
    -- Criar prop
    if location.prop then
        createProp(location.prop, GetEntityCoords(playerPed))
    end
    
    -- Iniciar progress bar
    QBCore.Functions.Progressbar("wash_money", "Lavando R$ " .. amount, Config.WashTime, false, true, {
        disableMovement = true,
        disableCarMovement = true,
        disableMouse = false,
        disableCombat = true,
    }, {}, {}, {}, function() -- Done
        -- Limpar animação e prop
        clearAnimation()
        
        Debug("Progress bar concluído, chamando servidor")
        
        -- Chamar servidor para processar lavagem
        QBCore.Functions.TriggerCallback('qb-laundry:server:tryWash', function(success, msg)
            if success then
                Debug("Lavagem bem-sucedida: " .. msg)
                
                -- Efeito visual de sucesso
                playSound("ROBBERY_MONEY_TOTAL", "HUD_FRONTEND_CUSTOM_SOUNDSET")
                
                -- Partículas de dinheiro
                local playerCoords = GetEntityCoords(playerPed)
                RequestNamedPtfxAsset("scr_xs_celebration")
                while not HasNamedPtfxAssetLoaded("scr_xs_celebration") do
                    Wait(10)
                end
                UseParticleFxAssetNextCall("scr_xs_celebration")
                StartParticleFxNonLoopedAtCoord("scr_xs_money_rain", playerCoords.x, playerCoords.y, playerCoords.z + 1.0, 0.0, 0.0, 0.0, 1.0, false, false, false)
                
                QBCore.Functions.Notify(msg, "success", 5000)
            else
                Debug("Lavagem falhou: " .. msg)
                playSound("ERROR", "HUD_FRONTEND_DEFAULT_SOUNDSET")
                QBCore.Functions.Notify(msg, "error", 5000)
            end
            IsBusy = false
        end, amount)
    end, function() -- Cancel
        -- Limpar animação e prop
        clearAnimation()
        
        Debug("Lavagem cancelada pelo usuário")
        playSound("ERROR", "HUD_FRONTEND_DEFAULT_SOUNDSET")
        QBCore.Functions.Notify("Lavagem cancelada.", "error", 3000)
        IsBusy = false
    end)
end)

-- Comando para abrir o painel administrativo
RegisterCommand(Config.AdminPanel.command, function()
    local playerJob = QBCore.Functions.GetPlayerData().job.name
    
    if Config.AdminPanel.requireJob and not Config.Groups[playerJob] then
        QBCore.Functions.Notify("Você não tem permissão para acessar o painel administrativo.", "error", 5000)
        return
    end
    
    -- Abrir o painel administrativo
    isPanelOpen = true
    SetNuiFocus(true, true)
    SendNUIMessage({
        action = "openPanel",
        job = playerJob
    })
    
    -- Desativar controles do jogador
    DisableControlActions()
end)

-- Função para desativar controles do jogador
function DisableControlActions()
    CreateThread(function()
        while isPanelOpen do
            DisableAllControlActions(0)
            EnableControlAction(0, 249, true) -- N key for PTT
            EnableControlAction(0, 1, true) -- Mouse look
            EnableControlAction(0, 2, true) -- Mouse move
            Wait(0)
        end
    end)
end

RegisterNUICallback('closePanel', function(data, cb)
    isPanelOpen = false
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
    SetCursorLocation(0.5, 0.5)
    cb({})
end)

-- Callback para buscar dados de lavagem
RegisterNUICallback('fetchLaundryData', function(data, cb)
    QBCore.Functions.TriggerCallback('qb-laundry:server:getLaundryData', function(result)
        cb(result)
    end, data.job)
end)

-- Atualizar marcadores quando o jogador mudar de job
RegisterNetEvent('QBCore:Client:OnJobUpdate', function(job)
    Debug("Job atualizado para: " .. job.name)
    -- Os marcadores são verificados dinamicamente, não precisa recriar
end)

-- Inicializar script
RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function()
    Debug("Jogador carregado, inicializando script")
    createMarkers()
end)

-- Criar marcadores ao iniciar o recurso
AddEventHandler('onResourceStart', function(resourceName)
    if GetCurrentResourceName() == resourceName then
        Debug("Recurso iniciado: " .. resourceName)
        Wait(1000) -- Esperar um pouco para garantir que QBCore esteja pronto
        createMarkers()
    end
end)

-- Fechar o painel quando o recurso for parado
AddEventHandler('onResourceStop', function(resourceName)
    if GetCurrentResourceName() == resourceName and isPanelOpen then
        isPanelOpen = false
        SetNuiFocus(false, false)
    end
end)

-- Limpar recursos ao parar o script
AddEventHandler('onResourceStop', function(resourceName) 
    if GetCurrentResourceName() == resourceName then
        Debug("Recurso parado: " .. resourceName)
        clearAnimation()
        cleanupObjects()
    end
end)

-- Adicionar suporte para tecla ESC
CreateThread(function()
    while true do
        Wait(0)
        if isPanelOpen and IsControlJustReleased(0, 200) then -- 200 é o código da tecla ESC
            isPanelOpen = false
            SetNuiFocus(false, false)
            SendNUIMessage({
                action = "closePanel"
            })
        end
    end
end)
