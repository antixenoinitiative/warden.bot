const { botLog, botIdent  } = require('../../../functions');
const database = require(`../../../${botIdent().activeBot.botName}/db/database`)
const Discord = require("discord.js");


/* eslint-disable no-bitwise */
const { testInputs } = require('../math/commons/testInput')
const { getChart } = require('../math/commons/getChart')
const Score = require('../math/commons/scoring')
const damageThresholds = require("../math/data/dmgThresholds.json")
/*
Damage threshold entry:
"Interceptor name" : {
	"basic" : double array - damage thresholds w/ basic ammo [#med][#small],
	"standard" : double array - damage thresholds w/ standard ammo [#med][#small],
	"premium" : double array - damage thresholds w/ premium ammo [#med][#small]
}
*/
const shipDataTable = require("../math/data/shipData.json");
/*
Ship data entry:
"ship_id" : {
	"name" : str - Ship name,
	"interceptor" : str - Target interceptor for ship,
	"small_hp" : int - # of small hardpoints,
	"total_hp" : int - # of total hardpoints,
	"scoring" : {
		"time" : float array [3] - time scoring [shape, 0 penalty time, "good", "entry level"],
		"hull" : float array [3] - hull scoring [shape, 0 penalty hull, "good", "entry level"],
		"ammo" : float array [3] - ammo scoring [shape, 0 penalty ammo, "good", "entry level"] (note 1/efficiency!)
	}
}
*/


let options = new Discord.SlashCommandBuilder()
.setName('ace')
.setDescription('Score your fight based on the revised Ace Scoring System')
.addStringOption(option => option.setName('shiptype')
    .setDescription('Ship you used')
    .setRequired(true)
)
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
    .setDescription('Ammo type used - standard and premium will incur time and hull penalties')
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
	
// Add ship choices based on data read from shipData.json
for (let key of Object.keys(shipDataTable)){
	options.options[0].addChoices({name: `${shipDataTable[key].name} (vs ${shipDataTable[key].interceptor})`, value: key})
}
	
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
        let shipData = shipDataTable[args.shiptype];
        args.interceptor = shipData.interceptor;
        args.scoring = shipData.scoring;

        // Construct weapons string
        let weaponsString = ``;
        if (args.gauss_medium_number > 0)
            weaponsString += `${args.gauss_medium_number.toFixed(0)} medium gauss`;
        if (args.gauss_medium_number > 0 && args.gauss_small_number > 0)
            weaponsString += ` and `;
        if (args.gauss_small_number > 0)
            weaponsString += `${args.gauss_small_number.toFixed(0)} small gauss`;

        // Ship related checks

        // Check that gauss configuration can be fitted
        let totalfit = shipDataTable[args.shiptype].total_hp;
        let medfit = totalfit - shipDataTable[args.shiptype].small_hp;
        // Mediums can be fitted
        if (args.gauss_medium_number > medfit){
            interaction.reply(`Your poor ${shipDataTable[args.shiptype].name} cannot fit ${args.gauss_medium_number} medium gauss.`);
            return
        }
        if (args.gauss_medium_number + args.gauss_small_number > totalfit){
            interaction.reply(`Howerver hard you may try, it is impossible to fit ${weaponsString} in that ${shipDataTable[args.shiptype].name} ...`);
            return
        }

        // Calculate Damage Threshold
        let damageThreshold = damageThresholds[args.interceptor][args.ammo][args.gauss_medium_number][args.gauss_small_number];
        args.damage_threshold = damageThreshold;
        
        // Calculate Damage Threshold with basic ammo
        let damageThresholdBasic = damageThresholds[args.interceptor]["basic"][args.gauss_medium_number][args.gauss_small_number];
        
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
        args.shot_damage_fired = shot_damage_fired;

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
        let extraTime = 1.5*(2.05/salvoDamage)*(damageThresholdBasic - damageThreshold/dmgAmmoMult);
        // Hull loss multiplier "time to fire basic shots"/"time to fire premium shots"
        let hullLossMultiplier = damageThresholdBasic*dmgAmmoMult/damageThreshold;
            
        args.extraTime = extraTime;
        args.hullLossMultiplier = hullLossMultiplier;

        result = Score.score_this(args)


        // Create Chart
        let url = getChart(result)
        
        // Print Results


        let outputString = `**__Thank you for requesting a Score calculation!__**

        This score has been calculated for ${interaction.member}'s solo fight of a ${args.shiptype} against a ${goidType}, taking a total of ${args.percenthulllost.toFixed(0)}% hull damage (including damage repaired with limpets, if any), in ${~~(args.time_in_seconds / 60)} minutes and ${args.time_in_seconds % 60} seconds.
        
        With ${weaponsString}, and using ${args.ammo} ammo, the minimum required damage done would have been ${damageThreshold.toFixed(0)}hp.
        
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
                    ---
					**Ammo time penalty:** ${extraTime.toFixed(2)} seconds
					**Ammo hull multiplier:** x ${hullLossMultiplier.toFixed(2)}
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

        // console.log(args.submit_url);
        if (args.submit_url !== undefined) {
            ace_submit(args, result, interaction)
            // console.log("Submission triggered");
            async function ace_submit(args, result, interaction) {
                let userID = interaction.member.id
                let name = interaction.member.displayName
                let timestamp = Date.now()
                let staffChannel = process.env.STAFFCHANNELID
        
                // Checks
                // console.log(staffChannel);
                if (!args.submit_url.startsWith('https://')) { return interaction.followUp({ content: `❌ Please enter a valid URL, eg: https://...` }) }
        
                // Submit
                if(interaction.guild.channels.cache.get(staffChannel) === undefined)  { // Check for staff channel
                    return interaction.followUp({ content: `Staff Channel not found` })
                }
                try {
                    const values = [userID]
                    const sql = 'SELECT * FROM `ace` WHERE user_id = (?) AND approval = 1';
                    const response = await database.query(sql, values)
                    if (response.length > 0) {
                        if (parseFloat(response[0].score) > parseFloat(result.score.toFixed(2))) {
                            interaction.editReply({ content: `⛔ Error: Your existing entry has a higher score, submission denied.` })
                            return
                        }
                    }
                }
                catch (err) {
                    console.log(err)
                    botLog(i.guild,new Discord.EmbedBuilder()
                        .setDescription('```' + err.stack + '```')
                        .setTitle(`⛔ Fatal error experienced: ace_submit()`)
                        ,2
                        ,'error'
                    )
                }
                try {
                    const submission_values = [
                        userID,
                        name,
                        args.time_in_seconds,
                        args.gauss_medium_number,
                        args.gauss_small_number,
                        args.shots_medium_fired,
                        args.shots_small_fired,
                        args.percenthulllost,
                        result.score.toFixed(2),
                        args.submit_url,
                        false,
                        timestamp,
                        args.shiptype
                    ]
                    const submission_sql = `
                        INSERT INTO ace (user_id, name, timetaken, mgauss, sgauss, mgaussfired, sgaussfired, percenthulllost,score, link, approval, date, shiptype) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?);
                    `;
                    await database.query(submission_sql, submission_values)
                } 
                catch (err) {
                    console.log(err)
                    botLog(interaction.guild,new Discord.EmbedBuilder()
                        .setDescription('```' + err.stack + '```')
                        .setTitle(`⛔ Fatal error experienced`)
                        ,2
                        ,'error'
                    )
                    return interaction.editReply({ content: `Something went wrong creating a Submission, please try again or contact staff!` })
                }
                try {
                    const values = [userID,0,timestamp]
                    const sql = 'SELECT id FROM `ace` WHERE user_id = (?) AND approval = (?) AND date = (?)';
                    const response = await database.query(sql, values)
                    if (response.length > 0) {
                        let submissionId = response[0].id
                        const returnEmbed = new Discord.EmbedBuilder()
                            .setColor('#FF7100')
                            .setTitle(`**Ace Submission Complete**`)
                            .setDescription(`Congratulations <@${interaction.member.id}>, your submission is complete. Please be patient while our staff approve your submission. Submission ID: #${submissionId}`)
                            .addFields(
                                {name: "Pilot", value: `<@${userID}>`, inline: true},
                                {name: "Ship", value: `${args.shiptype}`, inline: true},
                                {name: "Score", value: `${result.score.toFixed(2)}`, inline: true},
                                {name: "link", value: `${args.submit_url}`, inline: true}
                            )
                        interaction.editReply({ embeds: [returnEmbed.setTimestamp()] })
        
                        // Create staff interaction
                        const staffEmbed = new Discord.EmbedBuilder()
                            .setColor('#FF7100')
                            .setTitle(`**New Ace Submission**`)
                            .setDescription(`Please select Approve or Deny below if the video is legitimate and matches the fields below. NOTE: This will not assign any ranks, only approve to the Leaderboard.`)
                            .addFields(
                                {name: "Pilot", value: `<@${userID}>`, inline: true},
                                {name: "Ship", value: `${args.shiptype}`, inline: true},
                                {name: "Score", value: `${result.score.toFixed(2)}`, inline: true},
                                {name: "link", value: `${args.submit_url}`, inline: true},
                                {name: "Time(sec)", value: `${args.time_in_seconds}`, inline: true},
                                {name: "Medium Gauss Modules", value: `${args.gauss_medium_number}`, inline: true},
                                {name: "Small Gauss Modules", value: `${args.gauss_small_number}`, inline: true},
                                {name: "Medium Gauss Fired", value: `${args.shots_medium_fired}`, inline: true},
                                {name: "Small Gauss Fired", value: `${args.shots_small_fired}`, inline: true},
                                {name: "Hull % Lost", value: `${args.percenthulllost}`, inline: true}
                            )
                        const row = new Discord.ActionRowBuilder()
                            .addComponents(new Discord.ButtonBuilder().setCustomId(`submission-ace-approve-${submissionId}`).setLabel('Approve').setStyle(Discord.ButtonStyle.Success),)
                            .addComponents(new Discord.ButtonBuilder().setCustomId(`submission-ace-deny-${submissionId}`).setLabel('Delete').setStyle(Discord.ButtonStyle.Danger),)
                        let buttonResult = null;
                        buttonResult = await interaction.guild.channels.cache.get(staffChannel).send({ embeds: [staffEmbed], components: [row] });
                        const embedId = buttonResult.id
                        try {
                            const submissionUpdate_values = [embedId,submissionId]
                            const submissionUpdate_sql = `UPDATE ace SET embed_id = (?) WHERE id = (?);`
                            await database.query(submissionUpdate_sql, submissionUpdate_values)
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
                catch (err) {
                    console.log(err)
                    botLog(i.guild,new Discord.EmbedBuilder()
                        .setDescription('```' + err.stack + '```')
                        .setTitle(`⛔ Fatal error experienced: ace_submit()`)
                        ,2
                        ,'error'
                    )
                }
            }
        }
    }
}