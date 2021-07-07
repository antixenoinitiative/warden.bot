import zlib from 'zlib';                                                          //EDDN Listener Dependency
import zmq from 'zeromq';                                                         //EDDN Listener Dependency

const SOURCE_URL = 'tcp://eddn.edcd.io:9500';                                     //EDDN Data Stream URL
const targetstate = "Incursion";                                                  //The current system state to check for (Incursion)

async function run() { 
  const sock = new zmq.Subscriber;

  sock.connect(SOURCE_URL);
  sock.subscribe('');
  console.log('EDDN listener connected to:', SOURCE_URL);

  for await (const [src] of sock) {                                               //for Each Listener Message
    const msg = JSON.parse(zlib.inflateSync(src));                                //convert the message to JSON
    const sysstate = msg.message.StationFaction?.FactionState;                    //grab the Faction State and store it in a sysstate
    if (sysstate == targetstate) {                                                //if the System state is equal to the Target State
      console.log(`${targetstate} in ${msg.message.StarSystem}`);                 //send "<target state> is in <system name>" to console
    }
  }
}

run();
