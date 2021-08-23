const Discord = require("discord.js");

module.exports = {
    name: 'lfg',
    description: 'Gives you a role pingable by others if you are looking for group',
    usage: 'your platform',
    permlvl: 0,
    execute(message, args) {
        let member = message.member;
        
        if (member.roles.cache.has(879402667686899802) || member.roles.cache.has(879425356585631744) || member.roles.cache.has(879425453784457227)) {
            if (args == "") {
                var platCount;
    
                //counts number of platforms user has
                if (member.roles.cache.has(428260067901571073)) {
                    platCount++;
                }
                if (member.roles.cache.has(428259777206812682)) {
                    platCount++;
                }
                if (member.roles.cache.has(533774176478035991)) {
                    platCount++;
                }
    
                //checks if user has multiple platforms
                if (platCount > 1) {
                    throw("You are on more that one platform!\nSpecify your platform please.")
                }
    
                //assigns appropriate platform LFW
                //PC
                else if (member.roles.cache.has(428260067901571073)) {
                    member.roles.add(879402667686899802).catch(console.error);
                    message.channel.send(`${member.nickname} is now <@879402667686899802>`);
                }
                //PS
                else if (member.roles.cache.has(428259777206812682)) {
                    member.roles.add(879425356585631744).catch(console.error);
                    message.channel.send(`${member.nickname} is now <@879425356585631744>`);
                }
                //Xbox
                else if (member.roles.cache.has(533774176478035991)) {
                    member.roles.add(879425453784457227).catch(console.error);
                    message.channel.send(`${member.nickname} is now <@879425453784457227>`);
                }
            }
            else if(args == "pc" || "superiorplatform") {
                member.roles.add(879402667686899802).catch(console.error);
                message.channel.send(`${member.nickname} is now <@428260067901571073>`);
            }
            else if(args == "ps" || "ps4" || "ps5") {
                member.roles.add(879425356585631744).catch(console.error);
                    message.channel.send(`${member.nickname} is now <@879425356585631744>`);
            }
            else if(args == "xb" || "xbox") {
                member.roles.add(879425453784457227).catch(console.error);
                message.channel.send(`${member.nickname} is now <@879425453784457227>`);
            }
        }
        else {
            //removes all LFW roles
            member.roles.remove(879402667686899802);
            member.roles.remove(879425356585631744);
            member.roles.remove(879425453784457227);
            message.channel.send(`${member.nickname} is no longer looking for wing.`)
        }

    }
}