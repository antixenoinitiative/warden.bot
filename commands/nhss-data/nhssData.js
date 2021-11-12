const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");
const { queryWarden } = require("../../db/index");
const fetch = require('node-fetch')

const downloadCsv = async (url) => {
    let data;
    try {
        const target = url; //file
        //const target = `https://SOME_DOMAIN.com/api/data/log_csv?$"queryString"`; //target can also be api with req.query
        
        const res = await fetch(target, {
            method: 'get',
            headers: {
                'content-type': 'text/csv;charset=UTF-8',
                //'Authorization': //in case you need authorisation
            }
        });

        if (res.status === 200) {
            data = await res.text();
        } else {
            return `error`;
        }
        return data;
    } catch (err) {
        console.log(err)
    }
}

async function createRecord(args) {
    let res;
    try {
        res = await queryWarden('INSERT INTO activity(sys_name, density, x_coord, y_coord, dist_merope, date) VALUES($1, $2, $3, $4, $5, $6) RETURNING id',
        [args.system_name, args.nhss_density, args.x_coordinates, args.y_coordinates, parseFloat(args.dist_merope).toFixed(2), args.timestamp])
    } catch (err) {
        console.error(err)
    }
    return res.rows[0].id;
}

async function getRecord(id) {
    let res;
    try {
        res = await queryWarden('SELECT * FROM activity WHERE id = $1',[id])
    } catch (err) {
        console.error(err)
    }
    return res;
}

async function getRecordByName(name) {
    let res;
    try {
        res = await queryWarden('SELECT * FROM activity WHERE sys_name = $1',[name])
    } catch (err) {
        console.error(err)
    }
    let data = res.rows
    return data;
}

async function deleteRecord(id) {
    try {
        await queryWarden('DELETE FROM activity WHERE id = $1',[id])
    } catch (err) {
        return `Record #${id}: Failed to delete, please contact Staff - ERROR: ${err}`
    }
    return `Record #${id}: Deleted Successfully`
}

function decodeDensity(density) {
    switch (density) {
        case "none":
            return "None"
        case "low":
            return "Low (<30)"
        case "average":
            return "Average (30-60)"
        case "high":
            return "High (60-100)"
        case "veryhigh":
            return "Very High (100+)"
    }
}

module.exports = {
    data: new SlashCommandBuilder()
	.setName('nhss-data')
	.setDescription('NHSS Database')
    .addSubcommand(subcommand => subcommand
        .setName('record')
        .setDescription('Record NHSS in a system')
        .addStringOption(option => option.setName('system_name')
            .setDescription('Name of the system')
            .setRequired(true))
        .addStringOption(option => option.setName('nhss_density')
            .setDescription('Approximate NHSS Density')
            .setRequired(true)
            .addChoice('None', 'none')
            .addChoice('Low (<30)', 'low')
            .addChoice('Average (30-60)', 'average')
            .addChoice('High (60-100)', 'high')
            .addChoice('Very High (100+)', 'veryhigh'))
        .addStringOption(option => option.setName('x_coordinates')
            .setDescription('X Coordinates of the System')
            .setRequired(true))
        .addStringOption(option => option.setName('y_coordinates')
            .setDescription('Y Coordinates of the System')
            .setRequired(true))
        .addStringOption(option => option.setName('dist_merope')
            .setDescription('Distance to Merope in LY. Eg: 20.45')
            .setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('fetch')
            .setDescription('Get information about NHSS History')
            .addStringOption(option => option.setName('system_name')
                .setDescription('Name of the system')
                .setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('delete')
            .setDescription('Delete a record from the Database')
            .addIntegerOption(option => option.setName('record_id')
                .setDescription('ID of the Record to Delete')
                .setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('view')
            .setDescription('View the Database')
            .addStringOption(option => option.setName('options')
                .setDescription('How to view the Database')
                .setRequired(true)
                .addChoice('Website', 'web')
                .addChoice('CSV', 'csv')
                .addChoice('JSON', 'json')
                .addChoice('Template', 'template')))
        .addSubcommand(subcommand => subcommand
            .setName('import')
            .setDescription('Import CSV Data, use `/nhss-data view template` for a template file')
            .addStringOption(option => option.setName('csv_url')
                .setDescription('URL to your .csv file, upload to discord for a quick link')
                .setRequired(true))),
	permissions: 0,
	async execute(interaction) {
        let args = {}
        let action = interaction.options.data[0].name
        args.timestamp = Date.now()
        for (let key of interaction.options.data[0].options) {
            args[key.name] = key.value
        }

        if (action === 'record') {
            let id = await createRecord(args)
            let res = await getRecord(parseInt(id))
            let data = res.rows[0]
            const returnEmbed = new Discord.MessageEmbed()
            .setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle(`**NHSS Database Activity Logged**`)
            .setDescription(`Thargoid NHSS Activity Logged in Database`)
            .addField(`System Name`, `${data.sys_name}`, true)
            .addField(`NHSS Density`, `${decodeDensity(data.density)}`, true)
            .addField(`X,Y Coordinates`, `${data.x_coord},${data.y_coord}`,true)
            .addField(`Distance to Merope`, `${data.dist_merope}`,true)
            .addField(`Date Logged`, `<t:${Math.round(parseInt(data.date) / 1000)}>`, true)
            .setFooter(`ID: ${data.id}`)
            interaction.reply({ embeds: [returnEmbed.setTimestamp()] });
        }

        if (action === 'fetch') {
            let data = await getRecordByName(args.system_name)
            if (data.length === 0) {return interaction.reply("Sorry, no data has been recorded for that system yet. Use `/activity record` to be the first")}
            let historyString = ""
            for (let record of data) {
                historyString += `<t:${Math.round(parseInt(record.date) / 1000)}> - ${decodeDensity(record.density)} - ID: ${record.id}\n`
            }

            const returnEmbed = new Discord.MessageEmbed()
            .setColor('#FF7100')
            .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
            .setTitle(`**NHSS Database**`)
            .setDescription(`Thargoid NHSS Activity Log for **${args.system_name}**
            
            ${historyString}`)
            const buttonRow = new Discord.MessageActionRow()
            .addComponents(new Discord.MessageButton().setLabel('View full Database').setStyle('LINK').setURL('https://data.heroku.com/dataclips/nfpuhwvjqsdefzexjgrtcojgjneu'),)
    
            interaction.reply({ embeds: [returnEmbed.setTimestamp()], components: [buttonRow] });
        }
        
        if (action === 'delete') {
            let deleted = await deleteRecord(args.record_id)
            return interaction.reply(`${deleted}`)
        }

        if (action === 'view') {
            const buttonRow = new Discord.MessageActionRow()
            switch (args.options) {
                case "web":
                    buttonRow.addComponents(new Discord.MessageButton().setLabel('View full Database').setStyle('LINK').setURL('https://data.heroku.com/dataclips/nfpuhwvjqsdefzexjgrtcojgjneu'),)
                    break;
                case "csv":
                    buttonRow.addComponents(new Discord.MessageButton().setLabel('Download CSV').setStyle('LINK').setURL('https://data.heroku.com/dataclips/nfpuhwvjqsdefzexjgrtcojgjneu.csv'),)
                    break;
                case "json":
                    buttonRow.addComponents(new Discord.MessageButton().setLabel('Download JSON').setStyle('LINK').setURL('https://data.heroku.com/dataclips/nfpuhwvjqsdefzexjgrtcojgjneu.json'),)
                    break;
                case "template":
                    buttonRow.addComponents(new Discord.MessageButton().setLabel('Download Template CSV').setStyle('LINK').setURL('https://cdn.discordapp.com/attachments/880618814100865083/898426750168612874/importtemplate.csv'),)
                    break;
            }
            interaction.reply({ content: "**NHSS Database**", components: [buttonRow] });
        }

        if (action === 'import') {
            let data = await downloadCsv(args.csv_url)
            if (data === "error") {
                return interaction.reply(`CSV not found. Try uploading the csv file to discord and copying the file link (right click the download button > copy link)`)
            }
            let rowStrings = data.split("\r\n");
            let rows = []
            for (let row of rowStrings) {
                rows.push(row.split(","));
            }
            let sysNameCol = rows[0].indexOf("sys_name")
            let densityCol = rows[0].indexOf("density")
            let distMeropeCol = rows[0].indexOf("dist_merope")
            rows.shift()
            let importedCount = 0;
            interaction.reply(`Uploading Data, this may take a while...`)
            for (let row of rows) {
                if (row[sysNameCol] !== undefined) {
                    args.system_name = row[sysNameCol]
                    args.nhss_density = row[densityCol]
                    args.dist_merope = row[distMeropeCol]
                    args.x_coordinates = "null"
                    args.y_coordinates = "null"
                    args.timestamp = Date.now()
                    await createRecord(args)
                    importedCount++;
                }
            }
            interaction.followUp(`CSV Uploaded successfully, imported ${importedCount} records.`)
        }
    }
}