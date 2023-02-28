/* eslint-disable complexity */
module.exports = {
    getInterceptorByShip: (args) => {
        let interceptor;
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
        return damage_threshold;
    }
}
