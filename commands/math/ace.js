/* eslint-disable no-bitwise */
/* eslint-disable complexity */
const { SlashCommandBuilder } = require('@discordjs/builders');
const QuickChart = require('quickchart-js');
const Discord = require("discord.js");
// const shipData = require("./calc/shipdata.json")

let options = new SlashCommandBuilder()
.setName('ace')
.setDescription('Score your fight based on the revised Ace Scoring System')
.addStringOption(option => option.setName('shiptype')
    .setDescription('Ship you used - Ace challenge requires an Alliance Chieftain')
    .setRequired(true)
    .addChoice('Alliance Chieftain', 'chieftain'))
.addStringOption(option => option.setName('goid')
    .setDescription('Type of goid fought - fixed to Medusa for now; may expand in the future')
    .setRequired(true)
    .addChoice('Medusa', 'medusa'))
.addIntegerOption(option => option.setName('gauss_medium_number')
    .setDescription('Number of MEDIUM gauss cannons outfitted')
    .setRequired(true)
    .addChoice('0', 0)
    .addChoice('1', 1)
    .addChoice('2', 2)
    .addChoice('3', 3)
    .addChoice('4', 4))
.addIntegerOption(option => option.setName('gauss_small_number')
    .setDescription('Number of SMALL gauss cannons outfitted')
    .setRequired(true)
    .addChoice('0', 0)
    .addChoice('1', 1)
    .addChoice('2', 2)
    .addChoice('3', 3)
    .addChoice('4', 4))
.addStringOption(option => option.setName('ammo')
    .setDescription('Ammo type used - Ace challenge requires that you use basic ammo')
    .setRequired(true)
    .addChoice('Basic', 'basic'))
.addIntegerOption(option => option.setName('time_in_seconds')
    .setDescription('Time taken in Seconds')
    .setRequired(true))
.addIntegerOption(option => option.setName('shots_medium_fired')
    .setDescription('Total number of MEDIUM gauss ammo rounds fired')
    .setRequired(true))
.addIntegerOption(option => option.setName('shots_small_fired')
    .setDescription('Total number of SMALL gauss ammo rounds fired')
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
.addBooleanOption(option => option.setName('submit')
    .setDescription('Do you want to submit your score for formal evaluation? If so, please also include a video link')
    .setRequired(false))
.addStringOption(option => option.setName('video_link')
    .setDescription('Link to a video of the fight, for submission purposes')
    .setRequired(false))

module.exports = {
    data: options,
	permissions: 0,
    execute(interaction) {

        // Scoring Factors
        let targetRun = 100

        // "Target" Points Run
        
        // The baseline for time taken penalty to be zero, set at 2m45s based on the very best medium time to-date being 3m04s (Aran in a Chally); 2m45s is supposed to be practically impossible in a Chieftain
        // let timeTakenTargetBaseline = 165

        // The baseline for ammo efficiency penalty to be zero, set at "perfect ammo efficiency" of 100%; this is possible but exceptionally difficult in practice
        // let ammoEffTargetBaseline = 1
        
        // The baseline for hull lost penalty to be zero, set at "less than 1% hull lost" of 0%; this is possible but very difficult in practice
        // let hullLostTargetBaseline = 0

        // "Zero" Points Run
        
        // The baseline for time taken penalty to be [100/3] points, set conventionally at 35% based on a "new Serpent Nemesis run" of 1800s time taken, 35% accuracy, 125% hull lost; 35%
        // let timeTakenZeroBaseline = 1800

        // The baseline for ammo efficiency penalty to be [100/3] points, set conventionally at 35% based on a "new Serpent Nemesis run" of 1800s time taken, 35% accuracy, 125% hull lost; 35%
        // let ammoEffZeroBaseline = 0.35
        
        // The baseline for hull lost penalty to be [100/3] points, set conventionally at 125% based on a "new Serpent Nemesis run" of 1800s time taken, 35% accuracy, 125% hull lost
        // let hullLostZeroBaseline = 125

        // Managing Inputs
        let args = {}
        for (let key of interaction.options.data) {
            args[key.name] = key.value
        }

        // Sanitize inputs
        if (args.scorelegend === undefined) { args.scorelegend = false }
        if (args.print_score_breakdown === undefined) { args.print_score_breakdown = false }
        if (args.submit === undefined) { args.submit = false }
        
        if ((args.gauss_small_number + args.gauss_medium_number) > 4) {
            interaction.reply(`More than 4 gauss? Very funny ${interaction.member} ...`);
            return(-1);
        }

        if ((args.gauss_small_number + args.gauss_medium_number) < 1) {
            interaction.reply(`While trying to kill a Medusa with less than 1 gauss cannons is a noble attempt dear ${interaction.member} ... it kind of defeats the purpose of this calculator`);
            return(-1);
        }

        if (args.time_in_seconds < 120) {
            interaction.reply(`Mhhh ... I sincerely doubt that you killed a Medusa alone in less than two minutes ${interaction.member} ... maybe you mixed up minutes and seconds as an input?`);
            return(-1);
        }

        if (args.time_in_seconds > 7200) {
            interaction.reply(`Oh my sweet summer child ${interaction.member} ... if you truly took more than 2 hours to kill a Medusa, you shouldn't be using an Ace score calculator to rate it ...`);
            return(-1);
        }

        if ((args.shots_small_fired + args.shots_medium_fired) < 105) {
            interaction.reply(`Since the very absolute minimum number of gauss shots to kill a Medusa in any configuration is 105, my dear ${interaction.member} you either need to check your inputs or stop trying to be funny`);
            return(-1);
        }

        if ((args.shots_small_fired + args.shots_medium_fired) > 1000) {
            interaction.reply(`Oh innocent puppy-eyed ${interaction.member} ... if you truly took more than 1,000 ammo rounds to kill a Medusa, you shouldn't be using an Ace score calculator to rate it ...`);
            return(-1);
        }

        if (args.percenthulllost < 0) {
            interaction.reply(`Unfortunately, ${interaction.member}, it's not possible to lose a NEGATIVE number of hull in a fight. Please check your inputs and try again`);
            return(-1);
        }

        if (args.percenthulllost > 500) {
            interaction.reply(`Oh wonderful ${interaction.member} padawan ... if you truly lost a total of more than 500% hull while killing a Medusa, you shouldn't be using an Ace score calculator to rate it ...`);
            return(-1);
        }

        if (args.shots_small_fired > 0 && args.gauss_small_number === 0) {
            interaction.reply(`Hey ${interaction.member} ... it appears you have small gauss shots fired, but no small gauss outfitted on your ship. Please check your inputs and try again.`);
            return(-1);
        }

        if (args.shots_medium_fired > 0 && args.gauss_medium_number === 0) {
            interaction.reply(`Hey ${interaction.member} ... it appears you have medium gauss shots fired, but no medium gauss outfitted on your ship. Please check your inputs and try again.`);
            return(-1);
        }
        
        // Decode SLEF data (to use later)
        
        // let totalSmallGauss;
        // let totalMediumGauss;
        // let slefJSON = JSON.parse(args.json)
        // let slef = slefJSON[0]

        // for (let module of slef.data.Modules) {
        //     let moduleString = module.Item
        //     if (moduleString.includes("gausscannon_fixed_small")) { totalSmallGauss++ }
        //     if (moduleString.includes("gausscannon_fixed_medium")) { totalMediumGauss++ }
        // }

        // Calculate the minimum damage required for the given gauss config
        // This comes from Mechan's & Orodruin's google sheet
        let damage_threshold;
        switch (args.gauss_medium_number) {
            case 0:
                switch (args.gauss_small_number) {
                    case 1:
                        switch (args.ammo) {
                            case "basic":
                                interaction.reply(`Sorry, a ${args.goid} run with ${args.gauss_number} ${args.gauss_type} gauss with ${args.ammo} ammo isn't possible.`);
                                return(-1);
                            case "standard":
                                interaction.reply(`Sorry, a ${args.goid} run with ${args.gauss_number} ${args.gauss_type} gauss with ${args.ammo} ammo isn't possible.`);
                                return(-1);
                            case "premium":
                                damage_threshold = 80166.53;
                                break;
                        }
                        break;
                    case 2:
                        switch (args.ammo) {
                            case "basic":
                                damage_threshold = 6771.04;
                                break;
                            case "standard":
                                damage_threshold = 5798.21;
                                break;
                            case "premium":
                                damage_threshold = 5357.04;
                                break;
                        }
                        break;
                    case 3:
                        switch (args.ammo) {
                            case "basic":
                                damage_threshold = 4848.00;
                                break;
                            case "standard":
                                damage_threshold = 4571.66;
                                break;
                            case "premium":
                                damage_threshold = 4411.68;
                                break;
                        }
                        break;
                    case 4:
                        switch (args.ammo) {
                            case "basic":
                                damage_threshold = 4298.56;
                                break;
                            case "standard":
                                damage_threshold = 4181.40;
                                break;
                            case "premium":
                                damage_threshold = 4096.56;
                                break;
                        }
                        break;
                    }
                    break;
            case 1:
                switch (args.gauss_small_number) {
                    case 0:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 8399.16;
                                break;
                            case "standard":
                                damage_threshold = 6764.58;
                                break;
                            case "premium":
                                damage_threshold = 5845.48;
                                break;
                        }
                        break;
                    case 1:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 5041.92;
                                break;
                            case "standard":
                                damage_threshold = 4734.27;
                                break;
                            case "premium":
                                damage_threshold = 4458.95;
                                break;
                        }
                        break;
                    case 2:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4367.24;
                                break;
                            case "standard":
                                damage_threshold = 4232.51;
                                break;
                            case "premium":
                                damage_threshold = 4075.55;
                                break;
                        }
                        break;     
                    case 3:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4112.72;
                                break;
                            case "standard":
                                damage_threshold = 4023.44;
                                break;
                            case "premium":
                                damage_threshold = 3912.74;
                                break;
                        }
                        break;
                }
                break;
            case 2:
                switch (args.gauss_small_number) {
                    case 0:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4553.08;
                                break;
                            case "standard":
                                damage_threshold = 4455.51;
                                break;
                            case "premium":
                                damage_threshold = 4227.86;
                                break;
                        }
                        break;  
                    case 1:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4153.12;
                                break;
                            case "standard":
                                damage_threshold = 4037.37;
                                break;
                            case "premium":
                                damage_threshold = 3933.75;
                                break;
                        }
                        break;  
                    case 2:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4007.68;
                                break;
                            case "standard":
                                damage_threshold = 3897.99;
                                break;
                            case "premium":
                                damage_threshold = 3823.46;
                                break;
                        }
                        break;
                }
                break;
            case 3:
                switch (args.gauss_small_number) {
                    case 0:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4044.04;
                                break;
                            case "standard":
                                damage_threshold = 4097.77;
                                break;
                            case "premium":
                                damage_threshold = 3933.75;
                                break;
                        }
                        break;
                    
                    case 1:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 3882.44;
                                break;
                            case "standard":
                                damage_threshold = 3823.66;
                                break;
                            case "premium":
                                damage_threshold = 3765.68;
                                break;
                        }
                    break;
                    }
                    break;
            case 4:
                switch (args.gauss_small_number) {
                    case 0:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 3874.36;
                                break;
                            case "standard":
                                damage_threshold = 3967.68;
                                break;
                            case "premium":
                                damage_threshold = 3860.22;
                                break;
                        }
                        break;
                }
            break;
            }
                
        // Medium gauss does 28.28 damage on a Dusa, small gauss does 16.16 per round
        let shot_damage_fired = args.shots_medium_fired * 28.28 + args.shots_small_fired * 16.16;

        // Avoid funnies with >100% accuracy fake submissions
        // Allow funnies if Aran is involved
        if (shot_damage_fired.toFixed(2) < damage_threshold) {
            if(interaction.member.id === "346415786505666560"){ // 346415786505666560 - Aran
                interaction.reply(`Thank you ${interaction.member} for breaking my accuracy calculations again! Please let me know where I have failed, and I will fix it - CMDR Mechan`);
            } else {
                interaction.reply(`Comrade ${interaction.member} ... It appears your entry results (${shot_damage_fired}) vs (${damage_threshold}) in greater than 100% accuracy. Unfortunately [PC] CMDR Aranionros Stormrage is the only one allowed to achieve >100% accuracy. Since you are not [PC] CMDR Aranionros Stormrage, please check your inputs and try again.`);
            }
            return(-1);
        }



        // Calculations

        // I have no idea what this is; Orodruin says "p0 is related to the score of the "good" run" :)
        let p0 = Math.tan((1/10-0.5)*Math.PI);

        // Time taken parameters
        let t0_1 = 2.75 // 2 minutes and 45 seconds - thought to be the upper limit of a medium-ship perfect time
        let t0_2 = 18 // 18 minutes - thought to be a good time for a damage-less run
        let t0_3 = 30; // 30 minutes; is conventionally "new serpent's nemesis level"
        let dt = 100; // Shape of the curve, as determined by Orodruin

        let timeTakenPenalty = 0;
        timeTakenPenalty = 200 * (0.5 + (1/Math.PI)*Math.atan(p0*((args.time_in_seconds/60 + dt)/(t0_2+dt))*((t0_3-args.time_in_seconds/60)/(t0_3-t0_2))*((t0_2-t0_1)/(args.time_in_seconds/60-t0_1))));

        // Older version
        // timeTakenPenalty = 100 / 3 * Math.log10(args.time_in_seconds/timeTakenTargetBaseline) / Math.log10(timeTakenZeroBaseline/timeTakenTargetBaseline)
        // console.log("Time Taken Penalty:" + timeTakenPenalty)

        // Hull lost parameter
        let h0_1 = 0 // No hull lost; perfect "100% club" run
        let h0_2 = 0.1 // 10% hull lost; is conventially "good run"
        let h0_3 = 1.25 // 125% total hull lost; is conventionally "new serpent's nemesis level"
        let dh = 5; // Shape of the curve, as determined by Orodruin

        let damageTakenPenalty = 0;
        damageTakenPenalty = 200 * (0.5 + (1/Math.PI)*Math.atan(p0*((args.percenthulllost/100 + dh)/(h0_2+dh))*((h0_3-args.percenthulllost/100)/(h0_3-h0_2))*((h0_2-h0_1)/(args.percenthulllost/100-h0_1))));
        
        // Older version
        // damageTakenPenalty = 100 / 3 * Math.log10(1+args.percenthulllost/100) / Math.log10(1+hullLostZeroBaseline/100)
        // console.log("Damage Taken Penalty:" + damageTakenPenalty)
        // damageTakenPenalty = 100 / 3 * Math.log(1+args.percenthulllost/100)

        // Ammo efficiency parameters
        let a0_1 = 1 // This is 100% ammo efficiency
        let a0_2 = 1 / 0.82 // 82% is Astrae's level
        let a0_3 = 1 / 0.35 // 35% is conventionally "new serpent's nemesis level"
        let da = 2; // Shape of the curve, as determined by Orodruin

        let ammoEffPenalty = 0;
        ammoEffPenalty = 200 * (0.5 + (1/Math.PI)*Math.atan(p0*((shot_damage_fired/damage_threshold + da)/(a0_2+da))*((a0_3-shot_damage_fired/damage_threshold)/(a0_3-a0_2))*((a0_2-a0_1)/(shot_damage_fired/damage_threshold-a0_1))));
        
        // Older version
        //ammoEffPenalty = 100 / 3 * Math.log10(damage_threshold/shot_damage_fired) / Math.log10(ammoEffZeroBaseline)
        // console.log("Ammo Efficiency Penalty:" + ammoEffPenalty)

        // Older version
        // let totalPenalty = 0;
        // totalPenalty = timeTakenPenalty + ammoEffPenalty + damageTakenPenalty
        // console.log("Total Penalty:" + totalPenalty)

        let finalScore = targetRun - (1/3)*(timeTakenPenalty + ammoEffPenalty + damageTakenPenalty)
        
        // Chart creation

        const chart = new QuickChart();
        chart.setWidth(400)
        chart.setHeight(400);
        chart.setBackgroundColor('transparent');
        
        chart.setConfig({
            "type": "radar",
            "data": {
              "labels": [
                "Time\nPenalty",
                "Ammo\nUsage\nPenalty",
                "Damage\nPenalty"
              ],
              "datasets": [
                {
                  "backgroundColor": "rgba(228, 107, 26, 0.2)",
                  "borderColor": "rgb(228, 107, 26)",
                  "data": [
                    timeTakenPenalty/3,
                    ammoEffPenalty/3,
                    damageTakenPenalty/3
                    
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
                        "max": 40,
                        "min": 0,
                        "stepSize": 10,
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

        let outputString = `**__Thank you for submitting a New Ace score request!__**

            This score has been calculated for ${interaction.member}'s solo fight of a ${args.shiptype} against a ${args.goid}, taking a total of ${args.percenthulllost.toFixed(0)}% hull damage (including damage repaired with limpets, if any), in ${~~(args.time_in_seconds / 60)} minutes and ${args.time_in_seconds % 60} seconds.
            
            With ${args.gauss_medium_number.toFixed(0)} medium gauss and ${args.gauss_small_number.toFixed(0)} small gauss, and using ${args.ammo} ammo, the minimum required damage done would have been ${damage_threshold.toFixed(0)}hp.
            
            ${interaction.member}'s use of ${shot_damage_fired.toFixed(0)}hp damage-of-shots-fired (${args.shots_medium_fired.toFixed(0)} medium rounds @ 28.28hp each and ${args.shots_small_fired.toFixed(0)} small rounds @ 16.16hp each) represents a **__${((damage_threshold / shot_damage_fired ).toFixed(4)*(100)).toFixed(2)}%__** ammo usage efficiency.\n`
 
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
**Time Taken Penalty:** ${(timeTakenPenalty/3).toFixed(2)} Ace points
**Ammo Used Penalty:** ${(ammoEffPenalty/3).toFixed(2)} Ace points
**Damage Taken Penalty:** ${(damageTakenPenalty/3).toFixed(2)} Ace points
---`
        }

        outputString += `\n**Your Fight Score:** **__${finalScore.toFixed(2)}__** Ace points.`
        
        if(args.scorelegend == true) {
            outputString += `
---
*Interpret as follows:*
*- CMDRs at their first Medusa fight will typically score 0-10 pts (and will occasionally score well into the negative for fights that go sideways);*
*- A collector-level CMDR will typically score about 25-45 pts;*
*- A Herculean Conqueror / early-challenge-rank CMDR will typically score about 45-65 (on a good run);* 
*- An advanced challenge-level CMDR will typically score about 65-85 (on a good run);*`
        }
        const url = chart.getUrl();

        const returnEmbed = new Discord.MessageEmbed()
        .setColor('#FF7100')
        .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
        .setTitle("**Ace Score Calculation**")
        .setDescription(`${outputString}`)
        .setImage(url)

		const buttonRow = new Discord.MessageActionRow()
        .addComponents(new Discord.MessageButton().setLabel('Learn more about the Ace Score Calculator').setStyle('LINK').setURL('https://wiki.antixenoinitiative.com/en/Ace-Score-Calculator'),)

        interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
    },
};