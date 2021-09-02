const db = require('../db/index');

module.exports = {
    leaderboardInteraction: async (interaction) => {
        let response = interaction.customId.split("-");
		let [ ,leaderboard, eventType, submissionId ] = response
        let res;
        console.log(interaction)
        try {
            res = await db.queryLeaderboard(`SELECT * FROM ${leaderboard} WHERE id = $1`, [submissionId])
            console.log(res)
            if (res.rowCount === 0) {
                interaction.channel.send({ content: `⛔ Error: ${interaction.member} That submission no longer exists, it may have already been denied.` })
                return
            }
        } catch (err) {
            console.log(err)
        }
        if (eventType === "approve") {
            try {
                db.queryLeaderboard(`UPDATE ${leaderboard} SET approval = true WHERE id = $1`, [submissionId])
            } catch (err) {
                console.log(err)
                interaction.channel.send({ content: `Something went wrong approving a Submission, please try again or contact staff!` })
                return
            }
            interaction.message.edit({ content: `✅ **${leaderboard} submission #${submissionId} approved by ${interaction.member}.**` })
        } else if (eventType === "deny") {
            try {
                db.queryLeaderboard(`DELETE FROM ${leaderboard} WHERE id = $1`, [submissionId])
            } catch (err) {
                console.log(err)
                interaction.channel.send({ content: `Something went wrong deleting a submission, please try again or contact staff!` })
                return
            }
            interaction.message.edit({ content: `⛔ **${leaderboard} submission #${submissionId} denied by ${interaction.member}.**` })
        }
    }
}