const { botIdent } = require('../../functions');
if (botIdent().activeBot.botName == 'GuardianAI') {
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

    opordChecks()
    carrier_jumpChecks()

    // deleteTable('carrier_jump')
    //! ##############################
    //! ##############################
    //! ##############################
    //! ##############################
    // function deleteTable(table) {
    //     const values = [table]
    //     const sql = `DROP TABLE IF EXISTS ${values}`;
    //     try {
    //         query(sql, values, (err, res) => {
    //             if (err) {
    //                 console.error('Error executing query:', err.stack);
    //                 return;
    //             }
    //             console.log(res,'opord table deleted successfully');
    //         });
    //     } catch (e) {
    //         console.error('Error:', e.stack);
    //     }
    // }

    // Check if the table exists
    async function opordChecks() {
        try {
            const opord_table_sql = `SELECT 1 FROM information_schema.tables WHERE table_name = ? LIMIT 1`;
            const opord_table_values = ['opord']
            const opord_table_result = await query(opord_table_sql, opord_table_values)
            if (opord_table_result.length == 0) {
                const opord_table_create_values = ['0']
                const opord_table_create_sql = `
                    CREATE TABLE opord (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        unix varchar(255),
                        opord_number INT DEFAULT 0,
                        approved_message_id VARCHAR(255),
                        await_message_id VARCHAR(255),
                        event_id VARCHAR(255),
                        creator JSON,
                        participant_lock INT DEFAULT 0,
                        participant_uniform TEXT DEFAULT 0,
                        participant_players TEXT DEFAULT 0,
                        operation_name VARCHAR(255),
                        mission_statement TEXT,
                        meetup_location TEXT,
                        carrier_parking TEXT,
                        prefered_build TEXT,
                        voice_channel VARCHAR(255),
                        additional_instructions TEXT
                    );
                `;
                await query(opord_table_create_sql,opord_table_create_values)
                const opord_table_insert_row0_values = ['0']
                const opord_table_insert_row0_sql = `
                    INSERT INTO opord (opord_number) VALUES (?);
                `;
                const opord_table_insert_row0_response = await query(opord_table_insert_row0_sql, opord_table_insert_row0_values)
                if (opord_table_insert_row0_response) {
                    console.log("[STARTUP]".yellow, `${botIdent().activeBot.botName}`.green, "Creating OPORD Table:".magenta, '✅');
                }
            }
        } catch (e) {
            console.error("[STARTUP]".yellow, `${botIdent().activeBot.botName}`.green, "Creating OPORD Table Fail:".magenta, '❌');
            console.error(e);
        }
    }
    async function carrier_jumpChecks() {
        try {
            const carrier_jump_table_sql = `SELECT 1 FROM information_schema.tables WHERE table_name = ? LIMIT 1`;
            const carrier_jump_table_values = ['carrier_jump']
            const carrier_jump_table_result = await query(carrier_jump_table_sql, carrier_jump_table_values)
            if (carrier_jump_table_result.length == 0) {
                const carrier_jump_table_create_values = ['0']
                const carrier_jump_table_create_sql = `
                    CREATE TABLE carrier_jump (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        starSystem varchar(255)
                    );
                `;
                await query(carrier_jump_table_create_sql,carrier_jump_table_create_values)
                const carrier_jump_table_insert_row0_values = ['Sol']
                const carrier_jump_table_insert_row0_sql = `
                    INSERT INTO carrier_jump (starSystem) VALUES (?);
                `;
                const carrier_jump_table_insert_row0_response = await query(carrier_jump_table_insert_row0_sql, carrier_jump_table_insert_row0_values)
                if (carrier_jump_table_insert_row0_response) {
                    console.log("[STARTUP]".yellow, `${botIdent().activeBot.botName}`.green, "Creating carrier_jump Table:".magenta, '✅');
                }
            }
        } catch (e) {
            console.error("[STARTUP]".yellow, `${botIdent().activeBot.botName}`.green, "Creating carrier_jump Table Fail:".magenta, '❌');
            console.error(e);
        }
    }
    module.exports = { pool, query };
}