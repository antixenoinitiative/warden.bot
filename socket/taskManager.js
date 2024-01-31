const { io, Manager } = require('socket.io-client')
const { botIdent } = require('../functions')

const { socket } = require('./socketMain')
const uuid = require('uuid');


//todo Primarily for REDIS request returns
socket.on('fromSocketServer', async (data) => { 
    console.log(`[SOCKET SERVER]`.blue, `${data.type}`.bgGreen, `${data}`.green) 
    if (data.type == 'roles_request') {
        try {
            console.log(data)
            try {
                const identifiedUser = guild.members.fetch(data.user.id)
                console.log(identifiedUser.roles.cache.map(role=>role.name))
            }
            catch (e) {
                console.log('guild not ready')
            }
        }
        catch (e) {
            console.logs("[TM]".yellow,"'fromSocketServer'",)
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
            data = {...data, "botClient":botClient, "room": botIdent().activeBot.socketConfig.id, "requestor_socket": socket.id}
            
            let discuss = socket.emit('eventTransmit',data, (response) => {
                if (response.event === "redisRequest") { 
                    callback({response})
                }
                if (response.event === 'roles_request') {
                    callback({response})
                }
                console.log(`[SOCKET SERVER - TASK MANAGER - '${data.event}']`.yellow)
                console.log("[TM]".green);
                console.timeEnd(timerID)
                console.log(response)
                // console.log(colorize(response, {pretty:true}))
                
            return discuss;
            });
        }
        catch(error) { console.log(error) }
    },
    
}
module.exports = taskList