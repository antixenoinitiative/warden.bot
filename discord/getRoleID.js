const compare = require("string-similarity");
const { cleanString } = require("./cleanString");

module.exports = {
    /**
     * Function takes a input string and returns the closest matching Server Role ID
     * @param   {object} message    Pass through the message object
     * @param   {string} name       The Role name you need to check
     * @returns {string}            Returns the Role ID
     */
    getRoleID: (message, name) => {
        try {
        let roleList = []
        message.guild.roles.cache.forEach(role => {
            if (role.name !='@everyone' && role.name != '@here') {
                roleList.push(cleanString(role.name));
            }
        });
        let best = compare.findBestMatch(name, roleList);
        return message.guild.roles.cache.find(role => role.name == roleList[best["bestMatchIndex"]]).id.toString()
        } catch (err) {
            console.log(err);
        }
    }
}