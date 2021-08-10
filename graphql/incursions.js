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

/*
{"data":{"pages":{"single":{"content":"![home.jpg](/img/home.jpg =1000x)\n\n# Welcome!\n\nWelcome to the Anti-Xeno Initiative Wiki. This is the primary repository of information gathered by the Anti-Xeno Initiative, here you will find tutorials, guides and all kinds of data regarding Thargoid Combat in Elite Dangerous.\n\n\n# Explore\n\nUse the **Search bar** at the **top** of this page to get started\n\n![](/img/2021-06-21_15_15_32-home___anti-xeno_initiative_wiki_-_beta.png)\n\nOr use the **Navigation bar** on the **left-hand** side to browse through the wiki.\n\nThe **Anti-Xeno Initiative Wiki** has many topics, if you can't find something, let us know in the **#website-discussion** channel in the AXI Discord.\n\n# Thargoid Activity\n\nInsert Content Here\n\n# Contribute\n![https://github.com/antixenoinitiative/axiwiki](/img/github.png =250x)\nWant to take part in the **Anti-Xeno Initiative Wiki** project? Head to our [GitHub Repository](https://github.com/antixenoinitiative/axiwiki) or join us in the [AXI discord](https://discord.gg/bqmDxdm).\n\n# Credits\n\nA big thanks to our content and development team! ❤️\n\n**Content Creators**\n- CMDR Aranionros Stormrage\n- CMDR Mechan\n- CMDR Aterius\n- CMDR EuanAB\n- CMDR Avasa Siuu\n- CMDR Maligno\n\n**Translators**\n- CMDR alterNERDtive\n- CMDR Trex63\n- CMDR Xarionn\n- CMDR St4n2012\n- CMDR Trebiscotti\n- CMDR AlexMG1\n- CMDR Domtron\n- CMDR Grincake\n- CMDR Batro\n- CDMR Blaston\n- CMDR Aileen Leith\n- CMDR Westboyrke\n- CMDR Habba-nero\n- CMDR Talixe\n- CMDR Jugom\n- CMDR Nauva\n- CMDR panther_neo\n- CMDR SGUDestiny\n- CMDR Archiebeales\n- CMDR Konstantine Novakov\n\n**Developers**\n- CMDR Sanctified (Willhof)\n\nAnd to everyone else in the Anti-Xeno Initiative who has helped make this project possible!\n"}}}}

*/