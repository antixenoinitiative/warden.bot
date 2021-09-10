<p align="center">
<img src="https://user-images.githubusercontent.com/85346345/128631152-1b2fb9d3-b5cf-4451-a287-a6a7124e1818.png" width="250">
</p>

# Warden.bot
[![ESLint Scan](https://github.com/antixenoinitiative/warden.bot/actions/workflows/eslint.yml/badge.svg)](https://github.com/antixenoinitiative/warden.bot/actions/workflows/eslint.yml)
[![Security Scan](https://github.com/antixenoinitiative/warden.bot/actions/workflows/njsscan-analysis.yml/badge.svg)](https://github.com/antixenoinitiative/warden.bot/actions/workflows/njsscan-analysis.yml)

Warden is a discord bot for the Anti-Xeno Initiative Discord Server. Based on Discord.js warden is a combination of systems that culminate in a relatively advanced custom built discord bot for the needs of the AXI.

[![AXI Discord](https://discord.com/api/guilds/380246809076826112/embed.png?style=banner3)](https://discord.gg/bqmDxdm)

## Development  
Setting up a local copy of the bot for development.

1. Clone the repository to your system
2. Run `npm i` to install dependencies
3. [Create a Discord Server for Testing](https://www.howtogeek.com/318890/how-to-set-up-your-own-discord-chat-server/#:~:text=To%20create%20your%20own%20server,a%20Server%E2%80%9D%20on%20the%20left.)
4. [Create a Discord Bot and Invite it to your Test Server](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token) (Make sure it has read/write permissions in your text channels)
5. IMPORTANT: Make sure you give your bot the "bot" and "applications.commands" permissions in OAuth when inviting your bot. ![image](https://user-images.githubusercontent.com/85346345/132811570-2332bfdc-9365-4b11-afd2-051ee699083b.png)
6. Run the SETUP.ps1 file in Powershell (Run as Admin if you have any issues)
7. Follow the prompts and enter the Bot TOKEN.
8. Start the bot using `npm start` in command line or terminal.

The `SETUP.ps1` file will create a `.env` file in your root directory, if you need to make any changes, edit the variables in this file.

![image](https://user-images.githubusercontent.com/85346345/131250614-aaecd857-0069-4758-9171-9954c490e8f1.png)


## Useful Links
https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot
https://medium.com/analytics-vidhya/setting-up-google-cloud-vision-api-with-node-js-db29d1b6fbe2

# Creating Commands

To create a new command, make a new .js file in one of the subfolders, and copy the necessary module.exports content into it. ducc.js is a great example command.

**Note:** Commands will ONLY be loaded if they are in a subfolder. Any command file not in a subfolder will cause the command handler to fail.

## Command Folders
Commands are all stored in subfolders of the **"../commands"** folder, if they are not within a subfolder they will not be registered as a command and won't be detected by the command handler.

## Command Files
Each command is a seperate **.js** file setup as a module. Within the file are parameters that define what the command is, how it can be used and other details.

There are two types of commands that can be used with this bot `Slash Commands` and `Non-Slash Commands`. We prefer you try design commands as Slash commands as these are better supported and have better UI integration into Discord.

Within the file is an `execute(message, args) {}` or `execute(interaction) {}` function, this is where your code executes when the command is called by a user. The `message` and `args` or `interaction` variables are defined by the type of command you created.

Use the following as a boilerplate for your commands.

## **New Command File Format (Slash Commands)**

Command name and description are defined in the `data:` field, this feeds into discord to allow the slash command UI to make easy command browsing, here you can also specify special argument fields (more below).

```js
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
	.setName('myCommandName') // What the user types to call the command
	.setDescription('myCommandDescription'), // The Discord Description for the command
	permissions: 0,
	execute(interaction) {
        // Command Code
        interaction.reply({ content: "Hello World!"}) // Replies to the user "Hello World".
	},
};
```

You can set options for commands, this allows users to have extra inputs with each command. You can read more about this here: https://discordjs.guide/interactions/registering-slash-commands.html

Example with Slash Command Options:

```js
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
	.setName('myCommandName') // What the user types to call the command
	.setDescription('myCommandDescription')
    .addStringOption(option => option.setName('myArgument') // Create the option
		.setDescription('Type Something Here!')
		.setRequired(true)),
	permissions: 0,
	execute(interaction) {
        // Command Code
        let response = interaction.options.data.find(arg => arg.name === 'myArgument').value // Get the option from the command usage

        interaction.reply({ content: response}) // Sends the option text back to the user as a reply.
	},
};
```
A good example of this type of command is `./commands/wiki/wiki.js` or `./commands/math/mttot.js`

## **OLD Command File Format (Non-Slash Commands)**

This format is discontinued and all commands are in the process of being updated away from this format.

```js
module.exports = {
    name: "myCommand",
    description: "myCommandDescription",
    format: '"myArgument"',
    args: true,
    permissions: 0,
    hidden: false,
    execute (message, args) {
		// Command Code
		let response = args[0] // Grab the first thing said after the command
		message.reply({ content: response }) // send it back to the user as a reply
    }
}
```

