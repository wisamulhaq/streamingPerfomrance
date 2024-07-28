export interface PerformanceTesterConfig {
    method: 'post' | 'get' | 'put' | 'delete' | 'patch'; // Only allow these HTTP methods
    maxBodyLength?: number; // Optional
    url: string; // Mandatory
    headers: Record<string, string>; // Allow any key-value pairs for headers
    payload?:  any; // Allow any key-value pairs for headers
  }
  