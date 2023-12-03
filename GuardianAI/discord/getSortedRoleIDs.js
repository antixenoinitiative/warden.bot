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
      message.guild.roles.cache.forEach(() => {size+=1});
      size-=1 // removing the count for @everyone from size
      message.guild.roles.cache.forEach((role) => {
        if (role.name != "@everyone" && role.name != "@here") {
          roleNameObj[size - parseInt(role.rawPosition)] = [role.id,`<@&${role.id}>`];
        }
      });
      return roleNameObj
    } catch (err) {
      console.log(err);
    }
  },
};
