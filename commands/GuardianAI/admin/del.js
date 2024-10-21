const { botIdent,botLog,hasSpecifiedRole } = require('../../../functions');
if (botIdent().activeBot.botName == "GuardianAI") {
    const Discord = require("discord.js");
    const config = require('../../../config.json')
    const colors = require('colors')
    
    const database = require(`../../../${botIdent().activeBot.botName}/db/database.js`)
    
    let leadership_embedChannel = null
    let requestor_embedChannel = null
    let knowledge_proficiency = []
    if (botIdent().activeBot.botName == "GuardianAI") {
        if (process.env.MODE != "PROD") {
            console.log("[CAUTION]".bgYellow, "knowledge proficiency embed channel required. Check config.json file. guardianai.general_stuff.knowledge_proficiency. Using testServer input if available")
            leadership_embedChannel = config[botIdent().activeBot.botName].general_stuff.testServer.knowledge_proficiency.leadership_embedChannel
            requestor_embedChannel = config[botIdent().activeBot.botName].general_stuff.testServer.knowledge_proficiency.requestor_embedChannel
            knowledge_proficiency = Object.values(config[botIdent().activeBot.botName].general_stuff.testServer.knowledge_proficiency).map(i=>i)
      }
        else { 
            leadership_embedChannel = config[botIdent().activeBot.botName].general_stuff.knowledge_proficiency.leadership_embedChannel
            requestor_embedChannel = config[botIdent().activeBot.botName].general_stuff.knowledge_proficiency.requestor_embedChannel
            knowledge_proficiency = Object.values(config[botIdent().activeBot.botName].general_stuff.knowledge_proficiency).map(i=>i)
        }
    }
    module.exports = {
        data: new Discord.SlashCommandBuilder()
            .setName('del')
            .setDescription('delete test stuff')
            .addStringOption(option =>
                option.setName('thread')
                    .setDescription('Choose mine or all')
                    .setRequired(true)
                    .addChoices({ name: "Mine", value: "mine"})
                    .addChoices({ name: "All", value: "all"})
            )
            // .setDefaultMemberPermissions(Discord.PermissionFlagsBits.Administrator)
        ,
        async execute(interaction) {
            await interaction.deferReply({ ephemeral: false })
            async function deleteAllThreads(channel,promotion,selection) {
                try {
                    // console.log(channel.type,Discord.ChannelType.GuildForum,)
                    if (channel.isTextBased() && channel.type !== Discord.ChannelType.GuildForum) {
                        // Normal thread-based channels (not forums)
                        const activeThreads = await channel.threads.fetchActive();
                        const archivedThreads = await channel.threads.fetchArchived();
            
                        const allThreads = [...activeThreads.threads.values(), ...archivedThreads.threads.values()];
            
                        for (const thread of allThreads) {
                            try {
                                if (selection == 'mine') {
                                    if (thread.id == promotion.requestor_threadId) { 
                                        await thread.delete();
                                    }
                                }
                                else {
                                    await thread.delete()
                                }
                                // console.log(`Deleted thread: ${thread.name}`);
                            } catch (err) {
                                // console.error(`Failed to delete thread: ${thread.name}`, err);
                            }
                        }
                    } 
                    else if (channel.type === Discord.ChannelType.GuildForum) {
                        // For forum channels, fetch all posts (threads)
                        const forumPosts = await channel.threads.fetch(); // Fetch all threads (forum posts)
                        
                        for (const thread of forumPosts.threads.values()) {
                            try {
                                if (selection == 'mine') {
                                    if (thread.id == promotion.leadership_threadId) { 
                                        await thread.delete();
                                    }
                                }
                                else {
                                    await thread.delete()
                                }
                                
                                // console.log(`Deleted forum post (thread): ${thread.name}`);
                            } catch (err) {
                                // console.error(`Failed to delete forum post (thread): ${thread.name}`, err);
                            }
                        }
                    }
                } catch (err) {
                    console.error(`Error fetching threads for channel: ${channel.id}`, err);
                }
            }
            const selection = interaction.options.data.find(arg => arg.name === 'thread').value
            let promotion = null
            if (selection == "mine") { 

                try { //Get DB info of thread
                    const values = selection == "mine" ? interaction.user.id : false
                    const sql = selection == "mine" ? 'SELECT * FROM `promotion` WHERE userId = (?)' : 'SELECT * FROM `promotion`'
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
            }
            const applyforranks = await interaction.guild.channels.fetch("1285754040419876914");
            leadership_thread = await interaction.guild.channels.fetch(leadership_embedChannel)
            requestor_thread = await interaction.guild.channels.fetch(requestor_embedChannel)
            // const leadership_thread = selection == "mine" ? await interaction.guild.channels.fetch(promotion.leadership_threadId) : await interaction.guild.channels.fetch(leadership_embedChannel)
            // const requestor_thread = selection == "mine" ? await interaction.guild.channels.fetch(promotion.requestor_threadId) : await interaction.guild.channels.fetch(requestor_embedChannel)

            
            
            // Delete all threads in leadership and requestor channels
            if (leadership_thread) {
                await deleteAllThreads(leadership_thread,promotion,selection);
            }
            
            if (requestor_thread) {
                await deleteAllThreads(requestor_thread,promotion,selection);
            }
            
            try {
                const values = selection == "mine" ? interaction.user.id : false
                const sql = selection == "mine" ? `DELETE FROM promotion WHERE userId = (?);` : `DELETE FROM promotion;` 
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
            // await applyforranks.send({ content: `Cleared all threads and database entries`, ephemeral: true });
            if (selection == "mine") { 
                await interaction.editReply({ content: `- Cleared **${interaction.user.displayName}** threads and database entries` });
            }
            else {
                await interaction.editReply({ content: `- Cleared **ALL** threads and database entries` });
            }
    
        }
    }
}