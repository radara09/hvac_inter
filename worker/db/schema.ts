import * as authSchema from "./auth.schema"; // This will be generated in a later step
import * as acSchema from "./ac.schema";

// Combine all schemas here for migrations
export const schema = {
    ...authSchema,
    ...acSchema,
} as const;
