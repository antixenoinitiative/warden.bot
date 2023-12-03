/* eslint-disable no-prototype-builtins */
const { botIdent } = require('../../functions');
require("dotenv").config({ path: `${botIdent().activeBot.env}` });
const { Pool } = require('pg');


//credentials from Heroku
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
})

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