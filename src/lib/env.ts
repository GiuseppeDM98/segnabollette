import 'server-only';
import { EnvSchema } from './env-schema';

/** The validated environment, parsed once per server process. */
export const env = EnvSchema.parse(process.env);
