var request = require('request');

request('http//exmaple.com/sample_data.json', function (error, response, body) {
  if (!error && response.statusCode == 200) {
     var importedJSON = JSON.parse(body);
     console.log(importedJSON);
  }
})