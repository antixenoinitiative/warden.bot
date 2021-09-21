/**
 * /system
 * The command utilizes a http://elitebgs API endpoint to show detailed information about 
 * the system state and conflict details of the given system.
 * 
 * @see <a href="https://elitebgs.app/api/ebgs/v5/systems">https://elitebgs.app/api/ebgs/v5/systems</a>
 * @author F0rd Pr3f3ct (@FPr3f3ct)
 */
 const { SlashCommandBuilder } = require("@discordjs/builders");
 const fetch = require("node-fetch");
 const { systemURL, dateFormatPattern } = require("../../config.json");
 const moment = require("moment");
 const utils = require("./commons/utils.js");
 
 module.exports = {
     data: new SlashCommandBuilder()
     .setName("system")
     .setDescription("Shows detailed information about the system's state and conflict details.")
     .addStringOption(option => option.setName("system")
        .setDescription(`The system's name. You can use "/whereis <faction>", to get a list of systems.`)
        .setRequired(true)),
     permissions: 0,
     execute (interaction) {
        var systemOption = interaction.options.getString("system");
        console.log("SystemOption: " + systemOption);

        var systemName = systemOption.split(" ").join("%20");
        var fetchURL = `${systemURL}?name=${systemName}`;
        
        console.log("GET " + fetchURL);
        
        fetch(fetchURL)
        .then(res => res.json() )
        .then(data => { 
            
            if(!data["docs"] || data["docs"].length === 0) {
                var notFoundMessage = 'Sorry, no system found by the name "' + systemOption + '".';
                console.log(notFoundMessage);
                return notFoundMessage;
            } 

            var doc = data["docs"][0];
            var name = doc["name"];
            var reportTime = moment().utc().format(dateFormatPattern) + " UTC";
            var updatedAt = doc["updated_at"];
            var state = doc["state"];
            var conflicts = doc["conflicts"];
            var conflictsFormatted = (!conflicts || conflicts.length === 0) ? "" : "Conflicts: \n" + formatConflicts(conflicts);

            var result = "There is *" + state + "* in " + name + ".\n" +
                "Report time: " + reportTime + "\n" +
                "System updated: " + moment(updatedAt).fromNow() + "\n" +
                "\n" +
                conflictsFormatted;
            
            return result;
        })
        .then(result => interaction.reply({ content: result }));
	}
};

function formatConflicts(conflicts){
    var result = "";
    //if (!conflicts || conflicts.length === 0) return "None";
    
    //    conflicts = conflicts.sort(utils.dynamicsort("status", "desc"));
    conflicts.forEach(conflict => {
    /**
     *  {  "type": "war", "status": "active",
          "faction1": {
            "name": "Merope Expeditionary Fleet",
            "stake": "Darnielle's Progress",
            "days_won": 1
          "faction2": {
            "name": "Hagglebeard's Heroes",
            "stake": "Obsidian Orbital",
            "days_won": 1
     */
        var type = conflict["type"];
        var status = conflict["status"];

        var faction1 = conflict["faction1"]
        var f1Name = faction1["name"];
        var f1NameShort = utils.abbrieviate(f1Name);
        var f1stake = faction1["stake"];
        var f1DaysWon = faction1["days_won"];
         
        var faction2 = conflict["faction2"]; 
        var f2Name = faction2["name"];
        var f2NameShort = utils.abbrieviate(f2Name);
        var f2stake = faction2["stake"];
        var f2DaysWon = faction2["days_won"];
        
        result += "Type: " + status + " " + type + "\n" +
            "Parties: " +
            f1Name + "(" + f1NameShort + ") vs " +
            f2Name + "(" + f2NameShort + "): " + f1DaysWon + " - " + f2DaysWon + "\n" +
            "Stakes: " + 
            f1NameShort + ":" + utils.isNoneOrEmpty(f1stake) + ", " +
            f2NameShort + ":" + utils.isNoneOrEmpty(f2stake) + "\n";
    });
    return result;
}
