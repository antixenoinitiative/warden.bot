const Discord = require("discord.js");

module.exports = {
    name: 'lfw',
    description: 'Gives you a role pingable by others if you are looking for group',
    usage: 'your platform',
    permlvl: 0,
    execute(message, args) {
        let member = message.member;
        const pc = "879733414738157629";
        const ps;
        const xb;
        const lfwPC = "879733536943407157";
        const lfwPS;
        const lfwXB;
        let platCount;
        // member.roles.remove(lfwPC);
       
        if (member._roles.find(role => role == pc) == undefined || member._roles.find(role => role == ps) == undefined || member._roles.find(role => role == xb) == undefined) {
            if (args[0] == "") {
                //counts number of platforms user is on
                if (member._roles.find(role => role == pc) != undefined) {
                    platCount++
                }
                if (member._roles.find(role => role == ps) != undefined) {
                    platCount++
                }
                if (member._roles.find(role => role == xb) != undefined) {
                    platCount++
                }
                //checks if user is on multiple platforms
                if (platCount > 1) {
                    throw("Please specify your desired platform")
                    break;
                }
                
                //gives user appropriate LFW role
                //PC masterrace
                if (member._roles.find(role => role == pc) != undefined) {
                    member.roles.add(lfwPC);
                    message.channel.send(`${member.nickname} is now <@&879733536943407157>`);
                }
                //PS
                if (member._roles.find(role => role == ps) != undefined) {
                    member.roles.add(lfwPS);
                    message.channel.send(`${member.nickname} is now <@&ps>`);
                }
                //Xbox
                if (member._roles.find(role => role == xb) != undefined) {
                    member.roles.add(lfwPS);
                    message.channel.send(`${member.nickname} is now <@&xb>`);
                }
            }
            
        }
    }
}

