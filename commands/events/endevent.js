const db = require("../../db/index");

module.exports = {
    name: "endevent",
    description: "Delete an event",
    usage: '"event ID"',
    args: false,
    permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
    hidden: true,
    async execute (message, args) {
        try {   
            await db.query("DELETE FROM events WHERE event_id = $1", [args[0]])
            message.reply({ content: "Event Deleted ‼"})
        } catch {
            message.reply({ content: "Sorry, could not delete the event, please contact staff."})
        }
    }
}