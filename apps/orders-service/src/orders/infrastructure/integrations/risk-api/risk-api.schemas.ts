import { z } from 'zod';

/** Provider response contract. Validated because providers change without notice (standards §6). */
export const riskApiAssessmentResponse = z.object({
  assessment_id: z.string(),
  verdict: z.enum(['ALLOW', 'REVIEW', 'DENY']),
  reason_code: z.string().optional(),
});
export type RiskApiAssessmentResponse = z.infer<typeof riskApiAssessmentResponse>;
