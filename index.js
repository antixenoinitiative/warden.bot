/**
* AXI Sentry is a application which manages Thargoid Incursions via a database and discord bot which listens and interfaces with EDDN.
* @author   CMDR Mgram, CMDR Airom
*/

//------------------ DEV SWITCHES ------------------
// To enable or disble components for testing purposes
const enableListener = 0; // Set to 0 to disable listener from running
const enableDiscordBot = 1; // Set to 0 to disable discord bot from running
const enableAPI = 0; // Set to 0 to disable API from running
//--------------------------------------------------

require("dotenv").config();
const zlib = require("zlib");
const fs = require('fs');
const Discord = require("discord.js");
const { Pool } = require('pg');
const zmq = require("zeromq");
const api = require('express')();
const path = require('path');
const db = require('./db/index');
const endpoint = require('./api/index');

// Global Variables
const SOURCE_URL = 'tcp://eddn.edcd.io:9500'; //EDDN Data Stream URL
const targetAllegiance = "Thargoid";
const targetGovernment = "$government_Dictatorship;";
const prefix = "-"
let msg;
let watchlist;

// Discord client setup
const discordClient = new Discord.Client()
discordClient.commands = new Discord.Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js')); //commands stored in subfolders and imported here
for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	// set a new item in the Collection
	// with the key as the command name and the value as the exported module
	discordClient.commands.set(command.name, command);
}

// Generate Google Key from ENV varaiables then Connect Google Client
const dict = `{
  "type": "service_account",
  "project_id": "axi-sentry",
  "private_key_id": "${process.env.GOOGLEKEYID}",
  "private_key": "${process.env.GOOGLEKEY}",
  "client_email": "sentry@axi-sentry.iam.gserviceaccount.com",
  "client_id": "105556351573320071528",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/sentry%40axi-sentry.iam.gserviceaccount.com"
}`;
const privateKey = JSON.parse(dict);
const vision = require("@google-cloud/vision");
const googleClient = new vision.ImageAnnotatorClient({ credentials: privateKey, });

//Uncomment if using your own cloud API endpoint
/*
const vision = require("@google-cloud/vision")
const googleClient = new vision.ImageAnnotatorClient({
	keyFilename: "./originalkey.json",
})*/

// Database Client Config
const pool = new Pool({
  user: process.env.DBUSER,
  host: process.env.DBHOST,
  database: process.env.DBDATABASE,
  password: process.env.DBPASSWORD,
})


// Star System processing logic
async function processSystem(msg) {
  const { StarSystem, timestamp, SystemAllegiance, SystemGovernment } = msg.message;
  let date = new Date();
  let time = date.getTime(timestamp);

  if (SystemAllegiance != undefined && time >= Date.now() - 86400000) {

    id = await db.getSysID(StarSystem);

    if (watchlist.includes(StarSystem)) { // Check in watchlist
      if (SystemAllegiance == targetAllegiance && SystemGovernment == targetGovernment) { // Check if the system is under Incursion
        db.addIncursions(id,time);
        console.log(`Incursion Logged: ${StarSystem}`);
        watchlist = await db.getWatchlist(); // Refresh the watchlist with the new systems to monitor

      } else {
        db.setStatus(StarSystem,0);
        console.log(`${StarSystem} removed from Watchlist because alli = [${SystemAllegiance}], gov = [${SystemGovernment}]`)
        watchlist = await db.getWatchlist();
      }

    } else { // Not in watchlist
      if (SystemAllegiance == targetAllegiance && SystemGovernment == targetGovernment) { // Check if the system is under Incursion
        if (id == 0) { // Check if system is NOT in DB
          db.addSystem(StarSystem).then((res) => {
            db.addIncursions(res,time);
          });

        } else {
          db.setStatus(StarSystem, 1);
          db.addIncursions(id,time);
        }
        console.log(`System Logged: ${StarSystem}`);
        watchlist = await db.getWatchlist();
      }
    }
  }
}

// Sentry Listener
async function run() {
  const sock = new zmq.Subscriber;

  watchlist = await db.getWatchlist();

  sock.connect(SOURCE_URL);
  sock.subscribe('');
  console.log("[✔] EDDN Listener Connected: ", SOURCE_URL);

  // Data Stream Loop
  for await (const [src] of sock) { // For each data packet
    msg = JSON.parse(zlib.inflateSync(src));
    processSystem(msg);
  }
}

// API Code
if (enableAPI == 1) {
  api.listen(process.env.PORT,() => {
    console.log('[✔] Sentry API Operational');  // Upon a successful connection will log to console
  });
} else { console.error(`WARN: API Disabled`)}

api.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, '/dist/index.html'));
});
api.get('/styles.css', function(req, res) {
  res.sendFile(path.join(__dirname, '/dist/styles.css'));
});

api.get('/incursionshistory', async function(req, res) {
  const { rows } = await db.query(
    `SELECT incursions.inc_id,systems.system_id,systems.name,incursions.time
     FROM incursions
     INNER JOIN systems
     ON incursions.system_id=systems.system_id;`
  );
  res.json(endpoint.Response(rows))
  },
);

api.get('/incursions', async function(req, res) {
  const { rows } = await db.query(`SELECT * FROM systems WHERE status = '1'`);
  res.json(endpoint.Response(rows))
  },
);

api.get('/systems', async function(req, res) {
  const { rows } = await db.query(`SELECT * FROM systems`);
  res.json(endpoint.Response(rows))
  },
);

api.get('/presence', async function(req, res) {
  const { rows } = await db.query(`SELECT systems.name,presence.presence_lvl,presence.time
  FROM presence
  INNER JOIN systems
  ON presence.system_id=systems.system_id;`);
  res.json(endpoint.Response(rows))
  },
);

//Discord client
const incursionsEmbed = new Discord.MessageEmbed()
	.setColor('#FF7100')
	.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
	.setTitle("**Defense Targets**")
let messageToUpdate
discordClient.once("ready", () => {
  console.log(`[✔] Discord bot Logged in as ${discordClient.user.tag}!`);
	discordClient.guilds.cache.get("380246809076826112").channels.cache.get("869030649959428166").messages.fetch("869034577119809577").then(message =>{
		messageToUpdate = message
		const currentEmbed = message.embeds[0]
		incursionsEmbed.description = currentEmbed.description
		currentEmbed.fields.forEach((field) => {
			console.log(field)
			incursionsEmbed.addField(field.name, field.value)
		})
	}).catch(err => {
		console.log(err)
	})
	// discordClient.guilds.cache.get("380246809076826112").channels.cache.get("869030649959428166").send(incursionsEmbed)
})

discordClient.on('message', message => {
	if (!message.content.startsWith(prefix) || message.author.bot) return;

	const args = message.content.slice(prefix.length).trim().split(/ +/);
	const commandName = args.shift().toLowerCase();

	//checks if command exists, then goes to non-subfiled commands
	if (!discordClient.commands.has(commandName)) {
		if (message.content === `${prefix}ping`) {
			message.channel.send("Pong")
		}

		if (message.content === `${prefix}getactive`) { // This command cannot be moved to a command file due to dependancies.
			db.getIncList().then((list) => {
				const returnEmbed = new Discord.MessageEmbed()
            .setColor('#FF7100')
						.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
						.setTitle("**Active Incursions**")
						.setDescription("Current systems under incursion:")
            console.log(list);
            for (let [system,presence] of list.entries()) {
              console.log(`${system}: ${presence}`)
              returnEmbed.addField(system, db.convertPresence(presence))
            }
						message.channel.send(returnEmbed.setTimestamp())
			});
		}

    if (message.content.startsWith(`${prefix}setpresence`)) { // This command cannot be moved to a command file due to dependancies.
      console.log(typeof args[0] + typeof args[1])
      try {
        db.addPresence(args[0],args[1]);
        message.channel.send("Setting Presence Level")
      } catch {
        message.channel.send("Something went wrong, please ensure the ID is correct")
      }
		}
		return;
	}
  const command = discordClient.commands.get(commandName);

	//checks for proper permissions
	if(command.restricted) {
		if (!message.guild) return;
		const authorPerms = message.channel.permissionsFor(message.author);
		if (!authorPerms || !authorPerms.has(command.permissions)) {
			return message.reply("You don't have permission to use that command!")
		}
	}

  if (command.args && !args.length) {
    let reply = `You didn't provide any arguments, ${message.author}!`;

    if (command.usage) {
      reply = `Expected usage: \`${prefix}${command.name} ${command.usage}\``;
    }

    return message.channel.send(reply);
  }
	try {
		command.execute(message, args, passArray);
	} catch (error) {
		console.error(error);
		message.reply('there was an error trying to execute that command!');
	}
});

/**
* Returns whether or not an attachment is an .jpg or .png
* @author
* @param    {Attachment} msgAttach    Input attachment
* @return   {String}              Returns if the attachment is an image
*/
function attachIsImage(msgAttach) {
  const url = msgAttach.url;
  //True if this url is a png image.
  return url.indexOf("png", url.length - "png".length /*or 3*/) !== -1 || url.indexOf("jpg", url.length - "jpg".length /*or 3*/) !== -1;
}

/**
* Returns formatted incursion text for use in embed
* @author   Airom
* @param    {String} text    Input value of message text
* @return   {String}              Returns the formatted incursion field
*/
function parseIncursionSystems(text) {
  let systemList = text.substring(text.indexOf(":\n") + 2)
  if(systemList.indexOf("have been attacked") != -1) systemList = systemList.substring(0, systemList.indexOf("Starport"))
  systemList = systemList.split("\n")
	// console.log(systemList)
  let returnStr = "\n"
	if(systemList[systemList.length-1] == '') systemList.pop()
  systemList.forEach((item) => {
    const system = item.substring(0, item.indexOf(":"))
    if(system.indexOf("[") != -1) {
      returnStr += "- " + system.substring(1, system.length - 1) + " [" + item.substring(item.indexOf(":") + 2, item.length - 1) + "] <:tharg_r:417424014861008907>\n"
    }
    else {
      returnStr += "- " + system + " [Thargoid presence eliminated] <:tharg_g:417424014525333506>\n"
    }
  })
  return returnStr
}

/**
* Returns formatted damaged starport text for use in embed
* @author   Airom
* @param    {String} text    Input value of message text
* @return   {String}              Returns the formatted station field
*/
function parseDamagedStarports(text) {
  const starportList = text.substring(text.indexOf("Update") + 7).split("\n")
	let returnStr = "The following stations have been attacked and may require assistance:"
	// console.log(starportList)
	for(var i = 1; i < starportList.length - 1; i++) {
		returnStr += "\n- " + starportList[i] + " 🔥"
	}
  return returnStr
}

/**
* Updates or adds a single field to the stored embed and updates the message
* @author   Airom
* @param    {Array} field    {name: nameOfField, value: valueOfField}
*/
function updateEmbedField(field) {
	if(field.name == null) return messageToUpdate.edit(incursionsEmbed.setDescription(field.value).setTimestamp())
	const temp = new Discord.MessageEmbed()
		.setColor('#FF7100')
		.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
		.setTitle("**Defense Targets**")
		.setDescription(incursionsEmbed.description)
	let isUpdated = false
	for(var i = 0; i < incursionsEmbed.fields.length; i++) {
		if(incursionsEmbed.fields[i].name == field.name) {
			if(field.value) {
				temp.addField(field.name, field.value)
			}
			isUpdated = true
			console.log("Updated existing field: " + field.name)
		} else {
			temp.addField(incursionsEmbed.fields[i].name, incursionsEmbed.fields[i].value)
			console.log("Copied existing field: " + incursionsEmbed.fields[i].name)
		}
	}
	if(!isUpdated && field.value){
		temp.addField(field.name, field.value)
		console.log("Added new field: " + field.name)
	}
	incursionsEmbed.fields = temp.fields
	messageToUpdate.edit(incursionsEmbed.setTimestamp())
	console.log(messageToUpdate.embeds[0].fields)
}

// Switch Statements
if (enableDiscordBot == 1) { discordClient.login(process.env.TOKEN) } else { console.error(`WARN: Discord Bot Disabled`)}
if (enableListener == 1) { run(); } else { console.error(`WARN: Sentry Disabled`)}

//Array used to pass variables and functions through the command handler
const passArray = [
	attachIsImage,
	googleClient,
	parseIncursionSystems,
	parseDamagedStarports,
	updateEmbedField
]
