const thargoids = require("./thargoiddata.json")
const weaponData = require("./weapondata.json")

function arrayTotal(arr) {
    var total = 0;
    for(var i in arr) { total += arr[i]; }
    return total
}

function calcDPS(target, inputcode, range) {
    let multi;
    //if (range = undefined) { range = 1500 }
    try {
        if (inputcode.match(/^\d/)) {
            multi = inputcode.charAt(0); // Get Multiplier
            inputcode = inputcode.substring(1); // Remove Multiplier from code
        }

        switch (inputcode) {
            case "mgauss":
                inputcode = "mfgc";
                break;
            case "sgauss":
                inputcode = "sfgc";
                break;
            case "mfgauss":
                inputcode = "mfgc";
                break;
            case "sfgauss":
                inputcode = "sfgc";
                break;
            case "m":
                inputcode = "mfgc";
                break;
            case "s":
                inputcode = "sfgc";
                break;
        }

        let nDPS = weaponData[inputcode].sustaxdps * multi;
        let DPS = nDPS * weaponData[inputcode].ap / thargoids[target].ar;
        let finaldamage = DPS * Math.min((1 - ((range - weaponData[inputcode].falloff) / (weaponData[inputcode].maxrange - weaponData[inputcode].falloff))), 1)

        let finaldamagestd = finaldamage * weaponData[inputcode].stdammopercent
        let finaldamageprem = finaldamage * weaponData[inputcode].premammopercent

        let result = { "basic": finaldamage, "standard": finaldamagestd, "premium": finaldamageprem }
        return result;

    } catch (err) {
        console.log(err);
        throw "Weapon Code Error"
    }

}

module.exports = {
    calcMTTOT: (target, weapons, range) => {
        try {
            if (range == undefined) { range = 1500 }

            let basic = [];
            let standard = [];
            let premium = [];



            // Calculate each weapon adjDPS
            for (let i = 0; i < weapons.length; i++) {
                let ans = calcDPS(target, weapons[i], range)
                basic.push(ans.basic)
                standard.push(ans.standard)
                premium.push(ans.premium)
            }
            
            let basicTotal = arrayTotal(basic);
            let standardTotal = arrayTotal(standard);
            let premiumTotal = arrayTotal(premium);
            
            let mttotArray = [] // [ basic100, std100, prem100, basic75, std75, prem75, basic50, std50, prem50 ]

            mttotArray.push(thargoids[target].hp / (basicTotal - thargoids[target].regen))              // basic100
            mttotArray.push(thargoids[target].hp / (standardTotal - thargoids[target].regen))           // std100 
            mttotArray.push(thargoids[target].hp / (premiumTotal - thargoids[target].regen))            // prem100
            mttotArray.push(thargoids[target].hp / (basicTotal / 4 * 3 - thargoids[target].regen))      // basic75
            mttotArray.push(thargoids[target].hp / (standardTotal / 4 * 3 - thargoids[target].regen))   // std75
            mttotArray.push(thargoids[target].hp / (premiumTotal / 4 * 3 - thargoids[target].regen))    // prem75
            mttotArray.push(thargoids[target].hp / (basicTotal / 2 - thargoids[target].regen))          // basic50
            mttotArray.push(thargoids[target].hp / (standardTotal / 2 - thargoids[target].regen))       // std50
            mttotArray.push(thargoids[target].hp / (premiumTotal / 2 - thargoids[target].regen))        // prem50

            let result = []
            for (let i=0; i < mttotArray.length; i++) {
                if (mttotArray[i] >= 120) {
                    result[i] = `☠️ ${mttotArray[i].toFixed(2)}sec`
                } else if (mttotArray[i] >= 50) {
                    result[i] = `🟥 ${mttotArray[i].toFixed(2)}sec`
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
