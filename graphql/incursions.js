const { getPageContent, updatePageContent } = require("./index");

let testdata = [
    {
        name: "system 1",
        presence: "Moderate Thargoid Presence"
    },
    {
        name: "system 2",
        presence: "Significant Thargoid Presence"
    }
]

let start = "Thargoid Activity\n\n"
let end = "\n\n# Contribute"

async function updateHome(incursions) {
    let content = await getPageContent(2);
    let contentString = JSON.parse(content).data.pages.single.content;
    let StringArray = contentString.split(start);
    let first = JSON.stringify(StringArray[0] + start);
    StringArray = contentString.split(end);
    let last = JSON.stringify(end + StringArray[1])

    let mid = "- New Row 1\\n- New Row 2"
    
    let newContent = first.replace(/^"(.+(?="$))"$/, '$1') + mid + last.replace(/^"(.+(?="$))"$/, '$1');;
    console.log(newContent);

    await updatePageContent(2,newContent)
}

module.exports = {
    updateIncursions: async (incursions) => {
        try {
            await updateHome(incursions);
        } catch (err) {
            console.error(err)
        }
    }
}