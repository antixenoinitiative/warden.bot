const translate = require('@iamtraction/google-translate');
const {Client, Message, MessageEmbed } = require("discord.js");

module.exports = {
	data: new Discord.SlashCommandBuilder()
	.setName('translate')
	.setDescription('Translates a Text into a specified language')
    .addStringOption(option => option.setName('language')
    .addStringOption(option => option.setName('text')
		.setDescription('Type Something Here!')
		.setRequired(true)),
	permissions: 0,
	execute(interaction) {
    const query = text
    if(!query) return message.reply('Please specify a text to be translated');
    const translated = await translate(query, { to: args[0]});
    message.channel.send(translated.text);
        interaction.reply({ content: response})
	},
};
