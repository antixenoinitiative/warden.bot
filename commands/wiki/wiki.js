const wiki = require('.././../graphql/index');
const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
	.setName('wiki')
	.setDescription('Search the AXI Wiki')
	.addStringOption(option => option.setName('term')
		.setDescription('Serch terms')
		.setRequired(true)),
	permissions: 0,
	execute(interaction) {
		let searchTerm = interaction.options.data.find(arg => arg.name === 'term').value
		try {
			wiki.search(searchTerm).then((res) => {
				const returnEmbed = new Discord.MessageEmbed()
				.setColor('#FF7100')
				.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
				.setTitle("**Wiki Search**")
				.setDescription(`Found **${res.length}** search results for "${searchTerm}"`)
				for (let i = 0; i < res.length; i++) {
				returnEmbed.addField(res[i].title,`https://wiki.antixenoinitiative.com/en/${res[i].path}`)
				}
				interaction.reply({ embeds: [returnEmbed.setTimestamp()] })
			})
		} catch (err) {
			console.error(err);
			interaction.reply({ content: "Something went wrong, please you entered a correct term" })
		}
	},
};
