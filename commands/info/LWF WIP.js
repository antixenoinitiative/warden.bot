const Discord = require("discord.js");

// HELLO

module.exports = {
    name: 'lfw',
    description: 'Gives you a role pingable by others if you are looking for group',
    usage: 'your platform',
    permlvl: 0,
    execute(message, args) {
        let member = message.member._roles;
        let platCount;

        const id = {
            "pc": "879733414738157629",
            "xb": "",
            "ps": "",
            "pclfw": "879733536943407157",
            "pslfw": "",
            "xblfw": ""
        }
        
        if (member.includes(id.pclfw) || member.includes(id.pslfw) || member.includes(id.xblfw)) {
            message.member.roles.remove(id.pclfw)
            message.member.roles.remove(id.pslfw)
            message.member.roles.remove(id.xblfw)
            message.reply({ content: "Removed LFW Role" });
        }

        if (args[0] === "") {
            for (let role of member) {
                if (role === id.pc) { platCount++; }
                if (role === id.ps) { platCount++; }
                if (role === id.xb) { platCount++; }
            }
            if (platCount != 1) {
                return "Please specify a platform."
            }

            for (let role of member) {
                switch (role) {
                    case id.pc:
                        message.member.roles.add(id.pclfw)
                        message.reply({ content: `${message.author.nickname} is now <@${id.pclfw}>` })
                        break;
                    case id.ps:
                        message.member.roles.add(id.pslfw)
                        message.reply({ content: `${message.author.nickname} is now <@${id.pslfw}>` })
                        break;
                    case id.xb:
                        message.member.roles.add(id.xblfw)
                        message.reply({ content: `${message.author.nickname} is now <@${id.xblfw}>` })
                        break;
                }
            }
        }

        switch (args[0]) {
            case "pc":
                message.member.roles.add(id.pclfw)
                break;
            case "ps":
                message.member.roles.add(id.pslfw)
                break;
            case "xb":
                message.member.roles.add(id.xblfw)
                break;
        }
    }
}

