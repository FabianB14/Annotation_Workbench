/// <reference types="vite/client" />

// Vite replaces `process.env.GEMINI_API_KEY` at build time (see vite.config.ts).
declare const process: {
  env: {
    GEMINI_API_KEY?: string;
    [key: string]: string | undefined;
  };
};
