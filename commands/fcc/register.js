const db = require("../../db/index");
const Discord = require("discord.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('registerfc')
	.setDescription('Register your Fleet Carrier in the AXI Fleet Carrier Command')
    .addStringOption(option => option.setName('fcid')
		.setDescription('Fleet Carrier ID, example: N3Q-17Z')
		.setRequired(true))
    .addStringOption(option => option.setName('fcname')
		.setDescription('Fleet Carrier Name')
		.setRequired(true))
    .addStringOption(option => option.setName('mission')
		.setDescription('Current FC mission')
		.setRequired(true)),
	permissions: 2,
	async execute(interaction) {
		try {
            console.log(interaction)
            // Arg Handling
            let args = {}
            for (let key of interaction.options.data) {
                args[key.name] = key.value
            }

            let fcid = args.fcid
            let fcname = args.fcname
            let mission = args.mission

            let res = await db.query(`SELECT * FROM carriers WHERE fcid = $1`, [fcid])
            console.log(res)
            if (res.rowCount == 0) {
                await db.query(`INSERT INTO carriers(fcid, fcname, user_id, mission, approval) VALUES ($1, $2, $3, $4, $5)`, [
                    fcid,
                    fcname,
                    interaction.member.id,
                    mission,
                    false
                ])
                let confirmEmbed = new Discord.EmbedBuilder()
                    .setColor('#FF7100')
                    .setTitle("**FC Command Application**")
                    .setDescription(`Thank you, ${interaction.member}, your application has been recieved and is pending approval.`)
                    .addFields(
                        { name: 'Fleet Carrier ID', value: `${fcid}` },
                        { name: 'Fleet Carrier Name', value: `${fcname}` },
                        { name: 'Current Mission', value: `${mission}` },
                    );
                interaction.reply({ embeds: [confirmEmbed.setTimestamp()] })
                let approvalembed = new Discord.EmbedBuilder()
                    .setColor('#FF7100')
                    .setTitle("**FC Command Application**")
                    .setDescription(`${interaction.member} has submitted their FC for Carrier Command Registration, please approve below.`)
                    .addFields(
                        { name: 'Fleet Carrier ID', value: `${fcid}` },
                        { name: 'Fleet Carrier Name', value: `${fcname}` },
                        { name: 'Mission', value: `${mission}` },
                );
                
                const buttons = new Discord.ActionRowBuilder()
                .addComponents(new Discord.ButtonBuilder().setCustomId(`fcc_approve_${fcid}`).setLabel('Approve').setStyle(Discord.ButtonStyle.Success),)
                .addComponents(new Discord.ButtonBuilder().setCustomId(`fcc_deny_${fcid}`).setLabel('Delete').setStyle(Discord.ButtonStyle.Danger),)
                await interaction.guild.channels.cache.get(process.env.STAFFCHANNELID).send({ embeds: [approvalembed.setTimestamp()], components: [buttons]});
            } else (
                interaction.reply(`Sorry, that FC already exists in the database.`)
            )


		} catch (err) {
            console.log(err)
			interaction.channel.send({ content: "Something went wrong, please ensure you have entered the correct format." })
		}        
	},
};
