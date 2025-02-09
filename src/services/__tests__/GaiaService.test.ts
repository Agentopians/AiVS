import { GaiaService, LegalCaseValidationError } from '../GaiaService.js';
import axios from 'axios';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GaiaService', () => {
    let gaiaService: GaiaService;

    beforeEach(() => {
        gaiaService = new GaiaService();
        jest.clearAllMocks();
    });

    describe('validateLegalCase', () => {
        const mockValidResponse = {
            data: {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            isValidCase: true,
                            Reason: "Valid legal case"
                        })
                    }
                }]
            }
        };

        const mockInvalidResponse = {
            data: {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            isValidCase: false,
                            Reason: "Invalid case",
                            validationErrors: [{
                                code: "NO_LEGAL_BASIS",
                                message: "No legal basis provided"
                            }]
                        })
                    }
                }]
            }
        };

        it('should validate a valid legal case', async () => {
            mockedAxios.post.mockResolvedValueOnce(mockValidResponse);

            const validCase = "This is a valid legal case with proper details";
            const result = await gaiaService.validateLegalCase(validCase);

            expect(result.isValidCase).toBe(true);
            expect(result.Reason).toBe("Valid legal case");
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        });

        it('should reject an invalid legal case', async () => {
            mockedAxios.post.mockResolvedValueOnce(mockInvalidResponse);

            const invalidCase = "This is an invalid case";
            const result = await gaiaService.validateLegalCase(invalidCase);

            expect(result.isValidCase).toBe(false);
            expect(result.Reason).toBe("Invalid case");
            expect(result.validationErrors).toBeDefined();
            expect(result.validationErrors?.[0].code).toBe("NO_LEGAL_BASIS");
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        });

        it('should throw error for malformed input', async () => {
            const malformedInput = '';

            await expect(async () => {
                await gaiaService.validateLegalCase(malformedInput);
            }).rejects.toThrow(LegalCaseValidationError);

            expect(mockedAxios.post).not.toHaveBeenCalled();
        });

        it('should handle malformed API responses', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    choices: [{
                        message: {
                            content: 'Invalid JSON'
                        }
                    }]
                }
            });

            const validCase = "This is a valid case";

            await expect(async () => {
                await gaiaService.validateLegalCase(validCase);
            }).rejects.toThrow('Invalid response format');
        });

        it('should handle missing API response data', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                data: {}
            });

            const validCase = "This is a valid case";

            await expect(async () => {
                await gaiaService.validateLegalCase(validCase);
            }).rejects.toThrow('Invalid API response format');
        });
    });
});
