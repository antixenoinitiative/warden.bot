const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ranks')
		.setDescription('Get rank statistics'),
	permissions: 0,
	async execute(message) {

		// Build the initial message
		const roleCache = message.guild.roles.cache
		const row = new Discord.MessageActionRow()
			.addComponents(new Discord.MessageButton().setCustomId('challenge').setLabel('Challenge Ranks').setStyle('PRIMARY'),)
			.addComponents(new Discord.MessageButton().setCustomId('competitive').setLabel('Competitive Ranks').setStyle('PRIMARY'),)
			.addComponents(new Discord.MessageButton().setCustomId('progression').setLabel('Progression Ranks').setStyle('PRIMARY'),)
			.addComponents(new Discord.MessageButton().setCustomId('other').setLabel('Other Ranks').setStyle('PRIMARY'),)
		message.reply({ content: "Select which ranks to list:", components: [row], ephemeral: true });

		// Recieve the button response
		const filter = i => i.user.id === message.member.id;
		const collector = message.channel.createMessageComponentCollector({ filter, time: 15000 });
		collector.on('collect', async i => {
			if (i.customId === 'challenge') {
				i.deferUpdate();
				try {
					var ch_ranks = [
						"974673947784269824",	//"Decent Pilot"
						"973093582481281044",	//"The Swarm"
						"963786177306054656",	//"Hephaestus Shunned"
						"913848672679247963",	//"Cerberus' Bane"
						"868809340788834324",	//"Astraea's Clarity"
						"508638571565940736",	//"Snake Eater"
						"603345251192537098",	//"Soaring Sleipnir"
						"477645690630307841",	//"100% Club"
						"810410728023916554",	//"Myrmidon"
						"642840616694317104",	//"Vanguard"
					];
					var ch_ranks_amount_name = {};
					ch_ranks.forEach(rank_id => {
						var rank_name = roleCache.get(rank_id).name;
						var rank_holder_count = roleCache.get(rank_id).members.size.toString();
						if (rank_holder_count in ch_ranks_amount_name)
							ch_ranks_amount_name[rank_holder_count].push(rank_name);
						else
							ch_ranks_amount_name[rank_holder_count] = [rank_name];
					});
					const returnEmbed = new Discord.MessageEmbed()
						.setColor('#FF7100')
						.setTitle("**Challenge Ranks**")
						.setDescription(`Challenge Rank Statistics`);
					Object.keys(ch_ranks_amount_name).sort().forEach(key => {
						ch_ranks_amount_name[key].forEach(rank => {
							returnEmbed.addField(rank,key,true);
						});
					});
					i.channel.send({ embeds: [returnEmbed.setTimestamp()] });
				} catch (err) {
					console.error(err);
					i.channel.send({ content: `Something went wrong. Error: ${err}` });
				}
			}
			if (i.customId === 'competitive') {
				i.deferUpdate();
				try {
					const returnEmbed = new Discord.MessageEmbed()
						.setColor('#FF7100')
						.setTitle("**Competitive Ranks**")
						.setDescription(`Competitive Rank Statistics`)
						.addFields(
							{ name: "Caduceus' Glint", value: roleCache.get("810410422871785472").members.size.toString(), inline: true },
							{ name: "Ace", value: roleCache.get("650449319262158868").members.size.toString(), inline: true }
						)
					i.channel.send({ embeds: [returnEmbed.setTimestamp()] });
				} catch (err) {
					console.error(err);
					i.channel.send({ content: `Something went wrong. Error: ${err}` });
				}
			}
			if (i.customId === 'progression') {
				i.deferUpdate();
				try {
					const returnEmbed = new Discord.MessageEmbed()
						.setColor('#FF7100')
						.setTitle("**Progression Ranks**")
						.setDescription(`Progression Rank Statistics`)
						.addFields(
							{ name: "Herculean Conqueror", value: roleCache.get("484438141642604544").members.size.toString(), inline: true },
							{ name: "Herculean Warrior", value: roleCache.get("484438140996681741").members.size.toString(), inline: true },
							{ name: "Serpent's Nemesis", value: roleCache.get("421077339393228802").members.size.toString(), inline: true },
							{ name: "Ossified Dyad", value: roleCache.get("418809237091909642").members.size.toString(), inline: true },
							{ name: "Sole Survivor", value: roleCache.get("417408867257810944").members.size.toString(), inline: true },
							{ name: "Twain Talons", value: roleCache.get("417396449836531712").members.size.toString(), inline: true },
							{ name: "Apollo's Wrath", value: roleCache.get("380254463170183180").members.size.toString(), inline: true },
							{ name: "Cyclopean Duo", value: roleCache.get("642848276135280668").members.size.toString(), inline: true },
							{ name: "Quadrivial Vestige", value: roleCache.get("406986080953434115").members.size.toString(), inline: true },
							{ name: "Recruit", value: roleCache.get("380247760668065802").members.size.toString(), inline: true }
						)
					i.channel.send({ embeds: [returnEmbed.setTimestamp()] });
				} catch (err) {
					console.error(err);
					i.channel.send(`Something went wrong. Error: ${err}`);
				}
			}
			if (i.customId === 'other') {
				i.deferUpdate();
				try {
					const returnEmbed = new Discord.MessageEmbed()
						.setColor('#FF7100')
						.setTitle("**Other Ranks**")
						.setDescription(`Other Rank Statistics`)
						.addFields(
							{ name: "Annihilator", value: roleCache.get("528577192746287104").members.size.toString(), inline: true },
							{ name: "Exterminator", value: roleCache.get("528577143844634644").members.size.toString(), inline: true },
							{ name: "Defender", value: roleCache.get("528576199639957504").members.size.toString(), inline: true },
							{ name: "Mentor", value: roleCache.get("468153018899234816").members.size.toString(), inline: true },
							{ name: "Veteran", value: roleCache.get("811106163608780810").members.size.toString(), inline: true },
							{ name: "Collector", value: roleCache.get("476049331405717504").members.size.toString(), inline: true },
							{ name: "Party Champion", value: roleCache.get("638111509569863690").members.size.toString(), inline: true },
							{ name: "Party Survivor", value: roleCache.get("417401084198387713").members.size.toString(), inline: true },
							{ name: "Old Guard", value: roleCache.get("427304200737783810").members.size.toString(), inline: true },
							{ name: "Lernaean Seeker", value: roleCache.get("484470882325233684").members.size.toString(), inline: true },
							{ name: "Callous Fringe", value: roleCache.get("427826781752524800").members.size.toString(), inline: true },
							{ name: "Xeno Unraveler", value: roleCache.get("537743539862503425").members.size.toString(), inline: true },
							{ name: "Avower", value: roleCache.get("439500275280117760").members.size.toString(), inline: true },
							{ name: "BGS Loyalist", value: roleCache.get("712110659814293586").members.size.toString(), inline: true },
							{ name: "BGS Operator", value: roleCache.get("505888282484408340").members.size.toString(), inline: true },
							{ name: "Conspirator", value: roleCache.get("800227831694229514").members.size.toString(), inline: true },
							{ name: "Ambassador", value: roleCache.get("431671409375182849").members.size.toString(), inline: true },
							{ name: "Jaeger", value: roleCache.get("638143561698639872").members.size.toString(), inline: true },
							{ name: "Carrier Commander", value: roleCache.get("720206853350359121").members.size.toString(), inline: true },

						)
					i.channel.send({ embeds: [returnEmbed.setTimestamp()] });
				} catch (err) {
					console.error(err);
					i.channel.send({ content: `Something went wrong. Error: ${err}` });
				}
			}
		});

		collector.on('end', collected => console.log(`Collected ${collected.size} items`));
	}
}