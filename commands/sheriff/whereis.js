/**
 * /whereis <faction name>
 * The command utilizes a http://elitebgs API endpoint to get the systems a given faciton is present. 
 * It also lists the current influence value.
 * 
 * @see <a href="https://elitebgs.app/api/ebgs/v5/factions">https://elitebgs.app/api/ebgs/v5/factions</a>
 * @author F0rd Pr3f3ct (@FPr3f3ct)
 */

const Discord = require("discord.js");
const fetch = require("node-fetch");
const { factionURL, dateFormatPattern } = require("../../config.json");
const moment = require("moment");
const utils = require("./commons/utils.js");

module.exports = {
    data: new Discord.SlashCommandBuilder()
        .setName("whereis")
        .setDescription("Shows the presences and influence of a given faction.")
        .addStringOption(option => option.setName("faction")
            .setDescription(`The faction's name. I understand the abbrieviations "AXI" and "XRG".`)
            .setRequired(true)),
    permissions: 0,
    execute (interaction) {
        var factionOption = interaction.options.getString("faction");
        console.log("FactionOption: " + factionOption);
        
        if(factionOption.toLowerCase() === "axi") { factionOption = utils.expand("AXI"); }
        if(factionOption.toLowerCase() === "xrg") { factionOption = utils.expand("XRG"); }

        var factionName = factionOption.split(" ").join("%20");
        var fetchURL = `${factionURL}?name=${factionName}`;
        
        console.log("GET " + fetchURL);
        
        fetch(fetchURL)
        .then(res => res.json() )
        .then(data => { 
            
            if(!data["docs"] || data["docs"].length === 0) {
                var notFoundMessage = 'Sorry, no faction found by the name "' + factionOption + '".';
                console.log(notFoundMessage);
                return notFoundMessage;
            } 

            var doc = data["docs"][0];
            var factionName = doc["name"];
            var reportTime = moment().utc().format(dateFormatPattern) + " UTC";
            var updatedAt = doc["updated_at"];
            var presences = doc["faction_presence"];
            
            var result = "Where is ***" + factionName + "*** present?\n" +
                "Report time: " + reportTime + "\n" +
                "Faction updated: " + moment(updatedAt).fromNow() + "\n" +
                "\n" +
                formatPresences(presences);

            return result;
        })
        .then(result => interaction.reply({ content: result }));
	}
};

function formatPresences(presences){
    var result = "";
    presences = presences.sort(utils.dynamicsort("system_name"));
    presences.forEach(presence => {
        var systemName = presence["system_name"];
        var influence = (presence["influence"] * 100 ).toFixed(2);

        result += "**" + systemName + "** Inf: " + influence + " %\n";
    });
    return result;
}
