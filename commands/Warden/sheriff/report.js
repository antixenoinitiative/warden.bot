/**
 * /report
 * The command utilizes http://elitebgs API endpoints (/ticks, /factions, /systems) to generate the ***Deputy Sheriff's Report***.
 * 
 * @author F0rd Pr3f3ct (@FPr3f3ct)
 */

 const Discord = require("discord.js");

const fetch = require("node-fetch");
const moment = require("moment");
const utils = require("./commons/utils.js");
const edgame = require("./commons/edgame.js");
const { botIdent } = require('../../../functions.js');
const config = require('../../../config.json');
const { tickURL, factionURL, systemURL, dateFormatPattern, maxMessageLength} = config[botIdent().activeBot.botName]

module.exports = {
    data: new Discord.SlashCommandBuilder()
    .setName(`report`)
    .setDescription(`Shows the ***Deputy Sheriff's Report***`)
    .addBooleanOption(option => option.setName("template")
        .setDescription(`If yes, I'll give you a plain text view of the report for further editing.`)
        .setRequired(false))
    .addStringOption(option => option.setName("faction")
        .setDescription(`I can generate the report for AXI, XRG or any other faction. Defaults to "Anti Xeno Initiative".`)
        .setRequired(false)),    
    permissions: 0,
    execute (interaction) {
        
        var templateOption = interaction.options.getBoolean("template");
        var factionOption = interaction.options.getString("faction");
        
        var faction = factionOption;
        if(utils.isNoneOrEmpty(factionOption)) { 
            faction = "anti xeno initiative"; 
        } else {
            if(factionOption.toLowerCase() === 'axi') { faction = utils.expand('AXI'); }
            if(factionOption.toLowerCase() === 'xrg') { faction = utils.expand('XRG'); }
        }
        faction = faction.split(" ").join("%20");
        

        // The report takes a while, so we send an initial message (within 3s) and edit it afterwards.
        // Also we send follow up messages as the whole thing gets too long (2000 max size).
        //interaction.reply({ content: ":hourglass_flowing_sand:  Working on the report ... :hourglass_flowing_sand:"});
        interaction.deferReply();
        
        var systemDetails = "true"; // adds systemdetail (controlling_minor_faction, other factions, conflits )
        buildReport(faction, systemDetails)
        .then(report => {
            if(templateOption) {
                sendAsTemplate(interaction, report);
                } else {
                sendAsMultiMessage(interaction, report);
                }
            })
        .catch(error => {
            console.log("ERROR: " + error); 
            interaction.reply({ content: "I'm sorry, an error occurred and I could not fulfill your request." });
        });
    }
};

async function sendAsTemplate(interaction, report){
        await interaction.editReply({ content: "```" + report.header + "```" });

        var maxControlledSystemsLength = maxMessageLength - 6;
        if(report.controlledSystems.length > maxControlledSystemsLength){
            await interaction.followUp({ content: "```" + report.controlledSystems.substring(0, maxControlledSystemsLength) + "```" });
            await interaction.followUp({ content: "```" + report.controlledSystems.substring(maxControlledSystemsLength, report.controlledSystems.length) + "```" });
        } else {
            await interaction.followUp({ content: "```" + report.controlledSystems + "```" });
        }

        var maxOtherSystemsLength = maxMessageLength - 6;
        if(report.otherSystems !== null){
            if(report.otherSystems.length > maxOtherSystemsLength){
                await interaction.followUp({ content: "```" + report.otherSystems.substring(0, maxOtherSystemsLength) + "```" });
                await interaction.followUp({ content: "```" + report.otherSystems.substring(maxOtherSystemsLength, report.otherSystems.length) + "```" });
            } else {
                await interaction.followUp({ content: "```" + report.otherSystems + "```" });
            }
        }
}

async function sendAsMultiMessage(interaction, report){
        await interaction.editReply(report.header);      

        var maxControlledSystemsLength = maxMessageLength - 2;
        if(report.controlledSystems.length > maxControlledSystemsLength){
            await interaction.followUp({ content: "\u200B\n" + report.controlledSystems.substring(0, maxControlledSystemsLength) });
            await interaction.followUp({ content: "\u200B\n" + report.controlledSystems.substring(maxControlledSystemsLength, report.controlledSystems.length) });
        } else {
            await interaction.followUp({ content: "\u200B\n" + report.controlledSystems });
        }

        var maxOtherSystemsLength = maxMessageLength - 2;
        if(report.otherSystems !== null){
            if(report.otherSystems.length > maxOtherSystemsLength) {
                await interaction.followUp({ content: "\u200B\n" + report.otherSystems.substring(0, maxOtherSystemsLength) });
                await interaction.followUp({ content: "\u200B\n" + report.otherSystems.substring(maxOtherSystemsLength, report.otherSystems.length) });
            } else {
                await interaction.followUp({ content: "\u200B\n" + report.otherSystems });
            }
        }
}

async function buildReport(faction, systemDetails) {
    //vor 48h: moment().subtract(48, 'hours').valueOf() = 1618941697832
    //https://elitebgs.app/api/ebgs/v5/ticks?timeMin=1618941697832
    //https://elitebgs.app/api/ebgs/v5/factions?name=Anti Xeno Initiative&timeMin=1619022540000
    //timeMin < timeMax interval 

    // before 74h to play it safe. might be 3 ticks though
    var timeInterval = moment().subtract(74, 'hours').valueOf();
    var tickQuery = `${tickURL}?timeMin=${timeInterval}`;
    
    var tickResponse = await fetch(tickQuery);
    var tickData = await tickResponse.json();
    var ticks = tickData.sort(utils.dynamicsort("time", "desc"));
    if(ticks.length < 2) { throw `Got only one or no tick. Please check EliteBGS API at ${tickQuery}`; }

    var tickCurrent = ticks[0]["time"]; // current tick
    var tickLast = ticks[1]["time"]; // last tick
    var tickLastTimestamp = new Date(tickLast).getTime();
    console.log("  tick: " + tickLast + " (" + tickLastTimestamp + ")"); 
    
    var factionEndpoint = `${factionURL}?name=${faction}&timeMin=${tickLastTimestamp}&systemDetails=${systemDetails}`;
    console.log("  GET " + factionEndpoint); 
    var factionResponse = await fetch(factionEndpoint);
    var factionData = await factionResponse.json();

    //improve: check if faction result is OK

    var doc = factionData["docs"][0];
    var factionName = doc["name"];
    var updatedAt = new Date(doc["updated_at"]);
    var reportTime = moment().utc().format(dateFormatPattern) + " UTC";
    var presences = doc["faction_presence"];
    var controlledSystems =  filterControlledSystems(presences, factionName).sort(utils.dynamicsort("system_name"));
    var otherSystems = (presences.filter(presence => !controlledSystems.includes(presence))).sort(utils.dynamicsort("system_name"));
    var history = doc["history"];

    var controlledSystemsView = await reportFactionPresences("**Controlled Systems:**\n", tickCurrent, controlledSystems, history); 
    var otherSystemsView = await reportFactionPresences("**Other Systems:**\n", tickCurrent, otherSystems, history);

    var report = {
        header : ":star: ***Deputy Sheriff Report " + reportTime + "*** :star:\n" +
            "Last tick: *" + moment(tickCurrent).utc().format(dateFormatPattern) + " UTC ("+moment(tickCurrent).utc().fromNow()+")*\n" +
            "Faction name: *" + factionName + "*\n" +
            "Faction updated: *" + moment(updatedAt).utc().format(dateFormatPattern) + " UTC ("+moment(updatedAt).utc().fromNow()+")*\n",
        controlledSystems : controlledSystemsView,
        otherSystems : otherSystemsView
    }
    return report;
}

function filterControlledSystems(presences, factionName){
    var results = presences
        .filter(presence => { 
            var presenceContrllingFaction = presence["system_details"]["controlling_minor_faction_cased"];
            var isControlledSystem = (presenceContrllingFaction == factionName);
            presence["isControlledSystem"] = isControlledSystem;
            return isControlledSystem;
        });
    return results;
}

async function reportFactionPresences(heading, tick, presences, history) {
    var results = "";
    for (const presence of presences) {
        results += await reportFactionPresence(tick, presence, history) + "\n";
    }
    if(results.length > 10 ) {
        results = heading + results;
    } else {
        results = null;
    }
    return results;
}

async function reportFactionPresence(tick, presence, history) {
    var result = "";
    var separator = " / ";
    
    var systemName = presence["system_name"];
    var systemUpdatedAt = presence["updated_at"];
    var systemConflicts = presence["conflicts"];
    
    var infRaw = presence["influence"];
    var stateActiveValues = presence["active_states"];
    var statePendingValues = presence["pending_states"];
    //var stateRecoveringValues = presence['recovering_states'];

    var inf = (infRaw * 100).toFixed(2);
    var infDeltaValue = (calculateFactionInfluenceDelta(presence, history) * 100).toFixed(2);
    var infDelta = (infDeltaValue > 0 ) ? "+"+infDeltaValue : infDeltaValue;
    var infTrend = formatInfluenceTrend(infDeltaValue);
    var influenceView = "Inf: " + inf + " % " + infTrend + " " + infDelta + " % ";/*(raw: " + infRaw + ")"*/

    var securityView = "";
    // only for controlled systems
    // States: Lockdown, Civil Unrest, None, Civil Liberty
    // CU, None, CL+Slider
    if(presence["isControlledSystem"]){
        securityView = separator + "Sec: "
        if(stateActiveValues.some(item => item.state === 'civilliberty') ){
            securityView +=  "CL |----------|";
        } else if (stateActiveValues.some(item => item.state === 'none')){
            securityView += edgame.states.none.name;
        } else if (stateActiveValues.some(item => item.state === 'civilunrest')){
            securityView += utils.abbrieviate(edgame.states.civilunrest.name)
        } else if (stateActiveValues.some(item => item.state === 'lockdown') ){
            securityView += edgame.states.lockdown.name;
        } else {
            securityView = "";
        }

       /*  if(stateRecoveringValues.some(item => item.state === 'civilliberty')) {
            securityView = separator + "recovering CL"; 
        } */
    } else {
        securityView = "";
    }

    //var updatedSince = moment(systemUpdatedAt).fromNow();
    var updatedDiffToTick = moment(systemUpdatedAt).diff(moment(tick));
    var updatedDiffToTickInHours = updatedDiffToTick / (1000*60*60);
    //console.log("  tick ("+tick+") diff updatedAt ("+systemUpdatedAt+") sys("+systemName+"): " + updatedDiffToTickInHours);
    var updateNeededValues = [":rocket:", ""];//`(${updatedSince})`];
    var updateNeeded = (updatedDiffToTickInHours < 0) ? updateNeededValues[0] : updateNeededValues[1];
    
    //console.log("  state.active:" + stateActiveValues[0]);
    var stateActive = (!stateActiveValues || stateActiveValues.length === 0) 
        ? edgame.states.none.name 
        : stateActiveValues.map(item => {
            var stateName = edgame.states[item["state"]].name;
            //stateName = (stateName && edgame.states.civilliberty.name == stateName) ? utils.abbrieviate(stateName) : stateName;
            return stateName;
        }).join(", ");
    var stateActiveView = separator + "States: Active: " + stateActive;

    //console.log("  state.pending:" + statePendingValues[0]);
    var statePendingView = "";
    if (!statePendingValues || statePendingValues.length === 0) { 
        //    edgame.states.none.name : 
    } else {
        var statePending = statePendingValues.map(item => {
            var stateName = edgame.states[item["state"]].name;
            //stateName = (stateName && edgame.states.civilliberty.name == stateName) ? utils.abbrieviate(stateName) : stateName;
            return stateName;
            }).join(", ");
        statePendingView = separator + "Pending: " + statePending;
    }

    var conflictsView = "";
    // data in presence only rudimentary. if there is at least oneconflict, we fetch 
    // the additional daa needed from the .../system?name=... endpoint
    /*
    var exampleFactionConflicts = [ { "type": "war", "status": "active", 
            "opponent_name": "Aegis Research", "opponent_name_lower": "aegis research", "opponent_faction_id": "59e7a81fd22c775be0fe3f8b", "station_id": null,
            "stake": "Modern Digital Scientific", "stake_lower": "modern digital scientific", "days_won": 1  } ];
    */

    if (!systemConflicts || systemConflicts.length === 0) {
        //NOP
        console.log("  No conflicts in " + systemName);
    } else {

        var systemDetailedConflicts = await getConflictsDetails(systemName);
        
        conflictsView = (systemDetailedConflicts.length > 0)? "\n" + systemDetailedConflicts : "";
            //+ "\n\t" + systemConflicts.map(conflict => "Conflict: " + conflict["status"] + " " + conflict["type"] + ": Opponent " + conflict["opponent_name"] + ", Stake: " + conflict["stake"] + ", Days won: " + conflict["days_won"] ).join("\n\t");
    }

    result = "***" + systemName + "*** " + updateNeeded + separator +
        influenceView +
        securityView +
        stateActiveView +
        statePendingView +
        conflictsView; // empty if no conflicts
    return result;
}

async function getConflictsDetails(systemName){
    var results = "";

    var conflictsFromSystemEndpoint = `${systemURL}?name=${systemName}`;

    console.log("  Conflict(s) in " + systemName)
    console.log("  GET " + conflictsFromSystemEndpoint);

    //var systemDetailedConflictsPromise = "";
    var response = await fetch(conflictsFromSystemEndpoint);
    var data = await response.json();
    var doc = data["docs"][0];
    var conflicts = doc["conflicts"];
    
    if (conflicts && conflicts.length > 0) {
        //results = "got " + conflicts.length + " conflicts.";
        // "active war: AXI (1) : (0) CRA"
        results += conflicts.map(conflict => formatConflict(conflict)).join('\n');  
        console.log("  " + results);
    }
    return results;
}

function formatConflict(conflict){
    /*
    var exampleSystemConflicts = [ { "type": "war", "status": "active",
    "faction1": { "faction_id": "5bd4ba376089225b6838f554",
        "name": "Anti Xeno Initiative", "name_lower": "anti xeno initiative", "station_id": "5c9626cf07dcf10d3e92a783",
        "stake": "Omega Prospect", "stake_lower": "omega prospect",
        "days_won": 1
    },
    "faction2": { "faction_id": "59e7a567d22c775be0fe03ba",
        "name": "Cooper Research Associates", "name_lower": "cooper research associates", "station_id": null,
        "stake": "", "stake_lower": "",
        "days_won": 0
    }}];
    */
    var faction1Name = utils.abbrieviate(conflict.faction1.name); 
    var faction2Name = utils.abbrieviate(conflict.faction2.name);
    var faction1Stake = (conflict.faction1.stake) ? conflict.faction1.stake : "None";
    var faction2Stake = (conflict.faction2.stake) ? conflict.faction2.stake : "None";

    //var faction1StakeView ="Stake " + faction1Name + ": " + faction1Stake
    //var faction2StakeView ="Stake " + faction2Name + ": " + faction2Stake
    var conflictStatusAndType = (conflict.status.length > 0)? conflict.status + " " + conflict.type : conflict.type;

    var result = "\tConflict (" + conflictStatusAndType + "): " +
        faction1Name + " (" + faction1Stake + ")" +
        " **" + conflict.faction1.days_won + " : " + conflict.faction2.days_won + "** " +
        faction2Name + " (" + faction2Stake + ")";
    return result;
}

function formatInfluenceTrend(infDeltaValue){
    var result = "";
    
    var inf_e = "≈";
    var inf_u = "▲"; //message.client.emojis.cache.find(emoji => emoji.name === "inf_u");
    var inf_d = ":small_red_triangle_down:"; //"▼"; //message.client.emojis.cache.find(emoji => emoji.name === "inf_d");

    if (infDeltaValue < 0) {
        result = `${inf_d}`;
    } else if (infDeltaValue > 0){
        result = `${inf_u}`;
    } else {
        result = `${inf_e}`;  
    }
    return result;
}

function calculateFactionInfluenceDelta(presence, history){
    
    var presenceName = presence["system_name"]
    var currentInfluence = presence["influence"];

    var candidates = history.filter(historyItem => historyItem["system"] === presenceName);
    var candidate = candidates[0];
    var oldInfluence = (!candidate) ? 0 : candidates[0]["influence"];
    
    //console.log("  searching historical data for: " + presenceName);
    //console.log("    current           influence: " + currentInfluence);
    //console.log("    first candidate's influence: " + candidates[0]["influence"]);
    
    var result = (currentInfluence - oldInfluence);
    return result;
}
