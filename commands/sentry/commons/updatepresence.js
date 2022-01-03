const [ query ] = require("../../../db/index");

module.exports = {
    updatePresence: async (systemName, presenceLevel) => {
        let res = await query(`SELECT * FROM systems WHERE name = $1`,[systemName])
        let data = res.rows[0]

        // Check if exists
        if (res.rowCount === 0) {
            return "notfound"
        }

        // Check if submitted status is different
        if (data.presence == presenceLevel) {
            return "nochange"
        }
        
        // Update the presence value in DB
        await query('UPDATE systems SET presence = $1 WHERE system_id = $2',[presenceLevel, data.system_id])
        return "success"
    }
}