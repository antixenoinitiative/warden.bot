// const { botIdent } = require('../../../functions');
// const { query } = require(`../../../${botIdent().activeBot.botName}/db/index`);
// const Discord = require("discord.js");

// module.exports = {
// 	data: new Discord.SlashCommandBuilder()
//         .setName(`deletereminder`)
//         .setDescription(`deletes your reminder (use /showreminders to check which id corresponds to which reminder)`)
//     .addIntegerOption(option => option.setName('remid')
//         .setDescription('the id of the reminder')
//         .setRequired(true)),
//             // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
//     permissions: 0,
// 	async execute(interaction) {
//         let reqID = interaction.options.data.find(arg => arg.name === "remid").value; //requested id
//         let discID = interaction.member.id;

//         //let res = await db.queryReminder('SELECT * FROM reminders WHERE discID = $1', [discID])
        
//         let res = await query("SELECT * FROM reminders WHERE discID = $1 AND id = $2", [discID, reqID]); //makes sure the id belongs to the user attempting to delete it
        
//         if (res.rows[0] === undefined) { //checks if the query found an id matching the requested id
//             interaction.reply({content: `The id ${reqID} doesn't match any of your reminder ids`, ephemeral: true});
//             return;
//         }
        
//         let remID = res.rows[0].id;

//         try {
//             query("DELETE FROM reminders WHERE id = $1", [remID]);
//             interaction.reply({content: `Successfully deleted the reminder with the id ${remID}.`, ephemeral: true})
//         }catch (err) {
//             console.log(err);
//             interaction.reply({content: `Something went wrong with the deletion of the reminder`, ephemeral: true});
//         }
// 	}
// };