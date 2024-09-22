const { botLog, botIdent  } = require('../../../functions');
const database = require(`../../../${botIdent().activeBot.botName}/db/database`)
const Discord = require("discord.js");
const ships = require('./ships.json')

module.exports = {
    data: new Discord.SlashCommandBuilder()
	.setName('speedrun')
	.setDescription('Submit your speedrun attempt')
	.addStringOption(option => option.setName('variant')
		.setDescription('Thargoid Variant')
		.setRequired(true)
		.addChoices(
			{ name:'Cyclops', value:'cyclops' },
			{ name:'Basilisk', value:'basilisk' },
			{ name:'Medusa', value:'medusa' },
			{ name:'Hydra', value:'hydra' }
		))
    .addStringOption(option => option.setName('shipclass')
		.setDescription('Thargoid Variant')
		.setRequired(true)
        .addChoices(
			{ name: 'Small', value: 'small' },
			{ name: 'Medium', value: 'medium' },
			{ name: 'Large', value: 'large' }
		))
	.addStringOption(option => option.setName('ship')
			.setDescription('Ship Model eg: Anaconda, Krait Mk.II, etc')
			.setRequired(true)
			.setAutocomplete(true)
	)
    .addIntegerOption(option => option.setName('time')
		.setDescription('Time achieved in milliseconds')
		.setRequired(true))
	.addStringOption(option => option.setName('link')
		.setDescription('Include video link for proof (Please use shortened links)')
		.setRequired(true))
	.addUserOption(option => option.setName('user')
		.setDescription('Select a user to submit on behalf of')
		.setRequired(false))
	.addStringOption(option => option.setName('comments')
		.setDescription('Comment, banter, whatever')
		.setRequired(false)),
	async autocomplete(interaction) {
		const focusedOption = interaction.options.getFocused(true);
        let choices; //array
        if (focusedOption.name === 'ship') {
			const selectionValues = interaction.options._hoistedOptions
			const shipClass = selectionValues.find(i => i.name === 'shipclass').value
			choices = ships[shipClass]
        }
        const filtered = choices.filter(choice => choice.startsWith(focusedOption.value));
        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice })),
        )
    },
	async execute(interaction) {
		await interaction.deferReply({ ephemeral: false });
		let args = {}
		let res;
		let user = interaction.member.id
		let timestamp = Date.now()
		let staffChannel = process.env.STAFFCHANNELID

        for (let key of interaction.options.data) {
            args[key.name] = key.value
        }
		// Checks
		if (!args.link.startsWith('https://')) { return interaction.editReply({ content: `❌ Please enter a valid URL, eg: https://...` }) }
		if (args.user !== undefined) { user = args.user }
		if (args.comments == undefined) { args.comments = '-' }
		let name = await interaction.guild.members.cache.get(user).nickname != null ? await interaction.guild.members.cache.get(user).nickname : await interaction.guild.members.cache.get(user).displayName

		// Submit
		if(interaction.guild.channels.cache.get(staffChannel) === undefined)  { // Check for staff channel
			return interaction.editReply({ content: `Staff Channel not found` })
		}
		try {
			const submission_values = [user,name,args.time,args.shipclass,args.ship,args.variant,args.link,false,timestamp,args.comments]
			const submission_sql = `
				INSERT INTO speedrun (user_id,name,time,class,ship,variant,link,approval,date,comments) VALUES (?,?,?,?,?,?,?,?,?,?);
			`;
			await database.query(submission_sql, submission_values)

		} catch (err) {
			console.log(err)
			botLog(interaction.guild,new Discord.EmbedBuilder()
				.setDescription('```' + err.stack + '```')
				.setTitle(`⛔ Fatal error experienced`)
				,2
				,'error'
			)
			return interaction.editReply({ content: `Something went wrong creating a Submission, please try again or contact staff!` })
		}
		
		let submissionId = null
		const submitted_request_values = timestamp
		const submitted_request_sql = 'SELECT id FROM `speedrun` WHERE date = (?)';
		const submitted_request_response = await database.query(submitted_request_sql, submitted_request_values)
		if (submitted_request_response.length > 0) {
			submissionId = submitted_request_response[0].id
		}
		// Print out data
		const returnEmbed = new Discord.EmbedBuilder()
		.setColor('#FF7100')
		.setTitle(`**Speedrun Submission Complete**`)
		.setDescription(`Congratulations <@${interaction.member.id}>, your submission is complete. Please be patient while our staff approve your submission. Submission ID: #${submissionId}`)
		.addFields(
		{name: "Pilot", value: `<@${user}>`, inline: true},
        {name: "Ship", value: `${args.ship}`, inline: true},
        {name: "Variant", value: `${args.variant}`, inline: true},
        {name: "Time", value: `${new Date(args.time * 1000).toISOString().substr(11, 8)}`, inline: true},
		{name: "Class", value: `${args.shipclass}`, inline: true},
		{name: "link", value: `${args.link}`, inline: true},
		{name: "Comments", value: `${args.comments}`, inline: true})
		interaction.followUp({ embeds: [returnEmbed.setTimestamp()] })

		// Create staff interaction
		const staffEmbed = new Discord.EmbedBuilder()
		.setColor('#FF7100')
		.setTitle(`**New Speedrun Submission**`)
		.setDescription(`Please select Approve or Deny below if the video is legitimate and matches the fields below. NOTE: This will not assign any ranks, only approve to the Leaderboard.`)
		.addFields(
		{name: "Pilot", value: `<@${user}>`, inline: true},
        {name: "Ship", value: `${args.ship}`, inline: true},
        {name: "Variant", value: `${args.variant}`, inline: true},
        {name: "Time", value: `${new Date(args.time * 1000).toISOString().substr(11, 8)}`, inline: true},
		{name: "Class", value: `${args.shipclass}`, inline: true},
		{name: "link", value: `${args.link}`, inline: true},
		{name: "Comments", value: `${args.comments}`, inline: true})
		const row = new Discord.ActionRowBuilder()
			.addComponents(new Discord.ButtonBuilder().setCustomId(`submission-speedrun-approve-${submissionId}`).setLabel('Approve').setStyle(Discord.ButtonStyle.Success),)
			.addComponents(new Discord.ButtonBuilder().setCustomId(`submission-speedrun-deny-${submissionId}`).setLabel('Delete').setStyle(Discord.ButtonStyle.Danger),)
		let buttonResult = null;
		buttonResult = await interaction.guild.channels.cache.get(staffChannel).send({ embeds: [staffEmbed], components: [row] })
		const embedId = buttonResult.id
		try {
			const submissionUpdate_values = [embedId,submissionId]
			const submissionUpdate_sql = `UPDATE speedrun SET embed_id = (?) WHERE id = (?);`
			await database.query(submissionUpdate_sql, submissionUpdate_values)
		} catch (err) {
			console.log(err)
			botLog(interaction.guild,new Discord.EmbedBuilder()
				.setDescription('```' + err.stack + '```')
				.setTitle(`⛔ Fatal error experienced`)
				,2
				,'error'
			)
		}
		//! Example for a collector, however collectors have a timeframe before they expire.
		// const collector = buttonResult.createMessageComponentCollector({ componentType: Discord.ComponentType.Button, time: 1_604_800_000 });
		// collector.on('collect', async i => {
		// 	collector.stop()
		// 	let buttonResponse = i.customId.split("-");
		// 	let [ ,leaderboard, eventType, submissionId ] = buttonResponse
		// 	let res;
		// 	let user;
		// 	let submissionData = null
		// 	try {
		// 		const submission_values = [submissionId]
		// 		const submission_sql = 'SELECT * FROM `speedrun` WHERE id = (?)';
		// 		submissionData = await database.query(submission_sql, submission_values)
		// 		if (submissionData.length === 0) {
		// 			i.channel.send({ content: `⛔ Error: ${i.member} That submission no longer exists, it may have already been denied.` })
		// 			return
		// 		}
		// 		// res = await database.query(`SELECT * FROM ${leaderboard} WHERE id = $1`, [submissionId])
		// 		// if (res.rowCount === 0) {
		// 		// 	interaction.channel.send({ content: `⛔ Error: ${interaction.member} That submission no longer exists, it may have already been denied.` })
		// 		// 	return
		// 		// }
		// 	} catch (err) {
		// 		console.log(err)
		// 		botLog(i.guild,new Discord.EmbedBuilder()
		// 			.setDescription('```' + err.stack + '```')
		// 			.setTitle(`⛔ Fatal error experienced`)
		// 			,2
		// 			,'error'
		// 		)
		// 	}
		// 	if (eventType === 'approve') {
		// 		if (leaderboard === "speedrun") { // Myrmidon Checks
		// 			// const submissionData_values = [submissionId]
		// 			// const submissionData_sql = 'SELECT * FROM `speedrun` WHERE id = (?)';
		// 			// const submissionData = await database.query(submissionData_sql, submissionData_values)
		// 			if (submissionData.length === 0) {
		// 				i.channel.send({ content: `⛔ Error: ${i.member} That submission no longer exists, it may have already been denied.` })
		// 				return
		// 			}
		// 			if (submissionData.length >= 0) {
		// 				let goidtype = submissionData[0].variant;
		// 				let approvedUserId = submissionData[0].user_id;
		// 				let member = i.guild.members.cache.get(approvedUserId);
		// 				if(goidtype == "medusa" || goidtype == "hydra") {
		// 					if(!(member.roles.cache.some(role => role.name === 'Myrmidon'))) {
		// 						let timeTaken = submissionData[0].time;
		// 						let shipclass = submissionData[0].class;
		// 						if(shipclass == 'small') {
		// 							if(timeTaken < 1440) {
		// 								i.channel.send({ content: `Hey, ${i.member}!
		// 									**Speedrun submission #${submissionId}** is eligible for **Myrmidon**
		// 									Please contact <@${approvedUserId}> to see if they want the rank.` 
		// 								})
		// 							}
		// 						}
		// 						if(shipclass == 'medium') {
		// 							if(timeTaken < 720) {
		// 								i.channel.send({ content: `Hey, ${i.member}!
		// 									**Speedrun submission #${submissionId}** is eligible for **Myrmidon**
		// 									Please contact <@${approvedUserId}> to see if they want the rank.` 
		// 								})
		// 							}
		// 						}
		// 						if(shipclass == 'large') {
		// 							if(timeTaken < 360) {
		// 								i.channel.send({ content: `Hey, ${i.member}!
		// 									**Speedrun submission #${submissionId}** is eligible for **Myrmidon**
		// 									Please contact <@${approvedUserId}> to see if they want the rank.` 
		// 								})
		// 							}
		// 						}
		// 					}
		// 				}
		// 			}
		// 		}
		// 		try {
		// 			const submissionUpdate_values = [1,submissionId]
		// 			const submissionUpdate_sql = `UPDATE speedrun SET approval = (?) WHERE id = (?);`
		// 			const submissionUpdate_response = await database.query(submissionUpdate_sql, submissionUpdate_values)
		// 		} catch (err) {
		// 			console.log(err)
		// 			botLog(i.guild,new Discord.EmbedBuilder()
		// 				.setDescription('```' + err.stack + '```')
		// 				.setTitle(`⛔ Fatal error experienced`)
		// 				,2
		// 				,'error'
		// 			)
		// 			i.channel.send({ content: `Something went wrong approving a Submission, please try again or contact staff!` })
		// 			return
		// 		}
		// 		i.message.edit({ content: `✅ **${leaderboard} submission #${submissionId} approved by ${i.member}.**`, components: [] })
		// 		user = await i.guild.members.fetch(submissionData[0].user_id)
		// 		user.send(`Hey! 👋 This is Warden just letting you know that your ${leaderboard} submission has been approved! go check it out in the AXI with the **/leaderboard** command. Submission ID: #${submissionData[0].id}`)
		// 	} 
		// 	else if (eventType === "deny") {
		// 		try {
		// 			const submissionDelete_values = [submissionId]
		// 			const submissionDelete_sql = `DELETE FROM speedrun WHERE id = (?);`
		// 			const submissionDelete_response = await database.query(submissionDelete_sql, submissionDelete_values)
		// 			// database.query(`DELETE FROM ${leaderboard} WHERE id = $1`, [submissionId])
		// 		} catch (err) {
		// 			console.log(err)
		// 			botLog(i.guild,new Discord.EmbedBuilder()
		// 				.setDescription('```' + err.stack + '```')
		// 				.setTitle(`⛔ Fatal error experienced`)
		// 				,2
		// 				,'error'
		// 			)
		// 			i.channel.send({ content: `Something went wrong deleting a submission, please contact a Technomancer.` })
		// 			return
		// 		}
		// 		i.message.edit({ content: `⛔ **${leaderboard} submission #${submissionId} denied by ${i.member}.**`, components: [] })
		// 		user = await i.guild.members.fetch(submissionData[0].user_id)
		// 		user.send(`Hello, This is Warden just letting you know that your ${leaderboard} submission has been declined, sorry! 😞 contact a staff member in the AXI to find out why. Submission ID: #${submissionData[0].id}`)
		// 	}
		// })
    }
}