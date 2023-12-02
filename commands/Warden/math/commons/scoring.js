module.exports = {
    score_this: (args) => {
        // Calculations
       
        let p0 = Math.tan((1/10-0.5)*Math.PI);
        
        let time_min = (args.time_in_seconds + args.extraTime)/60.0;
        let ammo_factor = args.shot_damage_fired/args.damage_threshold;
        let hull_loss = args.percenthulllost * args.hullLossMultiplier / 100.0;

        // Time taken parameters
        let t0_1 = args.scoring.time[1];
        let t0_2 = args.scoring.time[2];
        let t0_3 = args.scoring.time[3];
        let dt = args.scoring.time[0];
        let timeTakenPenalty = 0;
        timeTakenPenalty = 200 * (0.5 + (1/Math.PI)*Math.atan(p0*((time_min + dt)/(t0_2+dt))*((t0_3-time_min)/(t0_3-t0_2))*((t0_2-t0_1)/(time_min-t0_1))));

        // Hull lost parameter
        let h0_1 = args.scoring.hull[1];
        let h0_2 = args.scoring.hull[2];
        let h0_3 = args.scoring.hull[3];
        let dh = args.scoring.hull[0];
        let damageTakenPenalty = 0;
        damageTakenPenalty = 200 * (0.5 + (1/Math.PI)*Math.atan(p0*((hull_loss + dh)/(h0_2+dh))*((h0_3-hull_loss)/(h0_3-h0_2))*((h0_2-h0_1)/(hull_loss-h0_1))));
        
        // Ammo efficiency parameters
        let a0_1 = args.scoring.ammo[1];
        let a0_2 = args.scoring.ammo[2];
        let a0_3 = args.scoring.ammo[3];
        let da = args.scoring.ammo[0];
        let ammoEffPenalty = 0;
        ammoEffPenalty = 200 * (0.5 + (1/Math.PI)*Math.atan(p0*((ammo_factor + da)/(a0_2+da))*((a0_3-ammo_factor)/(a0_3-a0_2))*((a0_2-a0_1)/(ammo_factor-a0_1))));
        
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
}
