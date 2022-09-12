const { SlashCommandBuilder, time } = require('@discordjs/builders');
const { queryWarden } = require('../../db/index');

module.exports = {
	data: new SlashCommandBuilder()
                .setName(`showreminders`)
                .setDescription(`Shows existing reminders`),
	async execute(interaction) {
                let discID = interaction.member.id;

                let res = await queryWarden('SELECT * FROM reminders WHERE discID = $1', [discID])
                
                if (res.rowCount == 0) {
                        interaction.reply({content: "You have no reminders set", ephemeral: true});
                        return;
                }

                let output = `Your reminders are: \n`;
                for (let row = 0; row < res.rowCount; row++) {
                        let timeDiff = new Date(res.rows[row].duetime).getTime() - new Date(Date.now()).getTime();

                        //this feels like such a stupid way to do this but im also stupid so it is what it is
                        //handles the output message containing in how many weeks/days/hours/minutes is the reminder due
                        let replyArray = [];
                        
                        if (timeDiff / 604800000 > 1) {
                                let weeks = parseInt(timeDiff / 604800000);
                                timeDiff %= 604800000;

                                if (weeks == 1) {
                                        replyArray.push(`1 week`);
                                }
                                else {
                                        replyArray.push(`${weeks} week`);
                                }
                        }
                        if (timeDiff / 86400000 > 1) {
                                let days = parseInt(timeDiff / 86400000);
                                timeDiff %= 86400000;

                                if (days == 1) {
                                        replyArray.push(`1 day`);
                                }
                                else {
                                        replyArray.push(`${days} days`);
                                }
                        }
                        if (timeDiff / 3600000 > 1) {
                                let hours = parseInt(timeDiff / 3600000);
                                timeDiff %= 3600000;

                                if (hours == 1) {
                                        replyArray.push(`1 hour`);
                                }
                                else {
                                        replyArray.push(`${hours} hours`);
                                }
                        }
                        if (timeDiff / 60000 > 1) {
                                let mins = parseInt(timeDiff / 60000);
                                timeDiff %= 60000;

                                if (mins == 1) {
                                        replyArray.push(`1 minute`);
                                }
                                else {
                                        replyArray.push(`${mins} minutes`);
                                }
                        }
                        else {
                                replyArray.push(`less than 1 minute`); //idk failsafe i guess
                        }

                        output += 
                        `**${res.rows[row].id}**: ${res.rows[row].memo}\n` + 
                        `**Due in**: ${new Intl.ListFormat('en-GB', {style: 'long', type: 'conjunction'}).format(replyArray)}\n\n`;
                }

                interaction.reply({content: output, ephemeral: true });
	}
};