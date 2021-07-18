require("dotenv").config();
const zlib = require("zlib");
const zmq = require("zeromq");
const { Pool } = require('pg');
const { watch } = require("fs");
const api = require('express')(); // Imports express and then creates an express object called api
let msg;

// Settings
const SOURCE_URL = 'tcp://eddn.edcd.io:9500'; //EDDN Data Stream URL
const targetAllegiance = "Thargoid"; //The current system state to check for (Incursion)
const targetGovernment = "$government_Dictatorship;";

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

// Add a system to DB
async function addSystem (name) {
  pool.query(`INSERT INTO systems(name,status)VALUES($1,'1')`, [name], (err, res) => { //$1 is untrusted and sanitized
    //console.error(err);
  });
}

// Add a incursion to DB
async function addIncursions (system_id) {
  let time = Math.floor(new Date().getTime()); // Unix time
  //console.log(time);
  pool.query(`INSERT INTO incursions(system_id,time)VALUES($1,$2)`, [system_id,time], (err, res) => { //$1 is untrusted and sanitized
    //console.error(err);
  });
}

async function setStatus (name,status) {
  pool.query(
    `UPDATE systems
    SET status = $1
    WHERE name = $2;`
    , [status,name], (err, res) => { //$1 is untrusted and sanitized
    //console.error(err);
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
    console.error(err);
  }
}

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

// Primary Function
async function run() {
  const sock = new zmq.Subscriber;

  let watchlist = await getWatchlist();

  sock.connect(SOURCE_URL);
  sock.subscribe('');
  console.log("[✔] EDDN Listener Connected: ", SOURCE_URL);

  // ---- On Run() Testing
  
  // ----

  for await (const [src] of sock) { // For each data packet
    msg = JSON.parse(zlib.inflateSync(src));
    const { StarSystem, StationFaction, timestamp, SystemAllegiance, SystemGovernment } = msg.message;
      if (watchlist.includes(StarSystem)) { // Check in watchlist
        if (SystemAllegiance == targetAllegiance && SystemGovernment == targetGovernment) { // Check if the system is under Incursion
          addIncursions(await getSysID(StarSystem));
          console.log(`Incursion Logged: ${StarSystem}`);
          watchlist = await getWatchlist(); // Refresh the watchlist with the new systems to monitor
        } else {
          await setStatus(StarSystem,0);
          console.log(`${StarSystem} removed from Watchlist because alli = [${SystemAllegiance}], gov = [${SystemGovernment}]`)
          watchlist = await getWatchlist(); // Refresh the watchlist with the new systems to monitor
        }
      } else { // Not in watchlist
        if (SystemAllegiance == targetAllegiance && SystemGovernment == targetGovernment) { // Check if the system is under Incursion
          if (await getSysID(StarSystem) == 0) {
            await addSystem(StarSystem);
            console.log(`System Logged: ${StarSystem}`);
            addIncursions(await getSysID(StarSystem));
            console.log(`Incursion Logged: ${StarSystem}`);
            watchlist = await getWatchlist(); // Refresh the watchlist with the new systems to monitor
          } else {
            await setStatus(StarSystem, 1);
            console.log(`Status set to active: ${StarSystem}`);
            addIncursions(await getSysID(StarSystem));
            watchlist = await getWatchlist();
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
      message: {
        endpoints: {
          incursions: 'https://sentry.antixenoinitiative.com:3000/incursions',
          incursionshistory: 'https://sentry.antixenoinitiative.com:3000/incursionshistory'
        }
      }
    }
  ),
);

api.get('/incursionshistory', async function(req, res) {
  const { rows } = 
  await pool.query(
    `SELECT incursions.inc_id,systems.system_id,systems.name, incursions.time 
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
        incursions: rows, // The actual content of the message
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
        systems: rows, // The actual content of the message
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