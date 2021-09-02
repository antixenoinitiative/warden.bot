//const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');
const QuickChart = require('quickchart-js');

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
    .addChoice('Basic', 'basic')
    .addChoice('Standard', 'standard')
    .addChoice('Premium', 'premium'))
.addIntegerOption(option => option.setName('time_in_seconds')
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
        let timePenalty = 0.025
        let roundPenalty = 0.125
        let hullPenalty = 0.2
        let standardPenalty = 12.5
        let premiumPenalty = 25
        let vanguardOver40Penalty = 0.25

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
        if (args.time_in_seconds > myrmThreshold) { timePenaltyTotal = (args.time_in_seconds - myrmThreshold) * timePenalty }
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

        const chart = new QuickChart();
        chart.setWidth(400)
        chart.setHeight(400);
        chart.setBackgroundColor('transparent');
        
        chart.setConfig({
            "type": "radar",
            "data": {
              "labels": [
                "Vanguard Score",
                "Ammo Type",
                "Ammo Used",
                "Time Taken",
                "Damage Taken"
              ],
              "datasets": [
                {
                  "backgroundColor": "rgba(228, 107, 26, 0.2)",
                  "borderColor": "rgb(228, 107, 26)",
                  "data": [
                    100 - vangPenaltyTotal,
                    100 - ammoPenalty,
                    100 - roundPenaltyTotal,
                    100 - timePenaltyTotal,
                    100 - hullPenaltyTotal
                    
                  ],
                  "label": "Your Run"
                }
// At some point want to add an optional parameter to compare to "best run" - here for that purpose
//                ,
//                {
//                    "backgroundColor": "rgba(255, 159, 64, 0.5)",
//                    "borderColor": "rgb(255, 159, 64)",
//                    "data": [
//                      100,
//                      100,
//                      100-1.75,
//                      100,
//                      100-0.5,
//                    ],
//                    "label": "Current Best",
//                    "fill": "-1"
//                }
            ]
          },
            "options": {

                "maintainAspectRatio": true,
                "spanGaps": false,

                "legend": {
                    "display": true,
                    "labels": {
                        "fontColor": "rgb(255, 255, 255)",
                        // Somehow chart doesn't like font size setting for both labels and pointLabels
                        //"fontSize": "18"
                    }
                },
        
                "scale": {
                    
                    "pointLabels": {
                        "fontColor": "rgba(228, 107, 26, 1)",
                        "fontSize": "16"
                    },

                    "angleLines": {
                        "color": "rgba(255 , 255, 255, 0.2)",
                        "borderDash": [10,10]
                    },

                    "ticks": {
                        "max": 100,
                        "min": 0,
                        "stepSize": 20,
                        "backdropColor": "transparent"
                    },
                },

                "elements": {
                    "line": {
                        "tension": 0.000001
                    }
                },

                "plugins": {
                    "filler": {
                        "propagate": false
                    },
                    "samples-filler-analyser": {
                        "target": "chart-analyser"
                    }
                }
            }
          });

        // Print reply
        interaction.reply(`**__Thank you for submitting a New Ace score request!__**
*Note: This score calculator is currently in Alpha and may change without notice*
---
This score has been calculated for ${interaction.member}'s solo fight of a ${args.shiptype} against a ${args.goid} using ${args.shotsfired} rounds
of ${args.ammo} ammo, taking a total of ${args.percenthulllost}% hull damage (including damage repaired with limpets, if any), in ${~~(args.time_in_seconds / 60)} minutes and ${args.time_in_seconds % 60} seconds.
---
**Base Score:** ${targetRun} AXI points
---
**Vanguard Score Penalty:** -${vangPenaltyTotal} AXI points
**Ammo Type Penalty:** -${ammoPenalty} AXI points
**Ammo Used Penalty:** -${roundPenaltyTotal} AXI points
**Time Taken Penalty:** -${timePenaltyTotal} AXI points
**Hull Damage Taken Penalty:** -${hullPenaltyTotal} AXI points
---
**Total Score:** ${finalScore} AXI points
*Interpret as follows:*
*- CMDRs at their first Medusa fight will typically score 0-10 pts (and will occasionally score well into the negative for fights that go sideways);*
*- A collector-level CMDR will typically score about 25-45 pts;*
*- A Herculean Conqueror / early-challenge-rank CMDR will typically score about 45-65 (on a good run);* 
*- An advanced challenge-level CMDR will typically score about 65-85 (on a good run);*
*- The very best score is presently 98.925 AXI points (obtained in a shielded DBX).*`)
        const url = chart.getUrl();
        interaction.channel.send({ content: `${url}` });
    },
};