let config = require('../../../config.json')
const Discord = require('discord.js')
const fs = require("fs")
const path = require("path")
const glob = require('glob')
const { botLog, botIdent } = require('../../../functions') 
const database = require(`../../../${botIdent().activeBot.botName}/db/database`)

const thisBotFunctions = { 
    removeBulkMessages: async function (userId,message) {
        try {
            const values = [userId]
            const sql = 'SELECT * FROM `promotion` WHERE userId = (?)'
            const response = await database.query(sql,values)
            if (response.length > 0 ) {
                // console.log('Mass Bulk Delete'.cyan)
                try {
                    const emptyArray = JSON.stringify([])
                    const values = [emptyArray,userId]
                    const sql = `UPDATE promotion SET 
                        bulkMessages = ?
                        WHERE userId = ?;
                    `
                    await database.query(sql, values)    
                }
                catch (err) {
                    console.log(err)
                    botLog(guild,new Discord.EmbedBuilder()
                        .setDescription('```' + err.stack + '```')
                        .setTitle(`⛔ Fatal error experienced`)
                        ,2
                        ,'error'
                    )
                }
                JSON.parse(response[0].bulkMessages).forEach(async msg => {
                    msg = JSON.parse(msg)
                    // console.log("DELETE BULK MSG ITEM:".yellow,msg)
                    const channelObj = await message.guild.channels.fetch(msg[0].thread)
                    const msgObj = await channelObj.messages.fetch(msg[0].message)
                    if (msgObj) {
                        // console.log("Deleting Msg:".yellow,msg[0].message)
                        msgObj.delete()
                    }
                })
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
    saveBulkMessages: async function (userId,array) {
        try {
            array = JSON.stringify(array)
            const values = [array,userId]
            const sql = `UPDATE promotion SET 
                    bulkMessages = JSON_ARRAY_APPEND(bulkMessages, '$', ?)
                    WHERE userId = (?);
                `
            await database.query(sql, values)    
        }
        catch (err) {
            console.log(err)
            botLog(guild,new Discord.EmbedBuilder()
                .setDescription('```' + err.stack + '```')
                .setTitle(`⛔ Fatal error experienced`)
                ,2
                ,'error'
            )
        }
    }
}
module.exports = thisBotFunctions