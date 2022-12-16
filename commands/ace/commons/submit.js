const { query } = require("../../../db/index");
const Discord = require("discord.js");

module.exports = {
    submitResult: async (args, result, interaction) => {
        let userID = interaction.member.id
        let name = interaction.member.displayName
        let timestamp = Date.now()
        let staffChannel = process.env.STAFFCHANNELID
        let res;

        // Checks
        console.log(staffChannel);
        if (!args.submit_url.startsWith('https://')) { return interaction.followUp({ content: `❌ Please enter a valid URL, eg: https://...` }) }

        // Submit
        if(interaction.guild.channels.cache.get(staffChannel) === undefined)  { // Check for staff channel
            return interaction.followUp({ content: `Staff Channel not found` })
        }

        try {
            res = await query("SELECT * FROM ace WHERE user_id = $1 AND approval = true", [userID])
            if (res.rowCount != 0 ) {
                if (res.rows[0].shiptype == args.shiptype) {
                    if (parseFloat(res.rows[0].score) > parseFloat(result.score.toFixed(2))) {
                        return interaction.followUp({ content: "Error: Your existing entry has a higher score, submission denied."})
                    }
                    interaction.followUp({ content: "Warning: If approved, this submission will overwrite your current submission!"})
                }
            }
        } catch (err) {
            console.log(err)
            return interaction.followUp({ content: `Something went wrong creating a Submission, please try again or contact staff!` })
        }

        try {
            res = await query("INSERT INTO ace(user_id, name, timetaken, mgauss, sgauss, mgaussfired, sgaussfired, percenthulllost,score, link, approval, date, shiptype) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)", [
                userID,
                name,
                args.time_in_seconds,
                args.gauss_medium_number,
                args.gauss_small_number,
                args.shots_medium_fired,
                args.shots_small_fired,
                args.percenthulllost,
                result.score.toFixed(2),
                args.submit_url,
                false,
                timestamp,
                args.shiptype
            ])
        } catch (err) {
            console.log(err)
            return interaction.followUp({ content: `Something went wrong creating a Submission, please try again or contact staff!` })
        }
        
        res = await query(`SELECT id FROM ace WHERE date = $1`, [timestamp])

        // Print out data
        let submissionId = res.rows[0].id
        const returnEmbed = new Discord.EmbedBuilder()
        .setColor('#FF7100')
        .setTitle(`**Ace Submission Complete**`)
        .setDescription(`Congratulations <@${interaction.member.id}>, your submission is complete. Please be patient while our staff approve your submission. Submission ID: #${submissionId}`)
        .addFields(
        {name: "Pilot", value: `<@${userID}>`, inline: true},
        {name: "Ship", value: `${args.shiptype}`, inline: true},
        {name: "Score", value: `${result.score.toFixed(2)}`, inline: true},
        {name: "link", value: `${args.submit_url}`, inline: true})
        interaction.followUp({ embeds: [returnEmbed.setTimestamp()] });

        // Create staff interaction
        const staffEmbed = new Discord.EmbedBuilder()
        .setColor('#FF7100')
        .setTitle(`**New Ace Submission**`)
        .setDescription(`Please select Approve or Deny below if the video is legitimate and matches the fields below. NOTE: This will not assign any ranks, only approve to the Leaderboard.`)
        .addFields(
        {name: "Pilot", value: `<@${userID}>`, inline: true},
        {name: "Ship", value: `${args.shiptype}`, inline: true},
        {name: "Score", value: `${result.score.toFixed(2)}`, inline: true},
        {name: "link", value: `${args.submit_url}`, inline: true},
        {name: "Time(sec)", value: `${args.time_in_seconds}`, inline: true},
        {name: "Medium Gauss Modules", value: `${args.gauss_medium_number}`, inline: true},
        {name: "Small Gauss Modules", value: `${args.gauss_small_number}`, inline: true},
        {name: "Medium Gauss Fired", value: `${args.shots_medium_fired}`, inline: true},
        {name: "Small Gauss Fired", value: `${args.shots_small_fired}`, inline: true},
        {name: "Hull % Lost", value: `${args.percenthulllost}`, inline: true})
        const row = new Discord.ActionRowBuilder()
        .addComponents(new Discord.ButtonBuilder().setCustomId(`submission-ace-approve-${submissionId}`).setLabel('Approve').setStyle(Discord.ButtonStyle.Success),)
        .addComponents(new Discord.ButtonBuilder().setCustomId(`submission-ace-deny-${submissionId}`).setLabel('Delete').setStyle(Discord.ButtonStyle.Danger),)
        await interaction.guild.channels.cache.get(staffChannel).send({ embeds: [staffEmbed], components: [row] });
    }
}