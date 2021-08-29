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
	permlvl: 1,
	async execute(interaction) {
		const commandName = interaction.options.data.find(arg => arg.name === 'command').value.toLowerCase();
		console.log(commandName)
		const command = interaction.client.commands.get(commandName)
			// || interaction.client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

		if (!command) {
			return interaction.reply({ content: `There is no command with name or alias \`${commandName}\`` });
		}

		const commandFolders = fs.readdirSync('./commands');
		const folderName = commandFolders.find(folder => fs.readdirSync(`./commands/${folder}`).includes(`${command.data.name}.js`));

		// delete require.cache[require.resolve(`./${command.name}.js`)];
		delete require.cache[require.resolve(`../${folderName}/${command.data.name}.js`)];

		try {
			const newCommand = require(`../${folderName}/${command.data.name}.js`);
			interaction.client.commands.set(newCommand.data.name, newCommand);
			interaction.reply({ content: `Command \`${newCommand.data.name}\` was reloaded!` });
		} catch (err) {
			console.error(err);
			interaction.reply({ content: `There was an error while reloading a command \`${command.name}\`:\n\`${err.message}\`` });
		}
	},
};
