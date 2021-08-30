Write-Host "Running DEV Setup for Warden.Bot..."

# Creating .ENV File
$Token = Read-Host -Prompt 'Enter your Discord Bot Token'
$Client = Read-Host -Prompt 'Enter your Discord Bot Client ID'
$Guild = Read-Host -Prompt 'Enter your Test Server ID'
$LogChannel = Read-Host -Prompt 'Enter your Log Channel ID'
Set-Content .\.env "# Discord Bot Token (required)"
Add-Content .\.env "TOKEN=$Token"
Add-Content .\.env ""
Add-Content .\.env "# General Addtings (recommended)"
Add-Content .\.env "GUILDID=$Guild"
Add-Content .\.env "CLIENTID=$Client"
Add-Content .\.env "LOGCHANNEL=$LogChannel"
Add-Content .\.env "EVENTCHANNELID="
Add-Content .\.env ""
Add-Content .\.env "# Defence Targets Embed (optional)"
Add-Content .\.env "CHANNELID="
Add-Content .\.env "MESSAGEID="
Add-Content .\.env ""
Add-Content .\.env "# Google Auth Token (optional)"
Add-Content .\.env "GOOGLEKEYID="
Add-Content .\.env "GOOGLEKEY="
Add-Content .\.env ""
Add-Content .\.env "# Database & API (optional)"
Add-Content .\.env "DATABASE_URL="
Add-Content .\.env "INARAKEY="
Add-Content .\.env "GRAPHKEY="
# Install Dependencies
npm i

Write-Host "DEV Setup Complete!, try running the bot with 'npm start' in terminal"