const https = require("https");
const fs = require("fs");
const axios = require('axios');

const gameUrl = "localhost:8080";
//const gameUrl = "api.considition.com"; // Change to your own URL
const apiKey = "ce0ac7ff-e609-49ac-bb0c-fdda42a6e1c4"; // API-key is sent in mail inbox
const mapFile = "Map-Gothenburg.json"; // Change map here
//const mapFile = "Map-Nottingham.json"; // Change map here

var obj = JSON.parse(fs.readFileSync(mapFile, "utf8"));
let numberOfCustomers = obj.customers.length;
let gameLengthMonths = obj.gameLengthInMonths;
let generations = 10000000;
let generationCounter = 1;
let populationSize = 50;
let mutationRate = 0.05;

const actions = ["Skip", "IkeaFoodCoupon", "IkeaDeliveryCheck", "IkeaCheck", "GiftCard", "HalfInterestRate", "NoInterestRate"]

// Create object of params
function generateRandomParams() {
    let params = {};

    // Set name, months and interest for each customer
    let customerId = 0;
    for (let customer of obj.customers) {
        params["Customer" + customerId + "name"] = customer.name;
        params["Customer" + customerId + "months"] = Math.floor(Math.random() * (gameLengthMonths) * 4);
        params["Customer" + customerId + "interest"] = Math.round(Math.random() * 100) / 100;
        customerId++;
    }

    // Set random action and award for each customer for each month
    customerId = 0;
    for (let customer of obj.customers) {
        for (let i = 0; i < gameLengthMonths; i++) {
            params["Customer" + customerId + "month" + i] = actions[Math.floor(Math.random() * actions.length)];
        };
        customerId++;
    }
    return params;
}

/**
 * Represents a chromosome in the genetic algorithm.
 * Each chromosome contains a set of parameters and a score.
 * The parameters are used to generate game inputs, and the score is obtained from the API.
 */
class Chromosome {
    constructor(parameters) {
        this.parameters = parameters;     // Example: {param1: value1, param2: value2}
        this.score = 0;                     // To hold the score from API
    }
}

function createPopulation() {
    const population = [];
    for (let i = 0; i < populationSize; i++) {
        population.push(new Chromosome(generateRandomParams()));
    }
    return population;
}

// Convert chromosome parameters to gameInput, use this before calling API
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

    for (let currMonth = 0; currMonth < gameLengthMonths; currMonth++) {
        const monthActions = {};
        for(let currCustomer = 0; currCustomer < numberOfCustomers; currCustomer++){
            monthActions[chromosome.parameters["Customer" + currCustomer + "name"]] = {
                Type: chromosome.parameters["Customer" + currCustomer + "month" + currMonth] === "Skip" ? "Skip" : "Award",
                Award: chromosome.parameters["Customer" + currCustomer + "month" + currMonth] === "Skip" ? "None" : chromosome.parameters["Customer" + currCustomer + "month" + currMonth],
            }
        }
        gameInput.Iterations.push(monthActions);
    }
    return gameInput;
}

// Call API and retrieve score
async function evaluateFitness(chromosome) {
    const score = await callAPIWithRetry(chromosome);
    chromosome.score = score;
}

// Select the best chromosomes based on their fitness score
function select(population) {
    population.sort((a, b) => b.score - a.score);
    const selected = population.slice(0, Math.floor(population.length / 4));
    return selected;
}

// Mutate a chromosome
function mutate(chromosome) {
    for (const key in chromosome.parameters) {
        if (Math.random() < mutationRate) {
            if (key.includes("months")) {
                chromosome.parameters[key] = Math.floor(Math.random() * (gameLengthMonths + 1));
            } else if (key.includes("interest")) {
                chromosome.parameters[key] = Math.round(Math.random() * 100) / 100;
            } else if (key.includes("month")) {
                chromosome.parameters[key] = actions[Math.floor(Math.random() * actions.length)];
            }
        }
    }
}

// Combine two chromosomes to create a new one
function crossover(chromosome1, chromosome2) {
    const newParams = {};
    for (const key in chromosome1.parameters) {
        newParams[key] = Math.random() > 0.5 ? chromosome1.parameters[key] : chromosome2.parameters[key];
    }
    return new Chromosome(newParams);
}

async function callAPI(chromosome, submitToServer = false) {
    const gameInput = chromosomeToGameInput(chromosome);

    let url = gameUrl.includes('localhost') ? `http://${gameUrl}/game` : `https://${gameUrl}/game`;
    if(submitToServer){
        url = "https://api.considition.com/game";
        console.log("Submitting to Server API");
    }

    try {
        const response = await axios.post(url, gameInput, {
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
            },
        });

        if (response.status === 200) {
            return response.data.score.totalScore;
        } else {
            throw new Error(`Error: ${response.status} - ${response.data}`);
        }
    } catch (error) {
        if (error.response) {
            throw new Error(`Error: ${error.response.status} - ${error.response.data}`);
        } else {
            throw new Error(`Request error: ${error.message}`);
        }
    }
}

async function callAPIWithRetry(chromosome, retries = 5, delay = 1000) {
    try {
        return await callAPI(chromosome);
    } catch (error) {
        const statusCode = parseInt(error.message.split(" - ")[0].replace("Error: ", ""), 10);

        // Retry logic for 429 (rate limit) errors
        if (statusCode === 429 && retries > 0) {
            console.warn(`Rate limit hit. Retrying after ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            return callAPIWithRetry(chromosome, retries - 1, delay * 2);
        } else {
            throw error; // Re-throw if not a rate limit error or retries exhausted
        }
    }
}

async function runGeneticAlgorithm(){
    let population = createPopulation();
    for (let gen = 0; gen < generations; gen++) {
        await Promise.all(population.map(evaluateFitness));
        const selected = select(population);
        const newPopulation = selected;
        while(newPopulation.length < populationSize){
            const parent1 = selected[Math.floor(Math.random() * selected.length)];
            const parent2 = selected[Math.floor(Math.random() * selected.length)];
            const child = crossover(parent1, parent2);
            mutate(child);
            newPopulation.push(child);
            await callAPI(population[0], submitToServer = false);
        }
        let bestScore = population.sort((a, b) => b.score - a.score)[0];
        console.log("Generation", gen + 1, "done. Best score:", bestScore.score);
        population = newPopulation;
        generationCounter++;
        if(generationCounter % 50 == 0){
            callAPI(population[0], submitToServer = true);
        }
    }

    // Evaluate fitness of the final population
    await Promise.all(population.map(evaluateFitness));
    // Return the best solution
    return population.sort((a, b) => b.score - a.score)[0];
}

// Run the program
(async () => {
    try {
        const bestChromosome = await runGeneticAlgorithm();
        console.log('Best score:', bestChromosome.score);
    } catch (error) {
        console.error('Error during genetic algorithm execution:', error);
    }
})();
