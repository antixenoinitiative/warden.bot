/* eslint-disable multiline-ternary */
/* eslint-disable no-ternary */
/* eslint-disable no-nested-ternary */
const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");
const { queryWarden } = require("../../db/index");

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
            .addChoice('Large', 'large'))
        .addStringOption(option => option.setName('options')
            .setDescription('Ship Class')
            .setRequired(false)
            .addChoice('Show Video Links', 'links')))
    .addSubcommand(subcommand => subcommand
        .setName('ace')
        .setDescription('Ace Leaderboard')
        .addStringOption(option => option.setName('shiptype')
            .setDescription('Ship Type')
            .setRequired(true)
            .addChoice('Chieftain', 'chieftain')
            .addChoice('Challenger', 'challenger')
            .addChoice('Krait MkII', 'kraitmk2'))
        .addBooleanOption(option => option.setName('links')
            .setDescription('show links')
            .setRequired(false))),
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

        if (args.links === undefined) { args.links = false }

        switch (args.leaderboard) {
            case ("speedruns"):
                embedDescription = `Speedrun results for Class: **${args.class}** Variant: **${args.variant}**`
                res = await queryWarden(`SELECT * FROM speedrun WHERE approval = true AND class = '${args.class}' AND variant = '${args.variant}'`)
                if (res.rowCount === 0) {
                    interaction.reply(`Sorry, no entries found in the **${args.variant} ${args.class}** ${leaderboardNameCaps} Leaderboard`)
                    return
                }
                for (let entry of res.rows) {
                    entry.timeFormatted = new Date(entry.time * 1000).toISOString().substr(11, 8)
                    let user = await interaction.guild.members.fetch(entry.user_id)
                    let string = `${entry.timeFormatted} - ${user.displayName} - ${entry.ship}`
                    if (args.options !== undefined) {
                        if (args.options === "links") {
                            string += `\nVideo: [${entry.link}]`
                        }
                    }
                    leaderboardResults.push({ time: entry.time, text: string})
                }
                leaderboardResults.sort(dynamicSort("time"))
            break;
            case ("ace"):
                embedDescription = `**Ace Leaderboard Results** (Top 10 recieve the <@&650449319262158868> Role) for ${args.shiptype}`
                res = await queryWarden(`SELECT * FROM ace WHERE approval = true AND shiptype = '${args.shiptype}'`)
                if (res.rowCount === 0) {
                    interaction.reply(`Sorry, no entries found in the ${leaderboardNameCaps} Leaderboard`)
                    return
                }
                for (let entry of res.rows) {
                    let user = await interaction.guild.members.fetch(entry.user_id)
                    let string = `${entry.score} - ${user.displayName}`
                    if (args.links === true) {
                        string += `\nVideo: [${entry.link}]`
                    }
                    leaderboardResults.push({ score: entry.score, text: string})
                }
                leaderboardResults.sort(dynamicSort("score"))
                leaderboardResults = leaderboardResults.reverse();
            break;
        }

        let leaderboardString = "";
        let position = 1
        for (let result of leaderboardResults) {
            if (args.leaderboard === "ace") {
                if (position <= 10) {result.text += ` <:Ace:893332550536286228>`}
            }
            leaderboardString += `**#${position}** ${result.text}\n`
            position++
        }

        const returnEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
		.setTitle(`**${leaderboardNameCaps} Leaderboard**`)
        .setDescription(`${embedDescription}\n\n${leaderboardString}`)
        //.addField(`Leaderboard`, `${leaderboardString}`)
		interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
    }
}