/* eslint-disable no-bitwise */
const Discord = require("discord.js");
const weapons = require("./data/weapons.json");
/*
 weapons entry format:
 "code" : {
	"name" : str - weapon name,
	"humdamage" : float - human damage,
	"axdamage" : float - AX damage,
	"ap" : float - armor piercing,
	"pattern" : array - firing pattern [[#shots_1,timing_1],[#shots_2,timing_2],...],
	"stdmult" : float - standard ammo multiplier,
	"premult" : float - premium ammo multiplier,
	"falloff" : int - falloff start range,
	"maxrange" : int - max range,
	"source" : str - data source
 }
*/
const interceptors = require("./data/interceptors.json");
/*
interceptor entry format
"Interceptor name" : {
		"name" : "Interceptor name",
		"exert_hull" : float - hull for exert,
		"regen" : float - regeneration per second,
		"armor" : float - armor value
	} 
*/

// Regex for extracting weapon number and code
const regex = "^([0-9]+)([a-z]+)$";

function codealiases(code){
	switch(code){
		case "mgauss":
		case "m":
			return "mfgc";
			break;
		case "sgauss":
		case "s":
			return "sfgc";
			break;
		case "modshard":
		case "msc":
		case "ms":
			return "mfmsc";
			break;
		case "modplasma":
		case "mpc":
		case "mp":
			return "mfmpc";
			break;
		default:
			return code;
	}
}

function mttotFeedback(mttot){
	if (mttot == Number.POSITIVE_INFINITY)
		return `Insufficient DPS`;
	return (mttot >= 120)?`☠️ ${mttot.toFixed(2)} s`:(
				(mttot >= 60)?`🟥 ${mttot.toFixed(2)} s`:(
					(mttot >= 45)?`🟧 ${mttot.toFixed(2)} s`:(
						(mttot >= 30)?`🟨 ${mttot.toFixed(2)} s`:(
							`🟩 ${mttot.toFixed(2)} s`
						)
					)
				)
			);
}

let options = new Discord.SlashCommandBuilder()
.setName('mttot')
.setDescription('MTToT simulator')
.addStringOption(option => option.setName('variant')
		.setDescription('Thargoid Variant')
		.setRequired(true))
.addStringOption(option => option.setName('weapon_codes')
		.setDescription('Thargoid Variant')
		.setRequired(true))
.addIntegerOption(option => option.setName('range')
		.setDescription('Engagement range [m]')
		.setRequired(false))
.addIntegerOption(option => option.setName('accuracy')
		.setDescription('Accuracy in \%')
		.setRequired(false))
		
// Add interceptor choices based on data read from interceptor.json
for (let key of Object.keys(interceptors)){
	options.options[0].addChoices({name: `${key}`, value: key})
}

/*for (let key of Object.keys(weapons)){
	options.addIntegerOption(option => option.setName(`${key}`)
    .setDescription(`${weapons[key].name}`)
    .setRequired(false))
}*/

module.exports = {
    data: options,
	permissions: 0,
    async execute(interaction) {
		try{
		let outputString = ``;
		let warningString = ``;
		
		// Range and accuracy initialization
		let range = 0;
		let accuracy = 100;
        // Arg Handling
        let args = {};
		let codes;
        let hardpoints = {};
		let interceptor;
		let weaponsString = ``;
		for (let key of interaction.options.data) {
            args[key.name] = key.value;
			switch(key.name){
				default:
					hardpoints[key.name] = key.value;
					break;
				case 'variant':
					interceptor = interceptors[key.value];
					break;
				case 'range':
					range = key.value;
					break;
				case 'accuracy':
					accuracy = key.value;
					break;
				case 'weapon_codes':
					// Treat weapon_codes
					// Split on ,
					codes = key.value.toLowerCase().split(",");
					// Treat each code
					for(let c of codes){
						const entry = [...c.matchAll(regex)];
						if (entry.length != 1){
							warningString = warningString + `\nWARNING: Code _\`${c}\`_ does not match weapon code format -- Ignored (type _\`/codes\`_ for help)`;
						}
						else{ // One weapon code per comma separated entry
							let wcode = codealiases(entry[0][2]);
							if (wcode in hardpoints){
								hardpoints[wcode] = hardpoints[wcode] + parseInt(entry[0][1]);
								warningString = warningString + `\nNOTE: Code _\`${wcode}\`_ used multiple times. Adding numbers.`;
							}
							else {
								hardpoints[wcode] = parseInt(entry[0][1]);
							}
						}
					}
					break;
			}
        }
		// Check inputs on range and accuracy
		if (accuracy > 100 || accuracy < 0)
			throw new Error(`${accuracy}% is not a valid accuracy. Value must be in range 0-100.`);
		if (range < 0)
			throw new Error(`Range cannot be negative (inserted value: ${range} m).`);
		
		
		let armor = interceptor.armor, hull = interceptor.exert_hull, regen = interceptor.regen;

		let hardpointState = {};
		let dpsb = 0.0;
		let dpss = 0.0;
		let dpsp = 0.0;
		let accuracyMult = accuracy/100.0;
		// Prepare hardpoints
		for (let key of Object.keys(hardpoints)){
			if (key in weapons){
				let number = hardpoints[key];
				weaponsString = weaponsString + `\n${hardpoints[key]}x ${weapons[key].name} (**\`${hardpoints[key]}${key}\`**)`;
				hardpointState[key] = weapons[key];
				let rangeMultPre = (hardpointState[key].maxrange - range)/(hardpointState[key].maxrange - hardpointState[key].falloff);
				let rangeMult = (rangeMultPre > 1.0)? 1.0 : ((rangeMultPre < 0.0)? 0.0 : rangeMultPre);
				let armorMitigation = (armor < hardpointState[key].ap)? 1.0 : (hardpointState[key].ap / armor);
				hardpointState[key].number = number;
				hardpointState[key].nextFire = 0.0;
				hardpointState[key].Nsequence = 0; // Part of sequence
				hardpointState[key].Msequence = 0; // Progression in part
				hardpointState[key].Nfired = 0;
				hardpointState[key].sequenceLength = weapons[key].pattern.length;
				let AXpct = weapons[key].axpct;
				hardpointState[key].damage_bsc = number*accuracyMult*rangeMult*armorMitigation*(weapons[key].axdamage + 0.01* weapons[key].humdamage);
				hardpointState[key].damage_std = hardpointState[key].damage_bsc * weapons[key].stdmult;
				hardpointState[key].damage_prm = hardpointState[key].damage_bsc * weapons[key].premult;
				
				let cycle = 0.0;
				let cycleShots = 0;
				for(let pt of hardpointState[key].pattern){
					cycle = cycle + pt[0]*pt[1];
					cycleShots = cycleShots + pt[0];
				}
				dpsb = dpsb + cycleShots*hardpointState[key].damage_bsc * hardpointState[key].sequenceLength / cycle;
				dpss = dpss + cycleShots*hardpointState[key].damage_std * hardpointState[key].sequenceLength / cycle;
				dpsp = dpsp + cycleShots*hardpointState[key].damage_prm * hardpointState[key].sequenceLength / cycle;
			}
			else{
				warningString = warningString + `\nWARNING: Hardpoint type _\`${key}\`_ unrecognized -- Ignored (type _\`/codes\`_ for help)`;
			}
		}

		
		let mttot_bsc, mttot_std, mttot_pre;
		let exert_bsc = false, exert_std = false, exert_pre = false;
		let dmg_bsc = 0.0, dmg_std = 0.0, dmg_pre = 0.0; // Damage done
		let MAX_ITERATION = 10000;
		let iter = 0;
		
		// Check if dps is sufficient
		if (dpsb < interceptor.regen){
			mttot_bsc = Number.POSITIVE_INFINITY;
			exert_bsc = true;
		}
		if (dpss < interceptor.regen){
			mttot_std = Number.POSITIVE_INFINITY;
			exert_std = true;
		}
		if (dpsp < interceptor.regen){
			mttot_pre = Number.POSITIVE_INFINITY;
			exert_pre = true;
		}
		
		// Exert simulation
		hpkeys = Object.keys(hardpointState);
		while((!exert_bsc || !exert_std || !exert_pre) && (iter < MAX_ITERATION)){
			iter = iter + 1;
			// Find out which hardpoint fires
			let minTime = Number.POSITIVE_INFINITY;
			let firing; // Will contain key of firing hardpoint
			for(let hp of hpkeys){
				if(minTime > hardpointState[hp].nextFire){
					minTime = hardpointState[hp].nextFire;
					firing = hp;
				}
			}
			let hpt = hardpointState[firing];
			
			// Do damage
			dmg_bsc = dmg_bsc + hpt.damage_bsc;
			dmg_std = dmg_std + hpt.damage_std;
			dmg_pre = dmg_pre + hpt.damage_prm;
			
			// Update hardpoint state
			// Next firing time
			hardpointState[firing].nextFire = minTime + hpt.pattern[hpt.Nsequence][1];
			// Next step in the sequence
			hardpointState[firing].Msequence = (hpt.Msequence + 1) % hpt.pattern[hpt.Nsequence][0];
			if (hardpointState[firing].Msequence == 0)
				hardpointState[firing].Nsequence = (hpt.Nsequence + 1) % hpt.sequenceLength;
			// Number of times fired
			hardpointState[firing].Nfired = hardpointState[firing].Nfired + 1;
			
			// Check for exerts
			let toExert = minTime * interceptor.regen + interceptor.exert_hull;
			if (!exert_pre && (dmg_pre >= toExert)){
				// Enough damage done to exert with basics
				exert_pre = true;
				mttot_pre = minTime;
			}
			if (exert_pre && !exert_std && (dmg_std >= toExert)){
				// Enough damage done to exert with basics
				exert_std = true;
				mttot_std = minTime;
			}
			if (exert_std && !exert_bsc && (dmg_bsc >= toExert)){
				// Enough damage done to exert with basics
				exert_bsc = true;
				mttot_bsc = minTime;
			}

		}
		if (warningString.length > 0)
			warningString = "_" + warningString + "_";
		
		let rangeString = `${range} m`;
		if (range == 0){
			rangeString = "point blank";
		}
		
	    try {
            const returnEmbed = new Discord.EmbedBuilder()
			.setColor('#FF7100')
			.setTitle("**MTTOT Simulator**")
            .setDescription(`Minimum simulated time on target for **${interceptor.name}** variant, **${accuracy}%** accuracy, **${rangeString}** range, using:**${weaponsString}**${warningString}`)
            .addFields({ name: "Basic", value: `${mttotFeedback(mttot_bsc)}`, inline: true })
            .addFields({ name: "Standard", value: `${mttotFeedback(mttot_std)}`, inline: true })
            .addFields({ name: "Premium", value: `${mttotFeedback(mttot_pre)}`, inline: true })
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
        } catch (err) {
            interaction.reply({ content: "Something went wrong, please check that you entered the correct format" });
        }
		}
		catch (err) {
			interaction.reply({content: "ERROR: " + err.message});
		}
	}
}