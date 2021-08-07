const { getRoleID } = require("../discord/getRoleID");

module.exports = {
	name: 'roleinfo',
	description: 'Get information about a role',
    format: '"role name"',
	permlvl: 0,
	restricted: false,
	execute(message, args) {
		try {
            role = args[0].toLowerCase().replace(/["'”`‛′’‘]/g,"").trim()
            if(role.length < 2)
            {
                throw("Role name too short. Add more letters to role names for best results.")
            }
            roleID = getRoleID(message,args[0])
            actualrole = message.guild.roles.cache.find(role => role.id == roleID).name
            message.channel.send(`input = ${role}, bestMatch role = ${actualrole}, bestMatch role id = ${roleID}`)
        }
        catch(err)
        {
            message.channel.send(`Err ${err}`)
        }
	},
};
