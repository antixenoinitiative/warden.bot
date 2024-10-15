const { botLog, botIdent } = require('../functions')
const { leaderboardInteraction } = require('../commands/Warden/leaderboards/leaderboard_staffApproval')
const { AXIchallengeProof, nextTestQuestion, nextGradingQuestion, showPromotionChallenge, promotionChallengeResult } = require('../commands/GuardianAI/promotionRequest/requestpromotion')
const database = require(`../${botIdent().activeBot.botName}/db/database`)
// if (botIdent().activeBot.botName == 'Warden') {
// }
const Discord = require('discord.js')
const fs = require('fs')
const path = require('path')
const { default: test } = require('node:test')

const exp = {
    interactionCreate: async (interaction,bot) => {
        //!isModalSubmit() is not 100% required, you can gather any modal replies from within the codebase your working from.
        //!Enabling this will cause issues with the Opord modals as they are initiated from a button response and do not contain
        //!   the interaction.commandName pathing. It is dealt with from the client code itself.
        if (interaction.isModalSubmit()) {
            if (botIdent().activeBot.botName == 'GuardianAI') {
                if (interaction.customId.startsWith("challengeProofModal")) {
                    interaction.deferUpdate()
                    console.log(interaction)
                    return;
                }
                // const command = interaction.client.commands.get(interaction.commandName);
    
                // if (!command) return;
    
                // try {
                //     await command.execute(interaction);
                // } catch (error) {
                //     console.error(error);
                //     await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
                // }
            }
        }
        if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName)

            if (!command) return console.log('Command not found')
            if (!command.autocomplete) {
                return console.error(`No autocomplete handler was found for the ${interaction.commandName} command.`,
                );
            }
            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(error);
            }
        }
        if (interaction.isCommand()) {
            const command = bot.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
        if (interaction.isButton()) {
            //! Placing function callers here allows you to not have to deal with message collectors.
            //! Message collectors have a timeout. This does not force you to use a collection timeframe.
            // if (botIdent().activeBot.botName != 'GuardianAI') {
            //     botLog(bot,new Discord.EmbedBuilder().setDescription(`Button triggered by user **${interaction.user.tag}** - Button ID: ${interaction.customId}`),0);
            // }
            if (botIdent().activeBot.botName == 'Warden') {
                if (interaction.customId.startsWith("submission")) {
                    interaction.deferUpdate()
                    leaderboardInteraction(interaction)
                    return;
                }
            }
            if (botIdent().activeBot.botName == 'GuardianAI') {
                if (interaction.customId.startsWith("answerquestion")) { //promotion request
                    interaction.deferUpdate();
                    interaction.message.edit({ components: [] })
                    try {
                        const messages = await interaction.channel.messages.fetch({ limit: 1 });
                        const previousMessageWithEmbed = messages.last();
                        const receivedEmbed = previousMessageWithEmbed.embeds[0]
                        let oldEmbedSchema = {
                            title: receivedEmbed.title,
                            description: receivedEmbed.description,
                            color: receivedEmbed.color,
                            fields: receivedEmbed.fields
                        } 
                        const newEmbed = new Discord.EmbedBuilder()
                            .setTitle(oldEmbedSchema.title)
                            .setDescription(oldEmbedSchema.description)
                            .setColor("#87FF2A")
                            .setThumbnail(botIdent().activeBot.icon)
                        oldEmbedSchema.fields.forEach((i,index) => {
                            newEmbed.addFields({name: i.name, value: i.value, inline: i.inline }) 
                        })

                        const editedEmbed = Discord.EmbedBuilder.from(newEmbed)
                        await previousMessageWithEmbed.edit({ embeds: [editedEmbed], components: [] })
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
                    nextTestQuestion(interaction);
                    return;
                }
                if (interaction.customId.startsWith("startgradingtest")) { //promotion request
                    interaction.deferUpdate()
                    nextGradingQuestion(interaction)
                    return;
                }
                if (interaction.customId.startsWith("grading")) { //grade and update database
                    interaction.deferUpdate()
                    interaction.message.edit({ components: [] })
                    const customId_array = interaction.customId.split("-")
                    const testInfo = {
                        userId: customId_array[1],
                        answer: customId_array[2]
                    }
                    let score = 0
                    if (testInfo.answer == 'c') { score = 1 }
                    if (testInfo.answer == 'w') { score = 0 }
                    if (testInfo.answer == 'wc') { score = 1 }
                    if (testInfo.answer == 'nc') { score = 0 }
                    //Update progress number and save to database.
                    try {
                        const values = [Number(score), testInfo.userId]
                        const sql = `UPDATE promotion SET score = score + (?), grading_number = grading_number + 1  WHERE userId = (?);`
                        const d = await database.query(sql, values)
                        if (d) {
                            // console.log('saved')
                            nextGradingQuestion(interaction) 
                        }
                    }
                    catch (err) {
                        console.log(err)
                        botLog(interaction.guild,new Discord.EmbedBuilder()
                            .setDescription('```' + err.stack + '```')
                            .setTitle(`⛔ Fatal error experienced`)
                            ,2
                            ,'error'
                        )
                    }
                    
                    return;
                }
                if (interaction.customId.startsWith("promotionchallenge")) { //grade and update database
                    interaction.deferUpdate()
                    interaction.message.edit({ components: [] })
                    const customId_array = interaction.customId.split("-")
                    const challengeInfo = {
                        state: customId_array[1],
                        userId: customId_array[2],
                        reviewer: interaction.user.id
                    }
                    let score = 0
                    if (challengeInfo.state == 'approve') { score = 1 }
                    if (challengeInfo.state == 'deny') { score = 0 }
                   
                    //Update progress number and save to database.
                    try {
                        let values = [Number(score), interaction.user.id, challengeInfo.userId]
                        let sql = null;
                        if (challengeInfo.state == 'approve') {
                            sql = `UPDATE promotion SET challenge_state = (?), grading_state = 4, challenge_reviewer = (?)  WHERE userId = (?);`
                        }
                        else {
                            sql = `UPDATE promotion SET challenge_state = (?), challenge_reviewer = (?)  WHERE userId = (?);`
                        }
                        const d = await database.query(sql, values)
                        if (d) {
                            // console.log('saved')
                            promotionChallengeResult(challengeInfo,interaction)
                        }
                    }
                    catch (err) {
                        console.log(err)
                        botLog(interaction.guild,new Discord.EmbedBuilder()
                            .setDescription('```' + err.stack + '```')
                            .setTitle(`⛔ Fatal error experienced`)
                            ,2
                            ,'error'
                        )
                    }
                    return;
                }
                if (interaction.customId.startsWith("challProofDenyConf")) { //grade and update database
                    interaction.deferUpdate()
                    interaction.message.edit({ components: [] })
                    const customId_array = interaction.customId.split("-")
                    const challengeInfo = {
                        state: 'deny',
                        user: { 
                            id: interaction.user.id
                        },
                        promotion: {
                            userId: interaction.user.id,
                            testType: customId_array[3],
                            leadership_threadId: customId_array[4],
                            requestor_threadId: customId_array[5],
                        },
                        reviewer: customId_array[2],
                    }
                    let score = 0
                    if (challengeInfo.state == 'approve') { score = 1 }
                    if (challengeInfo.state == 'deny') { score = 0 }
                   
                    //Update progress number and save to database.
                    try {
                        const values = [Number(score), interaction.user.id]
                        const sql = `UPDATE promotion SET challenge_state = (?)  WHERE userId = (?);`
                        const d = await database.query(sql, values)
                        if (d) {
                            // console.log('saved')
                            showPromotionChallenge(challengeInfo,interaction)
                        }
                    }
                    catch (err) {
                        console.log(err)
                        botLog(interaction.guild,new Discord.EmbedBuilder()
                            .setDescription('```' + err.stack + '```')
                            .setTitle(`⛔ Fatal error experienced`)
                            ,2
                            ,'error'
                        )
                    }
                    return;
                }
                if (interaction.customId.startsWith("axiRankRetry")) { //grade and update database
                    interaction.deferUpdate()
                    interaction.message.edit({ components: [] })
                    const customId_array = interaction.customId.split("-")
                    const userId = customId_array[1]
                    try {
                        const values = [userId]
                        const sql = `SELECT * FROM promotion WHERE userId = (?)`
                        const response = await database.query(sql, values)
                        if (response.length > 0) {
                            const requestor_thread = await guild.channels.fetch(response[0].requestor_threadId)
                            const leadership_thread = await guild.channels.fetch(response[0].leadership_threadId) 
                            const requestor_originalMessage = await requestor_thread.messages.fetch(response[0].requestor_scoreEmbedId)
                            const leadership_originalMessage = await leadership_thread.messages.fetch(response[0].grading_embedId)
                            const threadEmbeds = {requestor: requestor_originalMessage, leadership: leadership_originalMessage}
                            module.exports.showAXIroles(userId,threadEmbeds,response[0])
                        }
                    }
                    catch (err) {
                        console.log(err)
                        botLog(interaction.guild,new Discord.EmbedBuilder()
                            .setDescription('```' + err.stack + '```')
                            .setTitle(`⛔ Fatal error experienced`)
                            ,2
                            ,'error'
                        )
                    }
                    return
                }
                if (interaction.customId.startsWith("axichallengeProofDenyConf")) { //grade and update database
                    interaction.deferUpdate()
                    interaction.message.edit({ components: [] })
                    const customId_array = interaction.customId.split("-")
                    const challengeInfo = {
                        state: 'deny',
                        user: {
                            id: customId_array[2]
                        },
                        promotion: {
                            userId: customId_array[2],
                            testType: customId_array[3],
                            leadership_threadId: customId_array[4],
                            requestor_threadId: customId_array[5],
                        },
                        userId: customId_array[2]
                    }
                    
                    let score = null
                    if (challengeInfo.state == 'approve') { score = 1 }
                    if (challengeInfo.state == 'deny') { score = -3 }
                   
                    //Update progress number and save to database.
                    try {
                        const values = [Number(score), interaction.user.id]
                        const sql = `UPDATE promotion SET axiChallenge_state = (?)  WHERE userId = (?);`
                        const d = await database.query(sql, values)
                        if (d) {
                            console.log(challengeInfo)
                            AXIchallengeProof(challengeInfo,interaction)
                        }
                    }
                    catch (err) {
                        console.log(err)
                        botLog(interaction.guild,new Discord.EmbedBuilder()
                            .setDescription('```' + err.stack + '```')
                            .setTitle(`⛔ Fatal error experienced`)
                            ,2
                            ,'error'
                        )
                    }
                    return;
                }
                if (interaction.customId.startsWith("axichallenge")) { //grade and update database
                    interaction.deferUpdate()
                    interaction.message.edit({ components: [] })
                    const customId_array = interaction.customId.split("-")
                    const challengeInfo = {
                        state: customId_array[1],
                        userId: customId_array[2],
                        reviewer: interaction.user.id,
                        user: { id: customId_array[2] }
                    }
                    let score = 0
                    if (challengeInfo.state == 'approve') { score = 1 }
                    if (challengeInfo.state == 'deny') { score = -2 }
                   
                    //Update progress number and save to database.
                    try {
                        let values = [Number(score), interaction.user.id, challengeInfo.userId]
                        let sql = `UPDATE promotion SET axiChallenge_state = (?), axiChallenge_reviewer = (?)  WHERE userId = (?);`
                        const d = await database.query(sql, values)
                        if (d) {
                            AXIchallengeProof(challengeInfo, interaction)
                        }
                    }
                    catch (err) {
                        console.log(err)
                        botLog(interaction.guild,new Discord.EmbedBuilder()
                            .setDescription('```' + err.stack + '```')
                            .setTitle(`⛔ Fatal error experienced`)
                            ,2
                            ,'error'
                        )
                    }
                    return;
                }
            }
        }
        // else if (interaction.isSelectMenu()) {
        //     if (interaction.customId == "color-select") {
        //         let colors = "";
        //         await interaction.values.forEach(async value => {
        //             colors += `${value} `
        //         })
        //         await interaction.reply({ content: `Fav color ${colors}`, ephemeral: true})
        //     }
        // }
        // if (interaction.isButton()) {
        //     
        //     
        //     if (botIdent().activeBot.botName == 'GuardianAI') {
        //         const command = interaction.customId.startsWith(interaction.customId)
        //         if (!command) return;
        //         const slashCommandName = interaction.message.interaction.commandName.split(" ")[0]
        //         const thisFunction = require(`./interactions/${slashCommandName}`) 
        //         await thisFunction(interaction,bot)
                
        //         // console.log(interaction.id)
        //         // console.log(interaction.message.interaction.commandName)
        //         // console.log(interaction.user)
        //         // console.log(interaction.customId)
        //         // console.log(interaction.message.author.username)
        //     }
        // }
    }
}
module.exports = exp