const Discord = require("discord.js");
const { botIdent, eventTimeCreate } = require('../../../functions')
const objectives = require('./opord_values.json')
const config = require('../../../config.json')
const database = require('../../../GuardianAI/db/database')

// getOpOrdNumber()
function getOpOrdNumber() {
    try {
        const values = null
        const sql = 'SELECT opord_number FROM `opord`';
        database.query(sql, values, (err, res) => {
            if (err) { console.error(err); } 
            else {
                console.log("vals:",res[0])
            }
        });
    } catch (e) { console.error(e); }
}
// insertOpOrdNumber()

let voiceChans = []
function fillVoiceChan(interaction) {
    const guild = interaction.client.guilds.cache.get(process.env.GUILDID);
    const voiceChansSet = new Set();

    if (guild) {
        const voiceChannels = guild.channels.cache.filter(chan => chan.type === 2); 

        voiceChannels.forEach(channel => {
            voiceChansSet.add({ name: channel.name, id: channel.id });
        });
    }
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
                option.setName('date_time')
                    .setDescription('Enter your local date and time.')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('wing_size')
                    .setDescription('Select a wing size or enter a custom one.')
                    .setRequired(true)
                    .setAutocomplete(true)
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
                option.setName('weapons_required')
                    .setDescription('Entered required weapons, if any.')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('modules_required')
                    .setDescription('Enter required modules, if any.')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('prefered_build')
                    .setDescription('Enter a short URL of EDSY recommended build.')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('objective_a')
                    .setDescription('Enter the mission completion requirements for Objective A.')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('objective_b')
                    .setDescription('Enter the mission completion requirements for Objective B.')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('objective_c')
                    .setDescription('Enter the mission completion requirements for Objective C.')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('voice_channel')
                    .setDescription('Enter the voice channel to host this event.')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
        )
        .addSubcommand(subcommand => 
            subcommand
            .setName('information')
            .setDescription('Display information regarding the OPORD form.')
        )
        // .addSubcommand(subcommand => 
        //     subcommand
        //     .setName('participants')
        //     .setDescription('Use the @ and name them.')
        //     .addStringOption(option =>
        //         option.setName('oporder_number')
        //             .setDescription('chose the number')
        //             .setRequired(true)
        //     )
        //     .addStringOption(option =>
        //         option.setName('players')
        //             .setDescription('add multiple players @ symbol')
        //             .setRequired(true)
        //     )
        // )
        ,
	async autocomplete(interaction) {
        fillVoiceChan(interaction)

		const focusedOption = interaction.options.getFocused(true);
		let choices;

        if (focusedOption.name === 'wing_size') {
			choices = objectives.wing_sizes
		}
        if (focusedOption.name === 'voice_channel') {
            choices = voiceChans.map(i=>i.name)
		}

		const filtered = choices.filter(choice => choice.startsWith(focusedOption.value));
		await interaction.respond(
			filtered.map(choice => ({ name: choice, value: choice })),
		);
	},
    permissions: 0,
    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'participants') {
            //todo Get the oporder Number
            //todo Retrieve participants list
            //todo Add participants to the list
            //todo Update the list in the Opord number
            //todo Modify the embed of the Opord Number
            let operationParticipants = interaction.options._hoistedOptions
            lastMessage.edit({ 
                embeds: [
                    {
                        fields: [
                            { name: "Participants", value: 'dude\ndude\ndude\ndude' }
                        ]
                    }
                ]
            });
        }
        if (interaction.options.getSubcommand() === 'information') {
            embed = new Discord.EmbedBuilder()
                    .setTitle('Operation Order Information')
                    .setAuthor({name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({dynamic:true})})
                    .setThumbnail(botIdent().activeBot.icon)
                    .setColor('#FAFA37') //87FF2A green
                    .setDescription(`Operation Orders are structured Operations that Xeno Strike Force performs.`)
                    .addFields(
                        {name: "What is an OPORD?", value: "An Operation Order is a structured format for declaring official operations of Xeno Strike Force."},
                        {name: "Operational Experience", value: "Grants you access to attain higher ranks."},
                        {name: "Preview of Information", value: "Specifically gives the intent for the operation and things you may need."},
                        {name: "Who can Create Operation Orders", value: "Anybody can create an Operation Order, however they must be approved by an approval authority first."},
                        {name: "What is an Objective", value: "An objective is one of the priorities in an order which denote specific conditions to be met. Objective A will always be required. Any others can be filled in with 'NA' or 'None'"},
                        {name: "The format...", value: "Operation Orders are significant that they follow a format that is expected everytime one is presented."},
                        {name: "Mission Statement", value: "A mission statement talks about the overall mission synopsis."},
                        {name: "Date Time", value: "At this time, a specific time format, in your local time, shall be entered. There will be 2 opportunities to type it in correctly. 'DD/MMM/YY+1300' '24/feb/24/+1300'"},
                        {name: "Wing Size", value: "An autocompleted list will give a few structured examples. Certain sizes are limited to certain Ranks that can lead them."},
                        {name: "Meetup Location", value: "Direct a location to group up at."},
                        {name: "Carrier Parking", value: "Direct a location for all carriers to stage."},
                        {name: "Weapons Required", value: "Can be weapon limitations or weapon requirements"},
                        {name: "Modules Required", value: "Can be module limitations or module requirements"},
                        {name: "Prefered Build(s)", value: "Specific short url EDYS links for ship builds"},
                        {name: "Objective A", value: "Mission completion requirement, #1"},
                        {name: "Objective B", value: "Mission completion requirement, #2"},
                        {name: "Objective C", value: "Mission completion requirement, #3"},
                        {name: "Voice Channel", value: "Declare a voice channel for this to occur in."},
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

            let requestingPlayer = { name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({dynamic:true})}
            let strikePackage = interaction.options._hoistedOptions
            let timeSlot = eventTimeCreate(strikePackage.find(i=>i.name === 'date_time').value)
            let response = null;
            let returnEmbed = null;
            let channel_await = null;
            let channel_approved = null;
            try {
                channel_await = interaction.guild.channels.cache.get(config[botIdent().activeBot.botName].operation_order.opord_channel_await); //logchannel or other.
                channel_approved = interaction.guild.channels.cache.get(config[botIdent().activeBot.botName].operation_order.opord_channel_approved); //logchannel or other.
                if (!channel_await|| !channel_approved) {
                    console.log("[FAIL]".bgYellow,"Log or approval Channel IDs dont match. Check config. Defaulting to Test Server configuration in the .env file.")
                    channel_await = interaction.guild.channels.cache.get(process.env.TESTSERVER_OPORD_AWAIT); //GuardianAI.env
                    channel_approved = interaction.guild.channels.cache.get(process.env.TESTSERVER_OPORD_APPROVED); //GuardianAI.env
                }
            }
            catch (e) {
                console.log("[FAIL]".bgRed,"Log or approval Channel IDs dont match. Check config.")
            }
            async function gimmeModal(i) {
                    const fields = {
                        time: new Discord.TextInputBuilder()
                            .setCustomId(`time`)
                            .setLabel(`Input the correct time: IE. 01/JAN/24+1325`)
                            .setStyle(Discord.TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder(`05/MAY/24+1200`)
                    }
                    
                    const modal = new Discord.ModalBuilder()
                    .setCustomId('myModal')
                    .setTitle('Adjust Time')
                    .addComponents(
                        new Discord.ActionRowBuilder().addComponents(fields.time),
                    )
                    await i.showModal(modal);
                    const submitted = await i.awaitModalSubmit({
                        time: 60000,
    
                        // filter: i => i.user.id === interaction.user.id,
                    }).catch(error => {
    
                        console.error(error)
                        return null
                    })
            
                    if (submitted) {
                        const [ time ] = submitted.fields.fields.map(i=>i.value)
                        return [submitted,time]
                        
                    }
            }
            async function opordDenyModal(i,interaction,returnEmbed) {
               
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
    
                    // filter: i => i.user.id === interaction.user.id,
                }).catch(error => {
    
                    console.error(error)
                    return null
                })
        
                if (submitted) {
                    const [ reason ] = submitted.fields.fields.map(i=>i.value)
                    return [submitted,reason]
                    
                }
            }
            //Bad Timeslot
            async function failedTimeFormat() {
                returnEmbed = new Discord.EmbedBuilder()
                    .setTitle('Operation Order Request')
                    .setAuthor({name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({dynamic:true})})
                    .setThumbnail(botIdent().activeBot.icon)
                    .setColor('#FD0E35')
                    .setDescription(`**Malformed Time Format!*`)
                    .addFields(
                        { name: "Malformed Value:", value: strikePackage.find(i=>i.name === 'date_time').value },
                        { name: "Correct Syntax:", value: "01/JAN/24+1800" },
                        { name: "Correction:", value: "Would you like to correct this time?" }
                    )
                const buttonRow = new Discord.ActionRowBuilder()
                    .addComponents(new Discord.ButtonBuilder().setLabel('Fix Error').setCustomId('fix').setStyle(Discord.ButtonStyle.Success))
                    .addComponents(new Discord.ButtonBuilder().setLabel('Cancel Submission').setCustomId('No').setStyle(Discord.ButtonStyle.Danger))
                response = await interaction.followUp({ content: `Error Discovered`, embeds: [returnEmbed.setTimestamp()], components: [buttonRow], ephemeral: true }).catch(console.error);
                const collector = response.createMessageComponentCollector({ componentType: Discord.ComponentType.Button, time: 3_600_000 });
                collector.on('collect', async i => {
                    const selection = i.customId;
                    collector.stop()
                    if (selection == 'fix') {
                        const modalResults = await gimmeModal(i)
                        timeSlot = eventTimeCreate(modalResults[1]) //returns 13 digit timestamp
                        if (typeof timeSlot != "number" || timeSlot.toString().length < 13 || Date.now() > timeSlot) { 
                            await modalResults[0].reply({
                                content: `Not within Standard. Try again.`,
                                embeds: [],
                                components: [],
                                ephemeral: true
                            })
                            failedTimeFormat()
                        }
                        else {
                            await interaction.deleteReply({ content: 'Operation Order Request Error fixed.. Awaiting Leadership approval.', embeds: [], components: [], ephemeral: true }).catch(console.error)
                            await modalResults[0].reply({
                                content: `Time Updated. Awaiting Approval.`,
                                embeds: [],
                                components: [],
                                ephemeral: true
                            })
                            const newTime = modalResults[1]
                            publishRequest(newTime)
                            //modal was good call publishRequest with new time value
                        }
    
                    }
                    else {
                        await i.followUp({ content: 'Operation Order Submission Cancelled', components: [], embeds: [returnEmbed.setColor('#FD0E35')], ephemeral: true }).catch(console.error);
                        //cancel the submission
                        //cancel the submission
                        //cancel the submission
                        //cancel the submission
                    }
                });
            }
            if (typeof timeSlot != "number" || timeSlot.toString().length < 13 || Date.now() > timeSlot) {
                failedTimeFormat()
            }
            else { publishRequest() }
            async function publishRequest(newTime){
                //Good Timeslot
                returnEmbed = new Discord.EmbedBuilder()
                    .setTitle('Operation Order Request')
                    .setAuthor({name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({dynamic:true})})
                    .setThumbnail(botIdent().activeBot.icon)
                    .setColor('#FAFA37') //87FF2A
                    .setDescription(`A request for a Operation has been submitted. This will require approval. Review the contents and then select Approve or Deny`)
                    
                    // .setDescription(`A request for a Operation has been submitted. This will require approval. Review the contents and then select Approve or Deny`)
                interaction.options._hoistedOptions.forEach((i,index) =>{
                    let properName = null;
                    properName = objectives.stringNames.find(x=>x.name === i.name)
                    if (newTime && properName.name == 'date_time') {
                        returnEmbed.addFields({ name: properName.string_name, value: newTime, inline: properName.inline })
                    }
                    else {
                        returnEmbed.addFields({ name: properName.string_name, value: i.value, inline: properName.inline })
                    }
                })
                try {
                    const buttonRow = new Discord.ActionRowBuilder()
                        .addComponents(new Discord.ButtonBuilder().setLabel('Approve').setCustomId('Approve').setStyle(Discord.ButtonStyle.Success))
                        .addComponents(new Discord.ButtonBuilder().setLabel('Deny').setCustomId('Deny').setStyle(Discord.ButtonStyle.Danger))
                    
                    response = await channel_await.send({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] })
                    const collector = response.createMessageComponentCollector({ componentType: Discord.ComponentType.Button, time: 345_600_000  });
                    collector.on('collect', async i => {
                        const selection = i.customId;
                        
                        collector.stop()
                        if (selection == 'Approve') {
                            await i.update({ content: 'Operation Order Approved', components: [], embeds: [returnEmbed.setColor('#87FF2A')], ephemeral: true }).catch(console.error);
                            //todo GET last DB Entry for Operation Number and + 1 it and add it to the embed for display purposes.
                            //todo GET last DB Entry for Operation Number and + 1 it and add it to the embed for display purposes.
                            //todo GET last DB Entry for Operation Number and + 1 it and add it to the embed for display purposes.
                            //todo GET last DB Entry for Operation Number and + 1 it and add it to the embed for display purposes.
                            //todo GET last DB Entry for Operation Number and + 1 it and add it to the embed for display purposes.
                            //todo GET last DB Entry for Operation Number and + 1 it and add it to the embed for display purposes.
                            const approved_embed = await channel_approved.send({ 
                                embeds: [returnEmbed
                                    .setTitle('Operation Order Approved')
                                    .setAuthor({name:i.member.nickname,iconURL: i.user.displayAvatarURL({dynamic:true})})
                                    .setColor('#87FF2A')
                                    .setDescription(`Team, prepare your kit and click 'interested' in the Events window if you plan on making it.`)
                                ] 
                            })
                            const embedLink = `https://discord.com/channels/${approved_embed.guildId}/${approved_embed.channelId}/${channel_approved.lastMessageId}`;
                            createEvent(interaction,embedLink)
                        }
                        else {
                            const modalResults = await opordDenyModal(i,interaction,returnEmbed)
                            await modalResults[0].reply({
                                content: `Notification of Denial Sent`,
                                embeds: [],
                                components: [],
                                ephemeral: true
                            })
                            if (modalResults) {
                                
                                // await i.update({ content: 'Operation Order Disapproved', components: [], embeds: [returnEmbed.setColor('#FD0E35')], ephemeral: true }).catch(console.error);
                                await interaction.user.send({ content: `Your operation order was Denied.`, embeds: [returnEmbed.setColor('#FD0E35').setDescription(`**Denied** \n *${modalResults[1]}*`)] })
                                response.edit({ embeds: [returnEmbed
                                    .setTitle('Operation Order Denied')
                                    .setAuthor({name:i.member.nickname,iconURL: i.user.displayAvatarURL({dynamic:true})})
                                    .setColor('#FD0E35')
                                    .setDescription(`**Denial Reason** \n ${modalResults[1]}`)
                                ],
                                components: [] }
                                )
                                // await channel_await.send({ 
                                //     embeds: [returnEmbed
                                //         .setTitle('Operation Order Denied')
                                //         .setAuthor({name:i.member.nickname,iconURL: i.user.displayAvatarURL({dynamic:true})})
                                //         .setColor('#FD0E35')
                                //         .setDescription(`*${modalResults[1]}*`)
                                //     ] 
                                // })
                                // const embedLink = `https://discord.com/channels/${disapproved_embed.guildId}/${disapproved_embed.channelId}/${channel_approved.lastMessageId}`;
                            }


                        }
                        
                    });
                }
                catch (e) {
                    console.log(e)
                    interaction.guild.channels.cache.get(process.env.LOGCHANNEL).send({ content: `⛔ OPORD Fail. Permissions or Wrong Channel. Fatal error experienced:\n ${e.stack}` })
                }
            }
            async function createEvent(interaction,embedLink){
                try {
                    const guild = interaction.client.guilds.cache.get(process.env.guildID)
                    let entityType = null
                    if (!guild)  return console.log('Guild not found');
                    if (voiceChans.length == 0) { fillVoiceChan(interaction) }
                    const channelName = strikePackage.find(i=>i.name === 'voice_channel').value
                    let selectedChannelId = null;
                    //If a channel is malformed, just get the first one in the guild cache. 
                    //Could benefit from a default channel for ops based of config.json entry.
                    try { selectedChannelId = voiceChans.map(i=>i).find(i=>i.name === channelName).id; entityType = 2; }
                    catch(e) { selectedChannelId = null; entityType = 3; }
                    const event_manager = new Discord.GuildScheduledEventManager(guild);
                    await event_manager.create({
                        name: strikePackage.find(i=>i.name === 'operation_name').value,
                        scheduledStartTime: timeSlot,
                        scheduledEndTime: new Date(timeSlot).setHours(new Date(timeSlot).getHours() + 2),
                        privacyLevel: 2,
                        entityType: entityType,
                        channel: selectedChannelId,
                        description: embedLink,
                        entityMetadata: {
                            location: channelName
                        }
                    });
                    //todo Create database entry for the operation order.
                    function getCurrentOpOrdNumber() {
                        const checkTableQuery = `SELECT opord_number FROM opord`;
                        query(checkTableQuery, 'opord', (err, res) => {
                            if (err) { console.error(err); } 
                            else {

                            }
                        });
                    }
                    //todo Add all the fields
                    //todo 

                    channel_approved.messages.fetch({limit: 1}).then(messages => {
                        let lastMessage = messages.first();
                        console.log(lastMessage.id)
                        //todo database stuff.
                        //todo Add lastMessage.id to the database entry
                    })
                    .catch(console.error)
                    
                }
                catch (e) {
                    console.log(e)
                }
            }
        }
    } 
};

function opordChecks() {
    try {
        const checkTableQuery = `SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1`;
        query(checkTableQuery, 'opord', (err, res) => {
            if (err) {
                console.error("[STARTUP]".yellow, `${botIdent().activeBot.botName}`.green, "Creating OPORD Table Fail:".magenta, '❌');
                console.error(err);
            } else {
                if (res && res.length > 0) {
                    // console.log("Table Exists");
                } else {
                    console.log("[STARTUP]".yellow, `${botIdent().activeBot.botName}`.green, "Creating OPORD Table:".magenta, '✅');
                    const createTableQuery = `
                        CREATE TABLE opord (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            opord_number INT,
                            creator VARCHAR(255),
                            mission_statement TEXT,
                            date_time VARCHAR(255),
                            wing_size VARCHAR(255),
                            meetup_location VARCHAR(255),
                            carrier_parking VARCHAR(255),
                            weapons_required VARCHAR(255),
                            modules_required VARCHAR(255),
                            prefered_build VARCHAR(255),
                            objective_a VARCHAR(255),
                            objective_b VARCHAR(255),
                            objective_c VARCHAR(255),
                            voice_channel VARCHAR(255)
                        )
                    `;
                    query(createTableQuery, 'opord', (err, res) => {
                        if (err) {
                            console.error("[STARTUP]".yellow, `${botIdent().activeBot.botName}`.green, "Creating OPORD Table Fail:".magenta, '❌');
                            console.error(err);
                        } else {
                            console.log("OPORD Table Created Successfully");
                            // Handle successful table creation
                        }
                    });
                }
            }
        });
    } catch (e) {
        console.error("[STARTUP]".yellow, `${botIdent().activeBot.botName}`.green, "Creating OPORD Table Fail:".magenta, '❌');
        console.error(e);
    }
}