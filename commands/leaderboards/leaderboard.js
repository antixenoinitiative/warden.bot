/* eslint-disable multiline-ternary */
/* eslint-disable no-ternary */
/* eslint-disable no-nested-ternary */
const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");
const { queryLeaderboard } = require("../../db/index");

function dynamicSort(property) {
    var sortOrder = 1;
    if(property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a,b) {
        var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        return result * sortOrder;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
	.setName('leaderboard')
	.setDescription('list the current leaderboards')
    .addSubcommand(subcommand => subcommand
        .setName('speedruns')
        .setDescription('Speedrun Leaderboards')
        .addStringOption(option => option.setName('variant')
            .setDescription('Thargoid Variant')
            .setRequired(true)
            .addChoice('Cyclops', 'cyclops')
            .addChoice('Basilisk', 'basilisk')
            .addChoice('Medusa', 'medusa')
            .addChoice('Hydra', 'hydra'))
        .addStringOption(option => option.setName('class')
            .setDescription('Ship Class')
            .setRequired(true)
            .addChoice('Small', 'small')
            .addChoice('Medium', 'medium')
            .addChoice('Large', 'large'))),
	permissions: 0,
	async execute(interaction) {
        let args = []
        let res;
        let leaderboardResults = [] // Must become a SORTED array of objects with { text: <information> } as a property
        let leaderboardNameCaps
        let embedDescription = ""
        args["leaderboard"] = interaction.options.data[0].name
        leaderboardNameCaps = args.leaderboard.charAt(0).toUpperCase() + args.leaderboard.slice(1)
        for (let key of interaction.options.data[0].options) {
            args[key.name] = key.value
        }
        switch (args.leaderboard) {
            case ("speedruns"):
                embedDescription = `Speedrun results for Class: **${args.class}** Variant: **${args.variant}**`
                res = await queryLeaderboard(`SELECT * FROM speedrun WHERE approval = true AND class = '${args.class}' AND variant = '${args.variant}'`)
                if (res.rowCount === 0) {
                    interaction.reply(`Sorry, no entries found in the **${args.variant} ${args.class}** ${leaderboardNameCaps} Leaderboard`)
                    return
                }
                for (let entry of res.rows) {
                    entry.timeFormatted = new Date(entry.time * 1000).toISOString().substr(11, 8)
                    let name = await interaction.guild.members.fetch(entry.user_id)
                    leaderboardResults.push({ time: entry.time, text: `${entry.timeFormatted} - ${name} - ${entry.ship} - (${entry.link}) - ID: #${entry.id}`})
                }
                leaderboardResults.sort(dynamicSort("time"))
            break;
        }

        let leaderboardString = "";
        let position = 1
        for (let result of leaderboardResults) {
            leaderboardString += `**#${position}** ${result.text}\n`
            position++
        }

        const returnEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
		.setTitle(`**${leaderboardNameCaps} Leaderboard**`)
        .setDescription(embedDescription)
        .addField(`Leaderboard`, `${leaderboardString}`)
		interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
    }
}