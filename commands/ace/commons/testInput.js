module.exports = {
    testInputs: (args, interaction) => {
        
        if ((args.gauss_small_number + args.gauss_medium_number) > 4) {
            return(`More than 4 gauss? Very funny ${interaction.member} ...`);
        }

        if ((args.gauss_small_number + args.gauss_medium_number) < 1) {
            return(`While trying to kill a Medusa with less than 1 gauss cannons is a noble attempt dear ${interaction.member} ... it kind of defeats the purpose of this calculator`);
        }

        if (args.time_in_seconds < 120) {
            return(`Mhhh ... I sincerely doubt that you killed a Medusa alone in less than two minutes ${interaction.member} ... maybe you mixed up minutes and seconds as an input?`);
        }

        if (args.time_in_seconds > 7200) {
            return(`Oh my sweet summer child ${interaction.member} ... if you truly took more than 2 hours to kill a Medusa, you shouldn't be using an Ace score calculator to rate it ...`);
        }

        if ((args.shots_small_fired + args.shots_medium_fired) < 105) {
            return(`Since the very absolute minimum number of gauss shots to kill a Medusa in any configuration is 105, my dear ${interaction.member} you either need to check your inputs or stop trying to be funny`);
        }

        if ((args.shots_small_fired + args.shots_medium_fired) > 1000) {
            return(`Oh innocent puppy-eyed ${interaction.member} ... if you truly took more than 1,000 ammo rounds to kill a Medusa, you shouldn't be using an Ace score calculator to rate it ...`);
        }

        if (args.percenthulllost < 0) {
            return(`Unfortunately, ${interaction.member}, it's not possible to lose a NEGATIVE number of hull in a fight. Please check your inputs and try again`);
        }

        if (args.percenthulllost > 500) {
            return(`Oh wonderful ${interaction.member} padawan ... if you truly lost a total of more than 500% hull while killing a Medusa, you shouldn't be using an Ace score calculator to rate it ...`);
        }

        if (args.shots_small_fired > 0 && args.gauss_small_number === 0) {
            return(`Hey ${interaction.member} ... it appears you have small gauss shots fired, but no small gauss outfitted on your ship. Please check your inputs and try again.`);
        }

        if (args.shots_medium_fired > 0 && args.gauss_medium_number === 0) {
            return(`Hey ${interaction.member} ... it appears you have medium gauss shots fired, but no medium gauss outfitted on your ship. Please check your inputs and try again.`);
        }

        if (args.gauss_medium_number === 0 && args.gauss_small_number === 1) {
            if (args.ammo === "basic" || args.ammo === "standard") {
                return(`Sorry, a ${args.goid} run with ${args.gauss_number} ${args.gauss_type} gauss with ${args.ammo} ammo isn't possible.`);
            }
        }

        return(true)
    }
}