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
      let size = 0;
      let numroles = message.guild.roles.cache
      for(key in numroles)
      {
        if(numroles.hasOwnProperty(key)) size++;
      }
      console.log(size)
      message.guild.roles.cache.forEach((role) => {
        if (role.name != "@everyone" && role.name != "@here") {
          roleNameObj[size - parseInt(role.rawPosition)] = [
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
