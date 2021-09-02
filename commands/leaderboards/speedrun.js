const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");
const { queryLeaderboard } = require("../../db/index");

module.exports = {
    data: new SlashCommandBuilder()
	.setName('speedrun')
	.setDescription('Submit your speedrun attempt')
	.addStringOption(option => option.setName('variant')
		.setDescription('Thargoid Variant')
		.setRequired(true)
		.addChoice('Cyclops', 'cyclops')
		.addChoice('Basilisk', 'basilisk')
		.addChoice('Medusa', 'medusa')
		.addChoice('Hydra', 'hydra'))
    .addStringOption(option => option.setName('shipclass')
		.setDescription('Thargoid Variant')
		.setRequired(true)
        .addChoice('Small', 'small')
		.addChoice('Medium', 'medium')
        .addChoice('Large', 'large'))
	.addStringOption(option => option.setName('ship')
		.setDescription('Ship Model eg: Anaconda, Krait Mk.II, etc')
		.setRequired(true))
    .addIntegerOption(option => option.setName('time')
		.setDescription('Time achieved in seconds')
		.setRequired(true))
	.addStringOption(option => option.setName('link')
		.setDescription('Include video link for proof')
		.setRequired(true))
	.addUserOption(option => option.setName('user')
		.setDescription('Select a user to submit on behalf of')
		.setRequired(false)),
	permissions: 0,
	async execute(interaction) {
		let args = {}
		let res;
		let user = interaction.member.id
		let timestamp = Date.now()
		let staffChannel = "880618816147693604"

        for (let key of interaction.options.data) {
            args[key.name] = key.value
        }

		// Checks
		if (!args.link.startsWith('https://')) { return interaction.reply({ content: `❌ Please enter a valid URL, eg: https://...` }) }
		if (args.user !== undefined) { user = args.user }
		let name = await interaction.guild.members.fetch(user).nickname

		// Submit
		if(interaction.guild.channels.cache.get(staffChannel) === undefined)  { // Check for staff channel
			return interaction.reply({ content: `Staff Channel not found` })
		}
		try {
			res = await queryLeaderboard("INSERT INTO speedrun(user_id, name, time, class, ship, variant, link, approval, date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
				user,
				name,
				args.time,
				args.shipclass,
				args.ship,
				args.variant,
				args.link,
				false,
				timestamp
			])
			console.log(res)
		} catch (err) {
			console.log(err)
			return interaction.reply({ content: `Something went wrong creating a Submission, please try again or contact staff!` })
		}
		
		res = await queryLeaderboard(`SELECT id FROM speedrun WHERE date = $1`, [timestamp])

		// Print out data
		let submissionId = res.rows[0].id
		const returnEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
		.setTitle(`**Speedrun Submission Complete**`)
		.setDescription(`Congratulations <@${interaction.member.id}>, your submission is complete. Please be patient while our staff approve your submission. Submission ID: ${submissionId}`)
		.addFields(
		{name: "Pilot", value: `<@${user}>`, inline: true},
        {name: "Ship", value: `${args.ship}`, inline: true},
        {name: "Variant", value: `${args.variant}`, inline: true},
        {name: "Time", value: `${new Date(args.time * 1000).toISOString().substr(11, 8)}`, inline: true},
		{name: "Class", value: `${args.shipclass}`, inline: true},
		{name: "link", value: `${args.link}`, inline: true})
		interaction.reply({ embeds: [returnEmbed.setTimestamp()] });

		// Create staff interaction
		const staffEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
		.setTitle(`**New Speedrun Submission**`)
		.setDescription(`Please select Approve or Deny below if the video is legitimate and matches the fields below. NOTE: This will not assign any ranks, only approve to the Leaderboard.`)
		.addFields(
		{name: "Pilot", value: `<@${user}>`, inline: true},
        {name: "Ship", value: `${args.ship}`, inline: true},
        {name: "Variant", value: `${args.variant}`, inline: true},
        {name: "Time", value: `${new Date(args.time * 1000).toISOString().substr(11, 8)}`, inline: true},
		{name: "Class", value: `${args.shipclass}`, inline: true},
		{name: "link", value: `${args.link}`, inline: true})
		const row = new Discord.MessageActionRow()
        .addComponents(new Discord.MessageButton().setCustomId(`submission-speedrun-approve-${submissionId}`).setLabel('Approve').setStyle('SUCCESS'),)
        .addComponents(new Discord.MessageButton().setCustomId(`submission-speedrun-deny-${submissionId}`).setLabel('Deny').setStyle('DANGER'),)
        await interaction.guild.channels.cache.get(staffChannel).send({ embeds: [staffEmbed], components: [row] });
    }
}