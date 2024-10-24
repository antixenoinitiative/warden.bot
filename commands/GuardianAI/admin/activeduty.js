const Discord = require("discord.js");
const { botIdent, eventTimeCreate, hasSpecifiedRole,botLog } = require('../../../functions')
const config = require('../../../config.json')
const database = require(`../../../${botIdent().activeBot.botName}/db/database`)


module.exports = {
    embedSubmit: async function() {

    },
    data: new Discord.SlashCommandBuilder()
        .setName('active_duty')
        .setDescription('Enter a message for mentioning active duty ')
        .addChannelOption(option => 
            option
                .setName('channel')
                .setDescription('Pick the channel')
                .setRequired(true)
        )
    ,
    permissions: 0,
    async execute(interaction) {

        
        const approvalRanks = config[botIdent().activeBot.botName].general_stuff.active_duty_mention_authorization
        if (!approvalRanks) {
            console.log("[CAUTION]".bgYellow, "general_stuff.active_duty_mention_authorization ranks dont match. Defaulting to test server config. Check config.json")
            approvalRanks = config[botIdent().activeBot.botName].general_stuff.testServer.active_duty_mention_authorization
        }
        const approvalRanks_string = approvalRanks.map(rank => rank.rank_name).join(', ').replace(/,([^,]*)$/, ', or$1');
        const member = interaction.member;
        if (hasSpecifiedRole(member, approvalRanks) == 0) {
            botLog(interaction.guild,new Discord.EmbedBuilder()
            .setDescription(`<@${interaction.user.id}> does not have access. Requires ${approvalRanks_string}`)
            .setTitle(`/activeduty`)
            ,2
            ,'info'
            )
            await interaction.reply({ content: `You do not have the roles to perform this operation.`, ephemeral: true });
            return
        }
        
        
        

    }
}