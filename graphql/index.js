const fetch = require('node-fetch');

async function query(querystring) {
    let response;
    await fetch('https://wiki.antixenoinitiative.com/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
    body: JSON.stringify({query: querystring})
    })
    .then(r => r.json())
    .then(data => { response = JSON.stringify(data) });
    return response;
}

module.exports = {
    search: async (searchstring) => {
        let results = await query(`{ pages { search(query: "${searchstring}") { results { id, title, description, path, locale } } } }`)
        answer = JSON.parse(results).data.pages.search.results;
        let EnOnly = {};
        for (let i = 0; i < answer.length; i++) {
            console.log(answer[i].locale);
            if (answer[i].locale == "en") {
                EnOnly[i] = answer[i];
            }
        }
        for (key in EnOnly) {
            console.log(EnOnly[key].title)
        }
        return EnOnly;
    }
}
