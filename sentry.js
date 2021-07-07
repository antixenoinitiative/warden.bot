
/* Testing ED API pull */
var request = require('request');

request('https://cms.zaonce.net/en-GB/jsonapi/node/galnet_article', function (error, response, body) {
  if (!error && response.statusCode == 200) {
     var importedJSON = JSON.parse(body);
     console.log(importedJSON);
  }
})
