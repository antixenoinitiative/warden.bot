const { getRoleID } = require("../discord/roles");

module.exports = {
	name: 'roleinfo',
	description: 'Get information about a role',
    format: '"role name"',
	permlvl: 0,
	restricted: false,
	execute(message, args) {
		try {
            let roleinput = args.join(" ");
            let role = getRoleID(message, roleinput);
            message.channel.send(`${role}`)
		} catch (err) {
			message.channel.send("Something went wrong, please you entered a correct term");
            console.log(err);
		}
	},
};
