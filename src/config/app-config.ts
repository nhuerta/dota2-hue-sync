function getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

export const APP_CONFIG = {
    appName: getRequiredEnv('HUE_APP_NAME'),
    deviceName: getRequiredEnv('HUE_DEVICE_NAME'),
    groupId: getRequiredEnv('HUE_GROUP_ID')
} as const;
