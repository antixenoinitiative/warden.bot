Write-Host "-Running DEV Setup for this Discord bot--"
Write-Host "-If you are not ready for the following prompts, you may fill out the first question and for the remaining, you may enter a single character
to keep going through the menu if you wish to make changes later in the config.json file. Review the applicable .env file and config.json afterwards."
$botConfigs = @()

function botInstantiate {
    $botInfo = [ordered]@{
        "BOTNAME" = ""
        "HOSTNAME"= ""
        "COMMUNITYNAME" = ""
        "TOKEN" = ""
        "CLIENTID" = ""
        "GUILDID" = ""
        "LOGCHANNEL" = ""
        "EVENTCHANNELID" = ""
        "STAFFCHANNELID" = ""
        "remark1" = "# Defence Targets Embed (optional)"
        "CHANNELID" = ""
        "MESSAGEID" = ""
        "remark2" = "# Google Auth Token (optional)"
        "GOOGLEKEYID" = ""
        "GOOGLEKEY" = ""
        "remark3" = "# Database & API (optional)"
        "DATABASE_URL_WATCH" = ""
        "DATABASE_URL_WARDEN" = ""
        "INARAKEY" = ""
        "GRAPHKEY" = ""
    }
    # Collect bot information
    $botInfo.BOTNAME = Read-Host -Prompt 'Enter the Name of the Bot'
    $botInfo.HOSTNAME = Read-Host -Prompt 'Enter the Hostname of the Bot (Ignore if you dont know, it will scream at you later)'
    $botInfo.COMMUNITYNAME = Read-Host -Prompt 'Enter your Community Name'
    $botInfo.TOKEN = Read-Host -Prompt 'Enter your Discord Bot Token'
    $botInfo.CLIENTID = Read-Host -Prompt 'Enter your Discord Bot Client ID'
    $botInfo.GUILDID = Read-Host -Prompt 'Enter your Test Server ID'
    $botInfo.LOGCHANNEL = Read-Host -Prompt 'Enter your Log Channel ID'
    $botInfo.EVENTCHANNELID = ''
    $botInfo.STAFFCHANNELID = ''
    
    $envFile = ".\$($botInfo.BOTNAME).env"  # File name for .env file

    # Write bot information to .env file
    Set-Content -Path $envFile -Value "# Bot Configuration File"
    foreach ($key in $botInfo.Keys) {
        Add-Content -Path $envFile -Value "$($key.ToUpper())=$($botInfo[$key])"
    }

    # Add the bot information to the botConfigs array
    $global:botConfigs += @{
        "active" = $false
        "icon" = ""
        "botName" = $botInfo.BOTNAME
        "communityName" = $botInfo.COMMUNITYNAME
        "env" = "$($botInfo.BOTNAME).env"
        "useGlobalCommands" = @()
        "ignoreCommands" = @()
    }
    
    $continueBots = Read-host -Prompt 'Would you like to setup another Bot? (Y/N)'
    return $continueBots
}

$continueBots = "Y"

while ($continueBots -eq "Y") {
    $continueBots = botInstantiate
}
if ($global:botConfigs.Count -gt 0) {
    Write-Host "-Bot configurations are collected for all bots. "

    $jsonFilePath = ".\config.json"
    # Read the content of the config file
    $configContent = Get-Content -Path $jsonFilePath | ConvertFrom-Json

    # Check if 'botTypes' property exists, if not, add it
    if (-not $configContent.PSObject.Properties.Name.Contains('botTypes')) {
        $configContent | Add-Member -MemberType NoteProperty -Name 'botTypes' -Value $global:botConfigs
        $configContent | ConvertTo-Json | Set-Content -Path $jsonFilePath -Force
        # Loop through botTypes and create folders
        foreach ($bot in $configContent.botTypes) {
            $folderName = $bot.BOTNAME
            $commandsFolderPath = ".\commands"
            $dutyFolderPath = ".\$($bot.BOTNAME)"
            $folderPath = Join-Path -Path $commandsFolderPath -ChildPath $folderName
            
            # Check if the commands folder doesn't exist, then create it
            if (-not (Test-Path -Path $folderPath)) {
                New-Item -Path $folderPath -ItemType Directory -Force
                Write-Host "Folder '$folderName' created successfully."
            } else {
                Write-Host "Folder '$folderName' already exists."
            }
            # Check if the duty folder doesn't exist, then create it
            if (-not (Test-Path -Path $dutyFolderPath)) {
                New-Item -Path $dutyFolderPath -ItemType Directory -Force
                Write-Host "Folder '$folderName' created successfully."
            } else {
                Write-Host "Folder '$folderName' already exists."
            }
        }
        Write-Host " REVIEW config.json after this "
        Write-Host " REVIEW config.json after this "
        Write-Host ""
        Write-Host " Find and Set the 'ICON' to the image URL of the logo you want to see in the embeds. "
        Write-Host ""
        Write-Host " REVIEW config.json after this "
        Write-Host " REVIEW config.json after this "
        # Install Dependencies
        npm i
    } 
    else {
        Write-Host "'botTypes' property already exists. Exiting without configuration"
    }
} else {
    Write-Host "No bots were configured."
}

