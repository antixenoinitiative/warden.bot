/* eslint-disable complexity */
module.exports = {
    getInfoByShip: (args) => {
        let shipInfo = {};
        switch (args.shiptype) {
          case 'chieftain':
          case 'challenger':
          case 'fdl':
          case 'kraitmk2':
                shipInfo.interceptor = 'Medusa';
                // Time scoring parameters
                shipInfo.t0_1 = 2.75; // 2 min 45 s - lower limit
                shipInfo.t0_2 = 18;   // 18 min - "good" damage-less run
                shipInfo.t0_3 = 30;   // 30 min - "Serpent's nemesis"
                shipInfo.dt = 100;    // Time score shape
                // Hull scoring parameters
                shipInfo.h0_1 = 0;    // Perfect run, no lost hull
                shipInfo.h0_2 = 0.1;  // "Good" run - 10% hull loss
                shipInfo.h0_3 = 1.25; // "Serpent's nemesis" - 125% hull lost
                shipInfo.dh = 5;      // Hull score shape
                // Efficiency scoring parameters
                shipInfo.a0_1 = 1;    // 100% ammo efficiency
                shipInfo.a0_2 = 175/143; // 82% - Clarity limit
                shipInfo.a0_3 = 1/0.35;  // 35% "Serpent's nemesis" level
                shipInfo.da   = 2;       // Efficiency score shape
            break;
          case 'hauler':
                shipInfo.interceptor = 'Cyclops';
                // Time scoring parameters
                shipInfo.t0_1 = 6;    // 6 min - lower limit
                shipInfo.t0_2 = 13.5; // 13 min 30 s - "good" damage-less run
                shipInfo.t0_3 = 19;   // 19 min - "Serpent's nemesis"
                shipInfo.dt = 100;    // Time score shape
                // Hull scoring parameters
                shipInfo.h0_1 = 0;    // Perfect run, no lost hull
                shipInfo.h0_2 = 0.05*1.4;  // "Good" run - 5% hull loss * 1.4
                shipInfo.h0_3 = 0.8*1.4; // "Serpent's nemesis" - 80% hull lost * 1.4
                shipInfo.dh = 5;      // Hull score shape
                // Efficiency scoring parameters
                shipInfo.a0_1 = 1;    // 100% ammo efficiency
                shipInfo.a0_2 = 1/0.8; // 80%
                shipInfo.a0_3 = 1/0.4;  // 40% "Serpent's nemesis" level
                shipInfo.da   = 2;       // Efficiency score shape
            break;
        }
        shipInfo.p0 = Math.tan((1/10-0.5)*Math.PI);
        
        return shipInfo;
    }
}
