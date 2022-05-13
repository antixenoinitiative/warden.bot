const QuickChart = require('quickchart-js');


module.exports = {
    getChart: (result) => {
        // Chart creation

        const chart = new QuickChart();
        chart.setWidth(400)
        chart.setHeight(400);
        chart.setBackgroundColor('transparent');
        chart.setConfig({
            "type": "radar",
            "data": {
              "labels": [
                "Time\nPenalty",
                "Ammo\nUsage\nPenalty",
                "Damage\nPenalty"
              ],
              "datasets": [
                {
                  "backgroundColor": "rgba(228, 107, 26, 0.2)",
                  "borderColor": "rgb(228, 107, 26)",
                  "data": [
                    result.timePenalty/3,
                    result.ammoPenalty/3,
                    result.damagePenalty/3
                    
                  ],
                  "label": "Your Run"
                }
        // At some point want to add an optional parameter to compare to "best run" - here for that purpose
        //                ,
        //                {
        //                    "backgroundColor": "rgba(255, 159, 64, 0.5)",
        //                    "borderColor": "rgb(255, 159, 64)",
        //                    "data": [
        //                      100,
        //                      100,
        //                      100-1.75,
        //                      100,
        //                      100-0.5,
        //                    ],
        //                    "label": "Current Best",
        //                    "fill": "-1"
        //                }
            ]
          },
            "options": {

                "maintainAspectRatio": true,
                "spanGaps": false,

                "legend": {
                    "display": true,
                    "labels": {
                        "fontColor": "rgb(255, 255, 255)",
                        // Somehow chart doesn't like font size setting for both labels and pointLabels
                        //"fontSize": "18"
                    }
                },
        
                "scale": {
                    
                    "pointLabels": {
                        "fontColor": "rgba(228, 107, 26, 1)",
                        "fontSize": "16"
                    },

                    "angleLines": {
                        "color": "rgba(255 , 255, 255, 0.2)",
                        "borderDash": [10,10]
                    },

                    "ticks": {
                        "max": 40,
                        "min": 0,
                        "stepSize": 10,
                        "backdropColor": "transparent"
                    },
                },

                "elements": {
                    "line": {
                        "tension": 0.000001
                    }
                },

                "plugins": {
                    "filler": {
                        "propagate": false
                    },
                    "samples-filler-analyser": {
                        "target": "chart-analyser"
                    }
                }
            }
        });
        return chart.getUrl();
    }
}