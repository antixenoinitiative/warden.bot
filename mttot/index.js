const { thargoiddata, weapondata } = require("./data");

const thargoids = thargoiddata();
const weapons = weapondata();

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
        let nDPS = weapons[inputcode].sustaxdps * multi;
        let DPS = nDPS * weapons[inputcode].ap / thargoids[target].ar;
        let finaldamage = DPS * Math.min((1 - ((range - weapons[inputcode].falloff) / (weapons[inputcode].maxrange - weapons[inputcode].falloff))), 1)

        let finaldamagestd = finaldamage * weapons[inputcode].stdammopercent
        let finaldamageprem = finaldamage * weapons[inputcode].premammopercent

        let result = { "basic": finaldamage, "standard": finaldamagestd, "premium": finaldamageprem }
        return result;

    } catch (err) {
        console.log(err);
    }

}

module.exports = {
    calcMTTOT: (target, weapons, range) => {
        try {
            let basic = [];
            let standard = [];
            let premium = [];

            for (let i = 0; i < weapons.length; i++) {
                let ans = calcDPS(target, weapons[i], range)
                basic.push(ans.basic)
                standard.push(ans.standard)
                premium.push(ans.premium)
            }

            let basicTotal = arrayTotal(basic);
            let standardTotal = arrayTotal(standard);
            let premiumTotal = arrayTotal(premium);

            let mttotBasic = thargoids[target].hp / (basicTotal - thargoids[target].regen)
            let mttotStandard = thargoids[target].hp / (standardTotal - thargoids[target].regen)
            let mttotPremium = thargoids[target].hp / (premiumTotal - thargoids[target].regen)

            let result = { "basic": mttotBasic.toFixed(2), "standard": mttotStandard.toFixed(2), "premium": mttotPremium.toFixed(2) }
            console.log(result)
            return result

        } catch (err) {
            console.log(err);
        }
            
    }
}