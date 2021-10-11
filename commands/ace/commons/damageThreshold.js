/* eslint-disable complexity */
module.exports = {
    calculateThreshold: (args) => {
        let damage_threshold;
        switch (args.gauss_medium_number) {
            case 0:
                switch (args.gauss_small_number) {
                    case 1:
                        switch (args.ammo) {
                            case "premium":
                                damage_threshold = 80166.53;
                                break;
                        }
                        break;
                    case 2:
                        switch (args.ammo) {
                            case "basic":
                                damage_threshold = 6771.04;
                                break;
                            case "standard":
                                damage_threshold = 5798.21;
                                break;
                            case "premium":
                                damage_threshold = 5357.04;
                                break;
                        }
                        break;
                    case 3:
                        switch (args.ammo) {
                            case "basic":
                                damage_threshold = 4848.00;
                                break;
                            case "standard":
                                damage_threshold = 4571.66;
                                break;
                            case "premium":
                                damage_threshold = 4411.68;
                                break;
                        }
                        break;
                    case 4:
                        switch (args.ammo) {
                            case "basic":
                                damage_threshold = 4298.56;
                                break;
                            case "standard":
                                damage_threshold = 4181.40;
                                break;
                            case "premium":
                                damage_threshold = 4096.56;
                                break;
                        }
                        break;
                    }
                    break;
            case 1:
                switch (args.gauss_small_number) {
                    case 0:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 8399.16;
                                break;
                            case "standard":
                                damage_threshold = 6764.58;
                                break;
                            case "premium":
                                damage_threshold = 5845.48;
                                break;
                        }
                        break;
                    case 1:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 5041.92;
                                break;
                            case "standard":
                                damage_threshold = 4734.27;
                                break;
                            case "premium":
                                damage_threshold = 4458.95;
                                break;
                        }
                        break;
                    case 2:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4367.24;
                                break;
                            case "standard":
                                damage_threshold = 4232.51;
                                break;
                            case "premium":
                                damage_threshold = 4075.55;
                                break;
                        }
                        break;     
                    case 3:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4112.72;
                                break;
                            case "standard":
                                damage_threshold = 4023.44;
                                break;
                            case "premium":
                                damage_threshold = 3912.74;
                                break;
                        }
                        break;
                }
                break;
            case 2:
                switch (args.gauss_small_number) {
                    case 0:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4553.08;
                                break;
                            case "standard":
                                damage_threshold = 4455.51;
                                break;
                            case "premium":
                                damage_threshold = 4227.86;
                                break;
                        }
                        break;  
                    case 1:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4153.12;
                                break;
                            case "standard":
                                damage_threshold = 4037.37;
                                break;
                            case "premium":
                                damage_threshold = 3933.75;
                                break;
                        }
                        break;  
                    case 2:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4007.68;
                                break;
                            case "standard":
                                damage_threshold = 3897.99;
                                break;
                            case "premium":
                                damage_threshold = 3823.46;
                                break;
                        }
                        break;
                }
                break;
            case 3:
                switch (args.gauss_small_number) {
                    case 0:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 4044.04;
                                break;
                            case "standard":
                                damage_threshold = 4097.77;
                                break;
                            case "premium":
                                damage_threshold = 3933.75;
                                break;
                        }
                        break;
                    
                    case 1:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 3882.44;
                                break;
                            case "standard":
                                damage_threshold = 3823.66;
                                break;
                            case "premium":
                                damage_threshold = 3765.68;
                                break;
                        }
                    break;
                    }
                    break;
            case 4:
                switch (args.gauss_small_number) {
                    case 0:
                        switch (args.ammo) {
                            case "basic":  
                                damage_threshold = 3874.36;
                                break;
                            case "standard":
                                damage_threshold = 3967.68;
                                break;
                            case "premium":
                                damage_threshold = 3860.22;
                                break;
                        }
                    break;
                }
            break;
        }
        return damage_threshold;
    }
}