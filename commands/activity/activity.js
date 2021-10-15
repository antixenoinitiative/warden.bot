const { SlashCommandBuilder } = require('@discordjs/builders');
const Discord = require("discord.js");
const { queryWarden } = require("../../db/index");

async function createRecord(args) {
    let res;
    try {
        res = await queryWarden('INSERT INTO activity(sys_name, density, x_coord, y_coord, date) VALUES($1, $2, $3, $4, $5) RETURNING id',
        [args.system_name, args.nhss_density, args.x_coordinates, args.y_coordinates, args.timestamp])
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
	.setName('activity')
	.setDescription('Thargoid Activity')
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
            .setTitle(`**Thargoid Activity Logged**`)
            .setDescription(`Thargoid NHSS Activity Logged in Database`)
            .addField(`System Name`, `${data.sys_name}`, true)
            .addField(`NHSS Density`, `${decodeDensity(data.density)}`, true)
            .addField(`X,Y Coordinates`, `${data.x_coord},${data.y_coord}`,true)
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
            .setTitle(`**Thargoid Activity Log**`)
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
    }
}