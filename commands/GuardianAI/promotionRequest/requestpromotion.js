const Discord = require("discord.js");
const { botIdent, getRankEmoji, botLog, variableCheck } = require('../../../functions')

const { saveBulkMessages, removeBulkMessages } = require('../promotionRequest/prFunctions')
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
axiSelection = null
//206440307867385857  Absence of Gravitas
module.exports = {
    cleanup: async function(requestor,nextRank,decision,leadership_thread) { 
        if (module.exports.rejectStart.users.includes(requestor.id)) {
            module.exports.rejectStart.users = module.exports.rejectStart.users.filter(i => i != requestor.id)
        }
        const rankTypes = {
            "basic": "Aviator",
            "advanced": "Lieutenant",
            "master": "Captain",
        }
        let promotion = null
        let bulkMessages = []
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
        // const blkMsg = await leadership_thread.send(`⛔ <@${interaction.user.id}> Promotion Approval/Denial can only be conducted by: ${JSON.stringify(info.promoter_rank)} `);
        // bulkMessages.push({ message: blkMsg.id, thread: promotion.leadership_threadId })
        // saveBulkMessages(promotion.userId,bulkMessages)
        //todo start embed builder
        const final_embedId_objs = {
            knowledge_proficiency: promotion.grading_embedId,
            experience: promotion.experience_embedId,
            axiRank: promotion.leadership_roleEmbedId,
            promotion_challenge: promotion.challenge_leadership_embedId,
            leadership_potential: promotion.leadership_potential_embedId
        }
        const fetch_promises = Object.entries(final_embedId_objs).map(([key, id]) => 
            id !== null ? leadership_thread.messages.fetch(id) : null
        )
        const [
            knowledge_proficiency, 
            experience, 
            axiRank, 
            promotion_challenge, 
            leadership_potential
        ] = await Promise.all(fetch_promises)
        const knowledge_proficiency_embed = knowledge_proficiency.embeds[0]
        const experience_embed = experience.embeds[0]
        const axiRank_embed = axiRank.embeds[0]
        const promotion_challenge_embed = promotion_challenge.embeds[0]
        const leadership_potential_embed = leadership_potential.embeds[0]

        function assignOldEmbedSchema(data) {
            return {
                title: data.title,
                author: { name: requestor.displayName, iconURL: requestor.displayAvatarURL({ dynamic: true }) },
                description: data.description,
                color: data.color,
                fields: data.fields
            }
        }
        const knowledge_proficiency_oldEmbedSchema = assignOldEmbedSchema(knowledge_proficiency_embed)
        const experience_oldEmbedSchema = assignOldEmbedSchema(experience_embed)
        const axiRank_oldEmbedSchema = assignOldEmbedSchema(axiRank_embed)
        const promotion_challenge_oldEmbedSchema = assignOldEmbedSchema(promotion_challenge_embed)
        const leadership_potential_oldEmbedSchema = assignOldEmbedSchema(leadership_potential_embed)



        const final_newEmbed = new Discord.EmbedBuilder()
            .setTitle(`${requestor.user.displayName} ${nextRank} Promotion Request`)
            .setDescription(`Request Completed`)
            // .setColor('#87FF2A') //bight green
            // .setColor('#f20505') //bight red
            // .setColor('#f2ff00') //bight yellow
            .setAuthor({ name: requestor.displayName, iconURL: requestor.displayAvatarURL({ dynamic: true }) })
            .setThumbnail(botIdent().activeBot.icon)
        const embed_color = decision == true ? '#87FF2A' : '#f20505'
        final_newEmbed.setColor(embed_color)
        //test score
        knowledge_proficiency_oldEmbedSchema.fields.forEach(async (i, index) => {
            if (index == 1) { final_newEmbed.addFields({ name: `${knowledge_proficiency_oldEmbedSchema.title} Score:`, value: i.value, inline: i.inline }) }
        })
        //experience credit
        final_newEmbed.addFields({ name: "Experience Credit:", value: `<@${requestor.id}>`, inline: false })
        experience_oldEmbedSchema.fields.forEach(async (i, index) => {
            final_newEmbed.addFields({ name: i.name, value: i.value, inline: i.inline })
        })
        //axi challenge
        axiRank_oldEmbedSchema.fields.forEach(async (i, index) => {
            if (index == 2) { final_newEmbed.addFields({ name: `${axiRank_oldEmbedSchema.title}`, value: i.value, inline: i.inline }) }
        })
        //xsf promotion challenge
        promotion_challenge_oldEmbedSchema.forEach(async (i, index) => {
            if (index == 2) { final_newEmbed.addFields({ name: `${promotion_challenge_oldEmbedSchema.title}`, value: i.value, inline: i.inline }) }
            if (index == 3) { final_newEmbed.addFields({ name: i.name, value: i.value, inline: i.inline }) }
        })
        //leadership potential
        // if (decision) {
        //     final_newEmbed.addFields({ name: "Final Assessment:", value: "```"+requestor.user.displayName+" demonstrated the technical and tactical prowess to be promoted.```", inline: false })
        // }
        // else {
        //     final_newEmbed.addFields({ name: "Final Assessment:", value: "```"+requestor.user.displayName+" had a problem with their application and will not be promoted at this time.```", inline: false })
        // }
        if (rankTypes[promotion.testType] != "Aviator") {
            leadership_potential_oldEmbedSchema.forEach(async (i, index) => {
                if (index == 2) { final_newEmbed.addFields({ name: `${leadership_potential_oldEmbedSchema.title}`, value: "Leadership has conviened and decided on the following aspects of Leadership Potential", inline: false }) }
                if (index > 3) { final_newEmbed.addFields({ name: i.name, value: i.value, inline: false }) }
            })
        }
        else {
            if (decision) {
                final_newEmbed.addFields({ name: "Final Assessment:", value: "```"+requestor.user.displayName+" demonstrated the technical and tactical prowess to be promoted.```", inline: false })
            }
            else {
                final_newEmbed.addFields({ name: "Final Assessment:", value: "```"+requestor.user.displayName+" had a problem with their application and will not be promoted at this time.```", inline: false })
            }
        }
        
    },
    promotionChallengeResult: async function (data,interaction) {
        try {
            const testTypes = {
                "basic": "Aviator",
                "advanced": "Lieutenant",
                "master": "Captain",
            }
            const values = [data.userId]
            const sql = 'SELECT * FROM `promotion` WHERE userId = (?)'
            const response = await database.query(sql,values)
            if (response.length > 0) {
                // console.log(response[0])
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
                    let rank_emoji = await getRankEmoji(data.reviewer);
                    if (rank_emoji == null) { rank_emoji == "" }
                    oldEmbedSchema.fields.forEach((i,index) => {
                        if (index == 0) { newEmbed.addFields({name: i.name, value: i.value, inline: i.inline}) }
                        if (index == 1) { newEmbed.addFields({ name: "Promotion Challenge Status", value: "```" + challenge_score + "```", inline: true }) }
                        if (index == 2) { newEmbed.addFields({name: i.name, value: i.value, inline: i.inline}) }
                        if (index == 3) { newEmbed.addFields({name: "Reviewed By", value: `${rank_emoji}<@${data.reviewer}>`, inline: i.inline}) }
                    })
                    await leadership_challenge.edit( { embeds: [newEmbed], components: [] } )
                    await requestor_challenge.edit( { embeds: [newEmbed] } )


                    //! IF USER IS NEXT RANK AVIATOR STOP


                    const info = {
                        nextRank: testTypes[response[0].testType],    
                        promoter_rank: function() {
                            if (process.env.MODE != "PROD") {
                                return config[botIdent().activeBot.botName].general_stuff.testServer.knowledge_proficiency.promoter_rank
                            }
                            else {
                                return config[botIdent().activeBot.botName].general_stuff.knowledge_proficiency.promoter_rank
                            }
                        }
                    }
                    if (info.nextRank == "Aviator") { 
                        const requestor_aviator_newEmbed = new Discord.EmbedBuilder()
                            .setTitle(`Promotion Request`)
                            .setDescription(`- Congratulations on completing the ${testTypes[response[0].testType]} Promotion Request!\n- Please wait patiently while the review is conducted by leadership...`)
                                // .setColor('#87FF2A') //bight green
                                // .setColor('#f20505') //bight red
                            .setColor('#f2ff00') //bight yellow
                            .setAuthor({ name: requestor.displayName, iconURL: requestor.user.displayAvatarURL({ dynamic: true }) })
                            .setThumbnail(botIdent().activeBot.icon)
                        const leadership_aviator_newEmbed = new Discord.EmbedBuilder()
                            .setTitle(`Promotion Request`)
                            .setDescription(`- User has completed all requirements\n- General Staff decision to promote. `)
                                // .setColor('#87FF2A') //bight green
                                // .setColor('#f20505') //bight red
                            .setColor('#f2ff00') //bight yellow
                            .setAuthor({ name: requestor.displayName, iconURL: requestor.user.displayAvatarURL({ dynamic: true }) })
                            .setThumbnail(botIdent().activeBot.icon)

                        const promotion_components = new Discord.ActionRowBuilder()
                            .addComponents(
                                new Discord.ButtonBuilder()
                                    .setCustomId(`promotion-approve-${response[0].userId}-${info.promoter_rank()}`)
                                    .setLabel("Approve Promotion")
                                    .setStyle(Discord.ButtonStyle.Success)
                            )
                            .addComponents(
                                new Discord.ButtonBuilder()
                                    .setCustomId(`promotion-deny-${response[0].userId}-${info.promoter_rank()}`)
                                    .setLabel("Deny Promotion")
                                    .setStyle(Discord.ButtonStyle.Danger)
                            )
                        const requestor_aviatorPromotion = await requestor_thread.send( { embeds: [requestor_aviator_newEmbed], components: [] } )
                        const leadership_aviatorPromotion = await leadership_thread.send( { embeds: [leadership_aviator_newEmbed], components: [promotion_components] } )
                        try {
                            const values = [ leadership_aviatorPromotion.id, requestor_aviatorPromotion.id, response[0].userId]
                            const sql = `UPDATE promotion SET leadership_potential_embedId = (?), requestor_potential_embedId = (?) WHERE userId = (?);`
                            await database.query(sql, values)
                            await requestor_thread.setLocked(true)
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
                    
                    //! IS LIEUTENANT+ NEXT RANK

                    const requestor_leadershipPotential_newEmbed = new Discord.EmbedBuilder()
                        .setTitle(`Leadership Potential`)
                        .setDescription(`- Congratulations on completing the ${testTypes[response[0].testType]} Promotion Request!\n- Please wait patiently while the Leadership Potential is discussed...`)
                            // .setColor('#87FF2A') //bight green
                            // .setColor('#f20505') //bight red
                        .setColor('#f2ff00') //bight yellow
                        .setAuthor(oldEmbedSchema.author)
                        .setThumbnail(botIdent().activeBot.icon)
                    const requestor_leadershipPotential = await requestor_thread.send({embeds: [requestor_leadershipPotential_newEmbed]})

                    //!Show leadership potential
                    const leadership_potential_embed = new Discord.EmbedBuilder()
                    .setTitle(`Leadership Potential`)
                    .setDescription(`Discuss this Promotion Request and the applicant's leadership abilities`)
                        // .setColor('#87FF2A') //bight green
                        // .setColor('#f20505') //bight red
                    .setColor('#f2ff00') //bight yellow
                    .setAuthor(oldEmbedSchema.author)
                    .setThumbnail(botIdent().activeBot.icon)
                    .addFields(
                        { name: "General Orders:", value: "Promotion should be an exciting thing, all members at all ranks reside at different parts of their AX Journey. Ensure discorse about members are evaluated carefuly;\n1. Are they capable of holding more than one (typically their own) point view.\n2. Are they willing to admit when they’re wrong, and that they don’t know everything.\n3. Have they demonstrate the ability to de-escalate (vs the opposite) in tense, controversial, or otherwise charged situations.\n4. Have they demonstrated a desire to put the interests of the community above their own.\n5. Are they recognized by others as someone to look up to, not just in terms of skill, but overall.\n6. Have they proven that they will “get their hands dirty” and/or 'take one for the team'.\n7. Have they proven they can be a excellent follower.", inline: false },
                        { name: "Your Final Statement:", value: `Crucial step for certifying a promotion request. They provide a synapse of the current thinking on a member's leadership potential.\n**## Examples of what you could write ##**:\n- **!final** User is truely dedicated to XSF and exudes leadership at every facet of the XSF experience.\n- **!final** Member has taken their time to train eight members to be able to fight Hydra's solo.\n- **!final** Commander shows tactical and technical prowess during many of the Operation Orders in the recent past.\n- **!final** Lieutenant User communicates very effectively in voice communications.\n- **!final** Member contributed a week of their free time to developing a new strategy which we use daily; growing the Xeno Strike Force community.`, inline: false },
                        { name: "Submitting your Final Statement:", value: "In the leadership channel, type the following:\n```!final Something that you wish to write as a final statement. You can submit multiple. Statements from TWO leaders will populate approval/denial promotion buttons.```", inline: false },
                        { name: "Final Statements:", value: "-", inline: false },
                    )
                    const leadership_leadershipPotential = await leadership_thread.send({embeds: [leadership_potential_embed]})
                    try {
                        const values = [ leadership_leadershipPotential.id, requestor_leadershipPotential.id, response[0].userId]
                        const sql = `UPDATE promotion SET leadership_potential_embedId = (?), requestor_potential_embedId = (?) WHERE userId = (?);`
                        await database.query(sql, values)
                        await requestor_thread.setLocked(true)
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
        let bulkMessages = []
        const testTypes = {
            "basic": "Aviator",
            "advanced": "Lieutenant",
            "master": "Captain",
        }
        const requestor = await guild.members.fetch(data.user.id)
        const leadership_newEmbed = new Discord.EmbedBuilder()
            .setTitle(`Promotion Challenge Proof`)
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
            .setTitle(`Promotion Challenge Proof`)
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
            const blkMsg = await requestor_thread.send(`<@${data.promotion.userId}> Promotion Challenge Proof Submission Required`)
            bulkMessages.push({ message: blkMsg.id, thread: data.promotion.requestor_threadId })

            try {
                const values = [JSON.stringify(bulkMessages),requestor_embedId.id,leadership_embedId.id,data.promotion.userId]
                // console.log("grading state 3".yellow)
                const sql = `UPDATE promotion SET 
                    bulkMessages = JSON_ARRAY_APPEND(bulkMessages, '$', ?),
                    grading_state = 3, challenge_requestor_embedId = (?), challenge_leadership_embedId = (?) WHERE userId = (?);`
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
    AXIchallengeProof: async function (data, interaction) {
        try {
            const values = [data.userId]
            const sql = 'SELECT * FROM `promotion` WHERE userId = (?)'
            const response = await database.query(sql,values)
            if (response.length > 0) {
                const challenge_score = response[0].axiChallenge_state == 1 ? "Approved" : "Denied"
                const challenge_score_color = response[0].axiChallenge_state == 1 ? '#87FF2A' : '#F20505'
                const leadership_thread = await interaction.guild.channels.fetch(response[0].leadership_threadId)
                const requestor_thread = await interaction.guild.channels.fetch(response[0].requestor_threadId)
                const requestor = await guild.members.fetch(data.userId)
                const leadership_challenge = await leadership_thread.messages.fetch(response[0].leadership_roleEmbedId)
                const requestor_challenge = await requestor_thread.messages.fetch(response[0].requestor_roleEmbedId)

                if (response[0].axiChallenge_state == -2) {
                    // console.log("resubmit new proof".yellow)
                    const testTypes = {
                        "basic": "Sole Survivor",
                        "advanced": "Serpent's Nemesis",
                        "master": "Collector",
                    }
                    const requestor_receivedEmbed = requestor_challenge.embeds[0]
                    const requestor_oldEmbedSchema = {
                        title: requestor_receivedEmbed.title,
                        author: requestor_receivedEmbed.author,
                        description: requestor_receivedEmbed.description,
                        color: requestor_receivedEmbed.color,
                        fields: requestor_receivedEmbed.fields
                    }
                    const leadership_receivedEmbed = leadership_challenge.embeds[0]
                    const leadership_oldEmbedSchema = {
                        title: leadership_receivedEmbed.title,
                        author: leadership_receivedEmbed.author,
                        description: leadership_receivedEmbed.description,
                        color: leadership_receivedEmbed.color,
                        fields: leadership_receivedEmbed.fields
                    }
                    const requestor_embed = new Discord.EmbedBuilder()
                        .setTitle(requestor_oldEmbedSchema.title)
                        .setDescription("Your submission was denied, however, you have the ability to submit new qualifying proof.")
                        .setColor('#f2ff00')
                        .setAuthor({name: requestor.displayName, iconURL: requestor.user.displayAvatarURL({dynamic:true})})
                        .setThumbnail(botIdent().activeBot.icon)
                        .addFields(
                            {name: "Server:", value: "```Anti Xeno Initiative```" },
                            {name: "Requestor:", value: `<@${data.user.id}>` },
                            {name: "Role Requirement:", value: "```"+`${testTypes[response[0].testType]}`+"```" },
                            {name: "Instructions:", value: "```Drag and Drop image proof into chat```" },
                        )
                    const leadership_embed = new Discord.EmbedBuilder()
                        .setTitle(leadership_oldEmbedSchema.title)
                        .setDescription("Your submission was denied, however, you have the ability to submit new qualifying proof.")
                        .setColor('#f2ff00')
                        .setAuthor({name: requestor.displayName, iconURL: requestor.user.displayAvatarURL({dynamic:true})})
                        .setThumbnail(botIdent().activeBot.icon)
                        .addFields(
                            {name: "Server:", value: "```Anti Xeno Initiative```" },
                            {name: "Requestor:", value: `<@${data.user.id}>` },
                            {name: "Role Requirement:", value: "```"+`${testTypes[response[0].testType]}`+"```" },
                            {name: "Instructions:", value: "```Waiting on AXI Progression Challenge Proof to be submitted.```" },
                        )
                    await requestor_challenge.send( { embeds: [requestor_embed], components: [] } )
                    await leadership_challenge.send( { embeds: [leadership_embed] } )
                    try {
                        const values = [response[0].userId]
                        const sql = `UPDATE promotion SET axi_rolesCheck = -2, axiChallenge_state = -2 WHERE userId = (?);`
                        await database.query(sql, values)
                        await requestor_thread.setLocked(true)
                    }
                    catch (err) {
                        console.log(err)
                        botLog(message.guild,new Discord.EmbedBuilder()
                            .setDescription('```' + err.stack + '```')
                            .setTitle(`⛔ Fatal error experienced`)
                            ,2
                            ,'error'
                        )
                    }
                }
                if (response[0].axiChallenge_state == -3) {
                    try {
                        let values = [-3, data.user.id]
                        let sql = `UPDATE promotion SET axi_rolesCheck = (?)  WHERE userId = (?);`
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
                    await leadership_thread.send("❌ Please use the Chatbox to explain the denial. The denial will not complete until this has been done.")
                }
                if (response[0].axiChallenge_state == 1) {
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
                        .setDescription(oldEmbedSchema.description)
                            // .setColor('#87FF2A') //bight green
                            // .setColor('#f20505') //bight red
                            // .setColor('#f2ff00') //bight yellow
                        .setAuthor(oldEmbedSchema.author)
                        .setThumbnail(botIdent().activeBot.icon)
    
                    newEmbed.setColor(challenge_score_color)
                    let rank_emoji = await getRankEmoji(data.reviewer);
                    if (rank_emoji == null) { rank_emoji == "" }
                    oldEmbedSchema.fields.forEach((i,index) => {
                        if (index < 4) { newEmbed.addFields({name: i.name, value: i.value, inline: i.inline}) }
                        if (index == 4) { newEmbed.addFields({ name: "AXI Challenge Status", value: "```" + challenge_score + "```", inline: true }) }
                        if (index == 5) { newEmbed.addFields({name: i.name, value: i.value, inline: i.inline}) }
                        if (index == 6) { newEmbed.addFields({name: "Reviewed By", value: `${rank_emoji}<@${data.reviewer}>`, inline: i.inline}) }
                    })
                    await leadership_challenge.edit( { embeds: [newEmbed], components: [] } )
                    await requestor_challenge.edit( { embeds: [newEmbed] } )
                    await requestor_thread.setLocked(false)
                    const challengeInfo = {
                        user: { 
                            id: response[0].userId
                        },
                        promotion: response[0],
                    }
                    try {
                        let values = [1, challengeInfo.user.id]
                        let sql = `UPDATE promotion SET axi_rolesCheck = (?)  WHERE userId = (?);`
                        const d = await database.query(sql, values)
                        if (d) {
                            module.exports.showPromotionChallenge(challengeInfo)
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
        let subject = null
        if (axiSelection == "no") { 
            subject = guild.members.cache.get("206440307867385857")
        }
        else {
            subject = guild.members.cache.get(userId)
        }
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
                const experience = await threadEmbeds.leadership.channel.send({embeds: [embed]})
                try {
                    const values = [userId,experience.id]
                    const sql = `UPDATE promotion SET experience_embedId = (?) WHERE userId = (?);`
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
    nextGradingQuestion: async function(userId,interaction,grader) {
        let bulkMessages = []
        let promotion = null
        //Get database stuff
        try {
            const values = [userId]
            
            const sql = `SELECT * FROM promotion WHERE userId = (?)`
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
                    leadership_newEmbed.addFields({ name: "Test Retake Required", value: "```Final score was less than 80%, test retake starting.```", inline: false})
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

                
                if (final_score >= 80) {
                    try {
                        const leadership_editedEmbed = Discord.EmbedBuilder.from(leadership_newEmbed)
                        await leadership_originalMessage.edit({ embeds: [leadership_editedEmbed], components: [] })
                        const requestor_editedEmbed = Discord.EmbedBuilder.from(requestor_newEmbed)
                        await requestor_originalMessage.edit({ embeds: [requestor_editedEmbed], components: [] })
                        const threadEmbeds = {requestor: requestor_originalMessage, leadership: leadership_originalMessage}
                        JSON.parse(promotion.requestor_embedId).forEach(async msg => {
                            const delMsg = await requestor_thread.messages.fetch(msg)
                            await delMsg.delete()
                        })
                        const values = [final_score,promotion.userId]
                        const sql = `UPDATE promotion SET score = (?), grading_state = 2, requestor_embedId = '[]' WHERE userId = (?);`
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
                        requestor_newEmbed.addFields({ name: "Test Retake Required", value: "Final score was less than 80%, test retake starting.", inline: false})
                        const leadership_editedEmbed = Discord.EmbedBuilder.from(leadership_newEmbed)
                        await leadership_originalMessage.edit({ embeds: [leadership_editedEmbed], components: [] })
                        const requestor_editedEmbed = Discord.EmbedBuilder.from(requestor_newEmbed)
                        await requestor_originalMessage.edit({ embeds: [requestor_editedEmbed], components: [] })
                        const blkMsg = await leadership_thread.send(`❌ User failed the test, retake inprogress...`)
                        const values = [final_score,promotion.userId] 
                        const sql = `UPDATE promotion SET 
                            score = (?), 
                            requestor_embedId = '[]', 
                            section = 'researchability', 
                            ind = 0, 
                            grading_embedId = NULL, 
                            grading_state = 0, 
                            question_num = 0, 
                            grading_number = 0, 
                            grading_progress = -1 
                            WHERE userId = (?);
                        `
                        const d = await database.query(sql, values)
                        if (d) {
                            await requestor_thread.setLocked(false)
                            bulkMessages.push({ message: blkMsg.id, thread: leadership_thread.id })
                            saveBulkMessages(promotion.userId,bulkMessages)
                            const requestor = await guild.members.fetch(promotion.userId)
                            const rankTypes = {
                                "basic": "Aviator",
                                "advanced": "Lieutenant",
                                "master": "Captain",
                            }
                            const rank_info = {
                                current: promotion.currentRank,
                                next: rankTypes[promotion.testType]
                            }
                            module.exports.nextTestQuestion(interaction,requestor,rank_info)
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
            // console.log("continue grading".yellow)
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
    nextTestQuestion: function(interaction,requestor,rank_info) {
        let promotion = {
            requestor: requestor,
            requestor_roles: requestor.roles.cache.map(r=>r.name),
            xsf_ranks: config[botIdent().activeBot.botName].general_stuff.allRanks.map(r=>r.rank_name),
            xsf_ranksWithID: config[botIdent().activeBot.botName].general_stuff.allRanks,
        }
        if (rank_info) { 
            promotion.requestor_currentRank = rank_info.current
            promotion.requestor_nextRank = rank_info.next
        }
        else {
            promotion.requestor_currentRank = config[botIdent().activeBot.botName].general_stuff.allRanks.map(r=>r.rank_name).filter(value => promotion.requestor_roles.includes(value))[0]
            promotion.requestor_nextRank = promotion.xsf_ranks[promotion.xsf_ranks.indexOf(promotion.requestor_currentRank)-1]
        }
        
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

        let leadership_embedChannel = null;
        let requestor_embedChannel = null;
        let colonel = null;
        let major = null;
        let captain = null;
        let graderRank = []
        let experienceCredits = {}
        if (process.env.MODE != "PROD") {
            leadership_embedChannel = config[botIdent().activeBot.botName].general_stuff.testServer.knowledge_proficiency.leadership_embedChannel
            requestor_embedChannel = config[botIdent().activeBot.botName].general_stuff.testServer.knowledge_proficiency.requestor_embedChannel
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
            leadership_embedChannel = config[botIdent().activeBot.botName].general_stuff.knowledge_proficiency.leadership_embedChannel
            requestor_embedChannel = config[botIdent().activeBot.botName].general_stuff.knowledge_proficiency.requestor_embedChannel
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
                rank = null;
                if (process.env.MODE == "PROD") { 
                    rank = await getName(response,promotion.requestor.id)
                }
                else {
                    rank = [
                        { [`${promotion.requestor_currentRank}`]: 5 }
                    ]
                }
                const rankVALUE = Object.values(rank[0])[0]
                const promoteValue = experienceCredits[Object.keys(rank[0])[0]] 
                if (rankVALUE >= Number(promoteValue)) {
                    try {
                        const leadership_info = {
                            rankMessage: `<@&${generalstaff}> <@&${colonel}> <@&${major}> <@&${captain}>`,
                            title: `Promotion Request - ${promotion.requestor.user.displayName} - ${promotion.requestor_nextRank}`,
                            description: "Member has requested promotion to the next rank",
                            messages: [
                                "This thread will populate with the requirements of the promotion request after the requesting member completes the Knowledge Proficiency Test.",
                                "The promotion request system will not allow a test to be taken if the requestor has less than the minimum Experience Credits requried.",
                                "Once everything has been posted, use this thread to discuss Leadership Potential",
                                "- Knowledge Proficiencies\n- Experience\n- AXI Rank\n- Promotion Challenge\n- Leadership Potential",
                            ]
                        }
                        const requestor_info = {
                            rankMessage: `<@${promotion.requestor.id}>`,
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
                                    type: Discord.ChannelType.PrivateThread,
                                    reason: info.description,
                                    message: { content: info.rankMessage } 
                                });
                                if (!info.title.startsWith("Promotion Request")) {
                                    await interaction.editReply({ content: `Test Initialized, Click to start -> ${thread.url}` })
                                }
                                // if (info.rankMessage) { await thread.send(info.rankMessage) }
                                if (info.messages.length > 0) {
                                    for (const i of info.messages) {
                                        // await thread.setLocked(true)
                                        await thread.send(i)
                                    }
                                    let embed = new Discord.EmbedBuilder()
                                        .setTitle(`${promotion.requestor_nextRank} Knowledge Proficiency Test`)
                                        .setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                                        .setThumbnail(botIdent().activeBot.icon)
                                        // .setColor('#87FF2A') //bight green
                                        // .setColor('#f2ff00') //bight yellow
                                        .setColor('#f20505') //bight red
                                        .setDescription(`*Read directions carefully.*`)
                                        .addFields(
                                            { name: "Reference Material", value: "All questions will come from the Book of Sentinel https://xenostrikeforce.com/?page_id=437", inline: false },
                                            { name: "Answer Entry", value: "Answers will be typed into the chat box.", inline: false },
                                            { name: "Answer Editing", value: "You may change your answer indefinitely, by typing into the chat box prior to clicking 'Next Question'.", inline: false },
                                            { name: "Answer Submission", value: "Click the 'Next Question' button to submit the answer. Your answer will be saved at that point.", inline: false },
                                            { name: "Test Populating...", value: "The test will begin shortly, be paitient for it to populate.", inline: false }
                                    )
                                    if (sendEmbed) { await thread.send({ embeds: [embed] }) }
                                }
                                return thread.id
                            } 
                            catch (error) {
                                console.log(error)
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
                                const requestor_thread = await interaction.guild.channels.fetch(response[0].requestor_threadId) 
                                response.push({
                                        promotable:1,
                                        rejectStart: { requestor_thread: requestor_thread.id }     
                                    })
                                response = [{ ...response[0], ...response[1] }]
                                return response
                            }
                            else {
                                const emptyArray = JSON.stringify([])
                                const leadershipSubmissionThread = await createThread(leadership_embedChannel,leadership_info,1)
                                const requestorSubmissionThread = await createThread(requestor_embedChannel,requestor_info,1)
                                const values2 = [promotion.requestor_currentRank,userId,leadershipSubmissionThread,requestorSubmissionThread,testTypes[promotion.requestor_nextRank],emptyArray,emptyArray]
                                const sql2 = `
                                    INSERT INTO promotion (currentRank,userId, leadership_threadId, requestor_threadId, testType, requestor_embedId, bulkMessages) 
                                    VALUES (?,?,?,?,?,?,?)
                                `
                                await database.query(sql2, values2)
                                response.push({question_num: 0, promotable: 1, rejectStart: { requestor_thread: requestorSubmissionThread },leadership_threadId: leadershipSubmissionThread, requestor_threadId: requestorSubmissionThread})
                                
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
                // console.log("promotable_db_info:".red,promotable_db_info[0])
                // if (promotable_db_info[0].rejectStart.state) { 
                    //     return await interaction.editReply(
                        //         { content: `❌ Promotion request is in progress already. Check your Promotion Request thread ${requestor_thread.url}` }
                        //     )
                        // }
                if (promotable_db_info[0].grading_state > 1) { return await interaction.editReply({ content: `Promotion request is in progress already. Check your Promotion Request thread.` }) }
                if (promotable_db_info[0].grading_state == 1) { return await interaction.editReply({ content: `Grading is inprogress. Please wait for grading completion...` }) }
                if (promotable_db_info[0].promotable == 1 && promotable_db_info[0].grading_state != 1) {
                    //todo resume test
                    if (promotable_db_info[0].question_num >= 1) {
                        let bulkMessages = []
                        const requestor_thread = await interaction.guild.channels.fetch(promotable_db_info[0].requestor_threadId)
                        const leadership_thread = await interaction.guild.channels.fetch(promotable_db_info[0].leadership_threadId)
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
                                    .addComponents(new Discord.ButtonBuilder().setCustomId(`startgradingtest-${promotable_db_info[0].userId}`).setLabel('Start Grading').setStyle(Discord.ButtonStyle.Success))
                                // .addComponents(new Discord.ButtonBuilder().setCustomId(`submission-deny-${submissionId}`).setLabel('Delete').setStyle(Discord.ButtonStyle.Danger),)
                            const gradingEmbedId = await leadership_lastMessage.edit({ embeds: [leadership_embed], components: [row] })
                            const blkMsg = await leadership_thread.send(`<@&${graderRank[0][grader_ident]}> Awaiting Grading`)
                            
                            bulkMessages.push({ message: blkMsg.id, thread: leadership_thread.id })
                            saveBulkMessages(promotable_db_info[0].userId,bulkMessages)
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
                        // console.log("testType:".bgRed,testType)
                        // variableCheck("testType:",testType)
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
    rejectStart: {
        users: []
    },
    data: new Discord.SlashCommandBuilder()
        .setName('requestpromotion') 
        .setDescription('Select a promotion request category')
        .addStringOption(option =>
            option.setName('axi')
                .setDescription('Choose Yes or No for user IN AXI server')
                .setRequired(true)
                .addChoices({ name: "Yes", value: "yes"})
                .addChoices({ name: "No", value: "no"})
        )
    ,
    async execute(interaction) {
        if (process.env.MODE != "PROD") {
            await interaction.deferReply({ content: "TEST SERVER ONLY MSG. This will be available to only the requestor in production:", ephemeral: false })
        }
        else {
            await interaction.deferReply({ ephemeral: true })
        }
        axiSelection = interaction.options.data.find(arg => arg.name === 'axi').value
        const roles = interaction.member.roles.cache.map(r=>r.name)
        const current_xsf_role = config[botIdent().activeBot.botName].general_stuff.allRanks.map(r=>r.rank_name).filter(value => roles.includes(value))[0]
        const reject_roles = ['General Staff','Colonel','Major','Captain']

        if (!reject_roles.includes(current_xsf_role)) {
            const requestor = await guild.members.fetch(interaction.user.id)
            if (config[botIdent().activeBot.botName].general_stuff.promotion_request_system_state == false) {
                return interaction.editReply({ content: `❌ Promotion Request System currently **disabled**.` })
            }
            if (module.exports.rejectStart.users.includes(requestor.id)) {
                return interaction.editReply({ content: `❌ Promotion request is in progress already. Check your Promotion Request thread.` })
            }
            else {
                module.exports.rejectStart.users.push(requestor.id)
                this.nextTestQuestion(interaction,requestor)
            }
        }
        else {
            return interaction.editReply({ content: `❌ Your rank (${current_xsf_role}) is to high to start a promotion test. Tests are for Learners, Aviators, and Lieutenants.` })
        }
    }
}