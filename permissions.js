module.exports = {
    getRoles: (permlvl) => {
        switch (permlvl) {
            case 2: // Admin
                return [  
                    "380249268818018304",   // Overseer
                    "380248896385056769",   // Coordinator
                    "380248192534577152",   // Director
                    "468153018899234816"    // Mentor
                ];
            case 1: // Contributor
                return [  
                    "468153018899234816"    // Mentor
                ];
            default: // Everyone
                return 0;
        }
    }
}