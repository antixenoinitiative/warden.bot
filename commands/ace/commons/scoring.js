module.exports = {
    chieftain: (args) => {
        // Calculations

        // I have no idea what this is; Orodruin says "p0 is related to the score of the "good" run" :)
        let p0 = Math.tan((1/10-0.5)*Math.PI);

        // Time taken parameters
        let t0_1 = 2.75 // 2 minutes and 45 seconds - thought to be the upper limit of a medium-ship perfect time
        let t0_2 = 18 // 18 minutes - thought to be a good time for a damage-less run
        let t0_3 = 30; // 30 minutes; is conventionally "new serpent's nemesis level"
        let dt = 100; // Shape of the curve, as determined by Orodruin
        let timeTakenPenalty = 0;
        timeTakenPenalty = 200 * (0.5 + (1/Math.PI)*Math.atan(p0*((args.time_in_seconds/60 + dt)/(t0_2+dt))*((t0_3-args.time_in_seconds/60)/(t0_3-t0_2))*((t0_2-t0_1)/(args.time_in_seconds/60-t0_1))));

        // Hull lost parameter
        let h0_1 = 0 // No hull lost; perfect "100% club" run
        let h0_2 = 0.1 // 10% hull lost; is conventially "good run"
        let h0_3 = 1.25 // 125% total hull lost; is conventionally "new serpent's nemesis level"
        let dh = 5; // Shape of the curve, as determined by Orodruin
        let damageTakenPenalty = 0;
        damageTakenPenalty = 200 * (0.5 + (1/Math.PI)*Math.atan(p0*((args.percenthulllost/100 + dh)/(h0_2+dh))*((h0_3-args.percenthulllost/100)/(h0_3-h0_2))*((h0_2-h0_1)/(args.percenthulllost/100-h0_1))));
        
        // Ammo efficiency parameters
        let a0_1 = 1 // This is 100% ammo efficiency
        let a0_2 = 1 / (143 / 175) // 82% is Astrae's level ... 175 is Astrae limit
        let a0_3 = 1 / 0.35 // 35% is conventionally "new serpent's nemesis level"
        let da = 2; // Shape of the curve, as determined by Orodruin
        let ammoEffPenalty = 0;
        ammoEffPenalty = 200 * (0.5 + (1/Math.PI)*Math.atan(p0*((args.shot_damage_fired/args.damage_threshold + da)/(a0_2+da))*((a0_3-args.shot_damage_fired/args.damage_threshold)/(a0_3-a0_2))*((a0_2-a0_1)/(args.shot_damage_fired/args.damage_threshold-a0_1))));
        
        // Calculate the final score
        let finalScore = args.targetRun - (1/3)*(timeTakenPenalty + ammoEffPenalty + damageTakenPenalty)

        let result = {
            score: finalScore,
            timePenalty: timeTakenPenalty,
            ammoPenalty: ammoEffPenalty,
            damagePenalty: damageTakenPenalty
        }
        return result;
    },
    hauler: (args) => {
        console.log(args)
        
    },
}