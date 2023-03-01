/* eslint-disable complexity */
module.exports = {
    getInfoByShip: (args) => {
        let interceptor;
        let dmgPar;
        let dmgExc;
        let timePar;
        let timeExc;
        let hullPar;
        let hullExc;
        switch (args.shiptype) {
          case 'chieftain':
          case 'challenger':
          case 'fdl':
          case 'kraitmk2':
            interceptor = 'Medusa';
            break;
          case 'hauler':
            interceptor = 'Cyclops';
            break;
        }
        let shipInfo = {};
        shipInfo.interceptor = interceptor;
        shipInfo.dmgPar = dmgPar;
        shipInfo.dmgExc = dmgExc;
        shipInfo.timePar = timePar;
        shipInfo.timeExc = timeExc;
        shipInfo.hullPar = hullPar;
        shipInfo.hullExc = hullExc;
        return shipInfo;
    }
}
