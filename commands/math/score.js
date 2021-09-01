//const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');

let options = new SlashCommandBuilder()
.setName('score')
.setDescription('Score your fight based on the Mechan System')
.addIntegerOption(option => option.setName('vanguardscore')
    .setDescription('Vanguard Score for the fight')
    .setRequired(true))
.addStringOption(option => option.setName('ammo')
    .setDescription('Ammo type used')
    .setRequired(true)
    .addChoice('Premium', 'premium')
    .addChoice('Standard', 'standard')
    .addChoice('Basic', 'basic'))
.addStringOption(option => option.setName('shipclass')
    .setDescription('Class of ship')
    .setRequired(true)
    .addChoice('Small', 'small')
    .addChoice('Medium', 'medium')
    .addChoice('Large', 'large'))
.addIntegerOption(option => option.setName('time')
    .setDescription('Time taken in Seconds')
    .setRequired(true))
.addIntegerOption(option => option.setName('shotsfired')
    .setDescription('Total shots fired')
    .setRequired(true))
.addIntegerOption(option => option.setName('percenthulllost')
    .setDescription('Percentage of Hull Lost in fight')
    .setRequired(true))

module.exports = {
    data: options,
	permissions: 0,
    execute(interaction) {

        // Scoring Factors
        let targetRun = 100
        let timePenalty = 0.1
        let roundPenalty = 0.5
        //let hullPenalty = 1
        let standardPenalty = 25
        let premiumPenalty = 50
        let vanguardOver40Penalty = 1

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
        switch (args.shipclass) {
            case "small":
                myrmThreshold = 1440;
                break;
            case "medium":
                myrmThreshold = 720;
                break;
            case "large":
                myrmThreshold = 360;
                break;
        }

        // Calculations
        let roundPenaltyTotal = 0;
        if (args.shotsfired > 175) { roundPenaltyTotal = (args.shotsfired - 175) * roundPenalty }
        console.log("Round Penalty:" + roundPenaltyTotal)

        let timePenaltyTotal = 0;
        if (args.time > myrmThreshold) { timePenaltyTotal = (args.time - myrmThreshold) * timePenalty }
        console.log("Time Penalty:" + timePenaltyTotal)

        let vangPenaltyTotal = 0;
        if (args.vanguardscore > 40) { vangPenaltyTotal = (args.vanguardscore - 40) * vanguardOver40Penalty }
        console.log("Vanguard Penalty:" + vangPenaltyTotal)

        let hullPenaltyTotal = args.percenthulllost
        console.log("Hull Penalty:" + hullPenaltyTotal)

        let penaltyTotal = ammoPenalty + timePenaltyTotal + roundPenaltyTotal + vangPenaltyTotal + hullPenaltyTotal
        console.log("Penalty Total:" + penaltyTotal)

        let finalScore = targetRun - penaltyTotal

        interaction.reply(`Score: ${finalScore}`)
    },
};