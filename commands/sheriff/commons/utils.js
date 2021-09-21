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
    return function (a, b) {
        var result;
        // a should be before b in the sorted order
        if (a[property] < b[property]) {
            result = -1 * sort_order;
        // a should be after b in the sorted order
        } else if (a[property] > b[property]) {
            result = sort_order;
        // a and b are the same
        } else {
            result = 0;
        }
        return result;
    }
}

exports.isNoneOrEmpty = function (aString){
    var result
    if(!aString || aString.length === 0){
        result = 'None';
     } else {
        result = aString;
     }
         
    return result;
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

        case 'XRG':
            return "Xeno Research Group";

        default:
            return "Sorry, I do not know the abbreviation '" + abbreviation + "'.";
    }
}
