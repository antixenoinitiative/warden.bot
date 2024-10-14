const { io, Manager } = require('socket.io-client')
const { botIdent } = require('../functions')
const Discord = require("discord.js");
const config = require("../config.json")
const { socket } = require('./socketMain')
const uuid = require('uuid');
const database = require(`../${botIdent().activeBot.botName}/db/database`)


const approvedServers = config.socketStuff.appoved_fromServer_GuildIds
let dataFromPromotion = null

socket.on('fromSocketServer', async (data) => {
    // console.log(`[SOCKET SERVER]`.blue, `${data.type}`.bgGreen, `${data.user.id}`.green, `${data.from_serverID}`.cyan)
    if (data.type == 'roles_request') { //Server asks all servers in room
        let identifiedUser = null
        try {
            // identifiedUser = await guild.members.fetch('783141808074522654')
            identifiedUser = await guild.members.fetch(data.user.id)
            let roles = await identifiedUser.roles.cache
                .sort((a, b) => b.position - a.position)
                .map(role => role.name)
            roles = roles.filter(role=>role != '@everyone')
            let rolesPackage = {
                from_server: guild.name,
                type: "roles_return_data",
                promotion: data.promotion,
                commandAsk: data.commandAsk,
                commandChan: data.commandChan,
                person_asking: data.person_asking,
                from_serverID: guild.id,
                requestor_socket: data.requestor_socket,
                user: { state: true, id: identifiedUser.id, roles: roles }
            }
            socket.emit('roles_return',rolesPackage)
            if (data.promotion.commandAsk == "promotion") {
                try {
                    const values = [1, data.user.id]
                    const sql = `UPDATE promotion SET axi_rolesCheck = (?)  WHERE userId = (?);`
                    await database.query(sql, values)
                }
                catch (err) {
                    console.log(err)
                }
            }
        }
        catch (e) {
            let rolesPackage = {
                from_server: guild.name,
                type: "roles_return_data",
                promotion: data.promotion,
                commandAsk: data.commandAsk,
                commandChan: data.commandChan,
                person_asking: data.person_asking,
                from_serverID: guild.id,
                requestor_socket: data.requestor_socket,
                user: { state: false, id: data.user.id, roles: ['unknown user'] }
            }
            socket.emit('roles_return',rolesPackage)
            if (data.commandAsk == "promotion") { 
                try {
                    const values = [0, data.user.id]
                    const sql = `UPDATE promotion SET axi_rolesCheck = (?)  WHERE userId = (?);`
                    await database.query(sql, values)
                }
                catch (err) {
                    console.log(err)
                }
             }
        }
    }
    if (data.type == 'roles_return_data') { //Server responds to the requesting bot with the role information from any reply server..
        // let color = null
        // if (color = data.user.state == true) { color = "#87FF2A" } //green
        // else { color = "#FD0E35" } //red
        const identifiedUser_requestor = await guild.members.fetch(data.person_asking)
        const identifiedUser_subject = await guild.members.fetch(data.user.id)
        const roles = Array.isArray(data.user.roles) ? data.user.roles.join(' \n') : data.user.roles
        let discoveredUsername = null
        if (identifiedUser_subject.displayName) { discoveredUsername = identifiedUser_subject.displayName }
        else { discoveredUsername = identifiedUser_subject.user.globalName + "<> User has not changed their nickname '/nick'" }
        const embed = new Discord.EmbedBuilder()
            .setAuthor({name: identifiedUser_requestor.displayName, iconURL: identifiedUser_requestor.user.displayAvatarURL({dynamic:true})})
            .setThumbnail(botIdent().activeBot.icon)
            .addFields(
                {name: "Server", value: "```"+data.from_server+"```" },
                {name: "Requestor", value: `<@${data.user.id}>` },
            )
        // console.log(data)
        if (approvedServers.includes(data.from_serverID)) {
            if (data.commandAsk == "promotion") {
                const { showPromotionChallenge } = require("../commands/GuardianAI/promotionRequest/requestpromotion")
                const axiRoles = data.user.roles 
                const testTypes = {
                    "basic": "Sole Survivor",
                    "advanced": "Serpent's Nemesis",
                    "master": "Collector",
                }
                if (data.user.roles.includes("unknown user")) {
                    embed.setTitle('Anti Xeno Initiative Progression Challenge')
                    embed.setColor("#87FF2A")
                    embed.addFields({name: "Error:", value: "```User Not detected on Anti-Xeno Initiative Server:" +roles+ "```" })
                    embed.addFields({name: "How to Rectify:", value: "```Drag and Drop image proof or try to request from AXI server again.```" })
                    const requestor_components = new Discord.ActionRowBuilder()
                        .addComponents(new Discord.ButtonBuilder().setCustomId(`axiRankRetry-${data.user.id}-${promotion.testType}-${promotion.leadership_threadId}-${promotion.requestor_threadId}`).setLabel("Click to Update From AXI").setStyle(Discord.ButtonStyle.Success))
                    data.commandChan.forEach(async chan => {
                        if (data.promotion.requestor_threadId == chan) {
                            embed.addFields({name: "XSF", value: "The AXI Progression Challenge proof can be submitted here. Drag and Drop an image into the chat. Ensure you follow the AXI rank requirements as they are the same here.", inline: false})
                            embed.addFields({name: "AXI", value: "You have an opportunity to join Anti-Xeno Initiative and request the rank according to their procedures.", inline: false})
                            await guild.channels.cache.get(chan).send({ embeds: [embed], components: [requestor_components] })
                        }
                        else {
                            embed.addFields({name: "How to Rectify:", value: "```Waiting on user to submit proof...```" })
                            await guild.channels.cache.get(chan).send({ embeds: [embed] })
                        }
                    })
                    return
                }

                const hasMatchingRole = testTypes[data.promotion.testType]
                if (axiRoles.includes(hasMatchingRole)) {
                    embed.setTitle('Anti Xeno Initiative Progression Challenge')
                    embed.setColor("#87FF2A")
                    embed.addFields({name: "Roles Found", value: "```Required AXI Roles detected: "+testTypes[data.promotion.testType]+"```" })
                    data.commandChan.forEach(async chan => {
                        await guild.channels.cache.get(chan).send({ embeds: [embed] })
                    })
                    showPromotionChallenge(data)
                }
                else {
                    embed.setTitle('Anti Xeno Initiative Progression Challenge')
                    embed.setColor('#FD0E35')
                    embed.addFields({name: "Awaiting Requestor:", value: `Once requestor completes the qualifying AXI Progression Challenge **${testTypes[data.promotion.testType]}** (https://antixenoinitiative.com/about-us/ranks/) with proof. Click 'Update from AXI' or drag qualifying image into the chat to progress Promotion Request.`, inline: false })
                    embed.addFields({name: "Roles Found", value: "```Required AXI Progression Challenge **NOT** detected: " +roles+ "```" })
                    const requestor_components = new Discord.ActionRowBuilder()
                        .addComponents(new Discord.ButtonBuilder().setCustomId(`axiRankRetry-${data.user.id}-${promotion.testType}-${promotion.leadership_threadId}-${promotion.requestor_threadId}`).setLabel("Click to Update From AXI").setStyle(Discord.ButtonStyle.Success))
                    data.commandChan.forEach(async chan => {
                        if (data.promotion.requestor_threadId == chan) {
                            await guild.channels.cache.get(chan).send({ embeds: [embed], components: [requestor_components] })
                        }
                        else {
                            await guild.channels.cache.get(chan).send({ embeds: [embed] })
                        }
                    })
                    return
                }
                
                
            }
            if (data.commandAsk == "nopromotion") {
                data.commandChan.forEach(async chan => {
                    embed.setTitle('Server Role Request')
                    embed.setColor("Green")
                    embed.addFields({name: "Roles Found", value: "```"+roles+"```" })
                    await guild.channels.cache.get(chan).send({ embeds: [embed] })
                })
            }
        }
    }
}) 

const taskList = {
    socket_joinRoom: async function(requestedRoom) {
        return new Promise(async (resolve,reject) => {
            try { socket.emit('joinRoom',requestedRoom, async (response) => { 
                resolve(response);
                
             }); }
            catch(error) { console.log(error); reject(error) }
        })
    },
    socket_leaveRoom: async function(requestedRoom) {
        return new Promise(async (resolve,reject) => {
            try { socket.emit('leaveRoom',requestedRoom, async (response) => { 
                resolve(response);
               
             }); }
            catch(error) { console.log(error); reject(error) }
        })
    },
    socket_rooms: async function(requestedRoom) { 
        return new Promise(async (resolve,reject) => {
            try { socket.emit('roomStatus',requestedRoom, async (response) => { 
                resolve(response);
                console.log("roomStatus:",response)
             }); }
            catch(error) { console.log(error); reject(error) }
        })
    },
    requestInfo: async function(data) {
        try {
            const timerID = uuid.v4().slice(-5); 
            console.time(timerID)
            const botClient = botIdent().activeBot.botName
            data = {...data, "botClient":botClient, "room": botIdent().activeBot.socketRoom.id, "requestor_socket": socket.id}
            
            let discuss = socket.emit('eventTransmit',data, (response) => {
                if (response.event === "redisRequest") { 
                    callback({response})
                    // console.log(response)
                }
                console.log(`[SOCKET SERVER - TASK MANAGER - '${data.event}']`.yellow)
                console.log("[TM]".green)
                console.timeEnd(timerID)
                // console.log(colorize(response, {pretty:true}))
                
            return discuss;
            });
        }
        catch(error) { console.log(error) }
    },
}
module.exports = taskList