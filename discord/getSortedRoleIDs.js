const { cleanString } = require("../discord/cleanString")
module.exports = {
      /**
     * Function takes a input string and returns the closest matching Server Role ID
     * @param   {object} message        Pass through the message object
     * @returns {object}                Returns an Object of role id's and their positions IN REVERSE ORDER
     */
  getSortedRoleIDs: (message) => {
    try {
      let roleNameObj = {};
      message.guild.roles.cache.forEach((role) => {
        if (role.name != "@everyone" && role.name != "@here") {
          roleNameObj[70 - parseInt(role.rawPosition)] = [
            role.id,cleanString(role.name)
          ];
        }
      });
      return roleNameObj
    } catch (err) {
      console.log(err);
    }
  },
};