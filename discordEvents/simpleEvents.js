const { generateDateTime, botLog, botIdent } = require('../functions')
const { nextTestQuestion,getRankEmoji } = require("../commands/GuardianAI/promotionRequest/requestpromotion")
const Discord = require('discord.js')
const database = require(`../${botIdent().activeBot.botName}/db/database`)
const config = require('../config.json')
const exp = { 
    messageCreate: async (message, bot) => {
        if (botIdent().activeBot.botName == 'GuardianAI' && !message.author.bot) {
            let applyForRanks_guardianai = null
            let graderRank = []
            if (process.env.MODE != "PROD") {
                applyForRanks_guardianai = config[botIdent().activeBot.botName].general_stuff.testServer.knowledge_proficiency.embedChannel
                console.log("[CAUTION]".bgYellow, "knowledge proficiency embed channel required. Check config.json file. guardianai.general_stuff.knowledge_proficiency.embedChannel. Using testServer input if available")
                generalstaff = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.find(r=>r.rank_name === 'General Staff').id
                colonel = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.find(r=>r.rank_name === 'Colonel').id
                major = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.find(r=>r.rank_name === 'Major').id
                captain = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.find(r=>r.rank_name === 'Captain').id
                graderRank.push({"General Staff":generalstaff,"Colonel":colonel,"Major":major,"Captain":captain})
            }
            else { 
                applyForRanks_guardianai = config[botIdent().activeBot.botName].general_stuff.knowledge_proficiency.embedChannel 
                generalstaff = config[botIdent().activeBot.botName].general_stuff.allRanks.find(r=>r.rank_name === 'General Staff').id
                colonel = config[botIdent().activeBot.botName].general_stuff.allRanks.find(r=>r.rank_name === 'Colonel').id
                major = config[botIdent().activeBot.botName].general_stuff.allRanks.find(r=>r.rank_name === 'Major').id
                captain = config[botIdent().activeBot.botName].general_stuff.allRanks.find(r=>r.rank_name === 'Captain').id
                graderRank.push({"General Staff":generalstaff,"Colonel":colonel,"Major":major,"Captain":captain})
            }
            
            let messageParent = message.channel.parentId
            if (messageParent == applyForRanks_guardianai) {
                // const embedChannelObj = await message.guild.channels.fetch(applyForRanks_guardianai)
                if (message.channel.name.includes("Submission")) {
                    
                    // console.log("submitting")
                    // .setColor('#87FF2A') //bight green
                    // .setColor('#f20505') //bight red
                    // .setColor('#f2ff00') //bight yellow
                    
                    try {
                        const values = [message.author.id]
                        const sql = 'SELECT * FROM `promotion` WHERE userId = (?)'
                        const response = await database.query(sql,values)
                        //For promotion challenge proof
                        if (response[0].grading_state == 3) {
                            const rankTypes = {
                                "basic": "Aviator",
                                "advanced": "Lieutenant",
                                "master": "Captain",
                                "master": "General Staff",
                            }
                            const testTypes = {
                                "Aviator": "basic",
                                "Lieutenant": "advanced",
                                "Captain": "master",
                                "General Staff": "master",
                            }
                            const graderTypes = {
                                "basic": "Captain",
                                "advanced": "Major",
                                "master": "Colonel"
                            }
                            const grader_ident = graderTypes[response[0].testType]
                            const leadership_thread = await message.guild.channels.fetch(response[0].leadership_threadId)
                            if (leadership_thread.id == message.channel.id) {
                                //If chat is discovered in the leadership thread, abandon this script.
                                return
                            }
                            //use 1 embed and modify both leadership embed and requestor embed
                            const leadership_challenge = await leadership_thread.messages.fetch(response[0].challenge_leadership_embedId)
                            const leadership_embed = leadership_challenge.embeds[0]
    
                            const requestor_thread = await message.guild.channels.cache.get(response[0].requestor_threadId)
                            const requestor_challenge = await requestor_thread.messages.fetch(response[0].challenge_requestor_embedId)

                            const leadership_oldEmbedSchema = {
                                title: leadership_embed.title,
                                author: { name: message.author.displayName, iconURL: message.author.displayAvatarURL({ dynamic: true }) },
                                description: leadership_embed.description,
                                color: leadership_embed.color
                            }
                            
                            const newEmbed = new Discord.EmbedBuilder()
                                .setTitle(leadership_oldEmbedSchema.title)
                                .setDescription(`Waiting on approval from Leadership.`)
                                .setColor("#f2ff00")
                                    // .setColor('#87FF2A') //bight green
                                    // .setColor('#f20505') //bight red
                                    // .setColor('#f2ff00') //bight yellow
                                .setAuthor(leadership_oldEmbedSchema.author)
                                .setThumbnail(botIdent().activeBot.icon)
                                .addFields(
                                    { name: "Promotion Rank", value: "```" + rankTypes[response[0].testType] + "```", inline: true },
                                    { name: "Promotion Challenge Status", value: "```" + 'Submitted, awaiting leadership approval' + "```", inline: true },
                                )
                            const row = new Discord.ActionRowBuilder()
                                .addComponents(new Discord.ButtonBuilder().setCustomId(`promotionchallenge-approve-${message.author.id}`).setLabel('Approve').setStyle(Discord.ButtonStyle.Success))
                                .addComponents(new Discord.ButtonBuilder().setCustomId(`promotionchallenge-deny-${message.author.id}`).setLabel('Deny').setStyle(Discord.ButtonStyle.Danger))
                            if (message.attachments.size > 0) {
                                message.attachments.forEach(async attachment => {
                                    if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                                      newEmbed.addFields(
                                          { name: "Promotion Challenge Proof", value: attachment.url, inline: false },
                                          { name: "Required Approval by:", value: `<@&${graderRank[0][grader_ident]}> or Higher`, inline: false }
                                      )
                                    }
                                })
                                await leadership_challenge.edit( { embeds: [newEmbed], components: [row] } )
                                await requestor_challenge.edit( { embeds: [newEmbed] } )
                                return
                            }
                            const urlRegex = /(https:\/\/[^\s]+)/g
                            let urls = message.content.match(urlRegex)
                            if (urls == null && message.attachments.size == 0) {
                                message.delete()
                                message.channel.send('❌ Please enter a valid URL, eg: https://...')
                                return
                            }
                            if (urls != null && message.attachments.size == 0) {
                                urls = urls.map(i => i + "\n")
                                newEmbed.addFields(
                                    { name: "Promotion Challenge Proof", value: `${urls}`, inline: false },
                                    { name: "Required Approval by:", value: `<@&${graderRank[0][grader_ident]}> or Higher`, inline: false }
                                )
                                message.delete()
                                await leadership_challenge.edit( { embeds: [newEmbed], components: [row] } )
                                await requestor_challenge.edit( { embeds: [newEmbed] } )
                                return
                            }
                        }
                        if (response.length > 0) {
                            //requestor
                            const messages = await message.channel.messages.fetch({ limit: 2 });
                            const previousMessageWithEmbed = messages.last();
                            const receivedEmbed = previousMessageWithEmbed.embeds[0]
 
                            let oldEmbedSchema = {
                                author: receivedEmbed.author,
                                title: receivedEmbed.title,
                                description: receivedEmbed.description,
                                color: receivedEmbed.color,
                                fields: receivedEmbed.fields
                            } 
                            const newEmbed = new Discord.EmbedBuilder()
                                .setTitle(oldEmbedSchema.title)
                                .setDescription(oldEmbedSchema.description)
                                .setAuthor(oldEmbedSchema.author)
                                .setColor("#f2ff00")
                                .setThumbnail(botIdent().activeBot.icon)  
                            oldEmbedSchema.fields.forEach((i,index) => {
                                if (index < 5) { newEmbed.addFields({name: i.name, value: i.value, inline: i.inline }) }
                                if (index == 4) { newEmbed.addFields({ name: "Answer:", value: "```"+message.content+"```", inline: i.inline }) }
                            })

                            const row = new Discord.ActionRowBuilder()
                                .addComponents(new Discord.ButtonBuilder().setCustomId(`answerquestion-${message.author.id}`).setLabel('Next Question').setStyle(Discord.ButtonStyle.Success))
                            const editedEmbed = Discord.EmbedBuilder.from(newEmbed)
                            await previousMessageWithEmbed.edit({ embeds: [editedEmbed], components: [row] })

                            //leadership
                            const leadership_thread = await message.guild.channels.cache.get(response[0].leadership_threadId)
                            let leadership_lastMessage = await leadership_thread.messages.fetch({limit: 100})
                            for (let message of leadership_lastMessage.values()) {
                                if (message.embeds.length > 0) {
                                    leadership_lastMessage = message
                                    break
                                }
                            }
                            const leadership_receivedEmbed = leadership_lastMessage.embeds[0]
                            let leadership_oldEmbedSchema = {
                                author: leadership_receivedEmbed.author,
                                title: leadership_receivedEmbed.title,
                                description: leadership_receivedEmbed.description,
                                color: leadership_receivedEmbed.color,
                                fields: leadership_receivedEmbed.fields
                            } 
                            const leadership_newEmbed = new Discord.EmbedBuilder()
                                .setTitle(leadership_oldEmbedSchema.title)
                                .setDescription(leadership_oldEmbedSchema.description)
                                .setColor("#f2ff00")
                                .setAuthor(leadership_oldEmbedSchema.author)
                                .setThumbnail(botIdent().activeBot.icon)  
                                leadership_oldEmbedSchema.fields.forEach((i,index) => {
                                    if (index < 5) { leadership_newEmbed.addFields({name: i.name, value: i.value, inline: i.inline }) }
                                    if (index == 4) { leadership_newEmbed.addFields({ name: "Member Answer:", value: "```"+message.content+"```", inline: i.inline }) }
                                })
                            
                            await message.delete()
                            await leadership_lastMessage.edit({ embeds: [leadership_newEmbed] })
                        }
                        else {
                            message.delete()
                        }
                    } 
                    catch (err) {
                        console.log(err)
                        botLog(interaction.guild,new Discord.EmbedBuilder()
                            .setDescription('```js' + err.stack + '```')
                            .setTitle(`⛔ Fatal error experienced`)
                            ,2
                            ,'error'
                        )
                    }
                }
            }
        }
    },
    messageDelete: async (message, bot) => {
        if (!message.author.bot) {  
            try {
                botLog(bot,new Discord.EmbedBuilder().setDescription(`Message deleted by user: ${message.author}` + '```' + `${message.content}` + '```').setTitle(`Message Deleted 🗑️`),1)
            } catch (err) {
                botLog(bot,new Discord.EmbedBuilder().setDescription(`Something went wrong while logging a Deletion event: ${err}`).setTitle(`Logging Error`),2);
            }
        }
    },
    messageUpdate: async (oldMessage, newMessage, bot) => {
        if (oldMessage != newMessage && oldMessage.author.id != process.env.CLIENTID) {
            //Field values max char limit 1024
            //Description max char 4096 
            botLog(bot,new Discord.EmbedBuilder()
            .setDescription(`Message updated by user: ${oldMessage.author}` + '```' + `${oldMessage}` + '```')
            .setTitle(`Original Message 📝`),1)
            botLog(bot,new Discord.EmbedBuilder()
            .setDescription('```' + `${newMessage}` + '```' + `Message Link: ${oldMessage.url}`)
            .setTitle(`Updated Message📝`),1)
        }
    },
    guildMemberRemove: async (member, bot) => { 
        let roles = ``
        member.roles.cache.each(role => roles += `${role}\n`)
        botLog(bot,new Discord.EmbedBuilder()
        .setDescription(`User ${member.user.tag}(${member.displayName}) has left or was kicked from the server.`)
        .setTitle(`User Left/Kicked from Server`)
        .addFields(
            { name: `ID`, value: `${member.id}`},
            { name: `Date Joined`, value: `<t:${(member.joinedTimestamp/1000) >> 0}:F>`},
            { name: `Roles`, value: `${roles}`},
        ),2)
    },
    guildScheduledEventDelete: async (event) => { 
        if (botIdent().activeBot.botName == "GuardianAI") {
            //XSF specific
            try {
                const opord_number_values = [event.id]
                const opord_number_sql = 'SELECT opord_number FROM opord WHERE event_id = ?';
                const opord_number_response = await database.query(opord_number_sql, opord_number_values)
                const opordToDelete = opord_number_response[0].opord_number;
                if (opordToDelete) {
                    try {
                        const guild = event.guild;
                        // Get opord channels
                        let channel_await = null;
                        let channel_approved = null;
                        channel_await = event.guild.channels.cache.get(config[botIdent().activeBot.botName].operation_order.opord_channel_await); //logchannel or other.
                        channel_approved = event.guild.channels.cache.get(config[botIdent().activeBot.botName].operation_order.opord_channel_approved); //opord channel where approved op orders appear
                        if (!channel_await || !channel_approved) {
                            console.log("[CAUTION]".bgYellow, "channel_await or channel_approved Channel IDs dont match. Check config. Defaulting to Test Server configuration in the .env file.")
                            channel_await = event.guild.channels.cache.get(process.env.TESTSERVER_OPORD_AWAIT); //GuardianAI.env
                            channel_approved = event.guild.channels.cache.get(process.env.TESTSERVER_OPORD_APPROVED); //GuardianAI.env
                        }
                        //delete oporder and emssage
                        const delete_embed_opord_number_sql = 'SELECT approved_message_id,await_message_id FROM opord WHERE opord_number = ?';
                        const delete_embed_opord_number_response = await database.query(delete_embed_opord_number_sql, opordToDelete)
                        
                        const deleteThis_channel_approved = await channel_approved.messages.fetch(delete_embed_opord_number_response[0].approved_message_id)
                        const deleteThis_channel_await = await channel_await.messages.fetch(delete_embed_opord_number_response[0].await_message_id)
                        deleteThis_channel_approved.delete()
                        deleteThis_channel_await.delete()
                        
                        const delete_sql = 'DELETE FROM opord WHERE opord_number = ?';
                        await database.query(delete_sql, opordToDelete);
                        //update opord_number from the remaining rows
                        const update_sql = 'UPDATE opord SET opord_number = opord_number - 1 WHERE opord_number > ?';
                        await database.query(update_sql, opordToDelete);
                        //Get all remaining rows to update embed.
                        const embed_opord_number_sql = 'SELECT event_id,approved_message_id,await_message_id,creator FROM opord WHERE opord_number >= ?';
                        const embed_number_response = await database.query(embed_opord_number_sql, opordToDelete)
                        if (embed_number_response) {
                            function editedEmbed(lastMessage,creator) {
                                const new_opord_number = lastMessage.embeds[0].data.fields[0].value - 1
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
                                    if (index == 0) {
                                        newEmbed.addFields({ name: "Operation Order #", value: `${new_opord_number}`, inline: field.inline })
                                    }
                                    if (index > 0) {
                                        newEmbed.addFields({ name: field.name, value: field.value, inline: field.inline })
                                    }
                                })
                                
                                const editedEmbed = Discord.EmbedBuilder.from(newEmbed)
                                // console.log(editedEmbed)
                                lastMessage.edit({ embeds: [editedEmbed] })
                            }
                            // async function editEventList(event) {
                                
                            //     let description = event.description.split("\n")[0]
                            //     description = parseInt(description.match(/\d+/)[0]);
                            //     description = description - 1
                            //     // event[description] = description
                            //     event.edit({ description: description })
                            // }
                            embed_number_response.forEach(async items=>{
                                //modify the events list description for operation order
                                // const thisEvent = await channel_approved.guild.scheduledEvents.fetch(items.event_id)
                                // editEventList(thisEvent)
                                //modify the await and approved channels
                                const creator = guild.members.cache.get(items.creator.id)
                                const thisChannel_approved = await channel_approved.messages.fetch(items.approved_message_id)
                                editedEmbed(thisChannel_approved,creator)
                                const thisChannel_await = await channel_await.messages.fetch(items.await_message_id)
                                editedEmbed(thisChannel_await,creator)
                            })
                        }
    
                    } catch (error) {
                        // const dateTime = generateDateTime();
                        // console.log(dateTime,'⛔ guildScheduledEventDelete detected an event_id that did not exist. check database and verify opord_number are all in numerical order.')
                        console.log(error)
                    }
                }
            }
            catch (e) {
                //Required for events that are not in the database.
            }
        }
    }
}

module.exports = exp