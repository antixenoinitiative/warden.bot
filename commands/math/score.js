/* eslint-disable no-bitwise */
/* eslint-disable complexity */
const { SlashCommandBuilder } = require('@discordjs/builders');
const QuickChart = require('quickchart-js');
const Discord = require("discord.js");
const shipData = require("./calc/shipdata.json")

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
.addIntegerOption(option => option.setName('gauss_medium_number')
    .setDescription('Nnumber of MEDIUM gauss cannons outfitted')
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
    .setDescription('Ammo type used')
    .setRequired(true)
    .addChoice('Basic', 'basic')
    .addChoice('Standard', 'standard')
    .addChoice('Premium', 'premium'))
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
            interaction.reply(`Hey ${interaction.member} ... it appears you have medium gauss shots fired, but no small gauss outfitted on your ship. Please check your inputs and try again.`);
            return(-1);
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

        let myrmThreshold;
        let vanguardScore;

        let shipInfo = shipData.find(ship => ship.ShortName == args.shiptype)
        vanguardScore = shipInfo.Score
        switch (shipInfo.Size) {
            case ("small"):
                myrmThreshold = 1440
                break
            case ("medium"):
                myrmThreshold = 720
                break
            case ("large"):
                myrmThreshold = 360
                break
        }

        // Calculate the minimum amount of ammo needed for the gauss config
        // This comes from Mechan's & Orodruin's google sheet
        // It is INTENTIONALLY not a mix of small and medium as that makes everything unmanageable - either medium or small is used
        // THIS IS NOW DEPRECATED IN FAVOR OF THE DAMAGE METHOD, WHICH INSTEAD ALLOWS TO COMPARE ALSO A MIX OF WEAPONS
//        let ammo_threshold;
//       switch (args.gauss_type) {
//            case "small":
//               switch (args.gauss_number) {
//                    case 1:
//                        switch (args.ammo) {
//                            case "basic":
//                                interaction.reply(`Sorry, a ${args.goid} run with ${args.gauss_number} ${args.gauss_type} gauss with ${args.ammo} ammo isn't possible.`);
//                                return(-1);
//                            case "standard":
//                                interaction.reply(`Sorry, a ${args.goid} run with ${args.gauss_number} ${args.gauss_type} gauss with ${args.ammo} ammo isn't possible.`);
//                                return(-1);
//                            case "premium":
//                                ammo_threshold = 3816;
//                                break;
//                        }
//                        break;
//                    case 2:
//                        switch (args.ammo) {
//                            case "basic":
//                                ammo_threshold = 417;
//                                return(-1);
//                            case "standard":
//                                ammo_threshold = 317;
//                                return(-1);
//                            case "premium":
//                                ammo_threshold = 255;
//                                break;
//                        }
//                        break;
//                    case 3:
//                        switch (args.ammo) {
//                            case "basic":
//                                ammo_threshold = 300;
//                                break;
//                            case "standard":
//                                ammo_threshold = 251;
//                                break;
//                            case "premium":
//                                ammo_threshold = 210;
//                                break;
//                        }
//                        break;
//                    case 4:
//                        switch (args.ammo) {
//                            case "basic":
//                                ammo_threshold = 266;
//                                break;
//                            case "standard":
//                                ammo_threshold = 229;
//                                break;
//                            case "premium":
//                                ammo_threshold = 195;
//                                break;
//                        }
//                        break;
//               }
//                break;
//                case "medium":
//                    switch (args.gauss_number) {
//                        case 1:
//                            switch (args.ammo) {
//                                case "basic":
//                                    ammo_threshold = 296;
//                                    break;
//                                case "standard":
//                                    ammo_threshold = 211;
//                                    break;
//                                case "premium":
//                                    ammo_threshold = 159;
//                                    break;
//                            }
//                            break;
//                        case 2:
//                            switch (args.ammo) {
//                                case "basic":
//                                    ammo_threshold = 161;
//                                    break;
//                                case "standard":
//                                    ammo_threshold = 139;
//                                    break;
//                                case "premium":
//                                    ammo_threshold = 115;
//                                    break;
//                            }
//                            break;
//                        case 3:
//                            switch (args.ammo) {
//                                case "basic":
//                                    ammo_threshold = 143;
//                                    break;
//                                case "standard":
//                                    ammo_threshold = 129;
//                                    break;
//                                case "premium":
//                                    ammo_threshold = 107;
//                                    break;
//                            }
//                            break;
//                        case 4:
//                            switch (args.ammo) {
//                                case "basic":
//                                    ammo_threshold = 137;
//                                    break;
//                                case "standard":
//                                    ammo_threshold = 125;
//                                    break;
//                                case "premium":
//                                    ammo_threshold = 105;
//                                    break;
//                            }
//                            break;
//                    }
//                    break;
//
//        }


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
                                damage_threshold = 80105.5;
                                break;
                        }
                        break;
                    case 2:
                        switch (args.ammo) {
                            case "basic":
                                damage_threshold = 6651.5;
                                break;
                            case "standard":
                                damage_threshold = 5688;
                                break;
                            case "premium":
                                damage_threshold = 5198.5;
                                break;
                        }
                        break;
                    case 3:
                        switch (args.ammo) {
                            case "basic":
                                damage_threshold = 4745;
                                break;
                            case "standard":
                                damage_threshold = 4458;
                                break;
                            case "premium":
                                damage_threshold = 4276;
                                break;
                        }
                        break;
                    case 4:
                        switch (args.ammo) {
                            case "basic":
                                damage_threshold = 4212;
                                break;
                            case "standard":
                                damage_threshold = 4068.5;
                                break;
                            case "premium":
                                damage_threshold = 3968.5;
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
                                damage_threshold = 8332.5;
                                break;
                            case "standard":
                                damage_threshold = 6590;
                                break;
                            case "premium":
                                damage_threshold = 5752;
                                break;
                        }
                        break;
                    case 1:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4991;
                                break;
                            case "standard":
                                damage_threshold = 4642.5;
                                break;
                            case "premium":
                                damage_threshold = 4399;
                                break;
                        }
                        break;
                    case 2:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4314.5;
                                break;
                            case "standard":
                                damage_threshold = 4150.5;
                                break;
                            case "premium":
                                damage_threshold = 4009.5;
                                break;
                        }
                        break;     
                    case 3:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4048;
                                break;
                            case "standard":
                                damage_threshold = 3966;
                                break;
                            case "premium":
                                damage_threshold = 3845.5;
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
                                damage_threshold = 4437.5;
                                break;
                            case "standard":
                                damage_threshold = 4212;
                                break;
                            case "premium":
                                damage_threshold = 4091.5;
                                break;
                        }
                        break;  
                    case 1:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4089;
                                break;
                            case "standard":
                                damage_threshold = 3966;
                                break;
                            case "premium":
                                damage_threshold = 3866;
                                break;
                        }
                        break;  
                    case 2:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 3966;
                                break;
                            case "standard":
                                damage_threshold = 3822.5;
                                break;
                            case "premium":
                                damage_threshold = 3763.5;
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
                                damage_threshold = 3966;
                                break;
                            case "standard":
                                damage_threshold = 3863.5;
                                break;
                            case "premium":
                                damage_threshold = 3784;
                                break;
                        }
                        break;
                    
                    case 1:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 3822.5;
                                break;
                            case "standard":
                                damage_threshold = 3761;
                                break;
                            case "premium":
                                damage_threshold = 3702;
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
                                damage_threshold = 3781.5;
                                break;
                            case "standard":
                                damage_threshold = 3720;
                                break;
                            case "premium":
                                damage_threshold = 3661;
                                break;
                        }
                        break;
                }
            break;
            }
                
        // Medium gauss does 28.18 damage on a Dusa, small gauss does 16.16 per round
        let shot_damage_fired = args.shots_medium_fired * 28.18 + args.shots_small_fired * 16.16;

        // Avoid funnies with >100% accuracy fake submissions
        // Allow funnies if Aran is involved
        if (shot_damage_fired < damage_threshold) {
            if(interaction.member.id === "634034293399879720"){ // 346415786505666560 - Aran
                interaction.reply(`Thank you ${interaction.member} for breaking my accuracy calculations again! Please let me know where I have failed, and I will fix it - CMDR Mechan`);
            } else {
                interaction.reply(`Comrade ${interaction.member} ... It appears your entry results in greater than 100% accuracy. Unfortunately [PC] CMDR Aranionros Stormrage is the only one allowed to achieve >100% accuracy. Since you are not [PC] CMDR Aranionros Stormrage, please check your inputs and try again.`);
            }
            return(-1);
        }

        // Set accuracy threshold
        // 82% is the current setting for Astraea's Clarity, which is 175 rounds for a 3m basic config, which in turn is 143 rounds minimum
        // So, for now, applying 82% as the ratio ... which is multiplying by 1.223 and rounding up
        let accuracy_required;
        accuracy_required = Math.ceil(damage_threshold * 1.223);

        // Set myrm_factor based on myrm_threshold - this is done as the basis to calculate a penalty that is consistent across ship sizes, and not punishing for large ships (as the absolute # of seconds used to be)
        let myrm_factor;
        myrm_factor = args.time_in_seconds / myrmThreshold;

        // Calculations
        let roundPenaltyTotal = 0;
        if (shot_damage_fired > accuracy_required) { roundPenaltyTotal = (shot_damage_fired - accuracy_required)/((28.18*args.gauss_medium_number+16.16*args.gauss_small_number)/(args.gauss_medium_number+args.gauss_small_number)) * roundPenalty }
        console.log("Ammo Used Penalty:" + roundPenaltyTotal)

        // Factor of -10.8 was obtained by matching penalties from old system with a 30m medium run to new system, as follows
        // (1800 - 720) * -0.025 = 27
        // 1800/720 * x = 27 --> x = 27 * 720 / 1800 -> x = 10.8
        let timePenaltyTotal = 0;
        if (args.time_in_seconds > myrmThreshold) { timePenaltyTotal = (myrm_factor) * 10.8 }
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

        let outputString = `**__Thank you for submitting a New Ace score request!__**

            This score has been calculated for ${interaction.member}'s solo fight of a ${args.shiptype} against a ${args.goid}, taking a total of ${args.percenthulllost}% hull damage (including damage repaired with limpets, if any), in ${~~(args.time_in_seconds / 60)} minutes and ${args.time_in_seconds % 60} seconds.
            
            With ${args.gauss_medium_number} medium gauss and ${args.gauss_small_number} small gauss, and using ${args.ammo} ammo, the minimum required damage done would have been ${damage_threshold.toFixed(0)}hp, which entails a maximum of ${accuracy_required.toFixed(0)}hp in damage-of-shots-fired for an 82% firing efficiency level (Astraea's Clarity level).
            
            ${interaction.member}'s use of ${shot_damage_fired}hp damage-of-shots-fired (${args.shots_medium_fired} medium rounds @ 28.28hp each and ${args.shots_small_fired} small rounds @ 16.16hp each) represents a **__${((damage_threshold / shot_damage_fired ).toFixed(4)*(100)).toFixed(2)}%__** overall firing efficiency.`
 
        if (args.shots_medium_fired === 0 && args.gauss_medium_number > 0) {
                outputString += `\n\n**__WARNING__**: It appears you have medium gauss outfitted, but no medium gauss shots fired. Please make sure this is intended.`
        }

        if (args.shots_small_fired === 0 && args.gauss_small_number > 0) {
            outputString += `\n\n**__WARNING__**: It appears you have small gauss outfitted, but no small gauss shots fired. Please make sure this is intended.`
        }
            
        if(args.print_score_breakdown == true) {
                outputString += `
                ---
                **Base Score:** ${targetRun} Ace points
                ---
                **Vanguard Score Penalty:** -${vangPenaltyTotal.toFixed(2)} Ace points
                **Ammo Type Penalty:** -${ammoPenalty.toFixed(2)} Ace points
                **Ammo Used Penalty:** -${roundPenaltyTotal.toFixed(2)} Ace points
                **Time Taken Penalty:** -${timePenaltyTotal.toFixed(2)} Ace points
                **Damage Taken Penalty:** -${hullPenaltyTotal.toFixed(2)} Ace points
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
                *- An advanced challenge-level CMDR will typically score about 65-85 (on a good run);*
                *- The very best score is presently 99.80 AXI points.*`
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