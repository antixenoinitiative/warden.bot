const mysql = require('mysql2');
const path = require('path');
const {botIdent} = require('../../functions')
require("dotenv").config({ path: `../../${botIdent().activeBot.env}` })

let options = { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', }, myTime = new Intl.DateTimeFormat([], options);

const dbConfig = {
    host: process.env.DATABASE_URL,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_DBASE,
    multipleStatements: true,
    enableKeepAlive: true,
    charset: 'utf8mb4'
};
let connection;
let pool
function handleDisconnect() {
    try {
        let warn;
        if (warn == 1) { console.log("Attempting Reconnect...")}
        connection = mysql.createPool(dbConfig);
        pool = connection.promise()
        // connection.connect(function(err) {
        //     if(err) {
        //         warn = 1;
        //         console.log('E.r.r.o.r. when re-connecting to db:',err,myTime.format(new Date()));
        //         setTimeout(handleDisconnect, 2000);
        //     }
        // });
        connection.on('error',function(err) {
            console.log('db error', err);
            if(err.code === 'PROTOCOL_CONNECTION_LOST') {
                console.log("Handling Disconnect : -> : PROTOCOL_CONNECTION_LOST @ ",myTime.format(new Date()))
                warn = 1;
                handleDisconnect();
            }
            else {
                throw err;
            }
        });
    }
    catch(e) { 
        console.log(e)
    }
}
handleDisconnect();

const ping = setInterval(()=> {
    connection.ping((err) => {
        console.log("Ping MYSQL2: ",myTime.format(new Date()));
        if (err) {
            console.log("Ping Error",err);
        }
    });
},1800000);


module.exports = {connection,pool};