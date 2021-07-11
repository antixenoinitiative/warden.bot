const zlib = require("zlib");
const zmq = require("zeromq");
const { Pool } = require('pg');
const api = require('express')(); // Imports express and then creates an express object called api

require("dotenv").config();


const SOURCE_URL = 'tcp://eddn.edcd.io:9500'; //EDDN Data Stream URL
const targetState = "Boom"; //The current system state to check for (Incursion)
let msg;

const pool = new Pool({ //credentials stored in .env file
  user: process.env.DBUSER,
  host: process.env.DBHOST,
  database: process.env.DBDATABASE,
  password: process.env.DBPASSWORD,
})

// Returns the Query for Select
async function QuerySelect (column1, table, column2, value) {
  const client = await pool.connect();
  let res;
  try {
    await client.query('BEGIN');
    try {
      res = await client.query(`SELECT ${column1} FROM ${table} WHERE ${column2} = '${value}'`);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
  return res;
}

// Create entry in table using three variables "INSERT INTO table (field) VALUES value" - NOT CURRENTLY IN USE
async function QueryInsert (table, column, value) {
  const client = await pool.connect();
  let res;
  try {
    await client.query('BEGIN');
    try {
      res = await client.query(`INSERT INTO ${table}(${column}) VALUES ('${value}')`);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
  console.log("Insert Result:" + res);
  return res;
}

// Add a system to DB
function AddSystem (name) {
  pool.query(`INSERT INTO systems(name)VALUES('${name}')`,(err, res) => {
      console.log("System added to DB: " + name);
      // console.log(err + res);
    }
  );
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

        console.log(`${timestamp}: ${targetState} detected in system: ${StarSystem}`);

        if (await GetSysID(StarSystem) == 0) { // Check if the system is in the DB

          AddSystem(StarSystem); // Add the System to DB
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

run();

