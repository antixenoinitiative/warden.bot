/* eslint-disable no-bitwise */
const { calculateThreshold } = require('./commons/damageThreshold');
const { testInputs } = require('./commons/testInput');
const { getChart } = require('./commons/getChart');
const { submitResult } = require('./commons/submit');
const { getInfoByShip } = require('./commons/infoByShip');
const Score = require('./commons/scoring');
const Discord = require("discord.js");
// const shipData = require("./calc/shipdata.json")

let options = new Discord.SlashCommandBuilder()
.setName('ace')
.setDescription('Score your fight based on the revised Ace Scoring System')
.addStringOption(option => option.setName('shiptype')
    .setDescription('Ship you used - Ace challenge requires an Alliance Chieftain')
    .setRequired(true)
    .addChoices(
        { name: 'Alliance Chieftain', value: 'chieftain' },
        { name: 'Alliance Challenger', value: 'challenger' },
        { name: 'Fer-de-Lance', value: 'fdl' },
        { name: 'Krait Mk2', value: 'kraitmk2' },
        { name: 'Hauler', value: 'hauler' },
    ))
.addIntegerOption(option => option.setName('gauss_medium_number')
    .setDescription('Number of MEDIUM gauss cannons outfitted')
    .setRequired(true))
.addIntegerOption(option => option.setName('shots_medium_fired')
    .setDescription('Total number of MEDIUM gauss ammo rounds fired')
    .setRequired(true))
.addIntegerOption(option => option.setName('gauss_small_number')
    .setDescription('Number of SMALL gauss cannons outfitted')
    .setRequired(true))
.addIntegerOption(option => option.setName('shots_small_fired')
    .setDescription('Total number of SMALL gauss ammo rounds fired')
    .setRequired(true))
.addStringOption(option => option.setName('ammo')
    .setDescription('Ammo type used - Ace challenge requires that you use basic ammo')
    .setRequired(true)
    .addChoices(
	{ name: 'Basic', value: 'basic' },
	{ name: 'Standard', value: 'standard' },
	{ name: 'Premium', value: 'premium' },
     ))
.addIntegerOption(option => option.setName('time_in_seconds')
    .setDescription('Time taken in Seconds')
    .setRequired(true))
.addIntegerOption(option => option.setName('percenthulllost')
    .setDescription('Total percentage of hull lost in fight (incl. repaired with limpets)')
    .setRequired(true))
.addBooleanOption(option => option.setName('print_score_breakdown')
    .setDescription('Print a score breakdown, in addition to the overall score')
    .setRequired(false))
.addBooleanOption(option => option.setName('scorelegend')
    .setDescription('Print a description of how to interpret a score')
    .setRequired(false))
.addStringOption(option => option.setName('submit_url')
    .setDescription('Do you want to submit your score for formal evaluation? If so, please also include a video link')
    .setRequired(false))
module.exports = {
    data: options,
	permissions: 0,
    async execute(interaction) {

        // Arg Handling
        let args = {}
        for (let key of interaction.options.data) {
            args[key.name] = key.value
        }

        // Set Globals
        args.targetRun = 100;

        // Set Defaults
        if (args.scorelegend === undefined) { args.scorelegend = false }
        if (args.print_score_breakdown === undefined) { args.print_score_breakdown = false }

        // Test Inputs
        let testPassed = testInputs(args, interaction)
        if (testPassed != true) {
            interaction.reply(testPassed)
            return
        }
	    
	// Get ship related data
	let shipData = getInfoByShip(args)
	for (let key of shipData) {
            args[key.name] = key.value;
        }

        // Calculate Damage Threshold
        let damageThreshold = calculateThreshold(args);
        args.damage_threshold = damageThreshold
	    
	// Calculate Damage Threshold with basic ammo
	let argsBasic = args;
	argsBasic.ammo = 'basic';
	let damageThresholdBasic = calculateThreshold(argsBasic);
	
	// Calculate damage multiplier
	let dmgMult = 1.01
	let dmgAmmoMult = 1.0
	switch (args.interceptor){
		case 'Cyclops':
		case 'Basilisk':
			break;
		case 'Medusa':
			dmgMult = dmgMult * 140.0/175.0;
			break;
		case 'Hydra':
			dmgMult = dmgMult * 140.0/220.0;
			break;
	}
	switch (args.ammo){
		case 'basic':
			break;
		case 'standard':
			dmgMult = dmgMult * 1.15;
			dmgAmmoMult = dmgAmmoMult * 1.15;
			break;
		case 'premium':
			dmgMult = dmgMult * 1.3;
			dmgAmmoMult = dmgAmmoMult * 1.3;
			break;
	}

        // Medium gauss does 35 base AX damage, small gauss does 20 base AX damage per round
	// Compute total damage done
        let shot_damage_fired = (args.shots_medium_fired * 35.0 + args.shots_small_fired * 20.0)*dmgMult;
        args.shot_damage_fired = shot_damage_fired

        // Avoid funnies with >100% accuracy fake submissions
        // Allow funnies if Aran is involved
        if (shot_damage_fired.toFixed(2) < damageThreshold) {
            if(interaction.member.id === "346415786505666560"){ // 346415786505666560 - Aran
                interaction.reply(`Thank you ${interaction.member} for breaking my accuracy calculations again! Please let me know where I have failed, and I will fix it - CMDR Mechan`);
            } else {
                interaction.reply(`Comrade ${interaction.member} ... It appears your entry results (${shot_damage_fired}) vs (${damageThreshold}) in greater than 100% accuracy. Unfortunately [PC] CMDR Aranionros Stormrage is the only one allowed to achieve >100% accuracy. Since you are not [PC] CMDR Aranionros Stormrage, please check your inputs and try again.`);
            }
            return(-1);
        }

        // Calculate Score
        let result;
        let goidType = args.interceptor;
        let targetRun = 100;
	args.efficiency = damageThreshold/shot_damage_fired;
	    
	// Premium/standard penalties
	// Find additional time necessary to fire off basic damage
	let salvoDamage = 1.01 * (args.gauss_medium_number * 35 + args.gauss_small_number * 20);
	// Extra penalty time for non-basic ammo = extra time required to fire shots + 10% (10% due to easier to keep on target for shorter time)
	let extraTime = 1.1*(2.05/salvoDamage)*(damageThresholdBasic - damageThreshold/dmgAmmoMult);
	// Hull loss multiplier "time to fire basic shots"/"time to fire premium shots"
	let hullLossMultiplier = damageThresholdBasic*dmgAmmoMult/damageThreshold;
	    
	args.extraTime = extraTime;
	args.hullLossMultiplier = hullLossMultiplier;

        result = Score.score_this(args)


        // Create Chart
        let url = getChart(result)
        
        // Print Results

        let outputString = `**__Thank you for requesting a New Ace score calculation!__**

        This score has been calculated for ${interaction.member}'s solo fight of a ${args.shiptype} against a ${goidType}, taking a total of ${args.percenthulllost.toFixed(0)}% hull damage (including damage repaired with limpets, if any), in ${~~(args.time_in_seconds / 60)} minutes and ${args.time_in_seconds % 60} seconds.
        
        With ${args.gauss_medium_number.toFixed(0)} medium gauss and ${args.gauss_small_number.toFixed(0)} small gauss, and using ${args.ammo} ammo, the minimum required damage done would have been ${damageThreshold.toFixed(0)}hp.
        
        ${interaction.member}'s use of ${shot_damage_fired.toFixed(0)}hp damage-of-shots-fired (${args.shots_medium_fired.toFixed(0)} medium rounds @ 28.28hp each and ${args.shots_small_fired.toFixed(0)} small rounds @ 16.16hp each) represents a **__${((damageThreshold / shot_damage_fired ).toFixed(4)*(100)).toFixed(2)}%__** ammo usage efficiency.\n`

        if (args.shots_medium_fired === 0 && args.gauss_medium_number > 0) {
                outputString += `\n\n**__WARNING__**: It appears you have medium gauss outfitted, but no medium gauss shots fired. Please make sure this is intended.`
        }

        if (args.shots_small_fired === 0 && args.gauss_small_number > 0) {
            outputString += `\n\n**__WARNING__**: It appears you have small gauss outfitted, but no small gauss shots fired. Please make sure this is intended.`
        }
            
        if(args.print_score_breakdown == true) {
                outputString += `---
                    **Base Score:** ${targetRun} Ace points
                    ---
                    **Time Taken Penalty:** ${(result.timePenalty/3).toFixed(2)} Ace points
                    **Ammo Used Penalty:** ${(result.ammoPenalty/3).toFixed(2)} Ace points
                    **Damage Taken Penalty:** ${(result.damagePenalty/3).toFixed(2)} Ace points
                    ---`
        }

        outputString += `\n**Your Fight Score:** **__${result.score.toFixed(2)}__** Ace points.`
        
        if(args.scorelegend == true) {
            outputString += `
                ---
                *Interpret as follows:*
                *- CMDRs at their first Medusa fight will typically score 0-10 pts (and will occasionally score well into the negative for fights that go sideways);*
                *- A collector-level CMDR will typically score about 25-45 pts;*
                *- A Herculean Conqueror / early-challenge-rank CMDR will typically score about 45-65 (on a good run);* 
                *- An advanced challenge-level CMDR will typically score about 65-85 (on a good run);*
                *- Please note that scores of different ships cannot be compared with each other!*`
        }

        const returnEmbed = new Discord.EmbedBuilder()
        .setColor('#FF7100')
        .setTitle("**Ace Score Calculation**")
        .setDescription(`${outputString}`)
        .setImage(url)

        const buttonRow = new Discord.ActionRowBuilder()
        .addComponents(new Discord.ButtonBuilder().setLabel('Learn more about the Ace Score Calculator').setStyle(Discord.ButtonStyle.Link).setURL('https://wiki.antixenoinitiative.com/en/Ace-Rank-Rework'),)

        interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });

        console.log(args.submit_url);
        if (args.submit_url !== undefined) {
            submitResult(args, result, interaction)
            console.log("Submission triggered");
        }
    }
}
