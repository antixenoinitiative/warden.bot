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

async function run() { 
  const sock = new zmq.Subscriber;

  sock.connect(SOURCE_URL);
  sock.subscribe('');
  console.log('EDDN listener connected to:', SOURCE_URL);

  for await (const [src] of sock) {
    msg = JSON.parse(zlib.inflateSync(src));

    // console.log(msg);
    if (msg.$schemaRef == "https://eddn.edcd.io/schemas/journal/1") { //only process correct schema
      const sysstate = msg.message.StationFaction?.FactionState;
      if (sysstate == targetstate) {
        console.log(`${msg.message.timestamp}: ${targetstate} detected in system: ${msg.message.StarSystem}`);

        // pool.query("SELECT * FROM systems where name = 'msg.message.StarSystem'", (err, res) => {
        //   if (res.rowCount == 1) {
        //     console.log(`${msg.message.StarSystem} exists in the Database`);
        //   } else {
        //     console.log(`${msg.message.StarSystem} does not exist in the Database`);
        //   }
        // });
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

