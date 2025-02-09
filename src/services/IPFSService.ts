import { ThirdwebStorage } from "@thirdweb-dev/storage";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import fetch from "node-fetch";
import path from "path";

// Add fetch to global scope for Node.js environment
// @ts-ignore
global.fetch = fetch;

export interface IPFSConfig {
    clientId: string;
    secretKey: string;
}

export class IPFSService {
    private storage: ThirdwebStorage;

    constructor(config: IPFSConfig) {
        this.storage = new ThirdwebStorage({
            clientId: config.clientId,
            secretKey: config.secretKey,
        });
    }

    /**
     * Upload a file to IPFS
     * @param filePath Path to the file to upload
     * @returns IPFS URI and Gateway URL
     */
    async uploadFile(filePath: string) {
        try {
            const fileContent = readFileSync(filePath);
            const uri = await this.storage.upload(fileContent);
            const gatewayUrl = this.storage.resolveScheme(uri);

            return {
                uri,
                gatewayUrl,
            };
        } catch (error) {
            console.error('Failed to upload file:', error);
            throw new Error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Upload JSON data to IPFS
     * @param data JSON data to upload
     * @returns IPFS URI and Gateway URL
     */
    async uploadJson(data: any) {
        try {
            const uri = await this.storage.upload(data);
            const gatewayUrl = this.storage.resolveScheme(uri);

            return {
                uri,
                gatewayUrl,
            };
        } catch (error) {
            console.error('Failed to upload JSON:', error);
            throw new Error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Download data from IPFS
     * @param uri IPFS URI to download from
     * @returns Downloaded data
     */
    async download(uri: string) {
        try {
            return await this.storage.download(uri);
        } catch (error) {
            console.error('Failed to download from IPFS:', error);
            throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Download and save file from IPFS
     * @param uri IPFS URI to download from
     * @param outputPath Path where to save the downloaded file
     */
    async downloadToFile(uri: string, outputPath: string) {
        try {
            const data = await this.download(uri);
            const outputDir = path.dirname(outputPath);
            const response = await fetch(data.url);
            const fileContent = await response.arrayBuffer();
            const buffer = Buffer.from(fileContent);

            // Ensure output directory exists
            if (!existsSync(outputDir)) {
                mkdirSync(outputDir, { recursive: true });
            }
            writeFileSync(outputPath, buffer);

            return outputPath;
        } catch (error) {
            console.error('Failed to download and save file:', error);
            throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Download and parse JSON from IPFS
     * @param uri IPFS URI to download from
     * @returns Parsed JSON data
     */
    async downloadJson(uri: string) {
        try {
            const data = await this.storage.download(uri);
            const response = await fetch(data.url);
            const fileContent = await response.arrayBuffer();
            const buffer = Buffer.from(fileContent);
            return buffer.toString()
        } catch (error) {
            console.error('Failed to download and parse JSON:', error);
            throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get gateway URL for an IPFS URI
     * @param uri IPFS URI
     * @returns Gateway URL
     */
    getGatewayUrl(uri: string): string {
        return this.storage.resolveScheme(uri);
    }
    //get the metadata from the ipfs uri
    async getMetadataFromUri(uri: string) {
        const response = await fetch(uri);
        const fileContent = await response.arrayBuffer();
        const buffer = Buffer.from(fileContent);
        console.log(buffer.toString())
        return buffer.toString();
    }
} 