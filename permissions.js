module.exports = {
    getRoles: (permlvl) => {
        switch (permlvl) {
            case 2: // Admin
                return [  
                    "380249268818018304",
                    "380248896385056769",
                    "380248192534577152"
                ];
            case 1: // Contributor
                return [  
                    "468153018899234816"
                ];
            default: // Everyone
                return 0;
        }
    }
}