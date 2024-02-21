const mysql = require('mysql2');
const { botIdent } = require('../../functions');
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
let pool;
createPool();
function createPool() {
    pool = mysql.createPool(dbConfig);
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
opordChecks()
// deleteOpordTable()
//! ##############################
//! ##############################
//! ##############################
//! ##############################
function deleteOpordTable() {
    const values = ['opord']
    const sql = `DROP TABLE IF EXISTS ${values}`;
    try {
        query(sql, values, (err, res) => {
            if (err) {
                console.error('Error executing query:', err.stack);
                return;
            }
            console.log(res,'opord table deleted successfully');
        });
    } catch (e) {
        console.error('Error:', e.stack);
    }
}
// Check if the table exists
function opordChecks() {
    try {
        const sql = `SELECT 1 FROM information_schema.tables WHERE table_name = ? LIMIT 1`;
        const values = ['opord']
        query(sql, values, (err, res) => {
            if (err) {
                console.error("[STARTUP]".yellow, `${botIdent().activeBot.botName}`.green, "Creating OPORD Table Fail:".magenta, '❌');
                console.error(err);
            } else {
                if (res && res.length > 0) {
                    // console.log("Table Exists");
                    return
                } else {
                    const values2 = ['0']
                    const sql2 = `
                        CREATE TABLE opord (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            opord_number INT DEFAULT 0,
                            message_id VARCHAR(255),
                            creator VARCHAR(255),
                            participant_lock INT DEFAULT 0,
                            participant_uniform TEXT,
                            participant_players TEXT,
                            operation_name VARCHAR(255),
                            mission_statement TEXT,
                            date_time VARCHAR(255),
                            wing_size VARCHAR(255),
                            meetup_location TEXT,
                            carrier_parking TEXT,
                            weapons_required TEXT,
                            modules_required TEXT,
                            prefered_build TEXT,
                            objective_a TEXT,
                            objective_b TEXT,
                            objective_c TEXT,
                            voice_channel VARCHAR(255)
                        );
                    `;
                    query(sql2, values2, (err, res) => {
                        if (err) {
                            console.error("[STARTUP]".yellow, `${botIdent().activeBot.botName}`.green, "Creating OPORD Table Fail:".magenta, '❌');
                            console.error(err);
                        } else {
                            const values3 = ['0']
                            const sql3 = `
                                INSERT INTO opord (opord_number) VALUES (?);
                            `;
                            query(sql3, values3, (err, res) => {
                                if (err) {
                                    console.error("[STARTUP]".yellow, `${botIdent().activeBot.botName}`.green, "Creating OPORD Table Fail:".magenta, '❌');
                                    console.error(err);
                                } else {
                                    console.log("[STARTUP]".yellow, `${botIdent().activeBot.botName}`.green, "Creating OPORD Table:".magenta, '✅');
                                }
                            });
                        }
                    });
                }
            }
        });
    } catch (e) {
        console.error("[STARTUP]".yellow, `${botIdent().activeBot.botName}`.green, "Creating OPORD Table Fail:".magenta, '❌');
        console.error(e);
    }
}

module.exports = { pool, query };