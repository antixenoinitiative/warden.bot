/**
* AXI Sentry is a application which manages Thargoid Incursions via a database and discord bot which listens and interfaces with EDDN.
* @author   CMDR Mgram, CMDR Airom 
*/

//------------------ DEV SWITCHES ------------------
// To enable or disble components for testing purposes
const enableListener = 1; // Set to 0 to disable listener from running
const enableDiscordBot = 0; // Set to 0 to disable discord bot from running
const enableAPI = 1; // Set to 0 to disable API from running
//--------------------------------------------------

require("dotenv").config();
const zlib = require("zlib");
const fs = require('fs');
const Discord = require("discord.js");
const { Pool } = require('pg');
const zmq = require("zeromq");
const api = require('express')();
const path = require('path');


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
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	// set a new item in the Collection
	// with the key as the command name and the value as the exported module
	discordClient.commands.set(command.name, command);
}

// Generate Google Key File from ENV varaiables then Connect Google Client
var dict = {
  "type": "service_account",
  "project_id": "axi-sentry",
  "private_key_id": process.env.GOOGLEKEYID,
  "private_key": process.env.GOOGLEKEY,
  "client_email": "sentry@axi-sentry.iam.gserviceaccount.com",
  "client_id": "105556351573320071528",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/sentry%40axi-sentry.iam.gserviceaccount.com"
};
var dictstring = JSON.stringify(dict, null, 2);
fs.writeFile("APIKey.json", dictstring, function(err, result) {
  const vision = require("@google-cloud/vision")
  const googleClient = new vision.ImageAnnotatorClient({
    keyFilename: "./APIKey.json",
  })
});

// Database Client Config
const pool = new Pool({ //credentials stored in .env file
  user: process.env.DBUSER,
  host: process.env.DBHOST,
  database: process.env.DBDATABASE,
  password: process.env.DBPASSWORD,
})

// Constructs and returns a SELECT query
async function querySelect (column1, table, column2, value) {
  const client = await pool.connect();
  let res;
  try {
    await client.query('BEGIN');
    try {
      res = await client.query(`
        SELECT ${column1}
        FROM ${table}
        WHERE ${column2} = $1`, [value] //$1 is untrusted and sanitized
      );
      await client.query('COMMIT');
    } catch (err) {
      console.error(err);
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
  return res;
}

/**
* Function adds a Star System to the Database
* @author   (Mgram) Marcus Ingram
* @param    {String} name    Name of the Star System
*/
async function addSystem (name) {
  try {
    pool.query(`INSERT INTO systems(name,status)VALUES($1,'1')`, [name], (err, res) => {});
  } catch (err) {
    console.error(err);
  }
}

/**
* Function adds an Incursion to the Database
* @author   (Mgram) Marcus Ingram
* @param    {Int} system_id     Database ID of the Star System
*/
async function addIncursions (system_id,time) {
  try {
    pool.query(`INSERT INTO incursions(system_id,time)VALUES($1,$2)`, [system_id,time], (err, res) => {});
  } catch (err) {
    console.error(err);
  }
}

/**
* Add a presence level to Database by ID
* @author   (Mgram) Marcus Ingram
* @param    {Int} system_id     Database ID of the Star System
* @param    {Int} presence      Presence level of the system (0-5)
*/
function addPresence (system_id, presence) {
  let time = Math.floor(new Date().getTime()); // Unix time
  try {
    pool.query(`INSERT INTO presence(system_id,presence_lvl,time)VALUES($1,$2,$3)`, [system_id,presence,time], (err, res) => {});
  } catch (err) {
    console.error(err);
  }
}

/**
* Add a presence level to Database by name
* @author   (Mgram) Marcus Ingram
* @param    {String} name    Name of the Star System
* @param    {Int} presence   Presence level of the system (1-5) 5 = Massive, 1 = None
*/
function addPresenceByName (name, presence) {
  try {
    getSysID(name).then((res) => {
      addPresence(res,presence);
    })
  } catch (err) {
    return(err);
  }
}

/**
* Set the current incursion status of a system by name
* @author   (Mgram) Marcus Ingram
* @param    {String} name    Name of the Star System
* @param    {Int} status     (1 = active, 0 = inactive)
*/
async function setStatus (name,status) {
  try {
    pool.query(
      `UPDATE systems
      SET status = $1
      WHERE name = $2;`
      , [status,name], (err, res) => { //$1 is untrusted and sanitized
      //console.error(err);
    });
  } catch (err) {
    console.error(err);
  }
}

/**
* Returns the Database ID for the system name requested
* @author   (Mgram) Marcus Ingram
* @param    {String} name    Name of the Star System
* @return   {Int}            Star System Database ID
*/
async function getSysID (name) {
  try {
    const { rows } = await querySelect("system_id", "systems", "name", name);
    return rows[0].system_id; // Return System_id
  } catch (err) {
    return err; // Return 0 if system is not in the DB
  }
}

/**
* Returns all the Incursion ID's for the system name requested
* @author   (Mgram) Marcus Ingram
* @param    {Int} system_id     Database ID of the Star System
* @return   {Int}               Incursion ID
*/
async function getIncID (system_id) {
  try {
    const { rows } = await querySelect("inc_id", "incursions", "system_id", system_id);
    return rows[0].inc_id; // Return System_id
  } catch (err) {
    return 0; // Return 0 if system is not in the DB
  }
}

/**
* Gets the most recent incursion time for a system id.
* @author   (Mgram) Marcus Ingram
* @param    {Int} system_id     Database ID of the Star System
* @return   {Int}               Returns time (UNIX EPOCH) of most recent incursion report
*/
async function getLastIncTime (system_id) {
  try {
    const { rows } = await querySelect("MAX(time)", "incursions", "system_id", system_id);
    return rows[0].max; // Return System_id
  } catch (err) {
    console.error(err);
  }
}

/**
* Gets the most recent system presence level for a system id.
* @author   (Mgram) Marcus Ingram
* @param    {Int} system_id     Database ID of the Star System
* @return   {Int}               Returns presence level for Star System
*/
async function getPresence (system_id) {
  try {
    let { rows } = await querySelect("MAX(time)", "presence", "system_id", system_id);
    system_id = rows[0].max;
    let result = await querySelect("presence_lvl", "presence", "time", system_id);
    return result.rows[0].presence_lvl; // Return Presence
  } catch (err) {
    console.error(err);
  }
}

/**
* Returns an object with current incursions and their presence levels (WORK IN PROGRESS)
* @author   (Mgram) Marcus Ingram
* @return   {Int}       Returns map object with incursion system name:presence level
*/
async function getIncList () {
  try {
    let res = await querySelect("*", "systems", "status", 1);
    let list = new Map();
    for (let i = 0; i < res.rowCount; i++) {
      let presence = await getPresence(res.rows[i].system_id);
      list.set(res.rows[i].name,presence);
    }
    return list;
  } catch (err) {
    console.error(err);
  }
}

// Fetch a new watchlist from the current incursion systems
async function getWatchlist (name) {
  try {
    let list = [];
    const { rows } = await querySelect("name", "systems", "status", 1);
    for (let i = 0; i < rows.length; i++) {
      list.push(rows[i].name);
    }
    console.log(`Watchlist: ${list}`);
    return list; // Return System_id
  } catch (err) {
    console.log(err); // Return 0 if system is not in the DB
  }
}

/**
* Returns presence as string from lvl 
* @author   (Mgram) Marcus Ingram
* @param    {Int} presence_lvl    Input value of presence level          
* @return   {String}              Returns the presence level as a string
*/
function convertPresence(presence_lvl) {
  switch (presence_lvl) {
    case 0:
      return "No data available";
    case 1:
      return "No Thargoid Presence";
    case 2:
      return "Marginal Thargoid Presence";
    case 3:
      return "Moderate Thargoid Presence";
    case 4:
      return "Significant Thargoid Presence";
    case 5:
      return "Massive Thargoid Presence";
  }
}

// Star System processing logic
async function processSystem(msg) {
  const { StarSystem, timestamp, SystemAllegiance, SystemGovernment } = msg.message;
  let date = new Date();
  let time = date.getTime(timestamp);

  if (SystemAllegiance != undefined && time >= Date.now() - 86400000) {
    
    if (watchlist.includes(StarSystem)) { // Check in watchlist
      if (SystemAllegiance == targetAllegiance && SystemGovernment == targetGovernment) { // Check if the system is under Incursion
        addIncursions(await getSysID(StarSystem),time);
        console.log(`Incursion Logged: ${StarSystem}`);
        watchlist = await getWatchlist(); // Refresh the watchlist with the new systems to monitor

      } else {
        setStatus(StarSystem,0);
        console.log(`${StarSystem} removed from Watchlist because alli = [${SystemAllegiance}], gov = [${SystemGovernment}]`)
        watchlist = await getWatchlist();
      }

    } else { // Not in watchlist
      if (SystemAllegiance == targetAllegiance && SystemGovernment == targetGovernment) { // Check if the system is under Incursion
        if (await getSysID(StarSystem) == 0) { // Check if system is NOT in DB
          await addSystem(StarSystem);
          getSysID(StarSystem).then((res) => {
            addIncursions(res,time);
            addPresence(res,0);
          });
        } else {
          setStatus(StarSystem, 1);
          addIncursions(await getSysID(StarSystem),time);
        }
        console.log(`System Logged: ${StarSystem}`);
        watchlist = await getWatchlist();
      }
    }
  }
}

// Sentry Listener
async function run() {
  const sock = new zmq.Subscriber;

  watchlist = await getWatchlist();

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

api.get('/endpoints', (req, res) => res.json(  // When a request is made to the base dir, call the callback function json()
    {
      header: { // Contains data about the message
        timestamp: `${new Date().toISOString()}`, // Sets timestamp to the current time in ISO8601 format.
        softwareName: 'AXI Sentry', // Name of API
        softwareVersion: '0.1',  // Arbituary number currently
      },
      message: {
        endpoints: {
          incursions: 'http://sentry.antixenoinitiative.com/incursions',
          incursionshistory: 'http://sentry.antixenoinitiative.com/incursionshistory',
          systems: 'http://sentry.antixenoinitiative.com/systems',
          presence: 'http://sentry.antixenoinitiative.com/presence'
        }
      }
    }
  ),
);

api.get('/incursionshistory', async function(req, res) {
  const { rows } =
  await pool.query(
    `SELECT incursions.inc_id,systems.system_id,systems.name,incursions.time
     FROM incursions
     INNER JOIN systems
     ON incursions.system_id=systems.system_id;`
  );
  res.json(
    {
      header: {
        timestamp: `${new Date().toISOString()}`,
        softwareName: 'AXI Sentry',
        softwareVersion: '0.1',
      },
      message: {
        incursions: rows,
      }
    })
  },
);

api.get('/incursions', async function(req, res) {
  const { rows } = await pool.query(`SELECT * FROM systems WHERE status = '1'`);
  res.json(
    {
      header: {
        timestamp: `${new Date().toISOString()}`,
        softwareName: 'AXI Sentry',
        softwareVersion: '0.1',
      },
      message: {
        incursions: rows,
      }
    })
  },
);

api.get('/systems', async function(req, res) {
  const { rows } = await pool.query(`SELECT * FROM systems`);
  res.json(
    {
      header: {
        timestamp: `${new Date().toISOString()}`,
        softwareName: 'AXI Sentry',
        softwareVersion: '0.1',
      },
      message: {
        systems: rows,
      }
    })
  },
);

api.get('/presence', async function(req, res) {
  const { rows } = await pool.query(`SELECT * FROM presence`);
  res.json(
    {
      header: {
        timestamp: `${new Date().toISOString()}`,
        softwareName: 'AXI Sentry',
        softwareVersion: '0.1',
      },
      message: {
        systems: rows,
      }
    })
  },
);

//Discord client
discordClient.on("ready", () => {
  console.log(`[✔] Discord bot Logged in as ${discordClient.user.tag}!`);
})

discordClient.on('message', message => {
	if (!message.content.startsWith(prefix) || message.author.bot) return;

	const args = message.content.slice(prefix.length).trim().split(/ +/);
	const commandName = args.shift().toLowerCase();

	if (!discordClient.commands.has(commandName)) {
		if (message.content === `${prefix}ping`) {
			message.channel.send("Pong")
		}

		if (message.content === `${prefix}getactive`) { // This command cannot be moved to a command file due to dependancies.
			getIncList().then((list) => {
				const returnEmbed = new Discord.MessageEmbed()
            .setColor('#FF7100')
						.setAuthor('The Anti-Xeno Initiative', "https://cdn.discordapp.com/attachments/860453324959645726/865330887213842482/AXI_Insignia_Hypen_512.png")
						.setTitle("**Active Incursions**")
						.setDescription("Current systems under incursion.")
						.setTimestamp()
            console.log(list);
            for (let [system,presence] of list.entries()) {
              console.log(`${system}: ${presence}`)
              returnEmbed.addField(system, convertPresence(presence))
            }
						message.channel.send({ embed: returnEmbed })
			});
		}

    if (message.content.startsWith(`${prefix}setpresence`)) { // This command cannot be moved to a command file due to dependancies.
			try {
        addPresence(args[0],args[1]);
        message.channel.send("Setting Presence Level")
      } 
      catch {
        message.channel.send("Something went wrong, please ensure the ID is correct")
      }
		}

		return;
	}

  const command = discordClient.commands.get(commandName);

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
		command.execute(message, args);
	} catch (error) {
		console.error(error);
		message.reply('there was an error trying to execute that command!');
	}
});

function attachIsImage(msgAttach) {
  const url = msgAttach.url;
  //True if this url is a png image.
  return url.indexOf("png", url.length - "png".length /*or 3*/) !== -1 || url.indexOf("jpg", url.length - "jpg".length /*or 3*/) !== -1;
}

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

function parseDamagedStarports(text) {
  const starportList = text.substring(text.indexOf("Update") + 7).split("\n")
	let returnStr = "The following stations have been attacked and may require assistance:"
	// console.log(starportList)
	for(var i = 1; i < starportList.length - 1; i++) {
		returnStr += "\n- " + starportList[i] + "🔥"
	}
  return returnStr
}

// Switch Statements
if (enableDiscordBot == 1) { discordClient.login(process.env.TOKEN) } else { console.error(`WARN: Discord Bot Disabled`)}
if (enableListener == 1) { run(); } else { console.error(`WARN: Sentry Disabled`)}