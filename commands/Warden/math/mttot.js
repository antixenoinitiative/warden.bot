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
const regex = "([0-9]+)([a-z]+)";

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

// .addStringOption(option => option.setName('variant')
// 		.setDescription('Thargoid Variant')
// 		.setRequired(true))
.addStringOption(option => option.setName('weapon_codes')
		.setDescription('Weapon Codes'))
.addIntegerOption(option => option.setName('range')
		.setDescription('Engagement range [m]')
		.setRequired(false))
.addIntegerOption(option => option.setName('accuracy')
		.setDescription('Accuracy in \%')
		.setRequired(false))
.addBooleanOption(option => option.setName('verbose')
		.setDescription('Verbose mode: Include output for debugging')
		.setRequired(false))
// .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)	
// Add interceptor choices based on data read from interceptor.json


// for (let key of Object.keys(interceptors)){
// 	options.options[0].addChoices({name: `${key}`, value: key})
// }

module.exports = {
    data: options,

    permissions:0,
    async execute(interaction) {
		try {

			//Button Integration START
			let thisIndex = 0;
			let weaponsArray = []
			let choosenCeptor = null;
            function getWeaponsInCategory(find) {
                const filteredKeys = Object.keys(weapons)
                .filter(key => key.toLowerCase().startsWith(find))
                .map(key => ({
                    name: weapons[key].name,
                    abbreviated: key
                }));
                return filteredKeys
            }
			function combineWeap() {
				let items = [];
				let string = null
				weaponsArray.forEach(i=>{
					string = i.weapNumber + i.type
					items.push(string)
				})
				items = items.join(", ")
				return items
			}
            const weaponClassification = [
                {
					"type": "f",
                    "Label": "Fixed",
                    "CustomId": "Fixed"
                },
                {
					"type": "g",
                    "Label": "Gimballed",
                    "CustomId": "Gimballed"
                },
                {
					"type": "t",
                    "Label": "Turreted",
                    "CustomId": "Turreted"
                }
            ]
            const weaponSize = [
                {
                    "Label": "Small",
                    "CustomId": "Small"
                },
                {
                    "Label": "Medium",
                    "CustomId": "Medium"
                },
                {
                    "Label": "Large",
                    "CustomId": "Large"
                }
            ]
            const interceptors2 = [
                { 
                    "Label":"Cyclops",
                    "CustomId":"Cyclops",
                    "Style":Discord.ButtonStyle.Primary
                },
                { 
                    "Label":"Basilisk",
                    "CustomId":"Basilisk",
                    "Style":Discord.ButtonStyle.Primary
                },
                { 
                    "Label":"Medusa",
                    "CustomId":"Medusa",
                    "Style":Discord.ButtonStyle.Primary
                },
                { 
                    "Label":"Hydra",
                    "CustomId":"Hydra",
                    "Style":Discord.ButtonStyle.Primary
                },
            ]
            
            interceptorsFunc(interaction)
            async function interceptorsFunc(interaction) {
                const InterceptorVariantType = new Discord.ActionRowBuilder()
                interceptors2.forEach(ceptor=>{
                    const button = new Discord.ButtonBuilder()
                    .setLabel(ceptor.Label)
                    .setCustomId(ceptor.CustomId)
                    .setStyle(ceptor.Style)
                    InterceptorVariantType.addComponents(button)
                }) 
    
                const interceptorResponse = await interaction.reply({
                    content: `Choose an Interceptor`,
                    components: [InterceptorVariantType],
                    ephemeral: true
                });
                const collectorFilter = i => i.user.id === interaction.user.id;
                const confirmation = await interceptorResponse.awaitMessageComponent({ filter: collectorFilter, time: 60000 });
                
                await interaction.editReply({ components: [], content: "Variant:" + confirmation.customId, ephemeral: true }).catch(console.error);
                choosenCeptor = confirmation.customId
				const weapon_codes = interaction?.options.getString('weapon_codes') ?? null;
				if (!weapon_codes) { weapNumber(interaction) }
				else { continueLoad()  }
				
            }
            async function weapNumber(interaction) {
				
				if (weaponsArray.length == 0) { 
                    const newObj = {}
                    newObj["variant"] = choosenCeptor
					thisIndex = 0
                    weaponsArray.push(newObj)
                }
                else {  
					const newObj = {}
                    newObj["variant"] = choosenCeptor
					thisIndex = thisIndex + 1
                    weaponsArray.push(newObj)
				}

                const optionsCount = 6;
                const row1Buttons = Array.from({ length: 3 }, (_, index) => {
                  const opNumber = index + 1;
                  return new Discord.ButtonBuilder()
                    .setLabel(opNumber.toString())
                    .setCustomId(opNumber.toString())
                    .setStyle(Discord.ButtonStyle.Primary);
                });

                const row2Buttons = Array.from({ length: optionsCount - 3 }, (_, index) => {
                  const opNumber = index + 4; // Start from 4 for the second row
                  return new Discord.ButtonBuilder()
                    .setLabel(opNumber.toString())
                    .setCustomId(opNumber.toString())
                    .setStyle(Discord.ButtonStyle.Primary);
                });
              
                const row1 = new Discord.ActionRowBuilder().addComponents(...row1Buttons);
                const row2 = new Discord.ActionRowBuilder().addComponents(...row2Buttons);
              
                const response = await interaction.followUp({
                  content: 'Choose the amount of weapons:',
                  components: [row1, row2],
                  ephemeral: true
                });
                const collector = response.createMessageComponentCollector({ componentType: Discord.ComponentType.Button, time: 3_600_000 });

                collector.on('collect', async i => {
                    const selection = i.customId;
                    weaponsArray[thisIndex]["weapNumber"] = selection
                    await i.reply({ content: 'Weapon Amount: ' + selection, components: [], ephemeral: true }).catch(console.error);
                    weaponSizes(interaction)
                });
            }
            async function weaponSizes(interaction) {
                const weaponSizeRow = new Discord.ActionRowBuilder()
                weaponSize.forEach(weap=>{
                    const button = new Discord.ButtonBuilder()
                    .setLabel(weap.Label)
                    .setCustomId(weap.CustomId)
                    .setStyle(Discord.ButtonStyle.Primary)
                    weaponSizeRow.addComponents(button)
                }) 
                const response = await interaction.followUp({
                  content: 'Choose the Size:',
                  components: [weaponSizeRow],
                  ephemeral: true
                });
                const collector = response.createMessageComponentCollector({ componentType: Discord.ComponentType.Button, time: 3_600_000 });
                collector.on('collect', async i => {
                    const selection = i.customId;
                    weaponsArray[thisIndex]["size"] = selection.slice(0,1).toLowerCase()
                    await i.reply({ content: 'Weapon Size: ' + selection, components: [], ephemeral: true }).catch(console.error);
                    collector.stop()
                    weaponHardpoint(interaction)
                });
            }
            async function weaponHardpoint(interaction) {
				const setOfWeapons = getWeaponsInCategory(weaponsArray[thisIndex].size)
				let setOfWeapons_hp = setOfWeapons.map(item => item.abbreviated[1])

                const weaponHardpointRow = new Discord.ActionRowBuilder()
				function continueLoading(weap) { 
					return new Discord.ButtonBuilder()
					.setLabel(weap.Label)
					.setCustomId(weap.CustomId)
					.setStyle(Discord.ButtonStyle.Primary)
				}
                weaponClassification.forEach(weap => {
					if (setOfWeapons_hp.includes(weap.type)) { 
						weaponHardpointRow.addComponents(continueLoading(weap)) 
					}
                }) 
                const response = await interaction.followUp({
                  content: 'Choose the Hardpoint:',
                  components: [weaponHardpointRow],
                  ephemeral: true
                });
                const collector = response.createMessageComponentCollector({ componentType: Discord.ComponentType.Button, time: 3_600_000 });
                collector.on('collect', async i => {
                    const selection = i.customId;
                    weaponsArray[thisIndex]["hardpoint"] = selection.slice(0,1).toLowerCase()
                    await i.reply({ content: 'Weapon Hardpoint: ' + selection, components: [], ephemeral: true }).catch(console.error);
                    collector.stop()
                    weaponClass(interaction)
                });
            }
            async function weaponClass(interaction) {
                const hardpoint = weaponsArray[weaponsArray.length -1].hardpoint
                const sizeOfHardpoint = weaponsArray[weaponsArray.length -1].size
                const weaponListingByChoice = getWeaponsInCategory(sizeOfHardpoint + hardpoint);
				// console.log(weaponListingByChoice)
                const chunkedOptions = [];
                let tempArray = [];
                for (let i = 0; i < weaponListingByChoice.length; i++) {
                  tempArray.push(weaponListingByChoice[i]);
                
                  if (tempArray.length === 25 || i === weaponListingByChoice.length - 1) {
                    chunkedOptions.push(tempArray);
                    tempArray = [];
                  }
                }
                for (let i = 0; i < chunkedOptions.length; i++) {
                  const weaponClassSelectMenu = new Discord.StringSelectMenuBuilder()
                    .setCustomId(`weaponClass_${i}`)
                    .setPlaceholder('Choose Weapon:')
                    .addOptions(
                      chunkedOptions[i].map((size) => {
                        return new Discord.StringSelectMenuOptionBuilder()
                          .setLabel(size.name)
                          .setValue(size.abbreviated);
                      })
                    );
                
                  const weaponClassSelectMenuActionRow = new Discord.ActionRowBuilder().addComponents(
                    weaponClassSelectMenu
                  );
                
                  const contentMessage = i === 0 ? 'Choose Weapon:' : '';
                
                  await interaction.followUp({
                    content: contentMessage,
                    components: [weaponClassSelectMenuActionRow],
                    ephemeral: true
                  });
                
                  // Handle collector for each select menu
                  const collector = interaction.channel.createMessageComponentCollector({
                    componentType: Discord.ComponentType.StringSelect,
                    time: 3_600_000,
                  });
                
                  collector.on('collect', async (i) => {
                    const selection = i.values[0]
                    await i.update({ components: [], content: 'Weapon Classification: ' + selection, ephemeral: true });
                    weaponsArray[thisIndex]["type"] = selection
                    collector.stop();
					addMoreWeapons(interaction)
                  });
                }
            }
			async function addMoreWeapons(interaction) {
                const yes = new Discord.ButtonBuilder()
                    .setLabel("Yes")
                    .setCustomId("Yes")
                    .setStyle(Discord.ButtonStyle.Success)
				const no = new Discord.ButtonBuilder()
                    .setLabel("No")
                    .setCustomId("No")
                    .setStyle(Discord.ButtonStyle.Danger)

				const addMoreWeaponsRow = new Discord.ActionRowBuilder().addComponents(yes,no)
                const response = await interaction.followUp({
                  content: 'Add more weapons?:',
                  components: [addMoreWeaponsRow],
                  ephemeral: true
                });
                const collector = response.createMessageComponentCollector({ componentType: Discord.ComponentType.Button, time: 3_600_000 });
                collector.on('collect', async i => {
                    const selection = i.customId;
                    await i.reply({ content: 'Add More Weapons: ' + selection, components: [], ephemeral: true }).catch(console.error);
                    collector.stop()
					if (selection == 'Yes') {
						weapNumber(interaction)
					}
					else {
						weaponsArray = combineWeap()
						continueLoad(interaction)
					}
                });
            }
			//Button Integration END
			function continueLoad() {
				
				let outputString = ``;
				let warningString = ``;
				
				// Range and accuracy initialization
				let range = 0;
				let accuracy = 100;
				// Arg Handling
				let args = {};
				let codes;
				let hardpoints = {};
				let interceptor =  interceptors[choosenCeptor]
				let weaponsString = ``;
				let verbose = false;
				
				function weaponCodes(codez) {
					// Treat weapon_codes
					// Find all substrings on format NN+CC+
					const matches = [...codez.matchAll(regex)];
					for(let m of matches){
						outputString = outputString + `\nWeapon code found: ${m[0]} -> ${m[1]} - ${m[2]}`
						let wcode = codealiases(m[2]);
						if (wcode in hardpoints){
							hardpoints[wcode] = hardpoints[wcode] + parseInt(m[1]);
							warningString = warningString + `\nNOTE: Code _\`${wcode}\`_ used multiple times. Adding numbers.`;
						}
						else {
							hardpoints[wcode] = parseInt(m[1]);
						}
					}

				}
				//Button Integration START
				if (weaponsArray.length >= 1) { weaponCodes(weaponsArray) }
				//Button Integration END
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
						case 'verbose':
							verbose = key.value;
							break;
						case 'weapon_codes':
							weaponCodes(key.value)
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
						dpsb = dpsb + cycleShots*hardpointState[key].damage_bsc / cycle;
						dpss = dpss + cycleShots*hardpointState[key].damage_std / cycle;
						dpsp = dpsp + cycleShots*hardpointState[key].damage_prm / cycle;
					}
					else{
						warningString = warningString + `\nWARNING: Hardpoint type _\`${key}\`_ unrecognized -- Ignored (type _\`/codes\`_ for help)`;
					}
				}
	
				
				let mttot_bsc, mttot_std, mttot_pre;
				let exert_bsc = false, exert_std = false, exert_pre = false;
				let dmg_bsc = 0.0, dmg_std = 0.0, dmg_pre = 0.0; // Damage done
				let MAX_ITERATION = 1000000;
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
				outputString = outputString + `\nDPS values:\n Basics: ${dpsb}\n Standard: ${dpss}\n Premium: ${dpsp}\nRegen: ${interceptor.regen}`;
				
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
				if (iter == MAX_ITERATION){
					interaction.followUp({content: `Maximal number of iterations (${MAX_ITERATION}) reached. DPS is theoretically sufficient but extremely low.\n${outputString}`});
					return;
				}
				
				try {
					if (!verbose)
						outputString = "";
					const returnEmbed = new Discord.EmbedBuilder()
					.setColor('#FF7100')
					.setTitle("**MTTOT Simulator**")
					.setDescription(`Minimum simulated time on target for **${interceptor.name}** variant, **${accuracy}%** accuracy, **${rangeString}** range, using:**${weaponsString}**${warningString}${outputString}`)
					.addFields({ name: "Basic", value: `${mttotFeedback(mttot_bsc)}`, inline: true })
					.addFields({ name: "Standard", value: `${mttotFeedback(mttot_std)}`, inline: true })
					.addFields({ name: "Premium", value: `${mttotFeedback(mttot_pre)}`, inline: true })
					interaction.followUp({ embeds: [returnEmbed.setTimestamp()] });
				} catch (err) {
					interaction.followUp({ content: "Something went wrong, please check that you entered the correct format" });
				}
			}
		}
		catch (err) {
			interaction.followUp({content: "ERROR: " + err.message});
		}
	}
}