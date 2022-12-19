const db = require('../db/index');

module.exports = {
    fccinteraction: async (interaction) => {
        let response = interaction.customId.split("-");
		let [ , eventType, fcid ] = response
        try {
            res = await db.query(`SELECT * FROM carriers WHERE fcid = $1`, [fcid])
            if (res.rowCount === 0) {
                interaction.channel.send({ content: `⛔ Error: ${interaction.member} That submission no longer exists, it may have already been denied.` })
                return
            }
        } catch (err) {
            console.log(err)
        }
        if (eventType === "approve") {
            try {
                db.query(`UPDATE carriers SET approval = true WHERE fcid = $1`, [fcid])
            } catch (err) {
                console.log(err)
                interaction.channel.send({ content: `Something went wrong approving a Submission, please try again.` })
                return
            }
            interaction.message.edit({ content: `✅ **FCC submission #${fcid} approved by ${interaction.member}.**` })
            user = await interaction.guild.members.fetch(res.rows[0].user_id)
            user.send(`Hey! 👋 This is Warden just letting you know that your FCC submission has been approved! Submission ID: #${res.rows[0].fcid}`)
        } else if (eventType === "deny") {
            try {
                db.query(`DELETE FROM carriers WHERE fcid = $1`, [fcid])
            } catch (err) {
                console.log(err)
                interaction.channel.send({ content: `Something went wrong deleting a submission, please try again or contact staff!` })
                return
            }
            interaction.message.edit({ content: `⛔ **FCC submission #${fcid} denied by ${interaction.member}.**` })
            user = await interaction.guild.members.fetch(res.rows[0].user_id)
            user.send(`Hello, This is Warden just letting you know that your FCC submission has been declined, sorry! 😞 contact a staff member in the AXI to find out why. Submission ID: #${res.rows[0].fcid}`)
        }
    }
}