const Discord = require("discord.js");
const { botIdent, eventTimeCreate, hasSpecifiedRole } = require('../../../functions')
const objectives = require('./opord_values.json')
const config = require('../../../config.json')
const database = require('../../../GuardianAI/db/database')

// console.log(eventTimeCreate("05/Dec",'0000'))

let voiceChans = []
function fillVoiceChan(interaction) {
    const guild = interaction.guild;
    const voiceChansSet = new Set();

    if (guild) {
        const voiceChannels = guild.channels.cache.filter(chan => chan.type === 2);

        voiceChannels.forEach(channel => {
            voiceChansSet.add({ name: channel.name, id: channel.id });
        });
    }
    voiceChansSet.add({ name: 'Mumble', id: 0 });
    voiceChans = Array.from(voiceChansSet);
}

module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName('opord')
        .setDescription('Create an Operation Order')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create an OPORD')
                .addStringOption(option =>
                    option.setName('operation_name')
                        .setDescription('Give this OPORD a Name.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('mission_statement')
                        .setDescription('Give the reason for the Operation Order.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('date')
                        .setDescription('Enter the date: DD/MMM Example: 09/Jan')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('time')
                        .setDescription('Enter the 24hr Clock Time: Example 1300 or 0030')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('meetup_location')
                        .setDescription('Enter meetup location.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('carrier_parking')
                        .setDescription('Enter a carrier parking spot if applicable.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('prefered_build')
                        .setDescription('Enter a short URL of EDSY recommended build.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('voice_channel')
                        .setDescription('Enter the voice channel to host this event.')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option.setName('additional_instructions')
                        .setDescription('Enter additional instructions')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('information')
                .setDescription('Display information regarding the OPORD form.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('participants')
                .setDescription('Use the @ and name them.')
                .addNumberOption(option =>
                    option.setName('opord_number')
                        .setDescription('Choose the number')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('participant_uniform')
                        .setDescription('Add multiple players using @ symbol')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('participant_players')
                        .setDescription('Add multiple players using @ symbol')
                        .setRequired(true)
                )
        )
    ,
    async autocomplete(interaction) {
        fillVoiceChan(interaction)
        const focusedOption = interaction.options.getFocused(true);
        let choices;
        if (focusedOption.name === 'voice_channel') {
            choices = voiceChans.map(i => i.name)
        }
        const filtered = choices.filter(choice => choice.startsWith(focusedOption.value));
        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice })),
        );
    },
    permissions: 0,
    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'participants') {
            //Start
            await interaction.deferReply({ ephemeral: true });
            async function getUserIDsFromMention(entry, interaction) {
                if (!entry.includes("@")) {
                    await interaction.editReply({ content: `You did not use Mentionables: Example. "@player"`, ephemeral: true });
                    return -1
                }
                if ((entry == 'none' || entry == 'na' || entry == 'n/a')) {
                    return 0
                }
                //todo clean this function up, its so dirty...
                return new Promise(async (resolve, reject) => {
                    try {
                        const array = entry.split(" ");
                        const array_cleaned = array.map(str => str.match(/<@!?\d+>/)).filter(Boolean);
                        const memberObjects = await Promise.all(array_cleaned.map(async mention => {
                            const userId = mention[0].match(/\d+/)[0];
                            try {
                                let user = await interaction.guild.members.fetch(userId);
                                user.user['roles'] = user.roles.cache.map(r=>r.name)
                                return user;
                            } catch (error) {
                                console.error(`Error fetching user with ID ${userId}:`, error);
                                await interaction.editReply({ content: `Error fetching user with ID ${userId}` });
                                return null;
                            }
                        }));
                        
                        const guildMemberJSON = memberObjects.map(member => ({
                            nickname: member.nickname,
                            userId: member.user.id,
                            rank: cleanupRoles(member.user.roles)
                        }));
                        function cleanupRoles(roles) {
                            let matchingRanks = roles.filter(rank => config.GuardianAI.officer_ranks.some(officerRank => officerRank.rank_name === rank));
                            if (!matchingRanks.length) {
                                matchingRanks = ['Learner']
                            }
                            return matchingRanks[0]
                        }
                        const string = JSON.stringify(guildMemberJSON)
                        const string_cleaned = string.slice(1, -1)
                        resolve(string_cleaned);

                    } catch (error) {
                        console.error('Error fetching members:', error);
                        reject(error);
                    }
                });
            }

            const approvalRanks = config.GuardianAI.operation_order.opord_participant_approval
            const approvalRanks_string = approvalRanks.map(rank => rank.rank_name).join(', ').replace(/,([^,]*)$/, ', or$1');
            const member = interaction.member;
            if (!hasSpecifiedRole(member, approvalRanks)) {
                await interaction.editReply({ content: `You do not have the roles to add to the participation tracker. Contact ${approvalRanks_string}`, ephemeral: true });
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

            // if (interaction.channelId != channel_await.id) {
            //     await interaction.editReply({ content: `Command must be typed in Channel ${channel_await.name}.`, ephemeral: true });
            //     return
            // }

            // Gather data from the slash command
            const op_participants = interaction.options._hoistedOptions
            const opord_number = op_participants.find(i => i.name === 'opord_number').value
            // Check database for correctly selected opord_number
            const mysql_opord_values = [opord_number]
            const mysql_opord_sql = 'SELECT opord_number,approved_message_id,creator,participant_lock FROM `opord` WHERE opord_number = (?)';
            const mysql_opord_response = await database.query(mysql_opord_sql, mysql_opord_values)

            if (mysql_opord_response.length > 0 && mysql_opord_response[0].participant_lock) {
                await interaction.editReply( { content: 'Participant Lock is enabled for this, contact admin ' , ephemeral: true });
                return
            }
            if (mysql_opord_response.length > 0) {
                const participant_uniform = op_participants.find(i => i.name === 'participant_uniform').value;
                let participant_uniform_userObjects = await getUserIDsFromMention(participant_uniform, interaction)
                const participant_players = op_participants.find(i => i.name === 'participant_players').value
                let participant_players_userObjects = await getUserIDsFromMention(participant_players, interaction)

                if (participant_uniform_userObjects != -1 || participant_players_userObjects != -1) {
                    const mysql_get_participantvalues = [opord_number, opord_number]
                    const mysql_get_participant_sql = `
                        SELECT participant_uniform FROM opord WHERE opord_number = (?); 
                        SELECT participant_players FROM opord WHERE opord_number = (?);
                    `;
                    const mysql_get_participant_response = await database.query(mysql_get_participant_sql, mysql_get_participantvalues)

                    function validateUnique(type, inputData) {
                        function convertObj(object) {
                            const objectArray = object.split('},{').map(entry => {
                                if (!entry.startsWith('{')) { entry = '{' + entry; }
                                if (!entry.endsWith('}')) { entry = entry + '}'; }
                                return JSON.parse(entry);
                            })
                            return objectArray
                        }
                        let selection = 0;
                        if (type == 'participant_uniform') { selection = 0 }
                        if (type == 'participant_players') { selection = 1 }
                        let object = mysql_get_participant_response[selection][0][type]
                        let dbResult = []
                        let inputResult = []
                        if (!object == null) { dbResult = convertObj(object) }
                        if (inputData != -1) { inputResult = convertObj(inputData) }
                        const mergedArray = dbResult.concat(inputResult);
                        const uniqueObjectArray = Array.from(new Set(mergedArray.map(entry => entry.userId)))
                            .map(userId => mergedArray.find(entry => entry.userId === userId));
                        const result = { "participants": uniqueObjectArray };
                        let str = JSON.stringify(result.participants)
                        str = str.replace(/\[|\]/g, '')
                        return str
                    }
                    try {
                        if (participant_uniform_userObjects) {
                            const unique = validateUnique("participant_uniform", participant_uniform_userObjects)
                            const mysql_participant_uniform_values = [unique, opord_number]
                            const mysql_participant_uniform_sql = `
                                UPDATE opord
                                SET participant_uniform = (?)
                                WHERE opord_number = (?);
                            `;
                            await database.query(mysql_participant_uniform_sql, mysql_participant_uniform_values)
                        }
                    }
                    catch (e) {
                        await interaction.editReply({ content: `Something went wrong, contact Admin` })
                        console.error(e)
                        return
                    }
                    try {
                        if (participant_players_userObjects) {
                            const unique = validateUnique("participant_players", participant_players_userObjects)
                            const mysql_participant_players_values = [unique, opord_number]
                            const mysql_participant_players_sql = `
                                UPDATE opord
                                SET participant_players = (?)
                                WHERE opord_number = (?);
                            `;
                            await database.query(mysql_participant_players_sql, mysql_participant_players_values)
                        }
                    }
                    catch (e) {
                        await interaction.editReply({ content: `Something went wrong, contact Admin` })
                        console.error(e)
                        return
                    }
                    await interaction.editReply({ content: `Operation Order Number: ${opord_number} \nUniformed Participant(s): ${participant_uniform} \nOut of Uniform Participant(s): ${participant_players}`, ephemeral: true })
                    // Add participants to the last embed
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
                                newEmbed.addFields({ name: "Earned Experience Credit:", value: `${participant_uniform}`, inline: field.inline })
                            }
                            if (index == 13) {
                                newEmbed.addFields({ name: "Participated:", value: `${participant_players}`, inline: field.inline })
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
                                { name: "Earned Experience Credit:", value: participant_uniform, inline: false },
                                { name: "Participated:", value: participant_players, inline: false }
                            )
                        }
                        const editedEmbed = Discord.EmbedBuilder.from(newEmbed)
                        await lastMessage.edit({ embeds: [editedEmbed] })
                    }
                    catch (e) {
                        console.log(e)
                    }
                }
            }
            else {
                await interaction.editReply({ content: `Opord **${opord_number}** could not be found...`, ephemeral: true })
                return
            }
        }
        if (interaction.options.getSubcommand() === 'information') {
            let opord_approval_authority = config.GuardianAI.operation_order.opord_approval_ranks
            opord_approval_authority = opord_approval_authority.map(rank => rank.rank_name).join(', ').replace(/,([^,]*)$/, ', or$1');
            
            embed = new Discord.EmbedBuilder()
                .setTitle('Operation Order Information')
                .setAuthor({ name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                .setThumbnail(botIdent().activeBot.icon)
                .setColor('#FAFA37') //87FF2A green
                .setDescription(`Operation Orders are structured Operations that Xeno Strike Force performs.`)
                .addFields(
                    { name: "Entered Values", value: 'All fields require a value, if the question should not have an answer, use "none", "na", or "n/a".' },
                    { name: "What is an OPORD?", value: "An Operation Order is a structured format for declaring official operations of Xeno Strike Force." },
                    { name: "Operational Experience", value: "Grants you experience credit to attain higher ranks." },
                    { name: "Preview of Information", value: "Specifically gives the intent for the operation and things you may need." },
                    { name: "Who can Create Operation Orders", value: `Anybody can create an Operation Order, however it must be approved by a ${opord_approval_authority}` },
                    { name: "Mission Statement", value: "A mission statement talks about the overall mission synopsis." },
                    { name: "Date", value: "Shall be entered. 'DD/MMM' " },
                    { name: "Time", value: "Specific time format, in Coordinated Universal Time (UTC). Ex: 1300" },
                    { name: "Meetup Location", value: "Direct a location to group up at." },
                    { name: "Carrier Parking", value: "Direct a location for all carriers to stage." },
                    { name: "Preferred Build(s)", value: "Specific EDSY short links for ship builds." },
                    { name: "Voice Channel", value: "Declare a voice channel for this to occur in." },
                )
            await interaction.reply({
                components: [],
                embeds: [embed],
                ephemeral: false
            });

        }
        if (interaction.options.getSubcommand() === 'create') {
            await interaction.reply({
                content: 'Operation Order Request Error Checking. If its error free it will await approval.',
                components: [],
                ephemeral: true
            });

            let requestingPlayer = { id: interaction.user.id, name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) }
            let strikePackage = interaction.options._hoistedOptions
            let timeSlot_humanReadible = `${strikePackage.find(i => i.name === 'date').value} ${strikePackage.find(i => i.name === 'time').value}`
            let timeSlot = eventTimeCreate(strikePackage.find(i => i.name === 'date').value,strikePackage.find(i => i.name === 'time').value)
            let response = null;
            let returnEmbed = null;
            let channel_await = null;
            let channel_approved = null;
            try {
                channel_await = interaction.guild.channels.cache.get(config[botIdent().activeBot.botName].operation_order.opord_channel_await); //logchannel or other.
                channel_approved = interaction.guild.channels.cache.get(config[botIdent().activeBot.botName].operation_order.opord_channel_approved); //logchannel or other.
                if (!channel_await || !channel_approved) {
                    console.log("[CAUTION]".bgYellow, "channel_await or channel_approved Channel IDs dont match. Check config. Defaulting to Test Server configuration in the .env file.")
                    channel_await = interaction.guild.channels.cache.get(process.env.TESTSERVER_OPORD_AWAIT); //GuardianAI.env
                    channel_approved = interaction.guild.channels.cache.get(process.env.TESTSERVER_OPORD_APPROVED); //GuardianAI.env
                }
            }
            catch (e) {
                console.log("[FAIL]".bgRed, "channel_await or channel_approved  Channel IDs dont match. Check config.json")
            }
            async function timeFailModal(i) {
                const fields = {
                    date: new Discord.TextInputBuilder()
                        .setCustomId(`date`)
                        .setLabel(`Input a correct Date:`)
                        .setStyle(Discord.TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder(`05/MAY`),
                    time: new Discord.TextInputBuilder()
                        .setCustomId(`time`)
                        .setLabel(`Input a correct UTC Time:`)
                        .setStyle(Discord.TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder(`1200`)
                }
                const modal = new Discord.ModalBuilder()
                    .setCustomId('myModal')
                    .setTitle('Adjust Time')
                    .addComponents(
                        new Discord.ActionRowBuilder().addComponents(fields.date),
                        new Discord.ActionRowBuilder().addComponents(fields.time),
                    )
                await i.showModal(modal);
                const submitted = await i.awaitModalSubmit({
                    time: 60000,
                }).catch(error => {

                    console.error(error)
                    return null
                })

                if (submitted) {
                    const [date,time] = submitted.fields.fields.map(i => i.value)
                    return [submitted, date, time]

                }
            }
            async function opordDenyModal(i, interaction, returnEmbed) {

                const fields = {
                    reason: new Discord.TextInputBuilder()
                        .setCustomId(`denied`)
                        .setLabel(`Input the reason for Denial`)
                        .setStyle(Discord.TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setPlaceholder(`Conflicting times`)
                }

                const modal = new Discord.ModalBuilder()
                    .setCustomId('deniedModal')
                    .setTitle('Reason for Denial')
                    .addComponents(
                        new Discord.ActionRowBuilder().addComponents(fields.reason),
                    )
                await i.showModal(modal);
                const submitted = await i.awaitModalSubmit({
                    time: 1800000,
                }).catch(error => {
                    console.error(error)
                    return null
                })
                if (submitted) {
                    const [reason] = submitted.fields.fields.map(i => i.value)
                    return [submitted, reason]

                }
            }
            //Bad Timeslot
            async function failedTimeFormat(date,time) {
                if (!date && !time) { date = strikePackage.find(i => i.name === 'date').value; time = strikePackage.find(i => i.name === 'time').value }
                returnEmbed = new Discord.EmbedBuilder()
                    .setTitle('Operation Order Request')
                    .setAuthor({ name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                    .setThumbnail(botIdent().activeBot.icon)
                    .setColor('#FD0E35')
                    .setDescription(`**Malformed Date or Time Format!*`)
                    .addFields(
                        { name: "Malformed Value:", value: `${date} ${time}` },
                        { name: "Correct Syntax:", value: "Date: 01/JAN\nTime: 1800\n-Input the correct date format and UTC Time" },
                        { name: "Correction:", value: "Would you like to correct this?" }
                    )
                const buttonRow = new Discord.ActionRowBuilder()
                    .addComponents(new Discord.ButtonBuilder().setLabel('Fix Error').setCustomId('fix').setStyle(Discord.ButtonStyle.Success))
                    .addComponents(new Discord.ButtonBuilder().setLabel('Cancel Submission').setCustomId('No').setStyle(Discord.ButtonStyle.Danger))
                response = await interaction.followUp({ content: `Error Discovered`, embeds: [returnEmbed.setTimestamp()], components: [buttonRow], ephemeral: true }).catch(console.error);
                const collector = response.createMessageComponentCollector({ componentType: Discord.ComponentType.Button, time: 604_800_000 });
                collector.on('collect', async i => {
                    const selection = i.customId;
                    collector.stop()
                    if (selection == 'fix') {
                        const modalResults = await timeFailModal(i)
                        timeSlot = eventTimeCreate(modalResults[1],modalResults[2]) //returns 13 digit timestamp
                        timeSlot_humanReadible = `${modalResults[1]} ${modalResults[2]}`
                        if (typeof timeSlot != "number" || timeSlot.toString().length < 13 || Date.now() > timeSlot) {
                            await i.deleteReply({ content: "Failed",embeds: [], components: [], ephemeral: true})
                            await modalResults[0].reply({
                                content: `Not within Standard. Try again.`,
                                embeds: [],
                                components: [],
                                ephemeral: true
                            })
                            failedTimeFormat(modalResults[1],modalResults[2])

                        }
                        else {
                            await i.deleteReply({ content: 'Operation Order Request Error fixed.. Awaiting Leadership approval.', embeds: [], components: [], ephemeral: true }).catch(console.error)
                            await modalResults[0].reply({
                                content: `Date and Time Updated. Awaiting Approval.`,
                                embeds: [],
                                components: [],
                                ephemeral: true
                            })
                            publishRequest()
                            //modal was good call publishRequest with new time value
                        }
                    }
                    else {
                        await interaction.followUp({ content: `Error Discovered`, embeds: [returnEmbed.setTimestamp()], components: [], ephemeral: true }).catch(console.error);
                        await i.reply({ content: 'Operation Order Submission Cancelled', components: [], ephemeral: true }).catch(console.error);
                        // await i.reply({ content: 'Operation Order Submission Cancelled', components: [], embeds: [returnEmbed.setColor('#FD0E35')], ephemeral: true }).catch(console.error);
                    }
                });
            }
            if (typeof timeSlot != "number" || timeSlot.toString().length < 13 || Math.floor(Date.now() / 1000) > timeSlot) {
                failedTimeFormat(strikePackage.find(i => i.name === 'date').value,strikePackage.find(i => i.name === 'time').value)
            }
            else { publishRequest() }
            const testMode = 0;
            async function publishRequest() {
                //Good Timeslot
                returnEmbed = new Discord.EmbedBuilder()
                    .setTitle('Operation Order Request')
                    .setAuthor({ name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                    .setThumbnail(botIdent().activeBot.icon)
                    .setColor('#FAFA37') //87FF2A
                    .setDescription(`A request for a Operation has been submitted. This will require approval. Review the contents and then select Approve or Deny`)
                    .addFields({ name: "Operation Order #", value: "Pending....", inline: true })

                interaction.options._hoistedOptions.forEach((i, index) => {
                    let properName = null;
                    properName = objectives.stringNames.find(x => x.name === i.name)
                    if (timeSlot && properName.name == 'date') {
                        returnEmbed.addFields({ name: properName.string_name, value: 'Check Events for your local time.\n```' + timeSlot_humanReadible + ' UTC```',  inline: properName.inline })
                        return
                    }
                    if (properName.name == 'time') { return }
                    else {
                        if (properName.name == 'voice_channel') {
                            const voiceChannelValue = strikePackage.find(i => i.name === 'voice_channel').value;
                            
                            if (voiceChannelValue == 'Mumble') { 
                                returnEmbed.addFields({ name: 'Voice Channel', value: 'Mumble Communications:\n Type in any channel for instructions:\n```/mumble```', inline: false });
                            }
                            if (typeof voiceChannelValue == 'string') { 
                                returnEmbed.addFields({ name: 'Voice Channel', value: voiceChannelValue, inline: false });
                            }
                            else { 
                                let voice = voiceChans.find(x => x.name === voiceChannelValue);
                                returnEmbed.addFields({ name: 'Voice Channel', value: `Join XSF Voice Channel <#${voice.id}>`, inline: false });
                            }
                        }
                        else {
                            returnEmbed.addFields({ name: properName.string_name, value: i.value, inline: properName.inline });
                        }
                    }
                })
                returnEmbed.addFields({ name: 'Uniform', value: 'Being in Uniform is being part of the team, view here:\nhttps://xenostrikeforce.com/?page_id=239', inline: false })
                returnEmbed.addFields({ name: 'XSF Private Group', value: 'Official Operations are in the XSF PG. Type in any channel for instructions:\n```/pg```', inline: false })
                try {
                    const buttonRow = new Discord.ActionRowBuilder()
                        .addComponents(new Discord.ButtonBuilder().setLabel('Approve').setCustomId('Approve').setStyle(Discord.ButtonStyle.Success))
                        .addComponents(new Discord.ButtonBuilder().setLabel('Deny').setCustomId('Deny').setStyle(Discord.ButtonStyle.Danger))

                    response = await channel_await.send({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] })
                    
                    const collector = response.createMessageComponentCollector({ componentType: Discord.ComponentType.Button, time: 604_800_000 });
                    collector.on('collect', async i => {
                        const selection = i.customId;

                        collector.stop()
                        if (testMode == '1') {
                            createEvent(interaction);
                            return;
                        }
                        if (selection == 'Approve') {
                            const previous_opord_number_values = null
                            const previous_opord_number_sql = 'SELECT opord_number FROM `opord` ORDER BY opord_number DESC LIMIT 1';
                            const previous_opord_number_response = await database.query(previous_opord_number_sql, previous_opord_number_values)
                            returnEmbed.data.fields[0].value = previous_opord_number_response[0].opord_number + 1
                            await i.update({ content: 'Operation Order Approved', components: [], embeds: [returnEmbed.setColor('#87FF2A')], ephemeral: true }).catch(console.error);
                            const approved_embed = await channel_approved.send({
                                embeds: [returnEmbed
                                    .setTitle('Operation Order Approved')
                                    .setAuthor({ name: i.member.nickname, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
                                    .setColor('#87FF2A')
                                    .setDescription(`Team, prepare your kit and click 'interested' in the Events window if you plan on making it.`)
                                ]
                            })

                            const embedLink = `https://discord.com/channels/${approved_embed.guildId}/${approved_embed.channelId}/${channel_approved.lastMessageId}`;
                            createEvent(interaction, embedLink,response.id)
                        }
                        if (selection == 'Deny') {
                            response.edit({
                                embeds: [returnEmbed
                                    .setTitle('Operation Order Denied')
                                    .setAuthor({ name: i.member.nickname, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
                                    .setColor('#FD0E35')
                                    .setDescription(`**Denial Reason** \n - Unspecified`)
                                ],
                                components: []
                            })
                            const modalResults = await opordDenyModal(i, interaction, returnEmbed)
                            await modalResults[0].reply({
                                content: `Notification of Denial Sent to ${i.member.nickname}`,
                                embeds: [],
                                components: [],
                                ephemeral: true
                            })
                            if (modalResults) {
                                await interaction.user.send({ content: `Your operation order was Denied.`, embeds: [returnEmbed.setColor('#FD0E35').setDescription(`**Denied** \n *${modalResults[1]}*`)] })
                                response.edit({
                                    embeds: [returnEmbed
                                        .setTitle('Operation Order Denied')
                                        .setAuthor({ name: i.member.nickname, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
                                        .setColor('#FD0E35')
                                        .setDescription(`**Denial Reason** \n ${modalResults[1]}`)
                                    ],
                                    components: []
                                })
                            }
                        }
                    });
                }
                catch (e) {
                    console.log(e)
                    interaction.guild.channels.cache.get(process.env.LOGCHANNEL).send({ content: `⛔ OPORD Fail. Permissions or Wrong Channel. Fatal error experienced:\n ${e.stack}` })
                }
            }
            async function createEvent(interaction, embedLink,await_message_id) {
                const guild = interaction.guild
                let entityType = null
                if (!guild) return console.log('Guild not found: createEvent() opord.js');
                if (voiceChans.length == 0) { fillVoiceChan(interaction) }
                const channelName = strikePackage.find(i => i.name === 'voice_channel').value
                let selectedChannelId = null;
                //If a channel is malformed, just get the first one in the guild cache. 
                //Could benefit from a default channel for ops based of config.json entry.
                try { 
                    selectedChannelId = voiceChans.map(i => i).find(i => i.name === channelName).id; 
                    entityType = 2; 
                    if (selectedChannelId == 0) { throw new Error()}
                }
                catch (e) { 
                    selectedChannelId = null; 
                    entityType = 3; 
                }
                if (testMode != 1) { 
                    
                    channel_approved.messages.fetch({ limit: 1 }).then(async messages => {
                        let lastMessage = messages.first();
                        const previous_opord_number_values = null
                        const previous_opord_number_sql = 'SELECT opord_number FROM `opord` ORDER BY opord_number DESC LIMIT 1';
                        const previous_opord_number_response = await database.query(previous_opord_number_sql, previous_opord_number_values)
                        const event_manager = new Discord.GuildScheduledEventManager(guild);
                        const newEvent = await event_manager.create({
                            name: strikePackage.find(i => i.name === 'operation_name').value,
                            scheduledStartTime: timeSlot,
                            scheduledEndTime: new Date(timeSlot).setHours(new Date(timeSlot).getHours() + 6),
                            privacyLevel: 2,
                            entityType: entityType,
                            channel: selectedChannelId,
                            description: `Mission Statement:\n${strikePackage.find(i => i.name === 'mission_statement').value}\n-\nRead the Op Order here ->, ${embedLink}`,
                            // description: `**OP Order #: ${previous_opord_number_response[0].opord_number + 1}**:\nMission Statement:\n${strikePackage.find(i => i.name === 'mission_statement').value}\n-\nRead the Op Order here ->, ${embedLink}`,
                            entityMetadata: {
                                location: channelName
                            }
                        });
                        let new_values = [
                            timeSlot,
                            previous_opord_number_response[0].opord_number + 1,
                            lastMessage.id,
                            await_message_id,
                            newEvent.id,
                            JSON.stringify(requestingPlayer),
                            strikePackage.find(i => i.name === 'operation_name').value,
                            strikePackage.find(i => i.name === 'mission_statement').value,
                            strikePackage.find(i => i.name === 'meetup_location').value,
                            strikePackage.find(i => i.name === 'carrier_parking').value,
                            strikePackage.find(i => i.name === 'prefered_build').value,
                            strikePackage.find(i => i.name === 'voice_channel').value,
                            strikePackage.find(i => i.name === 'additional_instructions').value,
                        ]
                        const new_sql =
                            `
                                INSERT INTO opord (
                                    unix,
                                    opord_number,
                                    approved_message_id,
                                    await_message_id,
                                    event_id,
                                    creator,
                                    operation_name,
                                    mission_statement,
                                    meetup_location,
                                    carrier_parking,
                                    prefered_build,
                                    voice_channel,
                                    additional_instructions
                                ) 
                                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?);
                            `
                        await database.query(new_sql, new_values)
                    }).catch(console.error)
                }
            }
        }
    }
};
