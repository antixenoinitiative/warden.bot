/* eslint-disable no-prototype-builtins */
require("dotenv").config();
const { Pool } = require('pg');
const weeks = require("./weeks/weeks.json");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
}) //credentials from Heroku

module.exports = {
    query: async (text, params, callback) => {
        try {
            let res = pool.query(text, params, callback);
            return res;
        } catch {
            return "Failed";
        }
    },

    /**
     * Add a presence level to Database by name
     * @author   (Mgram) Marcus Ingram
     * @param    {String} name    Name of the Star System
     * @param    {Int} presence   Presence level of the system (1-5) 5 = Massive, 1 = None
     */
    addPresence: async (name, presence) => {
        let time = Math.floor(new Date().getTime()); // Unix time
        let res;
        let id;
        try { res = await pool.query(`SELECT system_id FROM systems WHERE name = $1`, [name]) } catch (err) { console.log(err) }
        if (id == undefined) { id = 0 } else { id = res.rows[0].system_id }
        if (id == 0) {
            try { await pool.query(`INSERT INTO systems(name,status)VALUES($1,'1')`, [name]) } catch (err) { console.log(err) }
            try { res = await pool.query(`SELECT system_id FROM systems WHERE name = $1`, [name]) } catch (err) { console.log(err) }
            id = res.rows[0].system_id;
        }
        try { await pool.query(`INSERT INTO presence(system_id,presence_lvl,time)VALUES($1,$2,$3)`, [id, presence, time]) } catch (err) { console.log(err) }
    },

    /**
     * Returns the Database ID for the system name requested
     * @author   (Mgram) Marcus Ingram
     * @param    {String} name    Name of the Star System
     * @return   {Int}            Star System Database ID
     */
    getSysID: async (name) => {
        try {
            let res = await pool.query("SELECT system_id FROM systems WHERE name = $1", [name]);
            if (res.rowCount == 0) {
                return 0;
            }
            return res.rows[0].system_id;
        } catch (err) {
            return 0; // Return 0 if system is not in the DB
        }
    },

    /**
     * Gets the most recent system presence level for a system id.
     * @author   (Mgram) Marcus Ingram
     * @param    {Int} system_id     Database ID of the Star System
     * @return   {Int}               Returns presence level for Star System
     */
    getPresence: async (system_id) => {
        try {
            let { rows } = await pool.query("SELECT MAX(time) FROM presence WHERE system_id = $1", [system_id]);
            let time = rows[0].max;
            let result = await pool.query("SELECT presence_lvl FROM presence WHERE time = $1", [time]);
            return result.rows[0].presence_lvl; // Return Presence
        } catch (err) {
            console.error(err);
        }
    },

    /**
     * Returns an object with current incursions and their presence levels (WORK IN PROGRESS)
     * @author   (Mgram) Marcus Ingram
     * @return   {Int}       Returns map object with incursion system name:presence level
     */
    getIncList: async () => {
        try {
            let res = await pool.query("SELECT * FROM systems WHERE status = '1'");
            let list = new Map();
            for (let i = 0; i < res.rowCount; i++) {
                let { rows } = await pool.query("SELECT MAX(time) FROM presence WHERE system_id = $1", [res.rows[i].system_id]);
                let time = rows[0].max;
                let result = await pool.query("SELECT presence_lvl FROM presence WHERE time = $1", [time]);
                let presence = result.rows[0].presence_lvl; // Return Presence
                list.set(res.rows[i].name, presence);
            }
            return list;
        } catch (err) {
            console.error(err);
        }
    },

    /**
     * Returns presence as string from lvl 
     * @author   (Mgram) Marcus Ingram
     * @param    {Int} presence_lvl    Input value of presence level          
     * @return   {String}              Returns the presence level as a string
     */
    convertPresence: (presence_lvl) => {
        switch (presence_lvl) {
            case 0:
                return "No data available";
            case 1:
                return "No Thargoid Presence";
            case 2:
                return "Marginal Thargoid Presence";
            case 3:
                return "Moderate Thargoid Presence";
            case 4:
                return "Significant Thargoid Presence";
            case 5:
                return "Massive Thargoid Presence";
        }
    },
    /**
    * Returns Week Object for given Timestamp (UTC)
    * @author   (Mgram) Marcus Ingram
    * @param    {number} timestamp         Unix Timestamp
    * @returns  {Object}                   Object { week: <number>, start: <unix>, end: <unix> }
    */
    getWeek: (timestamp) => {
        try {
            for (var i = 0; i < weeks.length; i++) {
                if (timestamp >= weeks[i].start && timestamp <= weeks[i].end) {
                    return weeks[i];
                }
            }
            throw "Timestamp not found in weeks.json"
        } catch (err) {
            console.log(err);
        }
    },
    /**
    * Creates a backup of user roles, returns number of edits made
    * @author   (AmanBP) Aman Bhai Patel
    * @param    {Object} roleList       Object { userid<string> : roles<array<string>>}
    * @param    {Integer} createdTime   Integer with unix Epoch
    * @returns  {Array}                 Array [flag<string[2]>, updates_performed<int>, additions_performed<int>]
    */
    takeBackup: async (roleList,createdTime) => {
        try {
            let res = await pool.query(`select id from users`)
            let done = []
            let results = res.rows
            results.forEach(obj => {
                done.push(obj["id"])
            })
            let check_update = []
            let need_adding = []
            for (var key in roleList) {
                if (done.includes(key)) {
                    check_update.push(key)
                }
                else {
                    need_adding.push(key)
                }
            }
            let i = 0
            let update_count = 0;
            let flag = ""
            if (check_update.length != 0) {
                let res2 = await pool.query(`select id,cardinality(roles) from users;`)
                let results2 = res2.rows
                let stored = {}
                results2.forEach(obj => {
                    stored[obj['id']] = obj['cardinality']
                })
                for (i = 0; i < check_update.length; i++) {
                    if (stored[check_update[i]] < roleList[check_update[i]].length) {
                        await pool.query("update users set roles=$1::text[],last_saved=$2 where id=$3", [roleList[check_update[i]],createdTime,check_update[i]])
                        update_count += 1
                    }
                }
                if (update_count > 0) {
                    flag = "1"
                }
                else {
                    flag = "0"
                }
            }
            else {
                flag = "0";
            }
            if (need_adding.length > 0) {
                flag += "1"
                let custom_query_add = "insert into users values";
                for (i = 0; i < need_adding.length; i++) {
                    if (i != need_adding.length - 1) {
                        custom_query_add = custom_query_add + "('" + need_adding[i] + "','{\"" + roleList[need_adding[i]].join("\",\"") + "\"}',"+createdTime+"),\n"
                    }
                    else {
                        custom_query_add = custom_query_add + "('" + need_adding[i] + "','{\"" + roleList[need_adding[i]].join("\",\"") + "\"}',"+createdTime+");\n"
                    }
                }
                await pool.query(custom_query_add)
            }
            else {
                flag += "0"
            }
            return [flag, update_count, need_adding.length]
        }
        catch {
            return "Failed"
        }
    },
    /**
    * Creates a backup of user roles, returns number of edits made
    * @author   (AmanBP) Aman Bhai Patel
    * @param    {String} userId       String
    * @returns  {Object}              Object{ "roles":Array<String>, "last_saved": String}
    */
     getBackup: async (userID) => {
        try {
            let res;
            res = await pool.query("select count(*) from users where id=$1;",[userID])
            let result = res.rows
            if(result[0]['count'] == '0')
            {
                return undefined
            }
            let res2;
            res2 = await pool.query("select roles,last_saved from users where id=$1",[userID])
            result = res2.rows
            return result[0]
        }
        catch {
            return "Failed"
        }
    }
}