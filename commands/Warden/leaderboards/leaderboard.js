const Discord = require("discord.js")
const { botLog, botIdent  } = require('../../../functions');
const database = require(`../../../${botIdent().activeBot.botName}/db/database`)

const ships = require('./ships.json')
function capitalizeFirstLetter(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
function timeConvertTT(timetaken) {
	const hours = Math.floor(timetaken / 3600);
	const minutes = Math.floor((timetaken % 3600) / 60);
	const seconds = timetaken % 60;
	const formattedTime = `${String(hours).padStart(2, '0')}h:${String(minutes).padStart(2, '0')}m:${String(seconds).padStart(2, '0')}s`;

	return formattedTime
}
function timeConvertDS(timestamp) {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');

	const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
	return formattedDate
}
module.exports = {
data: new Discord.SlashCommandBuilder()
	.setName('leaderboard')
	.setDescription('Review the Leaderboards')
	.addSubcommand(subcommand =>
		subcommand
			.setName('speedrun')
			.setDescription('Select a leaderboard')
			.addStringOption(option => option.setName('variant')
				.setDescription('Thargoid Variant')
				.setRequired(true)
				.addChoices(
					{ name:'Cyclops', value:'cyclops' },
					{ name:'Basilisk', value:'basilisk' },
					{ name:'Medusa', value:'medusa' },
					{ name:'Hydra', value:'hydra' }
				)
			)
			.addStringOption(option => option.setName('shipclass')
					.setDescription('Ship Class')
					.setRequired(true)
					.addChoices(
						{ name: 'Small', value: 'small' },
						{ name: 'Medium', value: 'medium' },
						{ name: 'Large', value: 'large' }
				)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('ace')
			.setDescription('Select an Ace scoring')
			.addStringOption(option => option.setName('shipclass')
					.setDescription('Ship Class')
					.setRequired(true)
					.addChoices(
						{ name: 'Alliance Challenger', value: 'Challenger' },
						{ name: 'Alliance Chieftain', value: 'Chieftain' },
						{ name: 'Fer-de-Lance', value: 'FDL' },
						{ name: 'Krait Mk II', value: 'Kraitmk2' }
				)
			)
	)
	.addSubcommand(subcommand =>
		subcommand
			.setName('website')
			.setDescription('View website Leaderboard')
	) 
	,
	async execute(interaction) {
		await interaction.deferReply({ ephemeral: false });
		if (interaction.options.getSubcommand() === 'website') { 
			const embed = new Discord.EmbedBuilder()
				.setColor('#FF7100')
				.setTitle(`**Leaderboards**`)
				.setDescription(`Check out our famous group of Commanders that have taken the Thargoid culing to the next level!`)
				.addFields(
					{
						name: `Website Link:`, 
						value: `🏆 https://antixenoinitiative.com/?page_id=338`, inine: false 
					},
				)
				.setTimestamp()
			interaction.editReply({ embeds: [embed] })
		}
		if (interaction.options.getSubcommand() === 'speedrun') {
			let data = interaction.options._hoistedOptions.map(i => i.value)
			const discordConvert = { 
				"thargoid": capitalizeFirstLetter(data[0]),
				"shipClass": capitalizeFirstLetter(data[1]),
			}
			try {
				const values = null
				const sql = `SELECT * FROM Speedruns_${discordConvert.thargoid}_${discordConvert.shipClass}`
				const response = await database.query(sql, values)
				if (response.length > 0) {
					query_result = response
					let embeds = []
					response.forEach((i,index) => {
						const embed = new Discord.EmbedBuilder()
							.setColor('#FF7100')
							.setTitle(`**Speedrun ${discordConvert.shipClass} ${discordConvert.thargoid}**`)
							.setDescription(`#${index + 1} in Division`)
							.addFields(
								// **Pilot:** <@${i.user_id}>\r
								{
									name: `---------------------------------`, 
									value: `
										**Pilot:** ${i.CDMR != undefined ? i.CDMR : i.CMDR }\r
										**Ship:**  ${i.ship}\r
										**Time:** ${i.hours}h ${i.minutes}m ${i.seconds}s\r
										**Date:** ${i.submission_date}\r
										**Link:** ${i.link}
									`, inine: false 
								},
							)
							.setTimestamp()
						embeds.push(embed)
					})
					interaction.editReply({ embeds: embeds })
				}
			}
			catch (err) {
				console.log(err)
				botLog(interaction.guild,new Discord.EmbedBuilder()
					.setDescription('```' + err.stack + '```')
					.setTitle(`⛔ Fatal error experienced`)
					,2
					,'error'
				)
			}
		}
		if (interaction.options.getSubcommand() === 'ace') {
			let data = interaction.options._hoistedOptions.map(i => i.value)
			const discordConvert = {
				"shipClass": data[0],
			}
			try {
				const values = null
				const sql = `SELECT * FROM Ace_Top10_${discordConvert.shipClass}`
				const response = await database.query(sql, values)
				if (response.length > 0) {
					query_result = response
					let embeds = []
					response.forEach((i,index) => {
						
						const embed = new Discord.EmbedBuilder()
							.setColor('#FF7100')
							.setTitle(`**Ace ${discordConvert.shipClass}**`)
							.setDescription(`**#${index + 1}** in Division`)
							.addFields(
								{
									name: `${i.name}`, 
									value: `
										**Score:**  ${i.score}\r
										**Time Taken:** ${timeConvertTT(i.timetaken)}\r
										**# Small Gauss (fired):**  ${i.sgauss} (${i.sgaussfired})\r
										**# Medium Gauss (fired):**  ${i.mgauss} (${i.mgaussfired})\r
										**% Hull Lost:**  ${i.percenthulllost}\r
										**Date Submitted:** ${timeConvertDS(i.date)}\r
										**Link:** ${i.link}
									`, inine: false 
								},
							)
							.setTimestamp()
						embeds.push(embed)
					})
					interaction.editReply({ content: "For those who go beyond. This rank is a true test of a pilot’s abilities, based on a composite score of *ammo usage*, *total damage taken*, and *time taken*. Use a one of the four ships below and any combination of Gauss cannons to defeat a Medusa. Learn more about this rank in the #rank-requirements channel.", embeds: embeds })
				}
			}
			catch (err) {
				console.log(err)
				botLog(interaction.guild,new Discord.EmbedBuilder()
					.setDescription('```' + err.stack + '```')
					.setTitle(`⛔ Fatal error experienced`)
					,2
					,'error'
				)
			}

		}
	}
}