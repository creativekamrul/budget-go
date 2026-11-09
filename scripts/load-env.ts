import { loadEnvFile } from "node:process";
// Node 22's native loader keeps secrets private; it does not print variable names or values.
try { loadEnvFile(); }
catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw new Error("Unable to load the private environment file."); }
