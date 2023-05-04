const translate = require('@iamtraction/google-translate');
const {Client, Message, MessageEmbed } = require("discord.js");
const Discord = require("discord.js");

module.exports = {
	data: new Discord.SlashCommandBuilder()
	.setName('translate')
	.setDescription('Translates a Text into a specified language')
    .addStringOption(option => option.setName('language')
					.setDescription("Language Code")
					.setRequired(true))
    .addStringOption(option => option.setName('text')
		.setDescription("The text to be translated")
		.setRequired(true)),
	async execute(interaction) {
    const query = interaction.options.data.find(arg => arg.name === 'text').value
    if(!query) return message.reply('Please specify a text to be translated');
    const translated = await translate(query, { to: interaction.options.data.find(arg => arg.name === 'language').value});
    interaction.reply({ content: translated.text})
	},
};

