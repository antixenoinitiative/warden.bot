const zlib = require("zlib");
const zmq = require("zeromq");
const { Pool } = require('pg')

require("dotenv").config();

const SOURCE_URL = 'tcp://eddn.edcd.io:9500'; //EDDN Data Stream URL
const targetstate = "Boom"; //The current system state to check for (Incursion)

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
    const msg = JSON.parse(zlib.inflateSync(src));
    if (msg.$schemaRef == "https://eddn.edcd.io/schemas/journal/1") { //only process correct schema
      const sysstate = msg.message.StationFaction?.FactionState;
      if (sysstate == targetstate) {
        console.log(`${msg.message.timestamp}: ${targetstate} detected in system: ${msg.message.StarSystem}`);
        pool.query("SELECT * FROM systems where name = 'msg.message.StarSystem'", (err, res) => {
          if (res.rowCount == 1) {
            console.log(`${msg.message.StarSystem} exists in the Database`)
          } else {
            console.log(`${msg.message.StarSystem} does not exist in the Database`)
          }
        })
      }
    }
  }
}

run();