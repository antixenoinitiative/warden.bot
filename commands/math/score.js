//const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');

let options = new SlashCommandBuilder()
.setName('mechscore')
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
        let hullPenalty = 1
        let standardPenaltyPercent = 0.75
        let premiumPenaltyPercent = 0.5
        let vanguardOver40Penalty = 1

        // Managing Inputs
        let args = {}
        for (let key of interaction.options.data) {
            args[key.name] = key.value
        }
        
        // Decide ammo type and penalty
        let ammoMultiplier;
        switch (args.ammo) {
            case "premium":
                ammoMultiplier = premiumPenaltyPercent;
                break;
            case "standard":
                ammoMultiplier = standardPenaltyPercent;
                break;
            case "basic":
                ammoMultiplier = 1
                break;
        }

        // Calculations
        let roundPenaltyTotal = 0;
        if (args.shotsfired > 175) { roundPenaltyTotal = (args.time - 175) * roundPenalty }

        let timePenaltyTotal = 0;
        if (args.time > 1400) { timePenaltyTotal = (args.time - 1400) * timePenalty }

        let vangPenaltyTotal = 0;
        if (args.vanguardscore > 40) { vangPenaltyTotal = (40 - args.vanguardscore) * vanguardOver40Penalty }

        let hullLostScore = ((100 - args.percenthulllost) / 100) * 100 * hullPenalty

        let ammoScore = targetRun * ammoMultiplier

        let finalScore = ammoScore + timePenaltyTotal + roundPenaltyTotal + hullLostScore + vangPenaltyTotal

        interaction.reply(`Score: ${finalScore}`)
    },
};

/**
 * Basically the command would take as inputs: 
 * A) Ship type (e.g., DBX - then extract vanguard value from it); 
 * B) Ammo type (e.g., Premium/Standard/Basic); 
 * C) Time taken (in seconds, or mm:ss; 
 * D) Shots fired (e.g., 189; one is annoying to manually compute but I don’t know if there’s a way to do it with some kind of automation) 
 * E) Hull points lost (e.g., 25% - can be theoretically above 100% in case of repair limpets; easy to assess for no-repair, pain in the rear for repair builds)
 */