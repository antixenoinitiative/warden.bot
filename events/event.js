const db = require('../db/index');
const Discord = require("discord.js");

async function updateEmbed(interaction, id) {
    let res = await db.query("SELECT * FROM events WHERE event_id = $1", [id])
    let event = res.rows[0];
    let enrolledNames = "";
    if (event === undefined) {
        interaction.message.edit({ content: "🛑 Sorry, this event is now over!" })
        return;
    }
    for (let id of event.enrolled) {
        enrolledNames += (`${interaction.member.guild.members.cache.find(users => users.id === id)}\n`)
    }

    let embed = new Discord.MessageEmbed()
    .setColor('#FF7100')
	.setAuthor(`The Anti-Xeno Initiative`, "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
	.setTitle(`${event.name}`)
	.setDescription(`${event.description}\n\n **Date: ${event.date}**`)
    if (enrolledNames != "") {
        embed.addField("Enrolled", `${enrolledNames}`);
    }
    interaction.message.edit({ embeds: [embed] });
}

module.exports = {
    joinEvent: async (interaction, id) => {
        let res = await db.query("SELECT enrolled FROM events WHERE event_id = $1", [id]);
        let enrolledList = res.rows[0].enrolled;
        if (enrolledList === null) { enrolledList = [] }
        if (enrolledList.includes(interaction.user.id)) { return "User already enrolled" }
        enrolledList.push(`${interaction.user.id}`);
        try {
            await db.query("UPDATE events SET enrolled = $1 WHERE event_id = $2", [enrolledList, id]);
        } catch (err) {
            console.log(err);
        }
        updateEmbed(interaction, id);
    },
    leaveEvent: async (interaction, id) => {
        let res = await db.query("SELECT enrolled FROM events WHERE event_id = $1", [id]);
        if (res.rows[0] === undefined) { 
            return updateEmbed(interaction, id);
        }
        let enrolledList = res.rows[0].enrolled;
        if (enrolledList === null) { enrolledList = [] }
        if (enrolledList.includes(interaction.user.id)) {
            let index = enrolledList.indexOf(`${interaction.user.id}`)
            enrolledList.splice(index, 1);
        }
        try {
            await db.query("UPDATE events SET enrolled = $1 WHERE event_id = $2", [enrolledList, id]);
        } catch (err) {
            console.log(err);
        }
        updateEmbed(interaction, id);
    }
}