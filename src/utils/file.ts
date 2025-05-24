import { existsSync } from "fs";
import { dirname } from "path";
import { mkdir } from "fs/promises";

/**
 * Helper function to ensure a directory exists
 */
export async function ensureDirectoryExists(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  
  // Skip directory creation for drive roots (e.g., "E:\")
  if (dir.match(/^[A-Za-z]:\\?$/)) {
    return; // Drive root already exists, no need to create
  }
  
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    // Directory already exists or cannot be created
    if ((error as any).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Helper function to validate file path
 */
export function validatePath(path: string, isInput: boolean = false): string {
  if (!path) {
    throw new Error("File path is required");
  }
  
  if (isInput && !existsSync(path)) {
    throw new Error(`Input file does not exist: ${path}`);
  }
  
  return path;
}
