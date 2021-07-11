const zlib = require("zlib");
const zmq = require("zeromq");
const { Pool } = require('pg');
const api = require('express')(); // Imports express and then creates an express object called api

require("dotenv").config();


const SOURCE_URL = 'tcp://eddn.edcd.io:9500'; //EDDN Data Stream URL
const targetstate = "Boom"; //The current system state to check for (Incursion)
let msg;

const pool = new Pool({ //credentials stored in .env file
  user: process.env.DBUSER,
  host: process.env.DBHOST,
  database: process.env.DBDATABASE,
  password: process.env.DBPASSWORD,
})

// Returns the Query for "SELECT criteria FROM table WHERE field = term"
async function QuerySelect (criteria, table, field, term) {
  const client = await pool.connect()
  let res
  try {
    await client.query('BEGIN')
    try {
      res = await client.query("SELECT " + criteria + " FROM " + table + " WHERE " + field + " = '" + term + "'")
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  } finally {
    client.release()
  }
  return res
}

// Create entry in table using three variables "INSERT INTO table (field) VALUES value" - NOT CURRENTLY IN USE
async function QueryInsert (table, field, value) {
  const client = await pool.connect()
  let res
  try {
    await client.query('BEGIN')
    try {
      res = await client.query("INSERT INTO " + table + "(" + field + ") VALUES ('" + value + "')")
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  } finally {
    client.release()
  }
  console.log("Insert Result:" + res);
  return res
}

// Add a system to DB
async function AddSystem (name) {
  pool.query("INSERT INTO systems(name)VALUES('"+name+"')",(err, res) => {
      console.log("System added to DB: " + name);
      // console.log(err + res);
    }
  );
}

// Returns the Database ID (integer) for the system name requested
async function GetSysID (name) { 
  try {
    const { rows } = QuerySelect("system_id", "systems", "name", name)
    return rows[0].system_id; // Return System_id
  } catch (err) {
    return 0; // Return 0 if system is not in the DB
  }
}

async function run() { 
  const sock = new zmq.Subscriber;

  sock.connect(SOURCE_URL);
  sock.subscribe('');
  console.log('EDDN listener connected to:', SOURCE_URL);

  

  for await (const [src] of sock) {
    msg = JSON.parse(zlib.inflateSync(src));
    const { StarSystem, StationFaction, timestamp } = msg.message;
    if (msg.$schemaRef == "https://eddn.edcd.io/schemas/journal/1") { //only process correct schema
      const sysstate = StationFaction?.FactionState;

      if (sysstate == targetstate) {
        console.log(`${timestamp}: ${targetstate} detected in system: ${StarSystem}`);

        if (await GetSysID(StarSystem) == 0) { // Check if the system is in the DB
          await AddSystem(StarSystem); // Add the System to DB
          console.log("System ID: " + await GetSysID(StarSystem)); // Log the ID of the system added to DB

        } else {
          console.log(StarSystem + " exists in DB");
        }
      }
    }
  }
}

// TEST API CODE
api.listen(3000, () => { 
  console.log('AXI Sentry is operational');  // Upon a successful connection will log to console
});

api.get('/', (req, res) => res.json(  // When a request is made to the base dir, call the callback function json()
    {
      header: { // Contains data about the message
        timestamp: `${new Date().toISOString()}`, // Sets timestamp to the current time in ISO8601 format.
        softwareName: 'AXI Sentry', // Name of API
        softwareVersion: '0.1',  // Arbituary number currently
      },
      message: { // The actual content of the message 
        system: `${msg.message.timestamp}: ${targetstate} detected in system: ${msg.message.StarSystem}`   
      }
    }
  ),
);

run();

