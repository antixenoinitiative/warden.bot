const db = require('../db/index');

module.exports = {
    leaderboardInteraction: async (interaction) => {
        let response = interaction.customId.split("-");
		let [ ,leaderboard, eventType, submissionId ] = response
        let res;
        let user;
        try {
            res = await db.query(`SELECT * FROM ${leaderboard} WHERE id = $1`, [submissionId])
            if (res.rowCount === 0) {
                interaction.channel.send({ content: `⛔ Error: ${interaction.member} That submission no longer exists, it may have already been denied.` })
                return
            }
        } catch (err) {
            console.log(err)
        }
        if (eventType === "approve") {
            if (leaderboard === "ace") { // Overwrite existing ace score
                let res = await db.query("SELECT * FROM ace WHERE id = $1", [submissionId])
                if (res.rowCount != 0) {
                    let userID = res.rows[0].user_id;
                    let ship = res.rows[0].shiptype;
                    await db.query(`DELETE FROM ace WHERE user_id = $1 AND approval = true AND id != $2 AND shiptype = $3`, [userID, submissionId, ship])
                }
            }
            if (leaderboard === "speedrun") { // Myrmidon Checks
                let res = await db.query("SELECT * FROM speedrun WHERE id = $1", [submissionId])
                if (res.rowCount != 0) {
                    let goidtype = res.rows[0].variant;
                    let approvedUserId = res.rows[0].user_id;
                    let member = interaction.guild.members.cache.get(approvedUserId);
                    if(goidtype == "medusa" || goidtype == "hydra")
                    {
                        if(!(member.roles.cache.some(role => role.name === 'Myrmidon')))
                        {
                            let timeTaken = res.rows[0].time;
                            let shipclass = res.rows[0].class;
                            if(shipclass == 'small')
                            {
                                if(timeTaken < 1440)
                                {
                                    interaction.channel.send({ content: `Hey, ${interaction.member}!
**Speedrun submission #${submissionId}** is eligible for **Myrmidon**
Please contact <@${approvedUserId}> to see if they want the rank.` })
                                }
                            }
                            if(shipclass == 'medium')
                            {
                                if(timeTaken < 720)
                                {
                                    interaction.channel.send({ content: `Hey, ${interaction.member}!
**Speedrun submission #${submissionId}** is eligible for **Myrmidon**
Please contact <@${approvedUserId}> to see if they want the rank.` })
                                }
                            }
                            if(shipclass == 'large')
                            {
                                if(timeTaken < 360)
                                {
                                    interaction.channel.send({ content: `Hey, ${interaction.member}!
**Speedrun submission #${submissionId}** is eligible for **Myrmidon**
Please contact <@${approvedUserId}> to see if they want the rank.` })
                                }
                            }
                        }
                    }
                }
            }
            try {
                db.query(`UPDATE ${leaderboard} SET approval = true WHERE id = $1`, [submissionId])
            } catch (err) {
                console.log(err)
                interaction.channel.send({ content: `Something went wrong approving a Submission, please try again or contact staff!` })
                return
            }
            interaction.message.edit({ content: `✅ **${leaderboard} submission #${submissionId} approved by ${interaction.member}.**` })
            user = await interaction.guild.members.fetch(res.rows[0].user_id)
            user.send(`Hey! 👋 This is Warden just letting you know that your ${leaderboard} submission has been approved! go check it out in the AXI with the **/leaderboard** command. Submission ID: #${res.rows[0].id}`)
        } else if (eventType === "deny") {
            try {
                db.query(`DELETE FROM ${leaderboard} WHERE id = $1`, [submissionId])
            } catch (err) {
                console.log(err)
                interaction.channel.send({ content: `Something went wrong deleting a submission, please try again or contact staff!` })
                return
            }
            interaction.message.edit({ content: `⛔ **${leaderboard} submission #${submissionId} denied by ${interaction.member}.**` })
            user = await interaction.guild.members.fetch(res.rows[0].user_id)
            user.send(`Hello, This is Warden just letting you know that your ${leaderboard} submission has been declined, sorry! 😞 contact a staff member in the AXI to find out why. Submission ID: #${res.rows[0].id}`)
        }
    }
}