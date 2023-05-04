const Discord = require("discord.js");
module.exports = {
	data: new Discord.SlashCommandBuilder()
	.setName('coinflip')
	.setDescription('Flips a Coin'),
	permissions: 0,
	execute(interaction) {
    const coins = ["Heads", "Tails"];
    let result = Math.floor(Math.random() * coins.length);
        interaction.reply({ content: result})
	},
};
