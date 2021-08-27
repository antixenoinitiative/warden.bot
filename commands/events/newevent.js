const moment = require("moment");
const db = require("../../db/index");
const Discord = require("discord.js");
const config = require('../../config.json');

module.exports = {
    name: "newevent",
    description: "Create a new event",
    usage: '"name" "description" "DD-MM-YYYY hh:mm"',
    args: true,
    permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
    hidden: false,
    async execute (message, args) {
        let eventName = args[0].replaceAll('"', '')
        let eventDesc = args[1].replaceAll('"', '')
        let eventTime;
        let formats = [ "YYYY-MM-DD hh:mm", "DD-MM-YYYY hh:mm", "DD/MM/YYYY hh:mm" ];
        if (moment(args[2].replaceAll('"', ''),formats).isValid()) {
            eventTime = moment(args[2],formats);
        }

        const getRandomString = (length) => {
            var randomChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            var result = '';
            for ( var i = 0; i < length; i++ ) {
                result += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
            }
            return result;
        }

        let eventKey = getRandomString(10);

        const eventEmbed = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setAuthor(`The Anti-Xeno Initiative`, "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
		.setTitle(`${eventName}`)
		.setDescription(`${eventDesc}\n\n Event Date: ${eventTime.format()}`)

        const row = new Discord.MessageActionRow()
        .addComponents(new Discord.MessageButton().setCustomId(`event-${eventKey}-enroll`).setLabel('Sign Up').setStyle('SUCCESS'),)
        .addComponents(new Discord.MessageButton().setCustomId(`event-${eventKey}-leave`).setLabel('Leave').setStyle('DANGER'),)

        let embed;
        if (config.eventchannelid !== undefined) {
            embed = message.guild.channels.cache.find(x => x.id === config.eventchannelid).send({ embeds: [eventEmbed], components: [row] })
        } else {
            console.warn("The environment variable LOGCHANNEL is not defined.") 
        }

        try {
            await db.query("INSERT INTO events(event_id, embed, name, description, creator, date) VALUES($1, $2, $3, $4, $5, $6)", [eventKey, embed, eventName, eventDesc, message.author.id, eventTime]);
            message.reply({ content: `Event Created Successfully, ID: ${eventKey}`});
        } catch (err) {
            message.reply({ content: `Something went wrong saving the event, please try again or contact staff`});
            console.log(err);
        }
    }
}
