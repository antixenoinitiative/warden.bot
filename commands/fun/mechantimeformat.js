//one mechan (M) equal 864 s

const Discord = require("discord.js");
module.exports = {
    name: 'mtos',
    description: 'how much mechans in given time and vice versa',
    format: '[*h](;:,.)[*m](;:,.)[*s]|[*M]',
    permlvl: 0,
    restricted: false,
    execute(message, args) {
        try {
            args = args [0] 
            sourceUnits = ""
            var inputTimeList = []
            inputTimeList = args.split(':')
            var timeObject = {}
            if (args.includes("s")) {
                var sourceUnits = "standartTime"
                //assumininputg that is usual time, which needed to be converted to mechan
                for (var i = 0; i < inputTimeList.length; i++) {
                    timeObject[inputTimeList[i].replace(/\d/g, '')] = parseInt(inputTimeList[i].replace(/\D/g, ''), 10)  //assigning to key named after time unit given time
                }
                var seconds = 0
                var wtf = typeof timeObject["h"]   
                if (typeof timeObject["h"] !=="undefined")
                {
                    seconds = seconds + timeObject["h"] * 60 * 60}

                if (timeObject["m"] !==undefined){seconds = seconds + timeObject["m"] * 60}
                if (timeObject["s"] !==undefined){seconds = seconds + timeObject["s"]}
                //var seconds = timeObject["h"] * 60 * 60 + timeObject["m"] * 60 + timeObject["s"]
                var mechan = seconds / 864
                var response = "Converted time to mechans, result is:" 
                var response_part2 = mechan
            }
            if (args.includes("M"))
            {
                sourceUnits = "mechan"
                //assuming that is mechan units, which needed to be converted to standart time
                for (var i = 0; i < inputTimeList.length; i++) {
                    timeObject[inputTimeList[i].replace(/[\.\d]/g, '')] = parseInt(inputTimeList[i].replace(/[^0-9\.]/g, ''), 10) //assigning to key named after time unit given time
                }
                var mechan = timeObject["M"]
                //new Date(SECONDS * 1000).toISOString().substr(11, 8)
                var seconds = mechan * 864
                //var full_date = new Date(seconds * 1000)//.toISOString().substr(11, 8)
                //full_date.setSeconds(seconds)
                var hours = Math.floor(seconds / 3600 );
                var minutes = Math.floor(seconds % 3600 / 60 );
                var seconds = Math.floor(seconds% 3600 % 60 );
                var response = "Converted mechans to standart time, result is:"
                var response_part2 = ""
                if (hours != 0) { response_part2 = response_part2 + hours + "hour(s) " }
                if (minutes != 0) { response_part2 = response_part2 + minutes + "minute(s) " }
                if (seconds != 0) { response_part2 = response_part2 + seconds + "second(s) " }
            }
            const returnEmbed = new Discord.MessageEmbed()
                .setColor('#FF7100')
                .setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
                .setTitle("**Conveerter**")
            returnEmbed.addField(response, response_part2 + "\.",true)
            message.channel.send(returnEmbed.setTimestamp());
        } catch (err) {
            message.channel.send(`Something went wrong: -mtos ${args}: result ${response} \n ERROR: ${err}`)
        }
    },
};
