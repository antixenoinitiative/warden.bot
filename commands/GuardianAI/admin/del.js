const Discord = require("discord.js");
const { botIdent,botLog,hasSpecifiedRole } = require('../../../functions');
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
    ,
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true })
        async function deleteAllThreads(channel) {
            try {
                // console.log(channel.type,Discord.ChannelType.GuildForum,)
                if (channel.isTextBased() && channel.type !== Discord.ChannelType.GuildForum) {
                    // Normal thread-based channels (not forums)
                    const activeThreads = await channel.threads.fetchActive();
                    const archivedThreads = await channel.threads.fetchArchived();
        
                    const allThreads = [...activeThreads.threads.values(), ...archivedThreads.threads.values()];
        
                    for (const thread of allThreads) {
                        try {
                            await thread.delete();
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
                            await thread.delete();
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
        const applyforranks = await interaction.guild.channels.fetch("1285754040419876914");
        const leadership_thread = await interaction.guild.channels.fetch(leadership_embedChannel);
        const requestor_thread = await interaction.guild.channels.fetch(requestor_embedChannel);
        try {
            const sql = `DELETE FROM promotion;`
            await database.query(sql, false)
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

        
        // Delete all threads in leadership and requestor channels
        if (leadership_thread) {
            await deleteAllThreads(leadership_thread);
        }

        if (requestor_thread) {
            await deleteAllThreads(requestor_thread);
        }
        
        await applyforranks.send({ content: `Cleared all threads and database entries`, ephemeral: true });
        // await interaction.editReply({ content: `Cleared all threads and database entries`, ephemeral: true });

    }
}