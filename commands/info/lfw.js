module.exports = {
    name: 'lfw',
    description: 'Gives you a role pingable by others if you are looking for group',
    usage: '"pc/ps/xb"',
    permlvl: 0,
    async execute(message, args) {
        let member = message.member._roles;
        let platCount = 0;
        const id = {
            "pc": "428260067901571073",
            "xb": "533774176478035991",
            "ps": "428259777206812682",
            "pclfw": "602937807991865383",
            "pslfw": "602939344143122557",
            "xblfw": "602939699685752833"
        }

        let allowedChannels = [ "380247203794518027", "380467558110855173", "380467652696735744" ]
        console.log(message.channelId);
        if (!allowedChannels.includes(message.channelId)) { return }

        function announce(newPlatform) {
            let lfwString = ""
            member = message.member._roles
            member.push(newPlatform)
            if (member.includes(id.pclfw)) { lfwString += `<@&${id.pclfw}>`; }
            if (member.includes(id.pslfw)) { lfwString += `<@&${id.pslfw}>`; }
            if (member.includes(id.xblfw)) { lfwString += `<@&${id.xblfw}>`; }
            message.reply({ content: `<@${message.author.id}> is now ${lfwString}`})
        }
        
        if (args[0] === undefined) {
            if (member.includes(id.pclfw) || member.includes(id.pslfw) || member.includes(id.xblfw)) {
                message.member.roles.remove(id.pclfw)
                message.member.roles.remove(id.pslfw)
                message.member.roles.remove(id.xblfw)
                message.reply({ content: `<@${message.author.id}> is no longer looking for Wing` });
                return;
            }
        }

        if (args[0] === undefined) {
            for (let role of member) {
                if (role === id.pc) { platCount++; }
                if (role === id.ps) { platCount++; }
                if (role === id.xb) { platCount++; }
            }
            if (platCount != 1) {
                throw `Please specify a platform: ${this.usage}`;
            }

            for (let role of member) {
                switch (role) {
                    case id.pc:
                        await message.member.roles.add(id.pclfw)
                        announce(id.pclfw)
                        break;
                    case id.ps:
                        await message.member.roles.add(id.pslfw)
                        announce(id.pslfw)
                        break;
                    case id.xb:
                        await message.member.roles.add(id.xblfw)
                        announce(id.xblfw)
                        break;
                }
            }
            return;
        }

        switch (args[0]) {
            case "pc":
                await message.member.roles.add(id.pclfw)
                announce(id.pclfw)
                break;
            case "ps":
                await message.member.roles.add(id.pslfw)
                announce(id.pslfw)
                break;
            case "xb":
                await message.member.roles.add(id.xblfw)
                announce(id.xblfw)
                break;
        }
    }
}

