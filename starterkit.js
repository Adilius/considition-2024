const https = require("https");
var fs = require("fs");

const gameUrl = "api.considition.com";
const apiKey = "ce0ac7ff-e609-49ac-bb0c-fdda42a6e1c4"; // API-key is sent in mail inbox
const mapFile = "Map-Gothenburg.json"; // Change map here

var obj = JSON.parse(fs.readFileSync(mapFile, "utf8"));
let numberOfCustomers = obj.customers.length;

const gameInput = {
    MapName: "Gothenburg",
    Proposals: [],
    Iterations: [],
};

const actionTypes = ["Award", "Skip"];
const awardTypes = ["IkeaFoodCoupon", "IkeaDeliveryCheck", "IkeaCheck", "GiftCard", "HalfInterestRate", "NoInterestRate"];
const actions = ["Skip", "IkeaFoodCoupon", "IkeaDeliveryCheck", "IkeaCheck", "GiftCard", "HalfInterestRate", "NoInterestRate"]

// Create object of params
function generateRandomParams() {
    let params = {};

    // Set name, months and interest for each customer
    let customerId = 0;
    for (let customer of obj.customers) {
        params["Customer" + customerId + "name"] = customer.name;
        params["Customer" + customerId + "months"] = Math.floor(Math.random() * 25);
        params["Customer" + customerId + "interest"] = Math.round(Math.random() * 100) / 100
        customerId++;
    }

    // Set random action and award for each customer for each month
    customerId = 0;
    for (let customer of obj.customers) {
        for (let i = 0; i < params["Customer" + customerId + "months"]; i++) {
            params["Customer" +customerId + "month" + i] = actions[Math.floor(Math.random() * actions.length)];
        };
        customerId++;
    }
    return params;
}

class Chromosome {
    constructor(parameters) {
        this.parameters = parameters;     // Example: {param1: value1, param2: value2}
        this.score = 0;                     // To hold the score from API
    }
}

function createPopulation(size) {
    const population = [];
    for (let i = 0; i < size; i++) {
        const randomParams = generateRandomParams();
        population.push(new Chromosome(randomParams));
    }
    return population;
}

// Convert chromosome parameters to gameInput
function chromosomeToGameInput(chromosome) {
    const gameInput = {
        MapName: "Gothenburg",
        Proposals: [],
        Iterations: [],
    };

    for (let i = 0; i < numberOfCustomers; i++) {
        gameInput.Proposals.push({
            CustomerName: chromosome.parameters["Customer" + i + "name"],
            MonthsToPayBackLoan: chromosome.parameters["Customer" + i + "months"],
            YearlyInterestRate: chromosome.parameters["Customer" + i + "interest"],
        });
    }


    console.log(gameInput)
    return gameInput;
}

// Call API and retrieve score
async function evaluateFitness(chromosome) {
    const score = await callAPI(chromosome.parameters);
    chromosome.score = score;
}

const randomparams = new Chromosome(generateRandomParams());
console.log(randomparams);
chromosomeToGameInput(randomparams)

//console.log(JSON.stringify(gameInput, null, 2));
gameInput.Iterations.forEach((element) => {
    //console.log(element);
});


function callAPI(gameInput) {
    const options = {
        hostname: gameUrl,
        path: "/game",
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
        },
    };

    const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => {
            body += chunk;
        });

        res.on("end", () => {
            if (res.statusCode === 200) {
                console.log("Reponse:");
                console.log(JSON.parse(body, null, 2));
            } else {
                console.error(`Error: ${res.statusCode} - ${body}`);
            }
        });
    });

    req.write(JSON.stringify(gameInput));
    req.end();
} 
