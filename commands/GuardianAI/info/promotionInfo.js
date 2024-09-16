const Discord = require("discord.js");
const { botIdent, eventTimeCreate, hasSpecifiedRole, botLog } = require('../../../functions')

const bos = require(`../../../${botIdent().activeBot.botName}/bookofsentinel/bos.json`)
const config = require('../../../config.json')
const database = require(`../../../${botIdent().activeBot.botName}/db/database`)


module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('promotion') 
        .setDescription('Check out what promotion information is all about.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('information')
                .setDescription('Review the XSF Site')
        )
        // .addSubcommand(subcommand =>
        //     subcommand
        //         .setName('names')
        //         .setDescription('Review by Name(s).')
        //         .addStringOption(option =>
        //             option.setName('names')
        //                 .setDescription('Give this OPORD a Name.')
        //                 .setRequired(true)
        //         )
        // )
    ,
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true })
        if (interaction.options.getSubcommand() === 'information') {
            returnEmbed = new Discord.EmbedBuilder()
                    .setTitle('Generic Promotion Information')
                    .setAuthor({ name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                    .setThumbnail(botIdent().activeBot.icon)
                    .setColor('#87FF2A') //87FF2A
                    .setDescription(`# Rank Requirements\r- Experience\n- Promotion Challenge\n- AXI Rank\n- Knowledge Proficiencies\n- Leadership Potential`)
                    .addFields(
                        { name: "Generic Promotion Information", value: "https://xenostrikeforce.com/?page_id=1274", inline: true }
                    )
            await interaction.editReply({ embeds: [returnEmbed] })
        }
    }
}