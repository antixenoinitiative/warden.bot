const Discord = require("discord.js");
const { botIdent, eventTimeCreate, hasSpecifiedRole, botLog } = require('../../../functions')

// const bos = require(`../../../${botIdent().activeBot.botName}/bookofsentinel/bos.json`)
const config = require('../../../config.json')
const bos = require(`../../../${botIdent().activeBot.botName}/bookofsentinel/bos.json`)
const database = require(`../../../${botIdent().activeBot.botName}/db/database`)


function capitalizeWords(str) {
    return str.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

module.exports = {
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
            "General Staff": "master",
        }
        // let testEmbed = new Discord.EmbedBuilder()
        //     .setTitle(`"${requestor_nextRank}" Promotion Knowledge Proficiency Test Results`)
        //     .setAuthor({ name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
        //     .setThumbnail(botIdent().activeBot.icon)
        //     .setColor('#87FF2A') //87FF2A
        //     .setDescription(`Submission of the Knowledge Proficiency test has been recorded.`)
        //     .addFields(
        //         { name: "Promotion Rank", value: "```" + requestor_nextRank + "```", inline: false },
        //         { name: "Test Type", value: "```" + testTypes[requestor_nextRank] + "```", inline: false },
        //         { name: "Test Score", value: "-", inline: true },
        //         { name: "Questions Asked", value: "-", inline: true },
        //         { name: "Questions Answered", value: "-", inline: true }
        //     )
        // await interaction.editReply({ embeds: [returnEmbed] })
        let embedChannel = null;
        let colonel = null;
        let major = null;
        let captain = null;
        if (process.env.MODE != "PROD") {
            embedChannel = config[botIdent().activeBot.botName].general_stuff.testServer.knowledge_proficiency.embedChannel
            console.log("[CAUTION]".bgYellow, "knowledge proficiency embed channel required. Check config.json file. guardianai.general_stuff.knowledge_proficiency.embedChannel. Using testServer input if available")
            colonel = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.find(r=>r.rank_name === 'Colonel').id
            major = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.find(r=>r.rank_name === 'Major').id
            captain = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer.find(r=>r.rank_name === 'Captain').id
        }
        else {
            embedChannel = config[botIdent().activeBot.botName].general_stuff.knowledge_proficiency.embedChannel
            colonel = config[botIdent().activeBot.botName].general_stuff.allRanks.find(r=>r.rank_name === 'Colonel').id
            major = config[botIdent().activeBot.botName].general_stuff.allRanks.find(r=>r.rank_name === 'Major').id
            captain = config[botIdent().activeBot.botName].general_stuff.allRanks.find(r=>r.rank_name === 'Captain').id
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

                if (rankVALUE >= 5) {
                    try {
                        const leadership_info = {
                            rankMessage: `<@&${colonel}> <@&${major}> <@&${captain}>`,
                            title: `${promotion.requestor.user.displayName} - ${promotion.requestor_nextRank} Promotion Request`,
                            description: "Member has requested promotion to the next rank",
                            messages: [
                                "This thread will populate with the requirements of a promotion request as the requesting member completes them.",
                                "- Experience\n- Promotion Challenge\n- AXI Rank\n- Knowledge Proficiencies\n- Leadership Potential",
                            ]
                        }
                        const requestor_info = {
                            title: `${promotion.requestor.user.displayName} - ${promotion.requestor_nextRank} Promotion Request Submission`,
                            messages: [
                                `<@${promotion.requestor.id}>`,
                                'Instructions',
                                '- Promotion Challenge\n- Knowledge Proficiency Test'
                            ]
                        }
                        async function createThread(channel,info) {
                            try {
                                let channelObj = interaction.guild.channels.cache.get(channel)
                                const thread = await channelObj.threads.create({
                                    name: info.title,
                                    autoArchiveDuration: 4320,
                                    reason: info.description,
                                });
                                if (info.rankMessage) { await thread.send(info.rankMessage) }
                                if (info.messages.length > 0) {
                                    for (const i of info.messages) {
                                        // await thread.setLocked(true)
                                        await thread.send(i)
                                    }
                                    let embed = new Discord.EmbedBuilder()
                                        .setTitle(`test`)
                                        .setAuthor({ name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                                        .setThumbnail(botIdent().activeBot.icon)
                                        // .setColor('#87FF2A') //bight green
                                        // .setColor('#f20505') //bight red
                                        .setColor('#f2ff00') //bight yellow
                                        .setDescription(`test`)
                                        .addFields(
                                            { name: "test", value: "test", inline: false }
                                    )
                                    await thread.send({ embeds: [embed] })
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
                                response.push({"promotable":1})
                                response = [{ ...response[0], ...response[1] }]
                                console.log("exists")
                                return response
                            }
                            else {
                                const leadershipSubmissionThread = await createThread(embedChannel,leadership_info)
                                const requestorSubmissionThread = await createThread(embedChannel,requestor_info)
                                const values2 = [userId,leadershipSubmissionThread,requestorSubmissionThread,testTypes[promotion.requestor_nextRank]]
                                const sql2 = `
                                INSERT INTO promotion (userId, leadership_threadId, requestor_threadId, testType) 
                                VALUES (?,?,?,?)   
                                `
                                await database.query(sql2, values2)
                                response.push({promotable: 1, leadership_threadId: leadershipSubmissionThread, requestor_threadId: requestorSubmissionThread})
                                console.log('didnt exist')
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
                if (rankVALUE < 5) {
                    await interaction.editReply({ content: `Promotion Status Ineligible. You have ${rankVALUE} as a ${promotion.requestor_currentRank}. You must have at least 5 Experience Credits. Ensure you are making it to more Official Operations in Uniform to receive credit.` })
                    return 0
                }
            }
        }        
        function testFunc(section,promotable_db_info,question_position) {
            if (question_position) {
                const random_question_element = Math.floor(Math.random() * question_position.questions.length)
                const tester = { section: capitalizeWords(section), title: question_position.title, question: question_position.questions[random_question_element] }
                const grader = { section: capitalizeWords(section), title: question_position.title, question: question_position.questions[random_question_element], answer: question_position.answers[random_question_element] }
                displayQuestion(tester,grader,promotable_db_info,section,question_position)
            }
        }
        function quantity(section,testTypes) {
            let quantities = 0
            bos[section][testTypes[promotion.requestor_nextRank]].forEach(i => {
                quantities++
            })
            return quantities
        }
        async function displayQuestion(tester,grader,promotable_db_info,section,question_position) {
            const quantities = quantity(section,testTypes)

            const leadership_thread = await interaction.guild.channels.fetch(promotable_db_info[0].leadership_threadId)
            let leadership_lastMessage = await leadership_thread.messages.fetch({limit: 1})
            leadership_lastMessage = leadership_lastMessage.first()
            const leadership_embed = leadership_lastMessage.embeds[0]
            const leadership_oldEmbedSchema = {
                title: leadership_embed.title,
                author: { name: promotion.requestor.displayName, iconURL: promotion.requestor.user.displayAvatarURL({ dynamic: true }) },
                description: leadership_embed.description,
                color: leadership_embed.color
            }
            const leadership_newEmbed = new Discord.EmbedBuilder()
                .setTitle(leadership_oldEmbedSchema.title)
                .setDescription(`Submission of the Knowledge Proficiency test has been started and is in-progress`)
                .setColor(leadership_oldEmbedSchema.color)
                .setAuthor(leadership_oldEmbedSchema.author)
                .setThumbnail(botIdent().activeBot.icon)
                .addFields(
                    { name: "Promotion Rank", value: "```" + promotion.requestor_nextRank + "```", inline: false },
                    { name: "Test Info", value: "```" + `${capitalizeWords(testTypes[promotion.requestor_nextRank])} - ${capitalizeWords(section)} - ${promotable_db_info[0].question_num}/${quantities}` + "```", inline: true },
                    { name: "Question Info", value: "```" + grader.question + "```", inline: false },
                    { name: "Answer Info", value: "```" + grader.answer + "```", inline: false },
                )

            const requestor_thread = await interaction.guild.channels.cache.get(promotable_db_info[0].requestor_threadId)
            let requestor_lastMessage = await requestor_thread.messages.fetch({limit: 1})
            requestor_lastMessage = requestor_lastMessage.first()
            const requestor_embed = requestor_lastMessage.embeds[0]
            const requestor_oldEmbedSchema = {
                title: requestor_embed.title,
                author: { name: promotion.requestor.displayName, iconURL: promotion.requestor.user.displayAvatarURL({ dynamic: true }) },
                description: requestor_embed.description,
                color: requestor_embed.color
            }
            const requestor_newEmbed = new Discord.EmbedBuilder()
                .setTitle(requestor_oldEmbedSchema.title)
                .setDescription(`Answer the following Question`)
                .setColor(requestor_oldEmbedSchema.color)
                .setAuthor(requestor_oldEmbedSchema.author)
                .setThumbnail(botIdent().activeBot.icon)
                .addFields(
                    { name: "Promotion Rank", value: "```" + promotion.requestor_nextRank + "```", inline: false },
                    { name: "Question Number", value: "```" + `${capitalizeWords(testTypes[promotion.requestor_nextRank])} - ${capitalizeWords(section)} - ${promotable_db_info[0].question_num}/${quantities}` + "```", inline: true },
                    { name: "Information", value: "```" + `Respond to all questions in the chat box.` + "```", inline: false },
                    { name: "Question", value: "```" + `${tester.question}` + "```", inline: false },   
                )
                // const row = new Discord.ActionRowBuilder()
                //     .addComponents(new Discord.ButtonBuilder().setCustomId(`knowledgeproficiency-approve-${submissionId}`).setLabel('Approve').setStyle(Discord.ButtonStyle.Success),)
                //     .addComponents(new Discord.ButtonBuilder().setCustomId(`submission-deny-${submissionId}`).setLabel('Delete').setStyle(Discord.ButtonStyle.Danger),)
            inprogress_embedId = await leadership_lastMessage.edit({embeds: [leadership_newEmbed]})
            question_embedId = await requestor_thread.send({embeds: [requestor_newEmbed]})

            try {
                const values = [inprogress_embedId.id, question_embedId.id, section, promotion.requestor.id ]
                const sql = `UPDATE promotion SET leadership_embedId = (?), requestor_embedId = (?), section = (?) WHERE userId = (?);`
                await database.query(sql, values)
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
        takeTheTest()
        async function takeTheTest() {
            let promotable_db_info = await checkPromotable()
            if (promotable_db_info[0].promotable) {
                //todo resume test
                if (promotable_db_info[0].question_num >= 1) {
                    console.log("resume test")
                    const section = promotable_db_info[0].section
                    const testType = promotable_db_info[0].testType
                    const ind = promotable_db_info[0].ind
                    const question_position = bos[section][testType][ind]
                    testFunc(section,promotable_db_info,question_position)
                }
                //todo start test
                else {
                    console.log("start test")
                    const section = "researchability"
                    const testType = testTypes[promotion.requestor_nextRank]
                    const ind = 0
                    const question_position = bos[section][testType][ind]
                    testFunc(section,promotable_db_info,question_position)
                }
                
            }
        }
    },
    data: new Discord.SlashCommandBuilder()
        .setName('requestpromotion') 
        .setDescription('Select a promotion request category')
        .addSubcommand(subcommand =>
            subcommand
                .setName('challenge')
                .setDescription('Location to enter Video')
                .addStringOption(option => option
                    .setName("wing_members")
                    .setDescription("Enter all wing members starting with @")
                    .setRequired(true)
                )
                .addStringOption(option => option
                    .setName("url")
                    .setDescription("Enter URL. Starting with http://")
                    .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('knowledge_proficiency')
                .setDescription('Take the knowledge proficiency test')
        )
    ,
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true })
        if (interaction.options.getSubcommand() === 'challenge') {
            let args = {}
            for (let key of interaction.options._hoistedOptions) {
                args[key.name] = key.value
            }
            if (!args.wing_members.includes("@")) { return interaction.editReply({ content: `❌ Please enter a mentionable user. IE. @player` }) }
            if (!args.url.startsWith('https://')) { return interaction.editReply({ content: `❌ Please enter a valid URL, eg: https://...` }) }
		
            const requestor = interaction.member.id
            const requestor_roles = interaction.member.roles.cache.map(r=>r.name)
            const requestor_currentRank = config[botIdent().activeBot.botName].general_stuff.allRanks.map(r=>r.rank_name).filter(value => requestor_roles.includes(value))
            const xsf_ranks = config[botIdent().activeBot.botName].general_stuff.allRanks.map(r=>r.rank_name)
            const requestor_nextRank = xsf_ranks[xsf_ranks.indexOf(requestor_currentRank[0])-1]
            let description_wingMembers = []
            let wing_members = args.wing_members.split(" ") //[ '<@194001098539925504>', '<@302598408773042188>' ]
            let wing_members_DB = wing_members.map(i => i.replace(/[<@>]/g, '')) //[ '194001098539925504', '302598408773042188' ]
            const array_cleaned = wing_members.map(str => str.match(/<@!?\d+>/)).filter(Boolean)
            const memberObjects = await Promise.all(array_cleaned.map(async mention => {
                const userId = mention[0].match(/\d+/)[0]
                let user = await interaction.guild.members.fetch(userId);
                user = user.roles.cache.map(r=>r.name)
                const current_rank = config[botIdent().activeBot.botName].general_stuff.allRanks.map(r=>r.rank_name).filter(value => user.includes(value))
                const rank = config[botIdent().activeBot.botName].general_stuff.allRanks.find(r=>r.rank_name == current_rank)
                description_wingMembers.push(`${rank.emoji} <@${userId}>\n`)
            }))
            description_wingMembers = description_wingMembers
                .join(",")
                .replace(",","")

            returnEmbed = new Discord.EmbedBuilder()
                .setTitle(`"${requestor_nextRank}" Promotion Challenge Entry`)
                .setAuthor({ name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) }) 
                .setThumbnail(botIdent().activeBot.icon)
                .setColor('#87FF2A') //87FF2A
                .setDescription(`Submission of the Promotion Challenge has been stored.`)
                .addFields(
                    { name: "Promotion Rank", value: "```" + requestor_nextRank + "```", inline: false },
                    { name: "Wing Members", value: description_wingMembers, inline: false },
                    { name: "Video", value: args.url, inline: false }
                )
            await interaction.editReply({ embeds: [returnEmbed] })
        }
        if (interaction.options.getSubcommand() === 'knowledge_proficiency') {
            let args = {}
            for (let key of interaction.options._hoistedOptions) {
                args[key.name] = key.value
            }
            this.nextTestQuestion(interaction)
        }
    }
}