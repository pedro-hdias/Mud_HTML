"""
Fixtures para testes do interpretador e motor de sons.
"""

# ──────────────────────────────────────────────
# Snippets de send_text
# ──────────────────────────────────────────────

# Chamada simples de PlayGlobalSound
SEND_PLAY_GLOBAL = 'PlayGlobalSound("General/Misc/Test.ogg")'

# PlayGlobalSound com variável de captura
SEND_PLAY_GLOBAL_WITH_CAPTURE = 'PlayGlobalSound("General/Misc/%1.ogg")'

# PlayCombatSound básico
SEND_PLAY_COMBAT = 'PlayCombatSound("Combat/Test.ogg")'

# StopSound por ID
SEND_STOP_SOUND = 'StopSound("s1")'

# Note com texto simples
SEND_NOTE_SIMPLE = 'Note("Olá mundo")'

# Note com captura %0
SEND_NOTE_WITH_CAPTURE = 'Note("Você viu: %0")'

# DoAfterSpecial com delay
SEND_DO_AFTER_SPECIAL = 'DoAfterSpecial(1.5, "PlayGlobalSound(\\"General/Misc/Test.ogg\\")")'

# Bloco if/end básico
SEND_IF_BLOCK = '''\
if settings.SomSociais == 1 then
  PlayGlobalSound("General/Socials/Test.ogg")
end'''

# Bloco if/elseif/else/end
SEND_IF_ELSEIF_ELSE = '''\
if %1 == "ataque" then
  PlayCombatSound("Combat/Hit.ogg")
elseif %1 == "defesa" then
  PlayCombatSound("Combat/Block.ogg")
else
  PlayGlobalSound("General/Misc/Test.ogg")
end'''

# Bloco for básico
SEND_FOR_BLOCK = '''\
for i = 1, 3 do
  PlayGlobalSound("General/Misc/Test.ogg")
end'''

# Bloco if aninhado
SEND_NESTED_IF = '''\
if settings.Habilitado == 1 then
  if settings.Volume == 1 then
    PlayGlobalSound("General/Misc/Test.ogg")
  end
end'''

# ──────────────────────────────────────────────
# Capturas de exemplo (simulam grupos de regex)
# ──────────────────────────────────────────────

# Captura básica: match completo + grupos
CAPTURES_BASIC = ["linha completa do MUD", "guerreiro", "ataque"]

# Captura mínima (só match completo)
CAPTURES_MINIMAL = ["linha completa do MUD"]

# ──────────────────────────────────────────────
# Linhas de MUD de exemplo
# ──────────────────────────────────────────────

MUD_LINE_COMBAT = "O guerreiro ataca você com uma espada!"
MUD_LINE_SOCIAL = "Pedro ri muito."
MUD_LINE_CHANNEL = "[OOC] Alguém diz: Olá!"
MUD_LINE_EMPTY = ""
MUD_LINE_WHITESPACE = "   "
MUD_LINE_ROOM = "Você está na Cidade de Aldor."
