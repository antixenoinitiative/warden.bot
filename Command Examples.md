# Command Examples
How to write commands and the different ways to use them.

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
	permlvl: 0,
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
	permlvl: 0,
	execute(interaction) {
        // Command Code
        let response = interaction.options.data.find(arg => arg.name === 'myArgument').value // Get the option from the command usage

        interaction.reply({ content: response}) // Sends the option text back to the user as a reply.
	},
};
```
A good example of this type of command is `./commands/wiki/wiki.js` 

## **OLD Command File Format (Non-Slash Commands)**

This format is discontinued and all commands are in the process of being updated away from this format.

```js
module.exports = {
    name: "myCommand",
    description: "myCommandDescription",
    format: '"myArgument"',
    args: true,
    permlvl: 0,
    hidden: false,
    execute (message, args) {
		// Command Code
		let response = args[0] // Grab the first thing said after the command
		message.reply({ content: response }) // send it back to the user as a reply
    }
}
```

