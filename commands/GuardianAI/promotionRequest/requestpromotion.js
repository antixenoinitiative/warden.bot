const Discord = require("discord.js");
const { botIdent, getRankEmoji, botLog } = require('../../../functions')
const { requestInfo } = require('../../../socket/taskManager')
const config = require('../../../config.json')
let bos = null;
if (botIdent().activeBot.botName == 'GuardianAI') { bos = require(`../../../GuardianAI/bookofsentinel/bos.json`) }
const database = require(`../../../${botIdent().activeBot.botName}/db/database`)

function capitalizeWords(str) {
    return str.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}
function createProgressBar(percentage, totalBars = 20) {
    const progress = Math.round((percentage / 100) * totalBars) // Calculate the number of bars to fill
    const emptyBars = totalBars - progress

    const progressBar = '█'.repeat(progress) + '▬'.repeat(emptyBars) // Filled bars + empty bars
    return progressBar
}
function getPercentage(part, whole) {
    if (whole === 0) return 0 // Avoid division by zero
    return ((part / whole) * 100).toFixed(2)
}
//206440307867385857  Absence of Gravitas
module.exports = {
    promotionChallengeResult: async function (data,interaction) {
        try {
            const values = [data.userId]
            const sql = 'SELECT * FROM `promotion` WHERE userId = (?)'
            const response = await database.query(sql,values)
            if (response.length > 0) {
                const challenge_score = response[0].challenge_state == 1 ? "Approved" : "Denied"
                const challenge_score_color = response[0].challenge_state == 1 ? '#87FF2A' : '#F20505'
                const leadership_thread = await interaction.guild.channels.fetch(response[0].leadership_threadId)
                const requestor_thread = await interaction.guild.channels.fetch(response[0].requestor_threadId)
                const requestor = await guild.members.fetch(data.userId)
                const leadership_challenge = await leadership_thread.messages.fetch(response[0].challenge_leadership_embedId)

                const requestor_challenge = await requestor_thread.messages.fetch(response[0].challenge_requestor_embedId)
                if (response[0].challenge_state == 0) {
                    await leadership_thread.send("❌ Please use the Chatbox to explain the denial. The denial will not complete until this has been done.")
                }
                if (response[0].challenge_state == 1) {
                    const leadership_receivedEmbed = leadership_challenge.embeds[0]
                    const oldEmbedSchema = {
                        title: leadership_receivedEmbed.title,
                        author: { name: requestor.displayName, iconURL: requestor.user.displayAvatarURL({ dynamic: true }) },
                        description: leadership_receivedEmbed.description,
                        color: leadership_receivedEmbed.color,
                        fields: leadership_receivedEmbed.fields
                    }
                    const newEmbed = new Discord.EmbedBuilder()
                        .setTitle(oldEmbedSchema.title)
                        .setDescription(`Challenge Proof Reviewed by Leadership`)
                            // .setColor('#87FF2A') //bight green
                            // .setColor('#f20505') //bight red
                            // .setColor('#f2ff00') //bight yellow
                        .setAuthor(oldEmbedSchema.author)
                        .setThumbnail(botIdent().activeBot.icon)
    
                    newEmbed.setColor(challenge_score_color)
                    let rank_emoji = await getRankEmoji(interaction);
                    if (rank_emoji == null) { rank_emoji == "" }
                    oldEmbedSchema.fields.forEach((i,index) => {
                        if (index == 0) { newEmbed.addFields({name: i.name, value: i.value, inline: i.inline}) }
                        if (index == 1) { newEmbed.addFields({ name: "Promotion Challenge Status", value: "```" + challenge_score + "```", inline: true }) }
                        if (index == 2) { newEmbed.addFields({name: i.name, value: i.value, inline: i.inline}) }
                        if (index == 3) { newEmbed.addFields({name: "Reviewed By", value: `${rank_emoji}<@${data.reviewer}>`, inline: i.inline}) }
                    })
                    await leadership_challenge.edit( { embeds: [newEmbed], components: [] } )
                    await requestor_challenge.edit( { embeds: [newEmbed] } )
                    if (response[0].score >= 80) {
                        await leadership_thread.send("# Leadership Potentail\n Team, please discuss this Promotion Request and the applicant's leadership potential.\n- Consider things such as: Communication on the battlefield, How their presence exudes leadership, Does this person show leadership qualities.\n- For all intents and purposes, the requestor should only be held back if there are significant issues with their ability to communicate effectively.")
                    }
                    if (response[0].score < 80) {
                        await leadership_thread.send(`# Knowledge Proficiency Test Score: ${response[0].score }`)
                        await leadership_thread.send(`- User has all prerequisites other than the failing test.`)
                    }
                    await requestor_thread.setLocked(true)
                }
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
    },
    showPromotionChallenge: async function (data) {
        const testTypes = {
            "basic": "Aviator",
            "advanced": "Lieutenant",
            "master": "Captain",
        }
        const requestor = await guild.members.fetch(data.user.id)
        const leadership_newEmbed = new Discord.EmbedBuilder()
            .setTitle(`Promotion Challenege Proof`)
            .setDescription(`Waiting on requestor to submit Promotion Challenge Proof.`)
            .setColor("#f2ff00")
                // .setColor('#87FF2A') //bight green
                // .setColor('#f20505') //bight red
                // .setColor('#f2ff00') //bight yellow
            .setAuthor({ name: requestor.displayName, iconURL: requestor.user.displayAvatarURL({ dynamic: true }) })
            .setThumbnail(botIdent().activeBot.icon)
            .addFields(
                { name: "Promotion Rank", value: "```" + testTypes[data.promotion.testType] + "```", inline: true },
                { name: "Promotion Challenge Status", value: "```" + 'Pending....' + "```", inline: true },
            )
        const requestor_newEmbed = new Discord.EmbedBuilder()
            .setTitle(`Promotion Challenege Proof`)
            .setDescription(`Submit the link for the Promotion Challenge. Type into the chatbox. Example: https://www.youtube.com`)
            .setColor("#f2ff00")
                // .setColor('#87FF2A') //bight green
                // .setColor('#f20505') //bight red
                // .setColor('#f2ff00') //bight yellow
            .setAuthor({ name: requestor.displayName, iconURL: requestor.user.displayAvatarURL({ dynamic: true }) })
            .setThumbnail(botIdent().activeBot.icon)
            .addFields(
                { name: "Promotion Rank", value: "```" + testTypes[data.promotion.testType] + "```", inline: true },
                { name: "Promotion Challenge Status", value: "```" + 'Pending....' + "```", inline: true },
            )
            const leadership_thread = await guild.channels.fetch(data.promotion.leadership_threadId)
            const requestor_thread = await guild.channels.fetch(data.promotion.requestor_threadId)
            await requestor_thread.setLocked(false)
            const leadership_embedId = await leadership_thread.send( { embeds: [leadership_newEmbed]} )
            const requestor_embedId = await requestor_thread.send( { embeds: [requestor_newEmbed]} )

            try {
                const values = [requestor_embedId.id,leadership_embedId.id,data.promotion.userId]
                const sql = `UPDATE promotion SET grading_state = 3, challenge_requestor_embedId = (?), challenge_leadership_embedId = (?) WHERE userId = (?);`
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


    },
    showAXIroles: async function (userId,threadEmbeds,promotion) {
        let person_asking = userId
        const subject = guild.members.cache.get(userId)
        const member = guild.members.cache.get(userId)
        let roles = member.roles.cache.map(role=>role.name)
        roles = roles.filter(x=>x != '@everyone')
        let rolePackage = {
            commandAsk: "promotion",
            commandChan: [threadEmbeds.requestor.channel.id,threadEmbeds.leadership.channel.id],
            promotion: promotion,
            type: "roles_request",
            user: subject.user,
            roles: roles,
            person_asking: person_asking
        }
        await requestInfo(rolePackage)
        //review taskManager.js roles_return_data and have it submit promotion embeds.
    },
    viewExperienceCredit: async function(userId,threadEmbeds,interaction,promotion) {
        try {
            async function getName(inputArray,inputName) {
                let ranks = []
                inputArray.forEach(i => {
                    if (i.participant_uniform != null) {
                        // const multi2 = JSON.parse(`[${i.opord_number}]`);
                        // console.log(multi2)
                        const multi = JSON.parse(`[${i.participant_uniform}]`);
                        // console.log(multi)
                        multi.forEach(single => {
                            if (single.userId == inputName) {
                                if (!ranks.find(i=>i[single.rank])) {
                                    ranks.push({ [single.rank]:1 })
                                }
                                else {
                                    const foundObject = ranks.find(obj => obj.hasOwnProperty(single.rank));
                                    if (foundObject) { foundObject[single.rank]++ }
                                }
                            }
                        })
                    }
                })
                let listRanks = config[botIdent().activeBot.botName].general_stuff.allRanks
                if (!listRanks) { 
                    listRanks = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer
                    if (!listRanks) { 
                        console.log("[config.js], No general_stuff.testServer.allRanks_testServer Found for experience.js for test server".red); 
                        return
                    }
                }
                const listedRanks = []
                listRanks.forEach(i=>{ listedRanks.push(i.rank_name) })
                function customSort(array, order) {
                    // Create a map to hold the indices of each element in the order array
                    const orderMap = new Map();
                    order.forEach((item, index) => {
                      orderMap.set(item, index);
                    });
                  
                    // Custom sorting function based on the order map
                    array.sort((a, b) => {
                      const indexA = orderMap.get(Object.keys(a)[0]);
                      const indexB = orderMap.get(Object.keys(b)[0]);
                      return indexA - indexB;
                    });
                  
                    return array;
                  }
                const sortedArray = customSort(ranks,listedRanks)
                return sortedArray
            }
            const values = false
            const sql = 'SELECT participant_uniform FROM `opord`';
            const response = await database.query(sql,values)
            if (response.length > 0 ) {
                const userName = await interaction.guild.members.fetch(userId)
                const ranks = [await getName(response,userId)]
    
                let embed = new Discord.EmbedBuilder()
                    .setTitle('Experience Credit')
                    .setAuthor({ name: userName.displayName, iconURL: userName.user.displayAvatarURL({ dynamic: true }) })
                    .setThumbnail(botIdent().activeBot.icon)
                    .setColor('#87FF2A') //87FF2A green
                    // .setColor('#FAFA37') //87FF2A green
                    .setDescription(`Ranks Experience Credit was given as:`)
                    
                
                ranks.forEach((rankGroup,index) => {
                    // console.log(index,Object.values(rankGroup))
                    embed.addFields({ name: "\u200B", value: `<@${userId}>`, inline: false })
                    // embed.addFields({ name: "\u200B", value: `**${discordUser[index].nickname}**`, inline: false })
                    Object.values(rankGroup).forEach((rank,index) => {
                        const rankVALUE = "```" + Object.values(rank)[0] + "```"
                        embed.addFields({ name: Object.keys(rank)[0], value: rankVALUE, inline: true })
                    })
                })
                await threadEmbeds.requestor.channel.send({embeds: [embed]})
                await threadEmbeds.leadership.channel.send({embeds: [embed]})
                module.exports.showAXIroles(userId,threadEmbeds,promotion)
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
 
    },
    nextGradingQuestion: async function(interaction) {
        let promotion = null
        //Get database stuff
        try {
            const values = false
            const sql = `SELECT * FROM promotion`
            const response = await database.query(sql, values)
            if (response.length > 0) { promotion = response[0] }
            else {
                //do code to editReply to the embed saying there was no database info for this test.
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
        // console.log("grading progress:",promotion.grading_progress)
        let percentage = 
        promotion.grading_number == 0 
            ? getPercentage(0, promotion.question_num) 
            : getPercentage(promotion.grading_number, promotion.question_num)


        const progressBar = createProgressBar(percentage)
        // console.log("promotion information:\n",JSON.parse(promotion.requestor_embedId))
        const requestor_thread = await guild.channels.fetch(promotion.requestor_threadId)
        const leadership_thread = await guild.channels.fetch(promotion.leadership_threadId)
        //Change the grading embed for the requestor
        try {
            const requestor_previousMessageWithEmbed = await requestor_thread.messages.fetch(promotion.requestor_scoreEmbedId)
            // const requestor_previousMessageWithEmbed = scoreEmbedId.first()
            const requestor_receivedEmbed = requestor_previousMessageWithEmbed.embeds[0]
            let requestor_oldEmbedSchema = {
                title: requestor_receivedEmbed.title,
                description: requestor_receivedEmbed.description,
                color: requestor_receivedEmbed.color,
                fields: requestor_receivedEmbed.fields
            }
            const requestor_newEmbed = new Discord.EmbedBuilder()
                .setTitle(requestor_oldEmbedSchema.title)
                .setDescription(requestor_oldEmbedSchema.description)
                .setColor("#87FF2A")
                .setThumbnail(botIdent().activeBot.icon)
                requestor_oldEmbedSchema.fields.forEach((i,index) => {
                if (index == 0) {
                    requestor_newEmbed.addFields( 
                        { name: i.name, value: `${progressBar} ${percentage}%`, inline: false }
                    )
                }
                else {
                    requestor_newEmbed.addFields({name: i.name, value: i.value, inline: false })
                }
            })
            const requestor_editedEmbed = Discord.EmbedBuilder.from(requestor_newEmbed)
            await requestor_previousMessageWithEmbed.edit({ embeds: [requestor_editedEmbed], components: [] })
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
        //If the test is done, calculate the score and save it to database.
        if (promotion.grading_number == promotion.question_num) {
            try {
                let final_score = getPercentage(promotion.score, promotion.question_num)
                const score_color = final_score >= 80 ? "#87FF2A" : "#f20505"
                const leadership_originalMessage = await leadership_thread.messages.fetch(promotion.grading_embedId)
                const leadership_receivedEmbed = leadership_originalMessage.embeds[0]
                let leadership_oldEmbedSchema = {
                    title: leadership_receivedEmbed.title,
                    description: leadership_receivedEmbed.description,
                    color: leadership_receivedEmbed.color,
                    fields: leadership_receivedEmbed.fields
                }
                const leadership_newEmbed = new Discord.EmbedBuilder()
                    .setTitle(`${capitalizeWords(promotion.testType)} Knowledge Proficiency Test`)
                    .setDescription("The test has been graded and scored")
                        // .setColor('#87FF2A') //bight green
                        // .setColor('#f20505') //bight red
                        // .setColor('#f2ff00') //bight yellow
                    .setThumbnail(botIdent().activeBot.icon)
                    leadership_oldEmbedSchema.fields.forEach((i,index) => {
                    if (index == 0) { leadership_newEmbed.addFields({name: i.name, value: i.value, inline: i.inline}) }
                    if (index == 2) { leadership_newEmbed.addFields({ name: "Score:", value: "```"+final_score+"%```", inline: false }) }
                })
                leadership_newEmbed.setColor(score_color)
                if (final_score < 80) { 
                    leadership_newEmbed.addFields({ name: "Test Retake Required", value: "Final score was less than 80%, test retake starting.", inline: false})
                }
                

                const requestor_originalMessage = await requestor_thread.messages.fetch(promotion.requestor_scoreEmbedId)
                const requestor_receivedEmbed = requestor_originalMessage.embeds[0]
                let requestor_oldEmbedSchema = {
                    title: requestor_receivedEmbed.title,
                    description: requestor_receivedEmbed.description,
                    color: requestor_receivedEmbed.color,
                    fields: requestor_receivedEmbed.fields
                }
                const requestor_newEmbed = new Discord.EmbedBuilder()
                    .setTitle(requestor_oldEmbedSchema.title)
                    .setDescription(requestor_oldEmbedSchema.description)
                    .setColor(requestor_oldEmbedSchema.color)
                    .setThumbnail(botIdent().activeBot.icon)
                    requestor_oldEmbedSchema.fields.forEach((i,index) => {
                        if (index == 0) { requestor_newEmbed.addFields({name: i.name, value: i.value, inline: i.inline}) }
                        if (index == 1) { requestor_newEmbed.addFields({ name: "Score:", value: "```"+final_score+"%```", inline: false }) }
                    })
                requestor_newEmbed.setColor(score_color)
                if (final_score < 80) { 
                    requestor_newEmbed.addFields({ name: "Test Retake Required", value: "Final score was less than 80%, test retake starting.", inline: false})
                }
                
                if (final_score >= 80) {
                    try {
                        const leadership_editedEmbed = Discord.EmbedBuilder.from(leadership_newEmbed)
                        await leadership_originalMessage.edit({ embeds: [leadership_editedEmbed], components: [] })
                        const requestor_editedEmbed = Discord.EmbedBuilder.from(requestor_newEmbed)
                        await requestor_originalMessage.edit({ embeds: [requestor_editedEmbed], components: [] })
                        const threadEmbeds = {requestor: requestor_originalMessage, leadership: leadership_originalMessage}
                        const values = [final_score,promotion.userId]
                        const sql = `UPDATE promotion SET score = (?), grading_state = 2 WHERE userId = (?);`
                        await database.query(sql, values)
                        await module.exports.viewExperienceCredit(promotion.userId,threadEmbeds,interaction,promotion)
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
                }
                if (final_score < 80) {
                    //todo force user to retake the test. 
                    try {
                        
                        const leadership_editedEmbed = Discord.EmbedBuilder.from(leadership_newEmbed)
                        await leadership_originalMessage.edit({ embeds: [leadership_editedEmbed], components: [] })
                        const requestor_editedEmbed = Discord.EmbedBuilder.from(requestor_newEmbed)
                        await requestor_originalMessage.edit({ embeds: [requestor_editedEmbed], components: [] })
                        const values = [final_score,promotion.userId]
                        const sql = `UPDATE promotion SET score = (?), requestor_embedId = '[]', section = 'researchability', ind = 0, grading_embedId = NULL, grading_state = 0, question_num = 0, grading_number = 0, grading_progress = -1 WHERE userId = (?);`
                        const d = await database.query(sql, values)
                        if (d) { 
                            module.exports.nextTestQuestion(interaction)
                            await requestor_thread.setLocked(false)
                            console.log("retake test")
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
        }
        //Continue grading
        else {
            try {
            //Start cycling through the embeds and allowing the grader to work through them
                const question_embedIds = JSON.parse(promotion.requestor_embedId)
                const next_gradingEmbed = question_embedIds[promotion.grading_number]
                const requestor_next_gradingEmbed = await requestor_thread.messages.fetch(next_gradingEmbed) 
                const requestor_receivedEmbed = requestor_next_gradingEmbed.embeds[0]
                let requestor_oldEmbedSchema = {
                    title: requestor_receivedEmbed.title,
                    description: requestor_receivedEmbed.description,
                    color: requestor_receivedEmbed.color,
                    fields: requestor_receivedEmbed.fields
                }
                const requestor_newEmbed = new Discord.EmbedBuilder()
                    .setTitle(requestor_oldEmbedSchema.title)
                    .setDescription(requestor_oldEmbedSchema.description) 
                    .setColor("#87FF2A")
                    .setThumbnail(botIdent().activeBot.icon)
                    let bosData = null
                    let indexes = { ind: null, ele: null }
                    let testAnswer = null
                    requestor_oldEmbedSchema.fields.forEach((i,index) => {  
                        if (index == 0) {
                            requestor_newEmbed.addFields({name: i.name, value: i.value, inline: i.inline })
                        }
                        if (index == 1)  {
                            let value = i.value 
                            const vals = value.split("-")
                            indexes.ind = vals[0].replace(/`/g,"")
                            indexes.ele = vals[1].replace(/`/g,"")
                            requestor_newEmbed.addFields({name: i.name, value: i.value, inline: i.inline })
                        }
                        if (index == 2) { 
                            bosData = i.value
                            bosData = bosData.replace(/`/g, "").toLowerCase().split("-").map(item => item.trim())
                            const section = bosData[1]
                            const testType = bosData[0]
                            testAnswer = bos[section][testType][indexes.ind].answers[indexes.ele]
                            requestor_newEmbed.addFields({name: i.name, value: i.value, inline: i.inline })
                        }
                        if (index == 4) {
                            requestor_newEmbed.addFields(
                                { name: "Test Question:", value: i.value, inline: true },
                                { name: "Test Answer:", value: "```"+ testAnswer +"```", inline: true }
                            )
                        }
                        if (index == 5) {
                            requestor_newEmbed.addFields(
                                { name: "Player Answer:", value: i.value , inline: false }
                            )
                        }
                    })
                const row = new Discord.ActionRowBuilder()
                    .addComponents(new Discord.ButtonBuilder().setCustomId(`grading-${promotion.userId}-c`).setLabel('Correct').setStyle(Discord.ButtonStyle.Success))
                    .addComponents(new Discord.ButtonBuilder().setCustomId(`grading-${promotion.userId}-w`).setLabel('Wrong').setStyle(Discord.ButtonStyle.Danger))
                    // .addComponents(new Discord.ButtonBuilder().setCustomId(`grading-${promotion.userId}-cc`).setLabel('Correct With Comment').setStyle(Discord.ButtonStyle.Success))
                    // .addComponents(new Discord.ButtonBuilder().setCustomId(`grading-${promotion.userId}-wc`).setLabel('Wrong With Comment').setStyle(Discord.ButtonStyle.Danger))
                const editedEmbed = Discord.EmbedBuilder.from(requestor_newEmbed)
            //Get leadership embed and change it to have correct/wrong buttons.
                const leadership_gradingEmbed = await leadership_thread.messages.fetch(promotion.grading_embedId)
                await leadership_gradingEmbed.edit({ embeds: [editedEmbed], components: [row] })
                try {
                    const values = [1, promotion.userId]
                    const sql = `UPDATE promotion SET grading_progress = grading_progress + (?) WHERE userId = (?);`
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
        }
        
    },
    nextTestQuestion: function(interaction) {
        let promotion = {
            requestor: interaction.member,
            requestor_roles: interaction.member.roles.cache.map(r=>r.name),
            xsf_ranks: config[botIdent().activeBot.botName].general_stuff.allRanks.map(r=>r.rank_name),
            xsf_ranksWithID: config[botIdent().activeBot.botName].general_stuff.allRanks,
        }
        promotion.requestor_currentRank = config[botIdent().activeBot.botName].general_stuff.allRanks.map(r=>r.rank_name).filter(value => promotion.requestor_roles.includes(value))[0]
        promotion.requestor_nextRank = promotion.xsf_ranks[promotion.xsf_ranks.indexOf(promotion.requestor_currentRank)-1]

        const testTypes = {
            "Aviator": "basic",
            "Lieutenant": "advanced",
            "Captain": "master",
        }
        const graderTypes = {
            "basic": "Captain",
            "advanced": "Major",
            "master": "Colonel"
        }
        promotion["testTypes"] = testTypes
        promotion["graderTypes"] = graderTypes

        let embedChannel = null;
        let colonel = null;
        let major = null;
        let captain = null;
        let graderRank = []
        let experienceCredits = {}
        if (process.env.MODE != "PROD") {
            embedChannel = config[botIdent().activeBot.botName].general_stuff.testServer.knowledge_proficiency.embedChannel
            console.log("[CAUTION]".bgYellow, "knowledge proficiency embed channel required. Check config.json file. guardianai.general_stuff.knowledge_proficiency.embedChannel. Using testServer input if available")
            generalstaff = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.find(r=>r.rank_name === 'General Staff').id
            colonel = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.find(r=>r.rank_name === 'Colonel').id
            major = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.find(r=>r.rank_name === 'Major').id
            captain = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.find(r=>r.rank_name === 'Captain').id
            graderRank.push({"General Staff":generalstaff,"Colonel":colonel,"Major":major,"Captain":captain})
            config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.forEach(rank => {
                 experienceCredits[`${rank.rank_name}`] = `${rank.experienceCredit}`
            })
        }
        else {
            embedChannel = config[botIdent().activeBot.botName].general_stuff.knowledge_proficiency.embedChannel
            generalstaff = config[botIdent().activeBot.botName].general_stuff.allRanks.find(r=>r.rank_name === 'General Staff').id
            colonel = config[botIdent().activeBot.botName].general_stuff.allRanks.find(r=>r.rank_name === 'Colonel').id
            major = config[botIdent().activeBot.botName].general_stuff.allRanks.find(r=>r.rank_name === 'Major').id
            captain = config[botIdent().activeBot.botName].general_stuff.allRanks.find(r=>r.rank_name === 'Captain').id
            graderRank.push({"General Staff":generalstaff,"Colonel":colonel,"Major":major,"Captain":captain})
            config[botIdent().activeBot.botName].general_stuff.allRanks.forEach(rank => {
                experienceCredits[`${rank.rank_name}`] = `${rank.experienceCredit}`
            })
        }
        async function checkPromotable() {
            async function getName(inputArray,inputName) {
                let ranks = []
                inputArray.forEach(i => {
                    if (i.participant_uniform != null) {
                        // const multi2 = JSON.parse(`[${i.opord_number}]`);
                        // console.log(multi2)
                        const multi = JSON.parse(`[${i.participant_uniform}]`);
                        // console.log(multi)
                        multi.forEach(single => {
                            if (single.userId == inputName) {
                                if (!ranks.find(i=>i[single.rank])) {
                                    ranks.push({ [single.rank]:1 })
                                }
                                else {
                                    const foundObject = ranks.find(obj => obj.hasOwnProperty(single.rank));
                                    if (foundObject) { foundObject[single.rank]++ }
                                }
                            }
                        })
                    }
                })
                let listRanks = config[botIdent().activeBot.botName].general_stuff.allRanks
                if (!listRanks) { 
                    listRanks = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer
                    if (!listRanks) { 
                        console.log("[config.js], No general_stuff.testServer.allRanks_testServer Found for experience.js for test server".red); 
                        return
                    }
                }
                const listedRanks = []
                listRanks.forEach(i=>{ listedRanks.push(i.rank_name) })
                function customSort(array, order) {
                    // Create a map to hold the indices of each element in the order array
                    const orderMap = new Map();
                    order.forEach((item, index) => {
                      orderMap.set(item, index);
                    });
                  
                    // Custom sorting function based on the order map
                    array.sort((a, b) => {
                      const indexA = orderMap.get(Object.keys(a)[0]);
                      const indexB = orderMap.get(Object.keys(b)[0]);
                      return indexA - indexB;
                    });
                  
                    return array;
                  }
                const sortedArray = customSort(ranks,listedRanks)
                return sortedArray
            }
            const sql = 'SELECT participant_uniform FROM `opord`';
            const response = await database.query(sql)

            if (response.length > 0) {
                const rank = await getName(response,promotion.requestor.id)
                const rankVALUE = Object.values(rank[0])[0]
                const promoteValue = experienceCredits[Object.keys(rank[0])[0]] 
                if (rankVALUE >= Number(promoteValue)) {
                    try {
                        const leadership_info = {
                            rankMessage: `<@&${generalstaff}> <@&${colonel}> <@&${major}> <@&${captain}>`,
                            title: `Promotion Request -${promotion.requestor.user.displayName} - ${promotion.requestor_nextRank}`,
                            description: "Member has requested promotion to the next rank",
                            messages: [
                                "This thread will populate with the requirements of the promotion request after the requesting member completes the Knowledge Proficiency Test.",
                                "The promotion request system will not allow a test to be taken if the requestor has less than the minimum Experience Credits requried.",
                                "Once everything has been posted, use this thread to discuss Leadership Potential",
                                "- Knowledge Proficiencies\n- Experience\n- AXI Rank\n- Promotion Challenge\n- Leadership Potential",
                            ]
                        }
                        const requestor_info = {
                            title: `${promotion.requestor.user.displayName} - ${promotion.requestor_nextRank} Promotion Request Submission`,
                            messages: [
                                `<@${promotion.requestor.id}>`
                            ]
                        }
                        async function createThread(channel,info,sendEmbed) {
                            try {
                                let channelObj = interaction.guild.channels.cache.get(channel)
                                const thread = await channelObj.threads.create({
                                    name: info.title,
                                    autoArchiveDuration: 4320,
                                    // type: Discord.ChannelType.PrivateThread, 
                                    reason: info.description,
                                });
                                if (!info.title.startsWith("Promotion Request")) {
                                    await interaction.editReply({ content: `Test Initialized, Click to start -> ${thread.url}` })
                                }
                                if (info.rankMessage) { await thread.send(info.rankMessage) }
                                if (info.messages.length > 0) {
                                    for (const i of info.messages) {
                                        // await thread.setLocked(true)
                                        await thread.send(i)
                                    }
                                    let embed = new Discord.EmbedBuilder()
                                        .setTitle(`Knowledge Proficiency Test`)
                                        .setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                                        .setThumbnail(botIdent().activeBot.icon)
                                        // .setColor('#87FF2A') //bight green
                                        // .setColor('#f2ff00') //bight yellow
                                        .setColor('#f20505') //bight red
                                        .setDescription(`*Read directions carefully.*`)
                                        .addFields(
                                            { name: "Answer Entry", value: "Answers will be typed into the chat box", inline: false },
                                            { name: "Answer Editing", value: "You may change your answer again, by typing into the chat box", inline: false },
                                            { name: "Answer Submission", value: "Click the 'Next Question' button to submit the answer", inline: false },
                                            { name: "Test Populating...", value: "The test will begin shortly, be paitient for it to populate.", inline: false }
                                    )
                                    if (sendEmbed) { await thread.send({ embeds: [embed] }) }
                                }
                                return thread.id
                            } 
                            catch (error) {
                                console.log(err)
                                    botLog(interaction.guild,new Discord.EmbedBuilder()
                                        .setDescription('```' + err.stack + '```')
                                        .setTitle(`⛔ Fatal error experienced. createThread()`)
                                        ,2
                                        ,'error'
                                    )
                            }
                        }
                        try {
                            const userId = promotion.requestor.id
                            const values = [userId]
                            const sql = 'SELECT * FROM `promotion` WHERE userId = (?)';
                            let response = await database.query(sql, values)
                            if (response.length > 0) {
                                if (response[0].grading_progress == '-1') {
                                    const requestor_thread = await interaction.guild.channels.fetch(response[0].requestor_threadId)
                                    await interaction.editReply({ content: `**${promotion.requestor_nextRank}** request is inprogress here -> ${requestor_thread.url}` })
                                }   
                                response.push({"promotable":1})
                                response = [{ ...response[0], ...response[1] }]
                                return response
                            }
                            else {
                                const emptyArray = JSON.stringify([])
                                const leadershipSubmissionThread = await createThread(embedChannel,leadership_info,1)
                                const requestorSubmissionThread = await createThread(embedChannel,requestor_info,1)
                                const values2 = [userId,leadershipSubmissionThread,requestorSubmissionThread,testTypes[promotion.requestor_nextRank],emptyArray]
                                const sql2 = `
                                    INSERT INTO promotion (userId, leadership_threadId, requestor_threadId, testType, requestor_embedId) 
                                    VALUES (?,?,?,?,?)
                                `
                                await database.query(sql2, values2)
                                response.push({question_num: 0, promotable: 1, leadership_threadId: leadershipSubmissionThread, requestor_threadId: requestorSubmissionThread})
                                // console.log('didnt exist')
                                return response
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
                    catch (err) {
                        console.log(err)
                        botLog(interaction.guild,new Discord.EmbedBuilder()
                            .setDescription('```' + err.stack + '```')
                            .setTitle(`⛔ Fatal error experienced`)
                            ,2
                            ,'error'
                        )
                        return interaction.editReply({ content: `Something went wrong creating a promotable user, please try again or contact staff!` })
                    }
                }
                if (rankVALUE < Number(promoteValue)) {
                    await interaction.editReply({ content: `Promotion Status Ineligible. You have ${rankVALUE} as a ${promotion.requestor_currentRank}. You must have at least 5 Experience Credits. Ensure you are making it to more Official Operations in Uniform to receive credit.` })
                    return 0
                }
            }
        }
        function testFunc(section,promotable_db_info,question_position,ind) {
            if (question_position) {
                const random_question_element = Math.floor(Math.random() * question_position.questions.length)
                const tester = { section: capitalizeWords(section), title: question_position.title, question: question_position.questions[random_question_element] }
                const grader = { section: capitalizeWords(section), title: question_position.title, question: question_position.questions[random_question_element], answer: question_position.answers[random_question_element] }
                displayQuestion(tester,grader,promotable_db_info,section,question_position,ind,random_question_element)
            }
        }
        function quantity(section,testTypes) {
            let quantities = 0
            bos[section][testTypes[promotion.requestor_nextRank]].forEach(i => {
                quantities++
            })
            return quantities
        }
        async function displayQuestion(tester,grader,promotable_db_info,section,question_position,ind,random_question_element) {
            const quantities = quantity(section,testTypes)

            const leadership_thread = await interaction.guild.channels.fetch(promotable_db_info[0].leadership_threadId)
            let leadership_lastMessage = await leadership_thread.messages.fetch({limit: 100})
            for (let message of leadership_lastMessage.values()) {
                if (message.embeds.length > 0) {
                    leadership_lastMessage = message;
                    break;
                }
            }
            const leadership_embed = leadership_lastMessage.embeds[0]

            const leadership_oldEmbedSchema = {
                title: leadership_embed.title,
                author: { name: promotion.requestor.displayName, iconURL: promotion.requestor.user.displayAvatarURL({ dynamic: true }) },
                description: leadership_embed.description,
                color: leadership_embed.color
            }
            // .setColor('#87FF2A') //bight green
                    // .setColor('#f20505') //bight red
                    // .setColor('#f2ff00') //bight yellow
            const leadership_newEmbed = new Discord.EmbedBuilder()
                .setTitle(tester.title)
                .setDescription(`Submission of the Knowledge Proficiency test has been started and is in-progress`)
                .setColor("#f2ff00")
                .setAuthor(leadership_oldEmbedSchema.author)
                .setThumbnail(botIdent().activeBot.icon)
                .addFields(
                    { name: "Promotion Rank", value: "```" + promotion.requestor_nextRank + "```", inline: true },
                    { name: "Test Element", value: "```" + ind+"-"+random_question_element + "```", inline: true },
                    { name: "Question Number", value: "```" + `${capitalizeWords(testTypes[promotion.requestor_nextRank])} - ${capitalizeWords(section)} - ${ind + 1}/${quantities}` + "```", inline: true },
                    { name: "Official Question", value: "```" + `${tester.question}` + "```", inline: false },
                    { name: "Official Answer", value: "```" + `${grader.answer}` + "```", inline: false },
                    { name: "Member Answer", value: "```" + `Pending...` + "```", inline: false },
                )

            const requestor_thread = await interaction.guild.channels.cache.get(promotable_db_info[0].requestor_threadId)
            let requestor_lastMessage = await requestor_thread.messages.fetch({limit: 100})
            for (let message of requestor_lastMessage.values()) {
                if (message.embeds.length > 0) {
                    requestor_lastMessage = message;
                    break;
                }
            }
            const requestor_embed = requestor_lastMessage.embeds[0]
            const requestor_oldEmbedSchema = {
                title: requestor_embed.title,
                author: { name: promotion.requestor.displayName, iconURL: promotion.requestor.user.displayAvatarURL({ dynamic: true }) },
                description: requestor_embed.description,
                color: requestor_embed.color
            }
            const requestor_newEmbed = new Discord.EmbedBuilder()
                .setTitle(tester.title)
                .setDescription(`Answer the following Question`)
                .setColor("#f20505")
                .setAuthor(requestor_oldEmbedSchema.author)
                .setThumbnail(botIdent().activeBot.icon)
                .addFields(
                    { name: "Promotion Rank", value: "```" + promotion.requestor_nextRank + "```", inline: true },
                    { name: "Test Element", value: "```" + ind+"-"+random_question_element + "```", inline: true },
                    { name: "Question Number", value: "```" + `${capitalizeWords(testTypes[promotion.requestor_nextRank])} - ${capitalizeWords(section)} - ${ind + 1}/${quantities}` + "```", inline: true },
                    { name: "Information", value: "```" + `Respond to all questions in the chat box.` + "```", inline: false },
                    { name: "Official Question", value: "```" + `${tester.question}` + "```", inline: false },
                )
                // const row = new Discord.ActionRowBuilder()
                //     .addComponents(new Discord.ButtonBuilder().setCustomId(`knowledgeproficiency-approve-${submissionId}`).setLabel('Approve').setStyle(Discord.ButtonStyle.Success),)
                //     .addComponents(new Discord.ButtonBuilder().setCustomId(`submission-deny-${submissionId}`).setLabel('Delete').setStyle(Discord.ButtonStyle.Danger),)
            inprogress_embedId = await leadership_lastMessage.edit({embeds: [leadership_newEmbed]})
            question_embedId = await requestor_thread.send({embeds: [requestor_newEmbed]})
            
            try {
                const values = [inprogress_embedId.id, question_embedId.id, section, ind, promotion.requestor.id]
                // const sql = `UPDATE promotion SET leadership_embedId = (?), JSON_ARRAY_APPEND(requestor_embedId, '$', (?)), section = (?), question_num = question_num + 1, ind = (?) WHERE userId = (?);`
                const sql = `
                    UPDATE promotion 
                    SET leadership_embedId = ?, 
                        requestor_embedId = JSON_ARRAY_APPEND(requestor_embedId, '$', ?), 
                        section = ?, 
                        question_num = question_num + 1, 
                        ind = ? 
                    WHERE userId = ?;
                `
                await database.query(sql, values)
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
        takeTheTest()
        async function takeTheTest() {
            try {
                let promotable_db_info = await checkPromotable()
                if (promotable_db_info[0].grading_state > 1) { return await interaction.editReply({ content: `Promotion request is in progress already. Check your Promotion Request thread.` }) }
                if (promotable_db_info[0].grading_state == 1) { return await interaction.editReply({ content: `Grading is inprogress. Please wait for grading completion...` }) }
                if (promotable_db_info[0].promotable == 1 && promotable_db_info[0].grading_state != 1) {
                    //todo resume test
                    if (promotable_db_info[0].question_num >= 1) {
                        const leadership_thread = await interaction.guild.channels.fetch(promotable_db_info[0].leadership_threadId)
                        const requestor_thread = await interaction.guild.channels.fetch(promotable_db_info[0].requestor_threadId)
                        let section = promotable_db_info[0].section
                        let testType = promotable_db_info[0].testType
                        let ind = promotable_db_info[0].ind
                        const quantities = quantity(section,testTypes)
                        let section_next = null
                        //Get next section 
                        const bos_keys = Object.keys(bos) 
                        for (const [index, key] of bos_keys.entries()) { 
                            if (key === section) {
                                if (index + 1 < bos_keys.length) {
                                    section_next = bos_keys[index + 1]
                                    // console.log("resume test")
                                } else {
                                    // console.log("No next section available.")
                                    section_next = 0
                                }
                                break
                            }
                        }
                        if (!section_next) { //There isn't another section, start grading process.
                            //Lock Threads
                            // await leadership_thread.setLocked(true)
                            await requestor_thread.setLocked(true)
                            //Send Embed information
                            const requestor_embed = new Discord.EmbedBuilder()
                                .setTitle(`${capitalizeWords(promotion.requestor_nextRank)} ${capitalizeWords(testTypes[promotion.requestor_nextRank])} Knowledge Proficiency Test Completed`)
                                .setDescription(`Now that you are complete with your test, please wait for a grader to review your test.`)
                                // .setColor('#87FF2A') //bight green
                                // .setColor('#f20505') //bight red
                                // .setColor('#f2ff00') //bight yellow
                                .setColor('#f2ff00')
                                .setAuthor({ name: promotion.requestor.displayName, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                                .setThumbnail(botIdent().activeBot.icon)
                                .addFields(
                                    { name: "Grader Progress", value: "Pending...", inline: true },
                                    { name: "Score", value: "Pending...", inline: true },
                                )
                            const requestor_scoreEmbedId = await requestor_thread.send({embeds: [requestor_embed]})

                            let leadership_lastMessage = await leadership_thread.messages.fetch({limit: 100})
                            for (let message of leadership_lastMessage.values()) {
                                if (message.embeds.length > 0) {
                                    leadership_lastMessage = message;
                                    break;
                                }
                            }
                            const old_leadership_embed = leadership_lastMessage.embeds[0]
                            const leadership_oldEmbedSchema = {
                                title: old_leadership_embed.title,
                                author: old_leadership_embed.author,
                                description: old_leadership_embed.description,
                                color: old_leadership_embed.color
                            }
                            const grader_ident = graderTypes[testTypes[promotion.requestor_nextRank]]
                            const leadership_embed = new Discord.EmbedBuilder()
                                .setTitle(`${promotion.requestor_nextRank} ${capitalizeWords(testTypes[promotion.requestor_nextRank])} Knowledge Proficiency Test Completed`)
                                .setDescription(`The test has been locked and is awaiting grading... `)
                                // .setColor('#87FF2A') //bight green
                                // .setColor('#f20505') //bight red
                                .setColor('#f2ff00') 
                                .setAuthor(leadership_oldEmbedSchema.author)
                                .setThumbnail(botIdent().activeBot.icon)
                                .addFields(
                                    { name: "Required Grading by:", value: `<@&${graderRank[0][grader_ident]}> or Higher`, inline: false }
                                )
                                const row = new Discord.ActionRowBuilder() 
                                    .addComponents(new Discord.ButtonBuilder().setCustomId(`startgradingtest-${promotable_db_info[0].id}`).setLabel('Start Grading').setStyle(Discord.ButtonStyle.Success))
                                // .addComponents(new Discord.ButtonBuilder().setCustomId(`submission-deny-${submissionId}`).setLabel('Delete').setStyle(Discord.ButtonStyle.Danger),)
                            const gradingEmbedId = await leadership_lastMessage.edit({ embeds: [leadership_embed], components: [row] })
                            // await leadership_thread.send("Grading Required")
                            
                            //Initiate the grading process
                            try {
                                const values = [1,gradingEmbedId.id,requestor_scoreEmbedId.id,promotion.requestor.id]
                                const sql = `UPDATE promotion SET grading_state = (?), grading_embedId = (?), requestor_scoreEmbedId = (?) WHERE userId = (?);`
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
                           
                            return await interaction.editReply({ content: `Promotion Request for **${promotion.requestor_nextRank}** is awaiting grading.` })
                        }
                        //Iterate the index of the section questions. If its at the end then do next section
                        if ((ind + 1) < quantities) { ind++ }
                        else { section = section_next; ind = 0 }

                        const question_position = bos[section][testType][ind]
                        testFunc(section,promotable_db_info,question_position,ind)
                    }
                    //todo start test
                    else { 
                        // console.log("start test")
                        const section = "researchability"
                        const testType = testTypes[promotion.requestor_nextRank]
                        const ind = 0
                        const question_position = bos[section][testType][ind]
                        testFunc(section,promotable_db_info,question_position,ind)
                    }
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
        }
    },
    data: new Discord.SlashCommandBuilder()
        .setName('requestpromotion') 
        .setDescription('Select a promotion request category')
    ,
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true })
        const roles = interaction.member.roles.cache.map(r=>r.name)
        const current_xsf_role = config[botIdent().activeBot.botName].general_stuff.allRanks.map(r=>r.rank_name).filter(value => roles.includes(value))[0]
        const reject_roles = ['General Staff','Colonel','Major','Captain']
        if (!reject_roles.includes(current_xsf_role)) {
            this.nextTestQuestion(interaction) 
        }
        else {
            return interaction.editReply({ content: `❌ Your rank (${current_xsf_role}) is to high to start a promotion test. Tests are for Learners, Aviators, and Lieutenants.` })
        }
        // try {
        //     const values = ['194001098539925504']
        //     const sql = 'SELECT * FROM `promotion` WHERE userId = (?)'
        //     const response = await database.query(sql,values)
        //     if (response.length > 0) {
        //         if (response[0].challenge_state == 0) {
        //             //todo Create code for a Modal when Challenge Proof is Denied.
        //             const fields = {
        //                 reason: new Discord.TextInputBuilder()
        //                     .setCustomId(`denied`)
        //                     .setLabel(`Input the reason for Denial`)
        //                     .setStyle(Discord.TextInputStyle.Paragraph)
        //                     .setRequired(true)
        //                     .setPlaceholder(`Be descriptive of why you are denying this.`)
        //             }
    
        //             const modal = new Discord.ModalBuilder()
        //                 .setCustomId(`challengeProofModal-deny-${values}`)
        //                 .setTitle('Reason for Denial')
        //                 .addComponents(
        //                     new Discord.ActionRowBuilder().addComponents(fields.reason),
        //                 )
        //             await interaction.showModal(modal);
        //             const submitted = await interaction.awaitModalSubmit({
        //                 time: 1800000,
        //             }).catch(error => {
        //                 console.error(error)
        //                 return null
        //             })
        //             if (submitted) {
        //                 const [reason] = submitted.fields.fields.map(i => i.value)
        //                 console.log(submitted,reason)
        //                 return [submitted, reason]
    
        //             }
        //         }
        //     }
        // }
        // catch(e) {
        //     console.log(e)
        // }

        // const threadEmbeds = {
        //     requestor: "1285754040419876914",
        //     leadership: "1285754040419876914"
        // }

        // module.exports.showAXIroles("194001098539925504",threadEmbeds)
        
    }
}