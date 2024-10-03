const { io, Manager } = require('socket.io-client')
const { botIdent } = require('../functions')
const Discord = require("discord.js");
const config = require("../config.json")
const { socket } = require('./socketMain')
const uuid = require('uuid');

const approvedServers = config.socketStuff.appoved_fromServer_GuildIds
let dataFromPromotion = null

socket.on('fromSocketServer', async (data) => { 
    // console.log(`[SOCKET SERVER]`.blue, `${data.type}`.bgGreen, `${data.user.id}`.green)
    if (data.type == 'roles_request') { //Server asks all servers in room
        let identifiedUser = null
        try {
            identifiedUser = await guild.members.fetch(data.user.id)
        }
        catch (e) {
            console.log(e)
        }
        if (identifiedUser) {
            console.log(identifiedUser)
            let roles = await identifiedUser.roles.cache
                .sort((a, b) => b.position - a.position)
                .map(role => role.name)
            roles = roles.filter(role=>role != '@everyone')
            let rolesPackage = {
                type: "roles_return_data",
                commandAsk: data.commandAsk,
                commandChan: data.commandChan,
                person_asking: data.person_asking,
                from_server: guild.name,
                from_serverID: guild.id,
                requestor_socket: data.requestor_socket,
                user: { state: true, id: identifiedUser.id, roles: roles }
            }
            socket.emit('roles_return',rolesPackage)
        }
        else {
            let rolesPackage = {
                type: "roles_return_data",
                commandAsk: data.commandAsk,
                commandChan: data.commandChan,
                person_asking: data.person_asking,
                from_server: guild.name,
                from_serverID: guild.id,
                requestor_socket: data.requestor_socket,
                user: { state: false, id: data.user.id, roles: ['unknown user'], }
            }
            socket.emit('roles_return',rolesPackage)
        }
    }
    if (data.type == 'roles_return_data') { //Server responds to the requesting bot with the role information from any reply server..
        let color = null
        if (color = data.user.state == true) { color = "#87FF2A" } //green
        else { color = "#FD0E35" } //red
        const identifiedUser_requestor = await guild.members.fetch(data.person_asking)
        const identifiedUser_subject = await guild.members.fetch(data.user.id)
        const roles = Array.isArray(data.user.roles) ? data.user.roles.join(' \n') : data.user.roles
        let discoveredUsername = null
        if (identifiedUser_subject.displayName) { discoveredUsername = identifiedUser_subject.displayName }
        else { discoveredUsername = identifiedUser_subject.user.globalName + "<> User has not changed their nickname '/nick'" }
        const embed = new Discord.EmbedBuilder()
            .setTitle('Role List Request')
            .setAuthor({name: identifiedUser_requestor.displayName, iconURL: identifiedUser_requestor.user.displayAvatarURL({dynamic:true})})
            .setThumbnail(botIdent().activeBot.icon)
            .setColor(color)
            .addFields(
                {name: "Server", value: "```"+data.from_server+"```" },
                {name: "Who", value: `<@${data.user.id}>` },
                {name: "Roles Found", value: "```"+roles+"```" }
                // {name: "Roles Found", value: roles }
            )
        if (approvedServers.includes(data.from_serverID)) { 
            data.commandChan.forEach(async chan => {
                await guild.channels.cache.get(chan).send({ embeds: [embed] })
            })
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