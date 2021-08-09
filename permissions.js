module.exports = {
    getRoles: (permissions) => {
        switch (permissions) {
            case 2: // Admin
                return [  
                    "380249268818018304",   // Overseer
                    "380248896385056769",   // Coordinator
                    "380248192534577152",   // Director
                ];
            case 1: // Contributor
                return [  
                    "468153018899234816",   // Mentor
                    "380249268818018304",   // Overseer
                    "380248896385056769",   // Coordinator
                    "380248192534577152"    // Director
                ];
            default: // Everyone
                return 0;
        }
    }
}