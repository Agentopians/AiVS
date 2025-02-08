import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { AbiItem, Web3, eth as Web3Eth } from 'web3';
import { ethers } from 'ethers';
import pino from 'pino';
import { Signature, init as blsInit } from "./eigensdk/crypto/bls/attestation.js"
import { AvsRegistryService } from "./eigensdk/services/avsregistry/avsregistry.js";
import { BlsAggregationService, BlsAggregationServiceResponse } from "./eigensdk/services/bls-aggregation/blsagg.js";
import { OperatorsInfoServiceInMemory } from "./eigensdk/services/operatorsinfo/operatorsinfo-inmemory.js";
import { BuildAllConfig, buildAll } from "./eigensdk/chainio/clients/builder.js";
import * as chainioUtils from "./eigensdk/chainio/utils.js";
import { g1ToTuple, g2ToTuple, timeout } from './utils/index.js'
import { decodeTxReceiptLogs } from './eigensdk/utils/helpers.js'
import { AsyncQueue } from './eigensdk/services/bls-aggregation/async-queue.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import 'dotenv/config';
const QUORUM_THRESHOLD_PERCENTAGE = 100;

// Create __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Logger setup
const logger = pino({
    level: 'info', // Set log level here
    // prettyPrint: { colorize: true }
    transport: {
        target: 'pino-pretty'
    },
});

export const sigAggQue: AsyncQueue = new AsyncQueue();

class Aggregator {
    // @ts-ignore
    private web3: Web3;
    private config: any;
    // @ts-ignore
    private aggregatorAddress: string;
    // @ts-ignore
    private aggregatorECDSAPrivateKey: string;
    private clients: any;
    private taskManagerABI: AbiItem[] = [];
    private taskManager: any;
    // @ts-ignore
    private blsAggregationService: BlsAggregationService;
    // @ts-ignore
    private app: express.Application;

    constructor(config: any) {
        this.config = config;
    }

    async init() {
        this.web3 = new Web3(new Web3.providers.HttpProvider(this.config.eth_rpc_url));
        this.loadECDSAKey();
        await this.loadClients();
        await this.loadTaskManager();
        this.loadBlsAggregationService();
        this.app = express();
        this.app.use(bodyParser.json());
        this.app.post('/signature', this.submitSignature.bind(this));
    }

    private loadECDSAKey(): void {
        const ecdsaKeyPassword = process.env.AGGREGATOR_ECDSA_KEY_PASSWORD || '';
        if (!ecdsaKeyPassword) {
            logger.warn("AGGREGATOR_ECDSA_KEY_PASSWORD not set. using empty string.");
            //     throw new Error("AGGREGATOR_ECDSA_KEY_PASSWORD environment variable is required");
        }

        try {
            const keystorePath = path.join(__dirname, this.config.ecdsa_private_key_store_path);
            if (!fs.existsSync(keystorePath)) {
                throw new Error(`Keystore file not found at path: ${keystorePath}`);
            }

            const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf-8'));
            try {
                const wallet = ethers.Wallet.fromEncryptedJsonSync(JSON.stringify(keystore), ecdsaKeyPassword);
                this.aggregatorECDSAPrivateKey = wallet.privateKey;
                this.aggregatorAddress = wallet.address;
                logger.info(`Successfully loaded ECDSA key for address: ${this.aggregatorAddress}`);
            } catch (error) {
                throw new Error(`Failed to decrypt keystore: ${error.message}. Please check your AGGREGATOR_ECDSA_KEY_PASSWORD`);
            }
        } catch (error) {
            logger.error(error);
            throw error;
        }
    }

    private async loadClients(): Promise<void> {
        const cfg = new BuildAllConfig(
            this.config.eth_rpc_url,
            this.config.avs_registry_coordinator_address,
            this.config.operator_state_retriever_address,
            "ai-agent",
            this.config.eigen_metrics_ip_port_address
        );
        this.clients = await buildAll(cfg, this.aggregatorECDSAPrivateKey, logger);
    }

    private async loadTaskManager(): Promise<void> {
        const serviceManagerAddress = this.clients.avsRegistryWriter.serviceManagerAddr;
        const serviceManagerABI = fs.readFileSync("abis/AiAgentServiceManager.json", "utf-8");
        const serviceManager = new this.web3.eth.Contract(JSON.parse(serviceManagerABI), serviceManagerAddress);
        const taskManagerAddress: string = await serviceManager.methods.AiAgentTaskManager().call();
        const taskManagerABI = fs.readFileSync("abis/AiAgentTaskManager.json", "utf-8");
        this.taskManagerABI = JSON.parse(taskManagerABI) as AbiItem[];
        this.taskManager = new this.web3.eth.Contract(this.taskManagerABI, taskManagerAddress);
    }


private validateBlsSignatureData(nonSignersStakesAndSignature: any[]): boolean {
    try {
        const [
            nonSignerQuorumBitmapIndices,
            nonSignersPubKeysG1,
            quorumApksG1,
            signersApkG2,
            signersAggSigG1,
            quorumApkIndices,
            totalStakeIndices,
            nonSignerStakeIndices
        ] = nonSignersStakesAndSignature;

        // Basic structure validation
        if (!Array.isArray(quorumApksG1) || !Array.isArray(signersApkG2) || !Array.isArray(signersAggSigG1)) {
            logger.error("Invalid BLS signature data structure");
            return false;
        }

        // Validate each component
        if (quorumApksG1.some(arr => !Array.isArray(arr) || arr.length !== 2)) {
            logger.error("Invalid quorumApksG1 format");
            return false;
        }

        if (!Array.isArray(signersApkG2) || signersApkG2.length !== 2) {
            logger.error("Invalid signersApkG2 format");
            return false;
        }

        if (!Array.isArray(signersAggSigG1) || signersAggSigG1.length !== 2) {
            logger.error("Invalid signersAggSigG1 format");
            return false;
        }

        return true;
    } catch (error) {
        logger.error({ error }, "Error validating BLS signature data");
        return false;
    }
}
    private loadBlsAggregationService(): void {
        const operatorInfoService = new OperatorsInfoServiceInMemory(
            this.clients.avsRegistryReader,
            { logger },
        );

        const avsRegistryService: AvsRegistryService = new AvsRegistryService(
            this.clients.avsRegistryReader,
            operatorInfoService,
            logger
        );

        const hasher = (task: any) => {
            const encoded = Web3Eth.abi.encodeParameters(["uint32", "string"], [task.taskIndex, task.metadataUrl]);
            return Web3.utils.keccak256(encoded);
        };

        this.blsAggregationService = new BlsAggregationService(avsRegistryService, hasher);
    }

    public async submitSignature(req: Request, res: Response): Promise<void> {
        const data = req.body;
        console.log('submitSignature data', data);
        const signature = new Signature(BigInt(data.signature.X), BigInt(data.signature.Y));
        const taskIndex = data.task_id;
        const taskResponse = {
            taskIndex,
            metadataUrl: data.metadata_url,
            blockNumber: data.block_number
        };

        try {
            await this.blsAggregationService.processNewSignature(
                taskIndex, taskResponse, signature, data.operator_id
            );
            res.status(200).send('true');
        } catch (e) {
            // console.log(e)
            logger.error(e, `Submitting signature failed: ${e}`);
            res.status(500).send('false');
        }
    }

    public startServer(): void {
        const [host, port] = this.config.aggregator_server_ip_port_address.split(':');
        this.app.listen(parseInt(port, 10), host, () => {
            logger.info(`Server started at http://${host}:${port}`);
        });
    }

    public async sendNewTask(i: number): Promise<number> {
        const tx = this.taskManager.methods.createNewTask(
            "https://www.google.com",
            QUORUM_THRESHOLD_PERCENTAGE,
            chainioUtils.numsToBytes([0]),
        ).send({
            from: this.aggregatorAddress,
            gas: 2000000,
            gasPrice: this.web3.utils.toWei('20', 'gwei'),
            nonce: await this.web3.eth.getTransactionCount(this.aggregatorAddress),
            chainId: await this.web3.eth.net.getId()
        });

        const receipt = await tx;
        // @ts-ignore
        const event = decodeTxReceiptLogs(receipt, this.taskManagerABI)[0];
        const taskIndex = event.taskIndex;
        logger.info(`Successfully sent the new task ${taskIndex}`);
        const taskInfo = await this.blsAggregationService.initializeNewTask(
            taskIndex,
            receipt.blockNumber,
            [0],
            [100],
            60000
        );
        return taskIndex;
    }

    public async startSendingNewTasks(): Promise<void> {
        let i = 0;
        while (true) {
            logger.info('Sending new task');

            await this.sendNewTask(i);
            i += 1;

            await timeout(10000)
        }
    }

    public async startSubmittingSignatures(): Promise<void> {
        const aggregatedResponseChannel = this.blsAggregationService.getAggregatedResponseChannel();

        for await (const _aggResponse of aggregatedResponseChannel) {
            const aggregatedResponse: BlsAggregationServiceResponse = _aggResponse;
            const response = aggregatedResponse.taskResponse;

            try {
                // Format task data
                const task = [
                    response.metadataUrl,
                    response.blockNumber,
                    chainioUtils.numsToBytes([0]),
                    QUORUM_THRESHOLD_PERCENTAGE
                ];

                const taskResponse = [
                    response.taskIndex,
                    true,
                    response.metadataUrl
                ];

                // Convert big numbers to proper format
                const formatBigNumbers = (arr: any[]) => {
                    return arr.map(item => {
                        if (Array.isArray(item)) {
                            return formatBigNumbers(item);
                        }
                        // If it's a scientific notation number or very large number
                        if (typeof item === 'number' || /e\+/.test(String(item))) {
                            return this.web3.utils.toBN(item).toString();
                        }
                        return item;
                    });
                };
                
                const nonSignersStakesAndSignature = [
                    aggregatedResponse.nonSignerQuorumBitmapIndices,
                    aggregatedResponse.nonSignersPubKeysG1.map(g1ToTuple),
                    formatBigNumbers(aggregatedResponse.quorumApksG1.map(g1ToTuple)),
                    formatBigNumbers(g2ToTuple(aggregatedResponse.signersApkG2)),
                    formatBigNumbers(g1ToTuple(aggregatedResponse.signersAggSigG1)),
                    aggregatedResponse.quorumApkIndices,
                    aggregatedResponse.totalStakeIndices,
                    aggregatedResponse.nonSignerStakeIndices,
                ];

                // Log the formatted data
                logger.info({
                    formattedTask: task,
                    formattedTaskResponse: taskResponse,
                    formattedNonSignersStakesAndSignature: nonSignersStakesAndSignature
                }, "Formatted data for contract call");

                // Try to estimate gas first
                try {
                    const gasEstimate = await this.taskManager.methods.respondToTask(
                        task,
                        taskResponse,
                        nonSignersStakesAndSignature
                    ).estimateGas({ from: this.aggregatorAddress });
                    
                    logger.info({ gasEstimate }, "Gas estimation successful");
                } catch (estimateError) {
                    logger.error({
                        error: estimateError.message,
                        data: estimateError.data
                    }, "Gas estimation failed - likely contract revert");
                    continue; // Skip this iteration if gas estimation fails
                }
                if (!this.validateBlsSignatureData(nonSignersStakesAndSignature)) {
                    logger.error("Invalid BLS signature data, skipping transaction");
                    continue;
                }
                const txParams = {
                    from: this.aggregatorAddress,
                    gas: 2000000,
                    gasPrice: await this.web3.eth.getGasPrice(),
                    nonce: await this.web3.eth.getTransactionCount(this.aggregatorAddress),
                    chainId: await this.web3.eth.net.getId()
                };

                const tx = await this.taskManager.methods.respondToTask(
                    task,
                    taskResponse,
                    nonSignersStakesAndSignature
                ).send(txParams);

                logger.info({
                    taskIndex: response.taskIndex,
                    txHash: tx.transactionHash,
                }, "Task response registered onchain");

            } catch (error) {
                logger.error({
                    error: error.message,
                    errorName: error.name,
                    stack: error.stack,
                    code: error.code,
                    data: error.data
                }, "Error submitting task response");

                // Try to decode the error if possible
                if (error.data) {
                    try {
                        const decodedError = this.web3.eth.abi.decodeParameter('string', error.data);
                        logger.error({ decodedError }, "Decoded contract error");
                    } catch (decodeError) {
                        // Ignore decode error
                    }
                }
            }
        }
    }
}


async function main() {
    try {
        await blsInit();

        const configPath = "config-files/aggregator.yaml";
        if (!fs.existsSync(configPath)) {
            throw new Error(`Config file not found at: ${configPath}`);
        }

        const config = yaml.load(fs.readFileSync(configPath, "utf8"));
        if (!config) {
            throw new Error("Failed to load config file");
        }

        const aggregator = new Aggregator(config);
        await aggregator.init();

        return Promise.all([
            aggregator.startSendingNewTasks(),
            aggregator.startSubmittingSignatures(),
            aggregator.startServer()
        ]);
    } catch (error) {
        logger.error(error, "Fatal error during initialization");
        throw error;
    }
}

main()
    .catch(error => {
        logger.error(error, "Fatal error");
        console.log("An error occurred. Terminating aggregator process.");
    })
    .finally(() => {
        process.exit(1); // Changed to exit with error code 1 when there's an error
    });
