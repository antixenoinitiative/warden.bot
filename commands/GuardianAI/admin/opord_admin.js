const Discord = require("discord.js");
const { botIdent, eventTimeCreate, hasSpecifiedRole,botLog } = require('../../../functions')
const config = require('../../../config.json')
const database = require('../../../GuardianAI/db/database')

// console.log(eventTimeCreate("05/Dec",'0000'))

// let voiceChans = []
// function fillVoiceChan(interaction) {
//     const guild = interaction.guild;
//     const voiceChansSet = new Set();
//     if (guild) {
//         const voiceChannels = guild.channels.cache.filter(chan => chan.type === 2);
//         voiceChannels.forEach(channel => {
//             voiceChansSet.add({ name: channel.name, id: channel.id });
//         });
//     }
//     voiceChansSet.add({ name: 'Mumble', id: 0 });
//     voiceChans = Array.from(voiceChansSet);
// }

module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('opord_admin')
        .setDescription('Admin Operation Orders')
        .addSubcommand(subcommand =>
            subcommand
                .setName('embed_reload')
                .setDescription('Select OP Order Number to validate participants form DB to Embed.')
                .addNumberOption(option =>
                    option.setName('opord_number')
                        .setDescription('Choose the number')
                        .setRequired(true)
                )
        )
    ,
    async autocomplete(interaction) {
        // fillVoiceChan(interaction)
        // const focusedOption = interaction.options.getFocused(true);
        // let choices;
        // if (focusedOption.name === 'voice_channel') {
        //     choices = voiceChans.map(i => i.name)
        // }
        // const filtered = choices.filter(choice => choice.startsWith(focusedOption.value));
        // await interaction.respond(
        //     filtered.map(choice => ({ name: choice, value: choice })),
        // );
    },
    permissions: 0,
    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'embed_reload') {
            await interaction.deferReply({ ephemeral: true });
            const op_participants = interaction.options._hoistedOptions
            const approvalRanks = config.GuardianAI.operation_order.opord_admin
            const approvalRanks_string = approvalRanks.map(rank => rank.rank_name).join(', ').replace(/,([^,]*)$/, ', or$1');
            const member = interaction.member;
            if (!hasSpecifiedRole(member, approvalRanks)) {
                botLog(interaction.guild,new Discord.EmbedBuilder()
                .setDescription(`${interaction.member.nickname} does not have access. Requires ${approvalRanks_string}`)
                .setTitle(`/opord_admin ${interaction.options.getSubcommand()}`)
                ,2
                )
                await interaction.editReply({ content: `You do not have the roles to perform this operation.`, ephemeral: true });
                return
            }
            // Get opord channels
            let channel_await = null;
            let channel_approved = null;
            channel_await = interaction.guild.channels.cache.get(config[botIdent().activeBot.botName].operation_order.opord_channel_await); //logchannel or other.
            channel_approved = interaction.guild.channels.cache.get(config[botIdent().activeBot.botName].operation_order.opord_channel_approved); //opord channel where approved op orders appear
            if (!channel_await || !channel_approved) {
                console.log("[CAUTION]".bgYellow, "channel_await or channel_approved Channel IDs dont match. Check config. Defaulting to Test Server configuration in the .env file.")
                channel_await = interaction.guild.channels.cache.get(process.env.TESTSERVER_OPORD_AWAIT); //GuardianAI.env
                channel_approved = interaction.guild.channels.cache.get(process.env.TESTSERVER_OPORD_APPROVED); //GuardianAI.env
            }
            
            const opord_number = op_participants.find(i => i.name === 'opord_number').value
            // Check database for correctly selected opord_number
            const mysql_opord_values = [opord_number]
            const mysql_opord_sql = 'SELECT opord_number,approved_message_id,creator,participant_lock,participant_uniform,participant_players FROM `opord` WHERE opord_number = (?)';
            const mysql_opord_response = await database.query(mysql_opord_sql, mysql_opord_values)
            
            if (mysql_opord_response.length > 0 && mysql_opord_response[0].participant_lock) {
                await interaction.editReply( { content: 'Participant Lock is enabled for this, contact admin ' , ephemeral: true });
                return
            } 
            if (mysql_opord_response.length > 0 && 
                (mysql_opord_response[0].participant_uniform != 0 && 
                mysql_opord_response[0].participant_players != 0)
                ) {
                let participant_uniform_jsonArrayString = `[${mysql_opord_response[0].participant_uniform}]`
                let participant_players_jsonArrayString = `[${mysql_opord_response[0].participant_players}]`
                let participant_uniform = Array.from(JSON.parse(participant_uniform_jsonArrayString))
                let participant_players = Array.from(JSON.parse(participant_players_jsonArrayString))
                participant_uniform = participant_uniform.map(m=>m.userId)
                participant_players = participant_players.map(m=>m.userId)
                participant_uniform_mentionable = []
                participant_players_mentionable = []
                participant_uniform.forEach(i => {
                    if (i) { participant_uniform_mentionable.push(`<@${i}>`) }
                    else { participant_uniform_mentionable.push('None') }
                })
                participant_players.forEach(i => {
                    if (i) { participant_players_mentionable.push(`<@${i}>`) }
                    else { participant_players_mentionable.push('None') }
                })
                if (participant_uniform_mentionable.length > 1) { participant_uniform_mentionable = participant_uniform_mentionable.join(","); participant_uniform_mentionable = participant_uniform_mentionable.replace(/,/g,' '); }
                if (participant_players_mentionable.length > 1) { participant_players_mentionable = participant_players_mentionable.join(","); participant_players_mentionable = participant_players_mentionable.replace(/,/g,' '); }
                try {
                    const guild = interaction.guild;
                    const creator = guild.members.cache.get(mysql_opord_response[0].creator.id)
                    const lastMessage = await channel_approved.messages.fetch(mysql_opord_response[0].approved_message_id)
                    const receivedEmbed = lastMessage.embeds[0];
                    const oldEmbedSchema = {
                        title: receivedEmbed.title,
                        author: { name: creator.nickname, iconURL: creator.user.displayAvatarURL({ dynamic: true }) },
                        description: receivedEmbed.description,
                        fields: receivedEmbed.fields,
                        color: receivedEmbed.color
                    }
                    const newEmbed = new Discord.EmbedBuilder()
                        .setTitle(oldEmbedSchema.title)
                        .setDescription(oldEmbedSchema.description)
                        .setColor(oldEmbedSchema.color)
                        .setAuthor(oldEmbedSchema.author)
                        .setThumbnail(botIdent().activeBot.icon)

                    oldEmbedSchema.fields.forEach((field, index) => {
                        if (index == 12) {
                            newEmbed.addFields({ name: "Earned Experience Credit:", value: `${participant_uniform_mentionable}`, inline: field.inline })
                        }
                        if (index == 13) {
                            newEmbed.addFields({ name: "Participated:", value: `${participant_players_mentionable}`, inline: field.inline })
                        }
                        if (index > 11) { return }
                        if (index == 0) {
                            newEmbed.addFields({ name: "Operation Order #", value: `${opord_number}`, inline: field.inline })
                        }
                        if (index > 0) {
                            newEmbed.addFields({ name: field.name, value: field.value, inline: field.inline })
                        }
                    })
                    if (oldEmbedSchema.fields.length === 11) {
                        newEmbed.addFields(
                            { name: "Experience Credit:", value: "If you feel an error in experience credit, please contact General Staff", inline: false },
                            { name: "Earned Experience Credit:", value: participant_uniform_mentionable, inline: false },
                            { name: "Participated:", value: participant_players_mentionable, inline: false }
                        )
                    }
                    const editedEmbed = Discord.EmbedBuilder.from(newEmbed)
                    await lastMessage.edit({ embeds: [editedEmbed] })
                    await interaction.editReply({ content: `Successfully added Op Order #:${opord_number} participants to Embed\nUniformed Participant(s): ${participant_uniform_mentionable} \nOut of Uniform Participant(s): ${participant_players_mentionable}`, ephemeral: true })
                }
                catch (e) {
                    console.log(e)
                }
            }
            else {
                await interaction.editReply({ content: `Operation Order Number: ${opord_number} \nUniformed Participant(s): 0 Found \nOut of Uniform Participant(s): 0 Found`, ephemeral: true })
            }
            botLog(interaction.guild,new Discord.EmbedBuilder()
            .setDescription(`${interaction.member.nickname} Used this command on Op Order #**${opord_number}**`)
            .setTitle(`/opord_admin ${interaction.options.getSubcommand()}`)
            ,0
            )
        }
    }
};