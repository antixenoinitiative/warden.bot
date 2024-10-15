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

        if (approvedServers.includes(data.from_serverID)) {
            if (data.commandAsk == "promotion") {
                const { showPromotionChallenge } = require("../commands/GuardianAI/promotionRequest/requestpromotion")
                const axiRoles = data.user.roles
                const testTypes = {
                    "basic": "Sole Survivor",
                    "advanced": "Serpent's Nemesis",
                    "master": "Collector",
                }

                //Unknown user
                if (data.user.roles.includes("unknown user")) {
                    embed.setTitle('Anti Xeno Initiative Progression Challenge')
                        // .setColor('#87FF2A') //bight green
                        // .setColor('#f20505') //bight red
                    embed.setColor('#f2ff00') //bight yellow
                    embed.addFields({name: "Role Requirement:", value: "```" +testTypes[data.promotion.testType]+ "```" })
                    embed.addFields({name: "User Not Detected:", value: "```" +roles+ "```" })
                    const requestor_components = new Discord.ActionRowBuilder()
                        .addComponents(new Discord.ButtonBuilder().setCustomId(`axiRankRetry-${data.user.id}-${data.promotion.testType}-${data.promotion.leadership_threadId}-${data.promotion.requestor_threadId}`).setLabel("Click to Update From AXI").setStyle(Discord.ButtonStyle.Success))
                    data.commandChan.forEach(async chan => {
                        if (data.promotion.requestor_threadId == chan) {
                            const requestor_editedEmbed = Discord.EmbedBuilder.from(embed)
                            requestor_editedEmbed.addFields({name: "How to Rectify:", value: "```Drag and Drop image proof or try to request from AXI server again.```" })
                            requestor_editedEmbed.addFields({name: "Challenge Requirement", value: "AXI Progression Challenges are solo challenges that XSF utilizes as a standard for individual skill.", inline: false})
                            await guild.channels.cache.get(chan).setLocked(false)
                            const embedId = await guild.channels.cache.get(chan).send({ embeds: [requestor_editedEmbed], components: [requestor_components] })
                            const values = [embedId.id,data.promotion.userId]
                            const sql = `UPDATE promotion SET requestor_roleEmbedId = (?), axi_rolesCheck = -3 WHERE userId = (?);`
                            await database.query(sql, values)
                        }
                        else if (data.promotion.leadership_threadId == chan) {
                            const leadership_editedEmbed = Discord.EmbedBuilder.from(embed)
                            leadership_editedEmbed.addFields({name: "Notification:", value: "```User not found on server, user must submit proof in Requestor Thread. Waiting on user to submit proof...```" })
                            const embedId = await guild.channels.cache.get(chan).send({ embeds: [leadership_editedEmbed] })
                            const values = [embedId.id,data.promotion.userId]
                            const sql = `UPDATE promotion SET leadership_roleEmbedId = (?), axi_rolesCheck = -3 WHERE userId = (?);`
                            await database.query(sql, values)
                        }
                    })
                    return
                }
                //Roles detected
                const hasMatchingRole = testTypes[data.promotion.testType]
                if (axiRoles.includes(hasMatchingRole)) {
                    embed.setTitle('Anti Xeno Initiative Progression Challenge')
                    embed.setColor("#87FF2A")
                    embed.addFields({name: "Required AXI Roles detected:", value: "```"+testTypes[data.promotion.testType]+"```" })
                    data.commandChan.forEach(async chan => {
                        if (data.promotion.requestor_threadId == chan) {
                            const embedId = await guild.channels.cache.get(chan).send({ embeds: [embed] })
                            const values = [embedId.id,data.promotion.userId]
                            const sql = `UPDATE promotion SET requestor_roleEmbedId = (?) WHERE userId = (?);`
                            await database.query(sql, values)
                        }
                        if (data.promotion.leadership_threadId == chan) {
                            const embedId = await guild.channels.cache.get(chan).send({ embeds: [embed] })
                            const values = [embedId.id,data.promotion.userId]
                            const sql = `UPDATE promotion SET leadershi_roleEmbedId = (?) WHERE userId = (?);`
                            await database.query(sql, values)
                        }
                    })
                    showPromotionChallenge(data)
                }
                //Role not detected
                else {
                    embed.setTitle('Anti Xeno Initiative Progression Challenge')
                    embed.setColor('#f20505')
                    embed.addFields({name: "Awaiting Requestor:", value: `Once requestor completes the qualifying AXI Progression Challenge **${testTypes[data.promotion.testType]}** (https://antixenoinitiative.com/about-us/ranks/) with proof. Click 'Update from AXI' or drag qualifying image into the chat to progress Promotion Request.`, inline: false })
                    embed.addFields({name: "Roles Found", value: "```Required AXI Progression Challenge **NOT** detected: " +roles+ "```" })
                    const requestor_components = new Discord.ActionRowBuilder()
                        .addComponents(new Discord.ButtonBuilder().setCustomId(`axiRankRetry-${data.user.id}-${promotion.testType}-${promotion.leadership_threadId}-${promotion.requestor_threadId}`).setLabel("Click to Update From AXI").setStyle(Discord.ButtonStyle.Success))
                    data.commandChan.forEach(async chan => {
                        if (data.promotion.requestor_threadId == chan) {
                            const embedId = await guild.channels.cache.get(chan).send({ embeds: [embed], components: [requestor_components] })
                            const values = [embedId.id,data.promotion.userId]
                            const sql = `UPDATE promotion SET requestor_roleEmbedId = (?), axi_rolesCheck = -2 WHERE userId = (?);`
                            await database.query(sql, values)
                        }
                        else {
                            const embedId = await guild.channels.cache.get(chan).send({ embeds: [embed] })
                            const values = [embedId.id,data.promotion.userId]
                            const sql = `UPDATE promotion SET leadership_roleEmbedId = (?), axi_rolesCheck = -2 WHERE userId = (?);`
                            await database.query(sql, values)
                        }
                    })
                    return
                }
                
                
            }
            //from roles_request command
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