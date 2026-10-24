import { z } from 'zod';
import { THEMES } from '@/lib/theme';

export const ThemeSchema = z.enum(THEMES);
