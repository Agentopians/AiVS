import { GaiaService, LegalCaseValidationError } from '../services/GaiaService.js';
import dotenv from 'dotenv';
import { describe, it, expect, beforeAll, jest } from '@jest/globals';

// Load environment variables from .env file
dotenv.config();

describe('GaiaService E2E Tests', () => {
    let gaiaService: GaiaService;

    beforeAll(() => {
        // Ensure environment variables are set
        if (!process.env.GAIA_API_URL || !process.env.GAIA_API_KEY) {
            throw new Error('Required environment variables are not set');
        }
        gaiaService = new GaiaService();
    });

    describe('validateLegalCase', () => {
        // Adding longer timeout since it's a real API call
        jest.setTimeout(30000);

        it('should validate a complete valid legal case', async () => {
            const validComplaint = `
                IN THE UNITED STATES DISTRICT COURT
                FOR THE NORTHERN DISTRICT OF CALIFORNIA

                Case No.: 2024-CV-12345

                PLAINTIFF: ABC Technology Corporation
                123 Tech Street, San Francisco, CA 94105

                v.

                DEFENDANT: XYZ Software Solutions, Inc.
                456 Code Avenue, San Jose, CA 95113

                COMPLAINT FOR BREACH OF CONTRACT AND DAMAGES

                1. PARTIES:
                   - Plaintiff ABC Technology Corporation is a Delaware corporation with its principal place of business in San Francisco, California.
                   - Defendant XYZ Software Solutions, Inc. is a California corporation with its principal place of business in San Jose, California.

                2. JURISDICTION AND VENUE:
                   This Court has diversity jurisdiction pursuant to 28 U.S.C. § 1332 as the parties are citizens of different states and the amount in controversy exceeds $75,000.

                3. FACTUAL ALLEGATIONS:
                   a. On January 15, 2024, Plaintiff and Defendant entered into a written Software Development Agreement ("Agreement").
                   b. Under the Agreement, Defendant agreed to develop and deliver a custom enterprise resource planning (ERP) software system by March 15, 2024.
                   c. The agreed-upon contract price was $500,000, of which Plaintiff paid $250,000 as an initial deposit.
                   d. Defendant failed to deliver the software by the deadline and has not provided any working components of the system.
                   e. Despite multiple written notices and opportunities to cure, Defendant has failed to perform its contractual obligations.

                4. LEGAL CLAIMS:
                   COUNT I - Breach of Contract
                   - Defendant breached the Agreement by failing to deliver the promised software.
                   - Defendant's breach is material and has caused substantial damages to Plaintiff.

                5. DAMAGES:
                   Plaintiff has suffered the following damages:
                   - Loss of initial deposit: $250,000
                   - Lost business opportunities: $300,000
                   - Additional costs to secure alternative software solution: $200,000
                   Total damages: $750,000

                6. PRAYER FOR RELIEF:
                   WHEREFORE, Plaintiff requests judgment against Defendant for:
                   a. Compensatory damages of $750,000
                   b. Pre-judgment and post-judgment interest
                   c. Attorney's fees and costs
                   d. Such other relief as the Court deems just and proper

                Dated: March 20, 2024

                Respectfully submitted,
                /s/ Jane Smith
                Jane Smith (SBN 123456)
                Legal Counsel for ABC Technology Corporation
            `;

            const result = await gaiaService.validateLegalCase(validComplaint);

            console.log('API Response:', result);

            expect(result).toHaveProperty('isValidCase');
            expect(result).toHaveProperty('Reason');
            expect(result.isValidCase).toBe(true);
            expect(typeof result.Reason).toBe('string');
        });

        it('should reject an invalid legal case', async () => {
            const invalidComplaint = `
                I want to sue my neighbor because their dog barks too much. 
                It's really annoying and I can't sleep at night.
            `;

            const result = await gaiaService.validateLegalCase(invalidComplaint);

            console.log('API Response:', result);

            expect(result).toHaveProperty('isValidCase');
            expect(result).toHaveProperty('Reason');
            expect(result.isValidCase).toBe(false);
            expect(typeof result.Reason).toBe('string');
        });

        it('should handle malformed input gracefully', async () => {
            const malformedInput = '';

            await expect(async () => {
                await gaiaService.validateLegalCase(malformedInput);
            }).rejects.toThrow(LegalCaseValidationError);
        });
    });
}); 