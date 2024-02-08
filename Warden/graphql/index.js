try {
    const fetch = require('node-fetch');

// Perform graphQL Query to wiki.antixenoinitiative.com
async function query(querystring) {
    let response;
    await fetch('https://wiki.antixenoinitiative.com/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GRAPHKEY}`,
            'Accept': 'application/json',
        },
    body: JSON.stringify({query: querystring, variables: {},})
    })
    .then(r => r.json())
    .then(data => { response = JSON.stringify(data) });
    return response;
}

async function mutation(mutatestring) {
    await fetch('https://wiki.antixenoinitiative.com/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GRAPHKEY}`,
            'Accept': 'application/json',
        },
    body: JSON.stringify({mutation: mutatestring, variables: {},})
    })
    .then(res => console.log(res))
    return;
}

module.exports = {
    search: async (searchstring) => {
        try {
        let results = await query(`{ pages { search (query: "${searchstring}") { results { id, title, description, path, locale } } } }`)
        let answer = JSON.parse(results).data.pages.search.results;
        let EnOnly = [];
        for (let i = 0; i < answer.length; i++) {
            if (answer[i].locale == "en") {
                var result = {
                  "id": answer[i].id,
                  "title": answer[i].title,
                  "description": answer[i].description,
                  "path": answer[i].path,
                  "locale": answer[i].locale
                }
                EnOnly.push(result);
            }
        }
        return EnOnly;
        } catch (err) {
            console.log(err);
        }
    },
    getPageContent: async (pageID) => {
        try {
            let results = await query(`{ pages { single (id: ${pageID}) { content } } }`)
            return results;
        } catch (err) {
            console.log(err);
        }
    },
    updatePageContent: async (pageID, content) => {
        try {
            let results = await mutation(`
            { pages {
                update (id: ${pageID}, content: "${content}", isPublished: true) {
                  responseResult {
                    succeeded
                    errorCode
                    slug
                    message
                  }
                }
                render(id: ${pageID}) {
                  responseResult {
                    succeeded
                    errorCode
                    slug
                    message
                  }
                }
              } 
            }`);
            return results;
        } catch (err) {
            console.log(err);
        }
    }
}
}
catch (e) {
    console.log("FAIL STILL",e)
}
