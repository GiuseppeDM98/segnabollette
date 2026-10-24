/** The shape of the reading actions' ids; the reading itself is validated by the service. */
import { z } from 'zod';

export const ReadingIdSchema = z.string().min(1);
