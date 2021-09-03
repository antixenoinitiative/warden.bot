/* eslint-disable no-bitwise */
/* eslint-disable complexity */
const { SlashCommandBuilder } = require('@discordjs/builders');
const QuickChart = require('quickchart-js');
const Discord = require("discord.js");


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
.addIntegerOption(option => option.setName('gauss_number')
    .setDescription('Total number of gauss cannons used')
    .setRequired(true)
    .addChoice('One', 1)
    .addChoice('Two', 2)
    .addChoice('Three', 3)
    .addChoice('Four', 4))
.addStringOption(option => option.setName('gauss_type')
    .setDescription('Largest type of gauss cannons used')
    .setRequired(true)
    .addChoice('Small gauss ONLY', 'small')
    .addChoice('ANY number of medium gauss', 'medium'))
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
.addBooleanOption(option => option.setName('scorelegend')
    .setDescription('Print a description of how to interpret a score')
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
        if (args.scorelegend !== undefined) { args.scorelegend = false }
        
        if (args.gauss_number > 4) {
            interaction.reply(`More than 4 gauss? Very funny ${interaction.member} ...`);
            return(-1);
        }

        if (args.gauss_number < 1) {
            interaction.reply(`While trying to kill a Medusa with less than 1 gauss cannons is a noble attempt dear ${interaction.member} ... it kind of defeats the purpose of this calculator`);
            return(-1);
        }

        if (args.time_in_seconds < 120) {
            interaction.reply(`Mhhh ... I sincerely doubt that you killed a Medusa alone in less than two minutes ${interaction.member} ... maybe you mixed up minutes and seconds as an input?`);
            return(-1);
        }

        if (args.time_in_seconds > 7200) {
            interaction.reply(`Oh my dearest summer child ${interaction.member} ... if you truly took more than 2 hours to kill a Medusa, you shouldn't be using an Ace score calculator to rate it ...`);
            return(-1);
        }

        if (args.shotsfired < 105) {
            interaction.reply(`Since the very absolute minimum number of gauss shots to kill a Medusa in any configuration is 105, my dear ${interaction.member} you either need to check your inputs or stop trying to be funny`);
            return(-1);
        }

        if (args.shotsfired > 1000) {
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

        // Calculate the minimum amount of ammo needed for the gauss config
        // This comes from Mechan's & Orodruin's google sheet
        // It is INTENTIONALLY not a mix of small and medium as that makes everything unmanageable - either medium or small is used
        let ammo_threshold;
        switch (args.gauss_type) {
            case "small":
                switch (args.gauss_number) {
                    case 1:
                        switch (args.ammo) {
                            case "basic":
                                interaction.reply(`Sorry, a ${args.goid} run with ${args.gauss_number} ${args.gauss_type} gauss with ${args.ammo} ammo isn't possible.`);
                                return(-1);
                            case "standard":
                                interaction.reply(`Sorry, a ${args.goid} run with ${args.gauss_number} ${args.gauss_type} gauss with ${args.ammo} ammo isn't possible.`);
                                return(-1);
                            case "premium":
                                ammo_threshold = 3816;
                                break;
                        }
                        break;
                    case 2:
                        switch (args.ammo) {
                            case "basic":
                                ammo_threshold = 417;
                                return(-1);
                            case "standard":
                                ammo_threshold = 317;
                                return(-1);
                            case "premium":
                                ammo_threshold = 255;
                                break;
                        }
                        break;
                    case 3:
                        switch (args.ammo) {
                            case "basic":
                                ammo_threshold = 300;
                                break;
                            case "standard":
                                ammo_threshold = 251;
                                break;
                            case "premium":
                                ammo_threshold = 210;
                                break;
                        }
                        break;
                    case 4:
                        switch (args.ammo) {
                            case "basic":
                                ammo_threshold = 266;
                                break;
                            case "standard":
                                ammo_threshold = 229;
                                break;
                            case "premium":
                                ammo_threshold = 195;
                                break;
                        }
                        break;
                }
                break;
                case "medium":
                    switch (args.gauss_number) {
                        case 1:
                            switch (args.ammo) {
                                case "basic":
                                    ammo_threshold = 296;
                                    break;
                                case "standard":
                                    ammo_threshold = 211;
                                    break;
                                case "premium":
                                    ammo_threshold = 159;
                                    break;
                            }
                            break;
                        case 2:
                            switch (args.ammo) {
                                case "basic":
                                    ammo_threshold = 161;
                                    break;
                                case "standard":
                                    ammo_threshold = 139;
                                    break;
                                case "premium":
                                    ammo_threshold = 115;
                                    break;
                            }
                            break;
                        case 3:
                            switch (args.ammo) {
                                case "basic":
                                    ammo_threshold = 143;
                                    break;
                                case "standard":
                                    ammo_threshold = 129;
                                    break;
                                case "premium":
                                    ammo_threshold = 107;
                                    break;
                            }
                            break;
                        case 4:
                            switch (args.ammo) {
                                case "basic":
                                    ammo_threshold = 137;
                                    break;
                                case "standard":
                                    ammo_threshold = 125;
                                    break;
                                case "premium":
                                    ammo_threshold = 105;
                                    break;
                            }
                            break;
                    }
                    break;

        }

        // Set accuracy threshold
        // 82% is the current setting for Astraea's Clarity, which is 175 rounds for a 3m basic config, which in turn is 143 rounds minimum
        // So, for now, applying 82% as the ratio ... which is multiplying by 1.223 and rounding up
        let accuracy_required;
        accuracy_required = Math.ceil(ammo_threshold * 1.223);

        // Set myrm_factor based on myrm_threshold - this is done as the basis to calculate a penalty that is consistent across ship sizes, and not punishing for large ships (as the absolute # of seconds used to be)
        let myrm_factor;
        myrm_factor = args.time_in_seconds / myrmThreshold;

        // Calculations
        let roundPenaltyTotal = 0;
        if (args.shotsfired > accuracy_required) { roundPenaltyTotal = (args.shotsfired - accuracy_required) * roundPenalty }
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
            *Note: This score calculator is currently in Alpha and may change without notice*
            ---
            This score has been calculated for ${interaction.member}'s solo fight of a ${args.shiptype} against a ${args.goid}, taking a total of ${args.percenthulllost}% hull damage (including damage repaired with limpets, if any), in ${~~(args.time_in_seconds / 60)} minutes and ${args.time_in_seconds % 60} seconds.
            
            With ${args.gauss_number} ${args.gauss_type} gauss (or a mix if medium was selected), and using ${args.ammo} ammo, the minimum required number of shots
            would have been ${ammo_threshold}, which entails a maximum of ${accuracy_required} shots for an 82% accuracy level (Astraea's Clarity level).
            
            ${interaction.member}'s use of ${args.shotsfired} rounds represents a ${((ammo_threshold / args.shotsfired ).toFixed(4)*(100)).toFixed(2)}% overall accuracy.
            
            ---
            **Base Score:** ${targetRun} AXI points
            ---
            **Vanguard Score Penalty:** -${vangPenaltyTotal.toFixed(2)} AXI points
            **Ammo Type Penalty:** -${ammoPenalty.toFixed(2)} AXI points
            **Ammo Used Penalty:** -${roundPenaltyTotal.toFixed(2)} AXI points
            **Time Taken Penalty:** -${timePenaltyTotal.toFixed(2)} AXI points
            **Hull Damage Taken Penalty:** -${hullPenaltyTotal.toFixed(2)} AXI points
            ---
            **Total Score:** ${finalScore.toFixed(2)} AXI points\n`
        

        if(args.scorelegend === true) {
            outputString += `
                ---
                *Interpret as follows:*
                *- CMDRs at their first Medusa fight will typically score 0-10 pts (and will occasionally score well into the negative for fights that go sideways);*
                *- A collector-level CMDR will typically score about 25-45 pts;*
                *- A Herculean Conqueror / early-challenge-rank CMDR will typically score about 45-65 (on a good run);* 
                *- An advanced challenge-level CMDR will typically score about 65-85 (on a good run);*
                *- The very best score is presently 99.80 AXI points (obtained in a shielded DBX).*`
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