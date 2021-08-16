<p align="center">
<img src="https://user-images.githubusercontent.com/85346345/128631152-1b2fb9d3-b5cf-4451-a287-a6a7124e1818.png" width="250">
</p>

# Warden

Warden is a discord bot for the Anti-Xeno Initiative Discord Server.

Join the AXI Discord here: https://discord.gg/bqmDxdm

## How to use for development (Discord Bot)

1. Download the repository and run `npm i`
2. Create a discord bot and paste the key into a .env file, TOKEN=DISCORD_BOT_TOKEN, LOGCHANNEL=<CHANNEL ID FOR LOGGING>
3. Register a google cloud vision account and download the JSON key. Name this key originalkey.JSON and place it in the repository, then switch the auth method in incursion.js
4. Use `npm start` to start Warden, and `Ctrl + C` to end it

## Useful Links
https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot
https://medium.com/analytics-vidhya/setting-up-google-cloud-vision-api-with-node-js-db29d1b6fbe2

## Creating a new command
To create a new command, make a new .js file in one of the subfolders, and copy the necessary module.exports content into it. ducc.js is a great example command.
Note: Commands will ONLY be loaded if they are in a subfolder. Any command file not in a subfolder will cause the command handler to fail.  
