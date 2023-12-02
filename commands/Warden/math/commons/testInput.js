module.exports = {
    testInputs: (args, interaction) => {
        
        if ((args.gauss_small_number + args.gauss_medium_number) > 6) {
            return(`More than 6 gauss? Very funny ${interaction.member} ...`);
        }

        if ((args.gauss_small_number + args.gauss_medium_number) < 1) {
            return(`While trying to kill an interceptor without weapons is a noble attempt dear ${interaction.member} ... it kind of defeats the purpose of this calculator`);
        }
		
		if ((args.gauss_small_number < 0) || (args.gauss_medium_number < 0)){
			return(`Just how exactly are you planning to fit a negative number of gauss on your ship?`);
		}
		
		if ((args.shots_small_fired < 0) || (args.shot_medium_fired < 0)){
			return(`It is unfortunately not possible to kill a Thargoid interceptor while _gaining_ ammo ...`);
		}

        if (args.time_in_seconds > 7200) {
            return(`Oh my sweet summer child ${interaction.member} ... if you truly took more than 2 hours to kill the target interceptor, you shouldn't be using an Ace score calculator to rate it ...`);
        }

        if ((args.shots_small_fired + args.shots_medium_fired) > 1000) {
            return(`Oh innocent puppy-eyed ${interaction.member} ... if you truly took more than 1,000 ammo rounds to kill a Medusa, you shouldn't be using an Ace score calculator to rate it ...`);
        }

        if (args.percenthulllost < 0) {
            return(`Unfortunately, ${interaction.member}, it's not possible to lose a NEGATIVE number of hull in a fight. Please check your inputs and try again`);
        }

        if (args.percenthulllost > 500) {
            return(`Oh wonderful ${interaction.member} padawan ... if you truly lost a total of more than 500% hull while killing an interceptor, you shouldn't be using an Ace score calculator to rate it ...`);
        }

        if (args.shots_small_fired > 0 && args.gauss_small_number === 0) {
            return(`Hey ${interaction.member} ... it appears you have small gauss shots fired, but no small gauss outfitted on your ship. Please check your inputs and try again.`);
        }

        if (args.shots_medium_fired > 0 && args.gauss_medium_number === 0) {
            return(`Hey ${interaction.member} ... it appears you have medium gauss shots fired, but no medium gauss outfitted on your ship. Please check your inputs and try again.`);
        }

        return(true)
    }
}