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

// Constructs and returns a SELECT query
async function QuerySelect (column1, table, column2, value) {
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

async function GetIncursions () {
  const client = await pool.connect();
  let res;
  try {
    await client.query('BEGIN');
    try {
      res = await client.query(`SELECT systems.system_id, systems.name,incursions.inc_id, incursions.date FROM incursions INNER JOIN systems ON incursions.system_id=systems.system_id;`);
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
async function AddSystem (name) {
  pool.query(`INSERT INTO systems(name)VALUES($1)`,[name],(err, res) => { //$1 is untrusted and sanitized
    //console.log(err);
  });
}

// Add a system to DB
function AddIncursion (id) {
  pool.query(`INSERT INTO incursions(system_id)VALUES($1)`,[id],(err, res) => { //$1 is untrusted and sanitized
    //console.log(err);
  });
}

// Returns the Database ID (integer) for the system name requested
async function GetSysID (name) { 
  try {
    const { rows } = await QuerySelect("system_id", "systems", "name", name);
    return rows[0].system_id; // Return System_id
  } catch (err) {
    return 0; // Return 0 if system is not in the DB
  }
}

async function GetIncID (id) { 
  try {
    const { rows } = await QuerySelect("inc_id", "incursions", "system_id", id);
    return rows[0].inc_id; // Return System_id
  } catch (err) {
    return 0; // Return 0 if system is not in the DB
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
      const systemState = StationFaction?.FactionState;
      if (systemState == targetState) {
        
        if (await GetSysID(StarSystem) == 0) { // Check if the system is in the DB

          await AddSystem(StarSystem); // Add the System to DB
          console.log(`[${timestamp}]: ADDED [${StarSystem}]`); // Log the ID of the system added to DB
        } else {
          console.log(`[${timestamp}]: EXISTS [${StarSystem}]`);
        }

        let SysID = await GetSysID(StarSystem);
        await AddIncursion(await GetSysID(StarSystem)); // Log the Incursion to DB
        console.log(`[${timestamp}]: LOGGED INCURSION ID: ` + await GetIncID(SysID));
        
      } else {
        //console.log(`[${timestamp}]: SKIPPED [${StarSystem}]`);
      }
    }
  }
}

// TEST API CODE
api.listen(3000, () => { 
  console.log('[✔] Sentry API Operational');  // Upon a successful connection will log to console
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

api.get('/all_incursions', async function(req, res) {
  const { rows } = await GetIncursions()
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

run();

