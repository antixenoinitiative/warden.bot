const { botIdent, botLog } = require('../../functions')
const Discord = require("discord.js");

if (botIdent().activeBot.botName == 'Warden') {
    const mysql = require('mysql2');
    require("dotenv").config({ path: `../../${botIdent().activeBot.env}` });

    let options = { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' };
    const myTime = new Intl.DateTimeFormat([], options);
    const dbConfig = {
        host: process.env.DATABASE_URL,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_DBASE,
        multipleStatements: true,
        enableKeepAlive: true,
        charset: 'utf8mb4'
    };
    const testdbConfig = {
        host: process.env.DATABASE_URL,
        user: process.env.DATABASE_TESTUSER,
        password: process.env.DATABASE_TESTPASSWORD,
        database: process.env.DATABASE_TESTDBASE,
        multipleStatements: true,
        enableKeepAlive: true,
        charset: 'utf8mb4'
    };
    let pool;
    let connection;
    if (process.env.MODE == 'PROD') {
        console.log("[STARTUP]".yellow,`${botIdent().activeBot.botName}`.green,"Loading Database Functions:".magenta,'✅');
        createPool();
    }
    else {
        console.log("[STARTUP]".yellow,`${botIdent().activeBot.botName}`.green,"Loading Test Server Database Functions:".cyan,'✅');
        createPool('dbtest');
    }
    async function createPool(testdb) {
        if (testdb) { pool = mysql.createPool(testdbConfig); }
        else { pool = mysql.createPool(dbConfig); }
    
        pool.on('error', (err) => {
            console.error('Database pool error:', err);
            if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                console.log('Attempting to reconnect...');
                createPool();
            } else {
                throw err;
            }
        });
    }
    async function query(query, values) {
        return new Promise((resolve,reject) => {
            // pool.execute(query, values, (err,res) => {
            pool.query(query, values, (err,res) => {
                if (err) { reject(err) }
                resolve(res)
            })
        })
    }
    //! ##############################
    //! ##############################
    //! ##############################
    //! #######STARTUP CHECKS#########

    /**
    * @author testfax (Medi0cre) @testfax
    * @description This function ensures that the approve/deny staff buttons for leaderboard submissions are available after a server restart.
    */
    const leaderboards = ['speedrun','ace']
    leaderboards.forEach(i => { checkLeaderboards(i) })

    async function checkLeaderboards(leaderboard) {
        let unapproved_array = []
        try {
            const unapproved_list_values = false
            const unapproved_list_sql = `SELECT id,embed_id FROM ${leaderboard} WHERE approval = (?)`
            const unapproved_list_response = await query(unapproved_list_sql, unapproved_list_values)
            if (unapproved_list_response.length > 0) {
                unapproved_array = unapproved_list_response
            }
        } catch (err) {
            console.log(err)
            botLog(global.guild,new Discord.EmbedBuilder()
                .setDescription('```' + err.stack + '```')
                .setTitle(`⛔ Fatal error experienced. checkLeaderboards(${leaderboard})`)
                ,2
                ,'error'
            )
            return
        } 
        // console.log(unapproved_array)
        const staffChannel = process.env.STAFFCHANNELID
        const staffChannel_obj = await global.guild.channels.fetch(staffChannel)
        unapproved_array.forEach(async dbInfo => {
            // console.log(dbInfo)
            try {
                const originalMessage = await staffChannel_obj.messages.fetch(dbInfo.embed_id)
                const receivedEmbed = originalMessage.embeds[0]
                let oldEmbedSchema = {
                    title: receivedEmbed.title,
                    description: receivedEmbed.description,
                    color: receivedEmbed.color,
                    fields: receivedEmbed.fields
                } 
                const newEmbed = new Discord.EmbedBuilder()
                    .setTitle(oldEmbedSchema.title)
                    .setDescription(oldEmbedSchema.description)
                    .setColor(oldEmbedSchema.color)
                    .setThumbnail(botIdent().activeBot.icon)  
                oldEmbedSchema.fields.forEach(i => {
                    newEmbed.addFields({name: i.name, value: i.value, inline: true},)
                })
                const row = new Discord.ActionRowBuilder()
                    .addComponents(new Discord.ButtonBuilder().setCustomId(`submission-${leaderboard}-approve-${dbInfo.id}`).setLabel('Approve').setStyle(Discord.ButtonStyle.Success),)
                    .addComponents(new Discord.ButtonBuilder().setCustomId(`submission-${leaderboard}-deny-${dbInfo.id}`).setLabel('Delete').setStyle(Discord.ButtonStyle.Danger),)
                const editedEmbed = Discord.EmbedBuilder.from(newEmbed)
                let buttonResult = null;
                buttonResult = await originalMessage.edit({ embeds: [editedEmbed], components: [row] })
                  
                try {
                    const submissionUpdate_values = [dbInfo.embed_id,dbInfo.id]
                    const submissionUpdate_sql = `UPDATE ${leaderboard} SET embed_id = (?) WHERE id = (?);`
                    await query(submissionUpdate_sql, submissionUpdate_values)
                } catch (err) {
                    console.log(err)
                    botLog(global.guild,new Discord.EmbedBuilder()
                        .setDescription('```' + err.stack + '```')
                        .setTitle(`⛔ Fatal error experienced. checkLeaderboards(${leaderboard})`)
                        ,2
                        ,'error'
                    )
                }
            }
            catch (err) {
                console.log(err)
                botLog(global.guild,new Discord.EmbedBuilder()
                    .setDescription('```' + err.stack + '```')
                    .setTitle(`⛔ Fatal error experienced: checkLeaderboards(${leaderboard})`)
                    ,2
                    ,'error'
                )
                return
            }
        })
    }
    

    //! ##############################
    //! ##############################
    //! ##############################
    //! ##############################
    
    
    module.exports = { pool, query };
}