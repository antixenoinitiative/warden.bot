const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
    .setName(`mechallenge`)
    .setDescription(`Challenges @user to do the Mechan Challenge! :smiling_imp:`)
	.addUserOption(option => option.setName('user')
		.setDescription('Mention user to get')
		.setRequired(true)),
	permissions: 1,
	execute(interaction) {
		let challenges = [
			`Do a Multigoid kill assigned by EuanAB`,
			`Do an E-rated fight assigned by Mechan`,
			`Do speed kill as commanded by Lapp0`,
			`Help Xarionn with his excruciating research projects`,
			`Do weekly updates marathon review like Avasa used do to`,
		];
		try
		{
			
			let challenge = parseInt(Math.floor(Math.random() * challenges.length));
			let challenged = interaction.options.data.find(arg => arg.name === 'user').value
			interaction.reply({ content: 
				`${interaction.member} has publicly challenged <@${challenged}> to participate in the mechallenge and test their skill against the very best CMDRs!\n\nShould <@${challenged}> not submit an entry in the next two weeks <@${challenged}> shall be assigned a challenge! BUT if <@${challenged}> beats their current record (or scores at least one point if no record) then it will be ${interaction.member.nickname} who shall be assigned a challenge!\n\nYour Challenge:\n${challenges[challenge]}\n\nHave fun! :smiling_imp:`
			});
		}
		catch (err)
		{
			console.error(err);
			interaction.reply({ content: `Something went wrong!\nERROR: ${err}` });
		}
	},
};
