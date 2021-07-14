require("dotenv").config();
const zlib = require("zlib");
const zmq = require("zeromq");
const { Pool } = require('pg');
const api = require('express')(); // Imports express and then creates an express object called api
let msg;

// Settings
const SOURCE_URL = 'tcp://eddn.edcd.io:9500'; //EDDN Data Stream URL
const targetState = "Boom"; //The current system state to check for (Incursion)

// Database Client Config
const pool = new Pool({ //credentials stored in .env file
  user: process.env.DBUSER,
  host: process.env.DBHOST,
  database: process.env.DBDATABASE,
  password: process.env.DBPASSWORD,
})

// Returns the date for last x day
function getLastDayOccurence (date, day) {
  const d = new Date(date.getTime());
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thurs', 'Fri', 'Sat'];
  if (days.includes(day)) {
    const modifier = (d.getDay() + days.length - days.indexOf(day)) % 7 || 7;
    d.setDate(d.getDate() - modifier);
  }
  return d;
}

// Constructs and returns a SELECT query
async function querySelect (column1, table, column2, value) {
  const client = await pool.connect();
  let res;
  try {
    await client.query('BEGIN');
    try {
      res = await client.query(`SELECT ${column1} FROM ${table} WHERE ${column2} = $1`,[value]); //$1 is untrusted and sanitized
      await client.query('COMMIT');
    } catch (err) {
      console.log(err);
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
  return res;
}

// Add a system to DB
async function addSystem (name) {
  pool.query(`INSERT INTO systems(name)VALUES($1)`,[name],(err, res) => { //$1 is untrusted and sanitized
    //console.log(err);
  });
}

// Add a incursion to DB
function addIncursions (system_id) {
  time = Math.floor(Date.now());
  //console.log(time);
  pool.query(`INSERT INTO incursions(system_id,time)VALUES($1,$2)`,[system_id,time],(err, res) => { //$1 is untrusted and sanitized
    //console.log(err);
  });
}

// Returns the Database ID (integer) for the system name requested
async function getSysID (name) { 
  try {
    const { rows } = await querySelect("system_id", "systems", "name", name);
    return rows[0].system_id; // Return System_id
  } catch (err) {
    return 0; // Return 0 if system is not in the DB
  }
}

// Returns the IDs of all incursions for the system_id requested
async function getIncID (system_id) { 
  try {
    const { rows } = await querySelect("inc_id", "incursions", "system_id", system_id);
    return rows[0].inc_id; // Return System_id
  } catch (err) {
    return 0; // Return 0 if system is not in the DB
  }
}

//Gets the most recent incursion time for a system id.
async function getLastIncTime (system_id) {
  try {
    const { rows } = await querySelect("MAX(time)", "incursions", "system_id", system_id);
    return rows[0].max; // Return System_id
  } catch (err) {
    console.log(err);
  }
}

// Primary Function
async function run() {
  const sock = new zmq.Subscriber;

  sock.connect(SOURCE_URL);
  sock.subscribe('');
  console.log("[✔] EDDN Listener Connected: ", SOURCE_URL);

  for await (const [src] of sock) {
    msg = JSON.parse(zlib.inflateSync(src));
    const { StarSystem, StationFaction, timestamp } = msg.message;
    if (msg.$schemaRef == "https://eddn.edcd.io/schemas/journal/1") { //only process correct schema
      if (StationFaction?.FactionState == targetState) {
        if (await getSysID(StarSystem) == 0) { // Check if the system is in the DB
          await addSystem(StarSystem); // Add the System to DB
          console.log(`[${timestamp}]: ADDED SYSTEM: ${StarSystem}`);
        }
        let SysID = await getSysID(StarSystem);
        if (await getLastIncTime(SysID) < getLastDayOccurence(new Date(), 'Thurs').getTime()) { // If the last logged incursion is before the last tick
          addIncursions(SysID); // Log the Incursion to DB
          console.log(`[${timestamp}]: LOGGED INCURSION ID: ` + await getIncID(SysID));
        } else {
          console.log(`[${timestamp}]: SKIPPED`);
        }
      }
    }
  }
}

// TEST API CODE
api.listen(3000, () => { 
  console.log('[✔] Sentry API Operational: http://localhost:3000/');  // Upon a successful connection will log to console
});

api.get('/', (req, res) => res.json(  // When a request is made to the base dir, call the callback function json()
    {
      header: { // Contains data about the message
        timestamp: `${new Date().toISOString()}`, // Sets timestamp to the current time in ISO8601 format.
        softwareName: 'AXI Sentry', // Name of API
        softwareVersion: '0.1',  // Arbituary number currently
      },
      message: { // The actual content of the message
      }
    }
  ),
);

api.get('/incursions', async function(req, res) {
  const { rows } = await pool.query(`SELECT incursions.inc_id,systems.system_id,systems.name, incursions.time FROM incursions INNER JOIN systems ON incursions.system_id=systems.system_id;`);
  res.json(
    {
      header: {
        timestamp: `${new Date().toISOString()}`,
        softwareName: 'AXI Sentry',
        softwareVersion: '0.1',
      },
      message: {
        incursions: rows, // The actual content of the message
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
        systems: rows, // The actual content of the message
      }
    })
  },
);

run();

