const { botLog, botIdent } = require('../functions')
const { leaderboardInteraction } = require('../commands/Warden/leaderboards/leaderboard_staffApproval')
const { cleanup, AXIchallengeProof, nextTestQuestion, nextGradingQuestion, showPromotionChallenge, promotionChallengeResult } = require('../commands/GuardianAI/promotionRequest/requestpromotion')
const { saveBulkMessages, removeBulkMessages } = require('../commands/GuardianAI/promotionRequest/prFunctions')
const database = require(`../${botIdent().activeBot.botName}/db/database`)
const config = require('../config.json')

const Discord = require('discord.js')
const fs = require('fs')
const path = require('path')
const { default: test } = require('node:test')
let args = {}
function postArgs(interaction) {
    for (let key of interaction.options.data) {
        args[key.name] = key.value
    }
    return args
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
        .setCustomId('activeDuty')
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
        const [title,message] = submitted.fields.fields.map(i => i.value)
        return [submitted, title, message]

    }
}
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
                if (interaction.customId.startsWith("activeDuty")) {
                    await interaction.deferReply({ ephemeral: true });
                    const title = interaction.fields.getTextInputValue('title')
                    const description = interaction.fields.getTextInputValue('message')

                    const embed = new Discord.EmbedBuilder()
                        .setTitle(`${title}`)
                        .setDescription(`${description}`)
                        .setColor('#87FF2A') //bight green
                        // .setColor('#f20505') //bight red 
                        // .setColor('#f2ff00') //bight yellow
                        .setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                        .setThumbnail(botIdent().activeBot.icon)
                        // .setFooter({ text: `Notificiation from ${interaction.user.displayName}`, iconURL: interaction.user.displayAvatarURL({ dynamic: false })})
       
                        const channelObj = await interaction.guild.channels.fetch(`${args.channel}`)
                        const activeDutyId = () => {
                            if (process.env.MODE != "PROD") {
                                console.log("[CAUTION]".bgYellow, "knowledge proficiency embed channel required. Check config.json file. guardianai.general_stuff.active_duty_mention_authorization. Using testServer input if available")

                                return config[botIdent().activeBot.botName].general_stuff.testServer.active_duty_mention_roleId
                            }
                            else {
                                return config[botIdent().activeBot.botName].general_stuff.active_duty_mention_roleId
                            }
                        }
                        if (args.verbose == "yes") {
                            await channelObj.send(`<@&${activeDutyId()}>`)
                        }
                        await channelObj.send({ embeds: [embed] })
                        await interaction.editReply({ content: `Message sent to ${channelObj.url}`, ephemeral: true });
                        args = {}
                    return
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
            if (interaction.commandName === 'active_duty') {
                postArgs(interaction)
                modalStuff(interaction)
            }
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
                const rankTypes = {
                    "basic": "Aviator",
                    "advanced": "Lieutenant",
                    "master": "Captain",
                }
                const graderTypes = {
                    "basic": ["Captain","Major","Colonel", "General Staff"],
                    "advanced": ["Major","Colonel", "General Staff"],
                    "master": ["Colonel", "General Staff"]
                }
                if (interaction.customId.startsWith("answerquestion")) { //promotion request
                    interaction.deferUpdate();
                    interaction.message.edit({ components: [] })
                    const customId_array = interaction.customId.split("-")
                    const info = {
                        requestor: await guild.members.fetch(customId_array[1]),
                        currentRank: customId_array[2],
                        nextRank: customId_array[3]
                    }
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
                    const requestor = info.requestor
                    const rank_info = {
                        current: info.currentRank,
                        next: info.nextRank

                    }
                    nextTestQuestion(interaction,requestor,rank_info);
                    return;
                }
                if (interaction.customId.startsWith("startgradingtest")) { //promotion request
                    async function adjustEmbed(requestor,promotion,rank_info) {
                        const leadership_thread = await interaction.guild.channels.fetch(promotion.leadership_threadId)
                        const leadership_embedOld_msg = await leadership_thread.messages.fetch(promotion.leadership_embedId)
                        const leadership_embedOld = leadership_embedOld_msg.embeds[0]
                        const leadership_oldEmbedSchema = {
                            title: leadership_embedOld.title,
                            author: { name: requestor.displayName, iconURL: requestor.displayAvatarURL({ dynamic: true }) },
                            description: leadership_embedOld.description,
                            color: leadership_embedOld.color,
                            fields: leadership_embedOld.fields
                        }

                        const leadership_newEmbed = new Discord.EmbedBuilder()
                            .setTitle(leadership_oldEmbedSchema.title)
                            .setDescription(leadership_oldEmbedSchema.description)
                            // .setColor('#87FF2A') //bight green
                            // .setColor('#f20505') //bight red
                            // .setColor('#f2ff00') //bight yellow
                            .setColor(leadership_oldEmbedSchema.color) //bight yellow
                            .setAuthor(leadership_oldEmbedSchema.author)
                            .setThumbnail(botIdent().activeBot.icon)
                        leadership_oldEmbedSchema.fields.forEach(async (i, index) => {
                            leadership_newEmbed.addFields({ name: i.name, value: i.value, inline: i.inline })
                        })
                        const row = new Discord.ActionRowBuilder() 
                            .addComponents(new Discord.ButtonBuilder()
                                .setCustomId(`startgradingtest-${requestor.id}`)
                                .setLabel('Start Grading')
                                .setStyle(Discord.ButtonStyle.Success))
                        
                        await leadership_embedOld_msg.edit({ embeds: [leadership_newEmbed], components: [row] })
                        const blkMsg = await leadership_thread.send(`⛔<@${interaction.user.id}> rank (${Object.keys(rank_info.graderRank[0])}) is required.`)

                        bulkMessages.push({ message: blkMsg.id, thread: leadership_thread.id })
                        saveBulkMessages(requestor.user.id,bulkMessages)
                        
                        return 
                    }
                    interaction.deferUpdate()
                    let bulkMessages = []
                    const customId_array = interaction.customId.split("-")
                    const userId = customId_array[1]
                    let promotion = null
                    try { //Get DB info of thread
                        const values = [userId]
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
                    const rank_info = {
                        nextRank: rankTypes[promotion.testType],
                        xsf_ranks: function () {
                            if (process.env.MODE != "PROD") {
                                return config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer
                            }
                            else {
                                return config[botIdent().activeBot.botName].general_stuff.allRanks
                            }
                        },
                        pushIds: function(getRanks) {
                            getRanks.forEach(getRank => {
                                const requested_rank = this.xsf_ranks().find(x => x.rank_name === getRank)
                                return this.graderRank.push({[`${getRank}`]: requested_rank.id})
                            })
                        },
                        graderRank: []
                    }
                    rank_info.pushIds(graderTypes[promotion.testType])
                    const requestor = await guild.members.fetch(userId)
                    const grader = await guild.members.fetch(interaction.user.id)
                    let grader_roles = grader.roles.cache.map(role=>role.name)
                    grader_roles = grader_roles.filter(x=>x != '@everyone')
                    const approved_grader = grader_roles.some(role => rank_info.graderRank.some(grader => Object.keys(grader).includes(role))) 
                    if (!approved_grader) { 
                        adjustEmbed(requestor,promotion,rank_info)
                        return
                    }
                    
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
                    async function adjustEmbed(requestor,promotion,rank_info) {
                        const leadership_thread = await interaction.guild.channels.fetch(promotion.leadership_threadId)
                        const leadership_embedOld_msg = await leadership_thread.messages.fetch(promotion.leadership_embedId)
                        const leadership_embedOld = leadership_embedOld_msg.embeds[0]
                        const leadership_oldEmbedSchema = {
                            title: leadership_embedOld.title,
                            author: { name: requestor.displayName, iconURL: requestor.displayAvatarURL({ dynamic: true }) },
                            description: leadership_embedOld.description,
                            color: leadership_embedOld.color,
                            fields: leadership_embedOld.fields
                        }

                        const leadership_newEmbed = new Discord.EmbedBuilder()
                            .setTitle(leadership_oldEmbedSchema.title)
                            .setDescription(leadership_oldEmbedSchema.description)
                            // .setColor('#87FF2A') //bight green
                            // .setColor('#f20505') //bight red
                            // .setColor('#f2ff00') //bight yellow
                            .setColor(leadership_oldEmbedSchema.color) //bight yellow
                            .setAuthor(leadership_oldEmbedSchema.author)
                            .setThumbnail(botIdent().activeBot.icon)
                        leadership_oldEmbedSchema.fields.forEach(async (i, index) => {
                            leadership_newEmbed.addFields({ name: i.name, value: i.value, inline: i.inline })
                        })
                        const row = new Discord.ActionRowBuilder()
                            .addComponents(new Discord.ButtonBuilder().setCustomId(`grading-${promotion.userId}-c`).setLabel('Correct').setStyle(Discord.ButtonStyle.Success))
                            .addComponents(new Discord.ButtonBuilder().setCustomId(`grading-${promotion.userId}-w`).setLabel('Wrong').setStyle(Discord.ButtonStyle.Danger))
                        
                        await leadership_embedOld_msg.edit({ embeds: [leadership_newEmbed], components: [row] })
                        const blkMsg = await leadership_thread.send(`⛔<@${interaction.user.id}> rank (${Object.keys(rank_info.graderRank[0])}) is required.`)

                        bulkMessages.push({ message: blkMsg.id, thread: leadership_thread.id })
                        saveBulkMessages(requestor.user.id,bulkMessages)
                        
                        return 
                    }
                    let promotion = null
                    try { //Get DB info of thread
                        const values = [testInfo.userId]
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
                    const rank_info = {
                        nextRank: rankTypes[promotion.testType],
                        xsf_ranks: function () {
                            if (process.env.MODE != "PROD") {
                                return config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer
                            }
                            else {
                                return config[botIdent().activeBot.botName].general_stuff.allRanks
                            }
                        },
                        pushIds: function(getRanks) {
                            getRanks.forEach(getRank => {
                                const requested_rank = this.xsf_ranks().find(x => x.rank_name === getRank)
                                return this.graderRank.push({[`${getRank}`]: requested_rank.id})
                            })
                        },
                        graderRank: []
                    }
                    let bulkMessages = []
                    rank_info.pushIds(graderTypes[promotion.testType])
                    const requestor = await guild.members.fetch(testInfo.userId)
                    const grader = await guild.members.fetch(interaction.user.id)
                    let grader_roles = grader.roles.cache.map(role=>role.name)
                    grader_roles = grader_roles.filter(x=>x != '@everyone')
                    const approved_grader = grader_roles.some(role => rank_info.graderRank.some(grader => Object.keys(grader).includes(role)))
                    if (!approved_grader) { 
                        adjustEmbed(requestor,promotion,rank_info)
                        return
                    }
                    //Update progress number and save to database.
                    // console.log("continued".cyan)
                    try {
                        const values = [Number(score), testInfo.userId]
                        const sql = `UPDATE promotion SET score = score + (?), grading_number = grading_number + 1  WHERE userId = (?);`
                        const d = await database.query(sql, values)
                        if (d) {
                            // console.log('saved')
                            removeBulkMessages(testInfo.userId,interaction)
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
                    async function adjustEmbed(requestor,promotion,rank_info) {
                        const leadership_thread = await interaction.guild.channels.fetch(promotion.leadership_threadId)
                        const leadership_embedOld_msg = await leadership_thread.messages.fetch(promotion.challenge_leadership_embedId)
                        const leadership_embedOld = leadership_embedOld_msg.embeds[0]
                        const leadership_oldEmbedSchema = {
                            title: leadership_embedOld.title,
                            author: { name: requestor.displayName, iconURL: requestor.displayAvatarURL({ dynamic: true }) },
                            description: leadership_embedOld.description,
                            color: leadership_embedOld.color,
                            fields: leadership_embedOld.fields
                        }

                        const leadership_newEmbed = new Discord.EmbedBuilder()
                            .setTitle(leadership_oldEmbedSchema.title)
                            .setDescription(leadership_oldEmbedSchema.description)
                            // .setColor('#87FF2A') //bight green
                            // .setColor('#f20505') //bight red
                            // .setColor('#f2ff00') //bight yellow
                            .setColor(leadership_oldEmbedSchema.color) //bight yellow
                            .setAuthor(leadership_oldEmbedSchema.author)
                            .setThumbnail(botIdent().activeBot.icon)
                        leadership_oldEmbedSchema.fields.forEach(async (i, index) => {
                            leadership_newEmbed.addFields({ name: i.name, value: i.value, inline: i.inline })
                        })
                        const row = new Discord.ActionRowBuilder()
                                .addComponents(new Discord.ButtonBuilder().setCustomId(`promotionchallenge-approve-${requestor.user.id}`).setLabel('Approve').setStyle(Discord.ButtonStyle.Success))
                                .addComponents(new Discord.ButtonBuilder().setCustomId(`promotionchallenge-deny-${requestor.user.id}`).setLabel('Deny').setStyle(Discord.ButtonStyle.Danger))
                        
                        await leadership_embedOld_msg.edit({ embeds: [leadership_newEmbed], components: [row] })
                        const blkMsg = await leadership_thread.send(`⛔<@${interaction.user.id}> rank (${Object.keys(rank_info.graderRank[0])}) is required.`)
                        bulkMessages.push({ message: blkMsg.id, thread: leadership_thread.id })
                        saveBulkMessages(requestor.user.id,bulkMessages)
                        
                        return 
                    }
                    let promotion = null 
                    try { //Get DB info of thread
                        const values = [challengeInfo.userId]
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
                    const rank_info = {
                        nextRank: rankTypes[promotion.testType],
                        xsf_ranks: function () {
                            if (process.env.MODE != "PROD") {
                                return config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer
                            }
                            else {
                                return config[botIdent().activeBot.botName].general_stuff.allRanks
                            }
                        },
                        pushIds: function(getRanks) {
                            getRanks.forEach(getRank => {
                                const requested_rank = this.xsf_ranks().find(x => x.rank_name === getRank)
                                return this.graderRank.push({[`${getRank}`]: requested_rank.id})
                            })
                        },
                        graderRank: []
                    }
                    let bulkMessages = []
                    rank_info.pushIds(graderTypes[promotion.testType])
                    const requestor = await guild.members.fetch(challengeInfo.userId)
                    const grader = await guild.members.fetch(interaction.user.id)
                    let grader_roles = grader.roles.cache.map(role=>role.name)
                    grader_roles = grader_roles.filter(x=>x != '@everyone')
                    const approved_grader = grader_roles.some(role => rank_info.graderRank.some(grader => Object.keys(grader).includes(role)))
                    // console.log("promotion challenge approved_grader:",approved_grader, grader.displayName)
                    if (!approved_grader) { 
                        adjustEmbed(requestor,promotion,rank_info)
                        return
                    }
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
                            removeBulkMessages(challengeInfo.userId, interaction)
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
                    async function adjustEmbed(requestor,promotion,rank_info) {
                        const leadership_thread = await interaction.guild.channels.fetch(promotion.leadership_threadId)
                        const leadership_embedOld_msg = await leadership_thread.messages.fetch(promotion.leadership_roleEmbedId)
                        const leadership_embedOld = leadership_embedOld_msg.embeds[0]
                        const leadership_oldEmbedSchema = {
                            title: leadership_embedOld.title,
                            author: { name: requestor.displayName, iconURL: requestor.displayAvatarURL({ dynamic: true }) },
                            description: leadership_embedOld.description,
                            color: leadership_embedOld.color,
                            fields: leadership_embedOld.fields
                        }

                        const leadership_newEmbed = new Discord.EmbedBuilder()
                            .setTitle(leadership_oldEmbedSchema.title)
                            .setDescription(leadership_oldEmbedSchema.description)
                            // .setColor('#87FF2A') //bight green
                            // .setColor('#f20505') //bight red
                            // .setColor('#f2ff00') //bight yellow
                            .setColor(leadership_oldEmbedSchema.color) //bight yellow
                            .setAuthor(leadership_oldEmbedSchema.author)
                            .setThumbnail(botIdent().activeBot.icon)
                        leadership_oldEmbedSchema.fields.forEach(async (i, index) => {
                            leadership_newEmbed.addFields({ name: i.name, value: i.value, inline: i.inline })
                        })
                        const row = new Discord.ActionRowBuilder()
                            .addComponents(
                                new Discord.ButtonBuilder()
                                    .setCustomId(`axichallenge-approve-${requestor.user.id}-${promotion.testType}-${promotion.leadership_threadId}-${promotion.requestor_threadId}`)
                                    .setLabel('Approve')
                                    .setStyle(Discord.ButtonStyle.Success),
                                new Discord.ButtonBuilder()
                                    .setCustomId(`axichallenge-deny-${requestor.user.id}-${promotion.testType}-${promotion.leadership_threadId}-${promotion.requestor_threadId}`)
                                    .setLabel('Deny')
                                    .setStyle(Discord.ButtonStyle.Danger)
                            )
                        
                        await leadership_embedOld_msg.edit({ embeds: [leadership_newEmbed], components: [row] })
                        const blkMsg = await leadership_thread.send(`⛔<@${interaction.user.id}> rank (${Object.keys(rank_info.graderRank[0])}) is required.`)
                        bulkMessages.push({ message: blkMsg.id, thread: leadership_thread.id })
                        saveBulkMessages(requestor.user.id,bulkMessages)
                        
                        return 
                    }
                    let promotion = null
                    try { //Get DB info of thread
                        const values = [challengeInfo.userId]
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
                    const rank_info = {
                        nextRank: rankTypes[promotion.testType],
                        xsf_ranks: function () {
                            if (process.env.MODE != "PROD") {
                                return config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer
                            }
                            else {
                                return config[botIdent().activeBot.botName].general_stuff.allRanks
                            }
                        },
                        pushIds: function(getRanks) {
                            getRanks.forEach(getRank => {
                                const requested_rank = this.xsf_ranks().find(x => x.rank_name === getRank)
                                return this.graderRank.push({[`${getRank}`]: requested_rank.id})
                            })
                        },
                        graderRank: []
                    }
                    let bulkMessages = []
                    rank_info.pushIds(graderTypes[promotion.testType])
                    const requestor = await guild.members.fetch(challengeInfo.userId)
                    const grader = await guild.members.fetch(interaction.user.id)
                    let grader_roles = grader.roles.cache.map(role=>role.name)
                    grader_roles = grader_roles.filter(x=>x != '@everyone')
                    const approved_grader = grader_roles.some(role => rank_info.graderRank.some(grader => Object.keys(grader).includes(role)))
                    if (!approved_grader) { 
                        adjustEmbed(requestor,promotion,rank_info)
                        return
                    }
                    //Update progress number and save to database. 
                    try { 
                        let values = [Number(score), interaction.user.id, challengeInfo.userId] 
                        let sql = `UPDATE promotion SET axi_rolesCheck = -3 ,axiChallenge_state = (?), axiChallenge_reviewer = (?)  WHERE userId = (?);`
                        const d = await database.query(sql, values)
                        if (d) {
                            removeBulkMessages(challengeInfo.userId,interaction)
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
                                    .setLabel("Approve Promotion")
                                    .setStyle(Discord.ButtonStyle.Success)
                            )
                            .addComponents(
                                new Discord.ButtonBuilder()
                                    .setCustomId(`promotion-deny-${promotion.userId}-${info.promoter_rank}`)
                                    .setLabel("Deny Promotion")
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
                            .setDescription(`Congratulations on completing the ${nextRank} Promotion Request!`)
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
                                    { name: "Staff Promotion Decision", value: "```Approved```", inline: false}
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
                                    { name: "Staff Promotion Decision", value: "```Denied```", inline: false},
                                    { name: "Requestor Notified of Staff Promotion Decision", value: "```Notified```", inline: false},
                                    { name: "General Staff Recommendation", value: "``` Ensure Communication is conducted with requestor on Non-Promote decision```", inline: false},
                                )
                            
                           
                            requestor_potential_newEmbed
                                .setColor('#f20505')
                                .addFields(
                                    { name: "Promotion Request:", value: "```Denied```", inline: false },
                                    { name: "Reason:", value: "```Please wait to be contacted by General Staff```", inline: false }
                                )
                        }
   
                        await leadership_potential.edit({ embeds: [leadership_potential_newEmbed], components: [] })
                        await requestor_potential.edit({ embeds: [requestor_potential_newEmbed], components: [] })
                        await leadership_thread.setLocked(true)
                        cleanup(requestor,nextRank,promotionType,leadership_thread,requestor_potential)
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
                        },
                        allRanksIds: function(rank) {
                            if (process.env.MODE != "PROD") {
                                return config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.map(i => i)
                            }
                            else {
                                return config[botIdent().activeBot.botName].allRanks.map(i => i)
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
                    const nextRank = rankTypes[promotion.testType]
                    
                    if (!approved_promoter) {
                        notGeneralStaff(requestor,promotion,info)
                        return
                    }
                    if (approved_promoter && info.state == 'deny') {
                        const promotionType = false
                        adjustEmbed(requestor,promotion,promotionType,nextRank)
                        return
                    }
                    if (approved_promoter && info.state == 'approve') {
                        const promotionRole = interaction.guild.roles.cache.find(r => r.name === rankTypes[promotion.testType])
                        const demotionRole = interaction.guild.roles.cache.find(r => r.name === requestor_currentRank)
                        await requestor.roles.add(promotionRole)
                        await requestor.roles.remove(demotionRole)
                        const promotionType = true
                        adjustEmbed(requestor,promotion,promotionType,nextRank)
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