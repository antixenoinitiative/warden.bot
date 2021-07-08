import zlib from 'zlib'; //EDDN Listener Dependency
import zmq from 'zeromq'; //EDDN Listener Dependency

const SOURCE_URL = 'tcp://eddn.edcd.io:9500'; //EDDN Data Stream URL
const targetstate = "Boom"; //The current system state to check for (Incursion)

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
      }
    }
  }
}

run();
