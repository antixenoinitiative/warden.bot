const db = require("../../db/index");
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName(`endevent`)
    .setDescription(`Delete an event"`)
    .addStringOption(option => option.setName('id')
		.setDescription('ID of the Event to delete, provided when the event is made.')
		.setRequired(true)),
    usage: '"event ID"',
    args: true,
    permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
    hidden: false,
    async execute (message, args) {
        try {   
            await db.query("DELETE FROM events WHERE event_id = $1", [args[0].value])
            message.reply({ content: "Event Deleted ‼"})
        } catch {
            message.reply({ content: "Sorry, could not delete the event, please contact staff."})
        }
    }
}