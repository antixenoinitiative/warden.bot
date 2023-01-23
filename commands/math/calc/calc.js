const thargoids = require("./thargoiddata.json")
const weaponData = require("./weapondata.json")

function calcDPS(target, multi, inputcode, range) {
    try {
        const data = weaponData[inputcode];
        let nDPS = (data.axsdps + data.humansdps * 0.01) * multi;
        let DPS = nDPS * data.ap / thargoids[target].ar;
        let finaldamage = DPS * Math.min((1 - ((range - data.falloff) / (data.maxrange - data.falloff))), 1)

        let finaldamagestd = finaldamage * data.stdammopercent
        let finaldamageprem = finaldamage * data.premammopercent

        let result = { "basic": finaldamage, "standard": finaldamagestd, "premium": finaldamageprem, "cycleTime":data.cycletime }
        return result;

    } catch (err) {
        console.log(err);
        throw "Weapon Code Error"
    }

}

module.exports = {
    calcMTTOT: (target, weapons, range, accuracy) => {
        try {
            let basicTotal = 0;
            let standardTotal = 0;
            let premiumTotal = 0;
            let minCycle = 10;

            // Calculate each weapon adjDPS
            for (let i = 0; i < weapons.length; i++) {
                let ans = calcDPS(target, weapons[i].number, weapons[i].code, range)
                basicTotal += ans.basic;
                standardTotal += ans.standard;
                premiumTotal += ans.premium;
                if(ans.cycleTime < minCycle) minCycle = ans.cycleTime;
            }
            
            let mttotArray = [] // [ basic, standard, premium ]

            // t = [ HP_to_exert - ( weapon_cycle_time * goid_regen ) ] / (weapons_sdps - goid_regen)
            const goidRegen = thargoids[target].regen;

            mttotArray.push((thargoids[target].hp - (minCycle * goidRegen)) / (basicTotal * accuracy - goidRegen));
            mttotArray.push((thargoids[target].hp - (minCycle * goidRegen)) / (standardTotal * accuracy - goidRegen));
            mttotArray.push((thargoids[target].hp - (minCycle * goidRegen)) / (premiumTotal * accuracy - goidRegen));

            let result = []
            for (let i=0; i < mttotArray.length; i++) {
                if (mttotArray[i] >= 120) {
                    result[i] = `☠️ ${mttotArray[i].toFixed(2)}sec`
                } else if (mttotArray[i] >= 60) {
                    result[i] = `🟥 ${mttotArray[i].toFixed(2)}sec`
                } else if (mttotArray[i] >= 45) {
                    result[i] = `🟧 ${mttotArray[i].toFixed(2)}sec`
                } else if (mttotArray[i] >= 30) {
                    result[i] = `🟨 ${mttotArray[i].toFixed(2)}sec`
                } else {
                    result[i] = `🟩 ${mttotArray[i].toFixed(2)}sec`
                }
                if (result[i].includes("-")) {
                    result[i] = `Insufficient DPS`
                }
            }
            return result
        } catch (err) {
            console.log(err);
        }
    }
}
