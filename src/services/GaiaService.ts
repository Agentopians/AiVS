import axios from 'axios';
import dotenv from 'dotenv'

dotenv.config()

interface GaiaResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message: {
            content: string;
            role: string;
        };
        finish_reason: string;
        logprobs: null;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface LegalCaseResponse {
    isValidCase: boolean;
    Reason: string;
    validationErrors?: ValidationError[];
}

interface ValidationError {
    code: ValidationErrorCode;
    message: string;
}

enum ValidationErrorCode {
    NO_PARTIES = 'NO_PARTIES',
    NO_ALLEGATIONS = 'NO_ALLEGATIONS',
    NO_LEGAL_BASIS = 'NO_LEGAL_BASIS',
    NO_DAMAGES = 'NO_DAMAGES',
    MALFORMED_INPUT = 'MALFORMED_INPUT',
    INVALID_FORMAT = 'INVALID_FORMAT'
}

export class LegalCaseValidationError extends Error {
    public readonly errors: ValidationError[];

    constructor(message: string, errors: ValidationError[]) {
        super(message);
        this.name = 'LegalCaseValidationError';
        this.errors = errors;
    }
}

export class GaiaService {
    private readonly apiUrl = process.env.GAIA_API_URL!;
    private readonly apiKey = process.env.GAIA_API_KEY!;

    constructor() { }

    async validateLegalCase(complaint: string): Promise<LegalCaseResponse> {
        // Input validation
        if (!complaint || typeof complaint !== 'string' || complaint.trim().length < 10) {
            throw new LegalCaseValidationError('Invalid input format', [{
                code: ValidationErrorCode.MALFORMED_INPUT,
                message: 'Complaint must be a non-empty string with at least 10 characters'
            }]);
        }

        try {
            const response = await axios.post<GaiaResponse>(
                this.apiUrl,
                {
                    messages: [
                        {
                            role: 'system',
                            content: `You are a legal expert evaluating the validity of legal cases.
Your task is to analyze the provided complaint and respond with ONLY a valid JSON object.
DO NOT include any other text, markdown, or formatting.
Respond with an object in this exact format:
{
    "isValidCase": boolean,
    "Reason": "brief explanation",
    "validationErrors": [
        {
            "code": "one of: NO_PARTIES, NO_ALLEGATIONS, NO_LEGAL_BASIS, NO_DAMAGES",
            "message": "detailed explanation of what's missing"
        }
    ]
}

A valid case must have ALL of the following:
1. Clear identification of parties involved
2. Specific allegations or claims
3. Legal basis for the complaint
4. Measurable damages or specific remedy sought

Set isValidCase to true ONLY if ALL criteria are met.
Include validationErrors array ONLY when isValidCase is false.`
                        },
                        {
                            role: 'user',
                            content: complaint
                        }
                    ],
                    model: 'qwen7b'
                },
                {
                    headers: {
                        'accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    }
                }
            );

            if (!response.data?.choices?.[0]?.message?.content) {
                throw new LegalCaseValidationError('Invalid API response format', [{
                    code: ValidationErrorCode.INVALID_FORMAT,
                    message: 'API response is missing required fields'
                }]);
            }

            const content = response.data.choices[0].message.content;
            let jsonString = content.replace(/```json\n?/g, '').replace(/```/g, '').trim();

            try {
                const result = JSON.parse(jsonString) as LegalCaseResponse;

                // Validate response structure
                if (typeof result.isValidCase !== 'boolean' || typeof result.Reason !== 'string') {
                    throw new LegalCaseValidationError('Invalid response structure', [{
                        code: ValidationErrorCode.INVALID_FORMAT,
                        message: 'Response missing required fields'
                    }]);
                }

                // Ensure validationErrors are present for invalid cases
                if (!result.isValidCase && !result.validationErrors) {
                    result.validationErrors = [{
                        code: ValidationErrorCode.NO_LEGAL_BASIS,
                        message: result.Reason
                    }];
                }

                return result;
            } catch (parseError) {
                console.error('Failed to parse response:', content);
                throw new LegalCaseValidationError('Invalid response format', [{
                    code: ValidationErrorCode.INVALID_FORMAT,
                    message: 'Failed to parse API response'
                }]);
            }
        } catch (error) {
            if (error instanceof LegalCaseValidationError) {
                throw error;
            }
            console.error('Error validating legal case:', error);
            throw new LegalCaseValidationError('Validation failed', [{
                code: ValidationErrorCode.INVALID_FORMAT,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            }]);
        }
    }
}

export { ValidationErrorCode }; 