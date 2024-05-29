const Discord = require("discord.js");
const { botIdent, eventTimeCreate, hasSpecifiedRole, botLog } = require('../../../functions')

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
        .setName('experience')
        .setDescription('Review experience credit')
        .addSubcommand(subcommand =>
            subcommand
                .setName('rank')
                .setDescription('Review by Rank.')
                .addStringOption(option =>
                    option.setName('rank')
                        .setDescription('Give this OPORD a Name.')
                        .setRequired(true)
                        // .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('names')
                .setDescription('Review by Name(s).')
                .addStringOption(option =>
                    option.setName('names')
                        .setDescription('Give this OPORD a Name.')
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
        await interaction.deferReply({ ephemeral: true });
        async function rankAuth() { //checks for RoleName
            let returnVal = null;
            let approvalRanks = config[botIdent().activeBot.botName].experienceQuery
            const approvalRanks_string = approvalRanks.map(rank => rank.rank_name).join(', ').replace(/,([^,]*)$/, ', or$1');
            const member = interaction.member;
            if (hasSpecifiedRole(member, approvalRanks) == 0) { //checks Role Name specifically.
                botLog(interaction.guild,new Discord.EmbedBuilder()
                .setDescription(`${interaction.member.nickname} does not have access. Requires ${approvalRanks_string}. User was redirected to view their own experience history.`)
                .setTitle(`/experience ${interaction.options.getSubcommand()}`)
                ,2
                )
                const inputs = interaction.options._hoistedOptions
                //! names
                if (inputs.find(i => i.name === 'names')) {
                    let discordUsers = JSON.parse(`[${await getUserIDsFromMention(inputs[0].value, interaction)}]`)
                    discordUsers.forEach(user => {
                       if (user.userId != interaction.member.id) { 
                            returnVal = 2
                            return [ returnVal, approvalRanks_string ]
                        }
                    })
                    return [ returnVal, approvalRanks_string ]
                }
                //! rank
                if (inputs.find(i => i.name == 'rank')) {
                    returnVal = 0
                    return [ returnVal, approvalRanks_string ]
                }
            }
            else { returnVal = 1; return [ returnVal, approvalRanks_string ] }
        }
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
                        nickname: member.nickname != null ? member.nickname : member.user.globalName,
                        userId: member.user.id,
                        rank: cleanupRoles(member.user.roles,'officer_ranks'),
                        status: cleanupRoles(member.user.roles,'status_ranks')
                    }));
                    function cleanupRoles(roles,configType) {
                        let matchingRanks = roles.filter(rank => config[botIdent().activeBot.botName][configType].some(i => i.rank_name === rank));
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
        if (interaction.options.getSubcommand() === 'rank') {
            //Start
            const inputs = interaction.options._hoistedOptions
            const input = inputs.find(i => i.name === 'rank').value
            if (!input.includes("@")) {
                await interaction.editReply({ content: `You did not use Mentionables: Example. "@rank"`, ephemeral: true });
                return
            }
            let [state,approvalRanks_string] = await rankAuth()
            if (state == 0) { await interaction.followUp({ content: `You do not have the roles to view this. Contact ${approvalRanks_string}`, ephemeral: true}); return }

            function getRank(inputArray,inputRank) {
                const clean_ranks = []
                inputRank = inputRank.split(/><|> </)
                let theRanks = config[botIdent().activeBot.botName].general_stuff.allRanks //requires role ids
                function retry_theRanks() {
                    theRanks = config[botIdent().activeBot.botName].general_stuff.testServer.allRanks_testServer
                    if (!theRanks) { 
                        console.log("[config.js], No general_stuff.testServer.allRanks_testServer found for experience.js for test server".red); 
                        return 0
                    }
                    if (theRanks) { return theRanks }
                }
                for (let rank of inputRank) {
                    const cleanRank = rank.replace(/\D/g,'')
                    let item = null;
                    try { item = theRanks.find(i => i.id == cleanRank).rank_name } catch(e) { item = retry_theRanks(); item = item.find(i => i.id == cleanRank).rank_name }
                    try { id = theRanks.find(i=>i.id == cleanRank).id } catch(e) { id = retry_theRanks(); id = id.find(i=>i.id == cleanRank).id }
                    clean_ranks.push({[item]:0,id:id})
                }
                clean_ranks.forEach(searchRank => {
                    inputArray.forEach(i => {
                        if (i.participant_uniform != null) {
                            const multi = JSON.parse(`[${i.participant_uniform}]`);
                            multi.forEach((single,index) => {
                                if (single.rank == Object.keys(searchRank)[0]) { searchRank[single.rank]++ }
                            })
                        }
                    })
                })
                return clean_ranks
            }

            const mysql_opord_sql = 'SELECT participant_uniform FROM `opord`';
            const mysql_opord_response = await database.query(mysql_opord_sql)

            if (mysql_opord_response.length > 0) {
                const ranks = getRank(mysql_opord_response,input)
                let embed = new Discord.EmbedBuilder()
                    .setTitle('Experience Credit')
                    .setAuthor({ name: interaction.member.nickname, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                    .setThumbnail(botIdent().activeBot.icon)
                    .setColor('#FAFA37') //87FF2A green
                    .setDescription(`Times Experience Credit was given to:`)

                ranks.forEach(rank => {
                    const rankVALUE = "```" + JSON.stringify(Object.values(rank)[0]) + "```"
                    const role = interaction.guild.roles.resolve(rank.id)
                    embed.addFields({ name: `${role.name}`, value: rankVALUE, inline: true })
                })
                await interaction.followUp({embeds: [embed]});
            }
        }
        if (interaction.options.getSubcommand() === 'names') {
            let [state,approvalRanks_string] = await rankAuth()
            // if (state == "error" && !approvalRanks_string) { console.log("[config.js], No experienceQuery entries found for experience.js".red); return }
            if (state == 0) { 
                await interaction.followUp({
                    content: `You do not have the roles to view this. Contact ${approvalRanks_string}. You are being redirected to view your own information.`,
                    ephemeral: true 
                }) 
                return
            }
            if (state == 2) { 
                await interaction.followUp({
                    content: `You do not have the roles to view other people. You will only see your own information.`,
                    ephemeral: true 
                })
            }
            async function getName(inputArray,inputName) {
                let ranks = []
                inputArray.forEach(i => {
                    if (i.participant_uniform != null) {
                        // const multi2 = JSON.parse(`[${i.opord_number}]`);
                        // console.log(multi2)
                        const multi = JSON.parse(`[${i.participant_uniform}]`);
                        // console.log(multi)
                        multi.forEach(single => {
                            if (single.userId == inputName.userId) {
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
            // Gather data from the slash command
            const inputs = interaction.options._hoistedOptions
            let input = inputs.find(i => i.name === 'names').value
            

            // Check database for correctly selected opord_number
            // const mysql_opord_values = [opord_number]
            const mysql_opord_sql = 'SELECT participant_uniform,opord_number FROM `opord`';
            const mysql_opord_response = await database.query(mysql_opord_sql)
            if (mysql_opord_response.length > 0 ) {
                if (state == 2) { input = `<@${interaction.user.id}>`; }
                discordUser = JSON.parse(`[${await getUserIDsFromMention(input, interaction)}]`)
                if (discordUser == -1 || discordUser == 0) { return }

                let ranks = [];
                for (const user of discordUser) {
                    const rank = await getName(mysql_opord_response, user);
                    ranks.push(rank);
                }
                const nameOfRequestor = interaction.member.nickname != null ? interaction.member.nickname : interaction.member.globalName
                let embed = new Discord.EmbedBuilder()
                    .setTitle('Experience Credit')
                    .setAuthor({ name: nameOfRequestor, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                    .setThumbnail(botIdent().activeBot.icon)
                    .setColor('#FAFA37') //87FF2A green
                    .setDescription(`Ranks Experience Credit was given as:`)
                    

                ranks.forEach((rankGroup,index) => {
                    // console.log(index,Object.values(rankGroup))
                    embed.addFields({ name: "\u200B", value: `<@${discordUser[index].userId}>`, inline: false })
                    // embed.addFields({ name: "\u200B", value: `**${discordUser[index].nickname}**`, inline: false })
                    Object.values(rankGroup).forEach((rank,index) => {
                        const rankVALUE = "```" + Object.values(rank)[0] + "```"
                        embed.addFields({ name: Object.keys(rank)[0], value: rankVALUE, inline: true })
                    })
                })
                if (state == 1) { await interaction.followUp({embeds: [embed]}) }
                if (state == 2) { await interaction.followUp({embeds: [embed], ephemeral: false }) }
            }
        }
    }
};