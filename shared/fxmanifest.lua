fx_version 'cerulean'
game 'gta5'

author 'Thug (Reescrito por v0)'
description 'Sistema de lavagem de dinheiro para QBCore – 100% Funcional'
version '3.0.0'

shared_script 'config.lua'

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'main.lua'
}

client_script 'client_main.lua'

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js'
}

dependencies {
    'qb-core',
    'qb-menu',
    'oxmysql'
}

lua54 'yes'
