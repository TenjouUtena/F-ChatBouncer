// Import package.json to get the version
import packageJson from '../../package.json';

/**
 * Get the application version from package.json
 */
export function getAppVersion(): string {
  return packageJson.version;
}

/**
 * Get build information if available
 */
export function getBuildInfo() {
  try {
    // Try to fetch build info if available
    // This would be set during build time
    const buildInfo = process.env.NEXT_PUBLIC_BUILD_VERSION || packageJson.version;
    return buildInfo;
  } catch {
    return getAppVersion();
  }
}
