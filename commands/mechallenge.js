module.exports = {
	name: "mechallenge",
	description: "Challenges @user to do the Mechan Challenge! :smiling_imp:",
	usage: '"@user"',
	permlvl: 1, // 0 = Everyone, 1 = Mentor, 2 = Staff
 	restricted: false,
	args: true,
  	execute(message, args) {
    	let challenges = [
      		`Do a Multigoid kill assigned by EuanAB`,
      		`Do an E-rated fight assigned by Mechan`,
      		`Do speed kill as commanded by Lapp0`,
      		`Help Xarionn with his excruciating research projects`,
      		`Do weekly updates marathon review like Avasa used do to`,
    	];
		try 
		{
    		if (args[0] == "@everyone" || args[0] == "@here") 
			{
				throw("You have @ an illegal role.")
			}
			if(message.mentions.members.first() == undefined)
			{
				throw("You have @ a rank or `@user` is empty!")
			}
			else {
				let challenge = parseInt(Math.floor(Math.random() * challenges.length));
				let challenged = message.mentions.members.first();
				message.channel.send(
					`${message.member} has publicly challenged ${challenged} to participate in the mechallenge and test their skill against the very best CMDRs!\n\nShould ${challenged.nickname} not submit an entry in the next two weeks ${challenged.nickname} shall be assigned a challenge! BUT if ${challenged.nickname} beats their current record (or scores at least one point if no record) then it will be ${message.member.nickname} who shall be assigned a challenge!\n\nYour Challenge:\n${challenges[challenge]}\n\nHave fun! :smiling_imp:`
					);
				}
		}
		catch (err) 
		{
			message.channel.send(`Something went wrong!\nERROR: ${err}`);
		}
	},
};
