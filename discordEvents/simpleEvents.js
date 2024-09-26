const { generateDateTime, botLog, botIdent } = require('../functions')
const { nextTestQuestion } = require("../commands/GuardianAI/promotionRequest/requestpromotion")
const Discord = require('discord.js')
const database = require('../GuardianAI/db/database')
const config = require('../config.json')
let applyForRanks_guardianai = null
if (process.env.MODE != "PROD") {
    applyForRanks_guardianai = config[botIdent().activeBot.botName].general_stuff.testServer.knowledge_proficiency.embedChannel
    console.log("[CAUTION]".bgYellow, "knowledge proficiency embed channel required. Check config.json file. guardianai.general_stuff.knowledge_proficiency.embedChannel. Using testServer input if available")
}
else { applyForRanks_guardianai = config[botIdent().activeBot.botName].general_stuff.knowledge_proficiency.embedChannel }
const exp = {
    messageCreate: async (message, bot) => {
        if (botIdent().activeBot.botName == 'GuardianAI' && !message.author.bot) {
            let messageParent = message.channel.parentId
            if (messageParent == applyForRanks_guardianai) {
                // const embedChannelObj = await message.guild.channels.fetch(applyForRanks_guardianai)
                if (message.channel.name.includes("Submission")) {
                    console.log("winning")
                    try {
                        // const values = [message.author.id]
                        // const sql = `UPDATE promotion SET question_num = question_num + 1, ind = ind + 1 WHERE userId = (?);`
                        // await database.query(sql, values)
                        nextTestQuestion(message)
                    } catch (err) {
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
    guildScheduledEventDelete: async (event) => { //XSF specific
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

module.exports = exp