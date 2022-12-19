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
            let fcid = interaction.options.data.find(arg => arg.name === 'fcid').value
            let fcname = interaction.options.data.find(arg => arg.name === 'fcname').value;
            let mission = interaction.options.data.find(arg => arg.name === 'mission').value;

            let res = await db.query(`SELECT * FROM carriers WHERE fcid = $1` [fcid])

            if (res.rowCount == 0) {
                await db.query(`INSERT INTO carriers (fcid, fcname, user_id, mission, approval) WHERE ($1, $2, $3, $4, $5)` [
                    fcid,
                    fcname,
                    interaction.member.id,
                    mission,
                    false
                ])
                interaction.reply({ content })
                let approvalembed = new Discord.EmbedBuilder()
                    .setColor('#FF7100')
                    .setTitle("**FC Command Application**")
                    .setDescription(`${interaction.member} has submitted their FC for Carrier Command Registration, please use /approvefc to register the FC.`)
                    .addFields(
                        { name: 'Fleet Carrier ID', value: `${fcid}` },
                        { name: 'Fleet Carrier Name', value: `${fcname}` },
                        { name: 'Mission', value: `${mission}` },
                    );
                await interaction.guild.channels.cache.get(process.env.STAFFCHANNELID).send({ embeds: [approvalembed] });
            } else (
                interaction.reply(`Sorry, that FC already exists in the database.`)
            )


		} catch (err) {
            console.log(err)
			interaction.channel.send({ content: "Something went wrong, please ensure you have entered the correct format." })
		}        
	},
};
