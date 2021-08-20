<p align="center">
<img src="https://user-images.githubusercontent.com/85346345/128631152-1b2fb9d3-b5cf-4451-a287-a6a7124e1818.png" width="250">
</p>

# Warden
[![ESLint Scan](https://github.com/antixenoinitiative/warden.bot/actions/workflows/eslint.yml/badge.svg)](https://github.com/antixenoinitiative/warden.bot/actions/workflows/eslint.yml)
[![Security Scan](https://github.com/antixenoinitiative/warden.bot/actions/workflows/njsscan-analysis.yml/badge.svg)](https://github.com/antixenoinitiative/warden.bot/actions/workflows/njsscan-analysis.yml)

Warden is a discord bot for the Anti-Xeno Initiative Discord Server.

Join the AXI Discord here: https://discord.gg/bqmDxdm

[![AXI Discord](https://discord.com/api/guilds/380246809076826112/embed.png?style=banner3)](https://discord.gg/bqmDxdm)

## Development

1. Clone the repository to your system
2. [Create a Discord Server for Testing](https://www.howtogeek.com/318890/how-to-set-up-your-own-discord-chat-server/#:~:text=To%20create%20your%20own%20server,a%20Server%E2%80%9D%20on%20the%20left.)
3. [Create a Discord Bot and Invite it to your Test Server](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token) (Make sure it has read/write permissions in your text channels)
4. Run the SETUP.ps1 file in Powershell (Run as Admin if you have any issues)
5. Follow the prompts and enter the Bot TOKEN.
6. Start the bot using `npm start` in command line or terminal.

## Useful Links
https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot
https://medium.com/analytics-vidhya/setting-up-google-cloud-vision-api-with-node-js-db29d1b6fbe2

## Creating a new command
To create a new command, make a new .js file in one of the subfolders, and copy the necessary module.exports content into it. ducc.js is a great example command.

Note: Commands will ONLY be loaded if they are in a subfolder. Any command file not in a subfolder will cause the command handler to fail.
