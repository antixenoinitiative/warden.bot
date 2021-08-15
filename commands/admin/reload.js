const fs = require('fs');
//https://discordjs.guide/command-handling/adding-features.html#reloading-commands
module.exports = {
	name: 'reload',
	description: 'Reloads a command',
	permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
	args: true,
  	usage: '<commandName>',
  	execute(message, args) {
		const commandName = args[0].toLowerCase();
		const command = message.client.commands.get(commandName)
			// || message.client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

		if (!command) {
			return message.channel.send({ content: `There is no command with name or alias \`${commandName}\`, ${message.author}!` });
		}

		const commandFolders = fs.readdirSync('./commands');
		const folderName = commandFolders.find(folder => fs.readdirSync(`./commands/${folder}`).includes(`${command.name}.js`));

		// delete require.cache[require.resolve(`./${command.name}.js`)];
		delete require.cache[require.resolve(`../${folderName}/${command.name}.js`)];

		try {
			const newCommand = require(`../${folderName}/${command.name}.js`);
			message.client.commands.set(newCommand.name, newCommand);
			message.channel.send({ content: `Command \`${newCommand.name}\` was reloaded!` });
		} catch (error) {
			console.error(error);
			message.channel.send({ content: `There was an error while reloading a command \`${command.name}\`:\n\`${error.message}\`` });
		}
	},
};
