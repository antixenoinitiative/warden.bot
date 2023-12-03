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
            switch(name.toLowerCase())
            {
                case "pc": return '428260067901571073';
                case "xb": return '533774176478035991';
                case "ps": return '428259777206812682';
                case "bgs": case "loyalist": return '712110659814293586';
                case "axi": case "axin": return '848726942786387968';
                default: break;
            }
            let best = compare.findBestMatch(name, roleList);
            return message.guild.roles.cache.find(role => cleanString(role.name) == roleList[best["bestMatchIndex"]]).id.toString()
        } catch (err) {
            console.log(err);
        }
    }
}