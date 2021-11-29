/* eslint-disable complexity */
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
            .addChoice('Krait MkII', 'kraitmk2')
            .addChoice('Fer-de-Lance', 'fdl'))
        .addBooleanOption(option => option.setName('links')
            .setDescription('show links')
            .setRequired(false))
        .addBooleanOption(option => option.setName('stats')
            .setDescription('show statistics A(mmo), T(ime), H(ull)')
            .setRequired(false))),
	permissions: 0,
	async execute(interaction) {
        let args = []
        let res;
        let leaderboardResults = [] // Must become a SORTED array of objects with { text: <information> } as a property
        let leaderboardNameCaps
        let embedDescription = ""
        let shipName;
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
                switch (args.shiptype) {
                    case "fdl":
                        shipName = "Fer-De-Lance"
                        break;
                    case "chieftain":
                        shipName = "Alliance Chieftain"
                        break;
                    case "challenger":
                        shipName = "Alliance Challenger"
                        break;
                    case "kraitmk2":
                        shipName = "Krait Mk.II"
                        break;
                }
                embedDescription = `Ace Leaderboard Results for **${shipName}** (Top #10 CMDRs receives the <@&650449319262158868> Role)`
                res = await queryWarden(`SELECT * FROM ace WHERE approval = true AND shiptype = '${args.shiptype}'`)
                if (res.rowCount === 0) {
                    interaction.reply(`Sorry, no entries found in the ${leaderboardNameCaps} Leaderboard`)
                    return
                }
                console.log('Got leaderboard ace results from DB, generating report');
                for (let entry of res.rows) {
                    //let user = await interaction.guild.members.fetch(entry.user_id);
                    //let userName = user.displayName;
                    
                    /* version1 */
                    let userName = '';
                    await interaction.guild.members
                        .fetch(entry.user_id)
                        .then(user => { 
                            console.log(`INFO: resolved user_id ${entry.user_id} to ${user.displayName}`);
                            userName = user.displayName; 
                        })
                        .catch(error => {
                            console.error('ERROR: ' + error  + ` ${entry.user_id}`);
                            userName = entry.user_id;
                        });
                    
                    //let leaderboardEntry = `${entry.score} ${aceRunStats} - ${userName}`
                    let leaderboardEntry = `${entry.score} - ${userName}`
                    if (args.stats === true) {
                        var timetaken = entry.timetaken;
                        var date = new Date(0);
                        date.setSeconds(timetaken);
                        var time = date.toISOString().substr(11, 8);

                        let ammo = entry.mgaussfired + 'm ' + entry.sgaussfired + 's ';
                        let hull = entry.percenthulllost;
                        let aceRunStats = `T: ${time}, A: ${ammo}, H: ${hull}%`;
                        leaderboardEntry += `\n  Stats: ${aceRunStats}`
                    }
                    if (args.links === true) {
                        leaderboardEntry += `\n  Video: [${entry.link}]`
                    }
                    leaderboardResults.push({ score: entry.score, text: leaderboardEntry})
                }
                leaderboardResults.sort(dynamicSort("score"))
                leaderboardResults = leaderboardResults.reverse();
            break;
        }

        let leaderboardString = "";
        let position = 1
        for (let result of leaderboardResults) {
            if (args.leaderboard === "ace" && args.shiptype === "chieftain") {
                if (position <= 10) {result.text += ` <:Ace:893332550536286228>`}
            }
            //if (args.leaderboard === "ace" && args.shiptype !== "chieftain") {
            //    if (position <= 1) {result.text += ` <:Ace:893332550536286228>`}
            //}
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
