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
        // await interaction.deferReply({ ephemeral: true });
        let args = {}
        for (let key of interaction.options.data) {
            args[key.name] = key.value
		}
        async function modalStuff(i) {
            const fields = {
                title: new Discord.TextInputBuilder()
                    .setCustomId(`title`)
                    .setLabel(`Input a Title`)
                    .setStyle(Discord.TextInputStyle.Short)
                    .setRequired(true),
                    // .setPlaceholder(`Notification`),
                message: new Discord.TextInputBuilder()
                    .setCustomId(`message`)
                    .setLabel(`Enter your notification message:`)
                    .setStyle(Discord.TextInputStyle.Paragraph)
                    .setRequired(true)
                    // .setPlaceholder(`1200`)
            }
            const modal = new Discord.ModalBuilder()
                .setCustomId('myModal')
                .setTitle('Enter the Notification Inputs')
                .addComponents(
                    new Discord.ActionRowBuilder().addComponents(fields.title),
                    new Discord.ActionRowBuilder().addComponents(fields.message),
                )
            await i.showModal(modal);
            const submitted = await i.awaitModalSubmit({
                time: 300000,
            }).catch(error => {

                console.error(error)
                return null
            })

            if (submitted) {
                const [date,time] = submitted.fields.fields.map(i => i.value)
                return [submitted, title, message]

            }
        }
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
        modalStuff(interaction)
        const channelObj = await interaction.guild.channels.fetch(`${args.channel}`)
        const activeDutyId = "961719609944313878"
        await channelObj.send(`<@&${activeDutyId}>`)
        const embed = new Discord.EmbedBuilder()
            .setColor('#87FF2A') //bight green
                // .setColor('#f20505') //bight red 
                // .setColor('#f2ff00') //bight yellow
            // .setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
            .setThumbnail(botIdent().activeBot.icon)
            .setFooter({ text: `Notificiation from ${interaction.user.displayName}`, iconURL: interaction.user.displayAvatarURL({ dynamic: false })})
            // .setFooter({ text: 'Distress Calls', iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });
        
       
    
        await interaction.followUp({ content: `Message sent to ${channelObj.url}`, ephemeral: true });
        await channelObj.send({ embeds: [embed] })
    }
}