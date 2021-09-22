/**
 * /system
 * The command utilizes a http://elitebgs API endpoint to show information about incursions
 * 
 * @see <a href="https://elitebgs.app/api/ebgs/v5/systems?allegiance=thargoid">https://elitebgs.app/api/ebgs/v5/systems?allegiance=thargoid</a>
 * @author F0rd Pr3f3ct (@FPr3f3ct)
 */

const { SlashCommandBuilder } = require("@discordjs/builders");
const fetch = require("node-fetch");
const { systemURL } = require('../../config.json');
const { isNoneOrEmptyArray } = require("./commons/utils");

module.exports = {
    data: new SlashCommandBuilder()
    .setName("incursion")
    .setDescription("Shows systems which are affected by an incursion."),
    permissions: 0,
    execute (interaction) {
        generateReport()
        .then(report => interaction.reply({ content: report.header + '\n' + report.body }));
    }
};

function generateReport() {
    //https://elitebgs.app/api/ebgs/v5/systems?allegiance=thargoid
    var url = `${systemURL}?allegiance=thargoid`;
    console.log("GET " + url);
    return fetch(url)
    .then(res => res.json() )
    .then(data => {
        var docs = data["docs"];
        
        var report = {
            header: ":star: Incursion report :star:",
            body: "Currently no incursions detected."
        };

        if( isNoneOrEmptyArray(docs) ) {
            return report;
        }
        
        var systemsInvadedByThargoids = "";
        docs.forEach(doc => {
            var systemName = doc["name"];
            systemsInvadedByThargoids += systemName + ` (Population: ${doc["population"]}, Allegiance: ${doc["allegiance"]})\n`;
        });
        report.body = systemsInvadedByThargoids;
                
        console.log('SystemsInvadedByThargoids: ' + systemsInvadedByThargoids)
        return report;
    });
}

/*
var testDataEmpty = { "docs": [] };
*/
/*
var testData = {
    "docs": [
        {
            "_id": "59f1ae3dd22c775be0ad63f8",
            "__v": 0,
            "allegiance": "thargoid",
            "conflicts": [],
            "controlling_minor_faction": "operation ida",
            "controlling_minor_faction_cased": "Operation Ida",
            "controlling_minor_faction_id": "5b6af33dd1b6a37c3c6ebddc",
            "eddb_id": 24005,
            "factions": [
                {
                    "name": "Anti Xeno Initiative",
                    "name_lower": "anti xeno initiative",
                    "faction_id": "5bd4ba376089225b6838f554"
                },
            ],
            "government": "$government_dictatorship;",
            "name": "HR 1183",
            "name_lower": "hr 1183",
            "population": 1200000,
            "primary_economy": "$economy_industrial;",
            "secondary_economy": "$economy_none;",
            "security": "$system_security_low;",
            "state": "investment",
            "system_address": "271889458340",
            "updated_at": "2021-05-15T12:38:03.000Z",
            "x": -72.875,
            "y": -145.09375,
            "z": -336.96875,
            "name_aliases": []
        },
        {
            "_id": "59f1ae3dd22c775be0ad63f8",
            "__v": 0,
            "allegiance": "thargoid",
            "conflicts": [],
            "controlling_minor_faction": "operation ida",
            "controlling_minor_faction_cased": "Operation Ida",
            "controlling_minor_faction_id": "5b6af33dd1b6a37c3c6ebddc",
            "eddb_id": 24005,
            "factions": [
                {
                    "name": "Anti Xeno Initiative",
                    "name_lower": "anti xeno initiative",
                    "faction_id": "5bd4ba376089225b6838f554"
                },
            ],
            "government": "$government_dictatorship;",
            "name": "Asterope",
            "name_lower": "asterope",
            "population": 12000,
            "primary_economy": "$economy_industrial;",
            "secondary_economy": "$economy_none;",
            "security": "$system_security_low;",
            "state": "investment",
            "system_address": "271889458340",
            "updated_at": "2021-05-15T12:38:03.000Z",
            "x": -72.875,
            "y": -145.09375,
            "z": -336.96875,
            "name_aliases": []
        }]
}*/
