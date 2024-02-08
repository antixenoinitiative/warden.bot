const { botIdent, fileNameBotMatch } = require('../../../functions');
let wiki = null
try { console.log(`TRYING: ${botIdent().activeBot.botName}`); wiki = require(`../../../${botIdent().activeBot.botName}/graphql/index`); }
catch (e) { console.log(`TRYING2: ${fileNameBotMatch(e)}`); wiki = require(`../../../${fileNameBotMatch(e)}/graphql/index`) }
const Discord = require("discord.js");

module.exports = {
	data: new Discord.SlashCommandBuilder()
	.setName('wiki')
	.setDescription('Search the AXI Wiki')
	.addStringOption(option => option.setName('term')
		.setDescription('Search terms')
		.setRequired(true)),
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    permissions: 0,
	execute(interaction) {
		let searchTerm = interaction.options.data.find(arg => arg.name === 'term').value
		try {
			wiki.search(searchTerm).then((res) => {
				const returnEmbed = new Discord.EmbedBuilder()
				.setColor('#FF7100')
				.setTitle("**Wiki Search**")
				.setDescription(`Found **${res.length}** search results for "${searchTerm}"`)
				for (let i = 0; i < res.length; i++) {
				returnEmbed.addFields({ name: res[i].title, value: `https://wiki.antixenoinitiative.com/en/${res[i].path}`})
				}
				interaction.reply({ embeds: [returnEmbed.setTimestamp()] })
			})
		} catch (err) {
			console.error(err);
			interaction.reply({ content: "Something went wrong, please you entered a correct term" })
		}
	},
};
