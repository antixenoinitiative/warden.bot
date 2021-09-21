/**
 * A collection of util methods used in several files accross the application.
 * 
 * @author F0rd Pr3f3ct (@FPr3f3ct)
 */

exports.dynamicsort = function (property,order) {
    var sort_order = 1;
    if(order === "desc"){
        sort_order = -1;
    }
    return function (a, b){
        // a should come before b in the sorted order
        if(a[property] < b[property]){
                return -1 * sort_order;
        // a should come after b in the sorted order
        }else if(a[property] > b[property]){
                return 1 * sort_order;
        // a and b are the same
        }else{
                return 0 * sort_order;
        }
    }
}

exports.isNoneOrEmpty = function (aString){
    return (!aString || aString.length === 0) ? 'None' : aString;
}

exports.isNoneOrEmptyArray = function (anArray) {
    return (!anArray || anArray.length === 0);
}


exports.abbrieviate = function (longName){
    var tokens = longName.split(' ');
    return tokens.map((token) => token[0]).join('');
}

exports.expand = function (abbreviation){
    switch (abbreviation) {
        case 'AXI':
            return "Anti Xeno Initiative";
            break;
        case 'XRG':
            return "Xeno Research Group"
            break;
        default:
            return "Sorry, I do not know the abbreviation '" + abbreviation + "'.";
            break;
    }
}
