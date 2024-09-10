const { botIdent } = require('../../functions');
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

    
    //! ##############################
    //! ##############################
    //! ##############################
    //! ##############################
    
    
    module.exports = { pool, query };
}