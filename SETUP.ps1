Write-Host "Running DEV Setup for Warden.Bot..."

# Creating .ENV File
$Token = Read-Host -Prompt 'Enter you Discord Bot Token'
Set-Content .\.env "TOKEN=$Token"

# Install Dependencies
npm i

Write-Host "DEV Setup Complete!, try running the bot with 'npm start' in terminal"