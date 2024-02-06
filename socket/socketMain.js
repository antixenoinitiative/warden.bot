// const { botIdent } = require('../functions')
// const { Manager } = require('socket.io-client')

// let options = { timeZone: 'America/New_York',year: 'numeric',month: 'numeric',day: 'numeric',hour: 'numeric',minute: 'numeric',second: 'numeric',},myTime = new Intl.DateTimeFormat([], options);

// try {
//     console.log("[SOCKET CLIENT]".blue,"STATUS:"," OPERATIONAL ".green)
    
//     const manager = new Manager('https://elitepilotslounge.com/antixenoinitiative-socketserver/', {
//         query: { 'botClient': botIdent().activeBot.botName, 'type': 'client', 'auth': process.env.SOCKET_TOKEN },
//         path: '/antixenoinitiative-socketserver/',
//         upgrade: true,
//         rememberUpgrade: true,
//     })
//     const socket = manager.socket("/")
//     manager.open((err) => {
//         if (err) {
//             console.log('connect error. error code generated from socketMain.js')
//         } else {
//             console.log("connection succ")
//         }
//     });
//     const sockF = {
//         test: function(data) {
//             console.log("test".yellow,`${data}`.yellow)
//             return data
//         },
//     }
//     module.exports = { sockF, socket }
    
//     let socketRooms = null;

//     socket.on("connect", () => {
//         console.log("[SOCKET CLIENT]".blue,"Socket ID: ",`${socket.id}`.green)
//         function socketReconnect(data) {
//             return new Promise(async (resolve,reject) => {
//                 try { socket.emit('joinRoom',data, async (response) => { 
//                     resolve(response);
//                     socketRooms = response
//                 }); }
//                 catch(error) { console.log(error); reject(error) }
//             })
//         }  
//         socketReconnect(botIdent().activeBot.socketConfig.id)
//     })
//     socket.on("disconnect", (reason) => {
//         console.log("[SOCKET CLIENT]".blue,"Disconnect Reason: ".bgRed,reason)
//         socketRooms = false
//         // else the socket will automatically try to reconnect
//     });
//     socket.on("error", (e) => {
//         console.log('socket error',e)
//         socketRooms = false
//     })
//     socket.io.on("reconnect_attempt", (e) => {
//          console.log("[SOCKET CLIENT]".blue,"Reconnect Attempt # ".red,e) 
//     })
    
// }
// catch(error) {
//     console.log(error)
// }