const fs = require('fs');
const { SlashCommandBuilder } = require('@discordjs/builders');
//https://discordjs.guide/command-handling/adding-features.html#reloading-commands

module.exports = {
	data: new SlashCommandBuilder()
    .setName(`reload`)
    .setDescription(`Reloads a command`)
	.addStringOption(option => option.setName('command')
		.setDescription('Name of the command to reload')
		.setRequired(true)),
	permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
	args: true,
	usage: '<commandName>',
	async execute(message, args) {
		const commandName = args[0].value.toLowerCase();
		console.log(commandName)
		const command = message.client.commands.get(commandName)
			// || message.client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

		if (!command) {
			return message.reply({ content: `There is no command with name or alias \`${commandName}\`` });
		}

		const commandFolders = fs.readdirSync('./commands');
		const folderName = commandFolders.find(folder => fs.readdirSync(`./commands/${folder}`).includes(`${command.data.name}.js`));

		// delete require.cache[require.resolve(`./${command.name}.js`)];
		delete require.cache[require.resolve(`../${folderName}/${command.data.name}.js`)];

		try {
			const newCommand = require(`../${folderName}/${command.data.name}.js`);
			message.client.commands.set(newCommand.data.name, newCommand);
			message.reply({ content: `Command \`${newCommand.data.name}\` was reloaded!` });
		} catch (err) {
			console.error(err);
			message.reply({ content: `There was an error while reloading a command \`${command.name}\`:\n\`${err.message}\`` });
		}
	},
};
