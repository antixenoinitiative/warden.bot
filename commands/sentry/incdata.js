const db = require('../../db/index');
const Discord = require("discord.js");
const { SlashCommandBuilder } = require('@discordjs/builders');

/**
     * Returns Incursions active on input date
     * @author   (Mgram) Marcus Ingram
     * @param    {String} date          Input date format "YYYY-MM-DDTHH:MM:SS"
     * @return   {Object}               Returns Incursions Objects
     */
async function getIncursionsByDate(date) {
	let timestamp = Date.parse(date);
	let week = db.getWeek(timestamp);
	let incursions = await db.query(`SELECT * FROM incursionV2 WHERE week = $1`, [week.week]);
	let system_ids = incursions.rows.map(item => item.system_id).filter((value, index, self) => self.indexOf(value) === index)
	let systems = [];
	for (let i = 0; i < system_ids.length; i++) {
		let sysname = await db.query(`SELECT name FROM systems WHERE system_id = '${system_ids[i]}'`);
		systems.push(sysname.rows[0].name);
	}
	return systems;
}

/**
 * Joins consective numbers in array, eg: [128,129] becomes [ "128-129" ]
 * #5 Currently only handles two consecutive number, should be able to handle longer ranges.
 * @param 	{*} arr 		Input array of numbers
 * @returns	{Array}			Joined array
 */
function collapseSequences(arr) {

	Array.prototype.myJoin = function(seperator,start,end){
		if(!start) start = 0;
		if(!end) end = this.length - 1;
		end++;
		return this.slice(start,end).join(seperator);
	};

	let ranges = []
    for (let i = 0; i < arr.length; i++) {
		if (arr[i] == (arr[i+1] - 1)) {
			ranges.push(arr.myJoin("-",i,i+1))
			i++;
		} else ranges.push(arr[i]);
	}
	console.log(ranges);
	return ranges;
}

async function getSysByWeek(message, param) {
	try {
		let id = await db.getSysID(param);
		let data = await db.query(`SELECT week FROM incursionV2 WHERE system_id = $1`, [id]);
		if (data.rowCount == 0) {
			return message.reply({ content: `No incursions found for ${param} 🙁` });
		}
		let incArray = []
		for (let i = 0; i < data.rows.length; i++) {
			incArray.push(data.rows[i].week);
		}
		console.log(incArray)
		let rangeArray = collapseSequences(incArray) // Collapse array into ranges

		const returnEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
		.setTitle("**Incursion History**")
		.setDescription(`Found **${data.rows.length}** incursions for ${param}`);
		for (let i = 0; i < rangeArray.length; i++) {
			//let date = weekdata.find(list => list.week === data.rows[i].week).first
			//console.log(date);
			returnEmbed.addField(`Incursion #${i+1}`, `Week: ${rangeArray[i]}`);
		}
		message.reply({ embeds: [returnEmbed.setTimestamp()] })
	} catch (err) { console.error(err) }
}

async function getIncByWeek(message, param) {
	try {
		let data = await db.query(`SELECT system_id FROM incursionV2 WHERE week = $1`, [param]);
		if (data.rowCount == 0) {
			return message.reply(`No incursions found on Week ${param} 🙁`);
		}
		console.log(data);

		const returnEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
		.setTitle("**Incursion History**")
		.setDescription(`Found **${data.rows.length}** incursions for week ${param}`);
		for (let i = 0; i < data.rows.length; i++) {
			let name = await db.query(`SELECT name FROM systems WHERE system_id = $1`, [data.rows[i].system_id]);
			returnEmbed.addField(`Incursion #${i+1}`, name.rows[0].name);
		}
		message.reply({ embeds: [returnEmbed.setTimestamp()] })
	} catch (err) { console.error(err) }
}

module.exports = {
	data: new SlashCommandBuilder()
	.setName('incdata')
	.setDescription('Request data about incursions')
	.addStringOption(option => option.setName('search-type')
		.setDescription('What data type is input')
		.setRequired(true)
        .addChoice('System Name', 'system')
		.addChoice('Week Number', 'week')
        .addChoice('Date', 'date'))
	.addStringOption(option => option.setName('search-term')
		.setDescription('name/week/YYYY-MM-DD')
		.setRequired(true)),
	permlvl: 0,
	execute(message, args) {
		const type = args[0].value;
		const param = args[1].value;


		switch (type) {
			case "system":
				if (param === undefined) { return message.reply({ content: `Please include a system name. Use quotes if it contains spaces, eg: "HR 1185"` }) }
				return getSysByWeek(message, param)
			case "week":
				if (param === undefined) { return message.reply({ content: `Please include a Week Number, eg: "177"` }) }
				return getIncByWeek(message, param)
			case "date":
				if (param === undefined) { return message.reply({ content: `Please include a date, eg: "YYYY-MM-DD"` }) }
				try {
					getIncursionsByDate(param).then((res) => {
						if (res.length == 0) {
							return message.reply({ content: `No incursions found on ${param} 🙁` });
						}
						const returnEmbed = new Discord.MessageEmbed()
						.setColor('#FF7100')
						.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
						.setTitle("**Incursion History**")
						.setDescription(`Found **${res.length}** incursions for the week of "${param}"`)
						for (let i = 0; i < res.length; i++) {
							returnEmbed.addField(`Incursion #${i+1}`,res[i]);
						}
						message.reply({ embeds: [returnEmbed.setTimestamp()] })
					})
				} catch (err) {
					message.reply({ content: "Something went wrong, please ensure the date format is correct 'YYYY-MM-DD'" })
				}
		}
	},
};
