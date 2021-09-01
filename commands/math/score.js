//const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');
var Chart = require('chart.js');

let options = new SlashCommandBuilder()
.setName('score')
.setDescription('Score your fight based on the revised Ace Scoring System')
.addStringOption(option => option.setName('shiptype')
    .setDescription('Ship you used')
    .setRequired(true)
    .addChoice('Alliance Challenger', 'challenger')
    .addChoice('Alliance Chieftain', 'chieftain')
    .addChoice('Alliance Crusader', 'crusader')
    .addChoice('Anaconda', 'anaconda')
    .addChoice('Asp Explorer', 'aspx')
    .addChoice('Beluga Liner', 'beluga')
    .addChoice('Diamondback Explorer', 'dbx')
    .addChoice('Diamondback Scout', 'dbs')
    .addChoice('Federal Assault Ship', 'fas')
    .addChoice('Federal Corvette', 'corvette')
    .addChoice('Federal Dropship', 'fds')
    .addChoice('Federal Gunship', 'fgs')
    .addChoice('Fer-de-Lance', 'fdl')
    .addChoice('Hauler', 'hauler')
    .addChoice('Imperial Clipper', 'clipper')
    .addChoice('Imperial Courier', 'icourier')
    .addChoice('Imperial Cutter', 'cutter')
    .addChoice('Krait Mk. II', 'km2')
    .addChoice('Krait Phantom', 'kph')
    .addChoice('Mamba', 'mamba')
    .addChoice('Python', 'python')
    .addChoice('Type-10 Defender', 't10')
    .addChoice('Viper MK III', 'vmk3')
    .addChoice('Viper MK IV', 'vmk4')
    .addChoice('Vulture', 'vulture'))
.addStringOption(option => option.setName('goid')
    .setDescription('Type of goid fought - fixed to Medusa for now; may expand in the future')
    .setRequired(true)
    .addChoice('Medusa', 'medusa'))
.addStringOption(option => option.setName('ammo')
    .setDescription('Ammo type used')
    .setRequired(true)
    .addChoice('Premium', 'premium')
    .addChoice('Standard', 'standard')
    .addChoice('Basic', 'basic'))
.addIntegerOption(option => option.setName('time')
    .setDescription('Time taken in Seconds')
    .setRequired(true))
.addIntegerOption(option => option.setName('shotsfired')
    .setDescription('Total number of ammo rounds fired')
    .setRequired(true))
.addIntegerOption(option => option.setName('percenthulllost')
    .setDescription('Total percentage of hull lost in fight (incl. repaired with limpets)')
    .setRequired(true))

module.exports = {
    data: options,
	permissions: 0,
    execute(interaction) {

        // Scoring Factors
        let targetRun = 100
        let timePenalty = 0.05
        let roundPenalty = 0.25
        let hullPenalty = 0.5
        let standardPenalty = 12.5
        let premiumPenalty = 25
        let vanguardOver40Penalty = 0.5

        // Managing Inputs
        let args = {}
        for (let key of interaction.options.data) {
            args[key.name] = key.value
        }
        
        // Decide ammo type and penalty
        let ammoPenalty;
        switch (args.ammo) {
            case "premium":
                ammoPenalty = premiumPenalty;
                break;
            case "standard":
                ammoPenalty = standardPenalty;
                break;
            case "basic":
                ammoPenalty = 0
                break;
        }

        let myrmThreshold;
        let vanguardScore;
        switch (args.shiptype) {
            case "challenger":
                vanguardScore = 80;
                myrmThreshold = 720;
                break;
            case "chieftain":
                vanguardScore = 80;
                myrmThreshold = 720;
                break;
            case "crusader":
                vanguardScore = 75;
                myrmThreshold = 720;
                break;  
            case "anaconda":
                vanguardScore = 55;
                myrmThreshold = 360;
                break;
            case "aspx":
                vanguardScore = 40;
                myrmThreshold = 720;
                break;
            case "beluga":
                vanguardScore = 50;
                myrmThreshold = 360;
                break;
            case "dbx":
                vanguardScore = 40;
                myrmThreshold = 1440;
                break;
            case "dbs":
                vanguardScore = 40;
                myrmThreshold = 1440;
                break;
            case "fas":
                vanguardScore = 70;
                myrmThreshold = 720;
                break;
            case "corvette":
                vanguardScore = 60;
                myrmThreshold = 360;
                break;
            case "fds":
                vanguardScore = 50;
                myrmThreshold = 720;
                break;
            case "fgs":
                vanguardScore = 45;
                myrmThreshold = 720;
                break;
            case "fdl":
                vanguardScore = 75;
                myrmThreshold = 720;
                break;
            case "hauler":
                vanguardScore = 10;
                myrmThreshold = 1440;
                break;
            case "clipper":
                vanguardScore = 40;
                myrmThreshold = 360;
                break;
            case "icourier":
                vanguardScore = 40;
                myrmThreshold = 1440;
                break;
            case "cutter":
                vanguardScore = 90;
                myrmThreshold = 360;
                break;
            case "km2":
                vanguardScore = 75;
                myrmThreshold = 720;
                break;
            case "kph":
                vanguardScore = 75;
                myrmThreshold = 720;
                break;
            case "mamba":
                vanguardScore = 65;
                myrmThreshold = 720;
                break;
            case "python":
                vanguardScore = 50;
                myrmThreshold = 720;
                break;
            case "t10":
                vanguardScore = 45;
                myrmThreshold = 360;
                break;
            case "vmk3":
                vanguardScore = 35;
                myrmThreshold = 1440;
                break;
            case "vmk4":
                vanguardScore = 40;
                myrmThreshold = 1440;
                break;
            case "vulture":
                vanguardScore = 50;
                myrmThreshold = 1440;
                break;
        }

        // Calculations
        let roundPenaltyTotal = 0;
        if (args.shotsfired > 175) { roundPenaltyTotal = (args.shotsfired - 175) * roundPenalty }
        console.log("Ammo Used Penalty:" + roundPenaltyTotal)

        let timePenaltyTotal = 0;
        if (args.time > myrmThreshold) { timePenaltyTotal = (args.time - myrmThreshold) * timePenalty }
        console.log("Time Taken Penalty:" + timePenaltyTotal)

        let vangPenaltyTotal = 0;
        if (vanguardScore > 40) { vangPenaltyTotal = (vanguardScore - 40) * vanguardOver40Penalty }
        console.log("Vanguard Score Penalty:" + vangPenaltyTotal)

        let hullPenaltyTotal = args.percenthulllost * hullPenalty
        console.log("Hull Penalty:" + hullPenaltyTotal)

        let penaltyTotal = ammoPenalty + timePenaltyTotal + roundPenaltyTotal + vangPenaltyTotal + hullPenaltyTotal
        console.log("Penalty Total:" + penaltyTotal)

        let finalScore = targetRun - penaltyTotal
        
        // Chart creation

        var ctx = 'myChart';
        var myChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Vanguard', 'AmmoType', 'AmmoUsage', 'TimeTaken', 'DamageTaken'],
            datasets: [{
                label: 'Score',
                data: [100 + vangPenaltyTotal, 100 + ammoPenalty , 100 + ammoPenalty, 100 + roundPenaltyTotal, 100 + hullPenaltyTotal],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.2)',
                    'rgba(54, 162, 235, 0.2)',
                    'rgba(255, 206, 86, 0.2)',
                    'rgba(75, 192, 192, 0.2)',
                    'rgba(153, 102, 255, 0.2)'
                ],
                borderColor: [
                    'rgba(255, 99, 132, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 206, 86, 1)',
                    'rgba(75, 192, 192, 1)',
                    'rgba(153, 102, 255, 1)'
                ],
                borderWidth: 3
            }]
            },
            }
            );
        const encodedChart = encodeURIComponent(JSON.stringify(myChart));
        const chartUrl = `https://quickchart.io/chart?c=${encodedChart}`;

        // Print reply
        interaction.reply(`**__Thank you for submitting a New Ace score request!__**
*Note: This score calculator is currently in Alpha and may change without notice*
---
This score has been calculated for ${interaction.member}'s solo fight of a ${args.shiptype} against a ${args.goid} using ${args.shotsfired} rounds
of ${args.ammo} ammo, taking a total of ${args.percenthulllost}% hull damage, in ${args.time / 60} minutes and ${args.time % 60} seconds.
---
**Base Score:** ${targetRun}
---
**Vanguard Score Penalty:** -${vangPenaltyTotal}
**Ammo Type Penalty:** -${ammoPenalty}
**Ammo Used Penalty:** -${roundPenaltyTotal}
**Time Taken Penalty:** -${timePenaltyTotal}
**Hull Damage Taken Penalty:** -${hullPenaltyTotal}
---
**Total Score:** ${finalScore}`)
        interaction.channel.send({ content: "<img src="${chartUrl}">Graph</img>" });
    },
};