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
async function query(query, values, callback) {
    try {
        await pool.execute(query, values, (err, results, fields) => {
            if (err) {
                console.error('Error executing query:', err.stack);
                callback(err, null);
            } else {
                console.log("QUERY RES:\n".bgYellow, results);
                callback(null, results);
            }
        });
    } catch (e) {
        console.error('Error executing query:', e.stack);
        callback(e, null);
    }
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

// creator VARCHAR(255),
// mission_statement TEXT,
// date_time VARCHAR(255),
// wing_size VARCHAR(255),
// meetup_location VARCHAR(255),
// carrier_parking VARCHAR(255),
// weapons_required VARCHAR(255),
// modules_required VARCHAR(255),
// prefered_build VARCHAR(255),
// objective_a VARCHAR(255),
// objective_b VARCHAR(255),
// objective_c VARCHAR(255),
// voice_channel VARCHAR(255)



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
                            opord_number INT DEFAULT 0
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