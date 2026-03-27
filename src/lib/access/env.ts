interface ServerEnv {
  nocodebackendSecretKey: string;
  nocodebackendBaseUrl: string;
  nocodebackendInstance: string;
  accessSessionSecret: string;
}

export function getServerEnv(): ServerEnv {
  const nocodebackendSecretKey = process.env.NOCODEBACKEND_SECRET_KEY?.trim();
  const nocodebackendBaseUrl = process.env.NOCODEBACKEND_BASE_URL?.trim();
  const nocodebackendInstance = process.env.NOCODEBACKEND_INSTANCE?.trim();
  const accessSessionSecret =
    process.env.ACCESS_SESSION_SECRET?.trim() ?? nocodebackendSecretKey ?? "";

  if (!nocodebackendSecretKey) {
    throw new Error("NOCODEBACKEND_SECRET_KEY is not configured.");
  }

  if (!nocodebackendBaseUrl) {
    throw new Error("NOCODEBACKEND_BASE_URL is not configured.");
  }

  if (!nocodebackendInstance) {
    throw new Error("NOCODEBACKEND_INSTANCE is not configured.");
  }

  if (!accessSessionSecret) {
    throw new Error("ACCESS_SESSION_SECRET is not configured.");
  }

  return {
    nocodebackendSecretKey,
    nocodebackendBaseUrl,
    nocodebackendInstance,
    accessSessionSecret
  };
}
