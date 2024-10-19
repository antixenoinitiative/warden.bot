const { botLog, botIdent } = require('../functions')
const { leaderboardInteraction } = require('../commands/Warden/leaderboards/leaderboard_staffApproval')
const { AXIchallengeProof, nextTestQuestion, nextGradingQuestion, showPromotionChallenge, promotionChallengeResult } = require('../commands/GuardianAI/promotionRequest/requestpromotion')
const { saveBulkMessages, removeBulkMessages } = require('../commands/GuardianAI/promotionRequest/prFunctions')
const database = require(`../${botIdent().activeBot.botName}/db/database`)
const config = require('../config.json')

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
                    const customId_array = interaction.customId.split("-")
                    const userId = customId_array[1]
                    removeBulkMessages(userId,interaction)
                    nextGradingQuestion(userId,interaction)
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
                            
                            nextGradingQuestion(testInfo.userId,interaction) 
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
                            sql = `UPDATE promotion SET grading_state = 4, challenge_state = (?), challenge_reviewer = (?)  WHERE userId = (?);`
                            // console.log("4")
                        }
                        else {
                            // console.log('not4')
                            sql = `UPDATE promotion SET challenge_state = (?), challenge_reviewer = (?)  WHERE userId = (?);`
                        }
                        const d = await database.query(sql, values)
                        if (d) {
                            // console.log('saved')
                            // console.log("promotionChallengeResult(challengeInfo,interaction)".yellow, score)
                            removeBulkMessages(challengeInfo.userId,interaction)
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
                    if (challengeInfo.state == 'deny') { score = -2 }
                   
                    //Update progress number and save to database.
                    try {
                        const values = [Number(score), interaction.user.id]
                        const sql = `UPDATE promotion SET axi_rolesCheck = -2, axiChallenge_state = (?)  WHERE userId = (?);`
                        const d = await database.query(sql, values)
                        if (d) {
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
                    if (challengeInfo.state == 'deny') { score = -3 }
                   
                    //Update progress number and save to database. 
                    try { 
                        let values = [Number(score), interaction.user.id, challengeInfo.userId] 
                        let sql = `UPDATE promotion SET axi_rolesCheck = -3 ,axiChallenge_state = (?), axiChallenge_reviewer = (?)  WHERE userId = (?);`
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
                if (interaction.customId.startsWith("promotion")) {
                    async function notGeneralStaff(requestor,promotion,info) {
                        let bulkMessages = []
                        const leadership_thread = await interaction.guild.channels.fetch(promotion.leadership_threadId)
                        const leadership_potential = await leadership_thread.messages.fetch(promotion.leadership_potential_embedId)
                        const promotion_potential_embed = leadership_potential.embeds[0]
                        const leadership_oldEmbedSchema = {
                            title: promotion_potential_embed.title,
                            author: { name: requestor.displayName, iconURL: requestor.displayAvatarURL({ dynamic: true }) },
                            description: promotion_potential_embed.description,
                            color: promotion_potential_embed.color,
                            fields: promotion_potential_embed.fields
                        }
                        const leadership_potential_newEmbed = new Discord.EmbedBuilder()
                            .setTitle(leadership_oldEmbedSchema.title)
                            .setDescription(leadership_oldEmbedSchema.description)
                            // .setColor('#87FF2A') //bight green
                            // .setColor('#f20505') //bight red
                            // .setColor('#f2ff00') //bight yellow
                            .setColor(leadership_oldEmbedSchema.color) //bight yellow
                            .setAuthor(leadership_oldEmbedSchema.author)
                            .setThumbnail(botIdent().activeBot.icon)
                        leadership_oldEmbedSchema.fields.forEach(async (i, index) => {
                            leadership_potential_newEmbed.addFields({
                                name: i.name,
                                value: i.value,
                                inline: i.inline
                            })
                        })
                        
                        const promotion_components = new Discord.ActionRowBuilder()
                            .addComponents(
                                new Discord.ButtonBuilder()
                                    .setCustomId(`promotion-approve-${promotion.userId}-${info.promoter_rank}`)
                                    .setLabel("General Staff Approval")
                                    .setStyle(Discord.ButtonStyle.Success)
                            )
                            .addComponents(
                                new Discord.ButtonBuilder()
                                    .setCustomId(`promotion-deny-${promotion.userId}-${info.promoter_rank}`)
                                    .setLabel("General Staff Promotion")
                                    .setStyle(Discord.ButtonStyle.Danger)
                            )
                        
                        await leadership_potential.edit({ embeds: [leadership_potential_newEmbed], components: [promotion_components] })
                        const blkMsg = await leadership_thread.send(`⛔ <@${interaction.user.id}> Promotion Approval/Denial can only be conducted by: ${JSON.stringify(info.promoter_rank)} `);
                        bulkMessages.push({ message: blkMsg.id, thread: promotion.leadership_threadId })
                        saveBulkMessages(promotion.userId,bulkMessages)
                        return
                    }
                    async function adjustEmbed(requestor,promotion,promotionType,nextRank) {
                        const leadership_thread = await interaction.guild.channels.fetch(promotion.leadership_threadId)
                        const requestor_thread = await interaction.guild.channels.fetch(promotion.requestor_threadId)
                        const leadership_potential = await leadership_thread.messages.fetch(promotion.leadership_potential_embedId)
                        const requestor_potential = await requestor_thread.messages.fetch(promotion.requestor_potential_embedId)
                        const leadership_promotion_potential_embed = leadership_potential.embeds[0]
                        const requestor_promotion_potential_embed = requestor_potential.embeds[0]
                        const leadership_oldEmbedSchema = {
                            title: leadership_promotion_potential_embed.title,
                            author: { name: requestor.displayName, iconURL: requestor.displayAvatarURL({ dynamic: true }) },
                            description: leadership_promotion_potential_embed.description,
                            color: leadership_promotion_potential_embed.color,
                            fields: leadership_promotion_potential_embed.fields
                        }
                        const requestor_oldEmbedSchema = {
                            title: requestor_promotion_potential_embed.title,
                            author: { name: requestor.displayName, iconURL: requestor.displayAvatarURL({ dynamic: true }) },
                            description: requestor_promotion_potential_embed.description,
                            color: requestor_promotion_potential_embed.color,
                            fields: requestor_promotion_potential_embed.fields
                        }
                        const leadership_potential_newEmbed = new Discord.EmbedBuilder()
                            .setTitle(leadership_oldEmbedSchema.title)
                            .setDescription(leadership_oldEmbedSchema.description)
                            // .setColor('#87FF2A') //bight green
                            // .setColor('#f20505') //bight red
                            // .setColor('#f2ff00') //bight yellow
                            .setColor(leadership_oldEmbedSchema.color) //bight yellow
                            .setAuthor(leadership_oldEmbedSchema.author)
                            .setThumbnail(botIdent().activeBot.icon)
                        leadership_oldEmbedSchema.fields.forEach(async (i, index) => {
                            if (index == 2) { leadership_potential_newEmbed.addFields({ name: "Promotion Discussion:", value: "All final statements have been recorded. See below", inline: i.inline }) }
                            if (index > 2) { leadership_potential_newEmbed.addFields({ name: i.name, value: i.value, inline: i.inline }) }
                        })
                        const requestor_potential_newEmbed = new Discord.EmbedBuilder()
                            .setTitle(requestor_oldEmbedSchema.title)
                            .setDescription(`Congradulations on completing the ${nextRank} Promotion Request!`)
                            // .setColor('#87FF2A') //bight green
                            // .setColor('#f20505') //bight red
                            // .setColor('#f2ff00') //bight yellow
                            .setColor(requestor_oldEmbedSchema.color) //bight yellow
                            .setAuthor(requestor_oldEmbedSchema.author)
                            .setThumbnail(botIdent().activeBot.icon)
                            
                        if (promotionType) { 
                            leadership_potential_newEmbed
                                .setColor('#87FF2A')
                                .addFields(
                                    { name: "General Officer Promotion Decision", value: "```Approved```", inline: false}
                                )
                            requestor_potential_newEmbed
                                .setColor('#87FF2A')
                                .addFields(
                                    { name: "Promotion Request:", value: "```Approved```", inline: true },
                                    { name: "Rank Awarded:", value: "```"+nextRank+"```", inline: true },
                                    { name: "Application Status:", value: "```Completed```", inline: true },
                                    { name: "Broadcasting Promotion...", value: "```Completed```", inline: true }
                                )
                        }
                        else { 
                            leadership_potential_newEmbed
                                .setColor('#f20505')
                                .addFields(
                                    { name: "General Officer Promotion Decision", value: "```Denied```", inline: false}
                                )
                            requestor_potential_newEmbed
                                .setColor('#f20505')
                                .addFields(
                                    { name: "Promotion Request:", value: "```Denied```", inline: false },
                                    { name: "Reason:", value: "``` Please Await for Contact from General Staff```", inline: false }
                                )
                        }
                        
                        await leadership_potential.edit({ embeds: [leadership_potential_newEmbed], components: [] })
                        await requestor_potential.edit({ embeds: [requestor_potential_newEmbed], components: [] })
                        await leadership_thread.setLocked(true)
                        //Thread already locked
                        // await requestor_thread.setLocked(true)
                        try {
                            const values = [promotion.userId]
                            const sql = `UPDATE promotion SET grading_state = 5 WHERE userId = (?);`
                            await database.query(sql, values) 
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
                    interaction.deferUpdate()
                    interaction.message.edit({ components: [] })
                    const rankTypes = {
                        "basic": "Aviator",
                        "advanced": "Lieutenant",
                        "master": "Captain",
                    }
                    const customId_array = interaction.customId.split("-")
                    const info = {
                        promoter: interaction.user.id,
                        state: customId_array[1],
                        userId: customId_array[2],
                        promoter_rank: customId_array[3],
                        allRanks: function() {
                            if (process.env.MODE != "PROD") {
                                return config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.map(i => i.rank_name)
                            }
                            else {
                                return config[botIdent().activeBot.botName].allRanks.map(i => i.rank_name)
                            }
                        }
                    }
                    let promotion = null
                    try { //Get DB info of thread
                        const values = [info.userId]
                        const sql = 'SELECT * FROM `promotion` WHERE userId = (?)'
                        const response = await database.query(sql,values)
                        if (response.length > 0) {
                            promotion = response[0]
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
                    removeBulkMessages(promotion.userId, interaction)
                    const requestor = await guild.members.fetch(info.userId)
                    let requestor_roles = requestor.roles.cache.map(role=>role.name)
                    requestor_roles = requestor_roles.filter(x=>x != '@everyone')
                    const requestor_currentRank = requestor_roles.find(rank => info.allRanks().includes(rank))


                    const promoter = await guild.members.fetch(info.promoter)
                    let promoter_roles = promoter.roles.cache.map(role=>role.name)
                    promoter_roles = promoter_roles.filter(x=>x != '@everyone')
                    const approved_promoter = promoter_roles.some(rank => info.promoter_rank.includes(rank))
                    if (approved_promoter && info.state == 'deny') {
                        const nextRank = false
                        const promotionType = false
                        adjustEmbed(requestor,promotion,promotionType,nextRank)
                        return
                    }
                    if (approved_promoter && info.state == 'approve') {
                        const promotionRole = interaction.guild.roles.cache.find(r => r.name === rankTypes[promotion.testType])
                        const demotionRole = interaction.guild.roles.cache.find(r => r.name === requestor_currentRank)
                        await requestor.roles.add(promotionRole)
                        await requestor.roles.remove(demotionRole)
                        const nextRank = rankTypes[promotion.testType]
                        const promotionType = true
                        adjustEmbed(requestor,promotion,promotionType,nextRank)
                        return
                    }
                    if (!approved_promoter) {
                        notGeneralStaff(requestor,promotion,info)
                        return
                    }

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